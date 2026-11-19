import crypto from "node:crypto";
import type { PrismaClient, ledger_deployments, ledger_commitments } from "@prisma/client";
import type { PrismaTransactionClient } from "../db/types";
import { getPrismaClient } from "../db/client";
import { ApiError } from "../middleware/responses";
import { toCanonicalJson } from "../../domain/canonical";
import type {
  CreateCommitmentInput,
  ILedgerOutboxService,
} from "../contracts/services";

export interface CreateInternalCommitmentInput {
  traceEventId: string;
  payload: unknown;
  deploymentId?: string;
  commitmentId?: Buffer | Uint8Array;
}

export interface CreatePublicCommitmentInput {
  publicPayloadId: string;
  payloadSha256: Buffer | Uint8Array;
  deploymentId?: string;
  commitmentId?: Buffer | Uint8Array;
}

export interface EnqueuedCommitmentResult {
  commitmentId: string; // UUID primary key of ledger_commitments.id
  onChainCommitmentId: string; // 0x-prefixed 64-char hex (bytes32)
  payloadSha256: string; // 0x-prefixed 64-char hex (bytes32)
  scope: "event" | "public_journey";
  deploymentId: string;
  isExisting: boolean;
  status: "pending";
}

/**
 * Computes a deterministic 32-byte opaque commitment ID (bytes32)
 * from deployment ID, scope, and entity ID.
 */
export function computeCommitmentId(
  scope: "event" | "public_journey" | "trace_event" | "public_payload" | string,
  deploymentId: string,
  entityId: string,
): Buffer {
  const normalizedScope =
    scope === "trace_event" || scope === "event" ? "event" : "public_journey";
  return crypto
    .createHash("sha256")
    .update(`${deploymentId}:${normalizedScope}:${entityId}`, "utf8")
    .digest();
}

/**
 * Resolves the active ledger deployment from the database.
 * Supports explicit configuration via LEDGER_DEPLOYMENT_ID, LEDGER_DEPLOYMENT_CODE,
 * or LEDGER_CHAIN_ID / CHAIN_ID, falling back to the latest registered deployment.
 * Throws WT_ERR_NO_LEDGER_DEPLOYMENT if none is registered.
 */
export async function getActiveLedgerDeployment(
  db: PrismaTransactionClient | PrismaClient,
): Promise<ledger_deployments> {
  const envId = process.env["LEDGER_DEPLOYMENT_ID"];
  const envCode = process.env["LEDGER_DEPLOYMENT_CODE"];
  const envChainId = process.env["LEDGER_CHAIN_ID"] || process.env["CHAIN_ID"];

  let deployment: ledger_deployments | null = null;
  if (envId) {
    deployment = await db.ledger_deployments.findUnique({ where: { id: envId } });
  } else if (envCode) {
    deployment = await db.ledger_deployments.findUnique({ where: { code: envCode } });
  } else if (envChainId) {
    deployment = await db.ledger_deployments.findFirst({
      where: { chain_id: Number(envChainId) },
      orderBy: { registered_at: "desc" },
    });
  }

  if (!deployment) {
    deployment = await db.ledger_deployments.findFirst({
      orderBy: { registered_at: "desc" },
    });
  }

  if (!deployment) {
    throw ApiError.internal(
      "No registered ledger deployment found in database. Run 'npm run blockchain:register' first.",
      undefined,
      "WT_ERR_NO_LEDGER_DEPLOYMENT",
    );
  }

  return deployment;
}

/**
 * Creates an internal event commitment and enqueues it in the ledger outbox.
 *
 * Implements the approved sha256_nonce_v1 formula:
 * - Versioned canonical UTF-8 bytes of the internal event payload
 * - Private unpredictable 32-byte cryptographic nonce
 * - payload_sha256 = SHA256(nonce || canonicalBytes)
 * - Atomically inserts into ledger_commitments and ledger_outbox
 * - Preserves identity and payload idempotently across retries
 * - Rejects conflicting payloads reusing the same traceEventId
 */
export async function createInternalCommitment(
  input: CreateInternalCommitmentInput,
  tx: PrismaTransactionClient,
): Promise<EnqueuedCommitmentResult> {
  const deployment = input.deploymentId
    ? await tx.ledger_deployments.findUnique({ where: { id: input.deploymentId } })
    : await getActiveLedgerDeployment(tx);

  if (!deployment) {
    throw ApiError.internal(
      `Ledger deployment '${input.deploymentId}' not found.`,
      undefined,
      "WT_ERR_NO_LEDGER_DEPLOYMENT",
    );
  }

  // 1. Serialize payload to canonical UTF-8 bytes
  let canonicalBytes: Buffer;
  if (Buffer.isBuffer(input.payload)) {
    canonicalBytes = input.payload;
  } else if (input.payload instanceof Uint8Array) {
    canonicalBytes = Buffer.from(input.payload);
  } else if (typeof input.payload === "string") {
    canonicalBytes = Buffer.from(input.payload, "utf8");
  } else {
    canonicalBytes = Buffer.from(toCanonicalJson(input.payload), "utf8");
  }

  if (canonicalBytes.length === 0) {
    throw ApiError.badRequest(
      "Internal event payload bytes cannot be empty.",
      undefined,
      "WT_ERR_EMPTY_PAYLOAD",
    );
  }

  // 2. Check for existing commitment by (deployment_id, trace_event_id)
  const existing = await tx.ledger_commitments.findFirst({
    where: {
      deployment_id: deployment.id,
      trace_event_id: input.traceEventId,
    },
  });

  if (existing) {
    // Compare canonical payload bytes for identical retry
    const existingBytes = existing.internal_payload_bytes
      ? Buffer.from(existing.internal_payload_bytes)
      : null;

    if (existingBytes && Buffer.compare(existingBytes, canonicalBytes) === 0) {
      return {
        commitmentId: existing.id,
        onChainCommitmentId: "0x" + Buffer.from(existing.commitment_id).toString("hex"),
        payloadSha256: "0x" + Buffer.from(existing.payload_sha256).toString("hex"),
        scope: "event",
        deploymentId: deployment.id,
        isExisting: true,
        status: "pending",
      };
    }

    throw ApiError.conflict(
      `Trace event '${input.traceEventId}' has already been committed with a conflicting payload.`,
      { traceEventId: input.traceEventId },
      "WT_ERR_COMMITMENT_CONFLICT",
    );
  }

  // 3. Generate unpredictable 32-byte private nonce
  const nonce = crypto.randomBytes(32);

  // 4. Compute sha256(nonce || canonicalBytes)
  const payloadSha256 = crypto
    .createHash("sha256")
    .update(Buffer.concat([nonce, canonicalBytes]))
    .digest();

  // 5. Derive deterministic on-chain commitment ID (bytes32)
  const commitmentId = input.commitmentId
    ? Buffer.from(input.commitmentId)
    : computeCommitmentId("event", deployment.id, input.traceEventId);

  // 6. Insert ledger_commitments row
  const commitment = await tx.ledger_commitments.create({
    data: {
      deployment_id: deployment.id,
      commitment_id: new Uint8Array(commitmentId),
      payload_sha256: new Uint8Array(payloadSha256),
      trace_event_id: input.traceEventId,
      internal_payload_bytes: new Uint8Array(canonicalBytes),
      internal_nonce: new Uint8Array(nonce),
      hash_scheme: "sha256_nonce_v1",
    },
  });

  // 7. Atomically insert pending job into ledger_outbox
  await tx.ledger_outbox.create({
    data: {
      commitment_id: commitment.id,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date(),
    },
  });

  return {
    commitmentId: commitment.id,
    onChainCommitmentId: "0x" + commitmentId.toString("hex"),
    payloadSha256: "0x" + payloadSha256.toString("hex"),
    scope: "event",
    deploymentId: deployment.id,
    isExisting: false,
    status: "pending",
  };
}

/**
 * Creates a public journey commitment and enqueues it in the ledger outbox.
 *
 * Implements public commitment constraints:
 * - Accepts Member 4's exact public payload version and hash
 * - hash_scheme is 'sha256'
 * - internal_nonce and internal_payload_bytes are strictly NULL (separation of public/private evidence)
 * - Atomically inserts into ledger_commitments and ledger_outbox
 * - Preserves identity idempotently across retries
 * - Rejects conflicting hashes reusing the same publicPayloadId
 */
export async function createPublicCommitment(
  input: CreatePublicCommitmentInput,
  tx: PrismaTransactionClient,
): Promise<EnqueuedCommitmentResult> {
  const deployment = input.deploymentId
    ? await tx.ledger_deployments.findUnique({ where: { id: input.deploymentId } })
    : await getActiveLedgerDeployment(tx);

  if (!deployment) {
    throw ApiError.internal(
      `Ledger deployment '${input.deploymentId}' not found.`,
      undefined,
      "WT_ERR_NO_LEDGER_DEPLOYMENT",
    );
  }

  const payloadHashBuf = Buffer.isBuffer(input.payloadSha256)
    ? input.payloadSha256
    : Buffer.from(input.payloadSha256);

  if (payloadHashBuf.length !== 32) {
    throw ApiError.badRequest(
      "Public payload SHA-256 hash must be exactly 32 bytes.",
      { length: payloadHashBuf.length },
      "WT_ERR_INVALID_HASH_LENGTH",
    );
  }

  // 1. Check for existing commitment by (deployment_id, public_payload_id)
  const existing = await tx.ledger_commitments.findFirst({
    where: {
      deployment_id: deployment.id,
      public_payload_id: input.publicPayloadId,
    },
  });

  if (existing) {
    const existingHash = Buffer.from(existing.payload_sha256);
    if (Buffer.compare(existingHash, payloadHashBuf) === 0) {
      return {
        commitmentId: existing.id,
        onChainCommitmentId: "0x" + Buffer.from(existing.commitment_id).toString("hex"),
        payloadSha256: "0x" + existingHash.toString("hex"),
        scope: "public_journey",
        deploymentId: deployment.id,
        isExisting: true,
        status: "pending",
      };
    }

    throw ApiError.conflict(
      `Public payload '${input.publicPayloadId}' has already been committed with a different hash.`,
      { publicPayloadId: input.publicPayloadId },
      "WT_ERR_COMMITMENT_CONFLICT",
    );
  }

  // 2. Derive deterministic on-chain commitment ID (bytes32)
  const commitmentId = input.commitmentId
    ? Buffer.from(input.commitmentId)
    : computeCommitmentId("public_journey", deployment.id, input.publicPayloadId);

  // 3. Insert ledger_commitments row
  const commitment = await tx.ledger_commitments.create({
    data: {
      deployment_id: deployment.id,
      commitment_id: new Uint8Array(commitmentId),
      payload_sha256: new Uint8Array(payloadHashBuf),
      public_payload_id: input.publicPayloadId,
      hash_scheme: "sha256",
    },
  });

  // 4. Atomically insert pending job into ledger_outbox
  await tx.ledger_outbox.create({
    data: {
      commitment_id: commitment.id,
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date(),
    },
  });

  return {
    commitmentId: commitment.id,
    onChainCommitmentId: "0x" + commitmentId.toString("hex"),
    payloadSha256: "0x" + payloadHashBuf.toString("hex"),
    scope: "public_journey",
    deploymentId: deployment.id,
    isExisting: false,
    status: "pending",
  };
}

/**
 * Concrete implementation of the shared ILedgerOutboxService contract.
 */
export class LedgerOutboxService implements ILedgerOutboxService {
  public async queueCommitment(
    input: CreateCommitmentInput,
    tx: PrismaTransactionClient,
  ): Promise<string> {
    if (input.scope === "event") {
      if (!input.traceEventId) {
        throw ApiError.badRequest(
          "traceEventId is required for event commitment.",
          undefined,
          "WT_ERR_MISSING_TRACE_EVENT",
        );
      }
      const res = await createInternalCommitment(
        {
          traceEventId: input.traceEventId,
          payload: input.internalPayloadBytes ?? { traceEventId: input.traceEventId },
        },
        tx,
      );
      return res.commitmentId;
    }

    if (input.scope === "public_journey") {
      if (!input.publicPayloadId) {
        throw ApiError.badRequest(
          "publicPayloadId is required for public_journey commitment.",
          undefined,
          "WT_ERR_MISSING_PUBLIC_PAYLOAD",
        );
      }
      const res = await createPublicCommitment(
        {
          publicPayloadId: input.publicPayloadId,
          payloadSha256: input.payloadSha256,
        },
        tx,
      );
      return res.commitmentId;
    }

    throw ApiError.badRequest(
      `Unknown commitment scope '${input.scope}'.`,
      undefined,
      "WT_ERR_INVALID_SCOPE",
    );
  }
}

/**
 * Singleton instance of LedgerOutboxService.
 */
export const ledgerOutboxService = new LedgerOutboxService();
