import { ProductStatus, RunStatus, Verdict } from "@prisma/client";
import { prisma } from "@/server/db";
import { getAllSettings } from "@/server/settings";
import { getEnabledDiscoveryProviders } from "@/server/providers/discovery";
import { upsertDiscoveredProduct } from "@/server/pipeline/dedup";
import { classifyComplianceRisk, runDeterministicFilter } from "@/server/pipeline/filter";
import { computeEnrichmentScore } from "@/server/pipeline/enrichment";
import { selectShortlist } from "@/server/pipeline/shortlist";
import { buildProductBundle } from "@/server/pipeline/productBundle";
import { runDeepResearch } from "@/server/pipeline/research";
import { getCostController } from "@/server/ai";
import { BudgetExceededError } from "@/server/ai/costController";

export interface RunScoutOptions {
  trigger?: "manual" | "scheduled";
  discoveryLimit?: number;
}

export interface RunScoutResult {
  runId: string;
  status: RunStatus;
}

const DEFAULT_DISCOVERY_LIMIT = 350;

/**
 * The full funnel from docs/ARCHITECTURE.md section B, in one place:
 * discover -> dedup -> deterministic filter -> cheap enrichment ->
 * shortlist -> deep research (specialist agents + Skeptic + Judge),
 * budget-aware throughout. This is what the "Run Scout" button calls.
 */
export async function runScout(options: RunScoutOptions = {}): Promise<RunScoutResult> {
  const settings = await getAllSettings();

  const run = await prisma.researchRun.create({
    data: {
      status: RunStatus.RUNNING,
      trigger: options.trigger ?? "manual",
      budgetEur: settings.budget.dailyTargetEur,
      hardLimitEur: settings.budget.hardLimitEur,
    },
  });

  try {
    // --- Stage 1: Discovery (no AI) ---------------------------------
    const discoveryLimit = options.discoveryLimit ?? DEFAULT_DISCOVERY_LIMIT;
    const discovered = [];
    for (const provider of getEnabledDiscoveryProviders()) {
      const items = await provider.discover({ limit: discoveryLimit, seed: run.id });
      discovered.push(...items);
    }

    // --- Stage 2: Deduplication / fingerprinting (no AI) ------------
    const dedupResults = [];
    for (const item of discovered) {
      const result = await upsertDiscoveredProduct(item);
      dedupResults.push({ item, result });
    }
    // "Never pay twice": unchanged previously-seen products stop here.
    const toEvaluate = dedupResults.filter((d) => d.result.outcome !== "SEEN_BEFORE");

    // --- Stage 3: Deterministic mass filter (no AI) ------------------
    let rejectedCount = 0;
    const passed: Array<{
      productId: string;
      source: (typeof toEvaluate)[number]["item"]["source"];
      category: string;
      complianceRisk: ReturnType<typeof classifyComplianceRisk>;
      estimatedMarginEur: number;
    }> = [];

    for (const d of toEvaluate) {
      const complianceRisk = classifyComplianceRisk(d.item.category, settings.filterThresholds);
      const outcome = runDeterministicFilter(
        {
          category: d.item.category,
          purchasePriceEur: d.item.source.price,
          shippingCostEur: d.item.source.shippingCost ?? 0,
          shippingDays: d.item.source.shippingDays ?? 30,
          supplierRating: d.item.source.rating ?? 0,
          reviewCount: d.item.source.reviewCount ?? 0,
          weightGrams: d.item.source.weightGrams ?? 0,
        },
        settings.filterThresholds,
      );

      await prisma.decision.create({
        data: {
          researchRunId: run.id,
          productId: d.result.productId,
          stage: "FILTER",
          verdict: outcome.verdict === "PASS" ? Verdict.PASS : Verdict.REJECT,
          reasons: outcome.reasons,
          ruleSetVersion: "filter-v1",
        },
      });

      if (outcome.verdict === "REJECT") {
        rejectedCount++;
        await prisma.product.update({
          where: { id: d.result.productId },
          data: { status: ProductStatus.FILTERED_OUT, complianceRisk },
        });
        continue;
      }

      await prisma.product.update({
        where: { id: d.result.productId },
        data: { status: ProductStatus.ENRICHED, complianceRisk },
      });
      passed.push({
        productId: d.result.productId,
        source: d.item.source,
        category: d.item.category,
        complianceRisk,
        estimatedMarginEur: outcome.estimatedMarginEur,
      });
    }

    // --- Stage 4: Cheap enrichment scoring (heuristic, no AI) --------
    const enrichmentScored = passed.map((p) => ({
      ...p,
      enrichmentScore: computeEnrichmentScore({
        filterOutcome: { verdict: "PASS", reasons: [], estimatedMarginEur: p.estimatedMarginEur, estimatedSellingPriceEur: 0 },
        source: p.source,
        complianceRisk: p.complianceRisk,
        thresholds: settings.filterThresholds,
      }),
    }));

    for (const p of enrichmentScored) {
      await prisma.decision.create({
        data: {
          researchRunId: run.id,
          productId: p.productId,
          stage: "ENRICHMENT",
          verdict: p.enrichmentScore >= settings.shortlist.enrichmentMinScore ? Verdict.PASS : Verdict.WATCH,
          reasons: [`enrichment score ${p.enrichmentScore}/100`],
          ruleSetVersion: "enrichment-v1",
        },
      });
    }

    // --- Stage 5: Shortlist cut (no AI) -------------------------------
    const { shortlisted, watched, droppedAtEnrichment } = selectShortlist(enrichmentScored, settings.shortlist);

    for (const p of watched) {
      await prisma.product.update({ where: { id: p.productId }, data: { status: ProductStatus.SHORTLISTED } });
    }
    for (const p of droppedAtEnrichment) {
      // stays ENRICHED — either below the enrichment score minimum, or
      // above it but outside the shortlist pool's capacity this run.
      const reason =
        p.enrichmentScore < settings.shortlist.enrichmentMinScore
          ? `enrichment score ${p.enrichmentScore} below shortlist minimum ${settings.shortlist.enrichmentMinScore}`
          : `enrichment score ${p.enrichmentScore} cleared the minimum but didn't fit the shortlist pool (cap ${settings.shortlist.enrichmentCutCount})`;
      await prisma.decision.create({
        data: {
          researchRunId: run.id,
          productId: p.productId,
          stage: "SHORTLIST",
          verdict: Verdict.WATCH,
          reasons: [reason],
        },
      });
    }
    for (const p of shortlisted) {
      await prisma.product.update({ where: { id: p.productId }, data: { status: ProductStatus.SHORTLISTED } });
      await prisma.decision.create({
        data: {
          researchRunId: run.id,
          productId: p.productId,
          stage: "SHORTLIST",
          verdict: Verdict.PASS,
          reasons: [`enrichment score ${p.enrichmentScore}, selected for deep research`],
        },
      });
    }

    // --- Stage 6: Deep research (specialist agents + Skeptic + Judge) -
    const costController = await getCostController();
    let deepResearchedCount = 0;
    let highPotentialCount = 0;
    let budgetStopped = false;
    let stopReason: string | undefined;

    for (const p of shortlisted) {
      try {
        const bundle = await buildProductBundle(p.productId);
        const { judge } = await runDeepResearch(
          bundle,
          run.id,
          costController,
          p.complianceRisk,
          settings.scoringWeights,
        );

        const newStatus: ProductStatus =
          judge.verdict === Verdict.HIGH_POTENTIAL
            ? ProductStatus.HIGH_POTENTIAL
            : judge.verdict === Verdict.INTERESTING
              ? ProductStatus.INTERESTING
              : judge.verdict === Verdict.WATCH
                ? ProductStatus.WATCHLISTED
                : ProductStatus.REJECTED;

        await prisma.product.update({
          where: { id: p.productId },
          data: { status: newStatus, currentScore: judge.moneyScore, currentVerdict: judge.verdict },
        });

        if (judge.verdict === Verdict.WATCH) {
          await prisma.watchlist.upsert({
            where: { productId: p.productId },
            create: { productId: p.productId, reason: judge.nextStep },
            update: { reason: judge.nextStep, lastAlertAt: new Date() },
          });
        }

        deepResearchedCount++;
        if (judge.verdict === Verdict.HIGH_POTENTIAL) highPotentialCount++;
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          budgetStopped = true;
          stopReason = err.message;
          break;
        }
        // Non-budget failures shouldn't take down the whole run — log and
        // move on to the next product; this run is resumable, a failed
        // product can be picked up again another night.
        console.error(`[runScout] deep research failed for product ${p.productId}:`, err);
      }
    }

    const spend = await prisma.aiCall.aggregate({
      where: { researchRunId: run.id },
      _sum: { estimatedCostEur: true },
    });

    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: budgetStopped ? RunStatus.BUDGET_STOPPED : RunStatus.COMPLETED,
        finishedAt: new Date(),
        discoveredCount: discovered.length,
        rejectedCount,
        passedFilterCount: passed.length,
        enrichedCount: enrichmentScored.length,
        shortlistedCount: shortlisted.length + watched.length,
        deepResearchedCount,
        highPotentialCount,
        spendEur: spend._sum.estimatedCostEur ?? 0,
        stopReason,
      },
    });

    return { runId: run.id, status: budgetStopped ? RunStatus.BUDGET_STOPPED : RunStatus.COMPLETED };
  } catch (err) {
    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: RunStatus.FAILED,
        finishedAt: new Date(),
        stopReason: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
