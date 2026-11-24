import type { garment_stage, order_status, quality_status } from "@prisma/client";

export type OrderStatus = order_status; // 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled'
export type GarmentStage = garment_stage; // 'cut' | 'stitched' | 'finished' | 'packed' | 'warehoused' | 'dispatched' | 'returned' | 'scrapped'
export type QualityStatus = quality_status; // 'awaiting_inspection' | 'held' | 'released' | 'scrapped'

export interface ProductSpecDTO {
  id: string;
  styleCode: string;
  version: number;
  productName: string;
  category: "shirt" | "trouser" | "jacket" | "other";
  standardConsumptionMeters: number;
  sizeVariants: string[];
  active: boolean;
  description?: string | undefined;
  approvedBy: string;
  approvedByName?: string | undefined;
  approvedAt: string;
}

export interface ProductionOrderDTO {
  id: string;
  code: string;
  workflowVersionId: string;
  productSpecVersionId: string;
  productName: string;
  styleCode: string;
  plannedQuantity: number;
  status: OrderStatus;
  plannedFor?: string | null | undefined;
  createdBy: string;
  createdByName?: string | null | undefined;
  createdAt: string;
  approvedBy?: string | null | undefined;
  approvedByName?: string | null | undefined;
  approvedAt?: string | null | undefined;
  revision: number;
  lotIds?: string[] | undefined;
  lotCodes?: string[] | undefined;
  issues?:
    | {
        id: string;
        lotId?: string | undefined;
        lotCode?: string | undefined;
        materialName?: string | undefined;
        quantity: number;
        performedAt: string;
      }[]
    | undefined;
}

export interface ProductionOrderDetailDTO extends ProductionOrderDTO {
  spec: ProductSpecDTO;
  issuedMetersTotal: number;
  issues: {
    id: string;
    lotId: string;
    lotCode: string;
    materialName: string;
    quantity: number;
    performedAt: string;
  }[];
  cuttingJobs: {
    id: string;
    code: string;
    performedAt: string;
    garmentsCount: number;
  }[];
  garments: GarmentDTO[];
}

export interface CuttingJobDTO {
  id: string;
  code: string;
  productionOrderId: string;
  performedBy: string;
  performedByName?: string | undefined;
  performedAt: string;
}

export interface CuttingSourceSelectionDTO {
  id: string;
  readerSessionId: string;
  cuttingJobId: string;
  cuttingInputId: string;
  sourceScanId: string;
  selectedBy: string;
  selectedAt: string;
  closedAt?: string | null | undefined;
  closeReason?: string | null | undefined;
  active: boolean;
  orderId: string;
  issueId: string;
  lotId: string;
  consumedQty: number;
  wasteQty: number;
}

export interface GarmentDTO {
  id: string;
  code: string;
  publicId: string;
  cuttingJobId: string;
  productionOrderId: string;
  productionOrderCode?: string | undefined;
  productName?: string | undefined;
  sizeLabel?: string | null | undefined;
  stage: GarmentStage;
  qualityDisposition: QualityStatus;
  createdAt: string;
  revision: number;
  activeTagUid?: string | null | undefined;
}

export interface GarmentDetailDTO extends GarmentDTO {
  cuttingJobCode: string;
  materialLotId?: string | undefined;
  materialLotCode?: string | undefined;
  materialName?: string | undefined;
  attributedFabricMeters?: number | undefined;
  tagBindingsHistory: {
    id: string;
    tagUid: string;
    boundAt: string;
    unboundAt?: string | null | undefined;
    active: boolean;
  }[];
}

export interface PlanOrderInput {
  product: string;
  styleCode: string;
  qty: number;
  dueDate?: string | undefined;
  workflowVersionId?: string | undefined;
}

export interface ApproveOrderInput {
  orderId: string;
}

export interface ConfirmCuttingSourceInput {
  orderId: string;
  issueId: string;
  consumedQty: number;
  wasteQty?: number | undefined;
  tagUid?: string | undefined;
  readerSessionId?: string | undefined;
}

export interface ConfirmCuttingSourceResult {
  cuttingJobId: string;
  cuttingInputId: string;
  sourceSelectionId?: string | undefined;
  orderId: string;
  issueId: string;
  lotId: string;
}

export interface BindGarmentTagInput {
  cuttingSourceSelectionId?: string | undefined;
  cuttingJobId?: string | undefined;
  orderId: string;
  size: string;
  tagUid: string;
  fabricUsed?: number | undefined;
}

export interface BindGarmentTagResult {
  garmentId: string;
  garmentCode: string;
  publicId: string;
  tagUid: string;
  orderId: string;
  size: string;
  stage: GarmentStage;
  qualityDisposition: QualityStatus;
  attributedFabric: number;
}

export interface ReplaceGarmentCardInput {
  garmentId: string;
  newUid: string;
  reason?: string | undefined;
}

export interface ReplaceGarmentCardResult {
  garmentId: string;
  garmentCode: string;
  publicId: string;
  oldUid?: string | null | undefined;
  newUid: string;
  unboundBindingId?: string | null | undefined;
  newBindingId: string;
}

export interface RoutineScanInput {
  tagUid: string;
  stationCode: "stitching" | "finishing";
  isHardware?: boolean;
}

export interface RoutineScanResult {
  accepted: boolean;
  garmentId: string;
  garmentCode: string;
  productName: string;
  stage: GarmentStage;
  nextExpectedStation: string;
  qualityDisposition: QualityStatus;
  uid?: string;
  resolution?: string;
  rejectReason?: string;
  at?: string;
}
