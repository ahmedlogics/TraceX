import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Radio,
  ScanLine,
  Scissors,
  Wrench,
  XCircle,
  OctagonAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IdLink, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { Garment, ReworkCase, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useClient } from "@/lib/data/provider";
import { useMe } from "@/features/shared/useMe";

export function StitchingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const client = useClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { run, pending } = useWtAction();
  const [activeTab, setActiveTab] = useState<"queue" | "rework">("queue");
  const [scanUid, setScanUid] = useState("");
  const [completedIds, setCompletedIds] = useState<Record<string, { at: string; uid?: string }>>({});
  const [repairedIds, setRepairedIds] = useState<Record<string, string>>({});
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  // Scan modal state
  const [scanGarment, setScanGarment] = useState<Garment | null>(null);
  const [inputUid, setInputUid] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 2000 });
  const qRework = useWtQuery(["rework"], (c) => c.listRework(), { refetchInterval: 3000 });

  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  // Auto-focus input on modal open
  useEffect(() => {
    if (scanGarment) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [scanGarment]);

  // Live active reader polling while modal is open (checks both stitching and finishing endpoints)
  useEffect(() => {
    if (!scanGarment) return;
    const interval = setInterval(async () => {
      try {
        const [stitchingData, finishingData] = await Promise.all([
          client.getRfidStationData("stitching"),
          client.getRfidStationData("finishing"),
        ]);
        const latest = stitchingData.lastScanOutcome || finishingData.lastScanOutcome;
        if (latest && latest.at && latest.at !== lastSeenScanRef.current) {
          const matched =
            latest.uid === scanGarment.rfidUid ||
            latest.subjectId === scanGarment.id ||
            latest.garmentCode === scanGarment.id;
          if (matched) {
            lastSeenScanRef.current = latest.at;
            setInputUid(latest.uid || scanGarment.rfidUid || "");
            if (latest.resolution === "accepted") {
              setCompletedIds((prev) => ({
                ...prev,
                [scanGarment.id]: { at: latest.at || new Date().toISOString(), uid: latest.uid },
              }));
              void qGarments.refetch();
              setScanGarment(null);
              setInputUid("");
              setScanError(null);
              toast.success(
                `✓ Garment ${latest.garmentCode ?? scanGarment.id} Stitching complete! Advanced to Finishing.`
              );
            } else {
              setScanError(latest.rejectReason || `Scan rejected: ${latest.resolution}`);
            }
          }
        }
      } catch {
        /* poll catch */
      }
    }, 600);
    return () => clearInterval(interval);
  }, [scanGarment, client, qGarments]);

  // Auto-detect scans arriving via MQTT/backend hardware reader
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    const outcome = stationData.lastScanOutcome;
    if (!outcome || !outcome.at) return;
    if (outcome.at !== lastSeenScanRef.current) {
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
        if (scanGarment && (scanGarment.id === gId || scanGarment.rfidUid === outcome.uid)) {
          setScanGarment(null);
          setInputUid("");
          setScanError(null);
        }
        toast.success(
          `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Stitching complete! Advanced to Finishing.`
        );
      } else if (scanGarment && (scanGarment.id === outcome.subjectId || scanGarment.rfidUid === outcome.uid)) {
        setInputUid(outcome.uid || "");
        setScanError(outcome.rejectReason || `Scan rejected: ${outcome.resolution}`);
      }
    }
  }, [stationData.lastScanOutcome, qGarments, scanGarment]);

  const handleScan = (garment: Garment) => {
    setScanGarment(garment);
    setInputUid("");
    setScanError(null);
  };

  const handleConfirmScan = (overrideUid?: string) => {
    if (!scanGarment) return;
    const uidToUse = (overrideUid || inputUid).trim();
    if (!uidToUse) {
      setScanError("Please enter or scan an RFID tag UID.");
      return;
    }
    const targetUid = scanGarment.rfidUid;
    if (targetUid && uidToUse.toUpperCase() !== targetUid.toUpperCase()) {
      setScanError(`Tag mismatch: Entered tag "${uidToUse}" does not match garment tag "${targetUid}".`);
      return;
    }

    void run(
      (c) => c.routineScan(uidToUse, "stitching"),
      (outcome) => {
        setLocalLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          setCompletedIds((prev) => ({
            ...prev,
            [scanGarment.id]: { at: outcome.at || new Date().toISOString(), uid: uidToUse },
          }));
          void qGarments.refetch();
          setScanGarment(null);
          setInputUid("");
          setScanError(null);
          return `✓ Garment ${scanGarment.id} (${scanGarment.productName}) Stitching complete! Advanced to Finishing.`;
        }
        setScanError(`Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`);
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

                {/* Scan Garment RFID Dialog */}
                <Dialog open={!!scanGarment} onOpenChange={(open) => { if (!open) setScanGarment(null); }}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <ScanLine className="size-5 text-primary" />
                        Scan Garment Tag · Station 4
                      </DialogTitle>
                      <DialogDescription>
                        Scan or enter the garment's RFID tag to complete seam assembly and advance to Station 5 Finishing.
                      </DialogDescription>
                    </DialogHeader>

                    {scanGarment && (
                      <div className="space-y-4 pt-1">
                        {/* Garment Details Card */}
                        <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-foreground">{scanGarment.productName}</span>
                            {scanGarment.size && (
                              <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                Size {scanGarment.size}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex items-center justify-between">
                              <span>Garment ID:</span>
                              <span className="font-mono font-medium text-foreground">{scanGarment.id}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Order:</span>
                              <span className="font-mono text-foreground">{scanGarment.orderId}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Linked Tag UID:</span>
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                <Radio className="size-3" /> {scanGarment.rfidUid}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Live Reader Detection Beacon */}
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="relative flex size-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full size-2.5 bg-primary" />
                            </span>
                            <span className="font-medium text-foreground">Scanner 4 Active &amp; Listening</span>
                          </div>
                          {scanGarment.rfidUid && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] gap-1 px-2 border-primary/30 text-primary hover:bg-primary/10"
                              onClick={() => {
                                const uid = scanGarment.rfidUid || "";
                                setInputUid(uid);
                                setScanError(null);
                                handleConfirmScan(uid);
                              }}
                            >
                              Auto-Fill Tag ({scanGarment.rfidUid})
                            </Button>
                          )}
                        </div>

                        {/* Scan Input */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            RFID Card UID
                          </label>
                          <Input
                            ref={inputRef}
                            autoFocus
                            placeholder="Scan or enter RFID card UID (e.g. D49B0103)..."
                            value={inputUid}
                            onChange={(e) => {
                              setInputUid(e.target.value);
                              if (scanError) setScanError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleConfirmScan();
                              }
                            }}
                            className="font-mono text-sm"
                          />
                        </div>

                        {scanError && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
                            <OctagonAlert className="size-4 shrink-0" />
                            <span>{scanError}</span>
                          </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0 pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setScanGarment(null)}
                            disabled={pending}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            className="gap-1.5 bg-primary font-semibold"
                            disabled={pending || !inputUid.trim()}
                            onClick={() => handleConfirmScan()}
                          >
                            <CheckCircle2 className="size-4" />
                            {pending ? "Validating..." : "Confirm & Complete"}
                          </Button>
                        </DialogFooter>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}