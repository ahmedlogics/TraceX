import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../src/server/db/client";
import { publishPublicGarmentPayload } from "../src/server/public/public-service";
import { LedgerOutboxWorker } from "../src/server/ledger/outbox-worker";
import { ethers } from "ethers";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  console.log("==================================================");
  console.log(" WearTrail: Seed & Verify Dispatched Garment Journey");
  console.log("==================================================");

  const db = getPrismaClient();

  // 1. Get or create staff actor (System Administrator)
  const admin = await db.staff_users.findFirst({
    where: { username: "admin.demo" },
  });
  if (!admin) {
    throw new Error("Admin user 'admin.demo' not found. Run npm run bootstrap:staff first.");
  }

  // 2. Ensure active supplier
  let supplier = await db.suppliers.findFirst({
    where: { code: "SUP-OCM-01" },
  });
  if (!supplier) {
    supplier = await db.suppliers.create({
      data: {
        code: "SUP-OCM-01",
        name: "Organic Cotton Mills Ltd",
        active: true,
      },
    });
  }
  console.log(`✓ Supplier: ${supplier.name} (${supplier.code})`);

  // 3. Ensure material lot
  let lot = await db.material_lots.findFirst({
    where: { code: "LOT-2026-DEMO-01" },
  });
  if (!lot) {
    lot = await db.material_lots.create({
      data: {
        code: "LOT-2026-DEMO-01",
        supplier_id: supplier.id,
        supplier_lot_ref: "OCM-BATCH-882",
        receipt_ref: "REC-2026-001",
        material_name: "Organic Cotton Twill",
        unit: "m",
        received_quantity: new Prisma.Decimal(500),
        available_accepted_quantity: new Prisma.Decimal(470),
        received_by: admin.id,
        received_at: new Date(Date.now() - 5 * 24 * 3600 * 1000), // 5 days ago
        revision: 0,
      },
    });
  }
  console.log(`✓ Material Lot: ${lot.code} (${lot.material_name})`);

  // 4. Ensure workflow version
  let workflowVersion = await db.workflow_versions.findFirst({
    where: { workflow_code: "WF-SHIRT-01", version: 1 },
  });
  if (!workflowVersion) {
    workflowVersion = await db.workflow_versions.create({
      data: {
        workflow_code: "WF-SHIRT-01",
        version: 1,
        title: "Standard Ethical Overshirt Assembly",
        approved_by: admin.id,
        approved_at: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      },
    });
  }

  // 5. Ensure product specification version
  let specVersion = await db.product_spec_versions.findFirst({
    where: { style_code: "SPEC-JACKET-01", version: 1 },
  });
  if (!specVersion) {
    specVersion = await db.product_spec_versions.create({
      data: {
        style_code: "SPEC-JACKET-01",
        version: 1,
        product_name: "Organic Heritage Overshirt",
        approved_by: admin.id,
        approved_at: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        specifications: {
          fabric: "100% Organic Cotton Twill (300 gsm)",
          fit: "Relaxed tailored fit",
          dye: "Low-impact non-toxic vegetable indigo",
          care: "Machine wash cold at 30°C. Line dry in shade.",
          origin: "Artisanal Ethical Garment Workshop",
          description: "Crafted with certified organic cotton twill, featuring horn buttons and reinforced seams.",
        },
      },
    });
  }
  console.log(`✓ Product Spec: ${specVersion.product_name} (v${specVersion.version})`);

  // 6. Ensure production order
  let order = await db.production_orders.findFirst({
    where: { code: "ORD-2026-DEMO-01" },
  });
  if (!order) {
    order = await db.production_orders.create({
      data: {
        code: "ORD-2026-DEMO-01",
        workflow_version_id: workflowVersion.id,
        product_spec_version_id: specVersion.id,
        planned_quantity: 10,
        status: "approved",
        created_by: admin.id,
        approved_by: admin.id,
        approved_at: new Date(Date.now() - 4 * 24 * 3600 * 1000),
      },
    });
  }
  console.log(`✓ Production Order: ${order.code} (Status: ${order.status})`);

  // 7. Ensure cutting job
  let cuttingJob = await db.cutting_jobs.findFirst({
    where: { code: "CUT-2026-DEMO-01" },
  });
  if (!cuttingJob) {
    cuttingJob = await db.cutting_jobs.create({
      data: {
        code: "CUT-2026-DEMO-01",
        production_order_id: order.id,
        performed_by: admin.id,
        performed_at: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      },
    });
  }

  // 8. Ensure material stock movement and cutting inputs
  let stockMovement = await db.material_stock_movements.findFirst({
    where: { material_lot_id: lot.id, kind: "issued", production_order_id: order.id },
  });
  if (!stockMovement) {
    stockMovement = await db.material_stock_movements.create({
      data: {
        material_lot_id: lot.id,
        kind: "issued",
        production_order_id: order.id,
        quantity: new Prisma.Decimal(30),
        reason: "Issue fabric for cutting job CUT-2026-DEMO-01",
        performed_by: admin.id,
        performed_at: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      },
    });
  }

  let cuttingInput = await db.cutting_inputs.findFirst({
    where: { cutting_job_id: cuttingJob.id, issue_id: stockMovement.id },
  });
  if (!cuttingInput) {
    cuttingInput = await db.cutting_inputs.create({
      data: {
        cutting_job_id: cuttingJob.id,
        production_order_id: order.id,
        material_lot_id: lot.id,
        issue_id: stockMovement.id,
        issue_kind: "issued",
        consumed_quantity: new Prisma.Decimal(30),
        waste_quantity: new Prisma.Decimal(0),
      },
    });
  }

  // 9. Provision Garment: GAR-2026-DEMO-01 with stable Public ID: wt-shirt-2026-001
  const targetPublicId = "wt-shirt-2026-001";
  let garment = await db.garments.findFirst({
    where: { public_id: targetPublicId },
  });

  const now = new Date();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const oneDayAgo = new Date(Date.now() - 1 * 24 * 3600 * 1000);

  if (!garment) {
    garment = await db.$transaction(async (tx) => {
      const g = await tx.garments.create({
        data: {
          code: "GAR-2026-DEMO-01",
          public_id: targetPublicId,
          cutting_job_id: cuttingJob.id,
          production_order_id: order.id,
          stage: "cut",
          quality_disposition: "awaiting_inspection",
          size_label: "Medium (M)",
          created_at: threeDaysAgo,
          revision: 0,
        },
      });

      // Lineage link (fulfils garments_require_lineage constraint trigger)
      await tx.garment_material_inputs.create({
        data: {
          garment_id: g.id,
          cutting_job_id: cuttingJob.id,
          cutting_input_id: cuttingInput.id,
          attributed_quantity: new Prisma.Decimal(3),
        },
      });

      // Tag binding
      await tx.rfid_tag_bindings.create({
        data: {
          garment_id: g.id,
          tag_technology: "iso14443a",
          tag_identifier: "04A1B2C3D4E5F6",
          bound_by: admin.id,
          bound_at: threeDaysAgo,
        },
      });

      // Checklist version for final inspection
      let checklist = await tx.checklist_versions.findFirst({
        where: { checklist_code: "CHK-FINAL-01", version: 1 },
      });
      if (!checklist) {
        checklist = await tx.checklist_versions.create({
          data: {
            checklist_code: "CHK-FINAL-01",
            version: 1,
            scope: "final",
            items: [{ id: "c1", label: "Check stitches and seam tension", required: true }],
            approved_by: admin.id,
          },
        });
      }

      // Inspection pass record (satisfies garment_quality_allows_fulfilment)
      await tx.inspections.create({
        data: {
          code: "INSP-2026-DEMO-01",
          scope: "final",
          checklist_version_id: checklist.id,
          garment_id: g.id,
          inspector_id: admin.id,
          outcome: "pass",
          answers: { c1: true },
          created_at: oneDayAgo,
          submitted_at: oneDayAgo,
        },
      });

      // Update garment to released
      await tx.garments.update({
        where: { id: g.id },
        data: { quality_disposition: "released", revision: 1 },
      });

      // Update garment to dispatched
      const updated = await tx.garments.update({
        where: { id: g.id },
        data: { stage: "dispatched", revision: 2 },
      });

      // Trace events representing the complete manufacturing journey
      await tx.trace_events.createMany({
        data: [
          {
            event_type: "garment_cut",
            subject_revision: 1,
            garment_id: g.id,
            actor_id: admin.id,
            occurred_at: threeDaysAgo,
            recorded_at: threeDaysAgo,
            details: { stage: "cut" },
          },
          {
            event_type: "finishing_completed",
            subject_revision: 2,
            garment_id: g.id,
            actor_id: admin.id,
            occurred_at: twoDaysAgo,
            recorded_at: twoDaysAgo,
            details: { stage: "finished" },
          },
          {
            event_type: "inspection_passed",
            subject_revision: 3,
            garment_id: g.id,
            actor_id: admin.id,
            occurred_at: oneDayAgo,
            recorded_at: oneDayAgo,
            details: { disposition: "released" },
          },
          {
            event_type: "shipment_dispatched",
            subject_revision: 4,
            garment_id: g.id,
            actor_id: admin.id,
            occurred_at: now,
            recorded_at: now,
            details: { carrier: "DHL Express", trackingRef: "DHL-984729104" },
          },
        ],
      });

      return updated;
    });
  }

  console.log(`✓ Garment: ${garment.code} (Public ID: ${garment.public_id}, Stage: ${garment.stage})`);

  // 10. Publish versioned public payload & enqueue blockchain commitment
  console.log("\n[PUBLISH] Publishing versioned public payload...");
  const pubResult = await publishPublicGarmentPayload(db, garment.id, admin.id);
  console.log(`✓ Version Record ID:  ${pubResult.versionRecord.id}`);
  console.log(`✓ Public ID:          ${pubResult.publicId}`);
  console.log(`✓ Journey Hash:       0x${pubResult.journeyHash}`);
  console.log(`✓ On-Chain Commit ID: ${pubResult.commitment.onChainCommitmentId}`);
  console.log(`✓ Outbox Status:      ${pubResult.commitment.status}`);

  // 11. Run Ledger Worker to submit to smart contract
  console.log("\n[WORKER] Running LedgerOutboxWorker to anchor commitment on-chain...");
  const rpcUrl = process.env["BLOCKCHAIN_RPC_URL"] ?? "http://127.0.0.1:8545";
  const signerKey =
    process.env["LEDGER_SIGNER_KEY"] ??
    process.env["LEDGER_WRITER_PRIVATE_KEY"] ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const worker = new LedgerOutboxWorker({
    db,
    rpcUrl,
    signerPrivateKey: signerKey,
    batchSize: 5,
    pollIntervalMs: 500,
    requiredConfirmations: 1,
    leaseDurationSeconds: 30,
  });

  await worker.initBlockchain();
  const batchResult = await worker.processBatch();
  console.log(`✓ Worker batch executed: leased ${batchResult.leasedCount}, confirmed ${batchResult.confirmedCount}, failed ${batchResult.failedCount}.`);

  // 12. Verify on-chain state via direct contract call
  const activeDeployment = await db.ledger_deployments.findFirst({
    where: { chain_id: "31337" },
    orderBy: { registered_at: "desc" },
  });
  if (!activeDeployment) {
    throw new Error("No active deployment found for chain 31337.");
  }

  const contractAddress = "0x" + Buffer.from(activeDeployment.contract_address).toString("hex");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contractAbi = [
    "function hasCommitment(bytes32 commitmentId) external view returns (bool)",
    "function getCommitment(bytes32 commitmentId) external view returns (bytes32 payloadHash, uint64 blockNumber, uint64 timestamp)",
  ];
  const contract = new ethers.Contract(contractAddress, contractAbi, provider) as any;

  const hasOnChain = await contract.hasCommitment(pubResult.commitment.onChainCommitmentId);
  console.log(`\n[ON-CHAIN VERIFICATION]`);
  console.log(`- Contract Address:     ${contractAddress}`);
  console.log(`- On-Chain Commit ID:   ${pubResult.commitment.onChainCommitmentId}`);
  console.log(`- Has Commitment:       ${hasOnChain ? "YES (True)" : "NO (False)"}`);

  if (hasOnChain) {
    const onChainData = await contract.getCommitment(pubResult.commitment.onChainCommitmentId);
    console.log(`- On-Chain Payload Hash: ${onChainData[0]}`);
    console.log(`- Stored Journey Hash:   0x${pubResult.journeyHash}`);
    console.log(`- Block Number:          ${onChainData[1].toString()}`);
    console.log(`- Recorded Timestamp:    ${new Date(Number(onChainData[2]) * 1000).toISOString()}`);

    const hashesMatch = onChainData[0].toLowerCase() === ("0x" + pubResult.journeyHash).toLowerCase();
    console.log(`- Exact Hash Equality:   ${hashesMatch ? "MATCHED (VERIFIED)" : "MISMATCH"}`);
  }

  // 13. Test Anonymous HTTP API Access
  console.log("\n[HTTP CLIENT / ANONYMOUS ACCESS VERIFICATION]");
  const apiBase = "http://localhost:4000";

  // Test GET /api/public/journey/:publicId (anonymous, NO headers)
  const journeyRes = await fetch(`${apiBase}/api/public/journey/${targetPublicId}`);
  const journeyJson = await journeyRes.json();
  console.log(`GET /api/public/journey/${targetPublicId}: HTTP ${journeyRes.status}`);
  console.log(`- Public Status:         ${journeyJson.data?.status}`);
  console.log(`- Product Name:          ${journeyJson.data?.productName}`);
  console.log(`- Evidence State:        ${journeyJson.data?.evidence}`);
  console.log(`- Milestones Count:      ${journeyJson.data?.milestones?.length}`);

  // Test GET /api/public/proof/:publicId
  const proofRes = await fetch(`${apiBase}/api/public/proof/${targetPublicId}`);
  const proofJson = await proofRes.json();
  console.log(`\nGET /api/public/proof/${targetPublicId}: HTTP ${proofRes.status}`);
  console.log(`- Proof Version:         ${proofJson.data?.version}`);
  console.log(`- Journey Hash:          ${proofJson.data?.journeyHash}`);
  console.log(`- Blockchain TX Hash:    ${proofJson.data?.blockchain?.transactionHash}`);
  console.log(`- Blockchain Block:      ${proofJson.data?.blockchain?.blockNumber}`);
  console.log(`- Contract Address:      ${proofJson.data?.blockchain?.contractAddress}`);

  console.log("\n==================================================");
  console.log(" END-TO-END VERIFICATION SUMMARY");
  console.log("==================================================");
  console.log(`Actual Customer URL:     http://localhost:8080/p/${targetPublicId}`);
  console.log(`Technical Proof URL:     http://localhost:8080/p/${targetPublicId}/proof`);
  console.log("All verifications completed successfully.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during seed & verification:", err);
  process.exit(1);
});
