import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  OctagonAlert,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, ScopeNote } from "@/components/wt/forms";
import { Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import type { ChecklistItem, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction } from "@/lib/data/hooks";
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

interface QcFault {
  id: string;
  label: string;
  category: "stitching" | "cutting" | "finishing";
}

const COMMON_QC_FAULTS: QcFault[] = [
  { id: "f1", label: "Broken / Skipped Stitching", category: "stitching" },
  { id: "f2", label: "Open Seam or Unraveled Hem", category: "stitching" },
  { id: "f3", label: "Stitch Tension Puckering / Tight Seams", category: "stitching" },
  { id: "f4", label: "Dimensional Tolerance Mismatch (Chest/Length)", category: "cutting" },
  { id: "f5", label: "Pattern Misalignment / Fabric Flaw", category: "cutting" },
  { id: "f6", label: "Loose / Missing Button or Defective Zipper", category: "finishing" },
  { id: "f7", label: "Care / Brand Label Misplaced or Missing", category: "finishing" },
  { id: "f8", label: "Oil / Dirt / Contamination Stain", category: "finishing" },
];

const REWORK_DEPARTMENTS: { code: string; label: string }[] = [
  { code: "cutting", label: "Cutting Department (Pattern / Cut Rework)" },
  { code: "stitching", label: "Stitching / Assembly Department (Sewing Repair)" },
  { code: "finishing", label: "Finishing & Tagging Department (Trims / Pressing)" },
];

export function QAPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [defectReason, setDefectReason] = useState("");
  const [defectComment, setDefectComment] = useState("");
  const [selectedFaults, setSelectedFaults] = useState<string[]>([]);
  const [targetDept, setTargetDept] = useState<string>("stitching");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist);
  const [scanUid, setScanUid] = useState("04DAEBFC"); // SHIRT-002 seed tag
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  const isInspector = me.role === "Q" || me.department === "quality";
  const activeCtx = stationData.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === "final_qc";

  const allPassChecked = checklist.every((c) => c.checked);
  const hasFaultSelected = selectedFaults.length > 0;
  const hasComment = defectComment.trim().length > 0 || defectReason.trim().length > 0;
  const canPrepareFail = (hasFaultSelected || hasComment) && !!targetDept;
  const canPrepare = result === "pass" ? allPassChecked : canPrepareFail;

  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  const resetForm = () => {
    setResult("pass");
    setDefectReason("");
    setDefectComment("");
    setSelectedFaults([]);
    setTargetDept("stitching");
    setNotes("");
    setChecklist(defaultChecklist);
  };

  return (
    <div className="space-y-6">
      {/* Persistent Scan Feedback Banner */}
      {lastOutcome && (
        <div
          className={`rounded-lg border p-4 shadow-sm transition-all ${
            lastOutcome.resolution === "accepted"
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex items-start gap-3">
            {lastOutcome.resolution === "accepted" ? (
              <ShieldCheck className="size-5 text-success shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {lastOutcome.resolution === "accepted"
                  ? `Inspection Successfully Recorded for ${lastOutcome.garmentCode ?? lastOutcome.subjectId}`
                  : "RFID Scan Operation Rejected"}
              </p>
              <p className="text-xs opacity-90">
                {lastOutcome.resolution === "accepted"
                  ? `Garment identified: ${lastOutcome.productName ?? "Garment"}. Decision attached and committed to audit history.`
                  : (lastOutcome.rejectReason ?? `Station rule failed: ${lastOutcome.resolution}`)}
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-muted-foreground">
                <span>UID: {lastOutcome.uid}</span>
                <span>·</span>
                <span>Timestamp: {new Date(lastOutcome.at).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Decision Preparation */}
        <Section
          title="1. Physical Inspection Decision"
          description="Examine the physical shirt, select Pass/Fail, and prepare the decision BEFORE scanning the garment's card."
        >
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Inspection Outcome
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={result === "pass" ? "default" : "outline"}
                  className={
                    result === "pass"
                      ? "border-success bg-success text-success-foreground hover:bg-success/90"
                      : ""
                  }
                  onClick={() => setResult("pass")}
                >
                  <CheckCircle2 className="size-4 mr-1.5" /> Pass & Release
                </Button>
                <Button
                  type="button"
                  variant={result === "fail" ? "default" : "outline"}
                  className={
                    result === "fail"
                      ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : ""
                  }
                  onClick={() => setResult("fail")}
                >
                  <XCircle className="size-4 mr-1.5" /> Fail & Open Hold
                </Button>
              </div>
            </div>

            {result === "fail" ? (
              <>
                {/* Rework Routing Department Dropdown */}
                <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <label htmlFor="qa-target-dept" className="block text-xs font-semibold uppercase tracking-wider text-destructive">
                    Route Rework To Department (Mandatory on Fail)
                  </label>
                  <select
                    id="qa-target-dept"
                    value={targetDept}
                    onChange={(e) => setTargetDept(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-card px-2.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {REWORK_DEPARTMENTS.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Upon card scan, this garment will appear immediately on the selected department&apos;s repair screen.
                  </p>
                </div>

                {/* Common Faults Checklist (Optional Selection) */}
                <div className="space-y-2 rounded-md border p-3 bg-card">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Common Faults Checklist (Optional)
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {selectedFaults.length} selected
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {COMMON_QC_FAULTS.map((f) => (
                      <label
                        key={f.id}
                        className={`flex items-start gap-2 text-xs cursor-pointer rounded p-1.5 transition-colors border ${
                          selectedFaults.includes(f.id)
                            ? "border-destructive/60 bg-destructive/10 text-destructive font-medium"
                            : "border-border/60 hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          checked={selectedFaults.includes(f.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedFaults((prev) => [...prev, f.id]);
                              if (f.category) setTargetDept(f.category);
                            } else {
                              setSelectedFaults((prev) => prev.filter((id) => id !== f.id));
                            }
                          }}
                        />
                        <span className="leading-tight">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Defect Comment Box */}
                <Field
                  label="Defect Details & Comment Box"
                  htmlFor="qa-defect-comment"
                  hint={
                    hasFaultSelected
                      ? "Add optional specific notes or repair details."
                      : "Mandatory if no checklist fault is selected: explain defect."
                  }
                >
                  <Textarea
                    id="qa-defect-comment"
                    rows={2}
                    value={defectComment}
                    onChange={(e) => setDefectComment(e.target.value)}
                    placeholder="e.g. Left sleeve cuff open by 3cm; restitch seam with matching thread"
                    className="text-xs bg-card border-destructive/40"
                  />
                </Field>

                {/* Mandatory Guard Notice */}
                {!hasFaultSelected && !hasComment && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                    ⚠️ <strong>Mandatory Requirement:</strong> Please select at least one fault on the checklist OR enter defect details in the comment box to prepare Fail.
                  </div>
                )}
              </>
            ) : (
              /* Pass Checklist */
              <div className="space-y-2 rounded-md border p-3 bg-card">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Garment Inspection Checklist (All Verified on Pass)
                </p>
                {checklist.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={(v) =>
                        setChecklist((prev) =>
                          prev.map((c) => (c.id === item.id ? { ...c, checked: v === true } : c)),
                        )
                      }
                    />
                    <span className="leading-tight">{item.label}</span>
                  </label>
                ))}
              </div>
            )}

            <Field label="Inspection Notes (Optional)" htmlFor="qa-notes">
              <Textarea
                id="qa-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tolerance notes, inspector comments..."
                className="text-xs bg-card"
              />
            </Field>

            {!isInspector && (
              <ScopeNote>
                Only certified quality inspectors (Role Q or Quality dept) can prepare and record
                inspection decisions. Managers have read-only oversight.
              </ScopeNote>
            )}

            {isInspector && (
              <div className="pt-2">
                <Button
                  disabled={
                    pending ||
                    !canPrepare ||
                    (isCtxForThisStation && activeCtx.status !== "expired")
                  }
                  onClick={() => {
                    const selectedLabels = COMMON_QC_FAULTS.filter((f) =>
                      selectedFaults.includes(f.id),
                    ).map((f) => f.label);
                    let finalDefect = selectedLabels.join(", ");
                    if (defectComment.trim()) {
                      finalDefect = finalDefect
                        ? `${finalDefect} — ${defectComment.trim()}`
                        : defectComment.trim();
                    } else if (defectReason.trim()) {
                      finalDefect = finalDefect
                        ? `${finalDefect} — ${defectReason.trim()}`
                        : defectReason.trim();
                    }

                    return void run(
                      (c) =>
                        c.prepareActionContext("final_qc", "submit_qc", {
                          kind: "submit_qc",
                          result,
                          scope: "final",
                          defectReason: result === "fail" ? finalDefect : undefined,
                          assignedDepartment: result === "fail" ? targetDept : undefined,
                          faults: selectedFaults,
                          notes: notes.trim(),
                          checklist:
                            result === "pass"
                              ? checklist
                              : selectedLabels.map((l, i) => ({
                                  id: `f-${i}`,
                                  label: l,
                                  checked: true,
                                })),
                        }),
                      `Prepared one-use ${result.toUpperCase()} decision${
                        result === "fail" ? ` (routed to ${targetDept})` : ""
                      }. Ready for reader board card scan.`,
                    );
                  }}
                  className="w-full sm:w-auto"
                >
                  <Radio className="size-4 mr-1.5" /> Prepare QC Decision ({result.toUpperCase()})
                </Button>
              </div>
            )}
          </div>
        </Section>

        {/* Right: Reader Action & Lifecycle */}
        <Section
          title="2. Reader Action & Scan Lifecycle"
          description="Identity resolution: card tap resolves garment UID and binds the prepared decision atomically."
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Lifecycle State:</span>
              {isCtxForThisStation ? (
                <StatusBadge
                  status={activeCtx.status}
                  tone={
                    activeCtx.status === "ready"
                      ? "success"
                      : activeCtx.status === "awaiting_ack"
                        ? "warning"
                        : activeCtx.status === "confirmed"
                          ? "success"
                          : "neutral"
                  }
                />
              ) : (
                <StatusBadge status="idle" tone="neutral" />
              )}
            </div>

            {isCtxForThisStation && activeCtx.status === "awaiting_ack" && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 space-y-3">
                <p className="text-sm font-medium text-warning-foreground">
                  Decision prepared (
                  {activeCtx.payload.kind === "submit_qc"
                    ? (activeCtx.payload as { result: string }).result.toUpperCase()
                    : ""}
                  ). Awaiting ESP32 reader board acknowledgement.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run(
                        (c) => c.acknowledgeContext(activeCtx.id),
                        "Reader board acknowledged context.",
                      )
                    }
                  >
                    Simulate Board Acknowledgment
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run((c) => c.cancelContext(activeCtx.id), "Context cancelled.")
                    }
                  >
                    Cancel Decision
                  </Button>
                </div>
              </div>
            )}

            {isCtxForThisStation && activeCtx.status === "ready" && (
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 space-y-3">
                <p className="text-sm font-medium text-success-foreground">
                  Ready to scan! Present the inspected garment&apos;s RFID card at Station 6 (Final
                  QC).
                </p>
                <p className="text-xs text-muted-foreground">
                  The physical scan automatically identifies the garment, resolves whether this is a
                  final inspection or reinspection, and attaches the prepared decision atomically.
                </p>
                <div className="space-y-2">
                  <Field
                    label="Garment Card UID"
                    htmlFor="qa-scan-uid"
                    hint="UID read by RC522 antenna."
                  >
                    <Input
                      id="qa-scan-uid"
                      value={scanUid}
                      onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                      className="font-mono bg-card"
                      placeholder="e.g. 04DAEBFC"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      disabled={pending || !scanUid.trim()}
                      onClick={() =>
                        void run(
                          async (c) => {
                            const outcome = await c.resolveRfidScan(scanUid.trim());
                            setLocalLastOutcome(outcome);
                            if (outcome.resolution === "accepted") {
                              resetForm();
                            }
                            return outcome;
                          },
                          (outcome) =>
                            outcome.resolution === "accepted"
                              ? `Inspection confirmed for ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName})!`
                              : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                        )
                      }
                    >
                      <ScanLine className="size-4 mr-1.5" /> Simulate RFID Scan
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        void run((c) => c.cancelContext(activeCtx.id), "Context cancelled.")
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!isCtxForThisStation && (
              <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                No active QC context armed. To inspect a shirt, select Pass or Fail on the left and
                click &ldquo;Prepare QC Decision&rdquo;.
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
