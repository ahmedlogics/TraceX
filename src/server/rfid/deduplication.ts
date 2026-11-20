import crypto from "node:crypto";
import type { PrismaClient, rfid_scans } from "@prisma/client";
import type { PrismaTransactionClient } from "../db/types";
import {
  normalizeTagUid,
  type RfidStationCode,
  type ScanOutcome,
  type ScanOutcomeResult,
  type VersionedScanEnvelope,
} from "../contracts/rfid";

/**
 * Computes a deterministic 32-byte SHA-256 fingerprint from the normalized scan envelope fields.
 * Used for database-backed deduplication and replay conflict detection.
 */
export function computeRequestFingerprint(envelope: VersionedScanEnvelope): Buffer {
  const normalized = {
    actionContextId: envelope.actionContextId ?? null,
    bootId: envelope.bootId,
    deviceId: envelope.deviceId,
    mappingVersion: envelope.mappingVersion,
    readerIndex: envelope.readerIndex,
    scanId: envelope.scanId,
    sequence: envelope.sequence,
    tagUid: normalizeTagUid(envelope.tagUid),
    version: envelope.version,
  };
  const jsonStr = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(jsonStr, "utf8").digest();
}

export interface ExistingScanEvaluation {
  isDuplicate: boolean;
  isConflict: boolean;
  existingScan?: rfid_scans;
}

/**
 * Queries the database for an existing scan using either (device_id, scan_id)
 * or (device_id, boot_id, sequence).
 * Evaluates whether it represents an identical retry or a conflicting payload reuse.
 */
export async function checkExistingScan(
  envelope: VersionedScanEnvelope,
  requestFingerprint: Buffer,
  db: PrismaClient | PrismaTransactionClient,
): Promise<ExistingScanEvaluation> {
  const existing = await db.rfid_scans.findFirst({
    where: {
      device_id: envelope.deviceId,
      OR: [
        { scan_id: envelope.scanId },
        {
          boot_id: envelope.bootId,
          sequence: BigInt(envelope.sequence),
        },
      ],
    },
  });

  if (!existing) {
    return { isDuplicate: false, isConflict: false };
  }

  const isMatch = Buffer.compare(existing.request_sha256, requestFingerprint) === 0;

  if (isMatch) {
    return {
      isDuplicate: true,
      isConflict: false,
      existingScan: existing,
    };
  }

  return {
    isDuplicate: true,
    isConflict: true,
    existingScan: existing,
  };
}

/**
 * Formats a persisted rfid_scans record into the standard ScanOutcomeResult DTO.
 */
export function existingScanToOutcome(scan: rfid_scans): ScanOutcomeResult {
  const result: ScanOutcomeResult = {
    scanId: scan.scan_id,
    outcome: (scan.outcome as ScanOutcome) ?? "accepted",
    outcomeCode: scan.outcome_code,
    stationCode: (scan.station_code ?? "cutting") as RfidStationCode,
    processedAt: scan.received_at.toISOString(),
    isDuplicate: true,
  };

  if (scan.outcome_message) {
    (result as any).outcomeMessage = scan.outcome_message;
  }
  if (scan.garment_id) {
    (result as any).subjectKind = "garment";
    (result as any).subjectId = scan.garment_id;
  } else if (scan.material_lot_id) {
    (result as any).subjectKind = "material_lot";
    (result as any).subjectId = scan.material_lot_id;
  }

  return result;
}
