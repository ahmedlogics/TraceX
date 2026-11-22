import { createPrismaClient } from "../src/server/db/client";

async function main() {
  const db = createPrismaClient();
  try {
    const inputs = await db.cutting_inputs.findMany({
      include: {
        cutting_jobs: { include: { production_orders: true } },
        garment_material_inputs: true,
      },
    });
    for (const inp of inputs) {
      const attributed = inp.garment_material_inputs.reduce((sum, g) => sum + Number(g.attributed_quantity), 0);
      console.log(`Job: ${inp.cutting_jobs.code} | Input: ${inp.id} | Consumed: ${inp.consumed_quantity} | Attributed: ${attributed} | Order: ${inp.cutting_jobs.production_orders.code}`);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

main();
