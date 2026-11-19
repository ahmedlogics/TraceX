import type { PublicEvidenceState } from "@/domain/public-types";
import type { Tone } from "@/components/wt/StatusBadge";

export const evidenceLabel: Record<
  PublicEvidenceState,
  { label: string; tone: Tone; text: string }
> = {
  "sample-confirmed": {
    label: "Ledger Confirmed",
    tone: "success",
    text: "A cryptographic commitment matching this published payload digest has been confirmed on-chain.",
  },
  pending: {
    label: "Commitment Pending",
    tone: "warning",
    text: "A cryptographic commitment for this record has been queued and is awaiting blockchain transaction inclusion.",
  },
  unavailable: {
    label: "Off-Chain Sealed",
    tone: "neutral",
    text: "This record is verified off-chain with deterministic SHA-256 hashing. No external blockchain transaction has been registered for this item.",
  },
};
