/**
 * ActorContext and Authoritative Role/Department Access Contract.
 * Owned by Member 4 (Staff access, shared UI and public journey).
 *
 * This contract establishes the unified identity shape used across backend Express
 * middleware, database transactions, and frontend capability checks.
 */
import type { Department, Role, StaffStatus, StaffUser } from "./types";

/**
 * Fine-grained operational capability grants.
 * Administrators and managers cannot perform shop-floor factory mutations
 * unless an explicit operational grant is present.
 */
export type StaffCapabilityGrant =
  | "materials:receive_lot"
  | "materials:assign_bundle_card"
  | "raw_store:issue_fabric"
  | "orders:plan"
  | "orders:approve"
  | "cutting:confirm_source"
  | "cutting:bind_garment_tag"
  | "production:routine_scan"
  | "quality:inspect_incoming"
  | "quality:inspect_final"
  | "quality:reinspect"
  | "quality:release_hold"
  | "rework:assign"
  | "rework:perform_repair"
  | "fulfilment:pack_garment"
  | "fulfilment:warehouse_bin"
  | "fulfilment:dispatch_shipment"
  | "admin:manage_users"
  | "admin:edit_device_settings"
  | "admin:edit_business_settings"
  | "audit:view"
  | "reports:view";

/**
 * Authoritative security principal context attached to verified server sessions
 * and evaluated across all domain mutations.
 */
export interface ActorContext {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: Role;
  readonly department: Department;
  readonly status: StaffStatus;
  readonly scope: string;
  readonly sessionId: string;
  readonly grants: readonly StaffCapabilityGrant[];
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/**
 * Derives allowable operational grants based on assigned role and departmental scope.
 */
export function deriveStaffGrants(role: Role, department: Department): StaffCapabilityGrant[] {
  const grants = new Set<StaffCapabilityGrant>();

  // Administrative grants
  if (role === "A") {
    grants.add("admin:manage_users");
    grants.add("admin:edit_device_settings");
    grants.add("audit:view");
    grants.add("reports:view");
  }

  // Management grants (Planning & high-level oversight)
  if (role === "M") {
    grants.add("orders:plan");
    grants.add("orders:approve");
    grants.add("rework:assign");
    grants.add("admin:edit_business_settings");
    grants.add("audit:view");
    grants.add("reports:view");
  }

  // Department-specific operational grants
  switch (department) {
    case "receiving":
      if (role === "O") {
        grants.add("materials:receive_lot");
        grants.add("materials:assign_bundle_card");
      }
      break;

    case "raw-store":
      if (role === "O") {
        grants.add("raw_store:issue_fabric");
      }
      break;

    case "cutting":
      if (role === "P") {
        grants.add("cutting:confirm_source");
        grants.add("cutting:bind_garment_tag");
      }
      break;

    case "stitching":
    case "finishing":
      if (role === "P") {
        grants.add("production:routine_scan");
        grants.add("rework:perform_repair");
      }
      break;

    case "quality":
      if (role === "Q") {
        grants.add("quality:inspect_incoming");
        grants.add("quality:inspect_final");
        grants.add("quality:reinspect");
        grants.add("quality:release_hold");
        grants.add("audit:view");
        grants.add("reports:view");
      }
      break;

    case "packing":
      if (role === "L") {
        grants.add("fulfilment:pack_garment");
      }
      break;

    case "warehouse":
      if (role === "L") {
        grants.add("fulfilment:warehouse_bin");
      }
      break;

    case "dispatch":
      if (role === "L") {
        grants.add("fulfilment:dispatch_shipment");
      }
      break;

    default:
      break;
  }

  return Array.from(grants);
}

/**
 * Creates an authoritative ActorContext from a StaffUser and active session.
 */
export function createActorContext(
  user: StaffUser,
  sessionId = "sess-mock-001",
  ttlMs = 8 * 60 * 60 * 1000,
): ActorContext {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    department: user.department,
    status: user.status,
    scope: user.scope,
    sessionId,
    grants: deriveStaffGrants(user.role, user.department),
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

/**
 * Pure authorization check for role membership.
 */
export function hasRole(actor: ActorContext | StaffUser, role: Role | readonly Role[]): boolean {
  if (actor.status !== "active") return false;
  return Array.isArray(role) ? role.includes(actor.role) : actor.role === role;
}

/**
 * Pure authorization check for department membership.
 */
export function hasDepartment(
  actor: ActorContext | StaffUser,
  dept: Department | readonly Department[],
): boolean {
  if (actor.status !== "active") return false;
  return Array.isArray(dept) ? dept.includes(actor.department) : actor.department === dept;
}

/**
 * Pure authorization check for fine-grained capability grant.
 */
export function hasGrant(actor: ActorContext, grant: StaffCapabilityGrant): boolean {
  if (actor.status !== "active") return false;
  return actor.grants.includes(grant);
}

/**
 * Enforces that a condition is met; otherwise throws an authorization error.
 */
export function assertAuthorized(
  condition: boolean,
  code: string,
  message: string,
): asserts condition {
  if (!condition) {
    const err = new Error(message) as Error & { code: string; status: number };
    err.code = code;
    err.status = 403;
    throw err;
  }
}

/**
 * Essential business rule: A repair performer cannot approve their own repair.
 * Independent reinspection must be performed by a different quality inspector.
 */
export function assertIndependentRepairReinspection(
  reinspectorUserId: string,
  repairPerformerUserId: string | null | undefined,
): void {
  if (repairPerformerUserId && reinspectorUserId === repairPerformerUserId) {
    assertAuthorized(
      false,
      "WT_ERR_INDEPENDENT_QC",
      "Independent inspection violation: The operator who performed the repair cannot approve their own repair.",
    );
  }
}
