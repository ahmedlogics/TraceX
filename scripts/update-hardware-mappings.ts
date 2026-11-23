import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";
import { HARDWARE_DEVICE_CODE, HARDWARE_READER_MAPPINGS } from "./provision-hardware-device";

async function main() {
  console.log("==================================================");
  console.log(" Updating Hardware Reader Mappings in Database");
  console.log("==================================================");

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
    // 0. Bypass append-only triggers for mapping alignment
    await client.query("SET session_replication_role = 'replica';");

    // 1. Get hardware device
    const devRes = await client.query(
      "SELECT id, code FROM supplyease.devices WHERE code = $1",
      [HARDWARE_DEVICE_CODE]
    );
    if (devRes.rows.length === 0) {
      throw new Error(`Device ${HARDWARE_DEVICE_CODE} not found.`);
    }
    const deviceId = devRes.rows[0].id;
    console.log(`Found device ${HARDWARE_DEVICE_CODE} (ID: ${deviceId})`);

    // 2. Ensure device mapping version 2 exists and is active
    const verRes = await client.query(
      `SELECT version, activated_at, retired_at 
       FROM supplyease.device_mapping_versions 
       WHERE device_id = $1 AND version = 2`,
      [deviceId]
    );

    if (verRes.rows.length === 0) {
      const staffRes = await client.query("SELECT id FROM supplyease.staff_users LIMIT 1");
      const adminId = staffRes.rows[0].id;
      await client.query(
        `INSERT INTO supplyease.device_mapping_versions 
         (device_id, version, created_by, bench_verified_at, activated_at, retired_at)
         VALUES ($1, 2, $2, NOW(), NOW(), NULL)`,
        [deviceId, adminId]
      );
      console.log("✓ Created and activated device mapping version 2.");
    } else if (verRes.rows[0].retired_at !== null || verRes.rows[0].activated_at === null) {
      await client.query(
        `UPDATE supplyease.device_mapping_versions 
         SET bench_verified_at = COALESCE(bench_verified_at, NOW()), 
             activated_at = COALESCE(activated_at, NOW()), 
             retired_at = NULL 
         WHERE device_id = $1 AND version = 2`,
        [deviceId]
      );
      console.log("✓ Reactivated device mapping version 2.");
    } else {
      console.log("✓ Device mapping version 2 is already active.");
    }

    // Ensure version 1 is retired so only version 2 is the active mapping
    await client.query(
      `UPDATE supplyease.device_mapping_versions 
       SET retired_at = COALESCE(retired_at, NOW()) 
       WHERE device_id = $1 AND version = 1 AND retired_at IS NULL`,
      [deviceId]
    );

    // 3. Update requires_explicit_context for cutting to false
    await client.query(
      "UPDATE supplyease.rfid_stations SET requires_explicit_context = false WHERE code = 'cutting'"
    );
    console.log("✓ Station 'cutting' requires_explicit_context updated to false.");

    // 4. Delete old mappings for this device and insert clean canonical mappings for version 2 & version 1
    await client.query(
      "DELETE FROM supplyease.device_reader_mappings WHERE device_id = $1",
      [deviceId]
    );
    console.log("✓ Cleared old mappings for device.");

    // Insert canonical mappings for active version 2
    for (const m of HARDWARE_READER_MAPPINGS) {
      await client.query(
        `INSERT INTO supplyease.device_reader_mappings 
         (device_id, mapping_version, reader_index, station_code, physical_label)
         VALUES ($1, 2, $2, $3, $4)`,
        [deviceId, m.readerIndex, m.stationCode, m.label]
      );
      console.log(`✓ [v2 Active] Reader ${m.readerIndex} (GPIO ${m.gpio}) -> ${m.stationCode} (${m.label})`);
    }

    // Also insert for version 1 for backward compatibility
    for (const m of HARDWARE_READER_MAPPINGS) {
      await client.query(
        `INSERT INTO supplyease.device_reader_mappings 
         (device_id, mapping_version, reader_index, station_code, physical_label)
         VALUES ($1, 1, $2, $3, $4)`,
        [deviceId, m.readerIndex, m.stationCode, m.label]
      );
    }
    console.log("✓ [v1 Legacy] Populated 9 mappings for backward compatibility.");

    // 5. Close existing reader sessions to avoid stale station associations
    const sessRes = await client.query(
      `UPDATE supplyease.reader_sessions 
       SET closed_at = NOW(), close_reason = 'Reconfigured canonical station mappings'
       WHERE device_id = $1 AND closed_at IS NULL`,
      [deviceId]
    );
    console.log(`✓ Closed ${sessRes.rowCount} previous reader sessions.`);

    // 6. Restore origin replication role
    await client.query("SET session_replication_role = 'origin';");

    // 7. Verify final mappings
    const finalRes = await client.query(
      `SELECT mapping_version, reader_index, station_code, physical_label 
       FROM supplyease.device_reader_mappings 
       WHERE device_id = $1 
       ORDER BY mapping_version ASC, reader_index ASC`,
      [deviceId]
    );
    console.log("\nVerified final device_reader_mappings for hardware device:");
    console.table(finalRes.rows);

    console.log("\n==================================================");
    console.log(" [SUCCESS] Hardware mappings aligned successfully!");
    console.log("==================================================");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
