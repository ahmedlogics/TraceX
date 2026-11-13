import type { PublicEvidenceState } from "@/domain/public-types";
import type { Tone } from "@/components/wt/StatusBadge";

export const evidenceLabel: Record<PublicEvidenceState, { label: string; tone: Tone; text: string }> = {
  "sample-confirmed": { label: "Sample confirmed", tone: "success", text: "A sample commitment for this published record is marked confirmed in the demo." },
  pending: { label: "Pending", tone: "warning", text: "A commitment for this record has been queued but is not confirmed yet." },
  unavailable: { label: "Unavailable", tone: "neutral", text: "No commitment is available for this record yet." },
};
