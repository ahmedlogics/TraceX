import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { prisma } from "../src/server/db/client";

async function run() {
  const orders = await prisma.production_orders.findMany({
    select: { id: true, code: true, status: true, planned_quantity: true, created_at: true },
  });
  console.log("Orders:", orders);
}
run().finally(() => process.exit(0));
