/**
 * Approved public projection types for the shopper journey.
 * These never carry operators, exact locations, suppliers, warehouse names,
 * private payloads, raw card UIDs, or internal repair notes.
 *
 * Owned by Member 4 (Staff access, shared UI and public journey).
 */

export type PublicMilestoneKey =
  | "fabric-sourced"
  | "material-issued"
  | "garment-cut"
  | "stitching-completed"
  | "garment-assembled"
  | "quality-passed"
  | "garment-packed"
  | "warehouse-received"
  | "dispatched";

export interface PublicMilestone {
  key: PublicMilestoneKey;
  label: string;
  /** ISO date only (YYYY-MM-DD, no private timestamp, no location). */
  date: string;
  department: string;
  description: string;
  lotLevel?: boolean | undefined;
  details?: Record<string, string | number | boolean> | undefined;
}

export type PublicStatus =
  | "In production"
  | "Passed quality control"
  | "Dispatched to authorized retail network"
  | "Temporarily on hold"
  | "Not released"
  | "Recalled";

export type PublicEvidenceState = "sample-confirmed" | "pending" | "unavailable";

export interface PublicNotice {
  kind: "hold" | "recall";
  title: string;
  message: string;
}

export interface PublicBlockchainInfo {
  networkName?: string | undefined;
  contractAddress?: string | undefined;
  transactionHash?: string | undefined;
  blockNumber?: number | undefined;
  confirmedAt?: string | undefined;
}

export interface PublicMaterialInfo {
  fabricType?: string | undefined;
  supplierName?: string | undefined;
  lotReference?: string | undefined;
  composition?: string | undefined;
  receivedDate?: string | undefined;
}

export interface PublicQualityInfo {
  disposition: "passed" | "released" | "held" | "in-review";
  inspectionLabel: string;
  inspectedDate?: string | undefined;
  certificationNote?: string | undefined;
}

export interface PublicLogisticsInfo {
  cartonCode?: string | undefined;
  packageType?: string | undefined;
  packagedDate?: string | undefined;
  warehouseDate?: string | undefined;
  dispatchedDate?: string | undefined;
}

export interface PublicJourney {
  publicId: string;
  productName: string;
  productDescription: string;
  garmentReference?: string | undefined;
  materialOrigin?: string | undefined;
  status: PublicStatus;
  colour?: string | undefined;
  size?: string | undefined;
  journeyHash: string;
  payloadVersion: number;
  publishedAt?: string | undefined;
  milestones: PublicMilestone[];
  notice?: PublicNotice | undefined;
  advisory?: string | undefined;
  evidence: PublicEvidenceState;
  sampleCommitmentRef?: string | undefined;
  blockchain?: PublicBlockchainInfo | undefined;
  materialInfo?: PublicMaterialInfo | undefined;
  qualityInfo?: PublicQualityInfo | undefined;
  logisticsInfo?: PublicLogisticsInfo | undefined;
}

export interface PublicPayload {
  schema: "weartrail.public-journey/v1";
  schemaVersion?: number | undefined;
  publicId: string;
  version: number;
  productName: string;
  garmentReference?: string | undefined;
  status: PublicStatus;
  colour?: string | undefined;
  size?: string | undefined;
  materialLot?:
    | {
        label: string;
        date: string;
      }
    | undefined;
  milestones: {
    key: PublicMilestoneKey;
    label: string;
    date: string;
    department?: string | undefined;
    lotLevel?: boolean | undefined;
  }[];
}

export interface PublicProof {
  publicId: string;
  productName: string;
  version: number;
  journeyHash: string;
  evidence: PublicEvidenceState;
  sampleCommitmentRef: string;
  canonicalBytesLength: number;
  payload: PublicPayload;
}
