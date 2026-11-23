import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

async function main() {
  const url = process.env["DATABASE_URL"] || "";
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
    const res = await client.query(`
      SELECT * 
      FROM supplyease.rfid_stations
    `);
    console.log("Current DB rfid_stations:");
    console.table(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
