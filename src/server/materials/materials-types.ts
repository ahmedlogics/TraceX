import type { quantity_unit, material_movement_kind } from "@prisma/client";

export type QuantityUnit = quantity_unit; // 'm' | 'kg' | 'pcs'
export type MaterialMovementKind = material_movement_kind; // 'accepted' | 'issued' | 'unused_return' | 'adjustment_add' | 'adjustment_remove'

export interface SupplierDTO {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface MaterialLotDTO {
  id: string;
  code: string;
  supplierId: string;
  supplierName?: string | undefined;
  supplierLotRef?: string | null | undefined;
  receiptRef?: string | null | undefined;
  materialName: string;
  unit: QuantityUnit;
  receivedQuantity: number;
  availableAcceptedQuantity: number;
  receivedBy: string;
  receivedByName?: string | undefined;
  receivedAt: string;
  revision: number;
  activeTagUid?: string | null | undefined;
  status: "awaiting-inspection" | "accepted" | "rejected";
  incomingInspectionId?: string | null | undefined;
  defectReason?: string | null | undefined;
}

export interface MaterialStockMovementDTO {
  id: string;
  materialLotId: string;
  kind: MaterialMovementKind;
  productionOrderId?: string | null | undefined;
  productionOrderCode?: string | null | undefined;
  inspectionId?: string | null | undefined;
  originalIssueId?: string | null | undefined;
  quantity: number;
  reason: string;
  performedBy: string;
  performedByName?: string | undefined;
  performedAt: string;
}

export interface MaterialLotDetailDTO extends MaterialLotDTO {
  movements: MaterialStockMovementDTO[];
  issues: MaterialStockMovementDTO[];
  cuttingOutputsCount?: number | undefined;
  inspection?: {
    id: string;
    inspectionId?: string;
    status: "open" | "passed" | "failed";
    outcome?: string | null;
    defectReason?: string | null;
    createdAt: string;
    submittedAt?: string | null;
    submittedByName?: string | null;
  } | null | undefined;
}

export interface ReceiveLotInput {
  materialName: string;
  supplierId?: string | undefined;
  supplierCode?: string | undefined;
  supplierName?: string | undefined;
  supplierRef?: string | undefined;
  receiptRef?: string | undefined;
  quantity: number;
  unit?: QuantityUnit | undefined;
  tagUid?: string | undefined;
}

export interface AcceptIncomingStockInput {
  lotId: string;
  acceptedQuantity: number;
  inspectionId: string;
  notes?: string | undefined;
}

export interface AcceptIncomingStockResult {
  movementId: string;
  lotId: string;
  newBalance: number;
  acceptedQuantity: number;
}

export interface IssueMaterialInput {
  lotId: string;
  orderId: string;
  quantity: number;
  reason?: string | undefined;
}

export interface IssueMaterialResult {
  issueId: string;
  lotId: string;
  orderId: string;
  quantityIssued: number;
  remainingLotBalance: number;
}

export interface ReturnMaterialInput {
  issueId: string;
  quantity: number;
  reason: string;
}

export interface ReturnMaterialResult {
  returnMovementId: string;
  originalIssueId: string;
  lotId: string;
  quantityReturned: number;
  restoredLotBalance: number;
}

export interface BindLotCardInput {
  lotId: string;
  tagUid: string;
}

export interface BindLotCardResult {
  bindingId: string;
  lotId: string;
  tagUid: string;
}
