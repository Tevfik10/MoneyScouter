-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DISCOVERED', 'FILTERED_OUT', 'ENRICHED', 'SHORTLISTED', 'RESEARCHED', 'REJECTED', 'WATCHLISTED', 'INTERESTING', 'HIGH_POTENTIAL');

-- CreateEnum
CREATE TYPE "ComplianceRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BUDGET_STOPPED');

-- CreateEnum
CREATE TYPE "DecisionStage" AS ENUM ('FILTER', 'ENRICHMENT', 'SHORTLIST', 'JUDGE');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('PASS', 'REJECT', 'WATCH', 'INTERESTING', 'HIGH_POTENTIAL');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('MARKET', 'COMPETITOR', 'SUPPLIER', 'MARGIN', 'BRAND', 'ANGLE', 'RISK', 'SKEPTIC', 'JUDGE');

-- CreateEnum
CREATE TYPE "ModelTier" AS ENUM ('CHEAP', 'STANDARD', 'STRONG');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CLASSIFICATION', 'EXTRACTION', 'SUMMARIZATION', 'REASONING', 'JUDGE');

-- CreateEnum
CREATE TYPE "AgentResultStatus" AS ENUM ('COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('DRAFT', 'READY_FOR_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DISCOVERED',
    "complianceRisk" "ComplianceRisk" NOT NULL DEFAULT 'LOW',
    "currentScore" INTEGER,
    "currentVerdict" "Verdict",
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "rating" DOUBLE PRECISION,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSource" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "url" TEXT,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "shippingCost" DECIMAL(65,30),
    "shippingDays" INTEGER,
    "moq" INTEGER,
    "reviewCount" INTEGER,
    "orderCount" INTEGER,
    "rating" DOUBLE PRECISION,
    "weightGrams" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFingerprint" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productSourceId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "passedFilterCount" INTEGER NOT NULL DEFAULT 0,
    "enrichedCount" INTEGER NOT NULL DEFAULT 0,
    "shortlistedCount" INTEGER NOT NULL DEFAULT 0,
    "deepResearchedCount" INTEGER NOT NULL DEFAULT 0,
    "highPotentialCount" INTEGER NOT NULL DEFAULT 0,
    "budgetEur" DECIMAL(65,30) NOT NULL,
    "hardLimitEur" DECIMAL(65,30) NOT NULL,
    "spendEur" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ResearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentResult" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "status" "AgentResultStatus" NOT NULL DEFAULT 'COMPLETED',
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "modelTier" "ModelTier" NOT NULL,
    "promptVersionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "demand" INTEGER NOT NULL,
    "trend" INTEGER NOT NULL,
    "margin" INTEGER NOT NULL,
    "competition" INTEGER NOT NULL,
    "brandability" INTEGER NOT NULL,
    "marketingAngles" INTEGER NOT NULL,
    "supplierQuality" INTEGER NOT NULL,
    "shipping" INTEGER NOT NULL,
    "operationalEase" INTEGER NOT NULL,
    "risk" INTEGER NOT NULL,
    "moneyScore" INTEGER NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "why" TEXT[],
    "concerns" TEXT[],
    "nextStep" TEXT,
    "weightsUsed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT,
    "productId" TEXT NOT NULL,
    "stage" "DecisionStage" NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "reasons" TEXT[],
    "ruleSetVersion" TEXT,
    "agentType" "AgentType",
    "modelTier" "ModelTier",
    "promptVersionId" TEXT,
    "costEur" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT,
    "productId" TEXT,
    "agentType" "AgentType",
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tier" "ModelTier" NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostEur" DECIMAL(65,30) NOT NULL,
    "promptVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAlertAt" TIMESTAMP(3),

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSighting" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "researchRunId" TEXT,
    "price" DECIMAL(65,30),
    "positioning" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorSighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationTest" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "ValidationStatus" NOT NULL DEFAULT 'DRAFT',
    "brandName" TEXT,
    "positioning" TEXT,
    "usp" TEXT,
    "targetAudience" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "faq" JSONB,
    "price" DECIMAL(65,30),
    "offer" TEXT,
    "bundles" JSONB,
    "landingCopy" TEXT,
    "adConcepts" JSONB,
    "imagePrompts" JSONB,
    "suggestedBudgetEur" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_normalizedTitle_idx" ON "Product"("normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_platform_externalId_key" ON "Supplier"("platform", "externalId");

-- CreateIndex
CREATE INDEX "ProductSource_productId_idx" ON "ProductSource"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSource_supplierId_supplierProductId_key" ON "ProductSource"("supplierId", "supplierProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFingerprint_hash_key" ON "ProductFingerprint"("hash");

-- CreateIndex
CREATE INDEX "ProductFingerprint_productId_idx" ON "ProductFingerprint"("productId");

-- CreateIndex
CREATE INDEX "PriceHistory_productSourceId_observedAt_idx" ON "PriceHistory"("productSourceId", "observedAt");

-- CreateIndex
CREATE INDEX "ResearchRun_status_idx" ON "ResearchRun"("status");

-- CreateIndex
CREATE INDEX "ResearchRun_startedAt_idx" ON "ResearchRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchCache_cacheKey_key" ON "ResearchCache"("cacheKey");

-- CreateIndex
CREATE INDEX "ResearchCache_productId_stage_idx" ON "ResearchCache"("productId", "stage");

-- CreateIndex
CREATE INDEX "AgentResult_productId_idx" ON "AgentResult"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentResult_researchRunId_productId_agentType_key" ON "AgentResult"("researchRunId", "productId", "agentType");

-- CreateIndex
CREATE INDEX "Score_productId_idx" ON "Score"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_researchRunId_productId_key" ON "Score"("researchRunId", "productId");

-- CreateIndex
CREATE INDEX "Decision_productId_idx" ON "Decision"("productId");

-- CreateIndex
CREATE INDEX "Decision_researchRunId_idx" ON "Decision"("researchRunId");

-- CreateIndex
CREATE INDEX "AiCall_createdAt_idx" ON "AiCall"("createdAt");

-- CreateIndex
CREATE INDEX "AiCall_researchRunId_idx" ON "AiCall"("researchRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_agentType_version_key" ON "PromptVersion"("agentType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_productId_key" ON "Watchlist"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_name_domain_key" ON "Competitor"("name", "domain");

-- CreateIndex
CREATE INDEX "CompetitorSighting_productId_idx" ON "CompetitorSighting"("productId");

-- AddForeignKey
ALTER TABLE "ProductSource" ADD CONSTRAINT "ProductSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSource" ADD CONSTRAINT "ProductSource_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFingerprint" ADD CONSTRAINT "ProductFingerprint_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productSourceId_fkey" FOREIGN KEY ("productSourceId") REFERENCES "ProductSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResult" ADD CONSTRAINT "AgentResult_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResult" ADD CONSTRAINT "AgentResult_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResult" ADD CONSTRAINT "AgentResult_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSighting" ADD CONSTRAINT "CompetitorSighting_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSighting" ADD CONSTRAINT "CompetitorSighting_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationTest" ADD CONSTRAINT "ValidationTest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
