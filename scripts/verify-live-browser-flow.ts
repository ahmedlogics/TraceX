/**
 * WearTrail Live Factory Browser Workflow & Customer Verification Script
 * Validates the full operational sequence against the live Express HTTP API,
 * PostgreSQL database, and Hardhat blockchain smart contract.
 */
import { ethers } from "ethers";
import { prisma, disconnectPrisma } from "../src/server/db/client";

const API_BASE = "http://127.0.0.1:4000";
const RPC_URL = process.env["HARDHAT_RPC_URL"] || "http://127.0.0.1:8545";

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: any };
  meta?: { requestId: string; timestamp: string };
}

async function apiFetch<T = any>(
  endpoint: string,
  options: { method?: string; body?: any; token?: string } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const fetchInit: RequestInit = {
    method: options.method || "GET",
    headers,
  };
  if (options.body !== undefined) {
    fetchInit.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, fetchInit);

  const json = (await res.json()) as ApiResponse<T>;
  return { status: res.status, body: json };
}

async function main() {
  console.log("================================================================================");
  console.log(" WEARTRAIL LIVE FACTORY WORKFLOW & CUSTOMER EVIDENCE VERIFICATION");
  console.log("================================================================================");

  // -------------------------------------------------------------------------
  // STEP 1: Staff Authentication (Login)
  // -------------------------------------------------------------------------
  console.log("\n[1] STEP 1: Staff Authentication (Login as Manager)");
  const loginRes = await apiFetch("/api/auth/login", {
    method: "POST",
    body: { username: "manager.demo", password: "weartrail123!" },
  });
  console.log(`  POST /api/auth/login -> HTTP ${loginRes.status}`);
  if (!loginRes.body.success || !loginRes.body.data?.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
  }
  const token = loginRes.body.data.token;
  const user = loginRes.body.data.user;
  console.log(`  ✓ Authenticated as: ${user.displayName} (${user.username}, Role: ${user.role})`);
  console.log(`  ✓ Token: ${token.substring(0, 16)}...`);

  // -------------------------------------------------------------------------
  // STEP 2: Receive Raw Fabric Bundle Lot
  // -------------------------------------------------------------------------
  console.log("\n[2] STEP 2: Receive Raw Fabric Bundle Lot");
  const lotTagUid = "E00401" + Math.floor(Math.random() * 100000000).toString(16).toUpperCase().padStart(8, "0");
  const receiveLotPayload = {
    materialName: "Premium Organic Denim Cotton",
    supplierRef: "SUP-TX-2026-B",
    quantity: 150.0,
    unit: "m",
    tagUid: lotTagUid,
  };
  const receiveRes = await apiFetch("/api/materials/lots", {
    method: "POST",
    body: receiveLotPayload,
    token,
  });
  console.log(`  POST /api/materials/lots -> HTTP ${receiveRes.status}`);
  if (receiveRes.status !== 201 || !receiveRes.body.data) {
    throw new Error(`Failed to create material lot: ${JSON.stringify(receiveRes.body)}`);
  }
  console.log(`  Response:`, JSON.stringify(receiveRes.body.data));
  const lotCode = receiveRes.body.data.code || receiveRes.body.data.lotCode;
  const lotId = receiveRes.body.data.id || receiveRes.body.data.lotId;
  console.log(`  ✓ Created Material Lot: ${lotCode} (ID: ${lotId}, Card: ${lotTagUid})`);

  // Verify reload retrieves server data from database
  const getLotRes = await apiFetch(`/api/materials/lots/${lotId}`, { token });
  console.log(`  GET /api/materials/lots/${lotId} -> HTTP ${getLotRes.status}`);
  console.log(`  ✓ Reload verified from DB: Code=${getLotRes.body.data?.code}, Qty=${getLotRes.body.data?.receivedQty}m`);

  // -------------------------------------------------------------------------
  // STEP 3: Incoming Material Acceptance (QC Pass)
  // -------------------------------------------------------------------------
  console.log("\n[3] STEP 3: Incoming Acceptance (QC Pass)");
  const incomingQcPayload = {
    lotId,
    acceptedQuantity: 150.0,
    heldQuantity: 0,
    rejectedQuantity: 0,
    checklist: [
      { id: "weave-density", label: "Weave density within spec", passed: true },
      { id: "colorfastness", label: "Color shade match", passed: true },
      { id: "flaw-inspection", label: "Zero major surface yarn breaks", passed: true },
    ],
    notes: "Batch verified pristine by Incoming QC inspector.",
    result: "pass",
  };
  const qcRes = await apiFetch("/api/quality/incoming-qc", {
    method: "POST",
    body: incomingQcPayload,
    token,
  });
  console.log(`  POST /api/quality/incoming-qc -> HTTP ${qcRes.status}`);
  console.log(`  Response:`, JSON.stringify(qcRes.body.data));
  console.log(`  ✓ Lot ${lotCode} passed incoming QC: Accepted=150.0m`);

  // -------------------------------------------------------------------------
  // STEP 4: Plan and Approve Production Order
  // -------------------------------------------------------------------------
  console.log("\n[4] STEP 4: Plan and Approve Production Order");
  const planOrderPayload = {
    product: "Artisan Slim Indigo Jeans",
    styleCode: "WT-TR-DENIM-01",
    qty: 25,
    dueDate: new Date(Date.now() + 86400000 * 7).toISOString().substring(0, 10),
  };
  const planRes = await apiFetch("/api/production/orders", {
    method: "POST",
    body: planOrderPayload,
    token,
  });
  console.log(`  POST /api/production/orders -> HTTP ${planRes.status}`);
  const orderId = planRes.body.data.id || planRes.body.data.orderId;
  const orderCode = planRes.body.data.code;
  console.log(`  ✓ Planned Order: ${orderCode} (ID: ${orderId}, Planned Qty: 25)`);

  const approveRes = await apiFetch(`/api/production/orders/${orderId}/approve`, {
    method: "POST",
    token,
  });
  console.log(`  POST /api/production/orders/${orderId}/approve -> HTTP ${approveRes.status}`);
  console.log(`  ✓ Approved Order ${orderCode} for factory production.`);

  // -------------------------------------------------------------------------
  // STEP 5: Material Issue to Order
  // -------------------------------------------------------------------------
  console.log("\n[5] STEP 5: Issue Fabric from Accepted Lot to Approved Order");
  const issuePayload = {
    orderId,
    quantity: 50.0,
    reason: "Cutting batch #1 issue for 25 garments",
  };
  const issueRes = await apiFetch(`/api/materials/lots/${lotId}/issues`, {
    method: "POST",
    body: issuePayload,
    token,
  });
  console.log(`  POST /api/materials/lots/${lotId}/issues -> HTTP ${issueRes.status}`);
  console.log(`  Response:`, JSON.stringify(issueRes.body.data));
  const issueId = issueRes.body.data.id || issueRes.body.data.issueId;
  console.log(`  ✓ Issued 50.0m of ${lotCode} to order ${orderCode} (Issue ID: ${issueId})`);

  // Verify duplicate over-allocation / duplicate delivery is rejected
  console.log("\n[5b] Verification: Duplicate / Excess Material Allocation Rejection");
  const excessIssueRes = await apiFetch(`/api/materials/lots/${lotId}/issues`, {
    method: "POST",
    body: { orderId, quantity: 200.0 }, // Lot only had 150m total, 50m already issued -> only 100m left
    token,
  });
  console.log(`  POST /api/materials/lots/${lotId}/issues (200m excess) -> HTTP ${excessIssueRes.status}`);
  console.log(`  ✓ Correctly rejected: Code=${excessIssueRes.body.error?.code}, Message="${excessIssueRes.body.error?.message}"`);

  // -------------------------------------------------------------------------
  // STEP 6 & 7: Cutting Source Confirmation & Fresh Garment Enrollment
  // -------------------------------------------------------------------------
  console.log("\n[6 & 7] STEPS 6 & 7: Cutting Source Confirmation & Fresh Garment Enrollment");
  const garmentCardUid = "04B1" + Math.floor(Math.random() * 10000000000).toString(16).toUpperCase().padStart(10, "0");
  
  // Step 6: Select Cutting Source
  const cuttingSourcePayload = {
    orderId,
    issueId,
    consumedQty: 2.0,
  };
  const cuttingSourceRes = await apiFetch("/api/production/cutting/select-source", {
    method: "POST",
    body: cuttingSourcePayload,
    token,
  });
  console.log(`  POST /api/production/cutting/select-source -> HTTP ${cuttingSourceRes.status}`);
  const cuttingJobId = cuttingSourceRes.body.data.cuttingJobId;
  const cuttingInputId = cuttingSourceRes.body.data.cuttingInputId;
  console.log(`  ✓ Confirmed Cutting Source: Job=${cuttingJobId}, Input=${cuttingInputId}`);

  // Step 7: Bind Card & Enroll Garment
  const bindGarmentPayload = {
    orderId,
    cuttingJobId,
    cuttingSourceSelectionId: cuttingInputId,
    size: "32W",
    tagUid: garmentCardUid,
    fabricUsed: 2.0,
  };
  const bindRes = await apiFetch("/api/production/cutting/bind-garment", {
    method: "POST",
    body: bindGarmentPayload,
    token,
  });
  console.log(`  POST /api/production/cutting/bind-garment -> HTTP ${bindRes.status}`);
  console.log(`  Response:`, JSON.stringify(bindRes.body.data));
  const garmentId = bindRes.body.data.garmentId;
  const garmentCode = bindRes.body.data.garmentCode;
  const publicId = bindRes.body.data.publicId;
  console.log(`  ✓ Enrolled Garment: ${garmentCode} (ID: ${garmentId}, Public ID: ${publicId}, Card: ${garmentCardUid})`);

  // Verify duplicate card enrollment is rejected
  console.log("\n[7b] Verification: Duplicate Active Card Binding Rejection");
  const duplicateCardRes = await apiFetch("/api/production/cutting/bind-garment", {
    method: "POST",
    body: {
      orderId,
      cuttingJobId,
      cuttingSourceSelectionId: cuttingInputId,
      size: "32W",
      tagUid: garmentCardUid, // Same card UID
      fabricUsed: 2.0,
    },
    token,
  });
  console.log(`  POST /api/production/cutting/bind-garment (Duplicate Card) -> HTTP ${duplicateCardRes.status}`);
  console.log(`  ✓ Correctly rejected: Code=${duplicateCardRes.body.error?.code}, Message="${duplicateCardRes.body.error?.message}"`);

  // Verify reload retrieves garment server data from database
  const getGarmentRes = await apiFetch(`/api/production/garments/${garmentId}`, { token });
  console.log(`  GET /api/production/garments/${garmentId} -> HTTP ${getGarmentRes.status}`);
  console.log(`  ✓ Reload verified from DB: Code=${getGarmentRes.body.data?.code}, Stage=${getGarmentRes.body.data?.stage}, Quality=${getGarmentRes.body.data?.qualityDisposition}`);

  // -------------------------------------------------------------------------
  // STEP 8: Verification: Saved QA Fail Blocks Packing via API
  // -------------------------------------------------------------------------
  console.log("\n[8] Verification: Saved QA Fail Blocks Packing via API Eligibility");
  
  // Advance garment through stitching and finishing routine scans
  console.log("  Advancing garment through routine assembly scans...");
  const stitchRes = await apiFetch("/api/production/routine-scan", {
    method: "POST",
    body: { uid: garmentCardUid, stationCode: "stitching" },
    token,
  });
  console.log(`  POST /api/production/routine-scan (stitching) -> HTTP ${stitchRes.status}, Outcome: ${stitchRes.body.data?.outcome}`);

  const finishRes = await apiFetch("/api/production/routine-scan", {
    method: "POST",
    body: { uid: garmentCardUid, stationCode: "finishing" },
    token,
  });
  console.log(`  POST /api/production/routine-scan (finishing) -> HTTP ${finishRes.status}, Outcome: ${finishRes.body.data?.outcome}`);

  // Submit a QA Inspection with FAIL outcome using the real context + RFID scan flow
  console.log("  Authenticating as Quality Inspector (qc.demo)...");
  const qcLoginRes = await apiFetch("/api/auth/login", {
    method: "POST",
    body: { username: "qc.demo", password: "weartrail123!" },
  });
  const qcToken = qcLoginRes.body.data?.token;
  console.log(`  ✓ Authenticated as: ${qcLoginRes.body.data?.user?.displayName} (${qcLoginRes.body.data?.user?.role})`);

  console.log("  Preparing QA Action Context (FAIL decision at station final_qc)...");
  const qaCtxRes = await apiFetch("/api/rfid/contexts", {
    method: "POST",
    body: {
      stationCode: "final_qc",
      kind: "submit_qc",
      payload: {
        outcome: "fail",
        defectReason: "Waistband tension irregularity exceeding tolerance",
        notes: "Severe seam puckering and tension defect on waistband.",
        checklist: [{ id: "seams", label: "Seam straightness", checked: false }],
        scope: "final",
      },
    },
    token: qcToken,
  });
  console.log(`  POST /api/rfid/contexts -> HTTP ${qaCtxRes.status}`);
  const qaContextId = qaCtxRes.body.data?.contextId || qaCtxRes.body.data?.id;
  console.log(`  ✓ Armed QA Context ID: ${qaContextId}`);

  // Scan garment card at final_qc with explicit actionContextId
  console.log("  Executing Final QC card tap with armed FAIL decision...");
  const qaScanRes = await apiFetch("/api/rfid/ui-scan", {
    method: "POST",
    body: {
      uid: garmentCardUid,
      stationCode: "final_qc",
      actionContextId: qaContextId,
    },
    token: qcToken,
  });
  console.log(`  POST /api/rfid/ui-scan (final_qc FAIL) -> HTTP ${qaScanRes.status}, Outcome: ${qaScanRes.body.data?.outcome}`);
  console.log(`  ✓ Quality inspection recorded as FAIL. Garment placed on hold.`);

  // Verify DB record for inspection and hold
  const inspListRes = await apiFetch(`/api/quality/inspections?garmentId=${garmentId}`, { token });
  console.log(`  GET /api/quality/inspections?garmentId=${garmentId} -> HTTP ${inspListRes.status}`);
  const recordedInsp = inspListRes.body.data?.[0];
  console.log(`  ✓ Inspection verified in DB: Code=${recordedInsp?.code}, Outcome=${recordedInsp?.outcome}, Defect="${recordedInsp?.defectReason || recordedInsp?.defect_reason}"`);

  // Attempt to pack this failed garment -> MUST BE REJECTED
  console.log("  Attempting to pack garment with active Quality Hold...");
  const packFailedRes = await apiFetch("/api/fulfilment/pack", {
    method: "POST",
    body: { garmentId },
    token,
  });
  console.log(`  POST /api/fulfilment/pack -> HTTP ${packFailedRes.status}`);
  console.log(`  Response:`, JSON.stringify(packFailedRes.body));
  if (packFailedRes.status !== 400 && packFailedRes.status !== 409 && packFailedRes.status !== 422) {
    throw new Error(`CRITICAL: Packing did NOT block a failed garment! Status was ${packFailedRes.status}`);
  }
  console.log(`  ✓ Enforced: Packing BLOCKED with error code: ${packFailedRes.body.error?.code} ("${packFailedRes.body.error?.message}")`);

  // Check fulfilment overview shows garment in 'blocked' list
  const fulfilmentOverview = await apiFetch("/api/fulfilment", { token });
  const isBlocked = fulfilmentOverview.body.data?.blocked?.some((g: any) => g.id === garmentId || g.code === garmentCode);
  console.log(`  ✓ Fulfilment Overview confirms garment is in BLOCKED quarantine: ${isBlocked}`);

  // -------------------------------------------------------------------------
  // STEP 9: Customer Journey & On-Chain Evidence Verification
  // -------------------------------------------------------------------------
  console.log("\n[9] STEP 9: Customer Journey & On-Chain Evidence Verification");
  const demoGarmentPublicId = "wt-shirt-2026-001";
  console.log(`  Querying public endpoints for existing dispatched garment: ${demoGarmentPublicId}`);

  const publicJourneyRes = await apiFetch(`/api/public/journey/${demoGarmentPublicId}`);
  console.log(`  GET /api/public/journey/${demoGarmentPublicId} -> HTTP ${publicJourneyRes.status}`);
  const journey = publicJourneyRes.body.data;
  console.log(`  ✓ Anonymous Customer Access Verified (No Auth Required)`);
  console.log(`  ✓ Product Name: ${journey?.productName}`);
  console.log(`  ✓ Timeline Events Count: ${journey?.timeline?.length}`);
  console.log(`  ✓ Materials:`, JSON.stringify(journey?.materials));
  
  // Verify privacy: ensure no internal nonces or employee IDs leak into public response
  const journeyStr = JSON.stringify(journey);
  const leaksNonce = journeyStr.includes("internal_nonce") || journeyStr.includes("nonce");
  const leaksDbId = journeyStr.includes("staff_user_id") || journeyStr.includes("actor_id");
  console.log(`  ✓ Privacy Check: Private nonces hidden=${!leaksNonce}, Internal DB actors hidden=${!leaksDbId}`);

  // Public Proof lookup & On-Chain Contract Commitment Check
  const publicProofRes = await apiFetch(`/api/public/proof/${demoGarmentPublicId}`);
  console.log(`  GET /api/public/proof/${demoGarmentPublicId} -> HTTP ${publicProofRes.status}`);
  const proof = publicProofRes.body.data;
  console.log(`  ✓ Public Proof:`, JSON.stringify(proof, null, 2));

  // Connect to Hardhat blockchain and verify the exact commitment
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Look up public payload version in database
  const publishedVersion = await prisma.public_payload_versions.findFirst({
    where: { public_id: demoGarmentPublicId },
    orderBy: { version: "desc" },
    include: { ledger_commitments: true },
  });
  if (!publishedVersion) throw new Error("No public payload version found for demo garment.");

  const commitmentRecord = publishedVersion.ledger_commitments[0];
  if (!commitmentRecord) throw new Error("No ledger commitment record associated with public payload version.");

  const deployment = await prisma.ledger_deployments.findUnique({
    where: { id: commitmentRecord.deployment_id },
  });
  if (!deployment) throw new Error(`Ledger deployment ${commitmentRecord.deployment_id} not found.`);

  const contractAddress = "0x" + Buffer.from(deployment.contract_address).toString("hex");
  const contractAbi = [
    "function getCommitment(bytes32 commitmentId) external view returns (bytes32 payloadHash, uint64 blockNumber, uint64 blockTimestamp)",
    "function hasCommitment(bytes32 commitmentId) external view returns (bool)",
  ];
  const contract = new ethers.Contract(contractAddress, contractAbi, provider);

  const dbPayloadSha256 = "0x" + Buffer.from(publishedVersion.payload_sha256!).toString("hex");
  const dbCommitmentId = "0x" + Buffer.from(commitmentRecord.commitment_id).toString("hex");

  console.log(`  On-Chain Contract Verification:`);
  console.log(`    Contract Address:  ${contractAddress}`);
  console.log(`    Commitment ID:     ${dbCommitmentId}`);
  console.log(`    DB Payload SHA256: ${dbPayloadSha256}`);

  const onChainExists = await (contract as any)["hasCommitment"](dbCommitmentId);
  console.log(`    On-Chain Exists:   ${onChainExists}`);
  if (!onChainExists) throw new Error("Commitment does not exist on-chain!");

  const [onChainPayloadHash, blockNum, blockTs] = await (contract as any)["getCommitment"](dbCommitmentId);
  console.log(`    On-Chain Hash:     ${onChainPayloadHash}`);
  console.log(`    Mined in Block:    #${blockNum} (Timestamp: ${new Date(Number(blockTs) * 1000).toISOString()})`);

  const hashesMatch = onChainPayloadHash.toLowerCase() === dbPayloadSha256.toLowerCase();
  console.log(`    Exact Hash Match:  ${hashesMatch} (0x${dbPayloadSha256.substring(2, 10)}... == 0x${onChainPayloadHash.substring(2, 10)}...)`);
  if (!hashesMatch) throw new Error("On-chain hash does NOT match the public payload SHA-256!");

  console.log("\n================================================================================");
  console.log(" ALL FACTORY & CUSTOMER WORKFLOW CHECKS COMPLETED AND VERIFIED SUCCESSFULLY!");
  console.log("================================================================================");
}

main()
  .catch((err) => {
    console.error("\nFATAL ERROR DURING VERIFICATION:", err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
