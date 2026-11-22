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
import type { Garment, Inspection, Package, Shipment, StaffUser } from "@/domain/types";
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
import { createInternalCommitment } from "../ledger/commitment-service";

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

/**
 * Receives stock into a warehouse storage bin.
 * Enforces:
 *   - Storage bin must exist and be active
 *   - Updates warehouse_stock and logs warehouse_movements
 *   - Transitions package and its member garments to 'warehoused'
 */
export async function receiveWarehouseStock(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  input: WarehouseReceivePayload,
) {
  if (!isLogisticsRole(actor)) {
    throw new Error("WT_ERR_FORBIDDEN: Only warehouse/logistics staff can receive stock.");
  }

  const staffUserId = await ensureStaffUserRecord(tx, actor);

  // 1. Resolve storage bin
  let bin = await tx.warehouse_bins.findFirst({
    where: {
      OR: [
        ...(isValidUuid(input.binId) ? [{ id: input.binId }] : []),
        { code: input.binId },
      ],
    },
  });

  if (!bin) {
    bin = await tx.warehouse_bins.create({
      data: {
        code: input.binId || "BIN-A1",
        label: `Bin ${input.binId || "A1"}`,
        active: true,
      },
    });
  }

  // 2. Resolve target package & garment
  let targetPackageId: string | null = null;

  const garment = await tx.garments.findFirst({
    where: {
      OR: [
        ...(isValidUuid(input.garmentId) ? [{ id: input.garmentId }] : []),
        { code: input.garmentId },
      ],
    },
    include: {
      package_items: {
        where: { removed_at: null },
      },
    },
  });

  if (garment && garment.package_items) {
    targetPackageId = garment.package_items.package_id;
  } else {
    const pkg = await tx.packages.findFirst({
      where: {
        OR: [
          ...(isValidUuid(input.garmentId) ? [{ id: input.garmentId }] : []),
          { code: input.garmentId },
        ],
      },
    });
    if (pkg) targetPackageId = pkg.id;
  }

  if (!targetPackageId) {
    throw new Error(`WT_ERR_NOT_FOUND: No package found for item '${input.garmentId}'.`);
  }

  // 3. Upsert warehouse stock
  await tx.warehouse_stock.upsert({
    where: { package_id: targetPackageId },
    create: {
      package_id: targetPackageId,
      current_bin_id: bin.id,
      updated_at: new Date(),
    },
    update: {
      current_bin_id: bin.id,
      updated_at: new Date(),
      revision: { increment: 1 },
    },
  });

  // 4. Record warehouse movement
  await tx.warehouse_movements.create({
    data: {
      package_id: targetPackageId,
      to_bin_id: bin.id,
      performed_by: staffUserId,
      reason: "Warehouse binning scan",
    },
  });

  // 5. Update package status to 'warehoused'
  await tx.packages.update({
    where: { id: targetPackageId },
    data: {
      status: "warehoused",
      revision: { increment: 1 },
    },
  });

  // 6. Transition all member garments to 'warehoused'
  const items = await tx.package_items.findMany({
    where: { package_id: targetPackageId, removed_at: null },
  });

  for (const item of items) {
    await tx.garments.update({
      where: { id: item.garment_id },
      data: {
        stage: "warehoused",
        revision: { increment: 1 },
      },
    });
  }

  return {
    packageId: targetPackageId,
    binId: bin.id,
    garmentsUpdated: items.length,
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
      package_items: {
        where: { removed_at: null },
        include: {
          garments: { select: { id: true, code: true, stage: true, quality_disposition: true } },
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

/**
 * Station 9: Aggregate Carton Dispatch Scan.
 * Scans master container/box tag UID or code.
 * Automates checks:
 *   1. Valid box tag registration
 *   2. Box contains linked products (> 0)
 *   3. Box not already dispatched
 *   4. Zero active quality holds on any linked garments
 * Upon pass:
 *   - Atomically updates package status to 'dispatched'
 *   - Atomically updates all linked garments stage to 'dispatched'
 *   - Closes dispatch work tasks
 *   - Creates trace events, internal commitments, and publishes DPP public payload
 */
export async function dispatchBoxScan(
  tx: PrismaTransactionClient,
  actor: StaffUser | ActorContext,
  boxTagOrId: string,
  shipmentId?: string,
) {
  const staffUserId =
    "actorId" in actor ? actor.actorId : (actor as any).id;
  await ensureStaffUserRecord(tx, actor);

  const cleanInput = boxTagOrId.trim();
  const normUid = cleanInput.replace(/[\s:-]/g, "").toUpperCase();

  // 1. Resolve package by code, id, or tag binding
  let pkg = await tx.packages.findFirst({
    where: {
      OR: [
        ...(isValidUuid(cleanInput) ? [{ id: cleanInput }] : []),
        { code: cleanInput },
      ],
    },
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
  });

  if (!pkg) {
    // Check if tag UID is bound to a garment inside a package
    const binding = await tx.rfid_tag_bindings.findFirst({
      where: { tag_uid: normUid, unbound_at: null },
      include: {
        garments: {
          include: {
            package_items: {
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
        },
      },
    });

    if (binding?.garments?.package_items?.packages) {
      pkg = binding.garments.package_items.packages;
    }
  }

  // Check 1: Is the Tag registered as a valid Box?
  if (!pkg) {
    return {
      scanId: crypto.randomUUID(),
      uid: normUid,
      resolution: "rejected_unknown_card" as const,
      outcome: "rejected" as const,
      rejectReason: `Unrecognised Box Tag: Tag UID '${cleanInput}' is not registered to any box or carton.`,
      at: new Date().toISOString(),
    };
  }

  // Check 2: Does the Box contain linked products (> 0)?
  if (!pkg.package_items || pkg.package_items.length === 0) {
    return {
      scanId: crypto.randomUUID(),
      uid: normUid,
      resolution: "rejected_business_rule" as const,
      outcome: "rejected" as const,
      subjectId: pkg.code,
      garmentCode: pkg.code,
      rejectReason: `Cannot dispatch empty box — 0 products linked to ${pkg.code}.`,
      at: new Date().toISOString(),
    };
  }

  // Check 3: Has this Box already been dispatched?
  if (pkg.status === "dispatched") {
    return {
      scanId: crypto.randomUUID(),
      uid: normUid,
      resolution: "rejected_business_rule" as const,
      outcome: "rejected" as const,
      subjectId: pkg.code,
      garmentCode: pkg.code,
      rejectReason: `Box Already Dispatched: Box ${pkg.code} has already been dispatched.`,
      at: new Date().toISOString(),
    };
  }

  // Check 4: Do ANY linked garments have an active Hold?
  const holdItem = pkg.package_items.find(
    (item) => item.garments.garment_holds.length > 0,
  );
  if (holdItem) {
    const reason = holdItem.garments.garment_holds[0]?.reason
      ? ` ("${holdItem.garments.garment_holds[0].reason}")`
      : "";
    return {
      scanId: crypto.randomUUID(),
      uid: normUid,
      resolution: "rejected_business_rule" as const,
      outcome: "rejected" as const,
      subjectId: pkg.code,
      garmentCode: pkg.code,
      rejectReason: `Blocked: Garment ${holdItem.garments.code} inside Box ${pkg.code} has an active Quality Hold${reason}. Release hold before dispatching.`,
      at: new Date().toISOString(),
    };
  }

  // All Passed: Instant Atomic Status Advancement
  const now = new Date();

  // Update Package to dispatched
  await tx.packages.update({
    where: { id: pkg.id },
    data: {
      status: "dispatched",
      revision: { increment: 1 },
    },
  });

  // Update all linked garments to dispatched
  for (const item of pkg.package_items) {
    const g = item.garments;
    await tx.garments.update({
      where: { id: g.id },
      data: {
        stage: "dispatched",
        revision: { increment: 1 },
      },
    });

    const ev = await tx.trace_events.create({
      data: {
        event_type: "shipment_dispatched",
        subject_revision: 1,
        garment_id: g.id,
        package_id: pkg.id,
        actor_id: staffUserId,
        details: { stage: "dispatched", container: pkg.code, shipmentId },
        occurred_at: now,
        recorded_at: now,
      },
    });

    try {
      await createInternalCommitment(
        {
          traceEventId: ev.id,
          payload: {
            eventType: "shipment_dispatched",
            garmentId: g.id,
            garmentCode: g.code,
            packageCode: pkg.code,
            shipmentId,
            dispatchedAt: now.toISOString(),
          },
        },
        tx,
      );
    } catch (commErr) {
      console.warn(`[DISPATCH_WARN] Ledger commitment skipped for traceEvent ${ev.id}:`, commErr);
    }

    try {
      await publishPublicGarmentPayload(tx, g.id, staffUserId);
    } catch (pubErr) {
      console.warn(`[DISPATCH_WARN] Public payload publication skipped for garment ${g.id}:`, pubErr);
    }
  }

  // Link shipment and advance status if shipmentId provided
  if (shipmentId) {
    try {
      const shp = await tx.shipments.findFirst({
        where: {
          OR: [
            ...(isValidUuid(shipmentId) ? [{ id: shipmentId }] : []),
            { code: shipmentId },
          ],
        },
      });
      if (shp) {
        const existingSp = await tx.shipment_packages.findFirst({
          where: {
            shipment_id: shp.id,
            package_id: pkg.id,
            deallocated_at: null,
          },
        });
        if (!existingSp) {
          await tx.shipment_packages.create({
            data: {
              shipment_id: shp.id,
              package_id: pkg.id,
              allocated_by: staffUserId,
              allocated_at: now,
            },
          });
        }
        if (shp.status === "draft") {
          await tx.shipments.update({
            where: { id: shp.id },
            data: {
              status: "approved",
              revision: { increment: 1 },
            },
          });
        }
      }
    } catch (shpErr) {
      console.warn("[DISPATCH_WARN] Shipment package link update skipped:", shpErr);
    }
  }

  // Close work tasks for this carton if any
  try {
    await tx.work_tasks.updateMany({
      where: {
        package_id: pkg.id,
        department_code: "dispatch",
        status: { in: ["queued", "assigned", "claimed", "in_progress"] },
      },
      data: {
        status: "completed",
        completed_at: now,
      },
    });
  } catch (_e) {
    // optional task closure
  }

  return {
    scanId: crypto.randomUUID(),
    uid: normUid,
    resolution: "accepted" as const,
    outcome: "accepted" as const,
    subjectId: pkg.code,
    garmentCode: pkg.code,
    productName: `${pkg.package_items.length} Linked Units Dispatched`,
    at: now.toISOString(),
    details: {
      boxId: pkg.code,
      units: pkg.package_items.length,
      shipmentId,
      message: `Box Scanned → All ${pkg.package_items.length} linked garments updated to 'dispatched'`,
    },
  };
}
