// Discovery provider interface. Every product source (AliExpress, Alibaba,
// CJdropshipping, Google Shopping, trend feeds, ...) implements this same
// shape so the pipeline never needs to know which provider a product came
// from. Real integrations are added later, one adapter at a time, without
// touching pipeline code — see docs/ARCHITECTURE.md section F.

export interface DiscoveredProductSource {
  supplierPlatform: string; // "aliexpress" (legacy/inactive) | "alibaba" | "cjdropshipping" | "mock" | ...
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

  // B2B/Alibaba sourcing fields — optional, only ever set by providers that
  // actually expose them (e.g. the Alibaba adapter). Left undefined by
  // consumer-marketplace providers (e.g. the legacy AliExpress adapter),
  // never fabricated. See docs on ProductSource in schema.prisma.
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
}

export interface DiscoveredProduct {
  title: string;
  category: string;
  description?: string;
  imageUrl?: string;
  source: DiscoveredProductSource;
  /** Which configured search theme/keyword produced this discovery — see
   * pipeline/searchKeywords.ts and Product.discoveryTheme/discoveryKeyword. */
  discoveryTheme?: string;
  discoveryKeyword?: string;
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
