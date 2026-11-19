import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "../db/client";
import { ApiError } from "../middleware/responses";
import { getActiveLedgerDeployment } from "./commitment-service";

export interface CommitmentEvidenceDto {
  commitmentDbId: string;
  onChainCommitmentId: string;
  payloadSha256: string;
  scope: "event" | "public_journey";
  status: "pending" | "submitted" | "confirmed" | "failed";
  attemptCount: number;
  deploymentCode: string;
  contractAddress: string;
  chainId: number;
  confirmedTransaction: {
    txHash: string;
    blockNumber: number;
    blockTimestamp: string;
    blockHash: string;
  } | null;
  transactions: Array<{
    txHash: string;
    status: string;
    submittedAt: string;
    blockNumber: number | null;
  }>;
  lastError?:
    | {
        code: string | null;
        summary: string | null;
      }
    | undefined;
  // Private fields only returned when explicitly authorized
  privateDetails?:
    | {
        traceEventId?: string | undefined;
        hashScheme: string;
        hasInternalPayload: boolean;
      }
    | undefined;
}

export interface PublicCustomerEvidenceDto {
  publicPayloadId: string;
  onChainCommitmentId: string;
  payloadSha256: string;
  ledgerStatus: "pending" | "submitted" | "confirmed" | "failed";
  contractAddress: string;
  chainId: number;
  txHash: string | null;
  blockNumber: number | null;
  blockTimestamp: string | null;
  blockHash: string | null;
}

export interface LedgerDiagnosticsDto {
  summary: {
    pending: number;
    submitted: number;
    confirmed: number;
    failed: number;
    activeLeases: number;
  };
  activeDeployment: {
    id: string;
    code: string;
    chainId: number;
    contractAddress: string;
    networkName: string;
    protocolVersion: number;
  } | null;
  recentErrors: Array<{
    commitmentId: string;
    errorCode: string | null;
    summary: string | null;
    updatedAt: string;
  }>;
}

/**
 * LedgerEvidenceService
 *
 * Provides server-side queries for operational ledger monitoring and public shopper verification,
 * strictly enforcing the boundary between private factory facts and public customer evidence.
 */
export class LedgerEvidenceService {
  private db: PrismaClient;

  constructor(db?: PrismaClient) {
    this.db = db ?? getPrismaClient();
  }

  /**
   * Retrieves commitment evidence by database UUID, on-chain bytes32 commitmentId,
   * traceEventId, or publicPayloadId.
   */
  public async getCommitmentEvidence(
    identifier: string,
    options: { allowPrivate?: boolean } = {},
  ): Promise<CommitmentEvidenceDto> {
    const isHex32 = identifier.startsWith("0x") && identifier.length === 66;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    let commitment = null;

    if (isUuid) {
      commitment = await this.db.ledger_commitments.findFirst({
        where: {
          OR: [
            { id: identifier },
            { trace_event_id: identifier },
            { public_payload_id: identifier },
          ],
        },
        include: {
          ledger_outbox: true,
          ledger_transactions: { orderBy: { submitted_at: "desc" } },
          ledger_deployments: true,
        },
      });
    } else if (isHex32) {
      const bytes = Buffer.from(identifier.slice(2), "hex");
      commitment = await this.db.ledger_commitments.findFirst({
        where: {
          commitment_id: new Uint8Array(bytes),
        },
        include: {
          ledger_outbox: true,
          ledger_transactions: { orderBy: { submitted_at: "desc" } },
          ledger_deployments: true,
        },
      });
    }

    if (!commitment) {
      throw ApiError.notFound(
        `Ledger commitment not found for identifier '${identifier}'.`,
        { identifier },
        "WT_ERR_COMMITMENT_NOT_FOUND",
      );
    }

    const confirmedTx = commitment.ledger_transactions.find(
      (tx) => tx.status === "confirmed" && tx.block_number !== null,
    );

    const onChainCommitmentId =
      "0x" + Buffer.from(commitment.commitment_id).toString("hex");
    const payloadSha256 =
      "0x" + Buffer.from(commitment.payload_sha256).toString("hex");
    const contractAddress =
      "0x" + Buffer.from(commitment.ledger_deployments.contract_address).toString("hex");

    const scope: "event" | "public_journey" = commitment.public_payload_id
      ? "public_journey"
      : "event";

    const result: CommitmentEvidenceDto = {
      commitmentDbId: commitment.id,
      onChainCommitmentId,
      payloadSha256,
      scope,
      status: (commitment.ledger_outbox?.status as any) ?? "pending",
      attemptCount: commitment.ledger_outbox?.attempt_count ?? 0,
      deploymentCode: commitment.ledger_deployments.code,
      contractAddress,
      chainId: Number(commitment.ledger_deployments.chain_id),
      confirmedTransaction: confirmedTx
        ? {
            txHash: "0x" + Buffer.from(confirmedTx.tx_hash).toString("hex"),
            blockNumber: Number(confirmedTx.block_number),
            blockTimestamp:
              confirmedTx.block_timestamp?.toISOString() ?? new Date().toISOString(),
            blockHash: confirmedTx.block_hash
              ? "0x" + Buffer.from(confirmedTx.block_hash).toString("hex")
              : "0x" + "0".repeat(64),
          }
        : null,
      transactions: commitment.ledger_transactions.map((tx) => ({
        txHash: "0x" + Buffer.from(tx.tx_hash).toString("hex"),
        status: tx.status,
        submittedAt: tx.submitted_at.toISOString(),
        blockNumber: tx.block_number ? Number(tx.block_number) : null,
      })),
      lastError: commitment.ledger_outbox?.last_error_code
        ? {
            code: commitment.ledger_outbox.last_error_code,
            summary: commitment.ledger_outbox.last_error_summary,
          }
        : undefined,
    };

    // Strictly enforce public/private boundary:
    // Only include private factory details when explicitly authorized and for internal events
    if (options.allowPrivate && scope === "event") {
      result.privateDetails = {
        traceEventId: commitment.trace_event_id ?? undefined,
        hashScheme: commitment.hash_scheme,
        hasInternalPayload: Boolean(commitment.internal_payload_bytes),
      };
    }

    return result;
  }

  /**
   * Dedicated public evidence lookup for Member 4's consumer.
   * Strictly allowlists public fields. Zero internal factory details or private nonces leak.
   */
  public async getPublicJourneyEvidence(
    publicPayloadIdOrPublicId: string,
  ): Promise<PublicCustomerEvidenceDto> {
    // 1. First attempt direct find by public_payload_id in ledger_commitments
    let commitment = await this.db.ledger_commitments.findFirst({
      where: {
        public_payload_id: publicPayloadIdOrPublicId,
      },
      include: {
        ledger_outbox: true,
        ledger_transactions: { orderBy: { submitted_at: "desc" } },
        ledger_deployments: true,
      },
    });

    // 2. If not found by UUID, try resolving via public_payload_versions / garments
    if (!commitment) {
      const version = await this.db.public_payload_versions.findFirst({
        where: {
          OR: [
            { id: publicPayloadIdOrPublicId },
            { garment_id: publicPayloadIdOrPublicId },
          ],
        },
        orderBy: { version: "desc" },
      });

      if (version) {
        commitment = await this.db.ledger_commitments.findFirst({
          where: {
            public_payload_id: version.id,
          },
          include: {
            ledger_outbox: true,
            ledger_transactions: { orderBy: { submitted_at: "desc" } },
            ledger_deployments: true,
          },
        });
      }
    }

    if (!commitment) {
      throw ApiError.notFound(
        `Public commitment evidence not found for '${publicPayloadIdOrPublicId}'.`,
        { publicPayloadId: publicPayloadIdOrPublicId },
        "WT_ERR_PUBLIC_EVIDENCE_NOT_FOUND",
      );
    }

    const confirmedTx = commitment.ledger_transactions.find(
      (tx) => tx.status === "confirmed" && tx.block_number !== null,
    );

    const onChainCommitmentId =
      "0x" + Buffer.from(commitment.commitment_id).toString("hex");
    const payloadSha256 =
      "0x" + Buffer.from(commitment.payload_sha256).toString("hex");
    const contractAddress =
      "0x" + Buffer.from(commitment.ledger_deployments.contract_address).toString("hex");

    return {
      publicPayloadId: commitment.public_payload_id!,
      onChainCommitmentId,
      payloadSha256,
      ledgerStatus: (commitment.ledger_outbox?.status as any) ?? "pending",
      contractAddress,
      chainId: Number(commitment.ledger_deployments.chain_id),
      txHash: confirmedTx
        ? "0x" + Buffer.from(confirmedTx.tx_hash).toString("hex")
        : null,
      blockNumber: confirmedTx?.block_number ? Number(confirmedTx.block_number) : null,
      blockTimestamp: confirmedTx?.block_timestamp
        ? confirmedTx.block_timestamp.toISOString()
        : null,
      blockHash: confirmedTx?.block_hash
        ? "0x" + Buffer.from(confirmedTx.block_hash).toString("hex")
        : null,
    };
  }

  /**
   * Diagnostic statistics for dashboard and monitoring probes.
   */
  public async getLedgerDiagnostics(): Promise<LedgerDiagnosticsDto> {
    const now = new Date();

    const [pending, submitted, confirmed, failed, activeLeases, deployment, errorRows] =
      await Promise.all([
        this.db.ledger_outbox.count({ where: { status: "pending" } }),
        this.db.ledger_outbox.count({ where: { status: "submitted" } }),
        this.db.ledger_outbox.count({ where: { status: "confirmed" } }),
        this.db.ledger_outbox.count({ where: { status: "failed" } }),
        this.db.ledger_outbox.count({
          where: { lease_expires_at: { gt: now } },
        }),
        getActiveLedgerDeployment(this.db).catch(() => null),
        this.db.ledger_outbox.findMany({
          where: { last_error_code: { not: null } },
          orderBy: { updated_at: "desc" },
          take: 5,
        }),
      ]);

    return {
      summary: {
        pending,
        submitted,
        confirmed,
        failed,
        activeLeases,
      },
      activeDeployment: deployment
        ? {
            id: deployment.id,
            code: deployment.code,
            chainId: Number(deployment.chain_id),
            contractAddress:
              "0x" + Buffer.from(deployment.contract_address).toString("hex"),
            networkName: deployment.network_name,
            protocolVersion: deployment.protocol_version,
          }
        : null,
      recentErrors: errorRows.map((e) => ({
        commitmentId: e.commitment_id,
        errorCode: e.last_error_code,
        summary: e.last_error_summary,
        updatedAt: e.updated_at.toISOString(),
      })),
    };
  }
}

/**
 * Singleton instance of LedgerEvidenceService.
 */
export const ledgerEvidenceService = new LedgerEvidenceService();
