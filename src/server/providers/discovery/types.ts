// Discovery provider interface. Every product source (AliExpress, Alibaba,
// CJdropshipping, Google Shopping, trend feeds, ...) implements this same
// shape so the pipeline never needs to know which provider a product came
// from. Real integrations are added later, one adapter at a time, without
// touching pipeline code — see docs/ARCHITECTURE.md section F.

export interface DiscoveredProductSource {
  supplierPlatform: string; // "aliexpress" | "alibaba" | "cjdropshipping" | "mock" | ...
  supplierName: string;
  supplierExternalId: string;
  supplierProductId: string;
  url?: string;
  price: number;
  currency: string;
  oldPrice?: number;
  discountPercent?: number;
  shippingCost?: number;
  shippingDays?: number;
  moq?: number;
  reviewCount?: number;
  orderCount?: number;
  rating?: number;
  weightGrams?: number;
  /** Full raw item as returned by the provider, for anything without a dedicated field. */
  raw?: unknown;
}

export interface DiscoveredProduct {
  title: string;
  category: string;
  description?: string;
  imageUrl?: string;
  source: DiscoveredProductSource;
}

export interface DiscoveryParams {
  limit: number;
  /** Stable per-run seed so a provider's output is reproducible for a given run. */
  seed: string;
  categories?: string[];
}

export interface DiscoveryProvider {
  id: string;
  discover(params: DiscoveryParams): Promise<DiscoveredProduct[]>;
}
