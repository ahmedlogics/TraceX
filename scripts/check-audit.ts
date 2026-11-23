import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { prisma } from "../src/server/db/client";

async function run() {
  const events = await prisma.audit_events.findMany({
    orderBy: { recorded_at: "desc" },
    take: 30,
  });
  console.log("Recent 30 audit events:");
  for (const e of events) {
    console.log({
      time: e.recorded_at,
      action: e.action_code,
      target: `${e.target_type}:${e.target_reference}`,
      details: e.details,
    });
  }
}
run().finally(() => process.exit(0));
