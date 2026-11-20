/**
 * WearTrail Pre-Flash Full Compliance & Live Integration Verifier.
 *
 * Verifies live operations against running services:
 * 1. Blockchain live verification (RPC 8545, chainId 31337, deployed bytecode, on-chain write + receipt + lookup).
 * 2. Live HTTP API ingestion (port 4000) using provisioned device credential from firmware/WearTrailRFID/config.h.
 * 3. Workstation context handling & automatic session-bound resolution.
 * 4. Queued scan protection (queued scan taken before context arming cannot steal new context).
 * 5. Durable idempotency: identical retry -> 200 duplicate (no second mutation), conflicting reuse -> 409 conflict.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { prisma, disconnectPrisma } from "../src/server/db/client";
import { openReaderSession, closeReaderSession } from "./manage-reader-session";
import { getOrCreateChecklistVersion } from "../src/server/quality/quality-service";
import { getActiveLedgerDeployment, createInternalCommitment } from "../src/server/ledger/commitment-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const BACKEND_URL = process.env["WEARTRAIL_API_URL"] || "http://localhost:4000";
const RPC_URL = process.env["BLOCKCHAIN_RPC_URL"] || "http://127.0.0.1:8545";
const HARDWARE_DEVICE_CODE = "DEV-TEXTRACER-01";

function readDeviceSecretFromConfig(): string {
  const configPath = path.resolve(process.cwd(), "firmware", "WearTrailRFID", "config.h");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Firmware config not found at ${configPath}. Run 'npm run hardware:provision' first.`);
  }
  const content = fs.readFileSync(configPath, "utf8");
  const match = content.match(/#define\s+DEVICE_SECRET\s+"([^"]+)"/);
  if (!match || !match[1] || match[1] === "REPLACE_WITH_DEVICE_SECRET") {
    throw new Error("Valid DEVICE_SECRET not found in firmware/WearTrailRFID/config.h.");
  }
  return match[1];
}

async function main() {
  console.log("============================================================");
  console.log("  WearTrail Pre-Flash Verification & Live Service Audit");
  console.log("============================================================\n");

  const deviceSecret = readDeviceSecretFromConfig();
  console.log("[CONFIG] Loaded provisioned device secret from firmware/WearTrailRFID/config.h (redacted).");

  // ------------------------------------------------------------------------
  // PART 1: BLOCKCHAIN STARTUP & ON-CHAIN COMMITMENT VERIFICATION
  // ------------------------------------------------------------------------
  console.log("\n--- [PART 1/3] Blockchain RPC & On-Chain Verification ---");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  console.log(`[BLOCKCHAIN] Connected to RPC: ${RPC_URL}`);
  console.log(`[BLOCKCHAIN] Chain ID:        ${network.chainId} (Expected: 31337)`);

  if (Number(network.chainId) !== 31337) {
    throw new Error(`Unexpected chain ID: ${network.chainId}`);
  }

  let deployment = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      deployment = await getActiveLedgerDeployment(prisma);
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`[BLOCKCHAIN] DB lookup attempt ${attempt} failed, retrying in 1s...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const contractAddress = "0x" + Buffer.from(deployment!.contract_address).toString("hex");
  console.log(`[BLOCKCHAIN] Registered Code:  ${deployment!.code}`);
  console.log(`[BLOCKCHAIN] Contract Address: ${contractAddress}`);

  const code = await provider.getCode(contractAddress);
  if (!code || code === "0x" || code === "0x0") {
    throw new Error(`No contract bytecode found at '${contractAddress}' on chain 31337.`);
  }
  console.log(`[BLOCKCHAIN] Deployed Bytecode: Verified (${code.length / 2 - 1} bytes)`);

  // Direct contract interaction
  const signer = await provider.getSigner(0);
  const contractAbi = [
    "function recordCommitment(bytes32 commitmentId, bytes32 payloadHash) external returns (bool)",
    "function hasCommitment(bytes32 commitmentId) external view returns (bool)",
    "function getCommitment(bytes32 commitmentId) external view returns (bytes32 payloadHash, uint64 blockNumber, uint64 blockTimestamp)",
  ];
  const contract = new ethers.Contract(contractAddress, contractAbi, signer);

  const testCommitmentId = "0x" + crypto.randomBytes(32).toString("hex");
  const testPayloadHash = "0x" + crypto.createHash("sha256").update("preflash-verification-payload").digest("hex");

  console.log(`[BLOCKCHAIN] Broadcasting development commitment to smart contract...`);
  const anyContract = contract as any;
  const tx = await anyContract.recordCommitment(testCommitmentId, testPayloadHash);
  const receipt = await tx.wait();
  console.log(`[BLOCKCHAIN] Transaction confirmed in block #${receipt.blockNumber}!`);
  console.log(`[BLOCKCHAIN] Tx Hash:   ${receipt.hash}`);
  console.log(`[BLOCKCHAIN] Gas Used:  ${receipt.gasUsed.toString()}`);

  const onChainExists = await anyContract.hasCommitment(testCommitmentId);
  const [retrievedHash, blockNum, blockTs] = await anyContract.getCommitment(testCommitmentId);
  console.log(`[BLOCKCHAIN] On-Chain Lookup: exists=${onChainExists}, retrievedHash=${retrievedHash}`);
  if (!onChainExists || retrievedHash.toLowerCase() !== testPayloadHash.toLowerCase()) {
    throw new Error("On-chain verification failed: retrieved hash does not match broadcasted hash.");
  }
  console.log("[BLOCKCHAIN] Verified: Contract deployment, transaction receipt, and on-chain lookup match 100%.");

  // ------------------------------------------------------------------------
  // PART 2: LIVE HTTP SCAN INGESTION & WORKSTATION RESOLUTION
  // ------------------------------------------------------------------------
  console.log("\n--- [PART 2/3] Live RFID Ingestion & Business Mutations ---");

  // Check /ready probe
  const readyRes = await fetch(`${BACKEND_URL}/ready`);
  const readyJson = await readyRes.json();
  console.log(`[PROBE] GET /ready: status=${readyRes.status}, data=${JSON.stringify(readyJson.data)}`);

  const device = await prisma.devices.findUnique({ where: { code: HARDWARE_DEVICE_CODE } });
  if (!device) throw new Error("Device not found.");

  // Open an operator session for cutting (Reader 3) and stitching (Reader 6)
  await closeReaderSession("cutting").catch(() => {});
  await closeReaderSession("stitching").catch(() => {});
  await closeReaderSession("final_qc").catch(() => {});

  const cuttingSession = await openReaderSession({ stationCode: "cutting", username: "cutting.demo" });
  const stitchingSession = await openReaderSession({ stationCode: "stitching", username: "stitching.demo" });
  const qcSession = await openReaderSession({ stationCode: "final_qc", username: "qc.demo" });
  console.log(`[SESSION] Active session cutting:   ${cuttingSession.sessionId}`);
  console.log(`[SESSION] Active session stitching: ${stitchingSession.sessionId}`);
  console.log(`[SESSION] Active session final_qc:  ${qcSession.sessionId}`);

  // Find an existing garment at stage 'cut' with an active tag binding
  let garment = await prisma.garments.findFirst({
    where: { stage: "cut", rfid_tag_bindings: { unbound_at: null } },
    include: { rfid_tag_bindings: true },
    orderBy: { created_at: "desc" },
  });

  if (!garment || !garment.rfid_tag_bindings) {
    // If none at stage 'cut', reset one of our preflash garments back to 'cut'
    const resetGarment = await prisma.garments.findFirst({
      where: { code: { startsWith: "GAR-PREFLASH" }, rfid_tag_bindings: { unbound_at: null } },
      include: { rfid_tag_bindings: true },
    });
    if (resetGarment) {
      await prisma.garments.update({
        where: { id: resetGarment.id },
        data: { stage: "cut", quality_disposition: "awaiting_inspection" },
      });
      garment = resetGarment;
    }
  }

  if (!garment || !garment.rfid_tag_bindings) {
    throw new Error("No garment at stage 'cut' found with an active tag binding.");
  }

  const liveTagUid = garment.rfid_tag_bindings.tag_uid;
  console.log(`[SEED] Selected test garment '${garment.code}' (stage: cut) bound to UID '${liveTagUid}'.`);

  // Realistic ESP32 boot cycle simulation: each boot has a fresh bootId and monotonic sequence
  const simBootId = `boot-sim-${Date.now().toString(16)}`;
  let simSeq = 1;

  // Scan at Stitching (readerIndex 6, SS GPIO 5) - Routine scan without explicit context
  const stitchScanId = `${simBootId}:${simSeq}`;
  const stitchEnvelope = {
    version: "v1",
    deviceId: device.id,
    scanId: stitchScanId,
    bootId: simBootId,
    sequence: simSeq++,
    readerIndex: 6, // GPIO 5 -> stitching
    mappingVersion: 1,
    tagUid: liveTagUid,
    actionContextId: null,
    deviceUptimeMs: 25000,
    timestamp: new Date().toISOString(),
  };

  console.log(`[SCAN 1] POST /api/rfid/scan at Stitching (readerIndex 6, routine progression)...`);
  const stitchRes = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Secret": deviceSecret,
    },
    body: JSON.stringify(stitchEnvelope),
  });
  const stitchBody = await stitchRes.json();
  console.log(`         HTTP Status: ${stitchRes.status}, Outcome: ${stitchBody.data?.outcome}, Stage: ${stitchBody.data?.outcomeCode}`);
  if (stitchRes.status !== 200 || stitchBody.data?.outcome !== "accepted") {
    throw new Error(`Stitching scan failed: ${JSON.stringify(stitchBody)}`);
  }

  const garmentStitched = await prisma.garments.findUnique({ where: { id: garment.id } });
  if (garmentStitched?.stage !== "stitched") {
    throw new Error(`Garment stage after stitching was '${garmentStitched?.stage}', expected 'stitched'.`);
  }
  console.log(`[DB VERIFIED] Garment stage advanced to 'stitched'.`);

  // ------------------------------------------------------------------------
  // PART 3: IDEMPOTENCY, REPLAY, CONFLICTS, & QUEUED CONTEXT ISOLATION
  // ------------------------------------------------------------------------
  console.log("\n--- [PART 3/3] Durable Idempotency, 409 Conflicts, & Queued Scan Isolation ---");

  // Test 1: Identical replay of the stitching scan
  console.log("[REPLAY TEST] Re-transmitting identical stitching envelope with same scanId...");
  const replayRes = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Secret": deviceSecret,
    },
    body: JSON.stringify(stitchEnvelope),
  });
  const replayBody = await replayRes.json();
  console.log(`              HTTP Status: ${replayRes.status}, isDuplicate: ${replayBody.data?.isDuplicate}`);
  if (replayRes.status !== 200 || !replayBody.data?.isDuplicate) {
    throw new Error(`Replay failed to return idempotent 200 duplicate: ${JSON.stringify(replayBody)}`);
  }
  console.log("[PASS] Identical retry returned HTTP 200 duplicate cleanly with no second mutation.");

  // Test 2: Conflicting reuse of same scanId with different tagUid
  console.log("[CONFLICT TEST] Sending conflicting scan using same scanId with altered tagUid...");
  const conflictEnvelope = { ...stitchEnvelope, tagUid: "A1B2C3D4E5F6AA" };
  const conflictRes = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Secret": deviceSecret,
    },
    body: JSON.stringify(conflictEnvelope),
  });
  const conflictBody = await conflictRes.json();
  console.log(`                HTTP Status: ${conflictRes.status}, Error Code: ${conflictBody.error?.code}`);
  if (conflictRes.status !== 409 || conflictBody.error?.code !== "WT_ERR_SCAN_CONFLICT") {
    throw new Error(`Conflict test expected 409 WT_ERR_SCAN_CONFLICT, got: ${conflictRes.status} ${JSON.stringify(conflictBody)}`);
  }
  console.log("[PASS] Conflicting payload identity reuse rejected with HTTP 409 WT_ERR_SCAN_CONFLICT.");

  // Advance garment to 'finished' so final_qc stage checks pass and isolation is isolated to context rules
  await prisma.garments.update({
    where: { id: garment.id },
    data: { stage: "finished" },
  });

  // Test 3: Queued scan race condition tests at Final QC (Reader 2)
  // First arm an active QA context now (T = now)
  console.log("[QUEUE ISOLATION TEST] Arming QA context at T = now...");
  const chk = await getOrCreateChecklistVersion(prisma as any, "final", qcSession.operatorId);
  const contextArmTime = Date.now();
  const recentQcContext = await prisma.rfid_action_contexts.create({
    data: {
      reader_session_id: qcSession.sessionId,
      action_code: "submit_qc",
      status: "awaiting_ack",
      qc_scope: "final",
      checklist_version_id: chk.id,
      qc_outcome: "pass",
      answers: { visual: true, seams: true },
      expires_at: new Date(Date.now() + 300000),
      notes: "Newly armed context for future scan",
    },
  });

  await prisma.rfid_action_contexts.update({
    where: { id: recentQcContext.id },
    data: { status: "armed", acknowledged_at: new Date(contextArmTime) },
  });

  // Test 3A: Scan captured 1 second before context was created/armed (context created 1s after scan)
  console.log("[QUEUE ISOLATION TEST 3A] Testing scan captured 1 second before context creation...");
  const envelope1sBefore = {
    version: "v1",
    deviceId: device.id,
    scanId: `${simBootId}:${simSeq++}`,
    bootId: simBootId,
    sequence: simSeq,
    readerIndex: 2,
    mappingVersion: 1,
    tagUid: liveTagUid,
    actionContextId: null,
    timestamp: new Date(contextArmTime - 1000).toISOString(),
  };
  const res1s = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Secret": deviceSecret },
    body: JSON.stringify(envelope1sBefore),
  });
  const body1s = await res1s.json();
  if (res1s.status !== 400 || body1s.error?.code !== "WT_ERR_CONTEXT_REQUIRED") {
    throw new Error(`Expected 400 WT_ERR_CONTEXT_REQUIRED for 1s-prior scan, got: ${res1s.status} ${JSON.stringify(body1s)}`);
  }
  console.log("                         HTTP Status: 400, Error Code: WT_ERR_CONTEXT_REQUIRED (Passed)");

  // Test 3B: Scan captured 4 seconds before context was created/armed (context created 4s after scan)
  console.log("[QUEUE ISOLATION TEST 3B] Testing scan captured 4 seconds before context creation...");
  const envelope4sBefore = {
    version: "v1",
    deviceId: device.id,
    scanId: `${simBootId}:${simSeq++}`,
    bootId: simBootId,
    sequence: simSeq,
    readerIndex: 2,
    mappingVersion: 1,
    tagUid: liveTagUid,
    actionContextId: null,
    timestamp: new Date(contextArmTime - 4000).toISOString(),
  };
  const res4s = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Secret": deviceSecret },
    body: JSON.stringify(envelope4sBefore),
  });
  const body4s = await res4s.json();
  if (res4s.status !== 400 || body4s.error?.code !== "WT_ERR_CONTEXT_REQUIRED") {
    throw new Error(`Expected 400 WT_ERR_CONTEXT_REQUIRED for 4s-prior scan, got: ${res4s.status} ${JSON.stringify(body4s)}`);
  }
  console.log("                         HTTP Status: 400, Error Code: WT_ERR_CONTEXT_REQUIRED (Passed)");

  // Test 3C: Scan captured without synchronized device time (timestamp undefined)
  console.log("[QUEUE ISOLATION TEST 3C] Testing scan captured without synchronized device time...");
  const envelopeUnsynced = {
    version: "v1",
    deviceId: device.id,
    scanId: `${simBootId}:${simSeq++}`,
    bootId: simBootId,
    sequence: simSeq,
    readerIndex: 2,
    mappingVersion: 1,
    tagUid: liveTagUid,
    actionContextId: null,
    // timestamp omitted
  };
  const resUnsynced = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Secret": deviceSecret },
    body: JSON.stringify(envelopeUnsynced),
  });
  const bodyUnsynced = await resUnsynced.json();
  if (resUnsynced.status !== 400 || bodyUnsynced.error?.code !== "WT_ERR_CONTEXT_REQUIRED") {
    throw new Error(`Expected 400 WT_ERR_CONTEXT_REQUIRED for unsynchronized scan, got: ${resUnsynced.status} ${JSON.stringify(bodyUnsynced)}`);
  }
  console.log("                         HTTP Status: 400, Error Code: WT_ERR_CONTEXT_REQUIRED (Passed)");

  // Confirm the recently armed context was NOT consumed by any of these tests!
  const checkContext = await prisma.rfid_action_contexts.findUnique({
    where: { id: recentQcContext.id },
  });
  if (checkContext?.status !== "armed" || checkContext.closed_at !== null) {
    throw new Error(`Security breach: Prior scan consumed a newly armed context! Status is '${checkContext?.status}'`);
  }
  console.log("[PASS] Queued scan isolation fully verified across 1s, 4s, and unsynchronized scans.");

  // Test 4: Real-time scan with actionContextId: null consumes the active armed context properly
  console.log("[ACTIVE CONTEXT TEST] Transmitting fresh real-time scan with actionContextId: null...");
  // Advance garment to 'finished' first so final_qc allows it
  await prisma.garments.update({
    where: { id: garment.id },
    data: { stage: "finished" },
  });

  const freshQcEnvelope = {
    version: "v1",
    deviceId: device.id,
    scanId: `${simBootId}:${simSeq}`,
    bootId: simBootId,
    sequence: simSeq++,
    readerIndex: 2, // GPIO 15 -> final_qc
    mappingVersion: 1,
    tagUid: liveTagUid,
    actionContextId: null, // Physical device sends null; backend auto-binds to session's armed context
    timestamp: new Date().toISOString(),
  };

  const liveQcRes = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Secret": deviceSecret,
    },
    body: JSON.stringify(freshQcEnvelope),
  });
  const liveQcBody = await liveQcRes.json();
  console.log(`                      HTTP Status: ${liveQcRes.status}, Outcome: ${liveQcBody.data?.outcome}, Disposition: ${liveQcBody.data?.qualityDisposition}`);
  if (liveQcRes.status !== 200 || liveQcBody.data?.outcome !== "accepted") {
    throw new Error(`Live QC scan failed: ${JSON.stringify(liveQcBody)}`);
  }

  const consumedContext = await prisma.rfid_action_contexts.findUnique({
    where: { id: recentQcContext.id },
  });
  if (consumedContext?.status !== "consumed" || !consumedContext.closed_at) {
    throw new Error(`Context was not consumed after scan: status=${consumedContext?.status}`);
  }
  console.log("[PASS] Automatic session context resolution consumed the context properly on real-time scan.");

  console.log("\n============================================================");
  console.log("  ALL PRE-FLASH COMPLIANCE CHECKS PASSED WITH 100% SUCCESS");
  console.log("============================================================\n");
}

main()
  .catch((err) => {
    console.error("FATAL ERROR during pre-flash verification:", err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
