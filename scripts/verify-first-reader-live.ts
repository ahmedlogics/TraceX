/**
 * WearTrail First-Reader (Final QC - Antenna 2 / GPIO 15) Live Integration Verifier.
 *
 * Exercises the complete hardware-to-backend pipeline against the live Express server (port 4000)
 * and PostgreSQL database:
 * 1. Device identity & credential verification (DEV-TEXTRACER-01)
 * 2. Active operator session check for station 'final_qc' (reader index 2)
 * 3. Preparation & arming of an action context
 * 4. Device polling GET /api/rfid/context/active with X-Device-Secret
 * 5. Device acknowledgement POST /api/rfid/device/contexts/:id/ack
 * 6. Hardware scan submission POST /api/rfid/scan with VersionedScanEnvelope v1
 * 7. Deduplication & idempotent replay check
 * 8. Authoritative database state verification (rfid_scans, inspections, action context consumed)
 */
import crypto from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { prisma, disconnectPrisma } from "../src/server/db/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const BACKEND_URL = process.env["WEARTRAIL_API_URL"] || "http://localhost:4000";
const DEVICE_CODE = "DEV-TEXTRACER-01";
const DEVICE_ID = "26ee6645-9da8-49b3-8e88-feb5707adce6";
const DEVICE_SECRET = "wt_dev_secret_692d5e130930316e16edaa39ac2bd5fa";
const READER_INDEX = 5; // Antenna 5 (GPIO 16 - Final QA Gate)
const STATION_CODE = "final_qc";
const TEST_TAG_UID = "04A1B2C3D4E5F6";

async function runLiveVerification(): Promise<void> {
  console.log("==================================================");
  console.log(" WearTrail First-Reader Live Integration Verifier");
  console.log(` Target Server:  ${BACKEND_URL}`);
  console.log(` Device Code:    ${DEVICE_CODE} (${DEVICE_ID})`);
  console.log(` Reader Index:   ${READER_INDEX} -> Station '${STATION_CODE}'`);
  console.log("==================================================\n");

  // Step 1: Verify Device & Active Session in Database
  console.log("[1/7] Checking hardware device and active reader session...");
  const device = await prisma.devices.findUnique({
    where: { code: DEVICE_CODE },
  });

  if (!device) {
    throw new Error(`Device '${DEVICE_CODE}' not found in database. Run 'npm run hardware:provision' first.`);
  }

  const activeMapping = await prisma.device_reader_mappings.findFirst({
    where: {
      device_id: device.id,
      reader_index: READER_INDEX,
      device_mapping_versions: {
        activated_at: { not: null },
        retired_at: null,
      },
    },
  });

  if (!activeMapping || activeMapping.station_code !== STATION_CODE) {
    throw new Error(
      `Reader index ${READER_INDEX} is not mapped to '${STATION_CODE}' (found: ${activeMapping?.station_code}).`,
    );
  }
  console.log(`✓ Hardware device provisioned and Reader ${READER_INDEX} mapped to '${STATION_CODE}'.`);

  // Step 2: Ensure an active operator reader session exists
  let session = await prisma.reader_sessions.findFirst({
    where: {
      device_id: device.id,
      reader_index: READER_INDEX,
      closed_at: null,
      expires_at: { gt: new Date() },
    },
  });

  if (!session) {
    console.log(`No active session found for Reader ${READER_INDEX}. Creating a live test session...`);
    const qcUser = await prisma.staff_users.findFirst({
      where: { username: "qc.demo" },
    });
    if (!qcUser) {
      throw new Error("Staff user 'qc.demo' not found.");
    }

    let staffSession = await prisma.staff_sessions.findFirst({
      where: { staff_user_id: qcUser.id, revoked_at: null },
    });
    if (!staffSession) {
      staffSession = await prisma.staff_sessions.create({
        data: {
          staff_user_id: qcUser.id,
          token_digest: new Uint8Array(crypto.randomBytes(32)),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });
    }

    session = await prisma.reader_sessions.create({
      data: {
        device_id: device.id,
        mapping_version: activeMapping.mapping_version,
        reader_index: READER_INDEX,
        station_code: STATION_CODE,
        staff_session_id: staffSession.id,
        operator_id: qcUser.id,
        expires_at: new Date(Date.now() + 8 * 3600 * 1000),
      },
    });
  }
  console.log(`✓ Active reader session confirmed: ${session.id} (Operator: ${session.operator_id})`);

  // Step 3: Ensure test garment is in 'finished' stage with binding
  console.log("\n[2/7] Preparing garment and binding for Final QC...");
  let binding = await prisma.rfid_tag_bindings.findFirst({
    where: { tag_identifier: TEST_TAG_UID, unbound_at: null },
    include: { garments: true },
  });

  if (!binding || !binding.garment_id) {
    throw new Error(`Tag UID '${TEST_TAG_UID}' is not bound to a garment.`);
  }

  // Set garment stage to 'finished' so it passes FinalQcScanHandler validation
  const previousStage = binding.garments?.stage;
  await prisma.garments.update({
    where: { id: binding.garment_id },
    data: { stage: "finished" },
  });
  console.log(`✓ Garment ${binding.garments?.code} set to stage 'finished' (previous: ${previousStage}).`);

  // Step 4: Arm an action context for final_qc
  console.log("\n[3/7] Arming Action Context for Final QC workstation...");
  // Close any stale unconsumed contexts for this session
  await prisma.rfid_action_contexts.updateMany({
    where: { reader_session_id: session.id, closed_at: null },
    data: { status: "cancelled", closed_at: new Date(), close_reason: "Replaced for live test verification" },
  });

  const checklist = await prisma.checklist_versions.findFirst({
    where: { scope: "final" },
    orderBy: { approved_at: "desc" },
  });

  const actionContext = await prisma.rfid_action_contexts.create({
    data: {
      reader_session_id: session.id,
      action_code: "submit_qc",
      status: "awaiting_ack",
      qc_scope: "final",
      checklist_version_id: checklist?.id ?? null,
      qc_outcome: "pass",
      answers: { visual: "clean", stitching: "intact", measurements: "within_spec" },
      notes: "Hardware automated integration test verification",
      expires_at: new Date(Date.now() + 600 * 1000), // 10 minutes
    },
  });
  console.log(`✓ Action context created: ${actionContext.id} (status: awaiting_ack, outcome: pass)`);

  // Step 5: Device HTTP Polling (GET /api/rfid/context/active?readerIndex=2)
  console.log("\n[4/7] Simulating ESP32 HTTP Polling: GET /api/rfid/context/active...");
  const pollRes = await fetch(`${BACKEND_URL}/api/rfid/context/active?readerIndex=${READER_INDEX}`, {
    headers: {
      "X-Device-Id": DEVICE_ID,
      "X-Device-Secret": DEVICE_SECRET,
      "Accept": "application/json",
    },
  });

  if (!pollRes.ok) {
    const errText = await pollRes.text();
    throw new Error(`Device polling failed (${pollRes.status}): ${errText}`);
  }

  const pollData = (await pollRes.json()) as any;
  console.log(`✓ Device Poll Response:`, JSON.stringify(pollData.data));
  if (!pollData.data?.active || pollData.data?.contextId !== actionContext.id) {
    throw new Error(`Device poll did not return expected context ${actionContext.id}.`);
  }

  // Step 6: Device Acknowledges Action Context (POST /api/rfid/device/contexts/:id/ack)
  console.log("\n[5/7] Simulating ESP32 Device ACK: POST /api/rfid/device/contexts/:id/ack...");
  const ackRes = await fetch(`${BACKEND_URL}/api/rfid/device/contexts/${actionContext.id}/ack`, {
    method: "POST",
    headers: {
      "X-Device-Id": DEVICE_ID,
      "X-Device-Secret": DEVICE_SECRET,
      "Accept": "application/json",
    },
  });

  if (!ackRes.ok) {
    const errText = await ackRes.text();
    throw new Error(`Device ACK failed (${ackRes.status}): ${errText}`);
  }
  const ackData = (await ackRes.json()) as any;
  console.log(`✓ Device ACK Response:`, JSON.stringify(ackData.data));

  // Verify DB status transitioned to 'armed'
  const contextAfterAck = await prisma.rfid_action_contexts.findUnique({
    where: { id: actionContext.id },
  });
  if (contextAfterAck?.status !== "armed") {
    throw new Error(`Context status after ACK is '${contextAfterAck?.status}', expected 'armed'.`);
  }
  console.log(`✓ Database confirms context status is now 'armed'.`);

  // Step 7: Hardware Scan Ingestion (POST /api/rfid/scan)
  console.log("\n[6/7] Simulating ESP32 Scan Ingestion: POST /api/rfid/scan...");
  const scanId = crypto.randomUUID();
  const scanEnvelope = {
    version: "v1",
    deviceId: DEVICE_ID,
    scanId,
    bootId: `boot-esp32-live-${Date.now().toString(36)}`,
    sequence: 1,
    readerIndex: READER_INDEX,
    mappingVersion: activeMapping.mapping_version,
    tagUid: TEST_TAG_UID,
    actionContextId: actionContext.id,
    deviceUptimeMs: 45000,
  };

  const scanRes = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Secret": DEVICE_SECRET,
      "X-Device-Id": DEVICE_ID,
      "Accept": "application/json",
    },
    body: JSON.stringify(scanEnvelope),
  });

  if (!scanRes.ok) {
    const errText = await scanRes.text();
    throw new Error(`Scan ingestion failed (${scanRes.status}): ${errText}`);
  }

  const scanData = (await scanRes.json()) as any;
  console.log(`✓ Scan Ingestion Response:`, JSON.stringify(scanData.data));
  if (scanData.data?.outcome !== "accepted") {
    throw new Error(`Scan was rejected: ${scanData.data?.outcomeMessage}`);
  }

  // Step 8: Deduplication / Idempotent Retry Test
  console.log("\n[7/7] Testing Bounded FIFO Replay / Deduplication (resending exact same envelope)...");
  const retryRes = await fetch(`${BACKEND_URL}/api/rfid/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Secret": DEVICE_SECRET,
      "X-Device-Id": DEVICE_ID,
      "Accept": "application/json",
    },
    body: JSON.stringify(scanEnvelope),
  });

  if (!retryRes.ok) {
    const errText = await retryRes.text();
    throw new Error(`Retry scan request failed (${retryRes.status}): ${errText}`);
  }

  const retryData = (await retryRes.json()) as any;
  console.log(`✓ Retry Response:`, JSON.stringify(retryData.data));
  if (retryData.data?.outcome !== "accepted" && retryData.data?.outcome !== "duplicate") {
    throw new Error(`Retry returned unexpected outcome: ${retryData.data?.outcome}`);
  }
  if (retryData.data?.scanId !== scanId) {
    throw new Error(`Retry did not preserve original scanId.`);
  }
  console.log(`✓ Idempotent replay preserved original scanId: ${retryData.data?.scanId}`);

  // Step 9: Database Final Audit
  console.log("\n==================================================");
  console.log(" Verifying Database Audit Trail");
  console.log("==================================================");

  const persistedScan = await prisma.rfid_scans.findFirst({
    where: { scan_id: scanId },
  });
  console.log(`- rfid_scans recorded:  ID=${persistedScan?.id}, outcome=${persistedScan?.outcome}`);

  const inspection = await prisma.inspections.findFirst({
    where: { garment_id: binding.garment_id },
    orderBy: { submitted_at: "desc" },
  });
  console.log(`- inspections recorded: ID=${inspection?.id}, scope=${inspection?.scope}, outcome=${inspection?.outcome}`);

  const finalContext = await prisma.rfid_action_contexts.findUnique({
    where: { id: actionContext.id },
  });
  console.log(`- action context:       status=${finalContext?.status}, closed_at=${finalContext?.closed_at?.toISOString()}`);

  if (persistedScan?.outcome !== "accepted" || !inspection || finalContext?.status !== "consumed") {
    throw new Error("Final database assertion failed.");
  }

  // Restore garment stage
  if (previousStage) {
    await prisma.garments.update({
      where: { id: binding.garment_id },
      data: { stage: previousStage },
    });
    console.log(`✓ Restored garment ${binding.garments?.code} stage to '${previousStage}'.`);
  }

  console.log("\n ALL 7 LIVE FIRST-READER INTEGRATION CHECKS PASSED PERFECTLY!");
}

runLiveVerification()
  .catch((err) => {
    console.error("\n❌ LIVE VERIFICATION FAILED:", err);
    process.exit(1);
  })
  .finally(disconnectPrisma);
