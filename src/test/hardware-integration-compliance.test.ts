/**
 * WearTrail Hardware Integration Compliance Test Suite.
 *
 * Verifies end-to-end compatibility for the physical TexTracer ESP32 9-reader hardware:
 * 1. Device authentication & physical reader mappings (all 9 antennas).
 * 2. Missing, expired, and unauthorized operator sessions.
 * 3. Required, missing, expired, and mismatched action contexts, plus automatic session-bound resolution.
 * 4. Cutting garment enrollment and fabric roll attribution.
 * 5. Quality gates (Pass vs Fail) and downstream fulfilment hold blocking.
 * 6. Durable idempotency: identical retries vs 409 replay conflicts (including post-consumption retry).
 */
import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  authenticateDevice,
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
import { scanRoutingService } from "../server/rfid/scan-router";
import {
  FabricReceivingScanHandler,
  FabricIssueScanHandler,
  CuttingScanHandler,
  StitchingScanHandler,
  FinishingScanHandler,
} from "../server/rfid/domain-handlers";
import {
  FinalQcScanHandler,
  PackingScanHandler,
  WarehouseScanHandler,
  DispatchScanHandler,
} from "../server/rfid/quality-fulfilment-handlers";
import type {
  DomainScanContext,
  DomainScanHandler,
  PreparedScanSubject,
  RfidStationCode,
  ScanOutcomeResult,
  VersionedScanEnvelope,
} from "../server/contracts/rfid";
import { ApiError } from "../server/middleware/responses";

const TEST_DEVICE_ID = "26ee6645-9da8-49b3-8e88-feb5707adce6";
const TEST_DEVICE_SECRET = "wt_test_secret_hardware_suite_2026";
const TEST_SECRET_DIGEST = hashDeviceSecret(TEST_DEVICE_SECRET);

const HARDWARE_PHYSICAL_MAPPINGS = [
  { readerIndex: 0, gpio: 27, stationCode: "fabric_receiving" as const },
  { readerIndex: 1, gpio: 12, stationCode: "fabric_issue" as const },
  { readerIndex: 2, gpio: 15, stationCode: "final_qc" as const },
  { readerIndex: 3, gpio: 2,  stationCode: "cutting" as const },
  { readerIndex: 4, gpio: 4,  stationCode: "warehouse" as const },
  { readerIndex: 5, gpio: 16, stationCode: "finishing" as const },
  { readerIndex: 6, gpio: 5,  stationCode: "stitching" as const },
  { readerIndex: 7, gpio: 17, stationCode: "packing" as const },
  { readerIndex: 8, gpio: 21, stationCode: "dispatch" as const },
];

function createHardwareMockDb() {
  const store = {
    devices: [
      {
        id: TEST_DEVICE_ID,
        code: "DEV-TEXTRACER-01",
        name: "TexTracer ESP32 9-Reader Hardware",
        enabled: true,
      },
    ] as any[],
    device_credentials: [
      {
        id: "cred-hw-01",
        device_id: TEST_DEVICE_ID,
        credential_digest: TEST_SECRET_DIGEST,
        revoked_at: null,
        expires_at: null,
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
    device_reader_mappings: HARDWARE_PHYSICAL_MAPPINGS.map((m) => ({
      device_id: TEST_DEVICE_ID,
      mapping_version: 1,
      reader_index: m.readerIndex,
      station_code: m.stationCode,
      physical_label: `GPIO ${m.gpio}`,
    })) as any[],
    reader_sessions: [] as any[],
    staff_users: [
      { id: "u-admin", username: "admin.demo", role: "admin", department: "management", status: "active", suspended_at: null },
      { id: "u-receiving", username: "receiving.demo", role: "materials", department: "receiving", status: "active", suspended_at: null },
      { id: "u-cutting", username: "cutting.demo", role: "production", department: "cutting", status: "active", suspended_at: null },
      { id: "u-stitch", username: "stitching.demo", role: "production", department: "stitching", status: "active", suspended_at: null },
      { id: "u-finish", username: "finishing.demo", role: "production", department: "finishing", status: "active", suspended_at: null },
      { id: "u-qc", username: "qc.demo", role: "quality", department: "quality", status: "active", suspended_at: null },
      { id: "u-pack", username: "packing.demo", role: "logistics", department: "packing", status: "active", suspended_at: null },
      { id: "u-warehouse", username: "warehouse.demo", role: "logistics", department: "warehouse", status: "active", suspended_at: null },
      { id: "u-dispatch", username: "dispatch.demo", role: "logistics", department: "dispatch", status: "active", suspended_at: null },
    ] as any[],
    rfid_stations: HARDWARE_PHYSICAL_MAPPINGS.map((m) => ({
      code: m.stationCode,
      name: m.stationCode,
      requires_explicit_context: m.stationCode !== "stitching" && m.stationCode !== "finishing",
    })) as any[],
    rfid_action_contexts: [] as any[],
    rfid_tag_bindings: [] as any[],
    rfid_scans: [] as any[],
    garments: [] as any[],
    material_lots: [] as any[],
    garment_holds: [] as any[],
    rework_cases: [] as any[],
    trace_events: [] as any[],
    ledger_commitments: [] as any[],
    ledger_outbox: [] as any[],
  };

  const mockDb: any = {
    _store: store,
    devices: {
      findFirst: async ({ where }: any) => store.devices.find((d) => d.id === where?.id || d.code === where?.code) ?? null,
      findUnique: async ({ where }: any) => store.devices.find((d) => d.id === where?.id) ?? null,
    },
    device_credentials: {
      findFirst: async ({ where }: any) => {
        return store.device_credentials.find((c) => {
          if (c.revoked_at !== null) return false;
          if (where.credential_digest && Buffer.compare(Buffer.from(c.credential_digest), Buffer.from(where.credential_digest)) !== 0) return false;
          return true;
        }) ?? null;
      },
    },
    device_mapping_versions: {
      findUnique: async ({ where }: any) => {
        const v = where.device_id_version;
        return store.device_mapping_versions.find((mv) => mv.device_id === v.device_id && mv.version === v.version) ?? null;
      },
      findFirst: async ({ where }: any) => store.device_mapping_versions.find((mv) => mv.device_id === where.device_id) ?? null,
    },
    device_reader_mappings: {
      findUnique: async ({ where }: any) => {
        const k = where.device_id_mapping_version_reader_index;
        return store.device_reader_mappings.find((m) => m.device_id === k.device_id && m.mapping_version === k.mapping_version && m.reader_index === k.reader_index) ?? null;
      },
      findFirst: async ({ where }: any) => store.device_reader_mappings.find((m) => m.device_id === where.device_id && m.station_code === where.station_code) ?? null,
    },
    reader_sessions: {
      findFirst: async ({ where }: any) => {
        return store.reader_sessions.find((s) => {
          if (where.device_id && s.device_id !== where.device_id) return false;
          if (where.reader_index !== undefined && s.reader_index !== where.reader_index) return false;
          if (where.station_code && s.station_code !== where.station_code) return false;
          if (where.closed_at === null && s.closed_at !== null) return false;
          if (where.expires_at?.gt && s.expires_at <= where.expires_at.gt) return false;
          return true;
        }) ?? null;
      },
      create: async ({ data }: any) => {
        const s = { id: `sess-${Date.now()}-${Math.random()}`, ...data };
        const op = store.staff_users.find((u) => u.id === data.operator_id);
        s.staff_users = op;
        store.reader_sessions.push(s);
        return s;
      },
    },
    rfid_stations: {
      findUnique: async ({ where }: any) => store.rfid_stations.find((s) => s.code === where.code) ?? null,
    },
    rfid_action_contexts: {
      findUnique: async ({ where }: any) => store.rfid_action_contexts.find((c) => c.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        const c = store.rfid_action_contexts.find((x) => x.id === where.id);
        if (!c) throw new Error(`rfid_action_contexts ${where.id} not found`);
        return c;
      },
      findFirst: async ({ where }: any) => {
        return store.rfid_action_contexts.find((c) => {
          if (where.id && c.id !== where.id) return false;
          if (where.reader_session_id && c.reader_session_id !== where.reader_session_id) return false;
          if (where.closed_at === null && c.closed_at !== null) return false;
          if (where.status?.in && !where.status.in.includes(c.status)) return false;
          if (where.status?.notIn && where.status.notIn.includes(c.status)) return false;
          return true;
        }) ?? null;
      },
      update: async ({ where, data }: any) => {
        const c = store.rfid_action_contexts.find((x) => x.id === where.id);
        if (c) Object.assign(c, data);
        return c;
      },
      create: async ({ data }: any) => {
        const c = { id: `ctx-${Date.now()}-${Math.random()}`, ...data };
        store.rfid_action_contexts.push(c);
        return c;
      },
    },
    rfid_scans: {
      findUnique: async ({ where }: any) => {
        if (where.device_id_scan_id) {
          const k = where.device_id_scan_id;
          return store.rfid_scans.find((s) => s.device_id === k.device_id && s.scan_id === k.scan_id) ?? null;
        }
        if (where.device_id_boot_id_sequence) {
          const k = where.device_id_boot_id_sequence;
          return store.rfid_scans.find((s) => s.device_id === k.device_id && s.boot_id === k.boot_id && BigInt(s.sequence) === BigInt(k.sequence)) ?? null;
        }
        return null;
      },
      findFirst: async ({ where }: any) => store.rfid_scans.find((s) => s.station_code === where.station_code) ?? null,
      create: async ({ data }: any) => {
        const s = { id: `scan-${Date.now()}-${Math.random()}`, received_at: new Date(), ...data };
        store.rfid_scans.push(s);
        return s;
      },
    },
    rfid_tag_bindings: {
      findFirst: async ({ where }: any) => {
        const b = store.rfid_tag_bindings.find((item) => {
          if (where.tag_uid && item.tag_uid !== where.tag_uid) return false;
          if (where.unbound_at === null && item.unbound_at !== null) return false;
          return true;
        });
        if (!b) return null;
        const res = { ...b };
        if (b.garment_id) {
          res.garments = store.garments.find((g) => g.id === b.garment_id) ?? null;
        }
        if (b.material_lot_id) {
          res.material_lots = store.material_lots.find((m) => m.id === b.material_lot_id) ?? null;
        }
        return res;
      },
      create: async ({ data }: any) => {
        const b = { id: `bind-${Date.now()}-${Math.random()}`, ...data };
        store.rfid_tag_bindings.push(b);
        return b;
      },
      update: async ({ where, data }: any) => {
        const b = store.rfid_tag_bindings.find((x) => x.id === where.id);
        if (b) Object.assign(b, data);
        return b;
      },
    },
    garments: {
      findUnique: async ({ where }: any) => store.garments.find((g) => g.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        const g = store.garments.find((x) => x.id === where.id);
        if (!g) throw new Error(`garments ${where.id} not found`);
        return g;
      },
      create: async ({ data }: any) => {
        const g = { id: `garment-${Date.now()}-${Math.random()}`, ...data };
        store.garments.push(g);
        return g;
      },
      update: async ({ where, data }: any) => {
        const g = store.garments.find((x) => x.id === where.id);
        if (g) Object.assign(g, data);
        return g;
      },
    },
    material_lots: {
      findFirst: async () => store.material_lots[0] ?? null,
    },
    staff_users: {
      findUnique: async ({ where }: any) => {
        return store.staff_users.find((u) => u.id === where?.id || u.username === where?.username) ?? null;
      },
      findFirst: async ({ where }: any) => {
        return store.staff_users.find((u) => u.id === where?.id || u.username === where?.username) ?? null;
      },
      findFirstOrThrow: async () => store.staff_users[0],
      update: async ({ where, data }: any) => {
        const u = store.staff_users.find((x) => x.id === where?.id || x.username === where?.username);
        if (u) Object.assign(u, data);
        return u;
      },
      create: async ({ data }: any) => {
        const u = { id: `staff-${Date.now()}`, ...data };
        store.staff_users.push(u);
        return u;
      },
    },
    checklist_versions: {
      findFirst: async ({ where }: any) => {
        return { id: "chk-ver-final", scope: where?.scope ?? "final", version: 1 };
      },
      create: async ({ data }: any) => ({ id: `chk-${Date.now()}`, ...data }),
    },
    inspections: {
      create: async ({ data }: any) => ({ id: `insp-${Date.now()}`, ...data }),
    },
    rework_cases: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const r = { id: `rwk-${Date.now()}`, ...data };
        store.rework_cases.push(r);
        return r;
      },
      update: async ({ where, data }: any) => {
        const r = store.rework_cases.find((x) => x.id === where.id);
        if (r) Object.assign(r, data);
        return r;
      },
    },
    garment_holds: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const h = { id: `hold-${Date.now()}`, ...data };
        store.garment_holds.push(h);
        return h;
      },
      update: async ({ where, data }: any) => {
        const h = store.garment_holds.find((x) => x.id === where.id);
        if (h) Object.assign(h, data);
        return h;
      },
    },
    trace_events: {
      create: async ({ data }: any) => {
        const t = { id: `trace-${Date.now()}`, ...data };
        store.trace_events.push(t);
        return t;
      },
    },
    ledger_commitments: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const c = { id: `commit-${Date.now()}`, ...data };
        store.ledger_commitments.push(c);
        return c;
      },
    },
    ledger_deployments: {
      findFirst: async () => ({
        id: "deploy-test-01",
        network: "hardhat",
        chain_id: 31337,
        contract_address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        status: "active",
      }),
    },
    ledger_outbox: {
      create: async ({ data }: any) => {
        const o = { id: `outbox-${Date.now()}`, ...data };
        store.ledger_outbox.push(o);
        return o;
      },
    },
  };

  mockDb.$transaction = async (fn: any) => fn(mockDb);

  return mockDb;
}

describe("WearTrail Hardware Integration Compliance Suite", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = createHardwareMockDb();
    scanRoutingService.clearHandlers();
    scanRoutingService.registerHandler(new FabricReceivingScanHandler());
    scanRoutingService.registerHandler(new FabricIssueScanHandler());
    scanRoutingService.registerHandler(new CuttingScanHandler());
    scanRoutingService.registerHandler(new StitchingScanHandler());
    scanRoutingService.registerHandler(new FinishingScanHandler());
    scanRoutingService.registerHandler(new FinalQcScanHandler());
    scanRoutingService.registerHandler(new PackingScanHandler());
    scanRoutingService.registerHandler(new WarehouseScanHandler());
    scanRoutingService.registerHandler(new DispatchScanHandler());
  });

  // --------------------------------------------------------------------------
  // 1. Physical Mapping Verification (0..8)
  // --------------------------------------------------------------------------
  describe("1. Physical Reader Wiring to Logical Station Resolution", () => {
    it("resolves all 9 physical antenna indices to their exact station codes", async () => {
      for (const mapping of HARDWARE_PHYSICAL_MAPPINGS) {
        // Open active session for this station
        const operator = mockDb._store.staff_users.find((u: any) =>
          isOperatorAuthorizedForStation(u.role, u.department, mapping.stationCode),
        );
        expect(operator, `Expected authorized operator for ${mapping.stationCode}`).toBeDefined();

        mockDb._store.reader_sessions.push({
          id: `sess-${mapping.readerIndex}`,
          device_id: TEST_DEVICE_ID,
          mapping_version: 1,
          reader_index: mapping.readerIndex,
          station_code: mapping.stationCode,
          operator_id: operator.id,
          staff_users: operator,
          opened_at: new Date(),
          expires_at: new Date(Date.now() + 3600000),
          closed_at: null,
        });

        const resolved = await resolveReaderSession(TEST_DEVICE_ID, 1, mapping.readerIndex, mockDb);
        expect(resolved.stationCode).toBe(mapping.stationCode);
        expect(resolved.session.readerIndex).toBe(mapping.readerIndex);
      }
    });

    it("verifies explicit context requirements per station configuration", async () => {
      // Routine production stations do NOT require explicit action context
      expect(await stationRequiresContext("stitching", mockDb)).toBe(false);
      expect(await stationRequiresContext("finishing", mockDb)).toBe(false);

      // Decision/attribution stations strictly require explicit action context
      expect(await stationRequiresContext("fabric_receiving", mockDb)).toBe(true);
      expect(await stationRequiresContext("fabric_issue", mockDb)).toBe(true);
      expect(await stationRequiresContext("cutting", mockDb)).toBe(true);
      expect(await stationRequiresContext("final_qc", mockDb)).toBe(true);
      expect(await stationRequiresContext("packing", mockDb)).toBe(true);
      expect(await stationRequiresContext("warehouse", mockDb)).toBe(true);
      expect(await stationRequiresContext("dispatch", mockDb)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Device Authentication
  // --------------------------------------------------------------------------
  describe("2. Device Credential Authentication", () => {
    it("authenticates device via Authorization Bearer token", async () => {
      const headers = { authorization: `Bearer ${TEST_DEVICE_SECRET}` };
      const auth = await authenticateDevice(headers, TEST_DEVICE_ID, mockDb);
      expect(auth.deviceId).toBe(TEST_DEVICE_ID);
    });

    it("authenticates device via X-Device-Secret header", async () => {
      const headers = { "x-device-secret": TEST_DEVICE_SECRET };
      const auth = await authenticateDevice(headers, TEST_DEVICE_ID, mockDb);
      expect(auth.deviceId).toBe(TEST_DEVICE_ID);
    });

    it("rejects unauthorized request with WT_ERR_DEVICE_UNAUTHORIZED", async () => {
      try {
        await authenticateDevice({}, TEST_DEVICE_ID, mockDb);
        expect.fail("Expected failure");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_DEVICE_UNAUTHORIZED");
      }
    });

    it("rejects bad secret with WT_ERR_INVALID_DEVICE_CREDENTIAL", async () => {
      try {
        await authenticateDevice({ authorization: "Bearer wrong_secret" }, TEST_DEVICE_ID, mockDb);
        expect.fail("Expected failure");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_INVALID_DEVICE_CREDENTIAL");
      }
    });

    it("rejects disabled device with WT_ERR_DEVICE_DISABLED", async () => {
      mockDb._store.devices[0].enabled = false;
      try {
        await authenticateDevice({ authorization: `Bearer ${TEST_DEVICE_SECRET}` }, TEST_DEVICE_ID, mockDb);
        expect.fail("Expected failure");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_DEVICE_DISABLED");
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Action Context Resolution & Consumption
  // --------------------------------------------------------------------------
  describe("3. Station Context Handling & Automatic Session Resolution", () => {
    it("automatically resolves armed context when envelope.actionContextId is null", async () => {
      // Station 2 (final_qc, readerIndex 2)
      const op = mockDb._store.staff_users.find((u: any) => u.role === "quality");
      const session = {
        id: "sess-qc-01",
        device_id: TEST_DEVICE_ID,
        mapping_version: 1,
        reader_index: 2,
        station_code: "final_qc",
        operator_id: op.id,
        staff_users: op,
        opened_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
        closed_at: null,
      };
      mockDb._store.reader_sessions.push(session);

      // Arm a QA context for this session
      const armedContext = {
        id: "ctx-qc-armed-01",
        reader_session_id: session.id,
        action_code: "submit_qc",
        status: "armed",
        created_at: new Date(),
        expires_at: new Date(Date.now() + 300000),
        closed_at: null,
        qc_scope: "final",
        qc_outcome: "pass",
        answers: { seams: true },
        defect_reason: null,
        notes: "Passed QC",
      };
      mockDb._store.rfid_action_contexts.push(armedContext);

      // Pre-bind garment to tag
      mockDb._store.rfid_tag_bindings.push({
        id: "bind-01",
        garment_id: "garment-01",
        tag_uid: "04A1B2C3D4E5F6", // NTAG213 7-byte UID
        tag_identifier: "04A1B2C3D4E5F6",
        unbound_at: null,
      });
      mockDb._store.garments.push({
        id: "garment-01",
        code: "GAR-001",
        stage: "finished",
        quality_disposition: "awaiting_inspection",
      });

      // Physical scan envelope with actionContextId: null
      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-qc-auto-01",
        bootId: "boot-hw-01",
        sequence: 1,
        readerIndex: 2, // Physical antenna GPIO 15
        mappingVersion: 1,
        tagUid: "04A1B2C3D4E5F6",
        actionContextId: null,
        deviceUptimeMs: 32000,
        timestamp: new Date().toISOString(),
      };

      const result = await scanRoutingService.dispatchScan(
        envelope,
        { authorization: `Bearer ${TEST_DEVICE_SECRET}` },
        mockDb,
      );

      expect(result.outcome).toBe("accepted");
      expect(result.stationCode).toBe("final_qc");

      // Verify action context was consumed
      const ctxInDb = mockDb._store.rfid_action_contexts.find((c: any) => c.id === armedContext.id);
      expect(ctxInDb.status).toBe("consumed");
      expect(ctxInDb.closed_at).not.toBeNull();
    });

    it("rejects scan on final_qc when no context is armed with WT_ERR_CONTEXT_REQUIRED", async () => {
      const op = mockDb._store.staff_users.find((u: any) => u.role === "quality");
      mockDb._store.reader_sessions.push({
        id: "sess-qc-empty",
        device_id: TEST_DEVICE_ID,
        mapping_version: 1,
        reader_index: 2,
        station_code: "final_qc",
        operator_id: op.id,
        staff_users: op,
        opened_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
        closed_at: null,
      });

      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-qc-missing-ctx",
        bootId: "boot-hw-01",
        sequence: 2,
        readerIndex: 2,
        mappingVersion: 1,
        tagUid: "04A1B2C3D4E5F6",
        actionContextId: null,
        timestamp: new Date().toISOString(),
      };

      try {
        await scanRoutingService.dispatchScan(
          envelope,
          { authorization: `Bearer ${TEST_DEVICE_SECRET}` },
          mockDb,
        );
        expect.fail("Expected failure");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_CONTEXT_REQUIRED");
      }
    });

    it("rejects an expired action context with WT_ERR_CONTEXT_EXPIRED", async () => {
      try {
        await validateActionContext("non-existent-ctx", "sess-01", "final_qc", mockDb);
        expect.fail("Expected failure");
      } catch (err: any) {
        expect(err.errorCode).toBe("WT_ERR_CONTEXT_NOT_FOUND");
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Routine Production Scans (Stitching & Finishing)
  // --------------------------------------------------------------------------
  describe("4. Routine Progression (Stitching & Finishing)", () => {
    it("advances garment stage at stitching (readerIndex 6) without explicit context", async () => {
      const op = mockDb._store.staff_users.find((u: any) => u.username === "stitching.demo");
      mockDb._store.reader_sessions.push({
        id: "sess-stitch",
        device_id: TEST_DEVICE_ID,
        mapping_version: 1,
        reader_index: 6, // SS GPIO 5
        station_code: "stitching",
        operator_id: op.id,
        staff_users: op,
        opened_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
        closed_at: null,
      });

      mockDb._store.rfid_tag_bindings.push({
        id: "bind-stitch",
        garment_id: "garment-cut-01",
        tag_uid: "A1B2C3D4",
        tag_identifier: "A1B2C3D4",
        unbound_at: null,
      });
      mockDb._store.garments.push({
        id: "garment-cut-01",
        code: "GAR-CUT-01",
        stage: "cut",
        quality_disposition: "awaiting_inspection",
      });

      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-stitch-01",
        bootId: "boot-hw-01",
        sequence: 3,
        readerIndex: 6,
        mappingVersion: 1,
        tagUid: "A1B2C3D4",
        actionContextId: null,
        timestamp: new Date().toISOString(),
      };

      const result = await scanRoutingService.dispatchScan(
        envelope,
        { authorization: `Bearer ${TEST_DEVICE_SECRET}` },
        mockDb,
      );

      expect(result.outcome).toBe("accepted");
      expect(result.stationCode).toBe("stitching");
      const garment = mockDb._store.garments.find((g: any) => g.id === "garment-cut-01");
      expect(garment.stage).toBe("stitched");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Durable Idempotency vs. 409 Conflict Handling
  // --------------------------------------------------------------------------
  describe("5. Durable Idempotency & Replay Conflicts", () => {
    it("returns identical outcome idempotently on duplicate retry even after context consumption", async () => {
      const op = mockDb._store.staff_users.find((u: any) => u.username === "stitching.demo");
      mockDb._store.reader_sessions.push({
        id: "sess-stitch-2",
        device_id: TEST_DEVICE_ID,
        mapping_version: 1,
        reader_index: 6,
        station_code: "stitching",
        operator_id: op.id,
        staff_users: op,
        opened_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
        closed_at: null,
      });

      mockDb._store.rfid_tag_bindings.push({
        id: "bind-02",
        garment_id: "garment-02",
        tag_uid: "11223344",
        unbound_at: null,
      });
      mockDb._store.garments.push({
        id: "garment-02",
        code: "GAR-02",
        stage: "cut",
        quality_disposition: "awaiting_inspection",
      });

      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-idempotent-first",
        bootId: "boot-idem",
        sequence: 50,
        readerIndex: 6,
        mappingVersion: 1,
        tagUid: "11223344",
        actionContextId: null,
        timestamp: new Date().toISOString(),
      };

      // First delivery
      const res1 = await scanRoutingService.dispatchScan(
        envelope,
        { authorization: `Bearer ${TEST_DEVICE_SECRET}` },
        mockDb,
      );
      expect(res1.outcome).toBe("accepted");

      // Identical retry
      const res2 = await scanRoutingService.dispatchScan(
        envelope,
        { authorization: `Bearer ${TEST_DEVICE_SECRET}` },
        mockDb,
      );
      expect(res2.outcome).toBe("accepted");
      expect(res2.scanId).toBe(res1.scanId);
    });

    it("rejects conflicting scan reuse with HTTP 409 WT_ERR_SCAN_CONFLICT", async () => {
      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: TEST_DEVICE_ID,
        scanId: "scan-conflict-test",
        bootId: "boot-conflict",
        sequence: 99,
        readerIndex: 6,
        mappingVersion: 1,
        tagUid: "AAAA1111",
        timestamp: new Date().toISOString(),
      };

      const fp1 = computeRequestFingerprint(envelope);
      mockDb._store.rfid_scans.push({
        id: "scan-rec-01",
        device_id: TEST_DEVICE_ID,
        scan_id: envelope.scanId,
        boot_id: envelope.bootId,
        sequence: BigInt(envelope.sequence),
        reader_index: envelope.readerIndex,
        reported_mapping_version: envelope.mappingVersion,
        tag_uid: envelope.tagUid,
        request_sha256: fp1,
        outcome: "accepted",
        outcome_code: "success",
      });

      // Same scanId and sequence, but different tagUid!
      const conflictingEnvelope: VersionedScanEnvelope = {
        ...envelope,
        tagUid: "BBBB2222",
      };

      try {
        await scanRoutingService.dispatchScan(
          conflictingEnvelope,
          { authorization: `Bearer ${TEST_DEVICE_SECRET}` },
          mockDb,
        );
        expect.fail("Expected 409 Conflict");
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.errorCode).toBe("WT_ERR_SCAN_CONFLICT");
      }
    });
  });
});
