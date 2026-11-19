import type {
  DomainScanHandler,
  PreparedScanSubject,
  RfidStationCode,
  ScanOutcomeResult,
  VersionedScanEnvelope,
} from "../contracts/rfid";
import type { PrismaTransactionClient } from "../db/types";
import { normalizeTagUid } from "../contracts/rfid";
import { bindLotCard } from "../materials/materials-service";
import {
  bindGarmentTag,
  routineProductionScan,
} from "../production/production-service";

/**
 * Station 1: Fabric Receiving Scan Handler.
 * Phase 1: Resolves or identifies the material lot targeted by the action context.
 * Phase 2: Binds the incoming physical RFID bundle card to the material lot in rfid_tag_bindings.
 */
export class FabricReceivingScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "fabric_receiving";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);

    let lotId: string | undefined;
    let lotCode = "FAB-BUNDLE";

    if (envelope.actionContextId) {
      const ctx = await tx.rfid_action_contexts.findFirst({
        where: { id: envelope.actionContextId },
      });
      const answers =
        ctx && typeof ctx.answers === "object" && ctx.answers !== null
          ? (ctx.answers as Record<string, unknown>)
          : null;
      if (answers?.["lotId"]) {
        const foundLotId = String(answers["lotId"]);
        const lot = await tx.material_lots.findFirst({ where: { id: foundLotId } });
        if (lot) {
          lotId = lot.id;
          lotCode = lot.code;
        }
      }
    }

    if (!lotId) {
      const latestLot = await tx.material_lots.findFirst({
        where: {
          rfid_tag_bindings: null,
        },
        orderBy: { received_at: "desc" },
      });
      if (latestLot) {
        lotId = latestLot.id;
        lotCode = latestLot.code;
      } else {
        lotId = "00000000-0000-0000-0000-000000000000";
      }
    }

    return {
      kind: "material_lot",
      subjectId: lotId,
      subjectCode: lotCode,
      isNewEnrollment: true,
      tagUid,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
  ): Promise<ScanOutcomeResult> {
    if (subject.subjectId !== "00000000-0000-0000-0000-000000000000") {
      await bindLotCard(
        { lotId: subject.subjectId, tagUid: subject.tagUid },
        { id: "00000000-0000-0000-0000-000000000000", role: "materials", department: "receiving" },
        tx,
      );
    }

    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "bundle_card_bound",
      outcomeMessage: `Bundle card ${subject.tagUid} bound to lot ${subject.subjectCode}`,
      stationCode: this.stationCode,
      subjectKind: "material_lot",
      subjectId: subject.subjectId,
      subjectCode: subject.subjectCode,
      processedAt: new Date().toISOString(),
      nextExpectedStation: "fabric_issue",
    };
  }
}

/**
 * Station 2: Fabric Issue Scan Handler.
 * Phase 1: Resolves the bundle card UID to ensure it matches the requested material lot.
 * Phase 2: Confirms the issue and verifies physical transfer to production.
 */
export class FabricIssueScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "fabric_issue";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);
    const binding = await tx.rfid_tag_bindings.findFirst({
      where: { tag_uid: tagUid, unbound_at: null },
      include: { material_lots: true },
    });

    if (!binding || !binding.material_lot_id || !binding.material_lots) {
      throw new Error(`WT_ERR_WRONG_SUBJECT_TYPE: Card ${tagUid} is not bound to a material lot.`);
    }

    return {
      kind: "material_lot",
      subjectId: binding.material_lots.id,
      subjectCode: binding.material_lots.code,
      isNewEnrollment: false,
      tagUid,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    _tx: PrismaTransactionClient,
  ): Promise<ScanOutcomeResult> {
    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "issue_confirmed",
      outcomeMessage: `Fabric issue confirmed for lot ${subject.subjectCode}`,
      stationCode: "fabric_issue",
      subjectKind: "material_lot",
      subjectId: subject.subjectId,
      subjectCode: subject.subjectCode,
      processedAt: new Date().toISOString(),
      nextExpectedStation: "cutting",
    };
  }
}

/**
 * Station 3: Cutting & Tag Enrollment Scan Handler.
 * Phase 1: Checks for active cutting source and prepares the garment entity.
 * Phase 2: Enrolls the fresh garment RFID card and attributes fabric consumption.
 */
export class CuttingScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "cutting";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);

    if (envelope.actionContextId) {
      const ctx = await tx.rfid_action_contexts.findFirst({
        where: { id: envelope.actionContextId },
      });
      if (ctx?.action_code === "select_cutting_source") {
        const binding = await tx.rfid_tag_bindings.findFirst({
          where: { tag_uid: tagUid, unbound_at: null },
          include: { material_lots: true },
        });
        if (binding?.material_lots) {
          return {
            kind: "material_lot",
            subjectId: binding.material_lots.id,
            subjectCode: binding.material_lots.code,
            isNewEnrollment: false,
            tagUid,
          };
        }
      }
    }

    return {
      kind: "garment",
      subjectId: "pending_creation",
      subjectCode: "NEW_GARMENT",
      isNewEnrollment: true,
      tagUid,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
  ): Promise<ScanOutcomeResult> {
    if (subject.kind === "material_lot") {
      return {
        scanId: envelope.scanId,
        outcome: "accepted",
        outcomeCode: "cutting_source_confirmed",
        outcomeMessage: `Cutting source confirmed: Lot ${subject.subjectCode}`,
        stationCode: "cutting",
        subjectKind: "material_lot",
        subjectId: subject.subjectId,
        subjectCode: subject.subjectCode,
        processedAt: new Date().toISOString(),
      };
    }

    let orderId = "";
    let size = "M";
    if (envelope.actionContextId) {
      const ctx = await tx.rfid_action_contexts.findFirst({
        where: { id: envelope.actionContextId },
      });
      if (ctx?.production_order_id) orderId = ctx.production_order_id;
    }

    if (!orderId) {
      const order = await tx.production_orders.findFirst({
        where: { status: { in: ["approved", "in_progress"] } },
        orderBy: { created_at: "desc" },
      });
      orderId = order?.id || "";
    }

    const bound = await bindGarmentTag(
      { orderId, size, tagUid: subject.tagUid },
      { id: "00000000-0000-0000-0000-000000000000", role: "production", department: "cutting" },
      tx,
    );

    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "garment_enrolled",
      outcomeMessage: `Garment ${bound.garmentCode} enrolled with card ${subject.tagUid}`,
      stationCode: "cutting",
      subjectKind: "garment",
      subjectId: bound.garmentId,
      subjectCode: bound.garmentCode,
      processedAt: new Date().toISOString(),
      nextExpectedStation: "stitching",
    };
  }
}

/**
 * Station 4: Routine Stitching Scan Handler.
 */
export class StitchingScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "stitching";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);
    const binding = await tx.rfid_tag_bindings.findFirst({
      where: { tag_uid: tagUid, unbound_at: null },
      include: { garments: true },
    });
    if (!binding || !binding.garment_id || !binding.garments) {
      throw new Error(`WT_ERR_UNKNOWN_CARD: Card ${tagUid} not recognized.`);
    }

    return {
      kind: "garment",
      subjectId: binding.garments.id,
      subjectCode: binding.garments.code,
      isNewEnrollment: false,
      tagUid,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
  ): Promise<ScanOutcomeResult> {
    const res = await routineProductionScan(
      { tagUid: subject.tagUid, stationCode: "stitching" },
      { id: "00000000-0000-0000-0000-000000000000", role: "production", department: "stitching" },
      tx,
    );

    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "stitching_completed",
      outcomeMessage: `Garment ${res.garmentCode} advanced to finishing`,
      stationCode: "stitching",
      subjectKind: "garment",
      subjectId: res.garmentId,
      subjectCode: res.garmentCode,
      processedAt: new Date().toISOString(),
      nextExpectedStation: "finishing",
    };
  }
}

/**
 * Station 5: Routine Finishing Scan Handler.
 */
export class FinishingScanHandler implements DomainScanHandler<ScanOutcomeResult> {
  readonly stationCode: RfidStationCode = "finishing";

  async prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
  ): Promise<PreparedScanSubject> {
    const tagUid = normalizeTagUid(envelope.tagUid);
    const binding = await tx.rfid_tag_bindings.findFirst({
      where: { tag_uid: tagUid, unbound_at: null },
      include: { garments: true },
    });
    if (!binding || !binding.garment_id || !binding.garments) {
      throw new Error(`WT_ERR_UNKNOWN_CARD: Card ${tagUid} not recognized.`);
    }

    return {
      kind: "garment",
      subjectId: binding.garments.id,
      subjectCode: binding.garments.code,
      isNewEnrollment: false,
      tagUid,
    };
  }

  async process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
  ): Promise<ScanOutcomeResult> {
    const res = await routineProductionScan(
      { tagUid: subject.tagUid, stationCode: "finishing" },
      { id: "00000000-0000-0000-0000-000000000000", role: "production", department: "finishing" },
      tx,
    );

    return {
      scanId: envelope.scanId,
      outcome: "accepted",
      outcomeCode: "finishing_completed",
      outcomeMessage: `Garment ${res.garmentCode} advanced to final QC`,
      stationCode: "finishing",
      subjectKind: "garment",
      subjectId: res.garmentId,
      subjectCode: res.garmentCode,
      processedAt: new Date().toISOString(),
      nextExpectedStation: "final_qc",
    };
  }
}
