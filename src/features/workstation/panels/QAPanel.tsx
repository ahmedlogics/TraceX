import { useEffect, useMemo, useRef, useState } from "react";
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
import { Field } from "@/components/wt/forms";
import type { ChecklistItem, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode } from "@/lib/data/provider";
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

interface ConfirmedInspection {
  type: "passed" | "failed" | "discarded" | "rejected";
  title: string;
  message: string;
  garmentCode?: string | undefined;
  productStyle?: string | undefined;
  loggedDefect?: string | undefined;
  assignedDepartment?: string | undefined;
  rfidUid?: string | undefined;
  timestamp: string;
}

export function QAPanel({
  stationData,
  onScanComplete,
}: {
  stationData: RfidStationData;
  onScanComplete?: () => void;
}) {
  const me = useMe();
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  // Decision State: "pass" | "fail" | null (strictly null / none selected as default)
  const [decision, setDecision] = useState<"pass" | "fail" | null>(null);

  // Defect Configuration State (when decision === "fail")
  const [selectedDefects, setSelectedDefects] = useState<string[]>([]);
  const [customComment, setCustomComment] = useState("");
  const [referDept, setReferDept] = useState<"cutting" | "stitching" | "finishing">("stitching");
  const [discardProduct, setDiscardProduct] = useState(false);

  // General notes & checklist
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist);

  // Hardware Armed State
  const [isWaitingForHardwareScan, setIsWaitingForHardwareScan] = useState(false);
  const [armedContextId, setArmedContextId] = useState<string | null>(null);

  // Runtime Confirmed Outcome Banner (displays dynamically on dashboard upon hardware scan)
  const [confirmedOutcome, setConfirmedOutcome] = useState<ConfirmedInspection | null>(null);

  // Validation:
  // For Fail: Must select at least one common defect OR enter custom comment.
  // Must select refer department unless discard is selected.
  const hasDefectSelection = selectedDefects.length > 0;
  const hasCustomComment = customComment.trim().length > 0;
  const isFailConfigValid =
    (hasDefectSelection || hasCustomComment) && (discardProduct || Boolean(referDept));
  const isDecisionReady =
    decision === "pass" ? checklist.every((c) => c.checked) : decision === "fail" && isFailConfigValid;

  const resetForm = () => {
    setDecision(null);
    setSelectedDefects([]);
    setCustomComment("");
    setReferDept("stitching");
    setDiscardProduct(false);
    setNotes("");
    setChecklist(defaultChecklist);
    setIsWaitingForHardwareScan(false);
    setArmedContextId(null);
  };

  // Compile defect reason
  const computedDefectReason = useMemo(() => {
    const selectedLabels = COMMON_DEFECT_OPTIONS.filter((d) => selectedDefects.includes(d.id)).map(
      (d) => d.label,
    );
    let reason = selectedLabels.join(", ");
    if (customComment.trim()) {
      reason = reason ? `${reason} — ${customComment.trim()}` : customComment.trim();
    }
    if (discardProduct) {
      reason = `[SCRAP/DISCARD] ${reason || "Defect beyond repair"}`;
    }
    return reason;
  }, [selectedDefects, customComment, discardProduct]);

  // Step 1: Submit Inspection Decision -> Arms Scanner 6 action context in backend
  const handleSubmitDecision = async () => {
    if (!decision || !isDecisionReady) return;

    try {
      const selectedLabels = COMMON_DEFECT_OPTIONS.filter((d) => selectedDefects.includes(d.id)).map(
        (d) => d.label,
      );

      const ctxId = await run((c) =>
        c.prepareActionContext("final_qc", "submit_qc", {
          kind: "submit_qc",
          result: decision,
          scope: "final",
          defectReason: decision === "fail" ? computedDefectReason : undefined,
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
        setConfirmedOutcome({
          type: "rejected",
          title: "Hardware Context Error",
          message: "Failed to arm Scanner 6 action context. Please verify reader connectivity.",
          timestamp: new Date().toLocaleTimeString(),
        });
        return;
      }

      await run((c) => c.acknowledgeContext(ctxId));
      setArmedContextId(ctxId);
      setIsWaitingForHardwareScan(true);
    } catch (err: any) {
      setConfirmedOutcome({
        type: "rejected",
        title: "Context Preparation Failed",
        message: err?.message || "Internal error preparing QC action context.",
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  };

  // Step 2: Handle incoming hardware scan from Scanner 6
  const handleProcessHardwareScan = async (rawUid: string) => {
    const uid = rawUid.trim().toUpperCase();
    if (!uid) return;

    try {
      const outcome = await run((c) => c.resolveRfidScan(uid));

      if (!outcome) {
        setConfirmedOutcome({
          type: "rejected",
          title: "Scan Incomplete",
          message: "Scan transaction could not be processed by station engine.",
          rfidUid: uid,
          timestamp: new Date().toLocaleTimeString(),
        });
        setIsWaitingForHardwareScan(false);
        return;
      }

      if (outcome.resolution === "accepted") {
        if (discardProduct) {
          setConfirmedOutcome({
            type: "discarded",
            title: `Product Scrapped: ${outcome.garmentCode ?? outcome.subjectId}`,
            message: "Product Scrapped / Discarded → Decommissioned permanently from line",
            garmentCode: outcome.garmentCode ?? outcome.subjectId,
            productStyle: outcome.productName,
            loggedDefect: computedDefectReason,
            rfidUid: uid,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else if (decision === "pass") {
          setConfirmedOutcome({
            type: "passed",
            title: `Inspection Passed: ${outcome.garmentCode ?? outcome.subjectId}`,
            message: "Inspection Passed → Released to Station 7 (Packing)",
            garmentCode: outcome.garmentCode ?? outcome.subjectId,
            productStyle: outcome.productName,
            rfidUid: uid,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else {
          setConfirmedOutcome({
            type: "failed",
            title: `Defect Registered: ${outcome.garmentCode ?? outcome.subjectId}`,
            message: `Defect Registered → Put on Quality Hold and routed to ${referDept.toUpperCase()} Repair`,
            garmentCode: outcome.garmentCode ?? outcome.subjectId,
            productStyle: outcome.productName,
            loggedDefect: computedDefectReason,
            assignedDepartment: referDept,
            rfidUid: uid,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        void qGarments.refetch();
        onScanComplete?.();
        resetForm();
      } else {
        setConfirmedOutcome({
          type: "rejected",
          title: "Hardware Scan Rejected",
          message: outcome.rejectReason || `Station rule violated: ${outcome.resolution}`,
          rfidUid: uid,
          timestamp: new Date().toLocaleTimeString(),
        });
        setIsWaitingForHardwareScan(false);
      }
    } catch (err: any) {
      setConfirmedOutcome({
        type: "rejected",
        title: "Scan Exception",
        message: err?.message || "Internal error resolving inspection scan.",
        rfidUid: uid,
        timestamp: new Date().toLocaleTimeString(),
      });
      setIsWaitingForHardwareScan(false);
    }
  };

  // Poll hardware station data for Station 6 (final_qc)
  const qStation = useWtQuery(
    ["rfid-station", "final_qc"],
    (c) => c.getRfidStationData("final_qc"),
    {
      enabled: isWaitingForHardwareScan,
      refetchInterval: 1000,
    },
  );

  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isWaitingForHardwareScan) return;
    const outcome = qStation.data?.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      if (outcome.uid) {
        void handleProcessHardwareScan(outcome.uid);
      }
    }
  }, [isWaitingForHardwareScan, qStation.data?.lastScanOutcome]);

  // Global USB Keyboard Wedge RFID reader listener for Scanner 6 hardware
  useEffect(() => {
    if (!isWaitingForHardwareScan) return;
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      const now = Date.now();
      if (now - lastKeyTime > 500) {
        buffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        const scanned = buffer.trim().toUpperCase();
        buffer = "";
        if (scanned.length >= 4 && /^[0-9A-F]+$/i.test(scanned)) {
          e.preventDefault();
          void handleProcessHardwareScan(scanned);
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWaitingForHardwareScan]);

  return (
    <div className="space-y-5">
      {/* Dynamic Runtime Confirmed Inspection Banner */}
      {confirmedOutcome && (
        <div
          className={`rounded-xl border p-4 shadow-xs transition-all animate-in fade-in duration-200 ${
            confirmedOutcome.type === "passed"
              ? "border-success/60 bg-success-soft text-foreground"
              : confirmedOutcome.type === "failed"
                ? "border-destructive/60 bg-danger-soft text-foreground"
                : confirmedOutcome.type === "discarded"
                  ? "border-amber-500/60 bg-amber-500/10 text-foreground"
                  : "border-destructive/60 bg-danger-soft text-foreground"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {confirmedOutcome.type === "passed" && <ShieldCheck className="size-5 text-success" />}
                {confirmedOutcome.type === "failed" && <ShieldAlert className="size-5 text-destructive" />}
                {confirmedOutcome.type === "discarded" && (
                  <Trash2 className="size-5 text-amber-600 dark:text-amber-400" />
                )}
                {confirmedOutcome.type === "rejected" && <XCircle className="size-5 text-destructive" />}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold tracking-tight text-foreground">
                    {confirmedOutcome.title}
                  </h4>
                  {confirmedOutcome.rfidUid && (
                    <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-background border">
                      RFID: {confirmedOutcome.rfidUid}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium">{confirmedOutcome.message}</p>

                {(confirmedOutcome.garmentCode ||
                  confirmedOutcome.productStyle ||
                  confirmedOutcome.loggedDefect ||
                  confirmedOutcome.assignedDepartment) && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1.5 border-t border-border/40">
                    {confirmedOutcome.garmentCode && (
                      <span>
                        Garment: <strong className="text-foreground font-mono">{confirmedOutcome.garmentCode}</strong>
                      </span>
                    )}
                    {confirmedOutcome.productStyle && (
                      <span>
                        Product: <strong className="text-foreground">{confirmedOutcome.productStyle}</strong>
                      </span>
                    )}
                    {confirmedOutcome.assignedDepartment && (
                      <span>
                        Assigned Dept:{" "}
                        <strong className="text-destructive uppercase font-bold">
                          {confirmedOutcome.assignedDepartment}
                        </strong>
                      </span>
                    )}
                    {confirmedOutcome.loggedDefect && (
                      <span>
                        Defect: <strong className="text-destructive">{confirmedOutcome.loggedDefect}</strong>
                      </span>
                    )}
                    <span className="text-muted-foreground">Logged at {confirmedOutcome.timestamp}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfirmedOutcome(null)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 cursor-pointer"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Inspection Workflow: Either waiting for hardware scan, or showing pass/fail decision form */}
      {isWaitingForHardwareScan ? (
        /* Hardware Scanner 6 Active Listening Beacon */
        <div className="rounded-xl border-2 border-primary/60 bg-primary/5 p-8 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="inline-flex items-center justify-center size-16 rounded-full bg-primary/10 text-primary mx-auto ring-8 ring-primary/5">
            <Radio className="size-8 animate-pulse text-primary" />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Scanner 6 Hardware Listening
            </span>
            <h3 className="text-lg font-bold text-foreground">
              Scan Garment Tag on Scanner 6 Hardware
            </h3>
            <p className="text-xs text-muted-foreground">
              {decision === "pass" ? (
                <span>
                  Decision armed: <strong className="text-success font-bold">PASS &amp; RELEASE</strong>.
                  Present the physical garment tag to Scanner 6 to verify history and advance to packing.
                </span>
              ) : discardProduct ? (
                <span>
                  Decision armed: <strong className="text-destructive font-bold">SCRAP / DISCARD</strong>.
                  Present the physical garment tag to Scanner 6 to permanently decommission it.
                </span>
              ) : (
                <span>
                  Decision armed:{" "}
                  <strong className="text-destructive font-bold">
                    FAIL → ROUTE TO {referDept.toUpperCase()}
                  </strong>
                  . Present the physical garment tag to Scanner 6 to lock hold and assign to rework.
                </span>
              )}
            </p>
          </div>

          <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsWaitingForHardwareScan(false);
                setArmedContextId(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel / Modify Decision
            </Button>

            {/* Discreet simulator button for testing environments without physical USB reader */}
            {isMock && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleProcessHardwareScan("04DAEBFC")}
                className="text-[11px] text-muted-foreground/60 hover:text-foreground cursor-pointer"
                title="Simulate tag scan for development test"
              >
                (Dev: Simulate Tag 04DAEBFC)
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Evaluation Decision Form */
        <div className="space-y-5">
          {/* Step 1: Pass / Fail Evaluation Status Toggle (None selected by default) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Step 1: Physical Examination Decision
              </label>
              {decision === null && (
                <span className="text-xs text-muted-foreground italic">
                  Select Pass or Fail to begin
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setDecision("pass");
                  setSelectedDefects([]);
                  setCustomComment("");
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-5 text-center transition-all cursor-pointer ${
                  decision === "pass"
                    ? "border-success bg-success-soft text-success shadow-xs font-bold ring-2 ring-success/20"
                    : "border-border bg-card text-muted-foreground hover:border-success/40 hover:bg-success-soft/20"
                }`}
              >
                <CheckCircle2
                  className={`size-8 ${decision === "pass" ? "text-success" : "text-muted-foreground"}`}
                />
                <div>
                  <span className="text-sm font-bold block text-foreground">Pass &amp; Release</span>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    Garment meets all quality standards
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDecision("fail")}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-5 text-center transition-all cursor-pointer ${
                  decision === "fail"
                    ? "border-destructive bg-danger-soft text-destructive shadow-xs font-bold ring-2 ring-destructive/20"
                    : "border-border bg-card text-muted-foreground hover:border-destructive/40 hover:bg-danger-soft/20"
                }`}
              >
                <XCircle
                  className={`size-8 ${decision === "fail" ? "text-destructive" : "text-muted-foreground"}`}
                />
                <div>
                  <span className="text-sm font-bold block text-foreground">Fail &amp; Route</span>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    Defect found: requires repair or discard
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Conditional Sub-View: When PASS is selected */}
          {decision === "pass" && (
            <div className="space-y-4 rounded-xl border border-success/30 bg-success-soft/30 p-5 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between border-b border-success/20 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-success flex items-center gap-1.5">
                  <ShieldCheck className="size-4" />
                  Pass Criteria &amp; Inspector Sign-Off
                </span>
                <span className="text-[11px] text-success font-semibold">Standard Quality Gate</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-2.5 text-xs cursor-pointer rounded-md p-2 bg-background/80 border border-success/20 hover:bg-background transition-colors"
                  >
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={(checked) =>
                        setChecklist((prev) =>
                          prev.map((c) => (c.id === item.id ? { ...c, checked: checked === true } : c)),
                        )
                      }
                      className="mt-0.5"
                    />
                    <span className="leading-snug text-foreground/90 font-medium">{item.label}</span>
                  </label>
                ))}
              </div>

              <Field label="Inspector Notes (Optional)" htmlFor="qc-notes">
                <Input
                  id="qc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Clean seams, measurements verified within tolerance"
                  className="text-xs bg-background"
                />
              </Field>

              <div className="pt-2 flex justify-end">
                <Button
                  onClick={() => void handleSubmitDecision()}
                  disabled={pending || !isDecisionReady}
                  className="bg-success text-success-foreground hover:bg-success/90 font-bold px-6 gap-2 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="size-4" />
                  Submit Pass Decision &amp; Arm Scanner 6
                </Button>
              </div>
            </div>
          )}

          {/* Conditional Sub-View: When FAIL is selected */}
          {decision === "fail" && (
            <div className="space-y-4 rounded-xl border-2 border-destructive/30 bg-muted/10 p-5 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                  <ShieldAlert className="size-4" />
                  Defect Details &amp; Routing
                </span>
                <span className="text-[11px] text-muted-foreground font-semibold">
                  {selectedDefects.length > 0
                    ? `${selectedDefects.length} defect(s) selected`
                    : "At least one option or description required"}
                </span>
              </div>

              {/* Common Defect Options (Optional to select from common problems) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground block">
                  Common Defect Options (Optional Quick Select)
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                        className={`text-left text-xs p-2 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
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
                    ? "Optional additional notes explaining specific repair instructions."
                    : "Mandatory if no common defect is selected above: describe the fault."
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

              {/* Discard Product Option */}
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5">
                <Checkbox
                  id="discard-toggle"
                  checked={discardProduct}
                  onCheckedChange={(checked) => setDiscardProduct(checked === true)}
                  className="mt-0.5 cursor-pointer"
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
                    Check if the defect is beyond repair. Bypasses department repair routing and permanently decommissions the garment.
                  </p>
                </div>
              </div>

              {/* Refer Department Dropdown (Hidden/Not needed on Discard Product) */}
              {!discardProduct && (
                <div className="space-y-1.5">
                  <label htmlFor="refer-dept" className="text-xs font-bold text-foreground block">
                    Refer Department (Mandatory for Rework Routing)
                  </label>
                  <select
                    id="refer-dept"
                    value={referDept}
                    onChange={(e) => setReferDept(e.target.value as any)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  >
                    {REFER_DEPARTMENTS.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Upon hardware tag scan, this garment will immediately appear on the selected department&apos;s repair screen.
                  </p>
                </div>
              )}

              {/* Validation Warning if incomplete */}
              {!isFailConfigValid && (
                <div className="rounded-md border border-destructive/40 bg-danger-soft p-2.5 text-xs text-destructive font-medium flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>
                    Select at least one common defect option OR type in the custom defect detail box to submit.
                  </span>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <Button
                  onClick={() => void handleSubmitDecision()}
                  disabled={pending || !isDecisionReady}
                  variant="destructive"
                  className="font-bold px-6 gap-2 cursor-pointer shadow-xs"
                >
                  <ShieldAlert className="size-4" />
                  Submit Fail Decision &amp; Arm Scanner 6
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
