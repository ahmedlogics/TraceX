import { createPrismaClient } from "../src/server/db/client";

async function main() {
  const db = createPrismaClient();
  try {
    const cuttingJobs = await db.cutting_jobs.findMany({
      include: { production_orders: true, garments: true },
    });
    console.log(`TOTAL_CUTTING_JOBS: ${cuttingJobs.length}`);
    for (const cj of cuttingJobs) {
      console.log(`- Cutting Job: ${cj.code} | Order: ${cj.production_orders?.code} | Garments count: ${cj.garments.length}`);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

main();
