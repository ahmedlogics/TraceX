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
    // Check all columns in supplyease schema with name like %tag% or %uid% or %rfid%
    const tagCols = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'supplyease' 
        AND (column_name ILIKE '%tag%' OR column_name ILIKE '%uid%' OR column_name ILIKE '%rfid%')
      ORDER BY table_name, column_name;
    `);
    console.log("Tag-related columns in supplyease schema:");
    for (const r of tagCols.rows) {
      console.log(` - ${r.table_name}.${r.column_name} (${r.data_type})`);
    }

    // Now check if any of these columns have non-null values
    for (const r of tagCols.rows) {
      if (r.column_name === 'id' || r.column_name.endsWith('_id')) continue;
      try {
        const valRes = await client.query(`SELECT count(*) as cnt FROM supplyease."${r.table_name}" WHERE "${r.column_name}" IS NOT NULL;`);
        const cnt = valRes.rows[0].cnt;
        if (cnt > 0) {
          console.log(`   ==> Table ${r.table_name}.${r.column_name} has ${cnt} non-null values!`);
        }
      } catch (err: any) {
        // ignore
      }
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
