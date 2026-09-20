-- AlterTable
ALTER TABLE "ApifyCall" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "keyword" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "requestedLimit" INTEGER;
