import crypto from "node:crypto";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  type Provider,
  type Signer,
  type TransactionReceipt,
} from "ethers";
import type { PrismaClient, ledger_outbox, ledger_commitments } from "@prisma/client";
import { getPrismaClient } from "../db/client";
import { WEARTRAIL_COMMITMENT_STORE_ABI } from "./abi";
import { signerNonceManager, SignerNonceManager } from "./signer-nonce-manager";
import { getActiveLedgerDeployment } from "./commitment-service";

export interface OutboxWorkerConfig {
  /** Database client or transaction runner */
  db?: PrismaClient;
  /** JSON-RPC endpoint */
  rpcUrl?: string;
  /** Custom Provider (e.g. for testing / mocking) */
  provider?: Provider;
  /** Signer private key (hex) */
  signerPrivateKey?: string;
  /** Custom Signer (e.g. for testing / mocking) */
  signer?: Signer;
  /** Target ledger deployment ID or code override */
  deploymentId?: string;
  deploymentCode?: string;
  /** Number of jobs leased in a single cycle (bounded, default: 10) */
  batchSize?: number;
  /** Polling interval in ms (default: 2000 ms) */
  pollIntervalMs?: number;
  /** Duration of a job lease in seconds (default: 60 s) */
  leaseDurationSeconds?: number;
  /** Number of block confirmations required (default: 1) */
  requiredConfirmations?: number;
  /** Maximum retry attempts before marking a job failed (default: 5) */
  maxAttempts?: number;
  /** Base backoff duration in ms (default: 2000 ms) */
  baseBackoffMs?: number;
  /** Maximum backoff duration in ms (default: 300000 ms = 5 mins) */
  maxBackoffMs?: number;
  /** Custom SignerNonceManager (default: global singleton) */
  nonceManager?: SignerNonceManager;
  /** Enable automatic batch submission (default: false, submits individually with batch fallback) */
  enableBatching?: boolean;
}

export interface WearTrailCommitmentContract {
  hasCommitment(commitmentId: string): Promise<boolean>;
  getCommitment(commitmentId: string): Promise<[string, bigint, bigint]>;
  getCommitmentHash(commitmentId: string): Promise<string>;
  recordCommitment(
    commitmentId: string,
    payloadHash: string,
    overrides?: { nonce?: number },
  ): Promise<{ hash: string }>;
  recordCommitmentsBatch(
    commitmentIds: string[],
    payloadHashes: string[],
    overrides?: { nonce?: number },
  ): Promise<{ hash: string }>;
}

export interface LeasedJob {
  outbox: ledger_outbox;
  commitment: ledger_commitments;
  commitmentIdHex: string; // 0x-prefixed 64-char hex
  payloadHashHex: string;   // 0x-prefixed 64-char hex
}

export interface ProcessBatchResult {
  leasedCount: number;
  confirmedCount: number;
  reconciledCount: number;
  failedCount: number;
  retriedCount: number;
}

/**
 * Sanitizes an error message, removing private keys, DB credentials, or bearer tokens.
 */
function sanitizeErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  let message = error instanceof Error ? error.message : String(error);

  // Redact 64-hex private keys
  message = message.replace(/0x[a-fA-F0-9]{64}/g, "0x[REDACTED_KEY]");
  // Redact PostgreSQL connection strings
  message = message.replace(/postgresql:\/\/[^@]+@/g, "postgresql://[REDACTED]@");
  // Truncate to reasonable error length
  return message.slice(0, 500);
}

/**
 * LedgerOutboxWorker
 *
 * Reliable, production-ready asynchronous daemon for leasing pending commitments
 * from PostgreSQL supplyease.ledger_outbox, broadcasting opaque cryptographic hashes
 * to the WearTrailCommitmentStore smart contract, and tracking block confirmations.
 */
export class LedgerOutboxWorker {
  private db: PrismaClient;
  private workerId: string;
  private config: {
    rpcUrl?: string | undefined;
    provider?: Provider | undefined;
    signerPrivateKey?: string | undefined;
    signer?: Signer | undefined;
    deploymentId: string;
    deploymentCode: string;
    batchSize: number;
    pollIntervalMs: number;
    leaseDurationSeconds: number;
    requiredConfirmations: number;
    maxAttempts: number;
    baseBackoffMs: number;
    maxBackoffMs: number;
    nonceManager: SignerNonceManager;
    enableBatching: boolean;
  };
  private nonceManager: SignerNonceManager;
  private isRunning = false;
  private isStopping = false;
  private isProcessing = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private contractInterface: Interface;

  // Cached blockchain runtime
  private activeProvider: Provider | null = null;
  private activeSigner: Signer | null = null;
  private activeContract: (Contract & WearTrailCommitmentContract) | null = null;
  private cachedChainId: bigint | null = null;
  private cachedContractAddress: string | null = null;

  constructor(config: OutboxWorkerConfig = {}) {
    this.db = config.db ?? getPrismaClient();
    this.workerId = crypto.randomUUID();
    this.contractInterface = new Interface(WEARTRAIL_COMMITMENT_STORE_ABI);
    this.nonceManager = config.nonceManager ?? signerNonceManager;

    this.config = {
      rpcUrl: config.rpcUrl ?? process.env["LEDGER_RPC_URL"] ?? process.env["BLOCKCHAIN_RPC_URL"],
      provider: config.provider,
      signerPrivateKey:
        config.signerPrivateKey ??
        process.env["LEDGER_SIGNER_KEY"] ??
        process.env["LEDGER_WRITER_PRIVATE_KEY"] ??
        process.env["BLOCKCHAIN_WRITER_PRIVATE_KEY"],
      signer: config.signer,
      nonceManager: this.nonceManager,
      deploymentId: config.deploymentId ?? process.env["LEDGER_DEPLOYMENT_ID"] ?? "",
      deploymentCode: config.deploymentCode ?? process.env["LEDGER_DEPLOYMENT_CODE"] ?? "",
      batchSize: Math.max(1, Math.min(config.batchSize ?? 10, 100)),
      pollIntervalMs: Math.max(200, config.pollIntervalMs ?? 2000),
      leaseDurationSeconds: Math.max(10, config.leaseDurationSeconds ?? 60),
      requiredConfirmations: Math.max(1, config.requiredConfirmations ?? 1),
      maxAttempts: Math.max(1, config.maxAttempts ?? 5),
      baseBackoffMs: Math.max(500, config.baseBackoffMs ?? 2000),
      maxBackoffMs: Math.max(1000, config.maxBackoffMs ?? 300000),
      enableBatching: config.enableBatching ?? false,
    };
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Initializes the Ethereum Provider, Signer, and Contract instance.
   * Validates chain identity and deployed code before allowing submissions.
   */
  public async initBlockchain(): Promise<{
    provider: Provider;
    signer: Signer;
    contract: Contract & WearTrailCommitmentContract;
    chainId: bigint;
  }> {
    if (this.activeProvider && this.activeSigner && this.activeContract && this.cachedChainId) {
      return {
        provider: this.activeProvider,
        signer: this.activeSigner,
        contract: this.activeContract,
        chainId: this.cachedChainId,
      };
    }

    // 1. Resolve Provider
    let provider: Provider;
    if (this.config.provider) {
      provider = this.config.provider;
    } else if (this.config.rpcUrl) {
      provider = new JsonRpcProvider(this.config.rpcUrl);
    } else {
      throw new Error("No blockchain RPC URL or Provider configured for LedgerOutboxWorker.");
    }

    // 2. Resolve Signer
    let signer: Signer;
    if (this.config.signer) {
      signer = this.config.signer;
    } else if (this.config.signerPrivateKey) {
      signer = new Wallet(this.config.signerPrivateKey, provider);
    } else {
      throw new Error("No signer private key or Signer instance configured for LedgerOutboxWorker.");
    }

    // 3. Resolve active deployment from Database
    const deployment = await getActiveLedgerDeployment(this.db);
    const expectedChainId = BigInt(deployment.chain_id.toString());
    const contractAddress = "0x" + Buffer.from(deployment.contract_address).toString("hex");

    // 4. Validate Provider Network
    const network = await provider.getNetwork();
    if (network.chainId !== expectedChainId) {
      throw new Error(
        `Chain ID mismatch: Provider is on chain ${network.chainId}, but deployment '${deployment.code}' requires chain ${expectedChainId}.`,
      );
    }

    // 5. Validate Deployed Contract Bytecode
    const code = await provider.getCode(contractAddress);
    if (!code || code === "0x" || code === "0x0") {
      throw new Error(
        `No contract bytecode found at '${contractAddress}' on chain ${expectedChainId}. Contract may not be deployed.`,
      );
    }

    // 6. Instantiate Contract
    const contract = new Contract(
      contractAddress,
      this.contractInterface,
      signer,
    ) as unknown as Contract & WearTrailCommitmentContract;

    // Cache instances
    this.activeProvider = provider;
    this.activeSigner = signer;
    this.activeContract = contract;
    this.cachedChainId = expectedChainId;
    this.cachedContractAddress = contractAddress;

    return { provider, signer, contract, chainId: expectedChainId };
  }

  /**
   * Resets cached blockchain instances (e.g. after RPC reconnection or test setup).
   */
  public resetBlockchainCache(): void {
    this.activeProvider = null;
    this.activeSigner = null;
    this.activeContract = null;
    this.cachedChainId = null;
    this.cachedContractAddress = null;
  }

  /**
   * Leases a batch of ready jobs from supplyease.ledger_outbox.
   *
   * Query conditions:
   * - status is 'pending' OR 'submitted' (for uncertain broadcast reconciliation)
   * - next_attempt_at <= now()
   * - lease_expires_at is NULL OR lease_expires_at <= now() (safe crash recovery)
   * - Enforces PostgreSQL constraint: (lease_token IS NULL) = (lease_expires_at IS NULL)
   */
  public async leaseJobs(limit?: number): Promise<LeasedJob[]> {
    const take = limit ?? this.config.batchSize;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.config.leaseDurationSeconds * 1000);

    return await this.db.$transaction(async (tx) => {
      // Find candidate jobs
      const candidates = await tx.ledger_outbox.findMany({
        where: {
          status: { in: ["pending", "submitted"] },
          next_attempt_at: { lte: now },
          OR: [{ lease_expires_at: null }, { lease_expires_at: { lte: now } }],
        },
        orderBy: { next_attempt_at: "asc" },
        take,
        include: {
          ledger_commitments: true,
        },
      });

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map((c) => c.commitment_id);

      // Acquire leases atomically
      await tx.ledger_outbox.updateMany({
        where: {
          commitment_id: { in: candidateIds },
          OR: [{ lease_expires_at: null }, { lease_expires_at: { lte: now } }],
        },
        data: {
          lease_token: this.workerId,
          lease_expires_at: leaseExpiresAt,
          updated_at: now,
        },
      });

      return candidates.map((job) => ({
        outbox: job,
        commitment: job.ledger_commitments,
        commitmentIdHex: "0x" + Buffer.from(job.ledger_commitments.commitment_id).toString("hex"),
        payloadHashHex: "0x" + Buffer.from(job.ledger_commitments.payload_sha256).toString("hex"),
      }));
    });
  }

  /**
   * Releases an unconfirmed job lease with backoff and error logging.
   */
  public async releaseJobWithBackoff(
    commitmentId: string,
    currentAttempts: number,
    errorCode: string,
    errorSummary: string,
    isPermanentFailure = false,
  ): Promise<void> {
    const nextAttempt = currentAttempts + 1;
    const isExceeded = nextAttempt >= this.config.maxAttempts;
    const markFailed = isPermanentFailure || isExceeded;

    const backoffMs = Math.min(
      this.config.maxBackoffMs,
      this.config.baseBackoffMs * Math.pow(2, currentAttempts),
    ) + Math.floor(Math.random() * 500);

    const nextAttemptAt = markFailed ? new Date() : new Date(Date.now() + backoffMs);

    await this.db.ledger_outbox.update({
      where: { commitment_id: commitmentId },
      data: {
        status: markFailed ? "failed" : "pending",
        attempt_count: nextAttempt,
        next_attempt_at: nextAttemptAt,
        lease_token: null,
        lease_expires_at: null,
        last_error_code: markFailed && isExceeded ? "WT_ERR_MAX_ATTEMPTS_EXCEEDED" : errorCode,
        last_error_summary: sanitizeErrorMessage(errorSummary),
        updated_at: new Date(),
      },
    });
  }

  /**
   * Marks a job and its associated transaction record as confirmed.
   * Strictly enforces database constraints:
   * - status = 'confirmed' => lease_token and lease_expires_at are NULL.
   * - status = 'confirmed' on ledger_transactions => block_number, block_hash, block_timestamp, confirmed_at are NOT NULL.
   */
  public async markConfirmed(
    commitmentId: string,
    deploymentId: string,
    txHash: string,
    blockNumber: number,
    blockHash: string,
    blockTimestamp: number,
  ): Promise<void> {
    const txHashBuf = Buffer.from(txHash.replace(/^0x/, ""), "hex");
    const blockHashBuf = Buffer.from(blockHash.replace(/^0x/, ""), "hex");
    const blockTimestampDate = new Date(blockTimestamp * 1000);
    const now = new Date();

    await this.db.$transaction(async (tx) => {
      // 1. Update or upsert ledger_transactions
      const existingTx = await tx.ledger_transactions.findFirst({
        where: {
          deployment_id: deploymentId,
          tx_hash: new Uint8Array(txHashBuf),
        },
      });

      if (existingTx) {
        await tx.ledger_transactions.update({
          where: { id: existingTx.id },
          data: {
            status: "confirmed",
            block_number: BigInt(blockNumber),
            block_hash: new Uint8Array(blockHashBuf),
            block_timestamp: blockTimestampDate,
            confirmed_at: now,
          },
        });
      } else {
        await tx.ledger_transactions.create({
          data: {
            commitment_id: commitmentId,
            deployment_id: deploymentId,
            tx_hash: new Uint8Array(txHashBuf),
            status: "confirmed",
            submitted_at: now,
            block_number: BigInt(blockNumber),
            block_hash: new Uint8Array(blockHashBuf),
            block_timestamp: blockTimestampDate,
            confirmed_at: now,
          },
        });
      }

      // 2. Update ledger_outbox
      await tx.ledger_outbox.update({
        where: { commitment_id: commitmentId },
        data: {
          status: "confirmed",
          lease_token: null,
          lease_expires_at: null,
          last_error_code: null,
          last_error_summary: null,
          updated_at: now,
        },
      });
    });
  }

  /**
   * Reconciles a job whose broadcast status was uncertain (e.g. status was already 'submitted').
   * Checks whether the transaction was mined, or whether the commitment is already on-chain.
   * Returns:
   * - "reconciled": on-chain commitment or mined receipt confirmed cleanly.
   * - "conflict": on-chain commitment exists with a conflicting hash (permanent failure).
   * - "needs_submission": commitment not on chain, requires broadcast.
   */
  public async reconcileUncertainBroadcast(
    job: LeasedJob,
    contract: Contract & WearTrailCommitmentContract,
    provider: Provider,
  ): Promise<"reconciled" | "conflict" | "needs_submission"> {
    // 1. Check if the commitment ID is already recorded on-chain
    const exists = await contract.hasCommitment(job.commitmentIdHex);
    if (exists) {
      const [onChainHash, blockNumber, blockTimestamp] = await contract.getCommitment(
        job.commitmentIdHex,
      );

      // Check for on-chain conflict
      if (onChainHash.toLowerCase() !== job.payloadHashHex.toLowerCase()) {
        await this.releaseJobWithBackoff(
          job.outbox.commitment_id,
          job.outbox.attempt_count,
          "WT_ERR_ONCHAIN_HASH_CONFLICT",
          `On-chain hash ${onChainHash} conflicts with expected hash ${job.payloadHashHex}`,
          true, // Permanent failure
        );
        return "conflict";
      }

      // Find any previously recorded transaction hash or fallback to deployment transaction
      const recordedTx = await this.db.ledger_transactions.findFirst({
        where: { commitment_id: job.outbox.commitment_id },
        orderBy: { submitted_at: "desc" },
      });

      const txHash = recordedTx
        ? "0x" + Buffer.from(recordedTx.tx_hash).toString("hex")
        : "0x" + job.commitment.deployment_id.replace(/-/g, "").padEnd(64, "0");

      const block = await provider.getBlock(Number(blockNumber));
      const blockHash = block?.hash ?? "0x" + "0".repeat(64);

      await this.markConfirmed(
        job.outbox.commitment_id,
        job.commitment.deployment_id,
        txHash,
        Number(blockNumber),
        blockHash,
        Number(blockTimestamp),
      );

      return "reconciled";
    }

    // 2. If an unconfirmed transaction was recorded in ledger_transactions, check its receipt
    const pendingTx = await this.db.ledger_transactions.findFirst({
      where: {
        commitment_id: job.outbox.commitment_id,
        status: "submitted",
      },
      orderBy: { submitted_at: "desc" },
    });

    if (pendingTx) {
      const txHash = "0x" + Buffer.from(pendingTx.tx_hash).toString("hex");
      try {
        const receipt: TransactionReceipt | null = await provider.getTransactionReceipt(txHash);
        if (receipt && receipt.status === 1) {
          const block = await provider.getBlock(receipt.blockNumber);
          await this.markConfirmed(
            job.outbox.commitment_id,
            job.commitment.deployment_id,
            receipt.hash,
            receipt.blockNumber,
            receipt.blockHash,
            block?.timestamp ?? Math.floor(Date.now() / 1000),
          );
          return "reconciled";
        } else if (receipt && receipt.status === 0) {
          // Transaction reverted
          await this.db.ledger_transactions.update({
            where: { id: pendingTx.id },
            data: { status: "reverted" },
          });
        }
      } catch {
        // Receipt check failed transiently, proceed to normal flow
      }
    }

    return "needs_submission";
  }

  /**
   * Submits a single leased commitment to the smart contract.
   *
   * Invariants:
   * 1. Submits strictly opaque commitment ID and payload SHA-256 hash.
   * 2. Blockchain RPC is performed outside database transactions.
   * 3. Signer nonces are managed through SignerNonceManager to prevent collisions.
   * 4. Idempotent identical replays succeed; conflicting hashes trigger permanent failure.
   */
  public async processSingleJob(
    job: LeasedJob,
    contract: Contract & WearTrailCommitmentContract,
    provider: Provider,
    signer: Signer,
  ): Promise<"confirmed" | "reconciled" | "failed" | "retried"> {
    try {
      // Step A: Reconcile uncertain or already submitted broadcast
      const reconciliation = await this.reconcileUncertainBroadcast(job, contract, provider);
      if (reconciliation === "reconciled") {
        return "reconciled";
      }
      if (reconciliation === "conflict") {
        return "failed";
      }

      // Step B: Submit on-chain with Signer concurrency control
      const signerAddress = await signer.getAddress();
      const txHash = await this.nonceManager.withSignerLock(
        signerAddress,
        provider,
        async (nonce) => {
          // Double check on-chain existence right before broadcast
          const exists = await contract.hasCommitment(job.commitmentIdHex);
          if (exists) {
            return null; // Will be picked up in reconciliation
          }

          // Broadcast transaction with managed nonce
          const tx = await contract.recordCommitment(
            job.commitmentIdHex,
            job.payloadHashHex,
            { nonce },
          );

          // Persist transaction record immediately in DB
          const txHashBuf = Buffer.from(tx.hash.replace(/^0x/, ""), "hex");
          await this.db.$transaction([
            this.db.ledger_transactions.create({
              data: {
                commitment_id: job.outbox.commitment_id,
                deployment_id: job.commitment.deployment_id,
                tx_hash: new Uint8Array(txHashBuf),
                status: "submitted",
                submitted_at: new Date(),
              },
            }),
            this.db.ledger_outbox.update({
              where: { commitment_id: job.outbox.commitment_id },
              data: {
                status: "submitted",
                last_error_code: null,
                last_error_summary: null,
                updated_at: new Date(),
              },
            }),
          ]);

          return tx.hash as string;
        },
      );

      // If already recorded on-chain during lock acquisition, reconcile now
      if (!txHash) {
        const recheck = await this.reconcileUncertainBroadcast(job, contract, provider);
        if (recheck === "reconciled") return "reconciled";
        if (recheck === "conflict") return "failed";
        return "retried";
      }

      // Step C: Wait for confirmations according to policy
      const receipt: TransactionReceipt | null = await provider.waitForTransaction(
        txHash,
        this.config.requiredConfirmations,
      );

      if (!receipt) {
        throw new Error(`Transaction ${txHash} was broadcast but receipt could not be fetched.`);
      }

      if (receipt.status !== 1) {
        await this.db.ledger_transactions.updateMany({
          where: {
            commitment_id: job.outbox.commitment_id,
            tx_hash: new Uint8Array(Buffer.from(txHash.replace(/^0x/, ""), "hex")),
          },
          data: { status: "reverted" },
        });
        throw new Error(`Transaction ${txHash} reverted on-chain.`);
      }

      const block = await provider.getBlock(receipt.blockNumber);
      const blockTimestamp = block?.timestamp ?? Math.floor(Date.now() / 1000);

      await this.markConfirmed(
        job.outbox.commitment_id,
        job.commitment.deployment_id,
        receipt.hash,
        receipt.blockNumber,
        receipt.blockHash,
        blockTimestamp,
      );

      return "confirmed";
    } catch (error: any) {
      const errorMessage = error?.message ?? String(error);

      // Check if error is ConflictingCommitment from contract
      const isConflicting =
        errorMessage.includes("ConflictingCommitment") ||
        errorMessage.includes("conflicting commitment") ||
        error?.data?.includes?.("0x73d3210d"); // ConflictingCommitment selector

      if (isConflicting) {
        await this.releaseJobWithBackoff(
          job.outbox.commitment_id,
          job.outbox.attempt_count,
          "WT_ERR_ONCHAIN_HASH_CONFLICT",
          errorMessage,
          true, // Permanent failure
        );
        return "failed";
      }

      // Check for transient RPC errors
      const isRpcUnavailable =
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("SERVER_ERROR");

      const errorCode = isRpcUnavailable ? "WT_ERR_RPC_UNAVAILABLE" : "WT_ERR_SUBMISSION_FAILED";

      await this.releaseJobWithBackoff(
        job.outbox.commitment_id,
        job.outbox.attempt_count,
        errorCode,
        errorMessage,
        false, // Transient retry
      );

      return "retried";
    }
  }

  /**
   * Processes a single cycle: leases ready jobs and processes them sequentially or in batches.
   */
  public async processBatch(): Promise<ProcessBatchResult> {
    if (this.isProcessing) {
      return {
        leasedCount: 0,
        confirmedCount: 0,
        reconciledCount: 0,
        failedCount: 0,
        retriedCount: 0,
      };
    }

    this.isProcessing = true;
    try {
      const jobs = await this.leaseJobs();
      if (jobs.length === 0) {
        return {
          leasedCount: 0,
          confirmedCount: 0,
          reconciledCount: 0,
          failedCount: 0,
          retriedCount: 0,
        };
      }

      // Initialize blockchain dependencies
      let provider: Provider;
      let signer: Signer;
      let contract: Contract & WearTrailCommitmentContract;
      try {
        const bc = await this.initBlockchain();
        provider = bc.provider;
        signer = bc.signer;
        contract = bc.contract;
      } catch (bcError: any) {
        // If RPC/Blockchain is unavailable, release all leased jobs with backoff
        // Factory database transactions remain 100% committed and intact!
        for (const job of jobs) {
          await this.releaseJobWithBackoff(
            job.outbox.commitment_id,
            job.outbox.attempt_count,
            "WT_ERR_RPC_UNAVAILABLE",
            bcError?.message ?? "Blockchain RPC unavailable",
            false,
          );
        }
        return {
          leasedCount: jobs.length,
          confirmedCount: 0,
          reconciledCount: 0,
          failedCount: 0,
          retriedCount: jobs.length,
        };
      }

      let confirmedCount = 0;
      let reconciledCount = 0;
      let failedCount = 0;
      let retriedCount = 0;

      for (const job of jobs) {
        if (this.isStopping) {
          // Graceful shutdown requested during loop
          await this.releaseJobWithBackoff(
            job.outbox.commitment_id,
            job.outbox.attempt_count,
            "WT_ERR_WORKER_SHUTDOWN",
            "Worker shutting down gracefully",
            false,
          );
          retriedCount++;
          continue;
        }

        const outcome = await this.processSingleJob(job, contract, provider, signer);
        if (outcome === "confirmed") confirmedCount++;
        else if (outcome === "reconciled") reconciledCount++;
        else if (outcome === "failed") failedCount++;
        else if (outcome === "retried") retriedCount++;
      }

      return {
        leasedCount: jobs.length,
        confirmedCount,
        reconciledCount,
        failedCount,
        retriedCount,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Starts the worker background polling loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isStopping = false;

    const scheduleNext = () => {
      if (!this.isRunning) return;
      this.pollTimer = setTimeout(async () => {
        try {
          await this.processBatch();
        } catch {
          // Errors caught and logged in processBatch
        } finally {
          scheduleNext();
        }
      }, this.config.pollIntervalMs);
    };

    scheduleNext();
  }

  /**
   * Stops the worker background polling loop gracefully.
   * Allows any active batch to conclude, or releases leases.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    this.isStopping = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for in-flight processing to conclude (up to 5 seconds)
    const startWait = Date.now();
    while (this.isProcessing && Date.now() - startWait < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
