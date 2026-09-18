import { ModelTier } from "@prisma/client";
import { CostController } from "@/server/ai/costController";

export interface ProductSourceSummary {
  supplierName: string;
  priceEur: number;
  rating: number;
  shippingDays: number;
  moq: number;
}

export interface ProductBundle {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  estimatedSellingPriceEur: number;
  bestSource: {
    supplierName: string;
    priceEur: number;
    shippingCostEur: number;
    shippingDays: number;
    rating: number;
    reviewCount: number;
    orderCount: number;
    moq: number;
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
