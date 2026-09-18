import "dotenv/config";
import { runScout } from "../src/server/pipeline/orchestrator";
import { prisma } from "../src/server/db";

async function main() {
  console.log("Seeding MoneyScouter with a demo Scout run…");
  const result = await runScout({ trigger: "manual", discoveryLimit: 350 });
  const run = await prisma.researchRun.findUniqueOrThrow({ where: { id: result.runId } });
  console.log("Run complete:", {
    status: run.status,
    discovered: run.discoveredCount,
    rejected: run.rejectedCount,
    passedFilter: run.passedFilterCount,
    deepResearched: run.deepResearchedCount,
    highPotential: run.highPotentialCount,
    spendEur: run.spendEur.toString(),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
