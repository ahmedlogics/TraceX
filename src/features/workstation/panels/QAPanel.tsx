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

export function QAPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [defectReason, setDefectReason] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist);
  const [scanUid, setScanUid] = useState("04DAEBFC"); // SHIRT-002 seed tag
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  const isInspector = me.role === "Q" || me.department === "quality";
  const activeCtx = stationData.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === "final_qc";

  const allChecked = checklist.every((c) => c.checked);
  const canPrepare = result === "pass" ? allChecked : !!defectReason.trim();

  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  const resetForm = () => {
    setResult("pass");
    setDefectReason("");
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

            {result === "fail" && (
              <Field
                label="Defect Code & Reason (Mandatory on Fail)"
                htmlFor="qa-defect"
                hint="Explain the defect that blocks this garment (e.g. Open seam, stitch tension fault, fabric flaw)."
              >
                <Input
                  id="qa-defect"
                  value={defectReason}
                  onChange={(e) => setDefectReason(e.target.value)}
                  placeholder="e.g. Open seam at left sleeve cuff"
                  className="border-destructive/60 bg-card"
                />
              </Field>
            )}

            <div className="space-y-2 rounded-md border p-3 bg-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Garment Inspection Checklist
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

            <Field label="Notes (Optional)" htmlFor="qa-notes">
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
                  onClick={() =>
                    void run(
                      (c) =>
                        c.prepareActionContext("final_qc", "submit_qc", {
                          kind: "submit_qc",
                          result,
                          defectReason: result === "fail" ? defectReason.trim() : undefined,
                          checklist,
                          notes: notes.trim(),
                        }),
                      `Prepared one-use ${result.toUpperCase()} decision. Ready for reader board acknowledgement.`,
                    )
                  }
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
