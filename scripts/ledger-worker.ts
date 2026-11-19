import * as dotenv from "dotenv";
dotenv.config();

import { LedgerOutboxWorker } from "../src/server/ledger/outbox-worker";
import { getActiveLedgerDeployment } from "../src/server/ledger/commitment-service";
import { getPrismaClient } from "../src/server/db/client";

async function main() {
  console.log("==================================================");
  console.log(" WearTrail Ledger Outbox Worker Daemon");
  console.log("==================================================");

  const db = getPrismaClient();

  // Validate active deployment exists in database before startup
  let deployment;
  try {
    deployment = await getActiveLedgerDeployment(db);
    console.log(`Active Deployment:    ${deployment.code}`);
    console.log(`Chain ID:             ${deployment.chain_id}`);
    console.log(`Contract Address:     0x${Buffer.from(deployment.contract_address).toString("hex")}`);
    console.log(`Protocol Version:     ${deployment.protocol_version}`);
  } catch (error: any) {
    console.error(`FATAL: Could not resolve active ledger deployment: ${error.message}`);
    console.error("Please run 'npm run blockchain:register' first.");
    process.exit(1);
  }

  const rpcUrl =
    process.env["LEDGER_RPC_URL"] ??
    process.env["BLOCKCHAIN_RPC_URL"] ??
    "http://127.0.0.1:8545";

  const signerKey =
    process.env["LEDGER_SIGNER_KEY"] ??
    process.env["LEDGER_WRITER_PRIVATE_KEY"] ??
    process.env["BLOCKCHAIN_WRITER_PRIVATE_KEY"] ??
    // Default Hardhat local development account #0
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const pollIntervalMs = parseInt(process.env["WORKER_POLL_INTERVAL_MS"] ?? "2000", 10);
  const batchSize = parseInt(process.env["WORKER_BATCH_SIZE"] ?? "10", 10);
  const requiredConfirmations = parseInt(process.env["CONFIRMATION_BLOCKS"] ?? "1", 10);
  const leaseDurationSeconds = parseInt(process.env["LEASE_DURATION_SECONDS"] ?? "60", 10);

  console.log(`RPC Provider URL:     ${rpcUrl}`);
  console.log(`Signer Configured:    ${signerKey ? "Yes (Private Key Configured)" : "No"}`);
  console.log(`Batch Size:           ${batchSize} jobs/lease`);
  console.log(`Poll Interval:        ${pollIntervalMs} ms`);
  console.log(`Confirmations Policy: ${requiredConfirmations} block(s)`);
  console.log(`Lease Duration:       ${leaseDurationSeconds} seconds`);

  const worker = new LedgerOutboxWorker({
    db,
    rpcUrl,
    signerPrivateKey: signerKey,
    batchSize,
    pollIntervalMs,
    requiredConfirmations,
    leaseDurationSeconds,
  });

  console.log(`\nWorker ID initialized: ${worker.getWorkerId()}`);

  // Validate blockchain connection and contract deployment
  try {
    const { chainId } = await worker.initBlockchain();
    console.log(`[CONNECTED] Connected to blockchain network with Chain ID: ${chainId}`);
    console.log("[READY] Verified contract deployment and bytecode.");
  } catch (err: any) {
    console.warn(`[WARN] Blockchain pre-check encountered issue: ${err.message}`);
    console.warn("[WARN] Worker will start and retry pending jobs once chain/RPC is available.");
  }

  // Graceful shutdown handling
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
    await worker.stop();
    console.log("Worker stopped cleanly. Exiting.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("\nStarting worker polling loop. Press Ctrl+C to stop.");
  worker.start();
}

main().catch((err) => {
  console.error("Unhandled worker error:", err);
  process.exit(1);
});
