import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

async function main() {
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
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'supplyease' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log("=== All supplyease tables and their row counts ===");
    for (const row of tablesRes.rows) {
      const tableName = row.table_name;
      const countRes = await client.query(`SELECT count(*) FROM supplyease."${tableName}"`);
      const count = Number.parseInt(countRes.rows[0].count, 10);
      if (count > 0) {
        console.log(`  ${tableName.padEnd(32)}: ${count} rows`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
