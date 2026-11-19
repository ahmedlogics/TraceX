import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  createInternalCommitment,
  createPublicCommitment,
  computeCommitmentId,
  getActiveLedgerDeployment,
  ledgerOutboxService,
} from "../server/ledger";
import { ApiError } from "../server/middleware/responses";

// ============================================================================
// Isolated In-Memory Test Fixtures & Mock Factory
// ============================================================================

const TEST_DEPLOYMENT_ID = "7c41dac6-1687-4608-a9ce-bee3c57179f3";
const TEST_DEPLOYMENT_CODE = "local-hardhat-20261119150320-1c094d99";
const TEST_TRACE_EVENT_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const TEST_PUBLIC_PAYLOAD_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

function createIsolatedLedgerMockDb() {
  const store = {
    ledger_deployments: [
      {
        id: TEST_DEPLOYMENT_ID,
        code: TEST_DEPLOYMENT_CODE,
        chain_id: 31337,
        network_name: "hardhat-local",
        contract_address: new Uint8Array(20).fill(1),
        deployment_tx_hash: new Uint8Array(32).fill(2),
        protocol_version: 1,
        registered_at: new Date("2026-11-19T15:03:20Z"),
      },
    ] as any[],
    ledger_commitments: [] as any[],
    ledger_outbox: [] as any[],
  };

  const db: any = {
    $transaction: async (fn: any) => fn(db),
    ledger_deployments: {
      findUnique: async ({ where }: any) => {
        if (where.id) return store.ledger_deployments.find((d) => d.id === where.id) ?? null;
        if (where.code) return store.ledger_deployments.find((d) => d.code === where.code) ?? null;
        return null;
      },
      findFirst: async () => store.ledger_deployments[0] ?? null,
    },
    ledger_commitments: {
      findFirst: async ({ where }: any) => {
        return (
          store.ledger_commitments.find((c) => {
            if (where.deployment_id !== c.deployment_id) return false;
            if (where.trace_event_id && c.trace_event_id === where.trace_event_id) return true;
            if (where.public_payload_id && c.public_payload_id === where.public_payload_id) return true;
            return false;
          }) ?? null
        );
      },
      create: async ({ data }: any) => {
        const record = {
          id: crypto.randomUUID(),
          created_at: new Date(),
          ...data,
        };
        store.ledger_commitments.push(record);
        return record;
      },
    },
    ledger_outbox: {
      create: async ({ data }: any) => {
        const record = {
          status: "pending",
          attempt_count: 0,
          updated_at: new Date(),
          ...data,
        };
        store.ledger_outbox.push(record);
        return record;
      },
      findUnique: async ({ where }: any) => {
        return store.ledger_outbox.find((o) => o.commitment_id === where.commitment_id) ?? null;
      },
    },
    _store: store,
  };

  return db as PrismaClient & { _store: typeof store };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("WearTrail Ledger Commitment & Transactional Enqueueing (Member 1)", () => {
  let mockDb: ReturnType<typeof createIsolatedLedgerMockDb>;

  beforeEach(() => {
    mockDb = createIsolatedLedgerMockDb();
    delete process.env["LEDGER_DEPLOYMENT_ID"];
    delete process.env["LEDGER_DEPLOYMENT_CODE"];
  });

  describe("1. Deployment Resolution", () => {
    it("resolves the latest registered deployment from the database", async () => {
      const dep = await getActiveLedgerDeployment(mockDb);
      expect(dep.id).toBe(TEST_DEPLOYMENT_ID);
      expect(dep.code).toBe(TEST_DEPLOYMENT_CODE);
      expect(dep.chain_id).toBe(31337);
    });

    it("throws 500 WT_ERR_NO_LEDGER_DEPLOYMENT if no deployment exists", async () => {
      mockDb._store.ledger_deployments = [];

      try {
        await getActiveLedgerDeployment(mockDb);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(500);
        expect(err.errorCode).toBe("WT_ERR_NO_LEDGER_DEPLOYMENT");
      }
    });

    it("generates deterministic bytes32 on-chain commitment IDs", () => {
      const id1 = computeCommitmentId("event", TEST_DEPLOYMENT_ID, TEST_TRACE_EVENT_ID);
      const id2 = computeCommitmentId("event", TEST_DEPLOYMENT_ID, TEST_TRACE_EVENT_ID);
      expect(Buffer.isBuffer(id1)).toBe(true);
      expect(id1.length).toBe(32);
      expect(id1.equals(id2)).toBe(true);
    });
  });

  describe("2. Internal Event Commitments (sha256_nonce_v1)", () => {
    const testPayload = {
      action: "quality_inspection",
      station: "final_qc",
      operatorId: "op-123",
      timestamp: "2026-11-19T22:00:00Z",
    };

    it("creates internal commitment with private 32-byte nonce and sha256_nonce_v1", async () => {
      const result = await createInternalCommitment(
        {
          traceEventId: TEST_TRACE_EVENT_ID,
          payload: testPayload,
        },
        mockDb as any,
      );

      expect(result.scope).toBe("event");
      expect(result.isExisting).toBe(false);
      expect(result.status).toBe("pending");
      expect(result.onChainCommitmentId.startsWith("0x")).toBe(true);
      expect(result.payloadSha256.startsWith("0x")).toBe(true);

      // Verify row persisted in ledger_commitments
      const commitment = mockDb._store.ledger_commitments[0];
      expect(commitment).toBeDefined();
      expect(commitment.trace_event_id).toBe(TEST_TRACE_EVENT_ID);
      expect(commitment.hash_scheme).toBe("sha256_nonce_v1");
      expect(commitment.internal_nonce).toBeDefined();
      expect(commitment.internal_nonce.length).toBe(32);
      expect(commitment.internal_payload_bytes).toBeDefined();

      // Verify mathematical invariant: sha256(nonce || canonicalBytes) === payload_sha256
      const computedHash = crypto
        .createHash("sha256")
        .update(Buffer.concat([Buffer.from(commitment.internal_nonce), Buffer.from(commitment.internal_payload_bytes)]))
        .digest();
      expect(Buffer.from(commitment.payload_sha256).equals(computedHash)).toBe(true);

      // Verify row atomically enqueued in ledger_outbox
      const outbox = mockDb._store.ledger_outbox[0];
      expect(outbox).toBeDefined();
      expect(outbox.commitment_id).toBe(commitment.id);
      expect(outbox.status).toBe("pending");
    });

    it("returns existing commitment idempotently on identical retry", async () => {
      const first = await createInternalCommitment(
        {
          traceEventId: TEST_TRACE_EVENT_ID,
          payload: testPayload,
        },
        mockDb as any,
      );

      const second = await createInternalCommitment(
        {
          traceEventId: TEST_TRACE_EVENT_ID,
          payload: testPayload,
        },
        mockDb as any,
      );

      expect(second.isExisting).toBe(true);
      expect(second.commitmentId).toBe(first.commitmentId);
      expect(second.payloadSha256).toBe(first.payloadSha256);
      expect(mockDb._store.ledger_commitments.length).toBe(1);
    });

    it("rejects conflicting payload on same traceEventId with WT_ERR_COMMITMENT_CONFLICT", async () => {
      await createInternalCommitment(
        {
          traceEventId: TEST_TRACE_EVENT_ID,
          payload: testPayload,
        },
        mockDb as any,
      );

      const conflictingPayload = { ...testPayload, action: "tampered_action" };

      try {
        await createInternalCommitment(
          {
            traceEventId: TEST_TRACE_EVENT_ID,
            payload: conflictingPayload,
          },
          mockDb as any,
        );
        expect.fail("Should have thrown conflict");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(409);
        expect(err.errorCode).toBe("WT_ERR_COMMITMENT_CONFLICT");
      }
    });
  });

  describe("3. Public Journey Commitments (Separation of Evidence)", () => {
    const publicPayloadHash = crypto.randomBytes(32);

    it("creates public commitment strictly keeping internal nonces and payload bytes NULL", async () => {
      const result = await createPublicCommitment(
        {
          publicPayloadId: TEST_PUBLIC_PAYLOAD_ID,
          payloadSha256: publicPayloadHash,
        },
        mockDb as any,
      );

      expect(result.scope).toBe("public_journey");
      expect(result.isExisting).toBe(false);
      expect(result.status).toBe("pending");

      // Verify row in ledger_commitments
      const commitment = mockDb._store.ledger_commitments[0];
      expect(commitment).toBeDefined();
      expect(commitment.public_payload_id).toBe(TEST_PUBLIC_PAYLOAD_ID);
      expect(commitment.trace_event_id).toBeUndefined();
      expect(commitment.hash_scheme).toBe("sha256");

      // CRITICAL PRIVACY INVARIANT: Internal nonces and bytes must be strictly absent
      expect(commitment.internal_nonce).toBeUndefined();
      expect(commitment.internal_payload_bytes).toBeUndefined();

      // Verify outbox entry
      const outbox = mockDb._store.ledger_outbox[0];
      expect(outbox.commitment_id).toBe(commitment.id);
      expect(outbox.status).toBe("pending");
    });

    it("rejects invalid hash length with WT_ERR_INVALID_HASH_LENGTH", async () => {
      const badHash = crypto.randomBytes(16); // Only 16 bytes instead of 32!

      try {
        await createPublicCommitment(
          {
            publicPayloadId: TEST_PUBLIC_PAYLOAD_ID,
            payloadSha256: badHash,
          },
          mockDb as any,
        );
        expect.fail("Should have rejected bad hash length");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(400);
        expect(err.errorCode).toBe("WT_ERR_INVALID_HASH_LENGTH");
      }
    });

    it("returns existing public commitment idempotently on matching hash retry", async () => {
      const first = await createPublicCommitment(
        {
          publicPayloadId: TEST_PUBLIC_PAYLOAD_ID,
          payloadSha256: publicPayloadHash,
        },
        mockDb as any,
      );

      const second = await createPublicCommitment(
        {
          publicPayloadId: TEST_PUBLIC_PAYLOAD_ID,
          payloadSha256: publicPayloadHash,
        },
        mockDb as any,
      );

      expect(second.isExisting).toBe(true);
      expect(second.commitmentId).toBe(first.commitmentId);
      expect(mockDb._store.ledger_commitments.length).toBe(1);
    });

    it("rejects conflicting public hash on same publicPayloadId with 409 WT_ERR_COMMITMENT_CONFLICT", async () => {
      await createPublicCommitment(
        {
          publicPayloadId: TEST_PUBLIC_PAYLOAD_ID,
          payloadSha256: publicPayloadHash,
        },
        mockDb as any,
      );

      const differentHash = crypto.randomBytes(32);

      try {
        await createPublicCommitment(
          {
            publicPayloadId: TEST_PUBLIC_PAYLOAD_ID,
            payloadSha256: differentHash,
          },
          mockDb as any,
        );
        expect.fail("Should have rejected conflicting hash");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(409);
        expect(err.errorCode).toBe("WT_ERR_COMMITMENT_CONFLICT");
      }
    });
  });

  describe("4. Shared ILedgerOutboxService Contract", () => {
    it("queues event commitment via queueCommitment interface", async () => {
      const id = await ledgerOutboxService.queueCommitment(
        {
          scope: "event",
          traceEventId: TEST_TRACE_EVENT_ID,
          internalPayloadBytes: Buffer.from("test-payload-bytes"),
          payloadSha256: Buffer.alloc(32),
        },
        mockDb as any,
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(mockDb._store.ledger_commitments.length).toBe(1);
      expect(mockDb._store.ledger_outbox.length).toBe(1);
    });

    it("queues public journey commitment via queueCommitment interface", async () => {
      const id = await ledgerOutboxService.queueCommitment(
        {
          scope: "public_journey",
          publicPayloadId: TEST_PUBLIC_PAYLOAD_ID,
          payloadSha256: crypto.randomBytes(32),
        },
        mockDb as any,
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(mockDb._store.ledger_commitments.length).toBe(1);
      expect(mockDb._store.ledger_outbox.length).toBe(1);
    });
  });
});
