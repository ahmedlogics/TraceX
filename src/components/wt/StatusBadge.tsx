import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tone = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-2xs",
  {
    variants: {
      tone: {
        neutral: "border-[#CDBBA8] bg-[#F4EADA] text-[#6E5748]",
        info: "border-[#CDBBA8] bg-[#EFE3D3] text-[#2B170E]",
        success: "border-[#99C5C1] bg-[#E6F0EE] text-[#134441]",
        warning: "border-[#CDBBA8] bg-[#F4EADA] text-[#6E5748]",
        danger: "border-[#D9B7B0] bg-[#F7ECE9] text-[#7A3528]",
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
  const currentTone = forced ?? toneFor[status] ?? "neutral";
  return (
    <span className={cn(tone({ tone: currentTone }), className)}>
      {currentTone === "success" && (
        <span className="size-1.5 rounded-full bg-[#1B5E5A] shrink-0" />
      )}
      {label && <span className="opacity-70">{label}:</span>}
      {pretty(status)}
    </span>
  );
}

export function HoldBadge() {
  return <StatusBadge status="On hold" tone="danger" />;
}
