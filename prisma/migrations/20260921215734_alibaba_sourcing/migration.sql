-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discoveryKeyword" TEXT,
ADD COLUMN     "discoveryTheme" TEXT;

-- AlterTable
ALTER TABLE "ProductSource" ADD COLUMN     "certifications" JSONB,
ADD COLUMN     "conceptMatchConfidence" DOUBLE PRECISION,
ADD COLUMN     "moqUnit" TEXT,
ADD COLUMN     "priceMax" DECIMAL(65,30),
ADD COLUMN     "priceMin" DECIMAL(65,30),
ADD COLUMN     "priceTiers" JSONB;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "assessedSupplier" BOOLEAN,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "goldSupplier" BOOLEAN,
ADD COLUMN     "responseRatePercent" DOUBLE PRECISION,
ADD COLUMN     "tradeAssurance" BOOLEAN,
ADD COLUMN     "verified" BOOLEAN,
ADD COLUMN     "yearsOnPlatform" INTEGER;
