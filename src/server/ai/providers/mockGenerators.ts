import { AgentType } from "@prisma/client";
import { SeededRandom } from "@/server/ai/seededRandom";
import {
  AngleFindings,
  BrandFindings,
  CompetitorFindings,
  JudgeNarrative,
  MarketFindings,
  RiskFindings,
  SkepticFindings,
} from "@/server/pipeline/agents/schemas";

// Fabricates realistic, deterministic structured output per agent type so
// the full pipeline can run end-to-end without a real LLM. Swapping in a
// real provider later means deleting this file, not restructuring agents.

const SEGMENTS = [
  "young professionals",
  "new parents",
  "students",
  "weekend travellers",
  "home fitness enthusiasts",
  "remote workers",
  "outdoor hobbyists",
  "pet owners",
  "eco-conscious buyers",
  "small business owners",
];

const SEASONALITY = [
  "peaks around Q4/holiday season",
  "steady year-round with a summer bump",
  "strong spring/summer seasonality",
  "back-to-school driven peak in September",
  "flat, no strong seasonality detected",
];

function market(rng: SeededRandom, title: string): MarketFindings {
  const demandLevel = rng.pick(["low", "medium", "high"] as const);
  const trendDirection = rng.pick(["rising", "stable", "declining"] as const);
  return {
    demandLevel,
    trendDirection,
    searchInterestScore: rng.int(15, 95),
    seasonality: rng.pick(SEASONALITY),
    targetSegments: rng.pickMultiple(SEGMENTS, rng.int(1, 3)),
    summary: `${title}: demand looks ${demandLevel}, trend is ${trendDirection}. ${rng.pick(SEASONALITY)}.`,
  };
}

const COMPETITOR_NAMES = [
  "NordicGear", "UrbanNest", "TrailForge", "CleverHome", "BrightBase",
  "PureLiving", "SwiftCarry", "DailyEdge", "GoodForm", "NorthPeak",
];

function competitor(rng: SeededRandom, title: string): CompetitorFindings {
  const count = rng.int(2, 18);
  const min = rng.int(15, 35);
  const max = min + rng.int(15, 90);
  const names = rng.pickMultiple(COMPETITOR_NAMES, Math.min(4, count));
  return {
    competitorCount: count,
    priceRangeMinEur: min,
    priceRangeMaxEur: max,
    dominantChannel: rng.pick(["marketplace", "branded-stores", "mixed"] as const),
    competitorQuality: rng.pick(["low", "medium", "high"] as const),
    positioningNotes: `Most listings for "${title}" lean on price rather than a clear brand story.`,
    competitors: names.map((name) => ({
      name,
      priceEur: rng.int(min, max),
      positioning: rng.pick([
        "generic marketplace listing",
        "budget/value positioning",
        "premium/branded positioning",
        "bundle/kit positioning",
        "subscription/service add-on",
      ]),
    })),
    summary: `${count} relevant sellers found, price range €${min}-€${max}, channel mix leans ${rng.pick(["marketplace", "branded"])}.`,
  };
}

function brand(rng: SeededRandom, title: string, category: string): BrandFindings {
  const score = rng.int(20, 95);
  return {
    brandabilityScore: score,
    idealCustomer: rng.pick(SEGMENTS),
    problemSolved: `Saves time/hassle around ${category.replace(/-/g, " ")} for people who currently improvise a worse solution.`,
    emotionalHook: rng.pick([
      "freedom from clutter",
      "looking put-together without effort",
      "peace of mind while travelling",
      "feeling prepared, not stressed",
      "a small daily upgrade that feels premium",
    ]),
    functionalHook: rng.pick([
      "saves 10+ minutes per use",
      "fits carry-on / no checked luggage",
      "works in one hand",
      "replaces 3 separate products",
      "lasts noticeably longer than commodity alternatives",
    ]),
    canBundle: rng.bool(0.6),
    canAddPackagingValue: rng.bool(0.7),
    repeatPurchasePotential: rng.pick(["low", "medium", "high"] as const),
    upsellIdeas: rng.pickMultiple(
      ["matching accessory", "replacement/consumable pack", "premium color variant", "extended warranty", "bundle discount on 2nd unit"],
      rng.int(1, 3),
    ),
    summary: `"${title}" scores ${score}/100 on brandability — ${score > 60 ? "a believable branded concept, not just a generic listing" : "currently reads as a generic AliExpress-style product"}.`,
  };
}

const ANGLE_TEMPLATES = [
  { tag: "convenience", brandFeel: "clean, modern, no-nonsense" },
  { tag: "premium-gift", brandFeel: "warm, premium, gift-ready" },
  { tag: "problem-solver", brandFeel: "practical, trustworthy" },
  { tag: "lifestyle", brandFeel: "aspirational, editorial" },
  { tag: "budget-smart", brandFeel: "friendly, value-driven" },
];

function angle(rng: SeededRandom, title: string, segments: string[]): AngleFindings {
  const count = rng.int(3, 5);
  const templates = rng.pickMultiple(ANGLE_TEMPLATES, count);
  const angles = templates.map((tpl, i) => {
    const audience = segments[i % segments.length] ?? rng.pick(SEGMENTS);
    return {
      name: `${tpl.tag}-${i + 1}`,
      targetAudience: audience,
      problem: `${audience} currently deal with an awkward, ad-hoc version of this problem.`,
      promise: `${title} solves it in a way that feels designed, not improvised.`,
      positioning: `The ${tpl.tag.replace("-", " ")} option for ${audience}.`,
      whyBuy: `Clear functional benefit plus a ${tpl.brandFeel} brand feel worth paying a premium for.`,
      pricePosition: rng.pick(["value", "mid-market", "premium"]),
      brandFeel: tpl.brandFeel,
      adHook: rng.pick([
        `"${title}, but actually designed for you."`,
        `"Stop settling for the generic version."`,
        `"The upgrade you didn't know you needed."`,
        `"Built for ${audience}, not everyone."`,
      ]),
      landingPageHook: `One product. One clear promise: ${title.toLowerCase()} without the usual trade-offs.`,
    };
  });
  return {
    angles,
    summary: `${angles.length} distinct marketing angles generated, spanning ${templates.map((t) => t.tag).join(", ")}.`,
  };
}

const COMPLIANCE_FLAGS = [
  "verify CE marking before EU sale",
  "GPSR documentation required from 2024",
  "check battery/UN38.3 shipping docs if applicable",
  "packaging claims must avoid medical/health language",
  "no flags beyond standard consumer-product compliance",
];

function risk(rng: SeededRandom, category: string, highRisk: boolean): RiskFindings {
  const complianceRisk = highRisk ? "high" : rng.pick(["low", "medium"] as const);
  return {
    complianceRisk,
    flags: rng.pickMultiple(COMPLIANCE_FLAGS, rng.int(1, 2)),
    ipRisk: rng.pick(["low", "low", "medium"] as const),
    returnRiskEstimatePercent: rng.int(3, 22),
    summary: `Category "${category}" compliance risk assessed as ${complianceRisk}.`,
  };
}

const OBJECTIONS = [
  "easily found cheaper on Bol.com / Amazon within minutes of searching",
  "generic listing available from dozens of AliExpress sellers with no differentiation",
  "high visual similarity to commodity products erodes any premium pricing",
  "return rate for this product category tends to run high",
  "trend signal may be a short-lived fad, not durable demand",
  "shipping times from the cheapest suppliers are long enough to hurt conversion",
  "incumbent branded players already own the premium end of this niche",
];

function skeptic(rng: SeededRandom, title: string): SkepticFindings {
  const verdictLean = rng.pick(["kill", "caution", "caution", "proceed"] as const);
  const objections = rng.pickMultiple(OBJECTIONS, rng.int(2, 4));
  return {
    verdictLean,
    strongestObjection: objections[0],
    objections,
    commoditizationRisk: rng.pick(["low", "medium", "high"] as const),
    counterEvidence: rng.bool(0.5)
      ? [`Despite the above, "${title}" still shows a defensible angle if positioned tightly.`]
      : [],
    summary: `Skeptic lean: ${verdictLean}. Strongest objection: ${objections[0]}`,
  };
}

function judgeNarrative(
  rng: SeededRandom,
  title: string,
  moneyScore: number,
  strongPoints: string[],
  weakPoints: string[],
): JudgeNarrative {
  return {
    why: strongPoints.length > 0 ? strongPoints : [`${title} clears the bar on the weighted rubric.`],
    concerns: weakPoints,
    nextStep:
      moneyScore >= 80
        ? "Move to Validation Lab: prepare a landing page test on the strongest angle."
        : moneyScore >= 60
          ? "Watch for 1-2 more cycles; revisit if supplier price drops or competition thins out."
          : "No further spend justified right now.",
  };
}

export function generateMockContent(
  agentType: AgentType,
  seed: string,
  ctx: {
    title: string;
    category: string;
    highRiskCategory: boolean;
    segments?: string[];
    moneyScore?: number;
    strongPoints?: string[];
    weakPoints?: string[];
  },
): object {
  const rng = new SeededRandom(`${seed}:${agentType}`);
  switch (agentType) {
    case AgentType.MARKET:
      return market(rng, ctx.title);
    case AgentType.COMPETITOR:
      return competitor(rng, ctx.title);
    case AgentType.BRAND:
      return brand(rng, ctx.title, ctx.category);
    case AgentType.ANGLE:
      return angle(rng, ctx.title, ctx.segments ?? SEGMENTS);
    case AgentType.RISK:
      return risk(rng, ctx.category, ctx.highRiskCategory);
    case AgentType.SKEPTIC:
      return skeptic(rng, ctx.title);
    case AgentType.JUDGE:
      return judgeNarrative(
        rng,
        ctx.title,
        ctx.moneyScore ?? 50,
        ctx.strongPoints ?? [],
        ctx.weakPoints ?? [],
      );
    default:
      throw new Error(`No mock generator for agent type ${agentType}`);
  }
}
