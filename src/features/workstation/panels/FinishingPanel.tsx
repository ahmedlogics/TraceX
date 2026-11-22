import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  Hammer,
  HelpCircle,
  Info,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Wrench,
  XCircle,
} from "lucide-react";
import { paths } from "@/app/paths";
import { AppLink } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { Garment, ReworkCase } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

export function FinishingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();

  // Mode switcher: "production" (Routine Throughput) | "rework" (Repair Queue)
  const [activeMode, setActiveMode] = useState<"production" | "rework">("production");
  const [scanUid, setScanUid] = useState("");
  const [reworkSearch, setReworkSearch] = useState("");
  const [repairNote, setRepairNote] = useState("Re-pressed front placket with steam cloth; trimmed all loose thread ends.");
  const [activeRepairCase, setActiveRepairCase] = useState<ReworkCase | null>(null);

  // Queries
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 3000 });
  const qTasks = useWtQuery(["tasks"], (c) => c.listTasks(), { refetchInterval: 3000 });
  const qRework = useWtQuery(["rework"], (c) => c.listRework(), { refetchInterval: 3000 });

  const isAuthorized = me.role === "M" || me.department === "finishing";

  return (
    <Loadable query={qGarments}>
      {(garments) => (
        <Loadable query={qTasks}>
          {(tasks) => (
            <Loadable query={qRework}>
              {(allRework) => {
                // Filter production queue (garments at stitching, finishing, or recently advanced)
                const productionQueue = garments.filter(
                  (g) => (g.stage === "finishing" || g.stage === "final-qc") && !g.hold,
                );

                // Filter rework queue specifically assigned to finishing
                const finishingRework = allRework.filter(
                  (r) =>
                    r.assignedDepartment === "finishing" ||
                    (r.status === "assigned" && r.defectReason.toLowerCase().includes("finish")) ||
                    (r.status === "assigned" && r.defectReason.toLowerCase().includes("thread")) ||
                    (r.status === "assigned" && r.defectReason.toLowerCase().includes("press")),
                );

                const activeRepairsCount = finishingRework.filter((r) => r.status === "assigned").length;
                const awaitingReinspectionCount = finishingRework.filter((r) => r.status === "repaired").length;

                // Most recent scan feedback from station data
                const lastOutcome = stationData.lastScanOutcome;

                return (
                  <div className="space-y-6">
                    {/* Mode Navigation Tabs */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-3">
                      <div className="flex items-center gap-2">
                        <Tabs
                          value={activeMode}
                          onValueChange={(v) => setActiveMode(v as "production" | "rework")}
                          className="w-full sm:w-auto"
                        >
                          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                            <TabsTrigger value="production" className="flex items-center gap-2 text-xs font-semibold">
                              <Sparkles className="size-3.5 text-primary" />
                              <span>Production Dashboard</span>
                              <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                                {productionQueue.length}
                              </span>
                            </TabsTrigger>
                            <TabsTrigger value="rework" className="flex items-center gap-2 text-xs font-semibold">
                              <Wrench className="size-3.5 text-warning" />
                              <span>Repair & Rework Queue</span>
                              {activeRepairsCount > 0 && (
                                <span className="rounded-full bg-warning/20 text-warning px-1.5 py-0.2 text-[10px] font-bold">
                                  {activeRepairsCount}
                                </span>
                              )}
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>

                      {/* Station & Hardware Status Pill */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-success-foreground font-medium">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                          </span>
                          <span>Bench Scanner Active: GPIO 16 (Reader 5)</span>
                        </div>
                        <div className="text-muted-foreground">
                          Operator: <span className="font-semibold text-foreground">{me.displayName}</span> ({me.department})
                        </div>
                      </div>
                    </div>

                    {/* Durable Live Scan Feedback Box */}
                    {lastOutcome && (
                      <div
                        className={`rounded-lg border p-4 text-xs transition-all duration-200 shadow-xs ${
                          lastOutcome.resolution === "accepted"
                            ? "border-success/40 bg-success-soft text-success-foreground"
                            : "border-destructive/40 bg-danger-soft text-destructive-foreground"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {lastOutcome.resolution === "accepted" ? (
                            <CheckCircle2 className="size-5 shrink-0 text-success mt-0.5" />
                          ) : (
                            <XCircle className="size-5 shrink-0 text-destructive mt-0.5" />
                          )}
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-bold text-sm">
                                {lastOutcome.resolution === "accepted"
                                  ? "Finishing completed → Advanced to Final QC"
                                  : `Scan Blocked: ${lastOutcome.rejectReason || lastOutcome.resolution}`}
                              </p>
                              <span className="text-[11px] opacity-75 font-mono">{fmt.dateTime(lastOutcome.at)}</span>
                            </div>
                            <p className="text-xs">
                              <span className="font-semibold">Garment:</span>{" "}
                              <span className="font-mono">{lastOutcome.garmentCode || lastOutcome.subjectId}</span>
                              {lastOutcome.productName && ` · ${lastOutcome.productName}`} ·{" "}
                              <span className="font-semibold">Card UID:</span>{" "}
                              <span className="font-mono">{lastOutcome.uid}</span>
                            </p>
                            {lastOutcome.resolution !== "accepted" && (
                              <p className="text-[11px] font-medium text-destructive mt-1">
                                Operational Rule: Garment must have completed stitching and have no active quality holds.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ------------------------------------------------------------- */}
                    {/* MODE 1: NORMAL PRODUCTION DASHBOARD                           */}
                    {/* ------------------------------------------------------------- */}
                    {activeMode === "production" && (
                      <div className="space-y-6">
                        <div className="grid gap-6 lg:grid-cols-2">
                          {/* Continuous Reader & Quick Tap Bench */}
                          <Section
                            title="Station 5 / S4 · Finishing Bench Scanner"
                            description="Continuous RFID ingestion for trimming, pressing, buttoning, and garment completion."
                          >
                            <div className="space-y-4">
                              <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                    </span>
                                    <p className="text-sm font-semibold text-foreground">Continuous Routine Reader Active</p>
                                  </div>
                                  <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                    GPIO 16 · Reader 5
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  No per-shirt paperwork required. Present any assembled garment card at the bench antenna.
                                  Advancement: <span className="font-semibold text-foreground">finishing</span> &rarr;{" "}
                                  <span className="font-semibold text-foreground">final-qc</span>.
                                </p>

                                {!isAuthorized ? (
                                  <ScopeNote>
                                    Only finishing department operators or managers can record finishing routine scans.
                                  </ScopeNote>
                                ) : (
                                  <div className="pt-2 space-y-3">
                                    <Field
                                      label="Garment Card RFID UID"
                                      htmlFor="finishing-uid-input"
                                      hint="Automatically populated upon physical reader tap, or enter manually."
                                    >
                                      <Input
                                        id="finishing-uid-input"
                                        value={scanUid}
                                        onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                        className="font-mono bg-card"
                                        placeholder="e.g. 04001122 or 04A1B2C3D4E5F6"
                                      />
                                    </Field>

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      <Button
                                        disabled={pending || !scanUid.trim()}
                                        onClick={() =>
                                          void run(
                                            (c) => c.routineScan(scanUid.trim(), "finishing"),
                                            (outcome) => {
                                              if (outcome.resolution === "accepted") {
                                                setScanUid("");
                                                return `Garment ${outcome.garmentCode ?? outcome.subjectId} recorded at Finishing. Advanced to Final QC.`;
                                              }
                                              return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
                                            },
                                          )
                                        }
                                      >
                                        <ScanLine className="size-4 mr-1.5" /> Record Routine Scan
                                      </Button>

                                      {productionQueue.find((g) => g.stage === "finishing" && g.rfidUid) && (
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          disabled={pending}
                                          onClick={() => {
                                            const next = productionQueue.find((g) => g.stage === "finishing" && g.rfidUid);
                                            if (next?.rfidUid) setScanUid(next.rfidUid);
                                          }}
                                        >
                                          Pre-fill Next ({productionQueue.find((g) => g.stage === "finishing" && g.rfidUid)?.id})
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Station Safety Guards Callout */}
                              <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-xs text-muted-foreground">
                                <p className="font-semibold text-foreground flex items-center gap-1.5">
                                  <ShieldCheck className="size-3.5 text-primary" /> Active Safety Guards:
                                </p>
                                <p>&bull; <strong className="text-foreground">Stitching Guard:</strong> Blocks any garment that has not completed stitching.</p>
                                <p>&bull; <strong className="text-foreground">Quality Hold Guard:</strong> Blocks any garment with an active Quality Hold.</p>
                                <p>&bull; <strong className="text-foreground">Duplicate Suppression:</strong> Suppresses repeated reads to prevent duplicate records.</p>
                              </div>
                            </div>
                          </Section>

                          {/* Work Queue & Active Ingestion Table */}
                          <Section
                            title="Finishing Work Queue"
                            description="Garments currently awaiting or completed at the finishing station."
                          >
                            <DataTable
                              rows={productionQueue}
                              rowKey={(g) => g.id}
                              empty="No garments currently awaiting finishing."
                              columns={[
                                {
                                  header: "Garment ID",
                                  cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                                },
                                {
                                  header: "Product & Size",
                                  cell: (g) => (
                                    <div>
                                      <p className="font-medium text-xs sm:text-sm">{g.productName}</p>
                                      {g.size && (
                                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold mt-0.5">
                                          Size {g.size}
                                        </span>
                                      )}
                                    </div>
                                  ),
                                },
                                {
                                  header: "Active RFID Tag",
                                  cell: (g) =>
                                    g.rfidUid ? (
                                      <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                        {g.rfidUid}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs italic">Unbound</span>
                                    ),
                                },
                                {
                                  header: "Physical Stage",
                                  cell: (g) => <StatusBadge status={g.stage} />,
                                },
                                {
                                  header: "Quality",
                                  cell: (g) => (
                                    <div className="flex items-center gap-1">
                                      <StatusBadge status={g.disposition} />
                                      {g.hold && <HoldBadge />}
                                    </div>
                                  ),
                                },
                                {
                                  header: "Quick Scan",
                                  cell: (g) => {
                                    if (g.stage !== "finishing") {
                                      return (
                                        <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                                          <CheckCircle2 className="size-3 text-success" /> Completed
                                        </span>
                                      );
                                    }
                                    if (g.hold) {
                                      return (
                                        <span className="text-xs text-destructive font-medium flex items-center gap-1">
                                          <ShieldAlert className="size-3" /> On Hold
                                        </span>
                                      );
                                    }
                                    if (!g.rfidUid) {
                                      return (
                                        <span className="text-xs text-warning font-medium">No Card</span>
                                      );
                                    }
                                    return (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs font-semibold border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 shadow-2xs"
                                        disabled={pending || !isAuthorized}
                                        onClick={() =>
                                          void run(
                                            (c) => c.routineScan(g.rfidUid!, "finishing"),
                                            (outcome) =>
                                              outcome.resolution === "accepted"
                                                ? `Garment ${outcome.garmentCode ?? outcome.subjectId} completed at Finishing → Advanced to Final QC.`
                                                : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                          )
                                        }
                                      >
                                        <ScanLine className="size-3 mr-1" /> Tap Card / Complete
                                      </Button>
                                    );
                                  },
                                },
                              ]}
                            />
                          </Section>
                        </div>
                      </div>
                    )}

                    {/* ------------------------------------------------------------- */}
                    {/* MODE 2: FINISHING REPAIR & REWORK QUEUE (QC FAILURE FLOW)     */}
                    {/* ------------------------------------------------------------- */}
                    {activeMode === "rework" && (
                      <div className="space-y-6">
                        {/* Quality Hold Visual Banner */}
                        <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-warning-foreground">
                          <div className="flex items-start gap-3">
                            <ShieldAlert className="size-5 shrink-0 text-warning mt-0.5" />
                            <div className="space-y-1">
                              <h4 className="font-bold text-sm">Quality Hold Active — Dispatch & Packing Blocked</h4>
                              <p className="text-xs opacity-90">
                                All items in this queue failed Final QC inspection (Station 6) due to finishing defects.
                                Physical transfer to packing, warehouse, or customer shipping is locked by factory policy
                                until corrective repairs are recorded and an independent QC Inspector performs reinspection.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Rework Metrics & Search Bar */}
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="rounded-lg border bg-card p-3.5 shadow-2xs">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Assigned to Finishing
                            </p>
                            <p className="text-2xl font-bold mt-1 text-foreground">{finishingRework.length}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Total QC defect cases routed here</p>
                          </div>
                          <div className="rounded-lg border bg-card p-3.5 shadow-2xs">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Under Repair
                            </p>
                            <p className="text-2xl font-bold mt-1 text-warning">{activeRepairsCount}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting physical operator correction</p>
                          </div>
                          <div className="rounded-lg border bg-card p-3.5 shadow-2xs">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Awaiting Reinspection
                            </p>
                            <p className="text-2xl font-bold mt-1 text-accent-foreground">{awaitingReinspectionCount}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Repaired — queued for Station 6 QC</p>
                          </div>
                        </div>

                        {/* Repair Queue Table */}
                        <Section
                          title="Finishing Defect Rework Queue"
                          description="Review defect notations from Quality Control, perform corrective trimming or pressing, and submit repair records."
                        >
                          <div className="mb-4">
                            <Input
                              value={reworkSearch}
                              onChange={(e) => setReworkSearch(e.target.value)}
                              placeholder="Search by Garment ID, Rework Case ID, or Defect Reason..."
                              className="max-w-md text-xs bg-card"
                            />
                          </div>

                          <DataTable
                            rows={finishingRework.filter((r) => {
                              if (!reworkSearch.trim()) return true;
                              const s = reworkSearch.toLowerCase();
                              return (
                                r.id.toLowerCase().includes(s) ||
                                r.garmentId.toLowerCase().includes(s) ||
                                r.defectReason.toLowerCase().includes(s)
                              );
                            })}
                            rowKey={(r) => r.id}
                            empty="No rework cases currently assigned to Finishing."
                            columns={[
                              {
                                header: "Rework Case",
                                cell: (r) => (
                                  <div>
                                    <IdLink href={paths.reworkCase(r.id)} id={r.id} />
                                    <span className="block text-[10px] text-muted-foreground mt-0.5">
                                      Logged: {fmt.dateTime(r.createdAt)}
                                    </span>
                                  </div>
                                ),
                              },
                              {
                                header: "Garment Identification",
                                cell: (r) => {
                                  const garment = garments.find((g) => g.id === r.garmentId);
                                  return (
                                    <div>
                                      <IdLink href={paths.garment(r.garmentId)} id={r.garmentId} />
                                      <p className="text-xs font-medium text-foreground mt-0.5">
                                        {garment?.productName ?? "Garment Unit"}
                                      </p>
                                      {garment?.size && (
                                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold mt-0.5">
                                          Size {garment.size}
                                        </span>
                                      )}
                                    </div>
                                  );
                                },
                              },
                              {
                                header: "RFID Card UID",
                                cell: (r) => {
                                  const garment = garments.find((g) => g.id === r.garmentId);
                                  return garment?.rfidUid ? (
                                    <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                      {garment.rfidUid}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs italic">—</span>
                                  );
                                },
                              },
                              {
                                header: "QC Defect Reason",
                                cell: (r) => (
                                  <div className="rounded border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground font-medium max-w-xs">
                                    <div className="flex items-start gap-1.5">
                                      <AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />
                                      <span>{r.defectReason}</span>
                                    </div>
                                    <span className="block text-[10px] opacity-75 mt-1">
                                      Ref Inspection: {r.inspectionId}
                                    </span>
                                  </div>
                                ),
                              },
                              {
                                header: "Status",
                                cell: (r) => (
                                  <div>
                                    <StatusBadge status={r.status} />
                                    {r.status === "assigned" && (
                                      <span className="block text-[10px] text-warning font-semibold mt-1">
                                        Under Repair
                                      </span>
                                    )}
                                    {r.status === "repaired" && (
                                      <span className="block text-[10px] text-accent font-semibold mt-1">
                                        Awaiting Reinspection
                                      </span>
                                    )}
                                  </div>
                                ),
                              },
                              {
                                header: "Operator Action",
                                cell: (r) => {
                                  if (r.status === "repaired") {
                                    return (
                                      <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                                        <RotateCcw className="size-3 text-accent" /> Queued for QC
                                      </span>
                                    );
                                  }

                                  return (
                                    <FormDialog
                                      allowed={isAuthorized}
                                      trigger="Record Repair Completion"
                                      title={`Record Repair for Case ${r.id} (${r.garmentId})`}
                                      description="Describe the physical corrective action taken (trimming, pressing, steaming, buttoning). Submitting will route the garment back to Station 6 for independent reinspection."
                                      submitLabel="Submit Repair → Route to Reinspection"
                                      onSubmit={async () => {
                                        const ok = await run(
                                          (c) => c.completeRework(r.id, repairNote).then(() => true),
                                          `Repair recorded for ${r.id}. Garment routed to Station 6 for independent reinspection.`,
                                        );
                                        return Boolean(ok);
                                      }}
                                    >
                                      <div className="space-y-4 pt-2">
                                        <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                                          <p className="font-semibold text-foreground">Defect to Correct:</p>
                                          <p className="text-warning-foreground font-medium">{r.defectReason}</p>
                                        </div>

                                        <Field
                                          label="Corrective Action Performed"
                                          htmlFor="finishing-repair-notes"
                                          hint="Document the exact adjustments made to resolve the defect."
                                        >
                                          <Textarea
                                            id="finishing-repair-notes"
                                            value={repairNote}
                                            onChange={(e) => setRepairNote(e.target.value)}
                                            rows={3}
                                            className="text-xs"
                                            placeholder="e.g. Re-pressed front placket with steam cloth; trimmed all loose thread ends..."
                                          />
                                        </Field>

                                        {/* Pre-fill helper tags */}
                                        <div className="space-y-1.5">
                                          <p className="text-[11px] font-medium text-muted-foreground">Quick Pre-fills:</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {[
                                              "Trimmed loose thread ends at armhole & steam re-pressed.",
                                              "Re-pressed front placket with damp cloth to remove crease.",
                                              "Replaced missing spare button and inspected collar seams.",
                                              "Spot-cleaned minor iron mark & steamed fabric evenly.",
                                            ].map((quickText) => (
                                              <button
                                                key={quickText}
                                                type="button"
                                                onClick={() => setRepairNote(quickText)}
                                                className="text-[10px] rounded border bg-card px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                              >
                                                {quickText}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </FormDialog>
                                  );
                                },
                              },
                            ]}
                          />
                        </Section>

                        {/* Independent Clearance Rule Integrity Banner */}
                        <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="size-4 text-primary" />
                            <h4 className="font-semibold text-sm text-foreground">
                              Integrity Guard: Independent Clearance Rule
                            </h4>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            In accordance with factory quality governance, the finishing operator who corrected the garment{" "}
                            <strong className="text-foreground">cannot clear the rework case or release the quality hold</strong>.
                            Only an independent, certified Quality Inspector at Station 6 (`final_qc`) can scan the garment card,
                            verify the corrective work against the QC checklist, pass reinspection, and formally release the hold for packing.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            </Loadable>
          )}
        </Loadable>
      )}
    </Loadable>
  );
}