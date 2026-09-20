-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('LLM_MOCK', 'APIFY_DETERMINISTIC');

-- CreateEnum
CREATE TYPE "ApifyRunStatus" AS ENUM ('READY', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentType" ADD VALUE 'SCOUT';
ALTER TYPE "AgentType" ADD VALUE 'DEDUP';
ALTER TYPE "AgentType" ADD VALUE 'FILTER';
ALTER TYPE "AgentType" ADD VALUE 'TREND';

-- AlterTable
ALTER TABLE "CompetitorSighting" ADD COLUMN     "matchConfidence" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProductSource" ADD COLUMN     "discountPercent" DOUBLE PRECISION,
ADD COLUMN     "oldPrice" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "ResearchRun" ADD COLUMN     "apifyBudgetUsd" DECIMAL(65,30),
ADD COLUMN     "apifyHardLimitUsd" DECIMAL(65,30),
ADD COLUMN     "apifySpendUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "marketEnrichedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mode" "RunMode" NOT NULL DEFAULT 'LLM_MOCK',
ADD COLUMN     "testMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Score" ADD COLUMN     "marketPriceOpportunity" INTEGER,
ALTER COLUMN "brandability" DROP NOT NULL,
ALTER COLUMN "marketingAngles" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SearchTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchKeyword" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "itemsReturned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApifyCall" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT,
    "actorId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "apifyRunId" TEXT NOT NULL,
    "datasetId" TEXT,
    "status" "ApifyRunStatus" NOT NULL DEFAULT 'READY',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(65,30) NOT NULL,
    "actualCostUsd" DECIMAL(65,30),
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ApifyCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStageRun" (
    "id" TEXT NOT NULL,
    "researchRunId" TEXT NOT NULL,
    "stage" "AgentType" NOT NULL,
    "status" "AgentResultStatus" NOT NULL DEFAULT 'COMPLETED',
    "dataSource" TEXT,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "itemsRejected" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(65,30),
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineStageRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchTopic_name_key" ON "SearchTopic"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SearchKeyword_topicId_keyword_key" ON "SearchKeyword"("topicId", "keyword");

-- CreateIndex
CREATE INDEX "SearchRun_researchRunId_idx" ON "SearchRun"("researchRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ApifyCall_apifyRunId_key" ON "ApifyCall"("apifyRunId");

-- CreateIndex
CREATE INDEX "ApifyCall_startedAt_idx" ON "ApifyCall"("startedAt");

-- CreateIndex
CREATE INDEX "ApifyCall_researchRunId_idx" ON "ApifyCall"("researchRunId");

-- CreateIndex
CREATE INDEX "PipelineStageRun_researchRunId_idx" ON "PipelineStageRun"("researchRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStageRun_researchRunId_stage_key" ON "PipelineStageRun"("researchRunId", "stage");

-- CreateIndex
CREATE INDEX "ResearchRun_mode_idx" ON "ResearchRun"("mode");

-- AddForeignKey
ALTER TABLE "SearchKeyword" ADD CONSTRAINT "SearchKeyword_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "SearchTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "SearchKeyword"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApifyCall" ADD CONSTRAINT "ApifyCall_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageRun" ADD CONSTRAINT "PipelineStageRun_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
