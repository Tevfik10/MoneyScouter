import { ModelTier } from "@prisma/client";
import { CostController } from "@/server/ai/costController";

export interface ProductSourceSummary {
  supplierName: string;
  priceEur: number;
  rating: number;
  shippingDays: number;
  moq: number;
  // Alibaba sourcing fields — undefined for suppliers/platforms that don't
  // report them (e.g. mock/legacy AliExpress data). Never fabricated.
  moqUnit?: string;
  priceMin?: number;
  priceMax?: number;
  priceTiers?: Array<{ minQuantity: number; maxQuantity: number | null; price: number; unit?: string }>;
  certifications?: string[];
  supplierCountry?: string;
  supplierYearsOnPlatform?: number;
  supplierVerified?: boolean;
  supplierGold?: boolean;
  supplierAssessed?: boolean;
  supplierTradeAssurance?: boolean;
  supplierResponseRatePercent?: number;
  conceptMatchConfidence?: number;
}

export interface ProductBundle {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  estimatedSellingPriceEur: number;
  bestSource: ProductSourceSummary & {
    shippingCostEur: number;
    reviewCount: number;
    orderCount: number;
    weightGrams: number;
  };
  sources: ProductSourceSummary[];
}

export interface AgentContext {
  researchRunId: string;
  costController: CostController;
}

export interface AgentOutput<T> {
  summary: string;
  findings: T;
  modelTier: ModelTier;
  costEur: number;
}
