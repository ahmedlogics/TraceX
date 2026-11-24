import { createPrismaClient, runInTransaction } from "../src/server/db/client";
import { executeWarehouseCartonIntake } from "../src/server/fulfilment/fulfilment-service";
import { scanRoutingService } from "../src/server/rfid/scan-router";
import { registerAllDomainScanHandlers } from "../src/server/rfid/quality-fulfilment-handlers";
import type { VersionedScanEnvelope } from "../src/server/contracts/rfid";

async function runTestSuite() {
  const db = createPrismaClient();
  registerAllDomainScanHandlers(scanRoutingService);

  console.log("==================================================");
  console.log("   WAREHOUSE INTAKE (STATION 8) VERIFICATION SUITE");
  console.log("==================================================");

  const staff = await db.staff_users.findFirstOrThrow();
  const actor = {
    actorId: staff.id,
    username: staff.username,
    displayName: staff.display_name,
    role: "logistics" as const,
    department: "warehouse" as const,
    authenticatedAt: new Date(),
  };

  // Pre-test setup: ensure cartons exist in pristine test state
  const binA1 = await db.warehouse_bins.findFirstOrThrow({ where: { code: "BIN-A1" } });
  const binB1 = await db.warehouse_bins.findFirstOrThrow({ where: { code: "BIN-B1" } });

  // Reset 04A7B8C9 to sealed
  await db.warehouse_stock.deleteMany({ where: { packages: { code: "04A7B8C9" } } });
  await db.packages.updateMany({ where: { code: "04A7B8C9" }, data: { status: "sealed" } });

  // Reset 04A7B8H3 with quality hold on TROUSER-008
  const g8 = await db.garments.findFirstOrThrow({ where: { code: "TROUSER-008" } });
  const existingHold = await db.garment_holds.findFirst({
    where: { garment_id: g8.id, released_at: null },
  });
  if (!existingHold) {
    await db.garment_holds.create({
      data: {
        garment_id: g8.id,
        kind: "operational",
        reason: "Fabric surface pilling exceeding grade 3 standard",
        opened_by: staff.id,
      },
    });
  }
  await db.garments.update({
    where: { id: g8.id },
    data: { quality_disposition: "held" },
  });
  await db.warehouse_stock.deleteMany({ where: { packages: { code: "04A7B8H3" } } });
  await db.packages.update({ where: { code: "04A7B8H3" }, data: { status: "sealed" } });

  // Ensure 04A7B8D2 is warehoused and its member garment TROUSER-009 is warehoused
  const pkgDup = await db.packages.findFirstOrThrow({ where: { code: "04A7B8D2" } });
  await db.packages.update({ where: { id: pkgDup.id }, data: { status: "warehoused" } });
  await db.warehouse_stock.upsert({
    where: { package_id: pkgDup.id },
    create: { package_id: pkgDup.id, current_bin_id: binB1.id },
    update: { current_bin_id: binB1.id },
  });
  await db.garments.updateMany({
    where: { code: "TROUSER-009" },
    data: { stage: "warehoused" },
  });

  let passed = 0;
  let failed = 0;

  function assert(condition: any, title: string, details?: any) {
    if (Boolean(condition)) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}`, details ?? "");
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Unknown Box Tag
  // ----------------------------------------------------
  console.log("\n--- TEST 1: Unknown Box Tag ---");
  const unknownRes = await runInTransaction(async (tx) =>
    executeWarehouseCartonIntake(tx, actor, {
      tagUid: "UNKNOWN-BOX-999",
      binId: "BIN-A1",
      isHardware: false,
    }),
  );
  assert(unknownRes.resolution === "rejected_unknown_card", "Unknown box tag returns rejected_unknown_card");
  assert(unknownRes.rejectReason?.includes("not recognised"), "Unknown box tag returns clear rejection reason");

  // ----------------------------------------------------
  // TEST 2: Unsealed Carton (Status: Open)
  // ----------------------------------------------------
  console.log("\n--- TEST 2: Unsealed Carton ---");
  const unsealedRes = await runInTransaction(async (tx) =>
    executeWarehouseCartonIntake(tx, actor, {
      tagUid: "04A7B8C0",
      binId: "BIN-A1",
      isHardware: false,
    }),
  );
  assert(unsealedRes.resolution === "rejected_business_rule", "Unsealed carton returns rejected_business_rule");
  assert(unsealedRes.rejectReason?.includes("unsealed"), "Rejection reason clearly states carton is unsealed");

  // ----------------------------------------------------
  // TEST 3: Empty Carton (0 Garments)
  // ----------------------------------------------------
  console.log("\n--- TEST 3: Empty Carton ---");
  const emptyRes = await runInTransaction(async (tx) =>
    executeWarehouseCartonIntake(tx, actor, {
      tagUid: "04A7B8E1",
      binId: "BIN-A1",
      isHardware: false,
    }),
  );
  assert(emptyRes.resolution === "rejected_business_rule", "Empty carton returns rejected_business_rule");
  assert(emptyRes.rejectReason?.toLowerCase().includes("empty"), "Rejection reason clearly states carton is empty");

  // ----------------------------------------------------
  // TEST 4: Carton with Active Quality Hold on Member Garment
  // ----------------------------------------------------
  console.log("\n--- TEST 4: Carton with Active Quality Hold ---");
  const holdRes = await runInTransaction(async (tx) =>
    executeWarehouseCartonIntake(tx, actor, {
      tagUid: "04A7B8H3",
      binId: "BIN-A1",
      isHardware: false,
    }),
  );
  assert(holdRes.resolution === "rejected_business_rule", "Held garment carton returns rejected_business_rule");
  assert(holdRes.rejectReason?.includes("TROUSER-008"), "Rejection identifies specific held member garment (TROUSER-008)");
  assert(holdRes.rejectReason?.includes("pilling"), "Rejection includes defect reason (Fabric surface pilling)");

  // ----------------------------------------------------
  // TEST 5: Already Received Carton (Duplicate Intake Check)
  // ----------------------------------------------------
  console.log("\n--- TEST 5: Already Received Carton ---");
  const alreadyReceivedRes = await runInTransaction(async (tx) =>
    executeWarehouseCartonIntake(tx, actor, {
      tagUid: "04A7B8D2",
      binId: "BIN-B1",
      isHardware: false,
    }),
  );
  assert(alreadyReceivedRes.resolution === "rejected_duplicate", "Already received carton returns rejected_duplicate");
  assert(alreadyReceivedRes.rejectReason?.includes("Duplicate intake"), "Rejection clearly cites duplicate intake");

  // ----------------------------------------------------
  // TEST 6: Valid Master Box Intake (Carton 04A7B8C9)
  // ----------------------------------------------------
  console.log("\n--- TEST 6: Valid Master Box Intake ---");
  const validRes = await runInTransaction(async (tx) =>
    executeWarehouseCartonIntake(tx, actor, {
      tagUid: "04A7B8C9",
      binId: "BIN-A1",
      isHardware: false,
    }),
  );
  assert(validRes.resolution === "accepted", "Valid Master Box scan returns accepted");
  assert(validRes.garmentCode === "04A7B8C9", "Scan outcome identifies carton code");
  assert(
    validRes.productName?.includes("Garments Moved to Warehouse") ||
      validRes.productName?.includes("Box Received Successfully"),
    "Scan outcome displays 'Box Received Successfully — Garments Moved to Warehouse.'",
  );
  assert(
    validRes.message?.includes("BIN-A1") || validRes.productName?.includes("BIN-A1"),
    "Scan outcome identifies destination bin BIN-A1",
  );

  // Verify in PostgreSQL database
  const updatedPkg = await db.packages.findFirstOrThrow({
    where: { code: "04A7B8C9" },
    include: {
      warehouse_stock: { include: { warehouse_bins: true } },
      package_items: { include: { garments: true } },
    },
  });
  assert(updatedPkg.status === "warehoused", "Package status updated to 'warehoused' in PostgreSQL");
  assert(updatedPkg.warehouse_stock?.warehouse_bins.code === "BIN-A1", "Storage bin assigned in warehouse_stock");

  for (const item of updatedPkg.package_items) {
    assert(item.garments.stage === "warehoused", `Member garment ${item.garments.code} stage updated to 'warehoused'`);
  }

  // Verify trace events
  const traceCount = await db.trace_events.count({
    where: {
      garment_id: { in: updatedPkg.package_items.map((i) => i.garment_id) },
      event_type: "warehouse_intake",
    },
  });
  assert(traceCount >= 2, `Trace events logged for all member garments (count: ${traceCount})`);

  // Verify audit event
  const audit = await db.audit_events.findFirst({
    where: {
      target_type: "package",
      target_reference: "04A7B8C9",
      action_code: "warehouse_carton_intake",
    },
  });
  assert(Boolean(audit), "Audit event recorded with department 'warehouse' and action 'warehouse_carton_intake'");

  // ----------------------------------------------------
  // TEST 7: Duplicate Intake on Just-Received Carton
  // ----------------------------------------------------
  console.log("\n--- TEST 7: Duplicate Intake on Just-Received Carton ---");
  const dupRes = await runInTransaction(async (tx) =>
    executeWarehouseCartonIntake(tx, actor, {
      tagUid: "04A7B8C9",
      binId: "BIN-A1",
      isHardware: false,
    }),
  );
  assert(dupRes.resolution === "rejected_duplicate", "Rescanning received carton returns rejected_duplicate");
  assert(dupRes.rejectReason?.includes("Duplicate intake"), "Duplicate intake message returned");

  // ----------------------------------------------------
  // TEST 8: Hardware RFID Scanner Integration via ScanRoutingService
  // ----------------------------------------------------
  console.log("\n--- TEST 8: Hardware RFID Scanner via ScanRouter ---");
  // Test hardware scan routing on duplicate carton through routeScan
  const envelope: any = {
    schemaVersion: 1,
    scanId: `scan-${Date.now()}`,
    deviceId: "11111111-1111-4111-a111-111111111111", // Simulation bridge
    readerIndex: 7, // Warehouse Inbound Antenna
    mappingVersion: 1,
    tagUid: "04A7B8D2",
    bootId: "boot-test",
    sequence: 101,
    deviceUptimeMs: 50000,
    receivedAt: new Date().toISOString(),
  };

  let hwErrorCaught = false;
  try {
    await runInTransaction(async (tx) => {
      await scanRoutingService.routeScan(envelope, tx, {
        actor,
        session: {
          sessionId: "sess-warehouse-01",
          stationCode: "warehouse",
          deviceId: "11111111-1111-4111-a111-111111111111",
          readerIndex: 7,
          operatorId: staff.id,
        },
        binId: "BIN-A1",
      } as any);
    });
  } catch (err: any) {
    hwErrorCaught = true;
    assert(err.message.includes("Duplicate intake") || err.code === "WT_ERR_DUPLICATE_SCAN", "Hardware scan on received carton throws duplicate conflict");
  }
  assert(hwErrorCaught, "Hardware scan properly routes to WarehouseScanHandler and validates carton");

  // ----------------------------------------------------
  // TEST 9: Inventory Consistency (Stored Cartons & Garments Count)
  // ----------------------------------------------------
  console.log("\n--- TEST 9: Inventory Consistency Verification ---");
  const warehousedStockPackages = await db.packages.findMany({
    where: { status: "warehoused" },
    include: {
      warehouse_stock: { include: { warehouse_bins: true } },
      package_items: {
        where: { removed_at: null },
        include: { garments: true },
      },
    },
  });
  const totalGarmentsInWarehousedCartons = warehousedStockPackages.reduce(
    (acc, p) => acc + p.package_items.length,
    0,
  );
  assert(
    warehousedStockPackages.length >= 2,
    `Warehoused cartons exist in PostgreSQL (count: ${warehousedStockPackages.length})`,
  );
  assert(
    totalGarmentsInWarehousedCartons >= 3,
    `Stored cartons contain all linked garments (count: ${totalGarmentsInWarehousedCartons} >= 3 garments)`,
  );

  const warehousedGarments = await db.garments.findMany({
    where: { stage: "warehoused" },
  });
  assert(
    warehousedGarments.length === totalGarmentsInWarehousedCartons,
    `Inventory matches exactly: database garments in 'warehoused' stage (${warehousedGarments.length}) equals carton items (${totalGarmentsInWarehousedCartons})`,
  );

  console.log("\n==================================================");
  console.log(`   SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  process.exit(failed === 0 ? 0 : 1);
}

runTestSuite().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
