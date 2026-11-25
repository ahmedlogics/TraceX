import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Radio,
  ScanLine,
  Scissors,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IdLink, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { Garment, ReworkCase, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

export function StitchingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const [activeTab, setActiveTab] = useState<"queue" | "rework">("queue");
  const [scanUid, setScanUid] = useState("");
  const [completedIds, setCompletedIds] = useState<Record<string, { at: string; uid?: string }>>({});
  const [repairedIds, setRepairedIds] = useState<Record<string, string>>({});
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 3000 });
  const qRework = useWtQuery(["rework"], (c) => c.listRework(), { refetchInterval: 3000 });

  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  // Auto-detect scans arriving via MQTT/backend hardware reader
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    const outcome = stationData.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      setLocalLastOutcome(outcome);
      if (outcome.resolution === "accepted") {
        const matchedGarment = qGarments.data?.find(
          (g) => g.id === outcome.subjectId || g.rfidUid === outcome.uid
        );
        const gId = matchedGarment?.id || outcome.subjectId;
        if (gId) {
          setCompletedIds((prev) => ({
            ...prev,
            [gId]: { at: outcome.at || new Date().toISOString(), uid: outcome.uid },
          }));
        }
        void qGarments.refetch();
        toast.success(
          `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Stitching complete! Advanced to Finishing.`
        );
      }
    }
  }, [stationData.lastScanOutcome, qGarments]);

  const handleScan = (garment: Garment) => {
    const uid = garment.rfidUid || scanUid.trim();
    if (!uid) {
      toast.error("No RFID card linked to this garment.");
      return;
    }
    void run(
      (c) => c.routineScan(uid, "stitching"),
      (outcome) => {
        setLocalLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          setCompletedIds((prev) => ({
            ...prev,
            [garment.id]: { at: outcome.at || new Date().toISOString(), uid },
          }));
          void qGarments.refetch();
          return `✓ Garment ${garment.id} (${garment.productName}) Stitching complete! Status updated to Stitched.`;
        }
        return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
      }
    );
  };

  const handleManualScan = (fallbackUid?: string) => {
    const uid = scanUid.trim() || fallbackUid || "";
    if (!uid) {
      toast.error("No garment card UID to scan.");
      return;
    }
    void run(
      (c) => c.routineScan(uid, "stitching"),
      (outcome) => {
        setScanUid("");
        setLocalLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          const matchedGarment = qGarments.data?.find(
            (g) => g.id === outcome.subjectId || g.rfidUid === outcome.uid
          );
          const gId = matchedGarment?.id || outcome.subjectId;
          if (gId) {
            setCompletedIds((prev) => ({
              ...prev,
              [gId]: { at: outcome.at || new Date().toISOString(), uid: outcome.uid },
            }));
          }
          void qGarments.refetch();
          return `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Stitching complete! Advanced to Finishing.`;
        }
        return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
      }
    );
  };

  const handleRepair = (rc: ReworkCase) => {
    void run(
      (c) => c.completeRework(rc.id, "Stitching repair completed and verified."),
      () => {
        setRepairedIds((prev) => ({ ...prev, [rc.id]: new Date().toISOString() }));
        void qRework.refetch();
        return `✓ Rework ${rc.id} repaired! Garment returned to QC for reinspection.`;
      }
    );
  };

  return (
    <Loadable query={qGarments}>
      {(garments) => (
        <Loadable query={qRework}>
          {(reworkCases) => {
            // ONLY garments approved and scanned by Station 3 Cutting (stage 'cut' or 'stitching', with bound RFID tag)
            const stitchingQueue = garments.filter(
              (g) =>
                ((g.stage as string) === "cut" || g.stage === "stitching") &&
                Boolean(g.rfidUid) &&
                !g.hold &&
                !completedIds[g.id]
            );

            // QC rework cases: ONLY those failed by QC and assigned to Stitching
            const stitchingRework = reworkCases.filter(
              (rc) =>
                rc.assignedDepartment === "stitching" &&
                rc.status === "assigned" &&
                !repairedIds[rc.id]
            );

            return (
              <div className="space-y-6">
                {/* Live Scan Outcome Banner */}
                {lastOutcome && (
                  <div
                    className={`rounded-xl border p-3.5 text-xs flex items-center justify-between gap-3 shadow-xs ${
                      lastOutcome.resolution === "accepted"
                        ? "border-success/40 bg-success-soft text-foreground"
                        : "border-destructive/40 bg-danger-soft text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {lastOutcome.resolution === "accepted" ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="size-4 shrink-0 text-destructive" />
                      )}
                      <div>
                        <span className="font-bold">
                          {lastOutcome.resolution === "accepted"
                            ? `Scan Confirmed: ${lastOutcome.garmentCode ?? lastOutcome.subjectId}`
                            : `Scan Rejected (${lastOutcome.uid})`}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {lastOutcome.resolution === "accepted"
                            ? "· Stitching Complete → Advanced to Finishing"
                            : `· ${lastOutcome.rejectReason ?? lastOutcome.resolution}`}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-muted-foreground text-[11px]">
                      Tag: {lastOutcome.uid}
                    </span>
                  </div>
                )}

                {/* Header Controls: Tabs & Compact Scanner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-3">
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as "queue" | "rework")}
                  >
                    <TabsList className="bg-muted p-1">
                      <TabsTrigger value="queue" className="text-xs font-semibold gap-1.5">
                        <Scissors className="size-3.5" /> Stitching Queue ({stitchingQueue.length})
                      </TabsTrigger>
                      <TabsTrigger value="rework" className="text-xs font-semibold gap-1.5">
                        <Wrench className="size-3.5" /> QC Rework &amp; Repairs ({stitchingRework.length})
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                      </span>
                      <span>Station 4 Ready</span>
                    </div>
                    {stitchingQueue[0] && !scanUid && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-mono gap-1"
                        onClick={() => setScanUid(stitchingQueue[0].rfidUid || "")}
                      >
                        Pre-fill Next ({stitchingQueue[0].id})
                      </Button>
                    )}
                    <Input
                      value={scanUid}
                      onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                      placeholder="Scan tag UID..."
                      className="h-8 w-36 font-mono text-xs bg-card"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleManualScan(stitchingQueue[0]?.rfidUid);
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs font-semibold gap-1 bg-primary text-primary-foreground"
                      disabled={pending || (!scanUid.trim() && stitchingQueue.length === 0)}
                      onClick={() => handleManualScan(stitchingQueue[0]?.rfidUid)}
                    >
                      <ScanLine className="size-3.5" /> Simulate Scan {scanUid.trim() ? `(${scanUid.trim()})` : stitchingQueue[0] ? `(${stitchingQueue[0].id})` : ""}
                    </Button>
                    {scanUid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs px-2"
                        onClick={() => setScanUid("")}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {/* TAB 1: STITCHING QUEUE */}
                {activeTab === "queue" && (
                  <Section
                    title="Active Stitching Bench Queue"
                    description="Garments cut and tagged at Station 3 awaiting seam assembly."
                  >
                    {stitchingQueue.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-8 text-center space-y-2 bg-muted/20">
                        <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                          <CheckCircle2 className="size-4" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          All cut garments stitched
                        </p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          No garments currently in line for Station 4. New cut garments from Station 3 will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y rounded-lg border bg-card overflow-hidden">
                        {stitchingQueue.map((g) => {
                          const isDone = Boolean(completedIds[g.id]);
                          return (
                            <div
                              key={g.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30 transition-colors"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <IdLink href={paths.garment(g.id)} id={g.id} />
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-semibold text-foreground">{g.productName}</span>
                                  {g.size && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                      Size {g.size}
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                    <Radio className="size-2.5" /> Tag: {g.rfidUid}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Order: <AppLink href={paths.order(g.orderId)} className="font-medium text-foreground hover:underline">{g.orderId}</AppLink> · Source: Station 3 Cutting
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                {isDone ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="size-3" /> Done · Stitched
                                  </span>
                                ) : (
                                  <>
                                    <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                      Ready to Stitch
                                    </span>
                                    <Button
                                      size="sm"
                                      className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                                      disabled={pending}
                                      onClick={() => handleScan(g)}
                                    >
                                      <ScanLine className="size-3.5" /> Scan &amp; Complete <ArrowRight className="size-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Section>
                )}

                {/* TAB 2: QC REWORK & REPAIRS */}
                {activeTab === "rework" && (
                  <Section
                    title="Stitching Rework & Repairs"
                    description="Defects identified by Station 6 Final QC assigned specifically to Stitching."
                  >
                    {stitchingRework.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-8 text-center space-y-2 bg-muted/20">
                        <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                          <CheckCircle2 className="size-4" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          No active stitching rework cases
                        </p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          When QC rejects a garment and assigns corrective action to Stitching, it will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y rounded-lg border bg-card overflow-hidden">
                        {stitchingRework.map((rc) => {
                          const isRepaired = Boolean(repairedIds[rc.id]);
                          return (
                            <div
                              key={rc.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30 transition-colors"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold wt-id text-foreground">{rc.id}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-semibold text-foreground">Garment: {rc.garmentId}</span>
                                  <span className="rounded bg-destructive/15 text-destructive px-2 py-0.5 text-[11px] font-bold">
                                    QC Rejected
                                  </span>
                                </div>
                                <p className="text-xs text-destructive font-medium">
                                  Defect: {rc.defectReason}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                {isRepaired ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="size-3" /> Repaired · Returned to QC
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs gap-1.5 bg-primary font-semibold"
                                    disabled={pending}
                                    onClick={() => handleRepair(rc)}
                                  >
                                    <Wrench className="size-3.5" /> Complete Repair &amp; Return to QC
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Section>
                )}
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}