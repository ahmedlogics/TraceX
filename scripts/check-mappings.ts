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
    console.log("==================================================");
    console.log(" RFID Diagnostic: Devices, Versions & Mappings");
    console.log("==================================================");

    // 1. Devices
    const devRes = await client.query(`SELECT id, code, name, enabled FROM supplyease.devices ORDER BY code`);
    console.log("\n--- Devices ---");
    console.table(devRes.rows);

    // 2. Device Mapping Versions
    const verRes = await client.query(`
      SELECT 
        d.code AS device_code,
        v.device_id, 
        v.version, 
        v.bench_verified_at, 
        v.activated_at, 
        v.retired_at 
      FROM supplyease.device_mapping_versions v
      JOIN supplyease.devices d ON d.id = v.device_id
      ORDER BY d.code, v.version
    `);
    console.log("\n--- Device Mapping Versions ---");
    console.table(verRes.rows);

    // 3. Reader Mappings (All)
    const mapRes = await client.query(`
      SELECT 
        d.code AS device_code,
        m.device_id, 
        m.mapping_version, 
        m.reader_index, 
        m.station_code, 
        m.physical_label 
      FROM supplyease.device_reader_mappings m
      JOIN supplyease.devices d ON d.id = m.device_id
      ORDER BY d.code, m.mapping_version, m.reader_index
    `);
    console.log("\n--- Reader Mappings (All Versions) ---");
    console.table(mapRes.rows);

    // 4. Reader Mappings (Version 2)
    const v2Res = await client.query(`
      SELECT 
        d.code AS device_code,
        m.device_id, 
        m.mapping_version, 
        m.reader_index, 
        m.station_code, 
        m.physical_label 
      FROM supplyease.device_reader_mappings m
      JOIN supplyease.devices d ON d.id = m.device_id
      WHERE m.mapping_version = 2
      ORDER BY d.code, m.reader_index
    `);
    console.log("\n--- Reader Mappings (Mapping Version 2) ---");
    console.table(v2Res.rows);

    // 5. Open Reader Sessions
    const sessRes = await client.query(`
      SELECT 
        d.code AS device_code,
        s.id, 
        s.device_id, 
        s.mapping_version, 
        s.reader_index, 
        s.station_code, 
        s.operator_id, 
        s.opened_at, 
        s.expires_at, 
        s.closed_at 
      FROM supplyease.reader_sessions s
      JOIN supplyease.devices d ON d.id = s.device_id
      WHERE s.closed_at IS NULL
      ORDER BY d.code, s.opened_at DESC
    `);
    console.log("\n--- Open Reader Sessions ---");
    console.table(sessRes.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
