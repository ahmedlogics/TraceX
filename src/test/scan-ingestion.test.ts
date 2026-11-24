import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  VersionedScanEnvelopeSchema,
} from "../server/rfid/schemas";
import {
  authenticateDevice,
  extractDeviceSecret,
  hashDeviceSecret,
} from "../server/rfid/device-auth";
import {
  resolveReaderSession,
  isOperatorAuthorizedForStation,
} from "../server/rfid/session-resolver";
import {
  validateActionContext,
  stationRequiresContext,
} from "../server/rfid/context-validator";
import {
  checkExistingScan,
  computeRequestFingerprint,
} from "../server/rfid/deduplication";
import {
  ScanRoutingService,
} from "../server/rfid/scan-router";
import type {
  DomainScanContext,
  DomainScanHandler,
  PreparedScanSubject,
  ScanOutcomeResult,
  VersionedScanEnvelope,
} from "../server/contracts/rfid";
import { ApiError } from "../server/middleware/responses";

// ============================================================================
// Isolated In-Memory Test DB Fixtures & Mock Factory
// ============================================================================

const TEST_DEVICE_ID = "11111111-1111-4111-a111-111111111111";
const TEST_OPERATOR_ID = "22222222-2222-4222-a222-222222222222";
const TEST_SESSION_ID = "33333333-3333-4333-a333-333333333333";
const TEST_CONTEXT_ID = "44444444-4444-4444-a444-444444444444";
const TEST_TAG_BINDING_ID = "55555555-5555-4555-a555-555555555555";
const TEST_GARMENT_ID = "66666666-6666-4666-a666-666666666666";
const TEST_DEVICE_SECRET = "test_valid_device_secret_2026";
const TEST_SECRET_DIGEST = hashDeviceSecret(TEST_DEVICE_SECRET);

async function expectApiError(promise: Promise<any>, expectedStatus: number, expectedCode: string) {
  try {
    await promise;
    expect.fail("Expected promise to reject with ApiError");
  } catch (err: any) {
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(expectedStatus);
    expect(err.errorCode).toBe(expectedCode);
  }
}

function createIsolatedMockDb() {
  const store = {
    devices: [
      {
        id: TEST_DEVICE_ID,
        code: "DEV-BENCH-01",
        name: "Factory Floor Prototype Bridge",
        enabled: true,
      },
    ] as any[],
    device_credentials: [
      {
        id: "cred-01",
        device_id: TEST_DEVICE_ID,
        credential_digest: TEST_SECRET_DIGEST,
        revoked_at: null,
        expires_at: null,
        devices: { id: TEST_DEVICE_ID, name: "Factory Floor Prototype Bridge", enabled: true },
      },
    ] as any[],
    device_mapping_versions: [
      {
        device_id: TEST_DEVICE_ID,
        version: 1,
        activated_at: new Date("2026-11-01"),
        retired_at: null,
      },
    ] as any[],
    device_reader_mappings: [
      {
        device_id: TEST_DEVICE_ID,
        mapping_version: 1,
        reader_index: 2,
        station_code: "cutting",
      },
      {
        device_id: TEST_DEVICE_ID,
        mapping_version: 1,
        reader_index: 5,
        station_code: "final_qc",
      },
    ] as any[],
    staff_users: [
      {
        id: TEST_OPERATOR_ID,
        username: "op_quality",
        full_name: "Alice Inspector",
        role: "quality",
        department: "quality",
        status: "active",
      },
    ] as any[],
    reader_sessions: [
      {
        id: TEST_SESSION_ID,
        device_id: TEST_DEVICE_ID,
        mapping_version: 1,
        reader_index: 5,
        station_code: "final_qc",
        operator_id: TEST_OPERATOR_ID,
        staff_session_id: "staff-sess-01",
        opened_at: new Date("2026-11-19T10:00:00Z"),
        expires_at: new Date("2026-11-19T22:00:00Z"),
        closed_at: null,
        staff_users: {
          id: TEST_OPERATOR_ID,
          username: "op_quality",
          full_name: "Alice Inspector",
          role: "quality",
          department: "quality",
          status: "active",
        },
      },
    ] as any[],
    rfid_action_contexts: [
      {
        id: TEST_CONTEXT_ID,
        reader_session_id: TEST_SESSION_ID,
        action_code: "submit_qc",
        status: "armed",
        created_at: new Date("2026-11-19T10:00:00Z"),
        expires_at: new Date(Date.now() + 300000), // 5 min from now
        acknowledged_at: new Date("2026-11-19T10:05:01Z"),
        closed_at: null,
        qc_scope: "final",
        qc_outcome: "pass",
        answers: { stitches: true, seams: true },
        defect_reason: null,
        notes: "Passed visual inspection",
      },
    ] as any[],
    rfid_stations: [
      { code: "cutting", requires_explicit_context: true },
      { code: "final_qc", requires_explicit_context: true },
      { code: "stitching", requires_explicit_context: false },
    ] as any[],
    rfid_tag_bindings: [
      {
        id: TEST_TAG_BINDING_ID,
        garment_id: TEST_GARMENT_ID,
        tag_identifier: "E280116060000204",
        unbound_at: null,
      },
    ] as any[],
    rfid_scans: [] as any[],
  };

  const db: any = {
    $transaction: async (fn: any) => fn(db),
    devices: {
      findUnique: async ({ where }: any) => store.devices.find((d) => d.id === where.id) ?? null,
    },
    device_credentials: {
      findFirst: async ({ where }: any) => {
        const cred = store.device_credentials.find((c) => {
          if (where.credential_digest && Buffer.compare(c.credential_digest, where.credential_digest) !== 0) {
            return false;
          }
          if (where.revoked_at === null && c.revoked_at !== null) return false;
          return true;
        });
        if (!cred) return null;
        const dev = store.devices.find((d) => d.id === cred.device_id);
        return {
          ...cred,
          devices: dev ? { ...dev } : cred.devices,
        };
      },
    },
    device_mapping_versions: {
      findUnique: async ({ where }: any) => {
        const key = where.device_id_version;
        return (
          store.device_mapping_versions.find(
            (m) => m.device_id === key.device_id && m.version === key.version,
          ) ?? null
        );
      },
    },
    device_reader_mappings: {
      findUnique: async ({ where }: any) => {
        const key = where.device_id_mapping_version_reader_index;
        return (
          store.device_reader_mappings.find(
            (r) =>
              r.device_id === key.device_id &&
              r.mapping_version === key.mapping_version &&
              r.reader_index === key.reader_index,
          ) ?? null
        );
      },
    },
    reader_sessions: {
      findFirst: async ({ where }: any) => {
        return (
          store.reader_sessions.find((s) => {
            if (s.device_id !== where.device_id) return false;
            if (s.mapping_version !== where.mapping_version) return false;
            if (s.reader_index !== where.reader_index) return false;
            if (s.station_code !== where.station_code) return false;
            if (where.closed_at === null && s.closed_at !== null) return false;
            return true;
          }) ?? null
        );
      },
    },
    rfid_action_contexts: {
      findUnique: async ({ where }: any) =>
        store.rfid_action_contexts.find((c) => c.id === where.id) ?? null,
      findFirst: async ({ where }: any) => {
        return (
          store.rfid_action_contexts.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.reader_session_id && c.reader_session_id !== where.reader_session_id) return false;
            if (where.closed_at === null && c.closed_at !== null) return false;
            if (where.status && where.status.in && !where.status.in.includes(c.status)) return false;
            return true;
          }) ?? null
        );
      },
      update: async ({ where, data }: any) => {
        const ctx = store.rfid_action_contexts.find((c) => c.id === where.id);
        if (ctx) Object.assign(ctx, data);
        return ctx;
      },
    },
    rfid_stations: {
      findUnique: async ({ where }: any) =>
        store.rfid_stations.find((s) => s.code === where.code) ?? null,
    },
    rfid_tag_bindings: {
      findFirst: async ({ where }: any) => {
        return (
          store.rfid_tag_bindings.find(
            (b) => b.tag_identifier === where.tag_identifier && (where.unbound_at === null ? b.unbound_at === null : true),
          ) ?? null
        );
      },
    },
    rfid_scans: {
      findUnique: async ({ where }: any) => {
        if (where.device_id_scan_id) {
          const k = where.device_id_scan_id;
          return store.rfid_scans.find((s) => s.device_id === k.device_id && s.scan_id === k.scan_id) ?? null;
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        return (
          store.rfid_scans.find((s) => {
            if (where.device_id && s.device_id !== where.device_id) return false;
            if (where.scan_id && s.scan_id === where.scan_id) return true;
            if (where.boot_id && BigInt(s.sequence) === BigInt(where.sequence)) return true;
            const matchScanId = where.OR?.some((cond: any) => cond.scan_id === s.scan_id);
            const matchSeq = where.OR?.some(
              (cond: any) => cond.boot_id === s.boot_id && BigInt(cond.sequence) === BigInt(s.sequence),
            );
            return matchScanId || matchSeq;
          }) ?? null
        );
      },
      create: async ({ data }: any) => {
        const record = { id: crypto.randomUUID(), received_at: new Date(), ...data };
        store.rfid_scans.push(record);
        return record;
      },
      upsert: async ({ where, update, create }: any) => {
        const k = where.device_id_scan_id;
        const existing = store.rfid_scans.find((s) => s.device_id === k.device_id && s.scan_id === k.scan_id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const record = { id: crypto.randomUUID(), received_at: new Date(), ...create };
        store.rfid_scans.push(record);
        return record;
      },
    },
    _store: store,
  };

  return db as PrismaClient & { _store: typeof store };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("WearTrail Authenticated Scan Ingestion & Dispatcher (Member 1)", () => {
  let mockDb: ReturnType<typeof createIsolatedMockDb>;
  let scanRouter: ScanRoutingService;

  beforeEach(() => {
    mockDb = createIsolatedMockDb();
    scanRouter = new ScanRoutingService();
  });

  describe("1. Envelope Schema Validation", () => {
    it("accepts a strictly valid VersionedScanEnvelope v1", () => {
      const valid = {
        version: "v1",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-valid-01",
        bootId: "boot-01",
        sequence: 42,
        readerIndex: 5,
        mappingVersion: 1,
        tagUid: "e2:80:11:60:60:00:02", // 14 hex chars (7 bytes) with colons
        actionContextId: TEST_CONTEXT_ID,
        deviceUptimeMs: 120000,
        timestamp: new Date().toISOString(),
      };

      const result = VersionedScanEnvelopeSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tagUid).toBe("E2801160600002");
      }
    });

    it("rejects an invalid envelope version", () => {
      const invalid = {
        version: "v2",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-01",
        bootId: "boot-01",
        sequence: 1,
        readerIndex: 1,
        mappingVersion: 1,
        tagUid: "E2801160",
      };
      const result = VersionedScanEnvelopeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects a malformed tag UID format", () => {
      const invalid = {
        version: "v1",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-01",
        bootId: "boot-01",
        sequence: 1,
        readerIndex: 1,
        mappingVersion: 1,
        tagUid: "NOT_HEX_UID_123",
      };
      const result = VersionedScanEnvelopeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("2. Device Credential Authentication", () => {
    it("extracts device secret from Authorization Bearer header", () => {
      const headers = { authorization: `Bearer ${TEST_DEVICE_SECRET}` };
      expect(extractDeviceSecret(headers)).toBe(TEST_DEVICE_SECRET);
    });

    it("extracts device secret from X-Device-Secret header", () => {
      const headers = { "x-device-secret": TEST_DEVICE_SECRET };
      expect(extractDeviceSecret(headers)).toBe(TEST_DEVICE_SECRET);
    });

    it("throws 401 WT_ERR_DEVICE_UNAUTHORIZED if secret header is missing", async () => {
      await expectApiError(
        authenticateDevice({}, TEST_DEVICE_ID, mockDb),
        401,
        "WT_ERR_DEVICE_UNAUTHORIZED",
      );
    });

    it("throws 401 WT_ERR_INVALID_DEVICE_CREDENTIAL if secret does not match", async () => {
      const badHeaders = { authorization: "Bearer invalid_secret_key" };
      await expectApiError(
        authenticateDevice(badHeaders, TEST_DEVICE_ID, mockDb),
        401,
        "WT_ERR_INVALID_DEVICE_CREDENTIAL",
      );
    });

    it("throws 403 WT_ERR_DEVICE_DISABLED if device is disabled", async () => {
      mockDb._store.devices[0].enabled = false;
      const headers = { authorization: `Bearer ${TEST_DEVICE_SECRET}` };

      await expectApiError(
        authenticateDevice(headers, TEST_DEVICE_ID, mockDb),
        403,
        "WT_ERR_DEVICE_DISABLED",
      );
    });

    it("throws 403 WT_ERR_DEVICE_IDENTITY_MISMATCH if claimed device ID differs from credential", async () => {
      const foreignDeviceId = "99999999-9999-4999-a999-999999999999";
      const headers = { authorization: `Bearer ${TEST_DEVICE_SECRET}` };

      await expectApiError(
        authenticateDevice(headers, foreignDeviceId, mockDb),
        403,
        "WT_ERR_DEVICE_IDENTITY_MISMATCH",
      );
    });
  });

  describe("3. Reader Mapping & Operator Session Resolution", () => {
    it("resolves active reader mapping, active operator session, and ActorContext", async () => {
      const resolved = await resolveReaderSession(TEST_DEVICE_ID, 1, 5, mockDb);
      expect(resolved.stationCode).toBe("final_qc");
      expect(resolved.session.id).toBe(TEST_SESSION_ID);
      expect(resolved.actor.actorId).toBe(TEST_OPERATOR_ID);
      expect(resolved.actor.role).toBe("quality");
    });

    it("rejects retired or inactive mapping version with WT_ERR_INACTIVE_MAPPING", async () => {
      mockDb._store.device_mapping_versions[0].retired_at = new Date();
      await expectApiError(
        resolveReaderSession(TEST_DEVICE_ID, 1, 5, mockDb),
        400,
        "WT_ERR_INACTIVE_MAPPING",
      );
    });

    it("rejects unmapped reader index with WT_ERR_UNMAPPED_READER", async () => {
      await expectApiError(
        resolveReaderSession(TEST_DEVICE_ID, 1, 8, mockDb), // reader 8 not in mappings
        400,
        "WT_ERR_UNMAPPED_READER",
      );
    });

    it("rejects when no active operator session exists with WT_ERR_NO_OPERATOR_SESSION", async () => {
      mockDb._store.reader_sessions[0].closed_at = new Date(); // closed session
      await expectApiError(
        resolveReaderSession(TEST_DEVICE_ID, 1, 5, mockDb),
        400,
        "WT_ERR_NO_OPERATOR_SESSION",
      );
    });

    it("rejects when operator does not have permitted role with WT_ERR_OPERATOR_FORBIDDEN", async () => {
      mockDb._store.staff_users[0].role = "materials";
      mockDb._store.staff_users[0].department = "receiving";
      mockDb._store.reader_sessions[0].staff_users.role = "materials";
      mockDb._store.reader_sessions[0].staff_users.department = "receiving";

      // materials role is forbidden from operating final_qc
      await expectApiError(
        resolveReaderSession(TEST_DEVICE_ID, 1, 5, mockDb),
        403,
        "WT_ERR_OPERATOR_FORBIDDEN",
      );
    });
  });

  describe("4. Action Context Validation", () => {
    it("validates an armed action context belonging to the active reader session", async () => {
      const ctx = await validateActionContext(TEST_CONTEXT_ID, TEST_SESSION_ID, "final_qc", mockDb);
      expect(ctx).not.toBeNull();
      expect(ctx?.id).toBe(TEST_CONTEXT_ID);
      expect(ctx?.status).toBe("armed");
    });

    it("rejects missing context on station requiring explicit context with WT_ERR_CONTEXT_REQUIRED", async () => {
      await expectApiError(
        validateActionContext(null, TEST_SESSION_ID, "final_qc", mockDb),
        400,
        "WT_ERR_CONTEXT_REQUIRED",
      );
    });

    it("rejects context belonging to a different reader session with WT_ERR_CONTEXT_SESSION_MISMATCH", async () => {
      const foreignSessionId = "88888888-8888-4888-a888-888888888888";
      await expectApiError(
        validateActionContext(TEST_CONTEXT_ID, foreignSessionId, "final_qc", mockDb),
        403,
        "WT_ERR_CONTEXT_SESSION_MISMATCH",
      );
    });

    it("rejects an expired action context with WT_ERR_CONTEXT_EXPIRED", async () => {
      mockDb._store.rfid_action_contexts[0].expires_at = new Date(Date.now() - 10000); // 10s in past
      await expectApiError(
        validateActionContext(TEST_CONTEXT_ID, TEST_SESSION_ID, "final_qc", mockDb),
        400,
        "WT_ERR_CONTEXT_EXPIRED",
      );
    });

    it("rejects an already consumed action context with WT_ERR_CONTEXT_ALREADY_CONSUMED", async () => {
      mockDb._store.rfid_action_contexts[0].closed_at = new Date();
      mockDb._store.rfid_action_contexts[0].status = "consumed";
      await expectApiError(
        validateActionContext(TEST_CONTEXT_ID, TEST_SESSION_ID, "final_qc", mockDb),
        400,
        "WT_ERR_CONTEXT_ALREADY_CONSUMED",
      );
    });
  });

  describe("5. Durable Idempotency & Replay Conflicts", () => {
    const envelope: VersionedScanEnvelope = {
      version: "v1",
      deviceId: TEST_DEVICE_ID,
      scanId: "scan-idempotent-01",
      bootId: "boot-01",
      sequence: 10,
      readerIndex: 5,
      mappingVersion: 1,
      tagUid: "E280116060000204",
      actionContextId: TEST_CONTEXT_ID,
      deviceUptimeMs: 30000,
      timestamp: new Date().toISOString(),
    };

    it("evaluates a brand-new scan as not duplicate", async () => {
      const hash = computeRequestFingerprint(envelope);
      const res = await checkExistingScan(envelope, hash, mockDb);
      expect(res.isDuplicate).toBe(false);
      expect(res.isConflict).toBe(false);
    });

    it("identifies identical retry when same scan identity and matching fingerprint are passed", async () => {
      const hash = computeRequestFingerprint(envelope);
      mockDb._store.rfid_scans.push({
        id: "scan-pk-01",
        device_id: TEST_DEVICE_ID,
        scan_id: envelope.scanId,
        boot_id: envelope.bootId,
        sequence: BigInt(envelope.sequence),
        reader_index: envelope.readerIndex,
        reported_mapping_version: envelope.mappingVersion,
        tag_uid: envelope.tagUid,
        reported_context_id: envelope.actionContextId,
        resolved_context_id: envelope.actionContextId,
        reader_session_id: TEST_SESSION_ID,
        station_code: "final_qc",
        tag_binding_id: TEST_TAG_BINDING_ID,
        garment_id: TEST_GARMENT_ID,
        material_lot_id: null,
        request_sha256: hash,
        received_at: new Date(),
        outcome: "accepted",
        outcome_code: "success",
        outcome_message: "Scan accepted and processed",
      });

      const res = await checkExistingScan(envelope, hash, mockDb);
      expect(res.isDuplicate).toBe(true);
      expect(res.isConflict).toBe(false);
      expect(res.existingScan?.scan_id).toBe(envelope.scanId);
    });

    it("identifies conflicting retry when same scan identity has different payload parameters", async () => {
      const hashOriginal = computeRequestFingerprint(envelope);
      mockDb._store.rfid_scans.push({
        id: "scan-pk-01",
        device_id: TEST_DEVICE_ID,
        scan_id: envelope.scanId,
        boot_id: envelope.bootId,
        sequence: BigInt(envelope.sequence),
        request_sha256: hashOriginal,
        received_at: new Date(),
        outcome: "accepted",
        outcome_code: "success",
      });

      // New envelope with SAME scanId but DIFFERENT tagUid!
      const alteredEnvelope: VersionedScanEnvelope = {
        ...envelope,
        tagUid: "A1B2C3D4E5F600",
      };
      const alteredHash = computeRequestFingerprint(alteredEnvelope);

      const res = await checkExistingScan(alteredEnvelope, alteredHash, mockDb);
      expect(res.isDuplicate).toBe(true);
      expect(res.isConflict).toBe(true);
    });
  });

  describe("6. Domain Handler Registration & Failure Boundaries", () => {
    const validEnvelope: VersionedScanEnvelope = {
      version: "v1",
      deviceId: TEST_DEVICE_ID,
      scanId: "scan-dispatch-01",
      bootId: "boot-01",
      sequence: 100,
      readerIndex: 5,
      mappingVersion: 1,
      tagUid: "E280116060000204",
      actionContextId: TEST_CONTEXT_ID,
      deviceUptimeMs: 45000,
      timestamp: new Date().toISOString(),
    };
    const validHeaders = { authorization: `Bearer ${TEST_DEVICE_SECRET}` };

    it("rejects with 501 WT_ERR_HANDLER_UNAVAILABLE and logs rejected scan when no handler is registered", async () => {
      scanRouter.clearHandlers(); // No handlers

      await expectApiError(
        scanRouter.dispatchScan(validEnvelope, validHeaders, mockDb),
        501,
        "WT_ERR_HANDLER_UNAVAILABLE",
      );

      // Verify rejected scan record was recorded in the database
      const recorded = mockDb._store.rfid_scans.find((s) => s.scan_id === validEnvelope.scanId);
      expect(recorded).toBeDefined();
      expect(recorded.outcome).toBe("rejected");
      expect(recorded.outcome_code).toBe("wt_err_handler_unavailable");
    });

    it("executes registered test handler, records accepted scan, and marks action context consumed", async () => {
      let phase1Called = false;
      let phase2Called = false;

      const testQaHandler: DomainScanHandler = {
        stationCode: "final_qc",
        prepare: async (_env, _tx, context) => {
          phase1Called = true;
          expect(context?.session.id).toBe(TEST_SESSION_ID);
          expect(context?.actor.actorId).toBe(TEST_OPERATOR_ID);
          return {
            kind: "garment",
            subjectId: TEST_GARMENT_ID,
            subjectCode: "GAR-2026-001",
            isNewEnrollment: false,
            tagUid: "E280116060000204",
            tagBindingId: TEST_TAG_BINDING_ID,
          };
        },
        process: async (_env, subject, _tx) => {
          phase2Called = true;
          return {
            scanId: validEnvelope.scanId,
            outcome: "accepted",
            outcomeCode: "success",
            outcomeMessage: "QA Inspection passed",
            stationCode: "final_qc",
            subjectKind: "garment",
            subjectId: subject.subjectId,
            subjectCode: subject.subjectCode,
            processedAt: new Date().toISOString(),
          };
        },
      };

      scanRouter.registerHandler(testQaHandler);

      const result = await scanRouter.dispatchScan(validEnvelope, validHeaders, mockDb);
      expect(phase1Called).toBe(true);
      expect(phase2Called).toBe(true);
      expect(result.outcome).toBe("accepted");
      expect(result.outcomeCode).toBe("success");

      // Verify scan was recorded in mockDb
      const scanInDb = mockDb._store.rfid_scans.find((s) => s.scan_id === validEnvelope.scanId);
      expect(scanInDb).toBeDefined();
      expect(scanInDb.outcome).toBe("accepted");
      expect(scanInDb.tag_binding_id).toBe(TEST_TAG_BINDING_ID);

      // Verify action context was consumed
      const ctxInDb = mockDb._store.rfid_action_contexts.find((c) => c.id === TEST_CONTEXT_ID);
      expect(ctxInDb.status).toBe("consumed");
      expect(ctxInDb.closed_at).not.toBeNull();
    });

    it("rolls back on handler failure and records rejected scan evidence", async () => {
      const failingHandler: DomainScanHandler = {
        stationCode: "final_qc",
        prepare: async () => {
          throw new ApiError(400, "WT_ERR_HOLD_ACTIVE", "Simulated domain business rule failure: garment is held!");
        },
        process: async () => {
          throw new Error("Should not reach process");
        },
      };

      scanRouter.registerHandler(failingHandler);

      const scanId = "scan-failing-01";
      const failingEnvelope: VersionedScanEnvelope = {
        ...validEnvelope,
        scanId,
        sequence: 101,
      };

      await expectApiError(
        scanRouter.dispatchScan(failingEnvelope, validHeaders, mockDb),
        400,
        "WT_ERR_HOLD_ACTIVE",
      );

      // Verify rejected scan was recorded in DB
      const rejectedScan = mockDb._store.rfid_scans.find((s) => s.scan_id === scanId);
      expect(rejectedScan).toBeDefined();
      expect(rejectedScan.outcome).toBe("rejected");
      expect(rejectedScan.outcome_message).toContain("garment is held");

      // Context must NOT have been consumed due to rollback
      const ctx = mockDb._store.rfid_action_contexts.find((c) => c.id === TEST_CONTEXT_ID);
      expect(ctx.status).toBe("armed");
      expect(ctx.closed_at).toBeNull();
    });
  });
});
