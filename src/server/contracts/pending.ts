import { ApiError } from "../middleware/responses";
import type {
  ITraceAuditService,
  ISubjectRevisionService,
  ILedgerOutboxService,
  IPublicPublicationHook,
} from "./services";
import type { IScanRoutingService } from "./rfid";

/**
 * Explicit error thrown when an operation is invoked on an interface whose domain implementation
 * is pending assignment to another team member.
 * Prevents silent no-ops or false positives during development.
 */
export class PendingImplementationError extends ApiError {
  constructor(
    public readonly domain: string,
    public readonly assignedOwner: string,
    public readonly milestone: string,
    customMessage?: string,
  ) {
    const message =
      customMessage ||
      `The ${domain} implementation is pending (${assignedOwner}, ${milestone}). No-op bypass is disallowed.`;
    super(501, `WT_ERR_PENDING_${domain.toUpperCase()}`, message, {
      domain,
      assignedOwner,
      milestone,
    });
    this.name = "PendingImplementationError";
  }
}

/**
 * Pending Trace & Audit Service stub (Pending Member 1 / Member 4 integration).
 */
export const pendingTraceAuditService: ITraceAuditService = {
  recordTraceEvent: async () => {
    throw new PendingImplementationError("TraceAudit", "Member 1 & 4", "Milestone 2");
  },
  recordAuditEvent: async () => {
    throw new PendingImplementationError("TraceAudit", "Member 1 & 4", "Milestone 2");
  },
};

/**
 * Pending Subject Revision Service stub (Pending Member 2 & 3 integration).
 */
export const pendingSubjectRevisionService: ISubjectRevisionService = {
  incrementGarmentRevision: async () => {
    throw new PendingImplementationError("SubjectRevision", "Member 2", "Milestone 2");
  },
  incrementOrderRevision: async () => {
    throw new PendingImplementationError("SubjectRevision", "Member 2", "Milestone 2");
  },
};

/**
 * Pending Ledger Outbox Service stub (Pending Member 4 integration).
 */
export const pendingLedgerOutboxService: ILedgerOutboxService = {
  queueCommitment: async () => {
    throw new PendingImplementationError("LedgerOutbox", "Member 4", "Milestone 4");
  },
};

/**
 * Pending Public Publication Hook stub (Pending Member 4 integration).
 */
export const pendingPublicPublicationHook: IPublicPublicationHook = {
  onGarmentStateChanged: async () => {
    throw new PendingImplementationError("PublicPublication", "Member 4", "Milestone 4");
  },
};

/**
 * Pending Scan Routing Service stub (Pending Member 1 & 2 integration).
 */
export const pendingScanRoutingService: IScanRoutingService = {
  registerHandler: () => {
    throw new PendingImplementationError("ScanRouting", "Member 1 & 2", "Milestone 2");
  },
  getHandler: () => {
    throw new PendingImplementationError("ScanRouting", "Member 1 & 2", "Milestone 2");
  },
  routeScan: async () => {
    throw new PendingImplementationError("ScanRouting", "Member 1 & 2", "Milestone 2");
  },
};
