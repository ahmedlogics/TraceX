import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tone = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "border-border bg-muted text-muted-foreground",
      info: "border-transparent bg-info-soft text-accent-foreground",
      success: "border-transparent bg-success-soft text-success",
      warning: "border-transparent bg-warning-soft text-warning",
      danger: "border-transparent bg-danger-soft text-destructive",
    },
  },
  defaultVariants: { tone: "neutral" },
});

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

const pretty = (s: string) => s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Text-labelled status badge. Pass `label` to prefix a field name (e.g. "Stage"). */
export function StatusBadge({ status, label, tone: forced, className }: { status: string; label?: string; tone?: Tone; className?: string }) {
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
