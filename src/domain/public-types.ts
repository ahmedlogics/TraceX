/**
 * Approved public projection types for the shopper journey.
 * These never carry operators, exact locations, suppliers, warehouse names,
 * private payloads, raw card UIDs, or internal repair notes.
 *
 * Owned by Member 4 (Staff access, shared UI and public journey).
 */

export type PublicMilestoneKey =
  "fabric-sourced" | "garment-cut" | "garment-assembled" | "quality-passed" | "dispatched";

export interface PublicMilestone {
  key: PublicMilestoneKey;
  label: string;
  /** ISO date only (YYYY-MM-DD, no private timestamp, no location). */
  date: string;
  department: string;
  description: string;
  lotLevel?: boolean | undefined;
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
}

export interface PublicPayload {
  schema: "weartrail.public-journey/v1";
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
