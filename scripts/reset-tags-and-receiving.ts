import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

async function main() {
  console.log("===============================================================");
  console.log(" WearTrail: Clean Tags, Blockchain Data & Receiving Dashboard ");
  console.log("===============================================================");

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
    console.log("\n[1] Disabling foreign key constraints temporarily (session_replication_role = 'replica')...");
    await client.query("SET session_replication_role = 'replica';");

    // 1. RFID Tag Bindings, Scans, and Contexts
    console.log("[2] Deleting RFID scans, contexts, and tag bindings...");
    const dScans = await client.query("DELETE FROM supplyease.rfid_scans;");
    const dContexts = await client.query("DELETE FROM supplyease.rfid_action_contexts;");
    const dBindings = await client.query("DELETE FROM supplyease.rfid_tag_bindings;");
    const dSourceSel = await client.query("DELETE FROM supplyease.cutting_source_selections;");
    const dSensorObs = await client.query("DELETE FROM supplyease.sensor_observations;");
    const dCaptureSteps = await client.query("DELETE FROM supplyease.capture_steps;");
    const dCaptureRuns = await client.query("DELETE FROM supplyease.capture_runs;");
    const dAlerts = await client.query("DELETE FROM supplyease.identifier_activity_alerts;");
    console.log(`    Deleted ${dScans.rowCount} rfid_scans, ${dContexts.rowCount} contexts, ${dBindings.rowCount} bindings, ${dAlerts.rowCount} alerts`);

    // 2. Blockchain and Public Verification Data
    console.log("[3] Deleting blockchain transactions, outbox, commitments, and public proofs...");
    const dTx = await client.query("DELETE FROM supplyease.ledger_transactions;");
    const dOutbox = await client.query("DELETE FROM supplyease.ledger_outbox;");
    const dCommitments = await client.query("DELETE FROM supplyease.ledger_commitments;");
    const dPayloads = await client.query("DELETE FROM supplyease.public_payload_versions;");
    const dBuckets = await client.query("DELETE FROM supplyease.public_lookup_buckets;");
    const dTraces = await client.query("DELETE FROM supplyease.trace_events;");
    console.log(`    Deleted ${dTx.rowCount} ledger_transactions, ${dOutbox.rowCount} outbox, ${dCommitments.rowCount} commitments, ${dPayloads.rowCount} payloads, ${dTraces.rowCount} traces`);

    // 3. Packages, Shipments, and Warehouse Storage
    console.log("[4] Deleting packages (clearing tag UIDs assigned as package codes) and warehouse movements...");
    const dShipPkgs = await client.query("DELETE FROM supplyease.shipment_packages;");
    const dShipments = await client.query("DELETE FROM supplyease.shipments;");
    const dPkgItems = await client.query("DELETE FROM supplyease.package_items;");
    const dPackages = await client.query("DELETE FROM supplyease.packages;");
    const dWhMovements = await client.query("DELETE FROM supplyease.warehouse_movements;");
    const dWhStock = await client.query("DELETE FROM supplyease.warehouse_stock;");
    console.log(`    Deleted ${dPackages.rowCount} packages, ${dPkgItems.rowCount} package items, ${dShipments.rowCount} shipments, ${dWhMovements.rowCount} warehouse movements`);

    // 4. Quality Holds, Inspections, and Garments
    console.log("[5] Deleting garment holds, inspections, repairs, rework cases, and garments...");
    const dHolds = await client.query("DELETE FROM supplyease.garment_holds;");
    const dMatInputs = await client.query("DELETE FROM supplyease.garment_material_inputs;");
    const dReturns = await client.query("DELETE FROM supplyease.garment_returns;");
    const dRepairs = await client.query("DELETE FROM supplyease.repair_records;");
    const dRework = await client.query("DELETE FROM supplyease.rework_cases;");
    const dInspections = await client.query("DELETE FROM supplyease.inspections;");
    const dGarments = await client.query("DELETE FROM supplyease.garments;");
    const dCutInputs = await client.query("DELETE FROM supplyease.cutting_inputs;");
    const dCutJobs = await client.query("DELETE FROM supplyease.cutting_jobs;");
    console.log(`    Deleted ${dGarments.rowCount} garments, ${dInspections.rowCount} inspections, ${dHolds.rowCount} holds, ${dCutJobs.rowCount} cutting jobs`);

    // 5. Material Lots, Movements, and Work Tasks (Receiving Dashboard Clean)
    console.log("[6] Deleting seeded & test material lots, movements, and work tasks...");
    const dMovements = await client.query("DELETE FROM supplyease.material_stock_movements;");
    const dLots = await client.query("DELETE FROM supplyease.material_lots;");
    const dTasks = await client.query("DELETE FROM supplyease.work_tasks;");
    console.log(`    Deleted ${dLots.rowCount} material_lots, ${dMovements.rowCount} stock movements, ${dTasks.rowCount} work tasks`);

    // 6. Reader Sessions cleanup: close stale reader sessions and decouple any context
    console.log("[7] Resetting reader sessions (closing stale sessions, clearing context references)...");
    const closedSessions = await client.query(`
      UPDATE supplyease.reader_sessions 
      SET closed_at = NOW(), close_reason = 'system_tag_reset' 
      WHERE closed_at IS NULL;
    `);
    console.log(`    Closed ${closedSessions.rowCount} active reader sessions so stations start completely fresh`);

    // 7. Clean operational audit events
    console.log("[8] Cleaning operational audit events related to tags, lots, garments, packages...");
    const dAudit = await client.query(`
      DELETE FROM supplyease.audit_events 
      WHERE target_type IN ('garment', 'material_lot', 'package', 'material_stock_movement', 'rfid_scan', 'inspection', 'cutting_job', 'shipment');
    `);
    console.log(`    Deleted ${dAudit.rowCount} operational audit events`);

    // 8. Re-enable foreign key constraints
    console.log("[9] Restoring foreign key constraints (session_replication_role = 'origin')...");
    await client.query("SET session_replication_role = 'origin';");

    // 9. Verify critical credentials and permissions are untouched
    console.log("\n===============================================================");
    console.log(" VERIFYING PRESERVED CREDENTIALS & PERMISSIONS");
    console.log("===============================================================");
    const staffCount = await client.query("SELECT count(*) FROM supplyease.staff_users;");
    const roleGrantsCount = await client.query("SELECT count(*) FROM supplyease.staff_role_grants;");
    const deviceCredsCount = await client.query("SELECT count(*) FROM supplyease.device_credentials;");
    const devicesCount = await client.query("SELECT count(*) FROM supplyease.devices;");
    const mappingsCount = await client.query("SELECT count(*) FROM supplyease.device_reader_mappings;");
    const suppliersCount = await client.query("SELECT count(*) FROM supplyease.suppliers;");
    const prodOrdersCount = await client.query("SELECT count(*) FROM supplyease.production_orders;");

    console.log(`  Staff Users (credentials):        ${staffCount.rows[0].count} [PRESERVED]`);
    console.log(`  Staff Role Grants (permissions):   ${roleGrantsCount.rows[0].count} [PRESERVED]`);
    console.log(`  Device Credentials (ESP32):        ${deviceCredsCount.rows[0].count} [PRESERVED]`);
    console.log(`  Devices (hardware):                ${devicesCount.rows[0].count} [PRESERVED]`);
    console.log(`  Device Reader Mappings:            ${mappingsCount.rows[0].count} [PRESERVED]`);
    console.log(`  Suppliers:                         ${suppliersCount.rows[0].count} [PRESERVED]`);
    console.log(`  Production Orders:                 ${prodOrdersCount.rows[0].count} [PRESERVED]`);

    // 10. Verify operational / tag / receiving tables are empty
    console.log("\n===============================================================");
    console.log(" VERIFYING CLEARED TAG, BLOCKCHAIN & RECEIVING TABLES");
    console.log("===============================================================");
    const finalCounts = await client.query(`
      SELECT 
        (SELECT count(*) FROM supplyease.rfid_tag_bindings) as tag_bindings,
        (SELECT count(*) FROM supplyease.rfid_scans) as scans,
        (SELECT count(*) FROM supplyease.rfid_action_contexts) as contexts,
        (SELECT count(*) FROM supplyease.packages) as packages,
        (SELECT count(*) FROM supplyease.garments) as garments,
        (SELECT count(*) FROM supplyease.material_lots) as material_lots,
        (SELECT count(*) FROM supplyease.inspections) as inspections,
        (SELECT count(*) FROM supplyease.work_tasks) as work_tasks,
        (SELECT count(*) FROM supplyease.ledger_commitments) as ledger_commitments,
        (SELECT count(*) FROM supplyease.ledger_transactions) as ledger_transactions,
        (SELECT count(*) FROM supplyease.ledger_outbox) as ledger_outbox,
        (SELECT count(*) FROM supplyease.public_payload_versions) as public_payloads,
        (SELECT count(*) FROM supplyease.trace_events) as trace_events
    `);
    console.log(finalCounts.rows[0]);

    console.log("\n===============================================================");
    console.log(" [SUCCESS] All 5 physical tags released & receiving demo clean!");
    console.log("===============================================================");
  } catch (err) {
    console.error("\n[ERROR] Database reset failed:", err);
    try {
      await client.query("SET session_replication_role = 'origin';");
    } catch {
      /* ignore */
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
