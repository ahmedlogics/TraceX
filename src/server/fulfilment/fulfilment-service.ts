/**
 * WearTrail Backend Fulfilment Service.
 *
 * Implements transaction-scoped business logic for:
 *   - Authoritative fulfilment eligibility checks
 *   - Packing scans and package member validation
 *   - Warehouse binning and stock movements
 *   - Outbound shipment verification scans and departure gate
 */
import type { PrismaTransactionClient } from "../db/types";
import type { Garment, Inspection, Package, Shipment, StaffUser } from "@/domain/types";
import {
  checkFulfilmentEligibility,
  type FulfilmentEligibilityResult,
} from "@/domain/quality-fulfilment-types";

/**
 * Validates whether a garment may be packed.
 * Enforces:
 *   - Physical stage is 'packing'
 *   - Quality disposition is 'passed' or 'released'
 *   - Zero active holds
 *   - Target package is open
 */
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

/**
 * Validates warehouse receipt into a storage bin.
 * Enforces:
 *   - Garment is packed in a package
 *   - Stage transitions to 'warehouse'
 */
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

/**
 * Authoritative Departure Gate.
 * Evaluates all manifest garments under lock before confirming departure:
 *   1. All manifest garments must be allocated.
 *   2. All manifest garments must be verified via S6 dispatch scan.
 *   3. Zero active holds on any garment.
 *   4. Quality disposition must be 'released' or 'passed'.
 */
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

  // 1. Allocation check
  const unallocated = shipment.garmentIds.filter(
    (id) => !shipment.allocatedGarmentIds.includes(id),
  );
  if (unallocated.length > 0) {
    failedChecks.push({
      label: "All garments allocated",
      detail: `Garments not yet allocated: ${unallocated.join(", ")}`,
    });
  }

  // 2. Dispatch verification check (S6 scan)
  const verifiedIds = shipment.verifiedGarmentIds ?? [];
  const unverified = shipment.garmentIds.filter((id) => !verifiedIds.includes(id));
  if (unverified.length > 0) {
    failedChecks.push({
      label: "All manifest garments verified at dispatch antenna (S6)",
      detail: `${unverified.length} garment(s) await dispatch scan verification: ${unverified.join(", ")}`,
    });
  }

  // 3. Quality & hold check across all garments on the manifest
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
