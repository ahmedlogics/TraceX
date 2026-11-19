/**
 * Staff Operations & Analytics Domain Service.
 * Owned by Member 4 (Staff access, shared UI, audit, reports & dashboard).
 *
 * Implements real database queries against Prisma with strict role-based scoping:
 *   - Dashboard: role-aware metrics, assigned work queue, and operational exceptions
 *   - Audit: immutable activity trail with role/department category filtering
 *   - Reports: aggregated throughput, quality disposition, and commitment breakdown
 *   - Staff Management: user directory, invitations, scope updates, and suspensions
 */
import type { PrismaClient } from "@prisma/client";
import type {
  AuditEvent,
  AuditCategory,
  Department,
  Role,
  StaffUser,
  Task,
  TaskKind,
  TaskStatus,
} from "@/domain/types";
import type { DashboardData, ReportsData } from "@/lib/data/client";
import type { StaffRole } from "../contracts/actor";
import {
  mapPrismaDepartmentToDomain,
  toStaffUserDto,
} from "../auth/auth-service";
import { ApiError } from "../middleware/responses";
import { generateSessionToken, hashSessionToken } from "../auth/crypto";

/**
 * Maps a work_tasks record to the domain Task DTO.
 */
function toDomainTask(raw: {
  id: string;
  action_code: string;
  department_code: string;
  checkpoint_code: string | null;
  status: string;
  created_at: Date;
  assignee_id: string | null;
  garment_id: string | null;
  material_lot_id: string | null;
  production_order_id: string | null;
  shipment_id: string | null;
}): Task {
  let subjectType: Task["subjectType"] = "garment";
  let subjectId = raw.id;

  if (raw.garment_id) {
    subjectType = "garment";
    subjectId = raw.garment_id;
  } else if (raw.material_lot_id) {
    subjectType = "lot";
    subjectId = raw.material_lot_id;
  } else if (raw.production_order_id) {
    subjectType = "order";
    subjectId = raw.production_order_id;
  } else if (raw.shipment_id) {
    subjectType = "shipment";
    subjectId = raw.shipment_id;
  }

  let status: TaskStatus = "open";
  if (raw.status === "completed") {
    status = "done";
  } else if (raw.status === "claimed" || raw.status === "in_progress") {
    status = "claimed";
  }

  return {
    id: raw.id,
    kind: raw.action_code as TaskKind,
    title: raw.action_code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    department: mapPrismaDepartmentToDomain(raw.department_code),
    subjectType,
    subjectId,
    status,
    assigneeId: raw.assignee_id ?? undefined,
    createdAt: raw.created_at.toISOString(),
  };
}

/**
 * Derives an AuditCategory from raw database audit/trace fields.
 */
function inferAuditCategory(
  actionCode: string,
  departmentCode?: string | null,
  targetType?: string | null,
): AuditCategory {
  const code = (actionCode || "").toLowerCase();
  const target = (targetType || "").toLowerCase();
  const dept = (departmentCode || "").toLowerCase();

  if (
    code.includes("auth") ||
    code.includes("login") ||
    code.includes("session") ||
    code.includes("logout") ||
    code.includes("password")
  ) {
    return "auth";
  }
  if (
    code.includes("admin") ||
    code.includes("user") ||
    code.includes("invite") ||
    code.includes("suspend") ||
    target.includes("staff")
  ) {
    return "admin";
  }
  if (
    code.includes("qc") ||
    code.includes("inspect") ||
    code.includes("hold") ||
    target.includes("inspection")
  ) {
    return "quality";
  }
  if (code.includes("rework") || code.includes("repair")) {
    return "rework";
  }
  if (
    code.includes("material") ||
    code.includes("lot") ||
    dept.includes("materials") ||
    dept.includes("receiving") ||
    dept.includes("raw-store")
  ) {
    return "materials";
  }
  if (
    code.includes("cut") ||
    code.includes("stitch") ||
    code.includes("order") ||
    dept.includes("production") ||
    dept.includes("cutting") ||
    dept.includes("stitching")
  ) {
    return "production";
  }
  if (
    code.includes("ship") ||
    code.includes("pack") ||
    code.includes("dispatch") ||
    dept.includes("logistics") ||
    dept.includes("warehouse") ||
    dept.includes("dispatch")
  ) {
    return "logistics";
  }
  if (code.includes("rfid") || code.includes("tag") || code.includes("scan")) {
    return "rfid";
  }
  if (code.includes("station") || code.includes("workstation")) {
    return "workstation";
  }
  if (code.includes("ledger") || code.includes("commitment") || code.includes("blockchain")) {
    return "ledger";
  }
  if (code.includes("setting") || code.includes("checkpoint") || code.includes("device")) {
    return "settings";
  }
  return "admin";
}

/**
 * Permitted audit categories per staff role.
 */
const allowedCategoriesByRole: Partial<Record<Role, AuditCategory[]>> = {
  A: ["auth", "admin", "ledger", "settings", "workstation", "rfid"],
  Q: ["quality", "rework", "materials"],
  O: ["materials"],
  P: ["production", "rework"],
  L: ["logistics"],
};

// -----------------------------------------------------------------------------
// 1. Dashboard Service
// -----------------------------------------------------------------------------

export async function getStaffDashboard(
  prisma: PrismaClient,
  user: StaffUser,
): Promise<DashboardData> {
  // Query open tasks
  const openTasks = await prisma.work_tasks.findMany({
    where: {
      status: { notIn: ["completed", "cancelled"] },
    },
    orderBy: { created_at: "desc" },
  });

  const domainTasks = openTasks.map(toDomainTask);

  // Filter tasks scoped to user
  const scopedOpenTasks = domainTasks.filter((t) => {
    if (user.role === "M") return true;
    if (t.assigneeId === user.id) return true;
    return t.department === user.department;
  });

  // Query active garment holds
  const activeHolds = await prisma.garment_holds.findMany({
    where: { released_at: null },
    include: {
      garments: {
        select: { id: true, code: true, public_id: true, stage: true },
      },
    },
  });

  // Query open inspections
  const openInspectionsCount = await prisma.inspections.count({
    where: { submitted_at: null },
  });

  // Query active lots awaiting incoming inspection
  const awaitingLots = await prisma.material_lots.findMany({
    where: {
      inspections: {
        none: { outcome: "pass" },
      },
    },
    select: { id: true, code: true },
  });

  // Query active shipments (not yet dispatched or cancelled)
  const activeShipments = await prisma.shipments.findMany({
    where: {
      status: { notIn: ["dispatched", "delivered", "cancelled"] },
    },
    include: {
      shipment_packages: {
        include: {
          packages: {
            include: {
              package_items: {
                include: {
                  garments: {
                    include: {
                      garment_holds: {
                        where: { released_at: null },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Compute metrics by role
  let metrics: DashboardData["metrics"] = [];

  switch (user.role) {
    case "A": {
      const activeStaff = await prisma.staff_users.count({
        where: { suspended_at: null },
      });
      const failedCommitments = await prisma.ledger_outbox.count({
        where: { status: "failed" },
      });
      const pendingCommitments = await prisma.ledger_outbox.count({
        where: { status: { in: ["pending", "submitted"] } },
      });
      const rfidStationsCount = await prisma.rfid_stations.count();

      metrics = [
        { label: "Active staff", value: activeStaff },
        { label: "Failed commitments", value: failedCommitments },
        { label: "Pending commitments", value: pendingCommitments },
        { label: "RFID stations enabled", value: rfidStationsCount },
      ];
      break;
    }

    case "M": {
      metrics = [
        { label: "Open tasks", value: scopedOpenTasks.length },
        { label: "Garments on hold", value: activeHolds.length },
        { label: "Open inspections", value: openInspectionsCount },
        { label: "Shipments in progress", value: activeShipments.length },
      ];
      break;
    }

    case "O": {
      const acceptedLots = await prisma.material_lots.findMany({
        where: {
          available_accepted_quantity: { gt: 0 },
        },
        select: { available_accepted_quantity: true, unit: true },
      });
      const availableStockM = acceptedLots
        .filter((l) => l.unit === "m")
        .reduce((sum, l) => sum + Number(l.available_accepted_quantity), 0);

      metrics = [
        { label: "My open tasks", value: scopedOpenTasks.length },
        { label: "Lots awaiting inspection", value: awaitingLots.length },
        { label: "Accepted lots", value: acceptedLots.length },
        { label: "Available stock (m)", value: Math.round(availableStockM) },
      ];
      break;
    }

    case "P": {
      const garmentsInProduction = await prisma.garments.count({
        where: {
          stage: { in: ["cut", "stitched", "finished"] },
        },
      });
      const ordersInProgress = await prisma.production_orders.count({
        where: { status: "in_progress" },
      });
      const reworkAssigned = await prisma.rework_cases.count({
        where: {
          assigned_department_code: user.department,
          status: { in: ["open", "assigned"] },
        },
      });

      metrics = [
        { label: "My open tasks", value: scopedOpenTasks.length },
        { label: "Rework assigned to us", value: reworkAssigned },
        { label: "Garments in production", value: garmentsInProduction },
        { label: "Orders in progress", value: ordersInProgress },
      ];
      break;
    }

    case "Q": {
      const reinspectionsCount = await prisma.inspections.count({
        where: {
          submitted_at: null,
          scope: "reinspection",
        },
      });

      metrics = [
        { label: "Open inspections", value: openInspectionsCount },
        { label: "Garments on hold", value: activeHolds.length },
        { label: "Reinspections", value: reinspectionsCount },
        { label: "Lots awaiting inspection", value: awaitingLots.length },
      ];
      break;
    }

    case "L": {
      const awaitingPacking = await prisma.garments.count({
        where: {
          stage: "packed",
          package_items: null,
          garment_holds: { none: { released_at: null } },
        },
      });
      const finishedStock = await prisma.garments.count({
        where: {
          stage: "warehoused",
        },
      });

      metrics = [
        { label: "My open tasks", value: scopedOpenTasks.length },
        { label: "Awaiting packing", value: awaitingPacking },
        { label: "In finished stock", value: finishedStock },
        { label: "Shipments in progress", value: activeShipments.length },
      ];
      break;
    }
  }

  // Derive Alerts
  const alerts: DashboardData["alerts"] = [];

  // Danger: Quality Holds
  if (["M", "Q", "P", "L"].includes(user.role)) {
    activeHolds.forEach((h) => {
      alerts.push({
        tone: "danger",
        message: `${h.garments.code} is on quality hold: ${h.reason}`,
        href: `/staff/garments/${h.garments.id}`,
      });
    });
  }

  // Warning: Blocked Shipments with Held Garments
  if (["M", "L"].includes(user.role)) {
    activeShipments.forEach((sh) => {
      const heldCodes: string[] = [];
      sh.shipment_packages.forEach((sp) => {
        sp.packages.package_items.forEach((pi) => {
          if (pi.garments.garment_holds.length > 0) {
            heldCodes.push(pi.garments.code);
          }
        });
      });

      if (heldCodes.length > 0) {
        alerts.push({
          tone: "warning",
          message: `${sh.code} includes held garments (${heldCodes.join(", ")}) — departure is blocked.`,
          href: `/staff/shipments/${sh.id}`,
        });
      }
    });
  }

  // Warning: Failed Outbox Commitments
  if (["A", "M"].includes(user.role)) {
    const failedOutbox = await prisma.ledger_outbox.findMany({
      where: { status: "failed" },
      take: 5,
    });
    failedOutbox.forEach((f) => {
      alerts.push({
        tone: "warning",
        message: `Ledger commitment ${f.commitment_id.slice(0, 8)}… failed: ${f.last_error_summary ?? "Unknown error"}.`,
        href: "/staff/ledger",
      });
    });
  }

  // Info: Material Lots Awaiting Inspection
  if (["M", "O", "Q"].includes(user.role)) {
    awaitingLots.forEach((l) => {
      alerts.push({
        tone: "info",
        message: `Material Lot ${l.code} is awaiting incoming QC inspection.`,
        href: `/staff/material-lots/${l.id}`,
      });
    });
  }

  // Slice assigned tasks to max 6
  const assigned = scopedOpenTasks.slice(0, 6);

  return {
    metrics,
    assigned,
    alerts,
  };
}

// -----------------------------------------------------------------------------
// 2. Audit Trail Service
// -----------------------------------------------------------------------------

export async function getStaffAuditTrail(
  prisma: PrismaClient,
  user: StaffUser,
): Promise<AuditEvent[]> {
  const allowedCategories = allowedCategoriesByRole[user.role];

  // Fetch immutable records from audit_events
  const rawAudit = await prisma.audit_events.findMany({
    orderBy: { recorded_at: "desc" },
    take: 250,
  });

  const events: AuditEvent[] = [];

  for (const row of rawAudit) {
    const category = inferAuditCategory(row.action_code, row.department_code, row.target_type);

    // Apply strict server-side role scope denial
    if (allowedCategories && !allowedCategories.includes(category)) {
      continue;
    }

    let detailStr: string | undefined;
    if (row.details && typeof row.details === "object") {
      detailStr =
        "message" in row.details
          ? String((row.details as Record<string, unknown>)["message"])
          : JSON.stringify(row.details);
    }

    events.push({
      id: row.id,
      at: row.recorded_at.toISOString(),
      actorId: row.actor_staff_id ?? row.actor_device_id ?? "system",
      category,
      event: row.action_code,
      subjectType: row.target_type,
      subjectId: row.target_reference,
      detail: detailStr,
    });
  }

  // If audit_events has fewer records, also complement with trace_events for full factory history
  if (events.length < 5) {
    const rawTrace = await prisma.trace_events.findMany({
      orderBy: { occurred_at: "desc" },
      take: 100,
    });

    for (const t of rawTrace) {
      const category = inferAuditCategory(t.event_type, null, t.garment_id ? "garment" : "lot");
      if (allowedCategories && !allowedCategories.includes(category)) {
        continue;
      }

      let detailStr: string | undefined;
      if (t.details && typeof t.details === "object") {
        detailStr =
          "message" in t.details
            ? String((t.details as Record<string, unknown>)["message"])
            : JSON.stringify(t.details);
      }

      events.push({
        id: t.id,
        at: t.occurred_at.toISOString(),
        actorId: t.actor_id,
        category,
        event: t.event_type,
        subjectType: t.subject_type ?? (t.garment_id ? "garment" : t.material_lot_id ? "lot" : "order"),
        subjectId: t.subject_id ?? (t.garment_id ?? t.material_lot_id ?? t.production_order_id ?? t.id),
        detail: detailStr,
      });
    }
  }

  return events;
}

// -----------------------------------------------------------------------------
// 3. Operational Reports Service
// -----------------------------------------------------------------------------

export async function getStaffOperationalReports(
  prisma: PrismaClient,
  user: StaffUser,
): Promise<ReportsData> {
  // 1. Quality Role: Inspection outcomes and breakdown
  if (user.role === "Q") {
    const allInspections = await prisma.inspections.findMany({
      select: {
        scope: true,
        outcome: true,
        submitted_at: true,
      },
    });

    const passedCount = allInspections.filter((i) => i.outcome === "pass").length;
    const failedCount = allInspections.filter((i) => i.outcome === "fail").length;
    const openCount = allInspections.filter((i) => i.submitted_at === null).length;

    const kinds = [
      { key: "incoming", label: "Incoming inspections", scope: "incoming" as const },
      { key: "final", label: "Final inspections", scope: "final" as const },
      { key: "reinspection", label: "Reinspections", scope: "reinspection" as const },
    ];

    const rows = kinds.map((k) => {
      const subset = allInspections.filter((i) => i.scope === k.scope);

      return {
        label: k.label,
        columns: {
          Open: subset.filter((i) => i.submitted_at === null).length,
          Passed: subset.filter((i) => i.outcome === "pass").length,
          Failed: subset.filter((i) => i.outcome === "fail").length,
        },
      };
    });

    return {
      counts: [
        { label: "Inspections", value: allInspections.length },
        { label: "Passed", value: passedCount },
        { label: "Failed", value: failedCount },
        { label: "Open", value: openCount },
      ],
      columns: ["Open", "Passed", "Failed"],
      rows,
    };
  }

  // 2. Admin Role: Personnel, security, commitments, and audit
  if (user.role === "A") {
    const totalUsers = await prisma.staff_users.count();
    const suspendedUsers = await prisma.staff_users.count({
      where: { suspended_at: { not: null } },
    });
    const totalCommitments = await prisma.ledger_commitments.count();
    const totalAuditEvents = await prisma.audit_events.count();

    const statuses = ["pending", "submitted", "failed", "confirmed"] as const;
    const outboxJobs = await prisma.ledger_outbox.findMany({
      select: { status: true },
    });

    const rows = statuses.map((st) => ({
      label: `Commitments ${st}`,
      columns: {
        Count: outboxJobs.filter((j) => j.status === st).length,
      },
    }));

    return {
      counts: [
        { label: "Staff accounts", value: totalUsers },
        { label: "Suspended", value: suspendedUsers },
        { label: "Commitments", value: totalCommitments },
        { label: "Audit events", value: totalAuditEvents },
      ],
      columns: ["Count"],
      rows,
    };
  }

  // 3. Operations / Production / Logistics / Management
  const totalLots = await prisma.material_lots.count();
  const totalOrders = await prisma.production_orders.count();
  const totalGarments = await prisma.garments.count();
  const departedShipments = await prisma.shipments.count({
    where: { status: "dispatched" },
  });

  const stages = [
    "cut",
    "stitched",
    "finished",
    "packed",
    "warehoused",
    "dispatched",
  ] as const;

  const garments = await prisma.garments.findMany({
    select: {
      stage: true,
      garment_holds: {
        where: { released_at: null },
        select: { id: true },
      },
    },
  });

  const rows = stages.map((st) => {
    const stageGarments = garments.filter((g) => g.stage === st);
    const heldGarments = stageGarments.filter((g) => g.garment_holds.length > 0);

    return {
      label: `Stage: ${st}`,
      columns: {
        Garments: stageGarments.length,
        "On hold": heldGarments.length,
      },
    };
  });

  return {
    counts: [
      { label: "Lots", value: totalLots },
      { label: "Orders", value: totalOrders },
      { label: "Garments", value: totalGarments },
      { label: "Shipments departed", value: departedShipments },
    ],
    columns: ["Garments", "On hold"],
    rows,
  };
}

// -----------------------------------------------------------------------------
// 4. Staff Administration Service (Admin Scoped)
// -----------------------------------------------------------------------------

export async function listStaffUsers(
  prisma: PrismaClient,
  _actor: StaffUser,
): Promise<StaffUser[]> {
  const users = await prisma.staff_users.findMany({
    include: {
      staff_role_grants_staff_role_grants_staff_user_idTostaff_users: {
        where: { revoked_at: null },
      },
    },
    orderBy: { created_at: "asc" },
  });

  return users.map((u) =>
    toStaffUserDto(
      u,
      u.staff_role_grants_staff_role_grants_staff_user_idTostaff_users.map((g) => ({
        role: g.role,
        department_code: g.department_code,
      })),
    ),
  );
}

export async function inviteStaffUser(
  prisma: PrismaClient,
  actor: StaffUser,
  input: {
    username: string;
    displayName: string;
    role: Role;
    department: Department;
  },
): Promise<string> {
  if (actor.role !== "A") {
    throw ApiError.forbidden("Administrator privilege required to invite staff.");
  }

  const existing = await prisma.staff_users.findUnique({
    where: { username: input.username.trim().toLowerCase() },
  });
  if (existing) {
    throw ApiError.conflict(
      `Username '${input.username}' already exists.`,
      undefined,
      "WT_ERR_USER_EXISTS",
    );
  }

  const roleMap: Record<Role, StaffRole> = {
    A: "admin",
    M: "manager",
    O: "materials",
    P: "production",
    Q: "quality",
    L: "logistics",
  };

  const inviteToken = generateSessionToken();
  const tokenDigest = hashSessionToken(inviteToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

  await prisma.$transaction(async (tx) => {
    const newUser = await tx.staff_users.create({
      data: {
        username: input.username.trim().toLowerCase(),
        display_name: input.displayName.trim(),
      },
    });

    const grantRole = roleMap[input.role] ?? "production";
    const grantDept =
      grantRole === "admin" || grantRole === "manager" ? null : (input.department ?? "receiving");

    await tx.staff_role_grants.create({
      data: {
        staff_user_id: newUser.id,
        role: grantRole,
        department_code: grantDept,
        granted_by: actor.id,
      },
    });

    await tx.staff_credential_tokens.create({
      data: {
        staff_user_id: newUser.id,
        purpose: "activate",
        token_digest: new Uint8Array(tokenDigest),
        expires_at: expiresAt,
        issued_by: actor.id,
      },
    });

    // Record audit event
    await tx.audit_events.create({
      data: {
        actor_staff_id: actor.id,
        action_code: "admin:invite_user",
        target_type: "staff_user",
        target_reference: newUser.id,
        details: {
          username: input.username,
          role: input.role,
          department: input.department,
        },
      },
    });
  });

  return inviteToken;
}

export async function updateStaffUserScope(
  prisma: PrismaClient,
  actor: StaffUser,
  input: {
    userId: string;
    role: Role;
    department: Department;
  },
): Promise<void> {
  if (actor.role !== "A") {
    throw ApiError.forbidden("Administrator privilege required to modify staff scope.");
  }

  const roleMap: Record<Role, StaffRole> = {
    A: "admin",
    M: "manager",
    O: "materials",
    P: "production",
    Q: "quality",
    L: "logistics",
  };

  await prisma.$transaction(async (tx) => {
    // Revoke previous active grants
    await tx.staff_role_grants.updateMany({
      where: {
        staff_user_id: input.userId,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
        revoked_by: actor.id,
      },
    });

    // Create new grant
    const grantRole = roleMap[input.role] ?? "production";
    const grantDept =
      grantRole === "admin" || grantRole === "manager" ? null : (input.department ?? "receiving");

    await tx.staff_role_grants.create({
      data: {
        staff_user_id: input.userId,
        role: grantRole,
        department_code: grantDept,
        granted_by: actor.id,
      },
    });

    // Record audit event
    await tx.audit_events.create({
      data: {
        actor_staff_id: actor.id,
        action_code: "admin:update_scope",
        target_type: "staff_user",
        target_reference: input.userId,
        details: {
          role: input.role,
          department: input.department,
        },
      },
    });
  });
}

export async function setStaffUserSuspended(
  prisma: PrismaClient,
  actor: StaffUser,
  userId: string,
  suspended: boolean,
): Promise<void> {
  if (actor.role !== "A") {
    throw ApiError.forbidden("Administrator privilege required to suspend accounts.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.staff_users.update({
      where: { id: userId },
      data: {
        suspended_at: suspended ? new Date() : null,
      },
    });

    // If suspended, revoke all active sessions immediately
    if (suspended) {
      await tx.staff_sessions.deleteMany({
        where: { staff_user_id: userId },
      });
    }

    // Record audit event
    await tx.audit_events.create({
      data: {
        actor_staff_id: actor.id,
        action_code: suspended ? "admin:suspend_user" : "admin:unsuspend_user",
        target_type: "staff_user",
        target_reference: userId,
        details: { suspended },
      },
    });
  });
}

export async function issueStaffResetToken(
  prisma: PrismaClient,
  actor: StaffUser,
  userId: string,
): Promise<string> {
  if (actor.role !== "A") {
    throw ApiError.forbidden("Administrator privilege required to issue reset tokens.");
  }

  const target = await prisma.staff_users.findUnique({
    where: { id: userId },
  });
  if (!target) {
    throw ApiError.notFound(`Staff user '${userId}' was not found.`);
  }

  const resetToken = generateSessionToken();
  const tokenDigest = hashSessionToken(resetToken);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours

  await prisma.$transaction(async (tx) => {
    // Revoke previous open reset tokens
    await tx.staff_credential_tokens.updateMany({
      where: {
        staff_user_id: userId,
        purpose: "reset",
        consumed_at: null,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    });

    await tx.staff_credential_tokens.create({
      data: {
        staff_user_id: userId,
        purpose: "reset",
        token_digest: new Uint8Array(tokenDigest),
        expires_at: expiresAt,
        issued_by: actor.id,
      },
    });

    await tx.audit_events.create({
      data: {
        actor_staff_id: actor.id,
        action_code: "admin:issue_reset",
        target_type: "staff_user",
        target_reference: userId,
        details: { targetUsername: target.username },
      },
    });
  });

  return resetToken;
}
