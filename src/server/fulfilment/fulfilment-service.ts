/**
 * WearTrail Backend Fulfilment Service.
 *
 * Implements transaction-scoped business logic for:
 *   - Authoritative fulfilment eligibility checks backed by Supabase PostgreSQL
 *   - Gated package assembly, carton sealing, and garment packing
 *   - Warehouse binning and stock movements
 *   - Shipment allocation, dispatch scan verification, and authoritative departure gate
 */
import crypto from "node:crypto";
import type { PrismaTransactionClient } from "../db/types";
import type { Garment, Inspection, Package, Shipment, StaffUser, ScanOutcome } from "@/domain/types";
import {
  checkFulfilmentEligibility,
  type FulfilmentEligibilityResult,
} from "@/domain/quality-fulfilment-types";
import type {
  CreatePackagePayload,
  PackGarmentPayload,
  PersistedEligibilityCheck,
  PersistedEligibilityResult,
  ShipmentDepartureResult,
  ShipmentGarmentVerifyPayload,
  WarehouseReceivePayload,
} from "../contracts/quality-fulfilment";
import type { ActorContext } from "../contracts/actor";
import { ensureStaffUserRecord } from "../quality/quality-service";
import { publishPublicGarmentPayload } from "../public/public-service";
import { normalizeTagUid } from "../contracts/rfid";
import { createInternalCommitment, getActiveLedgerDeployment } from "../ledger/commitment-service";

function isValidUuid(id?: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function isLogisticsRole(actor: StaffUser | ActorContext): boolean {
  if ("role" in actor) {
    const r = actor.role.toLowerCase();
    if (r === "l" || r === "logistics" || r === "admin" || r === "a" || r === "m" || r === "manager") {
      return true;
    }
  }
  if ("department" in actor && actor.department) {
    const d = actor.department.toLowerCase();
    if (d === "packing" || d === "warehouse" || d === "dispatch" || d === "logistics") {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- In-Memory Validation (Backwards Compatibility)

export function validatePackingOperation(
  actor: StaffUser,
  garment: Garment,
  inspections: Inspection[],
  targetPackage: Package,
): { valid: boolean; error?: string; code?: string } {
  if (actor.role !== "L" || actor.department !== "packing") {
    if (actor.role !== "M") {
      return {
        valid: false,
        error: "Only packing staff can pack garments.",
        code: "WT_ERR_FORBIDDEN",
      };
    }
  }

  if (targetPackage.status !== "open") {
    return {
      valid: false,
      error: `Package ${targetPackage.id} is closed or sealed.`,
      code: "WT_ERR_PACKAGE_CLOSED",
    };
  }

  const eligibility = checkFulfilmentEligibility(garment, inspections, "packing", {
    packageId: targetPackage.id,
  });

  if (!eligibility.eligible) {
    return {
      valid: false,
      error: `Packing blocked: ${eligibility.blockingReasons.join("; ")}`,
      code: "WT_ERR_QUALITY_GATE",
    };
  }

  return { valid: true };
}

export function validateWarehouseReceipt(
  actor: StaffUser,
  garment: Garment,
  inspections: Inspection[],
  binId: string,
): { valid: boolean; error?: string; code?: string } {
  if (actor.role !== "L" || actor.department !== "warehouse") {
    if (actor.role !== "M") {
      return {
        valid: false,
        error: "Only warehouse staff can receive finished stock.",
        code: "WT_ERR_FORBIDDEN",
      };
    }
  }

  if (!binId?.trim()) {
    return {
      valid: false,
      error: "A valid storage bin ID is required.",
      code: "WT_ERR_INVALID_BIN",
    };
  }

  const eligibility = checkFulfilmentEligibility(garment, inspections, "warehouse");
  if (!eligibility.eligible) {
    return {
      valid: false,
      error: `Warehouse receipt blocked: ${eligibility.blockingReasons.join("; ")}`,
      code: "WT_ERR_QUALITY_GATE",
    };
  }

  return { valid: true };
}

export function validateShipmentDeparture(
  actor: StaffUser,
  shipment: Shipment,
  manifestGarments: Garment[],
  allInspections: Inspection[],
): {
  canDepart: boolean;
  failedChecks: { label: string; detail?: string }[];
} {
  const failedChecks: { label: string; detail?: string }[] = [];

  if (actor.role !== "L" || actor.department !== "dispatch") {
    failedChecks.push({
      label: "Authorized dispatch operator",
      detail:
        "Only dispatch staff (Role L, Dispatch dept) can confirm departure. Packing staff cannot dispatch.",
    });
  }

  if (shipment.status === "departed") {
    failedChecks.push({
      label: "Shipment state",
      detail: `Shipment ${shipment.id} has already departed.`,
    });
  }

  if (manifestGarments.length === 0) {
    failedChecks.push({
      label: "Manifest non-empty",
      detail: "Shipment manifest contains no garments.",
    });
  }

  const unallocated = shipment.garmentIds.filter(
    (id) => !shipment.allocatedGarmentIds.includes(id),
  );
  if (unallocated.length > 0) {
    failedChecks.push({
      label: "All garments allocated",
      detail: `Garments not yet allocated: ${unallocated.join(", ")}`,
    });
  }

  const verifiedIds = shipment.verifiedGarmentIds ?? [];
  const unverified = shipment.garmentIds.filter((id) => !verifiedIds.includes(id));
  if (unverified.length > 0) {
    failedChecks.push({
      label: "All manifest garments verified at dispatch antenna (S6)",
      detail: `${unverified.length} garment(s) await dispatch scan verification: ${unverified.join(", ")}`,
    });
  }

  for (const g of manifestGarments) {
    if (g.hold) {
      failedChecks.push({
        label: `Quality hold clear on ${g.id}`,
        detail: `Departure blocked: ${g.id} has an active hold ("${g.hold.reason}"). Holds added even after earlier verification block departure.`,
      });
    }

    if (g.disposition !== "released" && g.disposition !== "passed") {
      failedChecks.push({
        label: `Quality disposition released on ${g.id}`,
        detail: `${g.id} quality status is '${g.disposition}', must be 'released'`,
      });
    }
  }

  return {
    canDepart: failedChecks.length === 0,
    failedChecks,
  };
}

// ---------------------------------------------------------------- Persisted Fulfilment Eligibility

/**
 * Authoritative database-backed eligibility evaluator.
 * Evaluates stage, quality disposition, and active holds directly against PostgreSQL.
 */
export async function getPersistedFulfilmentEligibility(
  tx: PrismaTransactionClient,
  garmentId: string,
  operation: "packing" | "warehouse" | "dispatch",
  options?: { packageId?: string; shipmentId?: string },
): Promise<PersistedEligibilityResult> {
  const garment = await tx.garments.findFirst({
    where: {
      OR: [
        ...(isValidUuid(garmentId) ? [{ id: garmentId }] : []),
        { code: garmentId },
      ],
    },
    include: {
      garment_holds: {
        where: { released_at: null },
      },
      package_items: {
        where: { removed_at: null },
        include: { packages: true },
      },
    },
  });

  if (!garment) {
    throw new Error(`WT_ERR_NOT_FOUND: Garment '${garmentId}' not found.`);
  }

  const checks: PersistedEligibilityCheck[] = [];
  const blockingReasons: string[] = [];

  // 1. Stage Check
  if (operation === "packing") {
    const ok = garment.stage === "finished";
    const detail = ok ? undefined : `Stage is '${garment.stage}', expected 'finished'`;
    checks.push({
      code: "STAGE_FINISHED",
      label: "Garment stage is finished",
      ok,
      ...(detail ? { detail } : {}),
      blocking: true,
    });
    if (!ok) blockingReasons.push(`Garment stage is '${garment.stage}', expected 'finished'`);
  } else if (operation === "warehouse") {
    const ok = garment.stage === "packed" || garment.stage === "warehoused";
    const detail = ok ? undefined : `Stage is '${garment.stage}', expected 'packed'`;
    checks.push({
      code: "STAGE_PACKED",
      label: "Garment is packed in carton",
      ok,
      ...(detail ? { detail } : {}),
      blocking: true,
    });
    if (!ok) blockingReasons.push(`Garment stage is '${garment.stage}', expected 'packed'`);
  } else if (operation === "dispatch") {
    const ok = garment.stage === "warehoused";
    const detail = ok ? undefined : `Stage is '${garment.stage}', expected 'warehoused'`;
    checks.push({
      code: "STAGE_WAREHOUSED",
      label: "Garment is in warehouse stock",
      ok,
      ...(detail ? { detail } : {}),
      blocking: true,
    });
    if (!ok) blockingReasons.push(`Garment stage is '${garment.stage}', expected 'warehoused'`);
  }

  // 2. Quality Disposition Check
  const dispositionOk = garment.quality_disposition === "released";
  const dispDetail = dispositionOk ? undefined : `Disposition is '${garment.quality_disposition}', must be 'released'`;
  checks.push({
    code: "DISPOSITION_RELEASED",
    label: "Quality disposition is released",
    ok: dispositionOk,
    ...(dispDetail ? { detail: dispDetail } : {}),
    blocking: true,
  });
  if (!dispositionOk) {
    blockingReasons.push(`Quality disposition is '${garment.quality_disposition}', must be 'released'`);
  }

  // 3. Active Holds Check
  const activeHolds = garment.garment_holds;
  const holdsClear = activeHolds.length === 0;
  const activeHoldReasons = activeHolds.map((h) => h.reason);
  const holdsDetail = holdsClear ? undefined : `Active holds: ${activeHoldReasons.join("; ")}`;
  checks.push({
    code: "HOLDS_CLEAR",
    label: "Zero active holds",
    ok: holdsClear,
    ...(holdsDetail ? { detail: holdsDetail } : {}),
    blocking: true,
  });
  if (!holdsClear) {
    blockingReasons.push(`Garment has active quality hold(s): ${activeHoldReasons.join("; ")}`);
  }

  // 4. Packaging Check for Packing Operation
  if (operation === "packing") {
    const alreadyPacked = garment.package_items !== null;
    const packagingOk = !alreadyPacked;
    const packDetail = packagingOk ? undefined : `Already packed in package '${garment.package_items?.packages?.code}'`;
    checks.push({
      code: "NOT_ALREADY_PACKED",
      label: "Garment is not already packed",
      ok: packagingOk,
      ...(packDetail ? { detail: packDetail } : {}),
      blocking: true,
    });
    if (!packagingOk) {
      blockingReasons.push(`Garment is already packed in package '${garment.package_items?.packages?.code}'`);
    }
  }

  const eligible = blockingReasons.length === 0;

  return {
    garmentId: garment.id,
    garmentCode: garment.code,
    eligible,
    stage: garment.stage,
    qualityDisposition: garment.quality_disposition,
    hasActiveHold: !holdsClear,
    activeHoldReasons,
    checks,
    blockingReasons,
  };
}

// ---------------------------------------------------------------- Persisted Packaging Operations

/**
 * Creates a new package / carton.
 */
export async function createPackage(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  input?: CreatePackagePayload,
) {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only logistics/packing staff can create packages.");
  }

  const staffUserId = await ensureStaffUserRecord(tx, actor);
  const pkgCode = input?.code || `PKG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  return tx.packages.create({
    data: {
      code: pkgCode,
      status: "open",
      created_by: staffUserId,
    },
  });
}

/**
 * Packs a garment into an open carton.
 * Enforces:
 *   - Package must be 'open'
 *   - Real database-backed quality eligibility gate (stage === 'finished', disposition === 'released', 0 holds)
 *   - Garment stage transitions to 'packed'
 */
export async function packGarment(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  input: PackGarmentPayload,
) {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only logistics/packing staff can pack garments.");
  }

  const staffUserId = await ensureStaffUserRecord(tx, actor);

  // 1. Fetch package
  const pkg = await tx.packages.findFirst({
    where: {
      OR: [
        ...(isValidUuid(input.packageId) ? [{ id: input.packageId }] : []),
        { code: input.packageId },
      ],
    },
  });

  if (!pkg) {
    throw new Error(`WT_ERR_NOT_FOUND: Package '${input.packageId}' not found.`);
  }

  if (pkg.status !== "open") {
    throw new Error(`WT_ERR_PACKAGE_CLOSED: Cannot pack into package with status '${pkg.status}'. Must be 'open'.`);
  }

  // 2. Authoritative Eligibility Evaluation
  const eligibility = await getPersistedFulfilmentEligibility(tx, input.garmentId, "packing", {
    packageId: pkg.id,
  });

  if (!eligibility.eligible) {
    throw new Error(`WT_ERR_QUALITY_GATE: Packing blocked: ${eligibility.blockingReasons.join("; ")}`);
  }

  // 3. Add to package items
  const item = await tx.package_items.create({
    data: {
      package_id: pkg.id,
      garment_id: eligibility.garmentId,
      added_by: staffUserId,
      added_at: new Date(),
    },
  });

  // 4. Update garment stage to 'packed'
  await tx.garments.update({
    where: { id: eligibility.garmentId },
    data: {
      stage: "packed",
      revision: { increment: 1 },
    },
  });

  return {
    packageItemId: item.id,
    packageId: pkg.id,
    garmentId: eligibility.garmentId,
  };
}

/**
 * Seals an open carton.
 * Enforces:
 *   - Package must be open
 *   - Package must contain at least one item
 */
export async function sealPackage(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  packageId: string,
) {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only logistics/packing staff can seal packages.");
  }

  const pkg = await tx.packages.findFirst({
    where: {
      OR: [
        ...(isValidUuid(packageId) ? [{ id: packageId }] : []),
        { code: packageId },
      ],
    },
    include: {
      package_items: { where: { removed_at: null } },
    },
  });

  if (!pkg) {
    throw new Error(`WT_ERR_NOT_FOUND: Package '${packageId}' not found.`);
  }

  if (pkg.status !== "open") {
    throw new Error(`WT_ERR_INVALID_STATUS: Package is '${pkg.status}', expected 'open'.`);
  }

  if (pkg.package_items.length === 0) {
    throw new Error("WT_ERR_EMPTY_PACKAGE: Cannot seal an empty package. Pack at least one garment first.");
  }

  return tx.packages.update({
    where: { id: pkg.id },
    data: {
      status: "sealed",
      revision: { increment: 1 },
    },
  });
}

// ---------------------------------------------------------------- Persisted Warehouse Receipt

export interface WarehouseCartonIntakeInput {
  tagUid: string;
  binId?: string;
  isHardware?: boolean;
}

/**
 * Authoritative Warehouse Carton Intake:
 * 1. Resolves package/carton from Master Box RFID Tag UID
 * 2. Validates carton registration
 * 3. Validates carton is sealed at Packing (status: 'sealed')
 * 4. Validates carton is not empty (contains garments)
 * 5. Validates carton is not already received (duplicate scan check)
 * 6. Validates that NO member garments have active quality holds
 * 7. In one atomic transaction:
 *    - Assigns storage bin
 *    - Updates package status to 'warehoused'
 *    - Upserts warehouse_stock
 *    - Records warehouse_movements
 *    - Updates all member garments to stage 'warehoused'
 *    - Creates trace_events for each garment with monotonically increasing subject_revision
 *    - Creates internal ledger commitments
 *    - Creates audit_events record
 */
export async function executeWarehouseCartonIntake(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  input: WarehouseCartonIntakeInput,
): Promise<ScanOutcome> {
  const rawUid = input.tagUid ? input.tagUid.trim() : "";
  const normalizedUid = rawUid ? normalizeTagUid(rawUid) : "";
  const now = new Date();

  const staffUserId = await ensureStaffUserRecord(tx, actor);

  if (!rawUid) {
    return {
      uid: "",
      resolution: "rejected_unknown_card",
      rejectReason: "Master Box RFID Tag UID is required.",
      at: now.toISOString(),
      isHardware: Boolean(input.isHardware),
    };
  }

  // 1. Resolve Package/Carton from Master Box RFID Tag UID
  // Look up by package code or ID (or if UID bound to a garment inside a carton)
  let pkg = await tx.packages.findFirst({
    where: {
      OR: [
        ...(isValidUuid(rawUid) ? [{ id: rawUid }] : []),
        { code: rawUid },
        { code: normalizedUid },
        { code: { equals: rawUid, mode: "insensitive" } },
      ],
    },
    include: {
      warehouse_stock: {
        include: { warehouse_bins: true },
      },
      package_items: {
        where: { removed_at: null },
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
  });

  // If not found directly, check if a garment card was scanned by mistake
  if (!pkg) {
    const binding = await tx.rfid_tag_bindings.findFirst({
      where: {
        OR: [
          { tag_uid: normalizedUid, unbound_at: null },
          { tag_identifier: rawUid, unbound_at: null },
        ],
      },
      include: {
        garments: {
          include: {
            package_items: {
              where: { removed_at: null },
              include: {
                packages: {
                  include: {
                    warehouse_stock: {
                      include: { warehouse_bins: true },
                    },
                    package_items: {
                      where: { removed_at: null },
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
        },
      },
    });

    if (binding?.garments?.package_items?.packages) {
      pkg = binding.garments.package_items.packages as any;
    }
  }

  if (!pkg) {
    return {
      uid: rawUid,
      resolution: "rejected_unknown_card",
      rejectReason: `Master Box Tag '${rawUid}' is not recognised. No package/carton found.`,
      at: now.toISOString(),
      isHardware: Boolean(input.isHardware),
    };
  }

  // 2. Validate carton status: must be sealed
  if (pkg.status === "open") {
    return {
      uid: rawUid,
      resolution: "rejected_business_rule",
      rejectReason: `Carton '${pkg.code}' is unsealed (status: open). Cartons must be sealed at Packing before warehouse intake.`,
      subjectId: pkg.id,
      garmentCode: pkg.code,
      at: now.toISOString(),
      isHardware: Boolean(input.isHardware),
    };
  }

  // 3. Validate carton is non-empty
  if (!pkg.package_items || pkg.package_items.length === 0) {
    return {
      uid: rawUid,
      resolution: "rejected_business_rule",
      rejectReason: `Carton '${pkg.code}' contains no garments. Empty cartons cannot be received into warehouse stock.`,
      subjectId: pkg.id,
      garmentCode: pkg.code,
      at: now.toISOString(),
      isHardware: Boolean(input.isHardware),
    };
  }

  // 4. Validate not already received (duplicate scan check)
  if (pkg.status === "warehoused" || pkg.warehouse_stock) {
    const currentBin = pkg.warehouse_stock?.warehouse_bins?.code || "warehouse stock";
    return {
      uid: rawUid,
      resolution: "rejected_duplicate",
      rejectReason: `Duplicate intake: Carton '${pkg.code}' has already been received into ${currentBin}.`,
      subjectId: pkg.id,
      garmentCode: pkg.code,
      at: now.toISOString(),
      isHardware: Boolean(input.isHardware),
    };
  }

  // 5. Validate every linked garment has completed required manufacturing stages, passed QC, and has no unresolved quality holds
  for (const item of pkg.package_items) {
    const garment = item.garments;

    // Check unresolved quality holds
    const unresolvedHold = garment.garment_holds?.find((h: any) => !h.released_at);
    if (unresolvedHold || garment.quality_disposition === "held") {
      const holdReason = unresolvedHold?.reason || "Active quality hold in effect";
      const failureReason = `Quality hold: ${holdReason}`;

      // Flag carton in audit trail as On Hold / Warehouse Intake Blocked
      await tx.audit_events.create({
        data: {
          actor_staff_id: staffUserId,
          department_code: "warehouse",
          action_code: "warehouse_intake_blocked",
          target_type: "package",
          target_reference: pkg.code,
          details: {
            packageId: pkg.id,
            packageCode: pkg.code,
            affectedGarmentId: garment.id,
            affectedGarmentCode: garment.code,
            failureReason,
            status: "On Hold / Warehouse Intake Blocked",
            timestamp: now.toISOString(),
          },
          recorded_at: now,
        },
      });

      return {
        uid: rawUid,
        resolution: "rejected_business_rule",
        subjectId: pkg.id,
        garmentCode: pkg.code,
        productName: "On Hold / Warehouse Intake Blocked",
        rejectReason: `Carton ${pkg.code} On Hold / Warehouse Intake Blocked: ${failureReason} (Affected garment: ${garment.code})`,
        at: now.toISOString(),
        isHardware: Boolean(input.isHardware),
        contextId: garment.code,
      };
    }

    // Check QC approval
    if (garment.quality_disposition !== "released") {
      const failureReason = `QC disposition is '${garment.quality_disposition}' (must be released/approved)`;

      // Flag garment/carton through hold workflow
      await tx.garment_holds.create({
        data: {
          garment_id: garment.id,
          kind: "operational",
          reason: `Warehouse Intake Blocked: ${failureReason}`,
          opened_by: staffUserId,
          opened_at: now,
        },
      });
      await tx.garments.update({
        where: { id: garment.id },
        data: { quality_disposition: "held" },
      });

      await tx.audit_events.create({
        data: {
          actor_staff_id: staffUserId,
          department_code: "warehouse",
          action_code: "warehouse_intake_blocked",
          target_type: "package",
          target_reference: pkg.code,
          details: {
            packageId: pkg.id,
            packageCode: pkg.code,
            affectedGarmentId: garment.id,
            affectedGarmentCode: garment.code,
            failureReason,
            status: "On Hold / Warehouse Intake Blocked",
            timestamp: now.toISOString(),
          },
          recorded_at: now,
        },
      });

      return {
        uid: rawUid,
        resolution: "rejected_business_rule",
        subjectId: pkg.id,
        garmentCode: pkg.code,
        productName: "On Hold / Warehouse Intake Blocked",
        rejectReason: `Carton ${pkg.code} On Hold / Warehouse Intake Blocked: ${failureReason} (Affected garment: ${garment.code})`,
        at: now.toISOString(),
        isHardware: Boolean(input.isHardware),
        contextId: garment.code,
      };
    }

    // Check manufacturing stage completion (must have completed cutting, stitching, finishing and packing)
    const validStages = ["finished", "packed", "warehoused"];
    if (!validStages.includes(garment.stage)) {
      const failureReason = `Garment is in stage '${garment.stage}' (must complete cutting, stitching, finishing and packing)`;

      await tx.garment_holds.create({
        data: {
          garment_id: garment.id,
          kind: "operational",
          reason: `Warehouse Intake Blocked: ${failureReason}`,
          opened_by: staffUserId,
          opened_at: now,
        },
      });
      await tx.garments.update({
        where: { id: garment.id },
        data: { quality_disposition: "held" },
      });

      await tx.audit_events.create({
        data: {
          actor_staff_id: staffUserId,
          department_code: "warehouse",
          action_code: "warehouse_intake_blocked",
          target_type: "package",
          target_reference: pkg.code,
          details: {
            packageId: pkg.id,
            packageCode: pkg.code,
            affectedGarmentId: garment.id,
            affectedGarmentCode: garment.code,
            failureReason,
            status: "On Hold / Warehouse Intake Blocked",
            timestamp: now.toISOString(),
          },
          recorded_at: now,
        },
      });

      return {
        uid: rawUid,
        resolution: "rejected_business_rule",
        subjectId: pkg.id,
        garmentCode: pkg.code,
        productName: "On Hold / Warehouse Intake Blocked",
        rejectReason: `Carton ${pkg.code} On Hold / Warehouse Intake Blocked: ${failureReason} (Affected garment: ${garment.code})`,
        at: now.toISOString(),
        isHardware: Boolean(input.isHardware),
        contextId: garment.code,
      };
    }
  }

  // 6. Resolve destination storage bin
  const targetBinCode = (input.binId || "BIN-A1").trim();
  let bin = await tx.warehouse_bins.findFirst({
    where: {
      OR: [
        ...(isValidUuid(targetBinCode) ? [{ id: targetBinCode }] : []),
        { code: targetBinCode },
        { code: { equals: targetBinCode, mode: "insensitive" } },
      ],
    },
  });

  if (!bin) {
    bin = await tx.warehouse_bins.create({
      data: {
        code: targetBinCode,
        label: `Bin ${targetBinCode}`,
        active: true,
      },
    });
  }

  // 7. Update package status to 'warehoused'
  await tx.packages.update({
    where: { id: pkg.id },
    data: {
      status: "warehoused",
      revision: { increment: 1 },
    },
  });

  // 8. Upsert warehouse stock
  await tx.warehouse_stock.upsert({
    where: { package_id: pkg.id },
    create: {
      package_id: pkg.id,
      current_bin_id: bin.id,
      updated_at: now,
    },
    update: {
      current_bin_id: bin.id,
      updated_at: now,
      revision: { increment: 1 },
    },
  });

  // 9. Record warehouse movement
  await tx.warehouse_movements.create({
    data: {
      package_id: pkg.id,
      to_bin_id: bin.id,
      performed_by: staffUserId,
      reason: input.isHardware
        ? "Hardware RFID Master Box Scan (Station 8)"
        : "Workstation Master Box Intake (Station 8)",
    },
  });

  // 10. Update member garments to 'warehoused' and record trace events + ledger commitments
  const deployment = await getActiveLedgerDeployment(tx).catch(() => null);
  const garmentIds = pkg.package_items.map((pi: any) => pi.garments.id);

  // Batch update all member garments in one atomic query
  await tx.garments.updateMany({
    where: { id: { in: garmentIds } },
    data: {
      stage: "warehoused",
    },
  });

  // Query latest trace event revisions in one batch to guarantee uniqueness
  const latestTraces = await tx.trace_events.findMany({
    where: { garment_id: { in: garmentIds } },
    distinct: ["garment_id"],
    orderBy: { subject_revision: "desc" },
    select: { garment_id: true, subject_revision: true },
  });
  const maxRevisionMap = new Map<string, number>();
  for (const t of latestTraces) {
    if (t.garment_id && !maxRevisionMap.has(t.garment_id)) {
      maxRevisionMap.set(t.garment_id, t.subject_revision);
    }
  }

  const updatedGarmentCodes: string[] = [];
  for (const item of pkg.package_items) {
    const garment = item.garments;
    updatedGarmentCodes.push(garment.code);

    const nextRevision = Math.max(garment.revision + 1, (maxRevisionMap.get(garment.id) ?? 0) + 1);

    const traceEvent = await tx.trace_events.create({
      data: {
        event_type: "warehouse_intake",
        subject_revision: nextRevision,
        garment_id: garment.id,
        actor_id: staffUserId,
        details: {
          location: "Finished Goods Warehouse",
          binId: bin.id,
          binCode: bin.code,
          binLabel: bin.label,
          packageId: pkg.id,
          packageCode: pkg.code,
          isHardware: Boolean(input.isHardware),
        },
        occurred_at: now,
        recorded_at: now,
      },
    });

    if (deployment) {
      await createInternalCommitment(
        {
          deploymentId: deployment.id,
          traceEventId: traceEvent.id,
          payload: {
            eventType: "warehouse_intake",
            garmentId: garment.id,
            packageCode: pkg.code,
            binCode: bin.code,
            timestamp: now.toISOString(),
          },
        },
        tx,
      );
    }
  }

  // 11. Create audit event
  await tx.audit_events.create({
    data: {
      actor_staff_id: staffUserId,
      department_code: "warehouse",
      action_code: "warehouse_carton_intake",
      target_type: "package",
      target_reference: pkg.code,
      details: {
        packageId: pkg.id,
        packageCode: pkg.code,
        binId: bin.id,
        binCode: bin.code,
        binLabel: bin.label,
        garmentsReceived: updatedGarmentCodes,
        garmentCount: updatedGarmentCodes.length,
        isHardware: Boolean(input.isHardware),
        timestamp: now.toISOString(),
      },
      recorded_at: now,
    },
  });

  return {
    uid: rawUid,
    resolution: "accepted",
    subjectId: pkg.id,
    garmentCode: pkg.code,
    productName: `Box Received Successfully — ${updatedGarmentCodes.length} Garment${updatedGarmentCodes.length === 1 ? "" : "s"} Moved to Warehouse.`,
    message: `Received into storage bin ${bin.code}: ${updatedGarmentCodes.join(", ")}`,
    at: now.toISOString(),
    isHardware: Boolean(input.isHardware),
  };
}

/**
 * Receives stock into a warehouse storage bin.
 * Backward-compatible wrapper delegating to authoritative executeWarehouseCartonIntake.
 */
export async function receiveWarehouseStock(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  input: WarehouseReceivePayload,
) {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only warehouse/logistics staff can receive stock.");
  }

  const outcome = await executeWarehouseCartonIntake(
    tx,
    actor,
    { tagUid: input.garmentId, binId: input.binId, isHardware: false },
  );

  if (outcome.resolution !== "accepted") {
    throw new Error(outcome.rejectReason || `Warehouse intake rejected: ${outcome.resolution}`);
  }

  return {
    packageId: outcome.subjectId,
    binId: input.binId,
    garmentsUpdated: outcome.garmentCode,
    outcome,
  };
}

// ---------------------------------------------------------------- Persisted Shipment Allocation & Departure Gate

/**
 * Allocates a package to a shipment.
 */
export async function allocatePackageToShipment(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  shipmentId: string,
  packageId: string,
) {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only logistics staff can allocate packages to shipments.");
  }

  const staffUserId = await ensureStaffUserRecord(tx, actor);

  const shipment = await tx.shipments.findFirst({
    where: {
      OR: [
        ...(isValidUuid(shipmentId) ? [{ id: shipmentId }] : []),
        { code: shipmentId },
      ],
    },
  });
  if (!shipment) throw new Error(`WT_ERR_NOT_FOUND: Shipment '${shipmentId}' not found.`);

  const pkg = await tx.packages.findFirst({
    where: {
      OR: [
        ...(isValidUuid(packageId) ? [{ id: packageId }] : []),
        { code: packageId },
      ],
    },
  });
  if (!pkg) throw new Error(`WT_ERR_NOT_FOUND: Package '${packageId}' not found.`);

  return tx.shipment_packages.create({
    data: {
      shipment_id: shipment.id,
      package_id: pkg.id,
      allocated_by: staffUserId,
      allocated_at: new Date(),
    },
  });
}

/**
 * Verifies a garment at the outbound dispatch antenna (S6).
 * Enforces:
 *   - Garment must belong to a package allocated to this shipment
 *   - Garment quality disposition must be 'released'
 *   - Zero active holds
 */
export async function verifyShipmentGarment(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  input: ShipmentGarmentVerifyPayload,
): Promise<{ verified: boolean; shipmentId: string; garmentId: string }> {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only dispatch/logistics staff can verify dispatch scans.");
  }

  const shipment = await tx.shipments.findFirst({
    where: {
      OR: [
        ...(isValidUuid(input.shipmentId) ? [{ id: input.shipmentId }] : []),
        { code: input.shipmentId },
      ],
    },
    include: {
      shipment_packages: { where: { deallocated_at: null } },
    },
  });

  if (!shipment) {
    throw new Error(`WT_ERR_NOT_FOUND: Shipment '${input.shipmentId}' not found.`);
  }

  if (shipment.status === "dispatched") {
    throw new Error(`WT_ERR_SHIPMENT_DEPARTED: Shipment '${shipment.code}' has already departed.`);
  }

  const garment = await tx.garments.findFirst({
    where: {
      OR: [
        ...(isValidUuid(input.garmentId) ? [{ id: input.garmentId }] : []),
        { code: input.garmentId },
      ],
    },
    include: {
      package_items: { where: { removed_at: null } },
      garment_holds: { where: { released_at: null } },
    },
  });

  if (!garment || !garment.package_items) {
    throw new Error(`WT_ERR_UNPACKED_GARMENT: Garment '${input.garmentId}' is not in a package.`);
  }

  const packageId = garment.package_items.package_id;
  const isAllocated = shipment.shipment_packages.some((sp) => sp.package_id === packageId);

  if (!isAllocated) {
    throw new Error(
      `WT_ERR_UNALLOCATED_GARMENT: Garment '${garment.code}' (package '${packageId}') is not allocated to shipment '${shipment.code}'.`,
    );
  }

  if (garment.garment_holds.length > 0) {
    throw new Error(
      `WT_ERR_QUALITY_GATE: Garment '${garment.code}' has an active quality hold: "${garment.garment_holds[0]?.reason}".`,
    );
  }

  if (garment.quality_disposition !== "released") {
    throw new Error(
      `WT_ERR_QUALITY_GATE: Garment '${garment.code}' quality status is '${garment.quality_disposition}', must be 'released'.`,
    );
  }

  return {
    verified: true,
    shipmentId: shipment.id,
    garmentId: garment.id,
  };
}

/**
 * Authoritative Locked Departure Gate.
 * Evaluates the full manifest under lock immediately before departure:
 *   1. Must not have already departed
 *   2. Must contain allocated packages
 *   3. Every garment in every allocated package must have:
 *      - Quality disposition === 'released'
 *      - Zero active holds (holds added even after earlier verification block departure)
 *      - Stage === 'warehoused'
 *   4. Commits departure: transitions shipment, packages, and garments to 'dispatched'
 */
export async function confirmShipmentDeparture(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  shipmentId: string,
): Promise<ShipmentDepartureResult> {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only dispatch staff can confirm shipment departure.");
  }

  const staffUserId = await ensureStaffUserRecord(tx, actor);

  const shipment = await tx.shipments.findFirst({
    where: {
      OR: [
        ...(isValidUuid(shipmentId) ? [{ id: shipmentId }] : []),
        { code: shipmentId },
      ],
    },
    include: {
      shipment_packages: {
        where: { deallocated_at: null },
        include: {
          packages: {
            include: {
              package_items: {
                where: { removed_at: null },
                include: {
                  garments: {
                    include: {
                      garment_holds: { where: { released_at: null } },
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

  if (!shipment) {
    throw new Error(`WT_ERR_NOT_FOUND: Shipment '${shipmentId}' not found.`);
  }

  if (shipment.status === "dispatched") {
    throw new Error(`WT_ERR_SHIPMENT_DEPARTED: Shipment '${shipment.code}' has already departed.`);
  }

  if (shipment.shipment_packages.length === 0) {
    throw new Error("WT_ERR_EMPTY_SHIPMENT: Shipment contains no allocated packages.");
  }

  const manifestGarments: { id: string; code: string; holds: string[]; disposition: string }[] = [];
  const packageIds: string[] = [];

  for (const sp of shipment.shipment_packages) {
    packageIds.push(sp.package_id);
    for (const item of sp.packages.package_items) {
      manifestGarments.push({
        id: item.garments.id,
        code: item.garments.code,
        holds: item.garments.garment_holds.map((h) => h.reason),
        disposition: item.garments.quality_disposition,
      });
    }
  }

  if (manifestGarments.length === 0) {
    throw new Error("WT_ERR_EMPTY_MANIFEST: No garments found inside the allocated packages for this shipment.");
  }

  // Authoritative Gate Verification across all manifest garments
  const departureFailures: string[] = [];

  for (const g of manifestGarments) {
    if (g.holds.length > 0) {
      departureFailures.push(
        `Departure blocked: Garment '${g.code}' has an active hold ("${g.holds.join("; ")}"). Holds added even after earlier verification block departure.`,
      );
    }
    if (g.disposition !== "released") {
      departureFailures.push(
        `Departure blocked: Garment '${g.code}' quality status is '${g.disposition}', must be 'released'.`,
      );
    }
  }

  if (departureFailures.length > 0) {
    throw new Error(`WT_ERR_DEPARTURE_GATE_FAILED: ${departureFailures.join(" | ")}`);
  }

  const departedAt = new Date();

  // Commit departure: update shipment
  await tx.shipments.update({
    where: { id: shipment.id },
    data: {
      status: "dispatched",
      departed_at: departedAt,
      departed_by: staffUserId,
      revision: { increment: 1 },
    },
  });

  // Commit departure: update packages
  for (const pkgId of packageIds) {
    await tx.packages.update({
      where: { id: pkgId },
      data: {
        status: "dispatched",
        revision: { increment: 1 },
      },
    });
  }

  // Commit departure: update garments and publish public payload
  for (const g of manifestGarments) {
    await tx.garments.update({
      where: { id: g.id },
      data: {
        stage: "dispatched",
        revision: { increment: 1 },
      },
    });

    try {
      await publishPublicGarmentPayload(tx, g.id, staffUserId);
    } catch (pubErr) {
      console.warn(`[FULFILMENT_WARN] Public payload publication skipped for garment ${g.id}:`, pubErr);
    }
  }

  return {
    shipmentId: shipment.id,
    shipmentCode: shipment.code,
    status: "dispatched",
    departedAt: departedAt.toISOString(),
    dispatchedGarmentCount: manifestGarments.length,
  };
}

// ---------------------------------------------------------------- Query Helpers

export async function listPackages(tx: PrismaTransactionClient, options?: { status?: string }) {
  return tx.packages.findMany({
    where: {
      ...(options?.status ? { status: options.status as any } : {}),
    },
    include: {
      staff_users: { select: { id: true, username: true, display_name: true } },
      warehouse_stock: {
        include: { warehouse_bins: true },
      },
      package_items: {
        where: { removed_at: null },
        include: {
          garments: {
            select: { id: true, code: true, stage: true, quality_disposition: true, size_label: true },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });
}

export async function getPackageDetail(tx: PrismaTransactionClient, id: string) {
  return tx.packages.findFirst({
    where: {
      OR: [
        ...(isValidUuid(id) ? [{ id }] : []),
        { code: id },
      ],
    },
    include: {
      staff_users: { select: { id: true, username: true, display_name: true } },
      package_items: {
        where: { removed_at: null },
        include: {
          garments: {
            include: {
              garment_holds: { where: { released_at: null } },
            },
          },
        },
      },
      warehouse_stock: {
        include: { warehouse_bins: true },
      },
    },
  });
}

export async function listShipments(tx: PrismaTransactionClient, options?: { status?: string }) {
  return tx.shipments.findMany({
    where: {
      ...(options?.status ? { status: options.status as any } : {}),
    },
    include: {
      staff_users_shipments_created_byTostaff_users: {
        select: { id: true, username: true, display_name: true },
      },
      staff_users_shipments_departed_byTostaff_users: {
        select: { id: true, username: true, display_name: true },
      },
      shipment_packages: {
        where: { deallocated_at: null },
        include: {
          packages: {
            include: {
              package_items: { where: { removed_at: null } },
            },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });
}

export async function getShipmentDetail(tx: PrismaTransactionClient, id: string) {
  return tx.shipments.findFirst({
    where: {
      OR: [
        ...(isValidUuid(id) ? [{ id }] : []),
        { code: id },
      ],
    },
    include: {
      staff_users_shipments_created_byTostaff_users: {
        select: { id: true, username: true, display_name: true },
      },
      staff_users_shipments_departed_byTostaff_users: {
        select: { id: true, username: true, display_name: true },
      },
      shipment_packages: {
        where: { deallocated_at: null },
        include: {
          packages: {
            include: {
              package_items: {
                where: { removed_at: null },
                include: {
                  garments: {
                    include: {
                      garment_holds: { where: { released_at: null } },
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
}
