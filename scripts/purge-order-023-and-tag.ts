import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

async function main() {
  console.log("==================================================================");
  console.log(" WearTrail: Complete Purge of ORDER-023, Garments & Card E0C0121D316B0E");
  console.log("==================================================================");

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

  const orderId = "0984e6bf-0654-49ba-8680-4f9bd567d068"; // ORDER-023
  const cuttingJobId = "e29157f1-b166-42ba-b1b0-4fdf7fafa7ab"; // CUT-MWT135FS
  const garmentIds = [
    "36bc22f9-22ad-4fa0-b4e7-27bfe71cf073", // GAR-MWT3DWGY-7370
    "175b2ab8-0c74-40bf-80aa-9615710c9a53"  // SHIRT-001
  ];
  const tagUid = "E0C0121D316B0E";
  const specId = "8f83cfb6-53d0-45de-9cf5-8672267c34f9"; // red chaddi spec
  const lotId = "dc402283-fa03-4160-9ed6-f7cddc7f5e68"; // FAB-002

  try {
    await client.query("BEGIN;");
    console.log("Transaction started.");

    await client.query("SET session_replication_role = 'replica';");

    // 1. Ledger Outbox
    const delOutbox = await client.query(`
      DELETE FROM supplyease.ledger_outbox 
      WHERE commitment_id IN (
        SELECT id FROM supplyease.ledger_commitments 
        WHERE trace_event_id IN (
          SELECT id FROM supplyease.trace_events 
          WHERE garment_id = ANY($1::uuid[])
        )
      );
    `, [garmentIds]);
    console.log(`1. Deleted from ledger_outbox: ${delOutbox.rowCount} row(s)`);

    // 2. Ledger Commitments
    const delCommitments = await client.query(`
      DELETE FROM supplyease.ledger_commitments 
      WHERE trace_event_id IN (
        SELECT id FROM supplyease.trace_events 
        WHERE garment_id = ANY($1::uuid[])
      )
      OR internal_payload_bytes::text ILIKE $2
      OR internal_payload_bytes::text ILIKE $3;
    `, [garmentIds, `%${tagUid}%`, `%GAR-MWT3DWGY-7370%`]);
    console.log(`2. Deleted from ledger_commitments: ${delCommitments.rowCount} row(s)`);

    // 3. Trace Events
    const delTrace = await client.query(`
      DELETE FROM supplyease.trace_events 
      WHERE garment_id = ANY($1::uuid[])
      OR details::text ILIKE $2
      OR details::text ILIKE '%ORDER-023%';
    `, [garmentIds, `%${tagUid}%`]);
    console.log(`3. Deleted from trace_events: ${delTrace.rowCount} row(s)`);

    // 4. RFID Scans
    const delScans = await client.query(`
      DELETE FROM supplyease.rfid_scans 
      WHERE tag_uid = $1 
      OR garment_id = ANY($2::uuid[]);
    `, [tagUid, garmentIds]);
    console.log(`4. Deleted from rfid_scans: ${delScans.rowCount} row(s)`);

    // 5. RFID Action Contexts
    const delContexts = await client.query(`
      DELETE FROM supplyease.rfid_action_contexts 
      WHERE cutting_job_id = $1 
      OR production_order_id = $2;
    `, [cuttingJobId, orderId]);
    console.log(`5. Deleted from rfid_action_contexts: ${delContexts.rowCount} row(s)`);

    // 6. RFID Tag Bindings
    const delBindings = await client.query(`
      DELETE FROM supplyease.rfid_tag_bindings 
      WHERE tag_identifier = $1 
      OR tag_uid = $1 
      OR garment_id = ANY($2::uuid[]);
    `, [tagUid, garmentIds]);
    console.log(`6. Deleted from rfid_tag_bindings (UNBOUND & PURGED): ${delBindings.rowCount} row(s)`);

    // 7. Public Payload & Lookup Buckets
    const delPublicPayloads = await client.query(`
      DELETE FROM supplyease.public_payload_versions 
      WHERE garment_id = ANY($1::uuid[]);
    `, [garmentIds]);
    const delPublicBuckets = await client.query(`
      DELETE FROM supplyease.public_lookup_buckets 
      WHERE garment_id = ANY($1::uuid[]);
    `, [garmentIds]);
    console.log(`7. Deleted from public_payload_versions (${delPublicPayloads.rowCount}) and lookup_buckets (${delPublicBuckets.rowCount})`);

    // 8. Garment Material Inputs
    const delGMI = await client.query(`
      DELETE FROM supplyease.garment_material_inputs 
      WHERE garment_id = ANY($1::uuid[])
      OR cutting_job_id = $2;
    `, [garmentIds, cuttingJobId]);
    console.log(`8. Deleted from garment_material_inputs: ${delGMI.rowCount} row(s)`);

    // 9. Garment Holds, Returns & Work Tasks
    await client.query(`DELETE FROM supplyease.garment_holds WHERE garment_id = ANY($1::uuid[]);`, [garmentIds]);
    await client.query(`DELETE FROM supplyease.garment_returns WHERE garment_id = ANY($1::uuid[]);`, [garmentIds]);
    await client.query(`DELETE FROM supplyease.work_tasks WHERE garment_id = ANY($1::uuid[]);`, [garmentIds]);
    console.log(`9. Checked and cleared any garment holds, returns, work tasks.`);

    // 10. Garments
    const delGarments = await client.query(`
      DELETE FROM supplyease.garments 
      WHERE id = ANY($1::uuid[]);
    `, [garmentIds]);
    console.log(`10. Deleted from garments: ${delGarments.rowCount} row(s)`);

    // 11. Cutting Source Selections
    const delCSS = await client.query(`
      DELETE FROM supplyease.cutting_source_selections 
      WHERE cutting_job_id = $1;
    `, [cuttingJobId]);
    console.log(`11. Deleted from cutting_source_selections: ${delCSS.rowCount} row(s)`);

    // 12. Cutting Inputs
    const delCI = await client.query(`
      DELETE FROM supplyease.cutting_inputs 
      WHERE cutting_job_id = $1 
      OR production_order_id = $2;
    `, [cuttingJobId, orderId]);
    console.log(`12. Deleted from cutting_inputs: ${delCI.rowCount} row(s)`);

    // 13. Cutting Jobs
    const delCJ = await client.query(`
      DELETE FROM supplyease.cutting_jobs 
      WHERE id = $1 
      OR production_order_id = $2;
    `, [cuttingJobId, orderId]);
    console.log(`13. Deleted from cutting_jobs: ${delCJ.rowCount} row(s)`);

    // 14. Material Stock Movements
    const delMSM = await client.query(`
      DELETE FROM supplyease.material_stock_movements 
      WHERE production_order_id = $1;
    `, [orderId]);
    console.log(`14. Deleted from material_stock_movements: ${delMSM.rowCount} row(s)`);

    // 15. Restore Material Lot Available Quantity
    const updateLot = await client.query(`
      UPDATE supplyease.material_lots 
      SET available_accepted_quantity = received_quantity 
      WHERE id = $1;
    `, [lotId]);
    console.log(`15. Restored available quantity on material lot FAB-002: ${updateLot.rowCount} row(s) updated to 250.000m`);

    // 16. Production Order
    const delOrder = await client.query(`
      DELETE FROM supplyease.production_orders 
      WHERE id = $1;
    `, [orderId]);
    console.log(`16. Deleted from production_orders: ${delOrder.rowCount} row(s)`);

    // 17. Product Spec Version ("red chaddi")
    const delSpec = await client.query(`
      DELETE FROM supplyease.product_spec_versions 
      WHERE id = $1;
    `, [specId]);
    console.log(`17. Deleted from product_spec_versions: ${delSpec.rowCount} row(s)`);

    // 18. Audit Events
    const delAudit = await client.query(`
      DELETE FROM supplyease.audit_events 
      WHERE target_reference IN ('ORDER-023', $1, $2, $3, $4)
      OR details::text ILIKE $5
      OR details::text ILIKE '%ORDER-023%';
    `, [orderId, cuttingJobId, garmentIds[0], garmentIds[1], `%${tagUid}%`]);
    console.log(`18. Deleted from audit_events: ${delAudit.rowCount} row(s)`);

    await client.query("SET session_replication_role = 'origin';");
    await client.query("COMMIT;");
    console.log("\n==================================================");
    console.log(" [SUCCESS] Purge completed & committed cleanly!");
    console.log("==================================================");

  } catch (err) {
    console.error("\n[ERROR] Transaction failed, rolling back:", err);
    try {
      await client.query("ROLLBACK;");
      await client.query("SET session_replication_role = 'origin';");
    } catch {}
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
