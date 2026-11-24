import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

async function main() {
  console.log("==================================================");
  console.log(" WearTrail: Resetting All Tags & Blockchain Data");
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
    console.log("1. Setting session_replication_role = 'replica'...");
    await client.query("SET session_replication_role = 'replica';");

    console.log("2. Deleting all RFID scans from supplyease.rfid_scans...");
    const deletedScans = await client.query("DELETE FROM supplyease.rfid_scans;");
    console.log(`   Deleted ${deletedScans.rowCount} scans`);

    console.log("3. Deleting all action contexts from supplyease.rfid_action_contexts...");
    const deletedContexts = await client.query("DELETE FROM supplyease.rfid_action_contexts;");
    console.log(`   Deleted ${deletedContexts.rowCount} action contexts`);

    console.log("4. Deleting all tag bindings from supplyease.rfid_tag_bindings...");
    const deletedBindings = await client.query("DELETE FROM supplyease.rfid_tag_bindings;");
    console.log(`   Deleted ${deletedBindings.rowCount} tag bindings`);

    console.log("5. Deleting all blockchain transactions from supplyease.ledger_transactions...");
    const deletedTx = await client.query("DELETE FROM supplyease.ledger_transactions;");
    console.log(`   Deleted ${deletedTx.rowCount} ledger transactions`);

    console.log("6. Deleting all blockchain outbox items from supplyease.ledger_outbox...");
    const deletedOutbox = await client.query("DELETE FROM supplyease.ledger_outbox;");
    console.log(`   Deleted ${deletedOutbox.rowCount} ledger outbox items`);

    console.log("7. Deleting all blockchain commitments from supplyease.ledger_commitments...");
    const deletedCommitments = await client.query("DELETE FROM supplyease.ledger_commitments;");
    console.log(`   Deleted ${deletedCommitments.rowCount} ledger commitments`);

    console.log("8. Deleting public payload versions & lookup buckets...");
    const deletedPublic = await client.query("DELETE FROM supplyease.public_payload_versions;");
    const deletedBuckets = await client.query("DELETE FROM supplyease.public_lookup_buckets;");
    console.log(`   Deleted ${deletedPublic.rowCount} public payloads, ${deletedBuckets.rowCount} lookup buckets`);

    console.log("9. Deleting trace events from supplyease.trace_events...");
    const deletedTraces = await client.query("DELETE FROM supplyease.trace_events;");
    console.log(`   Deleted ${deletedTraces.rowCount} trace events`);

    console.log("10. Restoring session_replication_role = 'origin'...");
    await client.query("SET session_replication_role = 'origin';");

    console.log("\n11. Verifying final table counts in database:");
    const finalCounts = await client.query(`
      SELECT 
        (SELECT count(*) FROM supplyease.rfid_tag_bindings) as tag_bindings,
        (SELECT count(*) FROM supplyease.rfid_scans) as scans,
        (SELECT count(*) FROM supplyease.rfid_action_contexts) as contexts,
        (SELECT count(*) FROM supplyease.ledger_commitments) as commitments,
        (SELECT count(*) FROM supplyease.ledger_outbox) as outbox,
        (SELECT count(*) FROM supplyease.ledger_transactions) as transactions,
        (SELECT count(*) FROM supplyease.public_payload_versions) as public_payloads,
        (SELECT count(*) FROM supplyease.trace_events) as trace_events
    `);
    console.log(finalCounts.rows[0]);

    console.log("\n==================================================");
    console.log(" [SUCCESS] Database tag and blockchain tables cleared!");
    console.log("==================================================");
  } catch (err) {
    console.error("\n[ERROR] Failed to clear tables:", err);
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
