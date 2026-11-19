import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  LedgerOutboxWorker,
  SignerNonceManager,
  LedgerEvidenceService,
  computeCommitmentId,
  type LeasedJob,
} from "../server/ledger";
import type { PrismaClient } from "@prisma/client";

describe("Ledger Outbox Worker & Evidence Subsystem (Isolated Unit & Harness Tests)", () => {
  let mockDb: any;
  let mockProvider: any;
  let mockSigner: any;
  let mockContract: any;
  let nonceManager: SignerNonceManager;
  let worker: LedgerOutboxWorker;
  let evidenceService: LedgerEvidenceService;

  const mockDeployment = {
    id: "7c41dac6-1687-4608-a9ce-bee3c57179f3",
    code: "local-hardhat-20261119150320-1c094d99",
    chain_id: BigInt(31337),
    network_name: "hardhat-local",
    contract_address: new Uint8Array(Buffer.from("5FbDB2315678afecb367f032d93F642f64180aa3", "hex")),
    deployment_tx_hash: new Uint8Array(Buffer.from("1c094d99ba4fa2e1f19944fb3f219269866ec39ca09abab50f358e8ef69a7819", "hex")),
    protocol_version: 1,
    registered_at: new Date(),
  };

  const sampleCommitmentId = computeCommitmentId("event", mockDeployment.id, "trace-event-001");
  const samplePayloadSha256 = crypto.createHash("sha256").update("sample-canonical-payload").digest();

  beforeEach(() => {
    nonceManager = new SignerNonceManager();

    // Mock Prisma client with in-memory stores
    const outboxStore = new Map<string, any>();
    const commitmentsStore = new Map<string, any>();
    const transactionsStore = new Map<string, any>();

    mockDb = {
      ledger_deployments: {
        findUnique: vi.fn(async () => mockDeployment),
        findFirst: vi.fn(async () => mockDeployment),
      },
      ledger_commitments: {
        findUnique: vi.fn(async ({ where }: any) => commitmentsStore.get(where.id) ?? null),
        findFirst: vi.fn(async ({ where }: any) => {
          for (const item of commitmentsStore.values()) {
            if (where.id && item.id === where.id) return item;
            if (where.trace_event_id && item.trace_event_id === where.trace_event_id) return item;
            if (where.public_payload_id && item.public_payload_id === where.public_payload_id) return item;
            if (where.commitment_id && Buffer.compare(Buffer.from(item.commitment_id), Buffer.from(where.commitment_id)) === 0) return item;
          }
          return null;
        }),
      },
      ledger_outbox: {
        findMany: vi.fn(async ({ where, take }: any) => {
          const results = [];
          for (const item of outboxStore.values()) {
            if (where?.status?.in && !where.status.in.includes(item.status)) continue;
            results.push({
              ...item,
              ledger_commitments: commitmentsStore.get(item.commitment_id),
            });
            if (take && results.length >= take) break;
          }
          return results;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = outboxStore.get(where.commitment_id) ?? { commitment_id: where.commitment_id };
          const updated = { ...item, ...data };
          outboxStore.set(where.commitment_id, updated);
          return updated;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const cid of where.commitment_id.in) {
            const item = outboxStore.get(cid);
            if (item) {
              outboxStore.set(cid, { ...item, ...data });
              count++;
            }
          }
          return { count };
        }),
        count: vi.fn(async ({ where }: any) => {
          let count = 0;
          for (const item of outboxStore.values()) {
            if (where?.status && item.status !== where.status) continue;
            count++;
          }
          return count;
        }),
      },
      ledger_transactions: {
        findFirst: vi.fn(async ({ where }: any) => {
          for (const item of transactionsStore.values()) {
            if (where.commitment_id && item.commitment_id !== where.commitment_id) continue;
            if (where.status && item.status !== where.status) continue;
            return item;
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const id = crypto.randomUUID();
          const item = { id, ...data };
          transactionsStore.set(id, item);
          return item;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = transactionsStore.get(where.id);
          const updated = { ...item, ...data };
          transactionsStore.set(where.id, updated);
          return updated;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const [id, item] of transactionsStore.entries()) {
            if (where.commitment_id && item.commitment_id !== where.commitment_id) continue;
            transactionsStore.set(id, { ...item, ...data });
            count++;
          }
          return { count };
        }),
      },
      public_payload_versions: {
        findFirst: vi.fn(async () => null),
      },
      $transaction: vi.fn(async (cb: any) => {
        if (typeof cb === "function") {
          return await cb(mockDb);
        }
        return await Promise.all(cb);
      }),
    };

    // Pre-seed a commitment and outbox row
    const testCommitmentDbId = "11111111-2222-3333-4444-555555555555";
    commitmentsStore.set(testCommitmentDbId, {
      id: testCommitmentDbId,
      deployment_id: mockDeployment.id,
      commitment_id: new Uint8Array(sampleCommitmentId),
      payload_sha256: new Uint8Array(samplePayloadSha256),
      trace_event_id: "trace-event-001",
      public_payload_id: null,
      internal_payload_bytes: new Uint8Array(Buffer.from("sample-canonical-payload")),
      internal_nonce: new Uint8Array(crypto.randomBytes(32)),
      hash_scheme: "sha256_nonce_v1",
      created_at: new Date(),
      ledger_deployments: mockDeployment,
    });

    outboxStore.set(testCommitmentDbId, {
      commitment_id: testCommitmentDbId,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000), // Ready to lease
      lease_token: null,
      lease_expires_at: null,
      last_error_code: null,
      last_error_summary: null,
      updated_at: new Date(),
    });

    // Mock Blockchain Provider
    mockProvider = {
      getNetwork: vi.fn(async () => ({ chainId: BigInt(31337) })),
      getCode: vi.fn(async () => "0x608060405234801561001057600080fd5b50"),
      getTransactionCount: vi.fn(async () => 5),
      getBlock: vi.fn(async (blockNum: number) => ({
        number: blockNum,
        hash: "0x" + "a".repeat(64),
        timestamp: 1732000000,
      })),
      getTransactionReceipt: vi.fn(async (txHash: string) => ({
        hash: txHash,
        status: 1,
        blockNumber: 42,
        blockHash: "0x" + "b".repeat(64),
      })),
      waitForTransaction: vi.fn(async (txHash: string) => ({
        hash: txHash,
        status: 1,
        blockNumber: 42,
        blockHash: "0x" + "c".repeat(64),
      })),
    };

    // Mock Blockchain Signer
    mockSigner = {
      getAddress: vi.fn(async () => "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
    };

    // Mock Smart Contract
    mockContract = {
      hasCommitment: vi.fn(async () => false),
      getCommitment: vi.fn(async () => [
        "0x" + samplePayloadSha256.toString("hex"),
        42n,
        1732000000n,
      ]),
      recordCommitment: vi.fn(async () => ({
        hash: "0x" + "d".repeat(64),
      })),
    };

    worker = new LedgerOutboxWorker({
      db: mockDb as unknown as PrismaClient,
      provider: mockProvider,
      signer: mockSigner,
      nonceManager,
      batchSize: 5,
      leaseDurationSeconds: 60,
      requiredConfirmations: 1,
      maxAttempts: 3,
    });

    // Provide mock contract instance to worker
    (worker as any).activeContract = mockContract;
    (worker as any).activeProvider = mockProvider;
    (worker as any).activeSigner = mockSigner;
    (worker as any).cachedChainId = BigInt(31337);

    evidenceService = new LedgerEvidenceService(mockDb as unknown as PrismaClient);
  });

  describe("1. Normal Enqueue -> Submission -> Confirmation", () => {
    it("leases ready jobs, broadcasts commitment, and marks confirmed on receipt", async () => {
      const result = await worker.processBatch();

      expect(result.leasedCount).toBe(1);
      expect(result.confirmedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      // Verify contract was called with opaque 32-byte hexadecimal strings
      expect(mockContract.recordCommitment).toHaveBeenCalledTimes(1);
      const [cidArg, hashArg, overrides] = mockContract.recordCommitment.mock.calls[0];
      expect(cidArg).toBe("0x" + sampleCommitmentId.toString("hex"));
      expect(hashArg).toBe("0x" + samplePayloadSha256.toString("hex"));
      expect(overrides).toEqual({ nonce: 5 });

      // Verify outbox was updated to confirmed and lease cleared
      expect(mockDb.ledger_outbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "confirmed",
            lease_token: null,
            lease_expires_at: null,
          }),
        }),
      );

      // Verify transaction record was submitted and then confirmed with block metadata
      expect(mockDb.ledger_transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "submitted",
          }),
        }),
      );

      expect(mockDb.ledger_transactions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "confirmed",
            block_number: 42n,
          }),
        }),
      );
    });
  });

  describe("2. RPC Downtime and Recovery", () => {
    it("releases leased jobs with backoff on RPC network error without failing factory operations", async () => {
      // Simulate RPC network failure
      mockContract.hasCommitment.mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED 127.0.0.1:8545"));

      const result = await worker.processBatch();

      expect(result.leasedCount).toBe(1);
      expect(result.confirmedCount).toBe(0);
      expect(result.retriedCount).toBe(1);

      // Verify job was released with WT_ERR_RPC_UNAVAILABLE error and incremented attempt count
      expect(mockDb.ledger_outbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "pending",
            attempt_count: 1,
            last_error_code: "WT_ERR_RPC_UNAVAILABLE",
            lease_token: null,
            lease_expires_at: null,
          }),
        }),
      );

      // RPC recovers: next batch successfully confirms
      mockContract.hasCommitment.mockResolvedValueOnce(false);
      const recoveredResult = await worker.processBatch();
      expect(recoveredResult.confirmedCount).toBe(1);
    });
  });

  describe("3. Worker Termination and Crash Recovery", () => {
    it("allows a second worker to safely re-lease and process an orphaned job whose lease expired", async () => {
      const now = new Date();
      // Set an expired lease from a dead worker
      await mockDb.ledger_outbox.update({
        where: { commitment_id: "11111111-2222-3333-4444-555555555555" },
        data: {
          lease_token: "crashed-worker-uuid",
          lease_expires_at: new Date(now.getTime() - 10000), // Expired 10s ago
          next_attempt_at: new Date(now.getTime() - 5000),
        },
      });

      // Worker 2 leases and processes the job
      const worker2 = new LedgerOutboxWorker({
        db: mockDb as unknown as PrismaClient,
        provider: mockProvider,
        signer: mockSigner,
        nonceManager,
      });
      (worker2 as any).activeContract = mockContract;
      (worker2 as any).activeProvider = mockProvider;
      (worker2 as any).activeSigner = mockSigner;
      (worker2 as any).cachedChainId = BigInt(31337);

      const result = await worker2.processBatch();
      expect(result.leasedCount).toBe(1);
      expect(result.confirmedCount).toBe(1);
    });
  });

  describe("4. Uncertain Broadcast Recovery", () => {
    it("reconciles an in-flight job by verifying contract commitment without re-broadcasting transaction", async () => {
      // Simulate state where previous worker sent transaction before dying
      await mockDb.ledger_outbox.update({
        where: { commitment_id: "11111111-2222-3333-4444-555555555555" },
        data: {
          status: "submitted",
          lease_token: null,
          lease_expires_at: null,
        },
      });

      // Contract already has the commitment recorded
      mockContract.hasCommitment.mockResolvedValueOnce(true);
      mockContract.getCommitment.mockResolvedValueOnce([
        "0x" + samplePayloadSha256.toString("hex"),
        88n,
        1732000500n,
      ]);

      const result = await worker.processBatch();

      expect(result.leasedCount).toBe(1);
      expect(result.reconciledCount).toBe(1);
      // Ensure recordCommitment was NOT called redundantly
      expect(mockContract.recordCommitment).not.toHaveBeenCalled();

      // Marked confirmed
      expect(mockDb.ledger_outbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "confirmed",
          }),
        }),
      );
    });
  });

  describe("5. Duplicate Delivery (Idempotent Identical On-Chain Replay)", () => {
    it("treats matching on-chain commitment as idempotent success", async () => {
      mockContract.hasCommitment.mockResolvedValueOnce(true);
      mockContract.getCommitment.mockResolvedValueOnce([
        "0x" + samplePayloadSha256.toString("hex"),
        99n,
        1732001000n,
      ]);

      const result = await worker.processBatch();
      expect(result.reconciledCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });
  });

  describe("6. Contract Rejection & Hash Conflict", () => {
    it("permanently fails the job when on-chain hash conflicts with expected payload hash", async () => {
      const conflictingHash = "0x" + "9".repeat(64);
      mockContract.hasCommitment.mockResolvedValueOnce(true);
      mockContract.getCommitment.mockResolvedValueOnce([
        conflictingHash, // Mismatched hash!
        99n,
        1732001000n,
      ]);

      const result = await worker.processBatch();

      expect(result.leasedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.confirmedCount).toBe(0);

      // Verify job was permanently marked failed with WT_ERR_ONCHAIN_HASH_CONFLICT
      expect(mockDb.ledger_outbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            last_error_code: "WT_ERR_ONCHAIN_HASH_CONFLICT",
            lease_token: null,
            lease_expires_at: null,
          }),
        }),
      );
    });

    it("permanently fails the job when recordCommitment reverts with ConflictingCommitment", async () => {
      mockContract.hasCommitment.mockResolvedValueOnce(false);
      mockContract.recordCommitment.mockRejectedValueOnce(
        new Error("execution reverted: ConflictingCommitment(0x..., 0x..., 0x...)"),
      );

      const result = await worker.processBatch();

      expect(result.failedCount).toBe(1);
      expect(mockDb.ledger_outbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            last_error_code: "WT_ERR_ONCHAIN_HASH_CONFLICT",
          }),
        }),
      );
    });
  });

  describe("7. Signer Transaction-Nonce Concurrency", () => {
    it("serializes concurrent broadcasts and increments nonces sequentially", async () => {
      const address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const executedNonces: number[] = [];

      // Launch 3 concurrent broadcast operations
      const p1 = nonceManager.withSignerLock(address, mockProvider, async (nonce) => {
        executedNonces.push(nonce);
        return "tx1";
      });
      const p2 = nonceManager.withSignerLock(address, mockProvider, async (nonce) => {
        executedNonces.push(nonce);
        return "tx2";
      });
      const p3 = nonceManager.withSignerLock(address, mockProvider, async (nonce) => {
        executedNonces.push(nonce);
        return "tx3";
      });

      const results = await Promise.all([p1, p2, p3]);

      expect(results).toEqual(["tx1", "tx2", "tx3"]);
      expect(executedNonces).toEqual([5, 6, 7]);
    });

    it("resynchronizes nonce with chain upon failure", async () => {
      const address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

      // First call succeeds with nonce 5
      await nonceManager.withSignerLock(address, mockProvider, async () => "ok");

      // Second call fails with network error
      await expect(
        nonceManager.withSignerLock(address, mockProvider, async () => {
          throw new Error("broadcast failed");
        }),
      ).rejects.toThrow("broadcast failed");

      // Next call re-queries provider.getTransactionCount("pending")
      mockProvider.getTransactionCount.mockResolvedValueOnce(10);
      const nextNonce = await nonceManager.withSignerLock(address, mockProvider, async (n) => n);
      expect(nextNonce).toBe(10);
    });
  });

  describe("8. Public/Private Evidence Boundary & Diagnostics", () => {
    it("strictly excludes private nonces, internal payload bytes, and traceEventId from public evidence", async () => {
      // Pre-seed a public commitment
      const publicId = "99999999-8888-7777-6666-555555555555";
      const publicSha256 = crypto.createHash("sha256").update("public-payload-json").digest();
      const onChainCid = computeCommitmentId("public_journey", mockDeployment.id, publicId);

      const pubCommitment = {
        id: "public-db-id",
        deployment_id: mockDeployment.id,
        commitment_id: new Uint8Array(onChainCid),
        payload_sha256: new Uint8Array(publicSha256),
        public_payload_id: publicId,
        trace_event_id: null,
        internal_payload_bytes: null,
        internal_nonce: null,
        hash_scheme: "sha256",
        created_at: new Date(),
        ledger_deployments: mockDeployment,
        ledger_outbox: { status: "confirmed", attempt_count: 1 },
        ledger_transactions: [
          {
            status: "confirmed",
            tx_hash: new Uint8Array(Buffer.from("e".repeat(64), "hex")),
            block_number: 105n,
            block_timestamp: new Date(),
            block_hash: new Uint8Array(Buffer.from("f".repeat(64), "hex")),
            submitted_at: new Date(),
          },
        ],
      };

      mockDb.ledger_commitments.findFirst.mockResolvedValueOnce(pubCommitment);

      const evidence = await evidenceService.getPublicJourneyEvidence(publicId);

      expect(evidence.publicPayloadId).toBe(publicId);
      expect(evidence.onChainCommitmentId).toBe("0x" + onChainCid.toString("hex"));
      expect(evidence.payloadSha256).toBe("0x" + publicSha256.toString("hex"));
      expect(evidence.ledgerStatus).toBe("confirmed");
      expect(evidence.blockNumber).toBe(105);

      // Verify private fields are completely absent
      expect((evidence as any).internal_nonce).toBeUndefined();
      expect((evidence as any).internal_payload_bytes).toBeUndefined();
      expect((evidence as any).trace_event_id).toBeUndefined();
    });

    it("returns aggregate diagnostic stats for monitoring dashboard", async () => {
      const diagnostics = await evidenceService.getLedgerDiagnostics();

      expect(diagnostics.summary).toHaveProperty("pending");
      expect(diagnostics.summary).toHaveProperty("submitted");
      expect(diagnostics.summary).toHaveProperty("confirmed");
      expect(diagnostics.summary).toHaveProperty("failed");
      expect(diagnostics.summary).toHaveProperty("activeLeases");
      expect(diagnostics.activeDeployment?.code).toBe(mockDeployment.code);
    });
  });
});
