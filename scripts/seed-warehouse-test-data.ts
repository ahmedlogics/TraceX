import { createPrismaClient } from "../src/server/db/client";

async function main() {
  const db = createPrismaClient();
  console.log("Seeding Warehouse test data...");

  // 1. Get staff user for creator/actor
  const staff = await db.staff_users.findFirstOrThrow();
  console.log(`Using staff user: ${staff.username} (${staff.id})`);

  // 2. Seed warehouse_bins if missing
  const defaultBins = [
    { code: "BIN-A1", label: "Bin A1 — Standard Hang / Classic Poplin" },
    { code: "BIN-A2", label: "Bin A2 — Standard Fold / Classic Poplin" },
    { code: "BIN-B1", label: "Bin B1 — Trousers / Bottoms" },
    { code: "BIN-B2", label: "Bin B2 — Outerwear / Heavyweight" },
    { code: "BIN-BULK-1", label: "Bulk Staging Bin 1" },
  ];

  for (const b of defaultBins) {
    const existing = await db.warehouse_bins.findFirst({ where: { code: b.code } });
    if (!existing) {
      await db.warehouse_bins.create({
        data: {
          code: b.code,
          label: b.label,
          active: true,
        },
      });
      console.log(`Created bin: ${b.code}`);
    } else {
      console.log(`Bin exists: ${b.code}`);
    }
  }

  // 3. Ensure checklist version for inspections
  let chk = await db.checklist_versions.findFirst({
    where: { scope: "final" },
  });
  if (!chk) {
    chk = await db.checklist_versions.create({
      data: {
        checklist_code: "CHK-QA-FINAL-V1",
        version: 1,
        scope: "final",
        items: [{ id: "visual", label: "Visual inspection" }],
        approved_by: staff.id,
      },
    });
  }

  // 4. Ensure garments have passing inspection & released disposition
  const prepGarments = ["TROUSER-006", "TROUSER-007", "TROUSER-008", "TROUSER-009"];
  for (const gCode of prepGarments) {
    const g = await db.garments.findFirst({ where: { code: gCode } });
    if (!g) continue;

    const existingPass = await db.inspections.findFirst({
      where: { garment_id: g.id, outcome: "pass", scope: "final" },
    });

    if (!existingPass) {
      await db.inspections.create({
        data: {
          code: `INSP-QA-${g.code}-${Date.now()}`,
          scope: "final",
          checklist_version_id: chk.id,
          garment_id: g.id,
          inspector_id: staff.id,
          outcome: "pass",
          answers: { visual: "pass", stitching: "pass", measurements: "pass" },
          created_at: new Date(),
          submitted_at: new Date(),
        },
      });
      console.log(`Recorded QA pass inspection for ${g.code}`);
    }

    await db.garments.update({
      where: { id: g.id },
      data: {
        stage: "finished",
        quality_disposition: "released",
      },
    });
    console.log(`Updated ${g.code} to finished / released`);
  }

  // 5. Create or verify Scenario 1: PKG-2026-DEMO-01 (Master Box UID: 04A7B8C9) -> Sealed, ready for intake
  const g1 = await db.garments.findFirstOrThrow({ where: { code: "GAR-2026-DEMO-01" } });
  const g6 = await db.garments.findFirstOrThrow({ where: { code: "TROUSER-006" } });

  let pkg1 = await db.packages.findFirst({ where: { code: "04A7B8C9" } });
  if (!pkg1) {
    pkg1 = await db.packages.create({
      data: {
        code: "04A7B8C9", // Use Master Box RFID UID as code so reader matches immediately
        status: "open",
        created_by: staff.id,
      },
    });
    console.log(`Created Carton 04A7B8C9 (PKG-2026-DEMO-01)`);

    // Add garments while status is open
    await db.package_items.createMany({
      data: [
        { package_id: pkg1.id, garment_id: g1.id, added_by: staff.id },
        { package_id: pkg1.id, garment_id: g6.id, added_by: staff.id },
      ],
    });

    // Update garments to packed
    await db.garments.updateMany({
      where: { id: { in: [g1.id, g6.id] } },
      data: { stage: "packed" },
    });

    // Seal the carton
    await db.packages.update({
      where: { id: pkg1.id },
      data: { status: "sealed" },
    });
    console.log(`Sealed carton 04A7B8C9 with items ${g1.code}, ${g6.code}`);
  } else {
    console.log(`Carton 04A7B8C9 already exists: status=${pkg1.status}`);
  }

  // 6. Scenario 2: Unsealed carton PKG-2026-UNSEALED (UID: 04A7B8C0, status: open)
  const g7 = await db.garments.findFirstOrThrow({ where: { code: "TROUSER-007" } });
  let pkg2 = await db.packages.findFirst({ where: { code: "04A7B8C0" } });
  if (!pkg2) {
    pkg2 = await db.packages.create({
      data: {
        code: "04A7B8C0",
        status: "open",
        created_by: staff.id,
      },
    });
    await db.package_items.create({
      data: { package_id: pkg2.id, garment_id: g7.id, added_by: staff.id },
    });
    console.log(`Created Unsealed Carton 04A7B8C0 with ${g7.code}`);
  } else {
    console.log(`Carton 04A7B8C0 already exists: status=${pkg2.status}`);
  }

  // 7. Scenario 3: Empty carton PKG-2026-EMPTY (UID: 04A7B8E1, status: sealed, 0 garments)
  let pkg3 = await db.packages.findFirst({ where: { code: "04A7B8E1" } });
  if (!pkg3) {
    pkg3 = await db.packages.create({
      data: {
        code: "04A7B8E1",
        status: "open",
        created_by: staff.id,
      },
    });
    await db.packages.update({
      where: { id: pkg3.id },
      data: { status: "sealed" },
    });
    console.log(`Created Empty Sealed Carton 04A7B8E1`);
  } else {
    console.log(`Carton 04A7B8E1 already exists: status=${pkg3.status}`);
  }

  // 8. Scenario 4: Quality hold inside carton PKG-2026-HOLD (UID: 04A7B8H3, contains TROUSER-008 with hold)
  const g8 = await db.garments.findFirstOrThrow({ where: { code: "TROUSER-008" } });
  let pkg4 = await db.packages.findFirst({ where: { code: "04A7B8H3" } });
  if (!pkg4) {
    pkg4 = await db.packages.create({
      data: {
        code: "04A7B8H3",
        status: "open",
        created_by: staff.id,
      },
    });
    await db.package_items.create({
      data: { package_id: pkg4.id, garment_id: g8.id, added_by: staff.id },
    });
    await db.packages.update({
      where: { id: pkg4.id },
      data: { status: "sealed" },
    });

    // Now place quality hold on TROUSER-008
    await db.garment_holds.create({
      data: {
        garment_id: g8.id,
        kind: "operational",
        reason: "Fabric surface pilling exceeding grade 3 standard",
        opened_by: staff.id,
      },
    });
    await db.garments.update({
      where: { id: g8.id },
      data: { quality_disposition: "held" },
    });
    console.log(`Created Carton 04A7B8H3 with held garment ${g8.code}`);
  } else {
    console.log(`Carton 04A7B8H3 already exists: status=${pkg4.status}`);
  }

  // 9. Scenario 5: Already received carton PKG-2026-RECEIVED (UID: 04A7B8D2, status: warehoused)
  const g9 = await db.garments.findFirstOrThrow({ where: { code: "TROUSER-009" } });
  const binB1 = await db.warehouse_bins.findFirstOrThrow({ where: { code: "BIN-B1" } });
  let pkg5 = await db.packages.findFirst({ where: { code: "04A7B8D2" } });
  if (!pkg5) {
    pkg5 = await db.packages.create({
      data: {
        code: "04A7B8D2",
        status: "open",
        created_by: staff.id,
      },
    });
    await db.package_items.create({
      data: { package_id: pkg5.id, garment_id: g9.id, added_by: staff.id },
    });
    await db.packages.update({
      where: { id: pkg5.id },
      data: { status: "warehoused" },
    });
    await db.warehouse_stock.create({
      data: {
        package_id: pkg5.id,
        current_bin_id: binB1.id,
      },
    });
    await db.garments.update({
      where: { id: g9.id },
      data: { stage: "warehoused" },
    });
    console.log(`Created Already-Received Carton 04A7B8D2 with ${g9.code} in ${binB1.code}`);
  } else {
    console.log(`Carton 04A7B8D2 already exists: status=${pkg5.status}`);
  }

  // 10. Scenario 6: Master Box 04A7B810 containing exactly 10 QC-approved garments
  const tenGarmentCodes = [
    "GAR-PREFLASH-693702",
    "GAR-PREFLASH-897389",
    "GAR-PREFLASH-723965",
    "GAR-PREFLASH-432417",
    "TROUSER-010",
    "TROUSER-011",
    "TROUSER-012",
    "TROUSER-015",
    "TROUSER-006",
    "GAR-2026-DEMO-01",
  ];

  const tenGarments = await db.garments.findMany({
    where: { code: { in: tenGarmentCodes } },
  });
  console.log(`Resolved ${tenGarments.length} garments for 10-garment carton test.`);

  for (const garment of tenGarments) {
    // Release any holds
    await db.garment_holds.updateMany({
      where: { garment_id: garment.id, released_at: null },
      data: { released_at: new Date(), release_reason: "Pre-warehouse QC verification" },
    });

    // Ensure final pass inspection
    const passInsp = await db.inspections.findFirst({
      where: { garment_id: garment.id, outcome: "pass", scope: "final" },
    });
    if (!passInsp) {
      await db.inspections.create({
        data: {
          code: `INSP-QA-${garment.code}-${Date.now()}`,
          scope: "final",
          checklist_version_id: chk.id,
          garment_id: garment.id,
          inspector_id: staff.id,
          outcome: "pass",
          answers: { visual: "pass", stitching: "pass", measurements: "pass" },
          created_at: new Date(),
          submitted_at: new Date(),
        },
      });
    }

    // Advance to finished and released (ready for warehouse)
    await db.garments.update({
      where: { id: garment.id },
      data: {
        stage: "finished",
        quality_disposition: "released",
      },
    });
  }

  let pkg10 = await db.packages.findFirst({ where: { code: "04A7B810" } });
  if (!pkg10) {
    pkg10 = await db.packages.create({
      data: {
        code: "04A7B810",
        status: "open",
        created_by: staff.id,
      },
    });
    for (const g of tenGarments) {
      await db.package_items.create({
        data: { package_id: pkg10.id, garment_id: g.id, added_by: staff.id },
      });
    }
    await db.packages.update({
      where: { id: pkg10.id },
      data: { status: "sealed" },
    });
    console.log(`Created Sealed Carton 04A7B810 with ${tenGarments.length} QC-approved garments.`);
  } else {
    // Ensure sealed status and not yet in warehouse stock
    await db.warehouse_stock.deleteMany({ where: { package_id: pkg10.id } });
    await db.packages.update({
      where: { id: pkg10.id },
      data: { status: "sealed" },
    });
    // Ensure all 10 items are in pkg10
    const existingItems = await db.package_items.findMany({
      where: { package_id: pkg10.id, removed_at: null },
    });
    const existingGids = new Set(existingItems.map((pi) => pi.garment_id));
    for (const g of tenGarments) {
      if (!existingGids.has(g.id)) {
        await db.package_items.create({
          data: { package_id: pkg10.id, garment_id: g.id, added_by: staff.id },
        });
      }
    }
    console.log(`Reset Carton 04A7B810 to sealed with 10 garments.`);
  }

  console.log("Seeding complete successfully.");
}

main().catch(console.error).finally(() => process.exit(0));
