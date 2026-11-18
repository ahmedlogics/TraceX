/**
 * Approved public projection types for the shopper journey.
 * These never carry operators, exact locations, suppliers, warehouse names,
 * private payloads or internal repair notes.
 */

export type PublicMilestoneKey =
  "fabric-sourced" | "garment-cut" | "garment-assembled" | "quality-passed" | "dispatched";

export interface PublicMilestone {
  key: PublicMilestoneKey;
  label: string;
  /** ISO date only (no time, no location). */
  date: string;
  description: string;
  lotLevel?: boolean | undefined;
}

export type PublicStatus =
  | "In production"
  | "Passed quality control"
  | "Dispatched to authorized retail network"
  | "Temporarily on hold";

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
  status: PublicStatus;
  milestones: PublicMilestone[];
  notice?: PublicNotice | undefined;
  advisory?: string | undefined;
  evidence: PublicEvidenceState;
}

export interface PublicPayload {
  schema: "weartrail.public-journey/demo-v0";
  publicId: string;
  productName: string;
  status: PublicStatus;
  milestones: { key: PublicMilestoneKey; date: string; lotLevel?: boolean | undefined }[];
}

export interface PublicProof {
  publicId: string;
  productName: string;
  evidence: PublicEvidenceState;
  sampleCommitmentRef: string;
  payload: PublicPayload;
}
