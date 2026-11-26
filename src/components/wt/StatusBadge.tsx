import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tone = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "border-[#CDBBA8] bg-[#F2E4D2] text-[#2B170E]",
        info: "border-[#CDBBA8] bg-[#EFE3D3] text-[#2B170E]",
        success: "border-[#C79C70] bg-[#E2C8A8] text-[#2B170E]",
        warning: "border-[#C79C70] bg-[#D8B68F]/40 text-[#2B170E]",
        danger: "border-[#BFA894] bg-[#E8D7C2] text-[#2B170E]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const toneFor: Record<string, Tone> = {
  // lots / inspections
  "awaiting-inspection": "warning",
  accepted: "success",
  rejected: "danger",
  open: "info",
  passed: "success",
  failed: "danger",
  // dispositions
  "not-inspected": "neutral",
  "reinspection-pending": "warning",
  released: "success",
  // stages
  stitched: "success",
  finished: "success",
  stitching: "info",
  finishing: "info",
  "final-qc": "success",
  dispatched: "success",
  rework: "danger",
  // tasks
  claimed: "info",
  done: "success",
  // rework
  "awaiting-assignment": "warning",
  assigned: "info",
  repaired: "info",
  closed: "success",
  // shipments / orders
  draft: "neutral",
  planned: "info",
  departed: "success",
  "in-progress": "info",
  in_progress: "info",
  completed: "success",
  sealed: "success",
  // ledger
  pending: "warning",
  submitted: "info",
  confirmed: "success",
  "not-queued": "neutral",
  // users
  active: "success",
  invited: "info",
  suspended: "danger",
  hold: "danger",
};

const pretty = (s: string) => {
  if (s === "final-qc") return "Finished";
  return /\s/.test(s) ? s : s.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
};

/** Text-labelled status badge. Pass `label` to prefix a field name (e.g. "Stage"). */
export function StatusBadge({
  status,
  label,
  tone: forced,
  className,
}: {
  status: string;
  label?: string | undefined;
  tone?: Tone | undefined;
  className?: string | undefined;
}) {
  return (
    <span className={cn(tone({ tone: forced ?? toneFor[status] ?? "neutral" }), className)}>
      {label && <span className="opacity-70">{label}:</span>}
      {pretty(status)}
    </span>
  );
}

export function HoldBadge() {
  return <StatusBadge status="On hold" tone="danger" />;
}
