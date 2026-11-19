import type { PrismaTransactionClient } from "../db/types";
import type { Department, StaffRole } from "./actor";

// ---------------------------------------------------------------- Trace & Audit Contracts

export interface TraceEventInput {
  eventType: string;
  sourceStation?: string;
  garmentId?: string;
  materialLotId?: string;
  productionOrderId?: string;
  staffUserId?: string;
  deviceId?: string;
  rfidScanId?: string;
  payloadSummary?: string;
  payload?: Record<string, unknown>;
}

export interface AuditEventInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  department?: Department;
  role?: StaffRole;
  details?: Record<string, unknown>;
}

/**
 * Transaction-scoped service interface for recording persistent trace events and audit logs.
 */
export interface ITraceAuditService {
  recordTraceEvent(
    event: TraceEventInput,
    tx: PrismaTransactionClient,
  ): Promise<string>;

  recordAuditEvent(
    event: AuditEventInput,
    tx: PrismaTransactionClient,
  ): Promise<string>;
}

// ---------------------------------------------------------------- Subject Revision Contracts

/**
 * Transaction-scoped service interface for managing optimistic concurrency revisions
 * on garments and production orders.
 */
export interface ISubjectRevisionService {
  /**
   * Increments a garment's revision counter while asserting the expected revision.
   * Throws WT_ERR_CONCURRENCY_CONFLICT if current revision !== expectedRevision.
   */
  incrementGarmentRevision(
    garmentId: string,
    expectedRevision: number,
    tx: PrismaTransactionClient,
  ): Promise<number>;

  /**
   * Increments a production order's revision counter while asserting the expected revision.
   * Throws WT_ERR_CONCURRENCY_CONFLICT if current revision !== expectedRevision.
   */
  incrementOrderRevision(
    orderId: string,
    expectedRevision: number,
    tx: PrismaTransactionClient,
  ): Promise<number>;
}

// ---------------------------------------------------------------- Ledger Outbox Contracts

export type CommitmentScope = "event" | "public_journey";

export interface CreateCommitmentInput {
  scope: CommitmentScope;
  traceEventId?: string;
  publicPayloadId?: string;
  payloadSha256: Buffer;
  internalPayloadBytes?: Buffer;
  hashScheme?: string;
}

/**
 * Transaction-scoped service interface for queueing asynchronous ledger commitments.
 */
export interface ILedgerOutboxService {
  queueCommitment(
    input: CreateCommitmentInput,
    tx: PrismaTransactionClient,
  ): Promise<string>;
}

// ---------------------------------------------------------------- Member 4 Public Publication Hook

export interface PublicStateChangeEvent {
  garmentId: string;
  publicId: string;
  currentStage: string;
  qualityDisposition: string;
  hasActiveHold: boolean;
  timestamp: Date;
}

/**
 * Transaction-scoped hook invoked when a garment transitions state,
 * allowing Member 4's public projection worker to update the public journey hash and snapshot.
 */
export interface IPublicPublicationHook {
  onGarmentStateChanged(
    event: PublicStateChangeEvent,
    tx: PrismaTransactionClient,
  ): Promise<void>;
}
