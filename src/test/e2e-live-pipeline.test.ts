import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createExpressApp } from "../server/app";
import { prisma } from "../server/db/client";

describe("Live API End-to-End Pipeline: Stations 1 to 9", { timeout: 60000 }, () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createExpressApp();
    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  const DEMO_ACTORS: Record<string, { id: string; username: string }> = {
    receiving: { id: "b79696ca-aeea-49c2-b6c4-2aa1a55e391b", username: "receiving.demo" },
    raw_store: { id: "fd75c7c9-cb34-46d4-9fcb-927eac851361", username: "rawstore.demo" },
    cutting: { id: "8d21ca49-df0b-4ab5-a7ff-80753b087ab4", username: "cutting.demo" },
    stitching: { id: "57f4c3ff-01cd-4b89-8ad0-16fa9e9394c2", username: "stitching.demo" },
    finishing: { id: "09abcce4-0126-42bc-bfdb-8e3f76332ee8", username: "finishing.demo" },
    quality: { id: "a72c497f-3c32-448c-8999-76cd94905fb6", username: "qc.demo" },
    packing: { id: "25a00e88-ca6c-4432-b460-6f75ab530fce", username: "packing.demo" },
    warehouse: { id: "e902dc1d-2387-4b70-8bde-54be7e87c248", username: "warehouse.demo" },
    dispatch: { id: "1bec9c03-fff0-4bf6-9531-17b4aba9f94c", username: "dispatch.demo" },
    admin: { id: "03221414-8e7e-4063-8054-e2426d7677c1", username: "admin.demo" },
  };

  // Helper for authorized HTTP requests
  async function api(
    method: "GET" | "POST",
    path: string,
    body?: any,
    role: string = "admin",
    dept: string = "dispatch",
  ) {
    const actor = DEMO_ACTORS[dept] || DEMO_ACTORS[role] || DEMO_ACTORS["admin"]!;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-actor-role": role,
        "x-actor-dept": dept,
        "x-actor-username": actor.username,
        "x-actor-id": actor.id,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json();
    return { status: res.status, data: json };
  }

  it("successfully traverses the complete lifecycle from Station 1 (Receiving) through Station 9 (Dispatch)", async () => {
    const runId = Date.now().toString().slice(-6);
    const runHex = (Math.floor(Math.random() * 0x8fffff) + 0x100000).toString(16).toUpperCase();
    const bundleTagUid = `A1${runHex}`;
    const garmentTagUid = `B2${runHex}`;
    const boxTagUid = `C3${runHex}`;
    const boxCode = `BOX-${runId}`;

    // -------------------------------------------------------------------------
    // Station 1: Receiving - Receive Material Lot & Incoming QC
    // -------------------------------------------------------------------------
    const resLot = await api(
      "POST",
      "/api/materials/lots",
      {
        materialName: "Premium Supima Cotton",
        quantity: 50,
        unit: "m",
        supplierRef: `SUP-LOT-${runId}`,
        receiptRef: `REC-${runId}`,
      },
      "receiving",
      "receiving",
    );
    expect(resLot.status).toBe(201);
    expect(resLot.data.success).toBe(true);
    const lotId = resLot.data.data.lotId || resLot.data.data.id;
    const lotCode = resLot.data.data.lotCode || resLot.data.data.code;

    // Bind bundle card to the fabric lot (completes Station 1 receiving registration)
    const resArmLot = await api(
      "POST",
      "/api/rfid/contexts",
      {
        stationCode: "fabric_receiving",
        kind: "assign_bundle_card",
        payload: { lotId, lotCode },
      },
      "receiving",
      "receiving",
    );
    expect(resArmLot.status).toBe(201);
    const lotContextId = resArmLot.data.data.contextId || resArmLot.data.data.id;

    const resScanBundle = await api(
      "POST",
      "/api/rfid/ui-scan",
      {
        uid: bundleTagUid,
        stationCode: "fabric_receiving",
        actionContextId: lotContextId,
      },
      "receiving",
      "receiving",
    );
    expect(resScanBundle.status).toBe(200);
    expect(resScanBundle.data.data.outcome).toBe("accepted");

    // Incoming QC inspection (accept fabric into usable stock)
    const resIncomingQc = await api(
      "POST",
      "/api/quality/incoming-qc",
      {
        lotId,
        result: "pass",
        acceptedQty: 50,
        heldQty: 0,
        rejectedQty: 0,
        notes: "Certified density and weave inspection passed.",
      },
      "quality",
      "quality",
    );
    if (resIncomingQc.status !== 201) {
      console.error("Incoming QC failed:", JSON.stringify(resIncomingQc.data, null, 2));
    }
    expect(resIncomingQc.status).toBe(201);
    expect(resIncomingQc.data.success).toBe(true);

    // -------------------------------------------------------------------------
    // Station 2: Raw Store / Issue - Create Production Order & Issue Fabric
    // -------------------------------------------------------------------------
    const resOrder = await api(
      "POST",
      "/api/production/orders",
      {
        styleCode: "WT-SH-100",
        targetQuantity: 10,
        requiredMeters: 20,
        plannedStartDate: new Date().toISOString(),
      },
      "production",
      "cutting",
    );
    expect(resOrder.status).toBe(201);
    const orderId = resOrder.data.data.orderId || resOrder.data.data.id;
    const orderCode = resOrder.data.data.orderCode || resOrder.data.data.code;

    // Approve production order so fabric can be issued to it (raw-store / materials)
    const resApprove = await api(
      "POST",
      `/api/production/orders/${orderId}/approve`,
      {},
      "materials",
      "raw_store",
    );
    expect(resApprove.status).toBe(200);

    // Issue fabric for production order using bundle card
    const resArmIssue = await api(
      "POST",
      "/api/rfid/contexts",
      {
        stationCode: "fabric_issue",
        kind: "confirm_issue",
        payload: { orderId, productionOrderId: orderId, metersToIssue: 20 },
      },
      "materials",
      "raw_store",
    );
    expect(resArmIssue.status).toBe(201);
    const issueContextId = resArmIssue.data.data.contextId || resArmIssue.data.data.id;

    const resScanIssue = await api(
      "POST",
      "/api/rfid/ui-scan",
      {
        uid: bundleTagUid,
        stationCode: "fabric_issue",
        actionContextId: issueContextId,
      },
      "materials",
      "raw_store",
    );
    expect(resScanIssue.status).toBe(200);
    expect(resScanIssue.data.data.outcome).toBe("accepted");

    // -------------------------------------------------------------------------
    // Station 3: Cutting - Enroll Garment Tag & Output
    // -------------------------------------------------------------------------
    // First select cutting source using bundle card
    const resArmCutSource = await api(
      "POST",
      "/api/rfid/contexts",
      {
        stationCode: "cutting",
        kind: "select_cutting_source",
        payload: { productionOrderId: orderId, orderId },
      },
      "production",
      "cutting",
    );
    expect(resArmCutSource.status).toBe(201);
    const cutSourceCtxId = resArmCutSource.data.data.contextId || resArmCutSource.data.data.id;

    const resScanCutSource = await api(
      "POST",
      "/api/rfid/ui-scan",
      {
        uid: bundleTagUid,
        stationCode: "cutting",
        actionContextId: cutSourceCtxId,
      },
      "production",
      "cutting",
    );
    expect(resScanCutSource.status).toBe(200);
    expect(resScanCutSource.data.data.outcome).toBe("accepted");

    // Bind garment RFID tag to new shirt output
    const resArmCutTag = await api(
      "POST",
      "/api/rfid/contexts",
      {
        stationCode: "cutting",
        kind: "bind_garment_tag",
        payload: { productionOrderId: orderId, orderId, size: "M" },
      },
      "production",
      "cutting",
    );
    expect(resArmCutTag.status).toBe(201);
    const cutTagCtxId = resArmCutTag.data.data.contextId || resArmCutTag.data.data.id;

    const resScanCutTag = await api(
      "POST",
      "/api/rfid/ui-scan",
      {
        uid: garmentTagUid,
        stationCode: "cutting",
        actionContextId: cutTagCtxId,
      },
      "production",
      "cutting",
    );
    expect(resScanCutTag.status).toBe(200);
    expect(resScanCutTag.data.data.outcome).toBe("accepted");
    const garmentId = resScanCutTag.data.data.subjectId;
    const garmentCode = resScanCutTag.data.data.subjectCode;
    expect(garmentId).toBeDefined();

    // -------------------------------------------------------------------------
    // Station 4: Stitching - Hardware Scan advances to 'stitched'
    // -------------------------------------------------------------------------
    const resStitch = await api(
      "POST",
      "/api/rfid/ui-scan",
      {
        uid: garmentTagUid,
        stationCode: "stitching",
      },
      "production",
      "stitching",
    );
    expect(resStitch.status).toBe(200);
    expect(resStitch.data.data.outcome).toBe("accepted");

    // -------------------------------------------------------------------------
    // Station 5: Finishing - Hardware Scan advances to 'finished'
    // -------------------------------------------------------------------------
    const resFinish = await api(
      "POST",
      "/api/rfid/ui-scan",
      {
        uid: garmentTagUid,
        stationCode: "finishing",
      },
      "production",
      "finishing",
    );
    expect(resFinish.status).toBe(200);
    expect(resFinish.data.data.outcome).toBe("accepted");

    // -------------------------------------------------------------------------
    // Station 6: Final QA - Result-First: Arm Pass -> Scan Card -> Released
    // -------------------------------------------------------------------------
    const resArmQc = await api(
      "POST",
      "/api/rfid/contexts",
      {
        stationCode: "final_qc",
        kind: "submit_qc",
        payload: {
          qcOutcome: "pass",
          outcome: "pass",
          scope: "final",
          answers: { seamIntegrity: true, measurementCompliant: true },
        },
      },
      "quality",
      "quality",
    );
    expect(resArmQc.status).toBe(201);
    const qcContextId = resArmQc.data.data.contextId || resArmQc.data.data.id;

    const resScanQc = await api(
      "POST",
      "/api/rfid/ui-scan",
      {
        uid: garmentTagUid,
        stationCode: "final_qc",
        actionContextId: qcContextId,
      },
      "quality",
      "quality",
    );
    expect(resScanQc.status).toBe(200);
    expect(resScanQc.data.data.outcome).toBe("accepted");
    expect(resScanQc.data.data.outcomeCode).toBe("QC_PASSED");

    // Verify garment is released for packing
    const resGarmentCheck = await api("GET", `/api/production/garments/${garmentId}`, undefined, "quality", "quality");
    expect(resGarmentCheck.status).toBe(200);
    expect(resGarmentCheck.data.data.qualityDisposition).toBe("released");

    // -------------------------------------------------------------------------
    // Station 7: Packaging & Master Carton Aggregation
    // -------------------------------------------------------------------------
    // 1. Create package with box code and box RFID tag
    const resPkg = await api(
      "POST",
      "/api/fulfilment/packages",
      {
        code: boxCode,
        rfidUid: boxTagUid,
      },
      "logistics",
      "packing",
    );
    expect(resPkg.status).toBe(201);

    // 2. Pack the QC-passed garment into the carton
    const resPack = await api(
      "POST",
      "/api/fulfilment/pack-garment",
      {
        packageId: boxCode,
        garmentId: garmentCode,
      },
      "logistics",
      "packing",
    );
    expect(resPack.status).toBe(201);

    // 3. Seal the box
    const resSeal = await api(
      "POST",
      `/api/fulfilment/packages/${encodeURIComponent(boxCode)}/seal`,
      {},
      "logistics",
      "packing",
    );
    expect(resSeal.status).toBe(200);

    // -------------------------------------------------------------------------
    // Station 8: Finished Goods Warehouse Intake
    // -------------------------------------------------------------------------
    // Hardware Scanner 8 scans the Master Box RFID tag (or box code)
    const resIntake = await api(
      "POST",
      "/api/rfid/warehouse-intake",
      {
        tagUid: boxCode,
        binId: "BIN-A1",
      },
      "logistics",
      "warehouse",
    );
    expect(resIntake.status).toBe(200);
    expect(resIntake.data.data.resolution).toBe("accepted");

    // Verify fulfilment overview shows carton in warehouse stock
    const resFulfilment = await api("GET", "/api/fulfilment", undefined, "logistics", "warehouse");
    expect(resFulfilment.status).toBe(200);
    const inStockCarton = resFulfilment.data.data.packages.find((p: any) => p.code === boxCode || p.id === boxCode);
    expect(inStockCarton).toBeDefined();
    expect(inStockCarton.status).toBe("warehoused");

    // -------------------------------------------------------------------------
    // Station 9: Dispatch Outbound Gate - Single-Scan Box Dispatch
    // -------------------------------------------------------------------------
    // Operator scans box tag on hardware reader 9
    const resDispatch = await api(
      "POST",
      "/api/fulfilment/dispatch-box",
      {
        boxTagOrId: boxCode,
      },
      "logistics",
      "dispatch",
    );
    expect(resDispatch.status).toBe(200);
    expect(resDispatch.data.data.resolution).toBe("accepted");
    expect(resDispatch.data.data.outcome).toBe("accepted");

    // Verify package and child garment are now atomically dispatched
    const resFinalFulfilment = await api("GET", "/api/fulfilment", undefined, "logistics", "dispatch");
    expect(resFinalFulfilment.status).toBe(200);
    const dispatchedCarton = resFinalFulfilment.data.data.packages.find((p: any) => p.code === boxCode || p.id === boxCode);
    expect(dispatchedCarton).toBeDefined();
    expect(dispatchedCarton.status).toBe("dispatched");

    // Verify garment is dispatched in production API
    const resGarmentFinal = await api("GET", `/api/production/garments/${garmentId}`, undefined, "logistics", "dispatch");
    expect(resGarmentFinal.status).toBe(200);
    expect(resGarmentFinal.data.data.stage).toBe("dispatched");

    // Verify garment DPP public payload
    const resPublicJourney = await api("GET", `/api/public/journey/${garmentCode}`);
    expect(resPublicJourney.status).toBe(200);
    expect(resPublicJourney.data.data.status).toBe("Dispatched to authorized retail network");
  });
});
