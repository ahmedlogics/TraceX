import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

async function main() {
  console.log("Setting inspections.rfid_scan_id = NULL...");
  const url = process.env["MIGRATION_DATABASE_URL"] || process.env["DATABASE_URL"] || "";
  const parsed = parseConnectionString(url);
  const pool = new pg.Pool({
    host: parsed.host ?? undefined,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : undefined,
    database: parsed.database ?? undefined,
    user: parsed.user ?? undefined,
    password: parsed.password ?? undefined,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("SET session_replication_role = 'replica';");
    const res = await client.query("UPDATE supplyease.inspections SET rfid_scan_id = NULL WHERE rfid_scan_id IS NOT NULL;");
    console.log(`Updated ${res.rowCount} inspections to rfid_scan_id = NULL`);
    await client.query("SET session_replication_role = 'origin';");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
