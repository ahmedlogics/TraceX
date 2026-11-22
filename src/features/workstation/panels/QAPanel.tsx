import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Layers,
  OctagonAlert,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, ScopeNote } from "@/components/wt/forms";
import { Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import type { ChecklistItem, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

const defaultChecklist: ChecklistItem[] = [
  { id: "c1", label: "Visual inspection — fabric surface, shading, no soil/oil", checked: true },
  { id: "c2", label: "Stitch integrity — seam strength, clean hems, no open seams", checked: true },
  { id: "c3", label: "Dimensions & measurements — within approved spec tolerance", checked: true },
  {
    id: "c4",
    label: "Labels, trim & accessories — correct brand/care tags, secure buttons",
    checked: true,
  },
];

interface CommonDefect {
  id: string;
  label: string;
  defaultDepartment: "cutting" | "stitching" | "finishing";
}

const COMMON_DEFECT_OPTIONS: CommonDefect[] = [
  { id: "d1", label: "Open Seam", defaultDepartment: "stitching" },
  { id: "d2", label: "Broken / Loose Stitch", defaultDepartment: "stitching" },
  { id: "d3", label: "Untrimmed Threads", defaultDepartment: "finishing" },
  { id: "d4", label: "Fabric Flaw / Oil Spot", defaultDepartment: "finishing" },
  { id: "d5", label: "Shade Mismatch", defaultDepartment: "cutting" },
  { id: "d6", label: "Misaligned Collar / Pocket", defaultDepartment: "stitching" },
];

const REFER_DEPARTMENTS: { code: "cutting" | "stitching" | "finishing"; label: string }[] = [
  { code: "cutting", label: "Cutting Department (Pattern / Panel Rework)" },
  { code: "stitching", label: "Stitching Department (Sewing / Seam Repair)" },
  { code: "finishing", label: "Finishing Department (Trims / Pressing / Cleaning)" },
];

interface InspectionFeedback {
  type: "passed" | "failed" | "discarded" | "rejected" | "idle";
  title: string;
  message: string;
  garmentCode?: string | undefined;
  productStyle?: string | undefined;
  size?: string | undefined;
  loggedDefect?: string | undefined;
  assignedDepartment?: string | undefined;
  rfidUid?: string | undefined;
  timestamp?: string | undefined;
}

export function QAPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  // Decision State: "pass" | "fail"
  const [decision, setDecision] = useState<"pass" | "fail">("pass");

  // Defect Configuration State (when decision === "fail")
  const [selectedDefects, setSelectedDefects] = useState<string[]>([]);
  const [customComment, setCustomComment] = useState("");
  const [referDept, setReferDept] = useState<"cutting" | "stitching" | "finishing">("stitching");
  const [discardProduct, setDiscardProduct] = useState(false);

  // General notes & checklist
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist);

  // Scanner 6 Hardware Simulation Input
  const [scanUid, setScanUid] = useState("04DAEBFC"); // SHIRT-002 seed tag
  const [feedback, setFeedback] = useState<InspectionFeedback>({
    type: "idle",
    title: "Scanner 6 Ready for Inspection",
    message: "Select Pass or Fail, configure any defect notes, then tap the garment's RFID tag on Scanner 6.",
  });

  const isInspector = me.role === "Q" || me.department === "quality" || me.role === "A";

  // Mandatory Fail-Form Validation:
  // Must either select at least one common defect OR type text in the comment box.
  // Must select refer department unless discard is enabled.
  const hasDefectSelection = selectedDefects.length > 0;
  const hasCustomComment = customComment.trim().length > 0;
  const isFailConfigValid =
    (hasDefectSelection || hasCustomComment) && (discardProduct || Boolean(referDept));
  const isDecisionReady = decision === "pass" ? checklist.every((c) => c.checked) : isFailConfigValid;

  const resetForm = () => {
    setSelectedDefects([]);
    setCustomComment("");
    setReferDept("stitching");
    setDiscardProduct(false);
    setNotes("");
    setChecklist(defaultChecklist);
  };

  // Centralized Scanner 6 Handler
  const handleScanner6Scan = async (rawUid: string) => {
    const uid = rawUid.trim().toUpperCase();
    if (!uid) return;

    if (!isDecisionReady) {
      setFeedback({
        type: "rejected",
        title: "Scanner 6 Disarmed",
        message: "Mandatory inspection fields missing. Select a common defect option or enter custom comments before scanning.",
        rfidUid: uid,
      });
      return;
    }

    // Compile defect reason
    const selectedLabels = COMMON_DEFECT_OPTIONS.filter((d) => selectedDefects.includes(d.id)).map(
      (d) => d.label,
    );
    let finalDefectReason = selectedLabels.join(", ");
    if (customComment.trim()) {
      finalDefectReason = finalDefectReason
        ? `${finalDefectReason} — ${customComment.trim()}`
        : customComment.trim();
    }
    if (discardProduct) {
      finalDefectReason = `[SCRAP/DISCARD] ${finalDefectReason || "Defect beyond repair"}`;
    }

    try {
      // 1. Prepare Action Context
      const ctxId = await run((c) =>
        c.prepareActionContext("final_qc", "submit_qc", {
          kind: "submit_qc",
          result: decision,
          scope: "final",
          defectReason: decision === "fail" ? finalDefectReason : undefined,
          assignedDepartment: decision === "fail" && !discardProduct ? referDept : undefined,
          discard: discardProduct,
          checklist:
            decision === "pass"
              ? checklist
              : selectedLabels.map((l, i) => ({ id: `df-${i}`, label: l, checked: true })),
          notes: notes.trim(),
        }),
      );

      if (!ctxId) {
        setFeedback({
          type: "rejected",
          title: "Hardware Context Error",
          message: "Failed to arm Scanner 6 action context. Check reader connectivity.",
          rfidUid: uid,
        });
        return;
      }

      // 2. Simulate Reader Board Ack
      await run((c) => c.acknowledgeContext(ctxId));

      // 3. Resolve RFID Scan
      const outcome = await run((c) => c.resolveRfidScan(uid));

      if (!outcome) {
        setFeedback({
          type: "rejected",
          title: "Scan Incomplete",
          message: "Scan transaction could not be processed by station engine.",
          rfidUid: uid,
          timestamp: new Date().toLocaleTimeString(),
        });
        return;
      }

      if (outcome.resolution === "accepted") {
        if (discardProduct) {
          setFeedback({
            type: "discarded",
            title: `Product Scrapped: ${outcome.garmentCode ?? outcome.subjectId}`,
            message: "Product Scrapped / Discarded → Decommissioned from line",
            garmentCode: outcome.garmentCode ?? outcome.subjectId,
            productStyle: outcome.productName,
            loggedDefect: finalDefectReason,
            rfidUid: uid,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else if (decision === "pass") {
          setFeedback({
            type: "passed",
            title: `Inspection Passed: ${outcome.garmentCode ?? outcome.subjectId}`,
            message: "Inspection Passed → Released to Station 7 (Packing)",
            garmentCode: outcome.garmentCode ?? outcome.subjectId,
            productStyle: outcome.productName,
            rfidUid: uid,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else {
          setFeedback({
            type: "failed",
            title: `Defect Registered: ${outcome.garmentCode ?? outcome.subjectId}`,
            message: `Defect Registered → Sent to ${referDept.charAt(0).toUpperCase() + referDept.slice(1)} Repair Queue`,
            garmentCode: outcome.garmentCode ?? outcome.subjectId,
            productStyle: outcome.productName,
            loggedDefect: finalDefectReason,
            assignedDepartment: referDept,
            rfidUid: uid,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        resetForm();
      } else {
        setFeedback({
          type: "rejected",
          title: "Scan Operation Rejected",
          message: outcome.rejectReason || `Station rule violated: ${outcome.resolution}`,
          rfidUid: uid,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: "rejected",
        title: "Scan Exception",
        message: err?.message || "Internal error resolving inspection scan.",
        rfidUid: uid,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Station Hardware Status */}
      <div className="rounded-xl border-2 border-primary/40 bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="wt-id rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                STATION 6
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                Final QC &amp; Rework Gate
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Station 6 · Final Quality Inspection (Scanner 6)
            </h2>
            <p className="text-xs text-muted-foreground">
              Active Inspector:{" "}
              <span className="font-semibold text-foreground">
                {me.displayName} ({me.username})
              </span>{" "}
              · Certified Quality Inspector · Department:{" "}
              <span className="font-mono font-medium text-foreground">
                {me.department}
              </span>
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft border border-success/30 px-2.5 py-1 text-xs font-bold text-success-foreground">
                Scanner 6: Armed &amp; Active
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Decision-First &amp; Zero-Search · Physical examination prior to RFID scan
            </p>
          </div>
        </div>
      </div>

      {/* Live Inspection Feedback Box */}
      <div
        className={`rounded-xl border p-4 shadow-sm transition-all ${
          feedback.type === "passed"
            ? "border-success/50 bg-success-soft text-foreground"
            : feedback.type === "failed"
              ? "border-destructive/50 bg-danger-soft text-foreground"
              : feedback.type === "discarded"
                ? "border-amber-500/50 bg-amber-500/10 text-foreground"
                : feedback.type === "rejected"
                  ? "border-destructive/50 bg-danger-soft text-foreground"
                  : "border-border bg-card text-foreground"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {feedback.type === "passed" && (
              <ShieldCheck className="size-5 text-success" />
            )}
            {feedback.type === "failed" && (
              <ShieldAlert className="size-5 text-destructive" />
            )}
            {feedback.type === "discarded" && (
              <Trash2 className="size-5 text-amber-600 dark:text-amber-400" />
            )}
            {feedback.type === "rejected" && (
              <XCircle className="size-5 text-destructive" />
            )}
            {feedback.type === "idle" && (
              <ScanLine className="size-5 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold tracking-tight text-foreground">
                {feedback.title}
              </h4>
              {feedback.rfidUid && (
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted">
                  UID: {feedback.rfidUid}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold">{feedback.message}</p>

            {(feedback.garmentCode || feedback.productStyle || feedback.loggedDefect || feedback.assignedDepartment) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                {feedback.garmentCode && (
                  <span>
                    Garment ID:{" "}
                    <strong className="text-foreground font-mono">
                      {feedback.garmentCode}
                    </strong>
                  </span>
                )}
                {feedback.productStyle && (
                  <span>
                    Style:{" "}
                    <strong className="text-foreground">
                      {feedback.productStyle}
                    </strong>
                  </span>
                )}
                {feedback.assignedDepartment && (
                  <span>
                    Routed Dept:{" "}
                    <strong className="text-destructive uppercase font-bold">
                      {feedback.assignedDepartment}
                    </strong>
                  </span>
                )}
                {feedback.loggedDefect && (
                  <span>
                    Defect:{" "}
                    <strong className="text-destructive">
                      {feedback.loggedDefect}
                    </strong>
                  </span>
                )}
                {feedback.timestamp && (
                  <span className="text-muted-foreground">
                    Time: {feedback.timestamp}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Left Column: Inspection Decision & Defect Form */}
        <section className="rounded-xl border bg-card p-5 space-y-5 shadow-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Step 1: Physical Examination
            </span>
            <h3 className="text-base font-bold text-foreground">
              Inspection Decision (Zero-Search)
            </h3>
            <p className="text-xs text-muted-foreground">
              Examine seams, dimensions, fabric surface, buttons, and labels. Choose outcome below.
            </p>
          </div>

          {/* Primary Decision Toggle (Large High-Visibility Buttons) */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setDecision("pass");
                resetForm();
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                decision === "pass"
                  ? "border-success bg-success-soft text-success shadow-xs font-bold ring-2 ring-success/20"
                  : "border-border bg-card text-muted-foreground hover:border-success/50"
              }`}
            >
              <CheckCircle2 className={`size-7 ${decision === "pass" ? "text-success" : "text-muted-foreground"}`} />
              <div>
                <span className="text-sm font-bold block">Pass &amp; Release</span>
                <span className="text-[10px] opacity-80 block">Meets all quality standards</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDecision("fail")}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                decision === "fail"
                  ? "border-destructive bg-danger-soft text-destructive shadow-xs font-bold ring-2 ring-destructive/20"
                  : "border-border bg-card text-muted-foreground hover:border-destructive/50"
              }`}
            >
              <XCircle className={`size-7 ${decision === "fail" ? "text-destructive" : "text-muted-foreground"}`} />
              <div>
                <span className="text-sm font-bold block">Fail &amp; Route</span>
                <span className="text-[10px] opacity-80 block">Requires repair or scrapping</span>
              </div>
            </button>
          </div>

          {/* Defect Configuration Panel (Visible ONLY when Fail & Route is active) */}
          {decision === "fail" ? (
            <div className="space-y-4 rounded-xl border-2 border-destructive/30 bg-muted/10 p-4 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                  <ShieldAlert className="size-4" />
                  Defect Configuration &amp; Routing
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  {selectedDefects.length > 0 ? `${selectedDefects.length} defect(s) selected` : "Required"}
                </span>
              </div>

              {/* Common Defect Options (Preset Tags for Rapid Selection) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground block">
                  Common Defect Options (Quick Check)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {COMMON_DEFECT_OPTIONS.map((defect) => {
                    const isSelected = selectedDefects.includes(defect.id);
                    return (
                      <button
                        key={defect.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedDefects((prev) => prev.filter((id) => id !== defect.id));
                          } else {
                            setSelectedDefects((prev) => [...prev, defect.id]);
                            if (!discardProduct) {
                              setReferDept(defect.defaultDepartment);
                            }
                          }
                        }}
                        className={`text-left text-xs p-2 rounded-lg border transition-all flex items-center justify-between ${
                          isSelected
                            ? "border-destructive bg-danger-soft text-destructive font-bold"
                            : "border-border bg-card text-foreground hover:border-primary/40"
                        }`}
                      >
                        <span className="truncate pr-1">{defect.label}</span>
                        {isSelected ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-destructive" />
                        ) : (
                          <span className="size-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Defect Detail Box */}
              <Field
                label="Custom Defect Detail Box"
                htmlFor="qc-custom-comment"
                hint={
                  hasDefectSelection
                    ? "Optional additional notes explaining specific repair needs."
                    : "Mandatory if no common defect is selected above: describe fault."
                }
              >
                <Textarea
                  id="qc-custom-comment"
                  rows={2}
                  value={customComment}
                  onChange={(e) => setCustomComment(e.target.value)}
                  placeholder="e.g. Broken stitching along left pocket flap seam; unpick and restitch with navy thread"
                  className="text-xs bg-background"
                />
              </Field>

              {/* Discard Product Option (Scrap Toggle) */}
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5">
                <Checkbox
                  id="discard-toggle"
                  checked={discardProduct}
                  onCheckedChange={(checked) => setDiscardProduct(checked === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <label
                    htmlFor="discard-toggle"
                    className="text-xs font-bold text-amber-900 dark:text-amber-200 cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="size-3.5" />
                    Discard Product (Scrap Permanently)
                  </label>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Check if the defect is non-repairable. Bypasses department repair routing and permanently decommissions the garment.
                  </p>
                </div>
              </div>

              {/* Refer Department Dropdown (Hidden/Disabled when Discard Product is checked) */}
              {!discardProduct && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="refer-dept"
                    className="text-xs font-bold text-foreground block"
                  >
                    Refer Department (Mandatory for Rework Routing)
                  </label>
                  <select
                    id="refer-dept"
                    value={referDept}
                    onChange={(e) => setReferDept(e.target.value as any)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {REFER_DEPARTMENTS.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Garment will automatically appear on the selected department&apos;s repair screen upon card tap.
                  </p>
                </div>
              )}

              {/* Mandatory Guard Banner if invalid */}
              {!isFailConfigValid && (
                <div className="rounded-md border border-destructive/40 bg-danger-soft p-2.5 text-xs text-destructive font-medium flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>
                    Select at least one common defect option OR type a custom defect description to arm Scanner 6.
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* Pass Criteria Checklist */
            <div className="space-y-2 rounded-xl border p-4 bg-muted/10">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                Standard Quality Checklist (All Verified on Pass)
              </span>
              <div className="space-y-2">
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-2.5 text-xs cursor-pointer rounded-md p-1.5 hover:bg-muted/40 transition-colors"
                  >
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={(checked) =>
                        setChecklist((prev) =>
                          prev.map((c) =>
                            c.id === item.id ? { ...c, checked: checked === true } : c,
                          ),
                        )
                      }
                      className="mt-0.5"
                    />
                    <span className="leading-snug text-foreground/90">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Optional Inspector Notes */}
          <Field label="Inspector Notes (Optional)" htmlFor="qc-notes">
            <Input
              id="qc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Clean collar alignment, tested button snap tension"
              className="text-xs bg-background"
            />
          </Field>
        </section>

        {/* Right Column: Ready to Scan & Bench Reader Interface */}
        <section className="space-y-6">
          {/* Ready to Scan Indicator Card */}
          <div
            className={`rounded-xl border-2 p-5 shadow-xs space-y-4 transition-all ${
              isDecisionReady
                ? "border-success/60 bg-success-soft text-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  {isDecisionReady && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      isDecisionReady ? "bg-success" : "bg-muted-foreground/40"
                    }`}
                  ></span>
                </span>
                <h4 className="text-sm font-bold tracking-tight">
                  {isDecisionReady ? "Ready — Scan Garment on Scanner 6" : "Scanner 6 Disarmed (Configure Decision First)"}
                </h4>
              </div>
              <span className="font-mono text-xs font-bold uppercase px-2 py-0.5 rounded bg-background">
                {decision === "pass" ? "PASS MODE" : discardProduct ? "SCRAP MODE" : "FAIL MODE"}
              </span>
            </div>

            <p className="text-xs font-medium">
              {isDecisionReady ? (
                decision === "pass" ? (
                  <span>
                    Decision armed for <strong className="text-success font-bold">PASS &amp; RELEASE</strong>.
                    Tap shirt RFID card on Scanner 6 to verify manufacturing history and release to Packing.
                  </span>
                ) : discardProduct ? (
                  <span>
                    Decision armed for <strong className="text-destructive font-bold">SCRAP / DISCARD</strong>.
                    Tap shirt RFID card to decommission permanently from production line.
                  </span>
                ) : (
                  <span>
                    Decision armed for <strong className="text-destructive font-bold">FAIL &amp; ROUTE TO {referDept.toUpperCase()}</strong>.
                    Tap shirt RFID card to lock quality hold and send to repair queue.
                  </span>
                )
              ) : (
                <span>
                  Please select at least one defect option or type custom notes to arm Scanner 6.
                </span>
              )}
            </p>

            {/* Fast RFID Tag Input / Antenna Simulator */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              <div className="space-y-1.5">
                <label htmlFor="scan-uid-input" className="text-xs font-bold text-foreground block">
                  Garment RFID Card (Antenna Reader)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="scan-uid-input"
                      value={scanUid}
                      onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && isDecisionReady && !pending) {
                          void handleScanner6Scan(scanUid);
                        }
                      }}
                      placeholder="e.g. 04DAEBFC"
                      className="font-mono font-bold tracking-wider text-sm bg-background pl-9"
                    />
                    <Radio className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>

                  <Button
                    onClick={() => void handleScanner6Scan(scanUid)}
                    disabled={pending || !isDecisionReady || !scanUid.trim()}
                    className="gap-2 font-bold shrink-0"
                  >
                    <ScanLine className="size-4" />
                    Scan at Scanner 6
                  </Button>
                </div>
              </div>

              {/* Quick Tap Helper Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                <span className="text-muted-foreground font-medium">Quick Taps:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] font-mono gap-1"
                  onClick={() => {
                    setScanUid("04DAEBFC");
                    void handleScanner6Scan("04DAEBFC");
                  }}
                  disabled={pending || !isDecisionReady}
                >
                  <Tag className="size-2.5 text-primary" />
                  SHIRT-002 (04DAEBFC) · Awaiting QC
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] font-mono gap-1"
                  onClick={() => {
                    setScanUid("04003344");
                    void handleScanner6Scan("04003344");
                  }}
                  disabled={pending || !isDecisionReady}
                >
                  <Wrench className="size-2.5 text-destructive" />
                  SHIRT-003 (04003344) · Rework
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 text-[10px] font-mono text-destructive border-destructive/20 gap-1"
                  onClick={() => {
                    setScanUid("04A1B2C3");
                    void handleScanner6Scan("04A1B2C3");
                  }}
                  disabled={pending || !isDecisionReady}
                >
                  Raw Bundle Tag (04A1B2C3)
                </Button>
              </div>
            </div>
          </div>

          {/* Validation Logic Reference Card */}
          <div className="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="size-3.5 text-primary" />
              Scanner 6 Backend Guards &amp; Verification Rules
            </h4>
            <div className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>
                  <strong>Full Upstream Prerequisite:</strong> Garment must sequentially complete Cutting ➔ Stitching ➔ Finishing. Skipped stations trigger immediate rejection.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>
                  <strong>Single-Pass Guard:</strong> A garment that has already passed Final QC cannot be re-scanned.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>
                  <strong>Reinspection Exception:</strong> Repaired garments can be evaluated if the assigned shop recorded repair completion. Inspector cannot evaluate their own repair.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>
                  <strong>Random Card Guard:</strong> Unassigned cards or raw fabric bundle cards are rejected with no garment record found.
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
