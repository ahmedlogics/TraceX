import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { prisma } from "../src/server/db/client";

async function main() {
  const lots = await prisma.material_lots.findMany({
    include: {
      suppliers: true,
      staff_users: true,
      rfid_tag_bindings: true,
      inspections: true,
      material_stock_movements: true,
      work_tasks: true,
      capture_runs: true,
    },
    orderBy: { received_at: "asc" },
  });

  console.log(`Found ${lots.length} lots:`);
  for (const l of lots) {
    console.log({
      id: l.id,
      code: l.code,
      material: l.material_name,
      supplier: l.suppliers?.name,
      received_at: l.received_at,
      received_by: l.staff_users?.username,
      active_binding: l.rfid_tag_bindings,
      inspections: l.inspections.length,
      movements: l.material_stock_movements.length,
      tasks: l.work_tasks.length,
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
