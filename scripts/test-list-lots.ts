import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { listLots } from "../src/server/materials/materials-service";

async function main() {
  const lots = await listLots();
  console.log(`listLots returned ${lots.length} lots:`);
  for (const l of lots) {
    console.log({
      id: l.id,
      code: l.code,
      material: l.materialName,
      status: l.status,
      activeTagUid: l.activeTagUid,
      receivedBy: l.receivedByName,
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
