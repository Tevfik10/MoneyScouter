import { ProductStatus, RunStatus, Verdict } from "@prisma/client";
import { prisma } from "@/server/db";
import { getAllSettings } from "@/server/settings";
import { ensureDefaultSearchTopics, markKeywordUsed, selectSearchKeywords } from "@/server/pipeline/searchKeywords";
import { alibabaApifyProvider } from "@/server/providers/apify/alibaba/provider";
import { upsertDiscoveredProduct } from "@/server/pipeline/dedup";
import { classifyComplianceRisk, ComplianceRiskLevel, runDeterministicFilter } from "@/server/pipeline/filter";
import { computeEnrichmentScore } from "@/server/pipeline/enrichment";
import { selectShortlist } from "@/server/pipeline/shortlist";
import { buildProductBundle, getBestProductSourceId } from "@/server/pipeline/productBundle";
import { runDeterministicResearch } from "@/server/pipeline/researchDeterministic";
import { recordPipelineStage } from "@/server/pipeline/pipelineStage";
import { ApifyBudgetExceededError, ApifyCostController } from "@/server/apify/costController";
import { PrismaApifyCostStore } from "@/server/apify/prismaApifyCostStore";
import { getApifyClient } from "@/server/providers/apify/client";
import { DiscoveredProduct, DiscoveredProductSource } from "@/server/providers/discovery/types";

export interface RunScoutRealOptions {
  trigger?: "manual" | "scheduled";
  /** Overrides the scoutConfig.testMode setting for this run only. */
  testModeOverride?: boolean;
}

export interface RunScoutRealResult {
  runId: string;
  status: RunStatus;
}

interface FinalizeStats {
  discoveredCount: number;
  rejectedCount?: number;
  passedFilterCount?: number;
  enrichedCount?: number;
  shortlistedCount?: number;
  deepResearchedCount?: number;
  marketEnrichedCount?: number;
  highPotentialCount?: number;
  status: RunStatus;
  stopReason?: string;
}

async function finalizeRun(runId: string, stats: FinalizeStats): Promise<RunScoutRealResult> {
  const apifySpend = await prisma.apifyCall.aggregate({
    where: { researchRunId: runId },
    _sum: { actualCostUsd: true },
  });
  await prisma.researchRun.update({
    where: { id: runId },
    data: {
      status: stats.status,
      finishedAt: new Date(),
      discoveredCount: stats.discoveredCount,
      rejectedCount: stats.rejectedCount ?? 0,
      passedFilterCount: stats.passedFilterCount ?? 0,
      enrichedCount: stats.enrichedCount ?? 0,
      shortlistedCount: stats.shortlistedCount ?? 0,
      deepResearchedCount: stats.deepResearchedCount ?? 0,
      marketEnrichedCount: stats.marketEnrichedCount ?? 0,
      highPotentialCount: stats.highPotentialCount ?? 0,
      apifySpendUsd: apifySpend._sum.actualCostUsd ?? 0,
      stopReason: stats.stopReason,
    },
  });
  return { runId, status: stats.status };
}

// Conservative self-imposed ceiling on the pipeline's total wall-clock
// time, checked between stages and before each shortlisted product's
// research — NOT a hard preemption mid-call. Its job is to make the
// pipeline finalize ITSELF gracefully well before a hosting platform's
// serverless function-duration limit could kill the process mid-flight,
// which is the confirmed leading cause of a ResearchRun getting stuck at
// RUNNING forever (see the V1.1 cost-efficiency investigation report).
// Paired with `maxDuration = 300` on the pages that trigger "Run Scout".
const MAX_PIPELINE_DURATION_MS = 210_000; // 3.5 minutes, under the 300s route ceiling

/**
 * The V1.1 real pipeline — master spec V1.1 section 14: Apify discovery ->
 * normalize -> dedup -> deterministic filter -> shortlist -> Google
 * Shopping enrichment -> competitor -> margin -> risk -> rule-based Judge
 * -> save -> dashboard. Zero LLM calls anywhere in this function or
 * anything it calls — every dollar spent goes through the Apify Cost
 * Controller, budget-checked before it's spent, never the AI one.
 *
 * Cost-efficiency invariant (V1.1 follow-up): a budget stop during
 * discovery must never discard products we already paid to retrieve —
 * dedup/filter/shortlist always run on whatever was discovered, since
 * those stages are free, local and deterministic.
 */
export async function runScoutReal(options: RunScoutRealOptions = {}): Promise<RunScoutRealResult> {
  const pipelineStartedAt = Date.now();
  const timeBudgetExceeded = () => Date.now() - pipelineStartedAt > MAX_PIPELINE_DURATION_MS;

  await ensureDefaultSearchTopics();
  const settings = await getAllSettings();
  const scoutConfig = settings.scoutConfig;
  const testMode = options.testModeOverride ?? scoutConfig.testMode;

  // TEST_SCOUT caps (master spec V1.1 section 15, redesigned for minimum
  // real cost per the V1.1 cost-efficiency follow-up) — hard ceilings
  // regardless of Settings drift: 1 keyword, ≤100 raw items, ≤10 for
  // Google Shopping enrichment, until manually changed via Settings.
  const maxKeywords = testMode ? Math.min(1, scoutConfig.maxKeywordsPerRun) : scoutConfig.maxKeywordsPerRun;
  const maxDiscoveryItemsTotal = testMode
    ? Math.min(100, scoutConfig.maxDiscoveryItemsTotal)
    : scoutConfig.maxDiscoveryItemsTotal;
  const maxMarketEnrichmentItems = testMode
    ? Math.min(10, scoutConfig.maxMarketEnrichmentItems)
    : scoutConfig.maxMarketEnrichmentItems;
  const apifyHardLimitUsd = testMode
    ? Math.min(scoutConfig.testModeApifyBudgetCapUsd, settings.apifyBudget.hardLimitUsd)
    : settings.apifyBudget.hardLimitUsd;

  const run = await prisma.researchRun.create({
    data: {
      status: RunStatus.RUNNING,
      mode: "APIFY_DETERMINISTIC",
      trigger: options.trigger ?? "manual",
      testMode,
      budgetEur: settings.budget.dailyTargetEur,
      hardLimitEur: settings.budget.hardLimitEur,
      apifyBudgetUsd: settings.apifyBudget.dailyTargetUsd,
      apifyHardLimitUsd,
    },
  });

  try {
    // Constructed inside the try block deliberately: a missing
    // APIFY_API_TOKEN throws synchronously here, and must still mark the
    // run FAILED rather than leaving it stuck at RUNNING forever.
    const apifyCostController = new ApifyCostController(new PrismaApifyCostStore(), getApifyClient(), {
      hardLimitUsd: apifyHardLimitUsd,
    });

    // --- Step 1: select search terms ---------------------------------
    const keywords = await selectSearchKeywords(maxKeywords);
    if (keywords.length === 0) {
      throw new Error("No search keywords are configured — add SearchTopic/SearchKeyword rows or check Settings.");
    }
    // --- Steps 2-4: Alibaba discovery (one Actor run for all keywords —
    // ALIBABA is the sole active product-discovery source, see
    // providers/apify/aliexpress/LEGACY.md for why AliExpress is inactive),
    // normalize (inside the provider), ingest ----------------------------
    const scoutStageStart = new Date();
    let discovered: DiscoveredProduct[] = [];
    let scoutError: string | undefined;
    let discoveryBudgetStopped = false;
    let discoveryStopReason: string | undefined;

    try {
      const searchResult = await alibabaApifyProvider.search(
        {
          keywords: keywords.map((k) => ({ keyword: k.keyword, theme: k.topicName, category: k.topicName })),
          maxItemsTotal: maxDiscoveryItemsTotal,
        },
        { researchRunId: run.id, costController: apifyCostController },
      );
      discovered = searchResult.items;
      discoveryBudgetStopped = searchResult.budgetStopped;
      discoveryStopReason = searchResult.stopReason;

      for (const usage of searchResult.keywordUsage) {
        const kw = keywords.find((k) => k.keyword === usage.keyword);
        if (!kw) continue;
        await prisma.searchRun.create({
          data: { researchRunId: run.id, keywordId: kw.id, itemsReturned: usage.itemsReturned },
        });
      }
      // A budget stop can mean some requested keywords were never actually
      // attempted (batched providers stop the whole call before it starts;
      // looping providers stop partway through). Rather than guess which
      // ones were genuinely searched, conservatively leave all of them
      // unmarked so they're tried first next run instead of being skipped
      // over for a search that may never have happened.
      if (!discoveryBudgetStopped) {
        for (const kw of keywords) await markKeywordUsed(kw.id);
      }
    } catch (err) {
      scoutError = err instanceof Error ? err.message : String(err);
      console.error("[runScoutReal] Alibaba discovery failed:", err);
    }

    await recordPipelineStage({
      researchRunId: run.id,
      stage: "SCOUT",
      startedAt: scoutStageStart,
      itemsProcessed: discovered.length,
      dataSource: `apify:${alibabaApifyProvider.actorId}`,
      errorMessage: scoutError ?? discoveryStopReason,
    });

    // --- Step 5: deduplication (no AI) — always runs on whatever was
    // discovered, budget-stopped or not: this and every stage through
    // shortlisting below is free, local and deterministic. -------------
    const dedupStageStart = new Date();
    const dedupResults: Array<{ item: DiscoveredProduct; result: Awaited<ReturnType<typeof upsertDiscoveredProduct>> }> = [];
    for (const item of discovered) {
      dedupResults.push({ item, result: await upsertDiscoveredProduct(item) });
    }
    const toEvaluate = dedupResults.filter((d) => d.result.outcome !== "SEEN_BEFORE");
    await recordPipelineStage({
      researchRunId: run.id,
      stage: "DEDUP",
      startedAt: dedupStageStart,
      itemsProcessed: discovered.length,
      itemsRejected: discovered.length - toEvaluate.length,
    });

    // --- Step 6: deterministic filter (no AI) -------------------------
    const filterStageStart = new Date();
    let rejectedCount = 0;
    const passed: Array<{
      productId: string;
      source: DiscoveredProductSource;
      category: string;
      complianceRisk: ComplianceRiskLevel;
      estimatedMarginEur: number;
    }> = [];

    for (const d of toEvaluate) {
      const complianceRisk = classifyComplianceRisk(d.item.category, settings.filterThresholds);
      const outcome = runDeterministicFilter(
        {
          category: d.item.category,
          purchasePriceEur: d.item.source.price,
          shippingCostEur: d.item.source.shippingCost ?? 0,
          // Alibaba search results don't carry shipping days or weight at
          // discovery time (documented gap — see the Alibaba normalizer).
          // An unknown value defaults to the threshold itself: neutral,
          // never rejecting a product for data we simply don't have.
          shippingDays: d.item.source.shippingDays ?? settings.filterThresholds.maxShippingDays,
          supplierRating: d.item.source.rating ?? settings.filterThresholds.minSupplierRating,
          reviewCount: d.item.source.reviewCount ?? settings.filterThresholds.minReviewCount,
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
    await recordPipelineStage({
      researchRunId: run.id,
      stage: "FILTER",
      startedAt: filterStageStart,
      itemsProcessed: toEvaluate.length,
      itemsRejected: rejectedCount,
    });

    // --- Step 7: cheap enrichment scoring + shortlist cut -------------
    const enrichmentScored = passed.map((p) => ({
      ...p,
      enrichmentScore: computeEnrichmentScore({
        filterOutcome: {
          verdict: "PASS",
          reasons: [],
          estimatedMarginEur: p.estimatedMarginEur,
          estimatedSellingPriceEur: 0,
        },
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
        },
      });
    }

    const { shortlisted, watched, droppedAtEnrichment } = selectShortlist(enrichmentScored, {
      enrichmentCutCount: settings.shortlist.enrichmentCutCount,
      enrichmentMinScore: settings.shortlist.enrichmentMinScore,
      // The "top 5-10" cap for Google Shopping enrichment IS the
      // deep-research pool size in this mode.
      deepResearchCutCount: maxMarketEnrichmentItems,
    });

    for (const p of watched) {
      await prisma.product.update({ where: { id: p.productId }, data: { status: ProductStatus.SHORTLISTED } });
    }
    for (const p of droppedAtEnrichment) {
      const reason =
        p.enrichmentScore < settings.shortlist.enrichmentMinScore
          ? `enrichment score ${p.enrichmentScore} below shortlist minimum ${settings.shortlist.enrichmentMinScore}`
          : `enrichment score ${p.enrichmentScore} cleared the minimum but didn't fit the shortlist pool (cap ${settings.shortlist.enrichmentCutCount})`;
      await prisma.decision.create({
        data: { researchRunId: run.id, productId: p.productId, stage: "SHORTLIST", verdict: Verdict.WATCH, reasons: [reason] },
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

    // --- Steps 8-12: Google Shopping enrichment, competitor, margin,
    // risk, rule-based Judge — per shortlisted product ------------------
    let deepResearchedCount = 0;
    let marketEnrichedCount = 0;
    let highPotentialCount = 0;
    let researchStopReason: string | undefined;
    let researchBudgetStopped = false;
    let timeBudgetStopped = false;
    // If discovery already exhausted the Apify budget, don't even attempt
    // Google Shopping for the shortlist — the same-day budget check would
    // block every call anyway, so retrying just wastes time. Margin/
    // Supplier/Trend/Risk/Judge still run for every product; only the
    // market data is skipped.
    let marketEnrichmentExhausted = discoveryBudgetStopped;

    for (const p of shortlisted) {
      if (timeBudgetExceeded()) {
        timeBudgetStopped = true;
        break;
      }
      try {
        const bundle = await buildProductBundle(p.productId);
        const productSourceId = await getBestProductSourceId(p.productId);
        const { judge, marketEnrichmentSkippedForBudget } = await runDeterministicResearch(
          bundle,
          productSourceId,
          run.id,
          apifyCostController,
          settings.investmentProfile,
          settings.deterministicScoringWeights,
          settings.filterThresholds,
          marketEnrichmentExhausted,
        );
        if (marketEnrichmentSkippedForBudget) marketEnrichmentExhausted = true;
        else marketEnrichedCount++;

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
        if (err instanceof ApifyBudgetExceededError) {
          researchBudgetStopped = true;
          researchStopReason = err.message;
          break;
        }
        console.error(`[runScoutReal] deterministic research failed for product ${p.productId}:`, err);
      }
    }

    // --- Steps 13-14: opportunities already saved above; finalize -----
    const stopReason =
      researchStopReason ??
      discoveryStopReason ??
      (timeBudgetStopped
        ? `Pipeline time budget (${Math.round(MAX_PIPELINE_DURATION_MS / 1000)}s) reached after ${deepResearchedCount}/${shortlisted.length} shortlisted products — stopped early to finalize cleanly instead of risking being killed mid-run.`
        : undefined);

    return finalizeRun(run.id, {
      discoveredCount: discovered.length,
      rejectedCount,
      passedFilterCount: passed.length,
      enrichedCount: enrichmentScored.length,
      shortlistedCount: shortlisted.length + watched.length,
      deepResearchedCount,
      marketEnrichedCount,
      highPotentialCount,
      status: researchBudgetStopped || discoveryBudgetStopped ? RunStatus.BUDGET_STOPPED : RunStatus.COMPLETED,
      stopReason,
    });
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
