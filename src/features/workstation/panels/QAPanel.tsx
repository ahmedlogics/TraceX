import { useState } from "react";
import { CheckCircle2, OctagonAlert, Radio, ScanLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, ScopeNote } from "@/components/wt/forms";
import { Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import type { ChecklistItem } from "@/domain/types";
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

  const isInspector = me.role === "Q" || me.department === "quality";
  const activeCtx = stationData.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === "final_qc";

  const allChecked = checklist.every((c) => c.checked);
  const canPrepare = result === "pass" ? allChecked : !!defectReason.trim();

  const resetForm = () => {
    setResult("pass");
    setDefectReason("");
    setNotes("");
    setChecklist(defaultChecklist);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Physical Inspection Decision"
          description="Physically inspect the garment, select Pass/Fail, and prepare the decision BEFORE scanning."
        >
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Inspection Outcome</p>
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
                  <CheckCircle2 className="size-4" /> Pass
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
                  <XCircle className="size-4" /> Fail & Open Hold
                </Button>
              </div>
            </div>

            {result === "fail" && (
              <Field
                label="Defect Reason (Required on Fail)"
                htmlFor="qa-defect"
                hint="Explain the defect that blocks this garment (e.g. Open seam, Broken stitch, Stained fabric)."
              >
                <Input
                  id="qa-defect"
                  value={defectReason}
                  onChange={(e) => setDefectReason(e.target.value)}
                  placeholder="e.g. Open seam at left sleeve"
                  className="border-destructive/60 bg-card"
                />
              </Field>
            )}

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Quality Checklist
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
                placeholder="Additional inspection notes..."
                className="text-xs bg-card"
              />
            </Field>

            {!isInspector && (
              <ScopeNote>
                Only quality inspectors (Role Q or Quality department) may record inspection
                decisions. Supply-chain managers have read-only oversight.
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
                      `Prepared one-use ${result.toUpperCase()} decision. Ready for board acknowledgement.`,
                    )
                  }
                >
                  <Radio className="size-4" /> Prepare QC Decision ({result.toUpperCase()})
                </Button>
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Reader Action & Scan Lifecycle"
          description="Identity resolution: scan card UID → attaches prepared decision to garment."
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Lifecycle state:</span>
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
              <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 space-y-3">
                <p className="text-sm font-medium text-warning-foreground">
                  Decision prepared (
                  {activeCtx.payload.kind === "submit_qc"
                    ? (activeCtx.payload as { result: string }).result.toUpperCase()
                    : ""}
                  ). Awaiting reader board acknowledgement.
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
                    Cancel decision
                  </Button>
                </div>
              </div>
            )}

            {isCtxForThisStation && activeCtx.status === "ready" && (
              <div className="rounded-lg border border-success/40 bg-success-soft p-4 space-y-3">
                <p className="text-sm font-medium text-success-foreground">
                  Ready to scan! Present the inspected garment&apos;s RFID card at Station 6 (Final
                  QC).
                </p>
                <p className="text-xs text-muted-foreground">
                  The scan automatically identifies the garment, finds its open inspection (or
                  reinspection), and attaches the prepared decision.
                </p>
                <div className="space-y-2">
                  <Field
                    label="Garment Card UID"
                    htmlFor="qa-scan-uid"
                    hint="UID from garment tag."
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
                            if (outcome.resolution === "accepted") {
                              resetForm();
                            }
                            return outcome;
                          },
                          (outcome) =>
                            outcome.resolution === "accepted"
                              ? `Inspection recorded for ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName})!`
                              : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                        )
                      }
                    >
                      <ScanLine className="size-4" /> Simulate RFID Scan
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
              <p className="text-sm text-muted-foreground">
                No active QC context. Choose Pass or Fail on the left and click &ldquo;Prepare QC
                Decision&rdquo;.
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
