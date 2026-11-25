import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Radio,
  RotateCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode } from "@/lib/data/provider";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";
import type { Garment, ReworkCase, ScanOutcome } from "@/domain/types";
import { can } from "@/domain/permissions";

export function StitchingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();
  const [activeTab, setActiveTab] = useState<"routine" | "rework">("routine");

  // Routine Stitching State
  const [scanUid, setScanUid] = useState("");
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  // Stitching Rework State
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [repairNote, setRepairNote] = useState("");
  const [reworkScanUid, setReworkScanUid] = useState("");

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qTasks = useWtQuery(["tasks"], (c) => c.listTasks());
  const qRework = useWtQuery(["rework"], (c) => c.listRework());

  const isAuthorized = me.role === "M" || me.department === "stitching";
  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  const handleScan = (uidToScan: string) => {
    const trimmed = uidToScan.trim();
    if (!trimmed) return;
    void run(
      (c) => c.routineScan(trimmed, "stitching"),
      (outcome) => {
        setLocalLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          setScanUid("");
          return `Garment ${
            outcome.garmentCode ?? outcome.subjectId
          } (${outcome.productName ?? "Garment"}) stitching completed. Ready for Finishing.`;
        }
        return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
      },
    );
  };

  const isReadyForStitching = (stage: string) => stage === "stitching" || stage === "cut";
  const isCompletedStitching = (stage: string) => stage === "finishing" || stage === "stitched";

  return (
    <Loadable query={qGarments}>
      {(garments) => (
        <Loadable query={qTasks}>
          {(tasks) => (
            <Loadable query={qRework}>
              {(reworkCases) => {
                // Filter routine stitching queue: ready from cutting (stitching/cut stage) or recently completed (finishing/stitched stage)
                const stitchingQueue = garments.filter(
                  (g) => isReadyForStitching(g.stage) || isCompletedStitching(g.stage),
                );

                // Filter rework cases: only QC-failed garments assigned to Stitching
                const stitchingReworkCases = reworkCases.filter(
                  (rc) => rc.assignedDepartment === "stitching",
                );
                const activeReworkCases = stitchingReworkCases.filter(
                  (rc) => rc.status === "assigned",
                );

                const selectedCase =
                  stitchingReworkCases.find((rc) => rc.id === selectedCaseId) ??
                  activeReworkCases[0] ??
                  null;

                const selectedGarment = selectedCase
                  ? garments.find((g) => g.id === selectedCase.garmentId)
                  : null;

                const canRepair =
                  selectedCase &&
                  can.completeRework(me, selectedCase) &&
                  me.id !== selectedCase.assignedBy;

                return (
                  <div className="space-y-6">
                    {/* Persistent Live Scan Outcome */}
                    {lastOutcome && (
                      <div
                        className={`rounded-lg border p-3.5 text-xs flex items-start gap-3 shadow-xs ${
                          lastOutcome.resolution === "accepted"
                            ? "border-success/40 bg-success-soft text-foreground"
                            : "border-destructive/40 bg-danger-soft text-foreground"
                        }`}
                      >
                        {lastOutcome.resolution === "accepted" ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success mt-0.5" />
                        ) : (
                          <XCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                        )}
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            {lastOutcome.resolution === "accepted"
                              ? `Scan Confirmed: ${lastOutcome.garmentCode ?? lastOutcome.subjectId}${
                                  lastOutcome.productName ? ` · ${lastOutcome.productName}` : ""
                                }`
                              : `Scan Rejected (${lastOutcome.uid}): ${
                                  lastOutcome.rejectReason ?? lastOutcome.resolution
                                }`}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground/85">
                            <span className="font-mono">Card UID: {lastOutcome.uid}</span>
                            <span>·</span>
                            <span>Station 4 / S3 (Stitching)</span>
                            <span>·</span>
                            <span>Timestamp: {fmt.dateTime(lastOutcome.at)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dual Workstation Tabs */}
                    <Tabs
                      value={activeTab}
                      onValueChange={(v) => setActiveTab(v as "routine" | "rework")}
                      className="space-y-4"
                    >
                      <TabsList className="bg-muted p-1">
                        <TabsTrigger
                          value="routine"
                          className="data-[state=active]:bg-card data-[state=active]:shadow-xs text-xs sm:text-sm"
                        >
                          <ScanLine className="size-4 mr-1.5" /> Routine Stitching
                        </TabsTrigger>
                        <TabsTrigger
                          value="rework"
                          className="data-[state=active]:bg-card data-[state=active]:shadow-xs text-xs sm:text-sm"
                        >
                          <Wrench className="size-4 mr-1.5" /> Stitching Rework
                          {activeReworkCases.length > 0 && (
                            <span className="ml-1.5 rounded-full bg-destructive/15 text-destructive font-mono text-[10px] px-1.5 py-0.5 font-bold">
                              {activeReworkCases.length}
                            </span>
                          )}
                        </TabsTrigger>
                      </TabsList>

                      {/* TAB 1: ROUTINE STITCHING */}
                      <TabsContent value="routine" className="space-y-6">
                        <div className="grid gap-6 lg:grid-cols-2">
                          {/* Continuous Reader & Manual Fallback */}
                          <Section title="Routine Stitching Reader">
                            <div className="space-y-4">
                              <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                    </span>
                                    <p className="text-sm font-semibold text-foreground">
                                      Continuous Routine Reader Active
                                    </p>
                                  </div>
                                  <span className="text-[11px] font-mono text-muted-foreground">
                                    Station 4 · Sensor S3
                                  </span>
                                </div>

                                {!isAuthorized && (
                                  <ScopeNote>
                                    Only Stitching operators or managers can record stitching
                                    completion.
                                  </ScopeNote>
                                )}

                                {isAuthorized && (
                                  isMock ? (
                                    <div className="pt-2 space-y-3">
                                      <Field
                                        label="Garment Card UID (Manual Entry for Testing)"
                                        htmlFor="stitching-scan-uid"
                                        hint="Enter card UID manually or click Pre-fill Next to simulate stitching routine scan."
                                      >
                                        <Input
                                          id="stitching-scan-uid"
                                          value={scanUid}
                                          onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                          className="font-mono bg-card"
                                          placeholder="e.g. 04001122"
                                        />
                                      </Field>

                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                          disabled={pending || !scanUid.trim()}
                                          onClick={() => handleScan(scanUid)}
                                        >
                                          <ScanLine className="size-4 mr-1.5" /> Process Routine Scan
                                        </Button>

                                        {stitchingQueue.find(
                                          (g) => isReadyForStitching(g.stage) && !g.hold && g.rfidUid,
                                        ) && (
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={pending}
                                            onClick={() => {
                                              const next = stitchingQueue.find(
                                                (g) => isReadyForStitching(g.stage) && !g.hold && g.rfidUid,
                                              );
                                              if (next?.rfidUid) setScanUid(next.rfidUid);
                                            }}
                                          >
                                            Pre-fill Next (
                                            {
                                              stitchingQueue.find(
                                                (g) => isReadyForStitching(g.stage) && !g.hold && g.rfidUid,
                                              )?.id
                                            }
                                            )
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-2 text-primary font-medium">
                                        <Radio className="size-4 animate-pulse" />
                                        <span>Hardware Reader Active · Station 4 (Stitching Table)</span>
                                      </div>
                                      <p className="mt-1">
                                        Present garment RFID cards directly to Station 4 reader antenna. Successful taps will advance garments automatically to Finishing.
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          </Section>

                          {/* Work Queue */}
                          <Section title="Stitching Work Queue & Planning">
                            <DataTable
                              rows={stitchingQueue}
                              rowKey={(g) => g.id}
                              empty="No garments in queue for Stitching."
                              columns={[
                                {
                                  header: "Garment",
                                  cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                                },
                                {
                                  header: "Product & Size",
                                  cell: (g) => (
                                    <div>
                                      <p className="font-medium text-xs sm:text-sm">
                                        {g.productName}
                                      </p>
                                      {g.size && (
                                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold mt-0.5">
                                          Size {g.size}
                                        </span>
                                      )}
                                    </div>
                                  ),
                                },
                                {
                                  header: "Active RFID Card",
                                  cell: (g) =>
                                    g.rfidUid ? (
                                      <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                        {g.rfidUid}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs italic">
                                        Unbound
                                      </span>
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
                                    if (!isReadyForStitching(g.stage)) {
                                      return (
                                        <span className="text-xs text-muted-foreground italic">
                                          Ready for Finishing
                                        </span>
                                      );
                                    }
                                    if (g.hold) {
                                      return (
                                        <span className="text-xs text-destructive font-medium">
                                          On Hold
                                        </span>
                                      );
                                    }
                                    if (!g.rfidUid) {
                                      return (
                                        <span className="text-xs text-warning font-medium">
                                          No Card
                                        </span>
                                      );
                                    }
                                    return (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs font-semibold border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                                        disabled={pending || !isAuthorized}
                                        onClick={() => handleScan(g.rfidUid!)}
                                      >
                                        <ScanLine className="size-3 mr-1" /> Tap Card
                                      </Button>
                                    );
                                  },
                                },
                              ]}
                            />
                          </Section>
                        </div>
                      </TabsContent>

                      {/* TAB 2: STITCHING REWORK */}
                      <TabsContent value="rework" className="space-y-6">
                        {/* Notice Banner */}
                        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-xs text-foreground flex items-start gap-2.5">
                          <AlertTriangle className="size-4 shrink-0 text-warning mt-0.5" />
                          <div>
                            <p className="font-semibold text-foreground">
                              QC Defect Repair Dashboard (Stitching Department)
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                              Showing only QC-failed garments assigned to Stitching. Perform
                              corrective repair, record a repair note, and route to QC for
                              independent reinspection.
                              <span className="font-semibold text-foreground">
                                {" "}
                                Important: Repair completion does NOT release the quality hold.
                              </span>{" "}
                              Only an authorized QC inspector can release the hold upon passing
                              reinspection.
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                          {/* Selected Rework Item & Action Form */}
                          <Section title="Corrective Repair Action">
                            {selectedCase ? (
                              <div className="rounded-lg border bg-card p-4 space-y-4">
                                <div className="flex items-center justify-between border-b pb-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-sm">
                                        {selectedCase.id}
                                      </span>
                                      <StatusBadge status={selectedCase.status} />
                                      <HoldBadge />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      Opened: {fmt.dateTime(selectedCase.createdAt)}
                                    </p>
                                  </div>

                                  <div className="text-right text-xs">
                                    <span className="text-muted-foreground">Garment: </span>
                                    <IdLink
                                      href={paths.garment(selectedCase.garmentId)}
                                      id={selectedCase.garmentId}
                                    />
                                    {selectedGarment?.productName && (
                                      <p className="font-medium text-foreground">
                                        {selectedGarment.productName}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* QC Defect Card */}
                                <div className="rounded-md border border-destructive/30 bg-danger-soft p-3 text-xs space-y-1">
                                  <div className="flex items-center gap-1.5 font-semibold text-destructive">
                                    <ShieldAlert className="size-4" />
                                    <span>QC Defect Reason:</span>
                                  </div>
                                  <p className="text-foreground font-medium pl-5">
                                    {selectedCase.defectReason}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground pl-5 pt-0.5">
                                    Inspection Reference:{" "}
                                    <span className="font-mono font-semibold text-foreground">
                                      {selectedCase.inspectionId}
                                    </span>
                                  </p>
                                </div>

                                {/* Active RFID Card info */}
                                {selectedGarment?.rfidUid && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">Active Card UID:</span>
                                    <span className="font-mono bg-muted px-2 py-0.5 rounded font-semibold">
                                      {selectedGarment.rfidUid}
                                    </span>
                                  </div>
                                )}

                                {/* Action Area */}
                                {selectedCase.status === "assigned" ? (
                                  <div className="space-y-3 pt-2">
                                    <Field
                                      label="Corrective Action Note"
                                      htmlFor="stitching-repair-note"
                                      hint="Detail the repair steps performed (e.g., seam unpicked and re-stitched with reinforced lockstitch)."
                                    >
                                      <Textarea
                                        id="stitching-repair-note"
                                        value={repairNote}
                                        onChange={(e) => setRepairNote(e.target.value)}
                                        rows={3}
                                        placeholder="Enter detailed repair notes here..."
                                        className="bg-background text-xs"
                                      />
                                    </Field>

                                    <Button
                                      disabled={pending || !repairNote.trim() || !canRepair}
                                      onClick={() =>
                                        void run(
                                          (c) =>
                                            c.completeRework(selectedCase.id, repairNote.trim()),
                                          () => {
                                            setRepairNote("");
                                            return `Repair recorded for ${selectedCase.garmentId}. Routed to QC for independent reinspection. Quality hold remains active.`;
                                          },
                                        )
                                      }
                                    >
                                      <Wrench className="size-4 mr-1.5" /> Complete Repair & Route
                                      to QC
                                    </Button>

                                    {!canRepair && (
                                      <ScopeNote>
                                        Only Stitching production staff can record repair
                                        completions.
                                      </ScopeNote>
                                    )}
                                  </div>
                                ) : selectedCase.status === "repaired" ? (
                                  <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-foreground font-semibold">
                                      <Clock className="size-4 text-warning" />
                                      <span>Repair Recorded · Awaiting QC Reinspection</span>
                                    </div>
                                    <p className="text-muted-foreground">
                                      Repair note:{" "}
                                      <span className="font-medium text-foreground">
                                        {selectedCase.repairNote}
                                      </span>
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Fresh Reinspection:{" "}
                                      <span className="font-mono font-semibold text-foreground">
                                        {selectedCase.reinspectionId ?? "INSP-PENDING"}
                                      </span>
                                    </p>
                                    <p className="text-[11px] text-warning font-medium">
                                      Hold will remain active until an authorized QC inspector
                                      performs reinspection and releases it.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="rounded-md border bg-success/10 border-success/30 p-3 text-xs space-y-1">
                                    <div className="flex items-center gap-1.5 text-success font-semibold">
                                      <CheckCircle2 className="size-4" />
                                      <span>QC Clearance Complete</span>
                                    </div>
                                    <p className="text-muted-foreground">
                                      This rework case is resolved and the quality hold has been
                                      released by Quality Control.
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <EmptyState title="No Rework Case Selected">
                                {activeReworkCases.length > 0
                                  ? "Select a rework case from the table on the right."
                                  : "No active QC rework cases currently assigned to Stitching."}
                              </EmptyState>
                            )}
                          </Section>

                          {/* Rework Queue List */}
                          <Section title="Assigned Stitching Rework Queue">
                            <DataTable
                              rows={stitchingReworkCases}
                              rowKey={(rc) => rc.id}
                              empty="No QC defects assigned to Stitching."
                              columns={[
                                {
                                  header: "Case ID",
                                  cell: (rc) => (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedCaseId(rc.id)}
                                      className="font-mono text-xs font-semibold text-primary hover:underline text-left"
                                    >
                                      {rc.id}
                                    </button>
                                  ),
                                },
                                {
                                  header: "Garment",
                                  cell: (rc) => {
                                    const g = garments.find((x) => x.id === rc.garmentId);
                                    return (
                                      <div>
                                        <IdLink href={paths.garment(rc.garmentId)} id={rc.garmentId} />
                                        {g?.productName && (
                                          <p className="text-[11px] text-muted-foreground">
                                            {g.productName}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  },
                                },
                                {
                                  header: "RFID Card",
                                  cell: (rc) => {
                                    const g = garments.find((x) => x.id === rc.garmentId);
                                    return g?.rfidUid ? (
                                      <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                        {g.rfidUid}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs italic">
                                        None
                                      </span>
                                    );
                                  },
                                },
                                {
                                  header: "Defect Reason",
                                  cell: (rc) => (
                                    <span className="text-xs text-foreground font-medium line-clamp-2">
                                      {rc.defectReason}
                                    </span>
                                  ),
                                },
                                {
                                  header: "Status",
                                  cell: (rc) => (
                                    <div className="flex items-center gap-1">
                                      <StatusBadge status={rc.status} />
                                      <HoldBadge />
                                    </div>
                                  ),
                                },
                                {
                                  header: "Action",
                                  cell: (rc) => (
                                    <Button
                                      size="sm"
                                      variant={selectedCase?.id === rc.id ? "default" : "outline"}
                                      className="h-7 text-xs font-medium"
                                      onClick={() => setSelectedCaseId(rc.id)}
                                    >
                                      {rc.status === "assigned" ? "Repair" : "View"}
                                    </Button>
                                  ),
                                },
                              ]}
                            />
                          </Section>
                        </div>
                      </TabsContent>
                    </Tabs>
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
