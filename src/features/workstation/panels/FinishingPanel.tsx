import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Radio,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdLink } from "@/components/wt/layout";
import { Loadable } from "@/components/wt/states";
import type { Garment } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode, useClient } from "@/lib/data/provider";
import { useMe } from "@/features/shared/useMe";

export function FinishingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const client = useClient();
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();
  const [activeTab, setActiveTab] = useState<"queue" | "completed">("queue");
  const [search, setSearch] = useState("");
  const [scanUid, setScanUid] = useState("");
  const [isArmed, setIsArmed] = useState(false);
  const [completedIds, setCompletedIds] = useState<Record<string, { at: string; uid?: string }>>({});

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 1000 });

  const lastSeenScanRef = useRef<string | null>(null);

  // Instant detection when StationShell prop updates
  useEffect(() => {
    const outcome = stationData.lastScanOutcome;
    if (!outcome?.at || outcome.at === lastSeenScanRef.current) return;
    lastSeenScanRef.current = outcome.at;
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
        `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? gId ?? ""} Finishing complete! Released to Station 6 QC Gate.`
      );
    }
  }, [stationData.lastScanOutcome, qGarments.data]);

  // Polling for hardware scans when in Live API mode
  useEffect(() => {
    if (isMock) return;
    const interval = setInterval(async () => {
      try {
        const data = await client.getRfidStationData("finishing");
        if (data.lastScanOutcome && data.lastScanOutcome.at !== lastSeenScanRef.current) {
          lastSeenScanRef.current = data.lastScanOutcome.at ?? null;
          if (data.lastScanOutcome.resolution === "accepted") {
            const outcome = data.lastScanOutcome;
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
              `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Finishing complete! Released to Station 6 QC Gate.`
            );
          }
        }
      } catch {
        // station data poll catch
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isMock, client, qGarments.data]);

  const handleScan = (garment: Garment) => {
    const uid = garment.rfidUid || scanUid.trim();
    if (!uid) {
      toast.error("No RFID card linked to this garment.");
      return;
    }
    void run(
      (c) => c.routineScan(uid, "finishing"),
      (outcome) => {
        if (outcome.resolution === "accepted") {
          setCompletedIds((prev) => ({
            ...prev,
            [garment.id]: { at: outcome.at || new Date().toISOString(), uid },
          }));
          void qGarments.refetch();
          return `✓ Garment ${garment.id} (${garment.productName}) Finishing complete! Released to Station 6 QC Gate.`;
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
      (c) => c.routineScan(uid, "finishing"),
      (outcome) => {
        setScanUid("");
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
          return `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Finishing complete! Released to Station 6 QC Gate.`;
        }
        return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
      }
    );
  };

  return (
    <Loadable query={qGarments}>
      {(garments) => {
        // Only garments that completed Stitching at Station 4 (stage 'stitched' or 'finishing', with bound RFID tag)
        const finishingQueue = garments.filter(
          (g) =>
            (g.stage === "stitched" || g.stage === "finishing") &&
            Boolean(g.rfidUid) &&
            !g.hold &&
            !completedIds[g.id]
        );

        // Garments finished (in DB or completed on runtime)
        const completedQueue = garments.filter(
          (g) =>
            g.stage === "finished" ||
            g.stage === "final-qc" ||
            g.stage === "packing" ||
            g.stage === "warehouse" ||
            g.stage === "dispatched" ||
            Boolean(completedIds[g.id])
        );

        const releasedToQcCount = garments.filter(
          (g) => g.stage === "final-qc" || g.stage === "packing" || g.stage === "warehouse"
        ).length;

        const filteredReady = finishingQueue.filter(
          (g) =>
            !search.trim() ||
            `${g.id} ${g.orderId} ${g.productName} ${g.rfidUid ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase())
        );

        const filteredCompleted = completedQueue.filter(
          (g) =>
            !search.trim() ||
            `${g.id} ${g.orderId} ${g.productName} ${g.rfidUid ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase())
        );

        return (
          <div className="space-y-6">
            {/* 3 Summary KPI Cards moved from Home */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">PENDING FINISHING</span>
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Sparkles className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                  {finishingQueue.length}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Stitched at Station 4
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">FINISHED TODAY</span>
                  <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {completedQueue.length}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Advanced to Station 6 QC
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">AT FINAL QC GATE</span>
                  <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  {releasedToQcCount}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Under Station 6 inspection
                </p>
              </div>
            </div>

            {/* Live API Mode Hardware Armed Beacon */}
            {!isMock && isArmed && (
              <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex size-7 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-xs">
                    <Radio className="size-4 animate-spin" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      Scanner 5 Hardware Active &amp; Listening
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Present physical garment tag to Scanner 5 hardware reader to complete finishing.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                  onClick={() => setIsArmed(false)}
                >
                  Stop Listening
                </Button>
              </div>
            )}

            {/* Header Controls: Tab Selector Pills, Search, and Scan Trigger */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-3">
              <div className="inline-flex rounded-lg border bg-muted/60 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("queue")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                    activeTab === "queue"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="size-3.5" /> Finishing Queue ({finishingQueue.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("completed")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                    activeTab === "completed"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CheckCircle2 className="size-3.5" /> Completed ({completedQueue.length})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter garments..."
                  className="h-8 w-44 text-xs bg-card"
                />

                <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  <span>{isArmed ? "Scanner 5 Armed & Listening" : "Station 5 Ready"}</span>
                </div>

                {isMock ? (
                  <>
                    {finishingQueue[0] && !scanUid && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-mono gap-1"
                        onClick={() => setScanUid(finishingQueue[0].rfidUid || "")}
                      >
                        Pre-fill Next ({finishingQueue[0].id})
                      </Button>
                    )}
                    <Input
                      value={scanUid}
                      onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                      placeholder="Scan tag UID..."
                      className="h-8 w-32 font-mono text-xs bg-card"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleManualScan(finishingQueue[0]?.rfidUid);
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs font-semibold gap-1 bg-primary text-primary-foreground"
                      disabled={pending || (!scanUid.trim() && finishingQueue.length === 0)}
                      onClick={() => handleManualScan(finishingQueue[0]?.rfidUid)}
                    >
                      <ScanLine className="size-3.5" /> Simulate Scan
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
                  </>
                ) : (
                  <Button
                    size="sm"
                    className={`h-8 text-xs font-semibold gap-1.5 shadow-xs transition-all ${
                      isArmed
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                    }`}
                    disabled={pending}
                    onClick={() => setIsArmed((prev) => !prev)}
                  >
                    <Radio className={`size-3.5 ${isArmed ? "animate-spin" : ""}`} />
                    {isArmed ? "Scanner 5 Listening..." : "Scan Product"}
                  </Button>
                )}
              </div>
            </div>

            {/* TAB 1: FINISHING QUEUE */}
            {activeTab === "queue" && (
              <div className="space-y-3">
                {filteredReady.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center space-y-2 bg-muted/20">
                    <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      All stitched garments have been finished
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      No garments currently awaiting finishing. When Station 4 Stitching completes assembly, garments will appear here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border bg-card overflow-hidden">
                    {filteredReady.map((garment) => {
                      const isDone = Boolean(completedIds[garment.id]);
                      return (
                        <div
                          key={garment.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <IdLink href={paths.garment(garment.id)} id={garment.id} />
                              <span className="text-muted-foreground">·</span>
                              <span className="font-semibold text-foreground">{garment.productName}</span>
                              {garment.size && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  Size {garment.size}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                <Radio className="size-2.5" /> Tag: {garment.rfidUid}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Order: <AppLink href={paths.order(garment.orderId)} className="font-medium text-foreground hover:underline">{garment.orderId}</AppLink> · Source: Stitching Line (Station 4)
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="size-3" /> Complete · Sent to QC
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                <Clock className="size-3" /> Pending
                              </span>
                            )}
                            {isMock && !isDone && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={pending}
                                onClick={() => handleScan(garment)}
                              >
                                <ScanLine className="size-3" /> Simulate
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: COMPLETED TABLE */}
            {activeTab === "completed" && (
              <div className="space-y-3">
                {filteredCompleted.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/20">
                    No garments finished yet.
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border bg-card overflow-hidden">
                    {filteredCompleted.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between p-3.5 text-xs hover:bg-muted/30"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <IdLink href={paths.garment(g.id)} id={g.id} />
                            <span className="text-muted-foreground">·</span>
                            <span className="font-medium text-foreground">{g.productName}</span>
                            <span className="font-mono text-muted-foreground">Tag: {g.rfidUid}</span>
                          </div>
                          <p className="text-muted-foreground">Order: {g.orderId}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="size-3" /> Done · Released to QC Gate
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }}
    </Loadable>
  );
}
