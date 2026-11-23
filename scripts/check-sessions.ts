import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { prisma } from "../src/server/db/client";

async function run() {
  const sessions = await prisma.reader_sessions.findMany({
    where: { closed_at: null },
    include: {
      rfid_action_contexts: true,
      staff_users: { select: { username: true } },
    },
  });
  console.log(`Active reader sessions: ${sessions.length}`);
  for (const s of sessions) {
    console.log({
      id: s.id,
      station: s.station_code,
      readerIndex: s.reader_index,
      operator: s.staff_users.username,
      openedAt: s.opened_at,
      expiresAt: s.expires_at,
      context: s.rfid_action_contexts,
    });
  }
}

run().finally(() => process.exit(0));
