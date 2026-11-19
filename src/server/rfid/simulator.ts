import crypto from "node:crypto";
import {
  normalizeTagUid,
  type ScanOutcomeResult,
  type VersionedScanEnvelope,
} from "../contracts/rfid";

export interface SimulateScanOptions {
  /** Target API base URL (defaults to http://localhost:3001) */
  baseUrl?: string;
  /** Valid pre-shared device secret registered in device_credentials */
  deviceSecret: string;
  /** Device UUID matching the credential */
  deviceId: string;
  /** Reader index on hardware antenna board (0..8) */
  readerIndex: number;
  /** Active device mapping version */
  mappingVersion: number;
  /** RFID UID hex string */
  tagUid: string;
  /** Optional action context UUID (required for final_qc and cutting) */
  actionContextId?: string | null;
  /** Optional custom scan UUID (auto-generated if omitted) */
  scanId?: string;
  /** Optional firmware boot UUID */
  bootId?: string;
  /** Monotonic sequence counter */
  sequence?: number;
  /** Device uptime in milliseconds */
  deviceUptimeMs?: number;
}

export interface SimulationResult {
  envelope: VersionedScanEnvelope;
  statusCode: number;
  outcome?: ScanOutcomeResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Creates a valid, well-formed VersionedScanEnvelope for testing and simulation.
 */
export function buildSimulatedEnvelope(
  options: SimulateScanOptions,
): VersionedScanEnvelope {
  return {
    version: "v1",
    deviceId: options.deviceId,
    scanId: options.scanId ?? crypto.randomUUID(),
    bootId: options.bootId ?? "sim-boot-0001",
    sequence: options.sequence ?? 1,
    readerIndex: options.readerIndex,
    mappingVersion: options.mappingVersion,
    tagUid: normalizeTagUid(options.tagUid),
    actionContextId: options.actionContextId ?? null,
    deviceUptimeMs: options.deviceUptimeMs ?? 42000,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Dispatches a simulated scan envelope over HTTP to the real Express /api/rfid/scan endpoint.
 * Exercises the identical transport, authentication, validation, and database pipeline as hardware.
 */
export async function dispatchSimulatedScanHttp(
  options: SimulateScanOptions,
): Promise<SimulationResult> {
  const baseUrl = options.baseUrl ?? "http://localhost:3001";
  const envelope = buildSimulatedEnvelope(options);

  const response = await fetch(`${baseUrl}/api/rfid/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.deviceSecret}`,
      "X-WearTrail-Client": "Hardware-Simulator-v1",
    },
    body: JSON.stringify(envelope),
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (response.ok && body["success"]) {
    return {
      envelope,
      statusCode: response.status,
      outcome: body["data"] as ScanOutcomeResult,
    };
  }

  const err = body["error"] as { code: string; message: string; details?: unknown } | undefined;
  return {
    envelope,
    statusCode: response.status,
    error: err ?? {
      code: "WT_ERR_SIMULATION_FAILED",
      message: `HTTP request failed with status ${response.status}`,
    },
  };
}
