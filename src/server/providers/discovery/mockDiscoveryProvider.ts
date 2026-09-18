import { SeededRandom } from "@/server/ai/seededRandom";
import { DiscoveredProduct, DiscoveryParams, DiscoveryProvider } from "@/server/providers/discovery/types";

// Deterministic, realistic demo catalog. The whole point of a mock provider
// per docs/ARCHITECTURE.md section F: prove the full funnel end-to-end
// before any real supplier API is wired in. Re-running with the same seed
// mostly reproduces the same catalog (so "seen before" dedup behaves the
// way it would against a real, slow-changing supplier feed), with a slice
// of price jitter and genuinely new items per run so the funnel counters
// stay interesting night over night.

type CategoryDef = {
  category: string;
  nouns: string[];
  adjectives: string[];
  priceMin: number;
  priceMax: number;
  weightMin: number;
  weightMax: number;
  excluded?: boolean;
  highRisk?: boolean;
};

const CATEGORIES: CategoryDef[] = [
  { category: "travel-bags", nouns: ["Travel Backpack", "Packing Cubes Set", "Toiletry Bag", "Duffel Bag", "Passport Wallet"], adjectives: ["Foldable", "Minimalist", "Carry-On", "Weekender", "Anti-Theft"], priceMin: 4, priceMax: 22, weightMin: 300, weightMax: 1800 },
  { category: "home-fitness", nouns: ["Resistance Bands Set", "Yoga Mat", "Grip Strengthener", "Ab Roller", "Jump Rope"], adjectives: ["Adjustable", "Compact", "Pro", "Heavy-Duty", "Portable"], priceMin: 3, priceMax: 18, weightMin: 150, weightMax: 2200 },
  { category: "kitchen-gadgets", nouns: ["Herb Chopper", "Egg Separator", "Vegetable Spiralizer", "Garlic Press", "Silicone Baking Mat"], adjectives: ["Multi-Function", "Stainless Steel", "Silicone", "Space-Saving", "Dishwasher-Safe"], priceMin: 2, priceMax: 14, weightMin: 60, weightMax: 900 },
  { category: "pet-accessories", nouns: ["Dog Harness", "Cat Water Fountain", "Pet Grooming Glove", "Travel Bowl", "Nail Clipper Set"], adjectives: ["No-Pull", "Automatic", "Portable", "Ergonomic", "Quiet"], priceMin: 3, priceMax: 20, weightMin: 80, weightMax: 1200 },
  { category: "phone-accessories", nouns: ["MagSafe Wallet", "Ring Light", "Car Mount", "Cable Organizer", "Webcam Cover"], adjectives: ["Magnetic", "Adjustable", "Universal", "Slim", "Rechargeable"], priceMin: 1, priceMax: 12, weightMin: 20, weightMax: 400 },
  { category: "outdoor-gear", nouns: ["Camping Hammock", "Headlamp", "Collapsible Water Bottle", "Multi-Tool", "Rain Poncho"], adjectives: ["Ultralight", "Waterproof", "Compact", "Rechargeable", "All-Weather"], priceMin: 4, priceMax: 24, weightMin: 100, weightMax: 2000 },
  { category: "office-supplies", nouns: ["Laptop Stand", "Cable Sleeve", "Desk Organizer", "Wireless Charger Pad", "Monitor Light Bar"], adjectives: ["Ergonomic", "Foldable", "Aluminum", "Minimalist", "Adjustable"], priceMin: 3, priceMax: 20, weightMin: 150, weightMax: 1500 },
  { category: "beauty-tools", nouns: ["Facial Roller", "Makeup Brush Set", "LED Mirror", "Hair Straightener Brush", "Nail Kit"], adjectives: ["Jade", "Portable", "Rechargeable", "Professional", "Travel-Size"], priceMin: 2, priceMax: 18, weightMin: 50, weightMax: 700 },
  { category: "smart-home", nouns: ["Smart Plug", "Motion Sensor Light", "Mini Projector", "Smart Door Lock", "WiFi Repeater"], adjectives: ["Compact", "Voice-Controlled", "Energy-Saving", "Plug-and-Play", "Wireless"], priceMin: 5, priceMax: 35, weightMin: 100, weightMax: 1000, highRisk: true },
  { category: "car-accessories", nouns: ["Trunk Organizer", "Seat Gap Filler", "Dash Cam", "Tire Inflator", "Sunshade Set"], adjectives: ["Foldable", "Heavy-Duty", "Universal-Fit", "Compact", "Rechargeable"], priceMin: 4, priceMax: 28, weightMin: 200, weightMax: 2500 },
  { category: "sports-equipment", nouns: ["Pickleball Paddle Set", "Swim Goggles", "Golf Alignment Sticks", "Knee Sleeve", "Balance Board"], adjectives: ["Pro", "Beginner-Friendly", "Lightweight", "Adjustable", "Anti-Slip"], priceMin: 5, priceMax: 30, weightMin: 150, weightMax: 3000 },
  { category: "toys-games", nouns: ["Magnetic Tile Set", "Puzzle Cube", "STEM Building Kit", "Card Game", "Plush Night Light"], adjectives: ["Educational", "Glow-in-the-Dark", "Travel-Size", "Montessori", "Interactive"], priceMin: 3, priceMax: 22, weightMin: 100, weightMax: 1800, highRisk: true },
  { category: "health-wellness", nouns: ["Posture Corrector", "Massage Gun", "Sleep Mask", "Heating Pad", "Acupressure Mat"], adjectives: ["Adjustable", "Rechargeable", "Ergonomic", "Weighted", "Cordless"], priceMin: 4, priceMax: 32, weightMin: 100, weightMax: 1800 },
  { category: "fashion-accessories", nouns: ["Minimalist Wallet", "Silk Scrunchie Set", "Crossbody Bag", "Sunglasses", "Beanie"], adjectives: ["Slim", "Vegan-Leather", "Everyday", "Unisex", "Reversible"], priceMin: 2, priceMax: 16, weightMin: 30, weightMax: 500 },
  { category: "supplements", nouns: ["Fat Burner Capsules", "Joint Support Pills", "Detox Tea", "Collagen Powder", "Sleep Gummies"], adjectives: ["Fast-Acting", "Natural", "Clinical-Strength", "Herbal", "Advanced"], priceMin: 3, priceMax: 20, weightMin: 50, weightMax: 500, excluded: true },
];

const SUPPLIER_NAMES = [
  "Shenzhen HomeGoods Co.", "Yiwu FastShip Trading", "Guangzhou EverBright Ltd.",
  "Ningbo PrimeSource", "Dongguan CraftWorks", "Foshan DailyGoods",
  "Hangzhou SwiftSupply", "Shantou ValueTrade",
];

interface PoolItem {
  key: string;
  title: string;
  category: string;
  basePriceEur: number;
  weightGrams: number;
  supplierName: string;
  supplierExternalId: string;
  supplierProductId: string;
  baseRating: number;
  baseReviewCount: number;
  baseOrderCount: number;
  baseShippingDays: number;
  moq: number;
  excluded: boolean;
  highRisk: boolean;
}

const POOL_SIZE_PER_CATEGORY = 22;

function buildPool(): PoolItem[] {
  const rng = new SeededRandom("moneyscouter-catalog-v1");
  const pool: PoolItem[] = [];
  for (const cat of CATEGORIES) {
    for (let i = 0; i < POOL_SIZE_PER_CATEGORY; i++) {
      const noun = rng.pick(cat.nouns);
      const adjective = rng.pick(cat.adjectives);
      const supplierName = rng.pick(SUPPLIER_NAMES);
      const supplierExternalId = `${supplierName.split(" ")[0].toLowerCase()}-${rng.int(1000, 9999)}`;
      const key = `${cat.category}-${i}`;
      pool.push({
        key,
        title: `${adjective} ${noun}`,
        category: cat.category,
        basePriceEur: Math.round(rng.float(cat.priceMin, cat.priceMax) * 100) / 100,
        weightGrams: rng.int(cat.weightMin, cat.weightMax),
        supplierName,
        supplierExternalId,
        supplierProductId: `SP${rng.int(100000, 999999)}`,
        baseRating: Math.round(rng.float(2.8, 5.0) * 10) / 10,
        baseReviewCount: rng.int(0, 4000),
        baseOrderCount: rng.int(0, 12000),
        baseShippingDays: rng.int(7, 35),
        moq: rng.pick([1, 1, 1, 2, 5, 10]),
        excluded: !!cat.excluded,
        highRisk: !!cat.highRisk,
      });
    }
  }
  return pool;
}

const POOL = buildPool();

export class MockDiscoveryProvider implements DiscoveryProvider {
  id = "mock";

  async discover(params: DiscoveryParams): Promise<DiscoveredProduct[]> {
    const runRng = new SeededRandom(params.seed);
    let candidates = params.categories?.length
      ? POOL.filter((p) => params.categories!.includes(p.category))
      : POOL;

    // Stable 80% core catalog (always resurfaces -> exercises "seen
    // before" dedup) + a rotating slice unique to this run's seed (-> a
    // few genuinely NEW products each run, like a real feed would surface).
    const coreCount = Math.floor(candidates.length * 0.8);
    const sorted = [...candidates].sort((a, b) => a.key.localeCompare(b.key));
    const core = sorted.slice(0, coreCount);
    const rotatingPool = sorted.slice(coreCount);
    const rotating = shuffle(rotatingPool, runRng).slice(0, Math.max(0, params.limit - core.length));

    const selected = shuffle([...core, ...rotating], runRng).slice(0, params.limit);

    return selected.map((item) => {
      // Small per-run price/rating jitter simulates real-world drift so the
      // pipeline's UPDATED-vs-SEEN_BEFORE path gets exercised.
      const itemRng = new SeededRandom(`${params.seed}:${item.key}`);
      const priceJitter = itemRng.float(-0.12, 0.12);
      const price = Math.max(0.5, Math.round(item.basePriceEur * (1 + priceJitter) * 100) / 100);

      const product: DiscoveredProduct = {
        title: item.title,
        category: item.category,
        description: `${item.title} sourced from ${item.supplierName}. Category: ${item.category}.`,
        imageUrl: `https://picsum.photos/seed/${encodeURIComponent(item.key)}/480/480`,
        source: {
          supplierPlatform: "mock",
          supplierName: item.supplierName,
          supplierExternalId: item.supplierExternalId,
          supplierProductId: item.supplierProductId,
          url: `https://example-supplier.invalid/product/${item.supplierProductId}`,
          price,
          currency: "EUR",
          shippingCost: Math.round(itemRng.float(0, 4) * 100) / 100,
          shippingDays: item.baseShippingDays,
          moq: item.moq,
          reviewCount: item.baseReviewCount,
          orderCount: item.baseOrderCount,
          rating: item.baseRating,
          weightGrams: item.weightGrams,
        },
      };
      return product;
    });
  }
}

function shuffle<T>(items: T[], rng: SeededRandom): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const mockDiscoveryProvider = new MockDiscoveryProvider();

export function getPoolCategoryDefs() {
  return CATEGORIES;
}
