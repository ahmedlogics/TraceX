import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Package,
  Radio,
  RotateCcw,
  Ruler,
  ScanLine,
  Sparkles,
  Tag,
  X,
  XCircle,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import type { ScanOutcome } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";
import { getDataMode } from "@/lib/data/provider";
import { cn } from "@/lib/utils";

function generateFreshUid(): string {
  return "04" + Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
}

export function ReceivingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();
  const qLots = useWtQuery(["lots"], (c) => c.listLots(), { refetchInterval: 3000 });
  const [selectedLotId, setSelectedLotId] = useState("");
  const [scanUid, setScanUid] = useState(isMock ? "04EE5566" : "");
  const [lastOutcome, setLastOutcome] = useState<ScanOutcome | null>(null);
  const [lastBoundLotId, setLastBoundLotId] = useState<string>("");

  const isReceivingStaff =
    me.role === "M" || me.department === "receiving" || me.department === "raw-store";

  return (
    <Loadable query={qLots}>
      {(lots) => {
        const unassignedLots = lots.filter((l) => !l.rfidUid);
        const lotId =
          selectedLotId && unassignedLots.some((l) => l.id === selectedLotId)
            ? selectedLotId
            : unassignedLots[0]?.id || "";
        const currentLot = unassignedLots.find((l) => l.id === lotId);
        const activeCtx = stationData.activeContext;
        const isCtxForThisStation = Boolean(
          activeCtx && activeCtx.stationCode === "fabric_receiving",
        );

        // Find bound lot details when scan succeeds
        const boundLotId = lastOutcome?.subjectId || lastBoundLotId;
        const boundLot = boundLotId ? lots.find((l) => l.id === boundLotId) : null;

        // Current UI state of the reader lifecycle
        const isAwaitingAck = Boolean(
          isCtxForThisStation && activeCtx && activeCtx.status === "awaiting_ack" && !lastOutcome,
        );
        const isReadyToScan = Boolean(
          isCtxForThisStation && activeCtx && activeCtx.status === "ready" && !lastOutcome,
        );
        const isScanSuccess = Boolean(lastOutcome && lastOutcome.resolution === "accepted");
        const isScanFailed = Boolean(lastOutcome && lastOutcome.resolution !== "accepted");
        const isIdle = !isAwaitingAck && !isReadyToScan && !isScanSuccess && !isScanFailed;

        const handlePrepareContext = () => {
          setLastOutcome(null);
          void run(
            (c) =>
              c.prepareActionContext("fabric_receiving", "assign_bundle_card", {
                kind: "assign_bundle_card",
                lotId,
              }),
            "Prepared action context for card assignment.",
          );
        };

        const handleCancelContext = () => {
          if (!activeCtx) return;
          setLastOutcome(null);
          void run((c) => c.cancelContext(activeCtx.id), "Context cancelled.");
        };

        const handleExecuteScan = async () => {
          if (!activeCtx) return;
          try {
            const outcome = await run(
              async (c) => {
                if (isMock) {
                  const targetUid = scanUid.trim() || generateFreshUid();
                  return await c.resolveRfidScan(targetUid);
                }

                // Polling loop to wait for hardware scan from ESP32
                const startTime = Date.now();
                while (Date.now() - startTime < 35000) {
                  const data = await c.getRfidStationData("fabric_receiving");
                  if (
                    !data.activeContext ||
                    data.activeContext.id !== activeCtx.id ||
                    data.lastScanOutcome?.contextId === activeCtx.id
                  ) {
                    if (data.lastScanOutcome?.resolution === "accepted") {
                      return data.lastScanOutcome;
                    }
                    if (data.lastScanOutcome?.resolution) {
                      throw new Error(
                        data.lastScanOutcome.rejectReason ??
                          "Hardware scan was rejected by workstation rules.",
                      );
                    }
                  }

                  const allLots = await c.listLots();
                  const target = allLots.find((l) => l.id === lotId);
                  if (target?.rfidUid) {
                    return {
                      resolution: "accepted",
                      uid: target.rfidUid,
                      subjectId: target.id,
                      at: new Date().toISOString(),
                    } as ScanOutcome;
                  }

                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }

                throw new Error(
                  "No hardware card scan detected within 35 seconds. Please tap your RFID card on Reader 0 (GPIO 27) and try again.",
                );
              },
              (res) => {
                setScanUid("");
                if (res?.resolution === "accepted") {
                  return `Physical card ${res.uid} caught and bound to ${res.subjectId ?? lotId}!`;
                }
                return `Scan outcome: ${res?.rejectReason ?? res?.resolution ?? "Completed"}`;
              },
            );

            if (outcome) {
              setLastOutcome(outcome);
              setLastBoundLotId(outcome.subjectId ?? lotId);
            }
          } catch (err: unknown) {
            const errMsg =
              err instanceof Error
                ? err.message
                : "No hardware card scan detected. Please tap your RFID card on Reader 0 (GPIO 27) and try again.";
            setLastOutcome({
              uid: scanUid.trim() || "HW-SCAN",
              resolution: "rejected_business_rule",
              rejectReason: errMsg,
              at: new Date().toISOString(),
              subjectId: lotId,
            });
          }
        };

        return (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2 items-stretch">
              {/* ========================================================= */}
              {/* LEFT CARD: FABRIC BUNDLE SELECTION                        */}
              {/* ========================================================= */}
              <Section
                title={
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-primary" />
                    <span>Fabric Bundle Selection</span>
                  </div>
                }
                actions={
                  unassignedLots.length > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {unassignedLots.length} Pending Enrollment
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[#E2C8A8]/60 px-2 py-0.5 text-[11px] font-semibold text-[#2B170E] border border-[#CDBBA8]">
                      All Cards Assigned
                    </span>
                  )
                }
                className="h-full flex flex-col shadow-xs transition-shadow duration-200 hover:shadow-sm"
                contentClassName="flex-1 flex flex-col justify-between"
              >
                {unassignedLots.length === 0 ? (
                  <EmptyState title="No unassigned lots awaiting RFID cards">
                    All recorded fabric lots have active bundle cards assigned. Create a new fabric
                    lot to assign an RFID card.
                  </EmptyState>
                ) : (
                  <div className="flex flex-col justify-between h-full space-y-4">
                    <div className="space-y-3.5">
                      <Field label="Newly created fabric lot (card pending)" htmlFor="rcv-lot">
                        <NativeSelect
                          id="rcv-lot"
                          value={lotId}
                          onChange={(v) => {
                            setSelectedLotId(v);
                            setLastOutcome(null);
                          }}
                          disabled={isReadyToScan || isAwaitingAck || pending}
                          options={unassignedLots.map((l) => ({
                            value: l.id,
                            label: `${l.id} — ${l.material} (${l.balanceQty} ${l.unit ?? "m"})`,
                          }))}
                        />
                      </Field>

                      {currentLot && (
                        <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-3.5 transition-all">
                          <div className="flex items-center justify-between border-b pb-2 mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="wt-id rounded-md bg-card px-2 py-0.5 text-xs font-bold text-foreground border shadow-2xs">
                                {currentLot.id}
                              </span>
                              <span className="text-xs text-muted-foreground font-medium">
                                Lot Details
                              </span>
                            </div>
                            <StatusBadge status={currentLot.status} />
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 text-xs">
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <Package className="size-3 text-muted-foreground/70" />
                                Material Name
                              </span>
                              <p className="font-medium text-foreground leading-snug">
                                {currentLot.material}
                              </p>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <Tag className="size-3 text-muted-foreground/70" />
                                Supplier Reference
                              </span>
                              <p className="font-mono text-foreground font-medium">
                                {currentLot.supplierRef || "—"}
                              </p>
                            </div>

                            <div className="space-y-0.5 pt-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <Ruler className="size-3 text-muted-foreground/70" />
                                Received Quantity
                              </span>
                              <p className="font-semibold text-foreground tabular-nums">
                                {currentLot.receivedQty} {currentLot.unit ?? "m"}
                              </p>
                            </div>

                            <div className="space-y-0.5 pt-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Available Balance
                              </span>
                              <p className="font-semibold text-foreground tabular-nums">
                                {currentLot.balanceQty} {currentLot.unit ?? "m"}
                              </p>
                            </div>

                            <div className="col-span-2 pt-1.5 border-t mt-0.5 flex items-center justify-between">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                Active RFID Card:
                              </span>
                              {currentLot.rfidUid ? (
                                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  <Radio className="size-3" />
                                  {currentLot.rfidUid}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic bg-muted/60 px-2 py-0.5 rounded border border-dashed">
                                  None assigned
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {!isReceivingStaff && (
                        <ScopeNote>
                          Only receiving staff or managers can prepare and assign bundle cards.
                        </ScopeNote>
                      )}
                    </div>

                    {isReceivingStaff && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                        <Button
                          disabled={
                            pending ||
                            !currentLot ||
                            (isCtxForThisStation && activeCtx?.status !== "expired")
                          }
                          onClick={handlePrepareContext}
                          className={cn(
                            "relative h-9 px-4 font-medium text-xs shadow-xs transition-all duration-200 cursor-pointer",
                            isCtxForThisStation && activeCtx?.status === "ready"
                              ? "bg-muted text-muted-foreground border hover:bg-muted cursor-not-allowed"
                              : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-sm active:scale-[0.99]",
                          )}
                        >
                          <Radio
                            className={cn(
                              "size-3.5 mr-1.5",
                              isCtxForThisStation && activeCtx?.status === "ready"
                                ? "text-emerald-500 animate-pulse"
                                : "",
                            )}
                          />
                          {isCtxForThisStation && activeCtx?.status === "ready"
                            ? `Scanner Armed for ${currentLot?.id}`
                            : "Prepare: Assign bundle card"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* ========================================================= */}
              {/* RIGHT CARD: READER ACTION & SCAN LIFECYCLE                */}
              {/* ========================================================= */}
              <Section
                title={
                  <div className="flex items-center gap-2">
                    <Radio className="size-4 text-primary" />
                    <span>Reader Action &amp; Scan Lifecycle</span>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    {/* Live Lifecycle State Badge */}
                    {isIdle && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                        <span className="size-1.5 rounded-full bg-slate-400" />
                        Idle
                      </span>
                    )}

                    {isAwaitingAck && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Awaiting Ack
                      </span>
                    )}

                    {isReadyToScan && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CDBBA8] bg-[#E2C8A8]/60 px-2.5 py-0.5 text-xs font-semibold text-[#2B170E] shadow-2xs">
                        <span className="relative flex size-2">
                          <span className="animate-ping absolute inline-flex size-full rounded-full bg-[#D8B68F] opacity-75"></span>
                          <span className="relative inline-flex rounded-full size-2 bg-[#C79C70]"></span>
                        </span>
                        Ready to Scan
                      </span>
                    )}

                    {isScanSuccess && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CDBBA8] bg-[#E2C8A8]/40 px-2.5 py-0.5 text-xs font-bold text-[#2B170E]">
                        <CheckCircle2 className="size-3.5 text-[#2B170E]" />
                        Card Bound
                      </span>
                    )}

                    {isScanFailed && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                        <XCircle className="size-3.5 text-destructive" />
                        Scan Rejected
                      </span>
                    )}
                  </div>
                }
                className="h-full flex flex-col shadow-xs transition-shadow duration-200 hover:shadow-sm"
                contentClassName="flex-1 flex flex-col justify-between"
              >
                <div className="flex flex-col justify-between h-full space-y-4">
                  {/* ------------------------------------------------------------- */}
                  {/* STATE 1: IDLE / STANDBY                                       */}
                  {/* ------------------------------------------------------------- */}
                  {isIdle && (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 p-6 text-center animate-fade-in-up">
                      <div className="relative mb-2.5 flex size-11 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground/70 shadow-2xs">
                        <Radio className="size-5 stroke-[1.75]" />
                      </div>
                      <h3 className="text-xs font-semibold text-foreground">
                        Hardware Reader 0 in Standby
                      </h3>
                      <p className="mt-1 max-w-xs text-[11px] text-muted-foreground leading-relaxed">
                        Select a fabric lot on the left and click{" "}
                        <strong className="text-foreground font-semibold">Prepare</strong> to arm
                        Scanner 0 (GPIO 27) for enrollment.
                      </p>

                      <div className="mt-3.5 flex items-center justify-center gap-2 border-t pt-3 text-[10px] text-muted-foreground/80 font-mono">
                        <span>13.56 MHz ISO14443A</span>
                        <span>·</span>
                        <span className="text-[#6E5748] font-medium">
                          Bridge Ready
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* STATE 2: AWAITING BOARD ACKNOWLEDGEMENT                        */}
                  {/* ------------------------------------------------------------- */}
                  {isAwaitingAck && activeCtx && (
                    <div className="flex flex-1 flex-col justify-between rounded-xl border border-amber-400/40 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent p-4 space-y-3 animate-fade-in-up dark:from-amber-950/30">
                      <div className="flex items-start gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                          <AlertCircle className="size-4" />
                        </div>
                        <div className="space-y-0.5">
                          <h3 className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                            Context Handshake Required
                          </h3>
                          <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
                            Context <span className="wt-id font-bold">{activeCtx.id}</span> created.
                            Awaiting board acknowledgment.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-400/20">
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            void run(
                              (c) => c.acknowledgeContext(activeCtx.id),
                              "Reader board acknowledged context.",
                            )
                          }
                          className="bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs h-8 shadow-xs"
                        >
                          <Cpu className="size-3 mr-1" />
                          {isMock ? "Simulate Acknowledgment" : "Acknowledge Hardware Handshake"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={handleCancelContext}
                          className="text-xs h-8"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* STATE 3: READY TO SCAN / ARMED (COMPACT & BALANCED)            */}
                  {/* ------------------------------------------------------------- */}
                  {isReadyToScan && activeCtx && (
                    <div className="flex flex-1 flex-col justify-between space-y-3.5 animate-fade-in-up">
                      <div className="space-y-3">
                        {/* Compact Scanning Beacon Banner */}
                        <div className="flex items-center gap-3 rounded-xl border border-[#CDBBA8] bg-[#F2E4D2]/40 p-3">
                          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[#D8B68F] text-[#2B170E] border border-[#CDBBA8] shadow-xs">
                            <span className="absolute inset-0 rounded-full bg-[#E2C8A8]/40 animate-sonar" />
                            <Radio className="size-5 relative z-10" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="size-2 rounded-full bg-[#C79C70] animate-ping" />
                              <h3 className="text-xs font-bold text-[#2B170E]">
                                Scanner 0 Armed &amp; Listening
                              </h3>
                            </div>
                            <p className="text-[11px] text-[#6E5748] mt-0.5">
                              Tap fabric bundle RFID card against Reader 0 to bind.
                            </p>
                          </div>
                        </div>

                        {/* Hardware Reader Telemetry Box */}
                        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <Cpu className="size-3 text-[#2B170E]" />
                              Hardware Telemetry
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#2B170E] font-semibold bg-[#E2C8A8]/60 px-2 py-0.5 rounded border border-[#CDBBA8]">
                              <span className="size-1.5 rounded-full bg-[#C79C70] animate-pulse" />
                              Reader 0 Active
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-lg bg-card/80 p-2 border border-border/60">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Station &amp; Pin
                              </span>
                              <span className="font-mono font-medium text-foreground">
                                Reader 0 (GPIO 27)
                              </span>
                            </div>
                            <div className="rounded-lg bg-card/80 p-2 border border-border/60">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Carrier Frequency
                              </span>
                              <span className="font-mono font-medium text-foreground">
                                13.56 MHz HF
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Streamlined Manual Card UID Input with Quick Test Tags - ONLY IN MOCK MODE */}
                        {isMock && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <label
                                htmlFor="rcv-uid"
                                className="font-medium text-foreground flex items-center gap-1"
                              >
                                <ScanLine className="size-3 text-primary" />
                                <span>Manual Card UID</span>
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  (Mock Mode)
                                </span>
                              </label>
                              {scanUid && (
                                <button
                                  type="button"
                                  onClick={() => setScanUid("")}
                                  className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer underline"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <div className="relative">
                              <Input
                                id="rcv-uid"
                                value={scanUid}
                                onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                className="font-mono bg-background tracking-wider uppercase text-xs h-9 pl-8"
                                placeholder="e.g. 04EE5566 or BB4A0003"
                              />
                              <Radio className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                            </div>

                            {/* Random UID generator button & Quick test tag chips */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setScanUid(generateFreshUid())}
                                className="h-7 text-[11px] font-mono gap-1 cursor-pointer bg-card border-border hover:bg-accent hover:border-primary/50 text-foreground"
                                title="Generate a random UID into the box"
                              >
                                <Sparkles className="size-3 text-primary" />
                                Random UID
                              </Button>

                              <span className="text-[10px] text-muted-foreground ml-1">
                                Quick test tag:
                              </span>
                              {["04EE5566", "BB4A0003", "04A1B299"].map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => setScanUid(chip)}
                                  className={cn(
                                    "font-mono text-[10px] rounded border px-1.5 py-0.5 cursor-pointer transition-colors",
                                    scanUid === chip
                                      ? "bg-primary text-primary-foreground border-primary font-bold"
                                      : "bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 border-border",
                                  )}
                                >
                                  {chip}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                        <Button
                          disabled={pending}
                          onClick={handleExecuteScan}
                          className={cn(
                            "relative h-9 px-4 font-semibold text-xs text-primary-foreground shadow-xs transition-all duration-200 cursor-pointer",
                            pending
                              ? "bg-primary/80 cursor-wait"
                              : "bg-primary hover:bg-primary/90 hover:shadow-sm active:scale-[0.99]",
                          )}
                        >
                          {pending ? (
                            <>
                              <span className="relative flex size-2 mr-1.5">
                                <span className="animate-ping absolute inline-flex size-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full size-2 bg-white"></span>
                              </span>
                              {isMock ? "Simulating RFID Scan..." : "Listening for Card (35s)..."}
                            </>
                          ) : isMock ? (
                            <>
                              <ScanLine className="size-3.5 mr-1.5" />
                              Simulate RFID Scan {scanUid.trim() ? `(${scanUid.trim()})` : "(Auto UID)"}
                            </>
                          ) : (
                            <>
                              <Radio className="size-3.5 mr-1.5" />
                              Catch Hardware Scan
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={handleCancelContext}
                          className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="size-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* STATE 4: SCAN SUCCESSFUL (COMPACT LOT SUMMARY)                */}
                  {/* ------------------------------------------------------------- */}
                  {isScanSuccess && lastOutcome && (
                    <div className="flex flex-1 flex-col justify-between space-y-3.5 animate-fade-in-up">
                      <div className="space-y-3">
                        {/* Success Header Banner */}
                        <div className="flex items-start gap-2.5 rounded-xl border border-[#CDBBA8] bg-[#F2E4D2]/40 p-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E2C8A8]/60 text-[#2B170E] border border-[#CDBBA8]">
                            <CheckCircle2 className="size-4.5" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs font-bold text-[#2B170E]">
                                RFID Card Successfully Bound!
                              </h3>
                              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                <Clock className="size-3" />
                                {fmt.dateTime(lastOutcome.at)}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#6E5748]">
                              Card UID{" "}
                              <span className="font-mono font-bold text-[#2B170E]">
                                {lastOutcome.uid}
                              </span>{" "}
                              linked to lot{" "}
                              <span className="font-mono font-bold text-foreground">
                                {boundLot?.id || lastOutcome.subjectId}
                              </span>
                              .
                            </p>
                          </div>
                        </div>

                        {/* Compact Scanned Details Card */}
                        <div className="rounded-xl border border-border/80 bg-card/80 p-3 space-y-2 text-xs shadow-2xs">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="space-y-0.5">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Material
                              </span>
                              <p className="font-medium text-foreground truncate">
                                {boundLot?.material || "Standard cotton poplin"}
                              </p>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Active Card UID
                              </span>
                              <span className="font-mono font-bold text-[#2B170E] inline-flex items-center gap-1">
                                <Radio className="size-3" />
                                {lastOutcome.uid}
                              </span>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Quantity
                              </span>
                              <p className="font-semibold text-foreground tabular-nums">
                                {boundLot
                                  ? `${boundLot.receivedQty} ${boundLot.unit ?? "m"}`
                                  : "25 m"}
                              </p>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Quality Status
                              </span>
                              {boundLot ? <StatusBadge status={boundLot.status} /> : "—"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
                        <Button
                          size="sm"
                          onClick={() => {
                            setLastOutcome(null);
                            setScanUid("");
                          }}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-8 cursor-pointer shadow-xs"
                        >
                          <Sparkles className="size-3 mr-1" />
                          Assign Next Bundle
                        </Button>

                        {boundLot && (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="text-xs h-8 cursor-pointer"
                          >
                            <AppLink href={paths.lot(boundLot.id)}>View Lot</AppLink>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* STATE 5: SCAN FAILED / REJECTED                               */}
                  {/* ------------------------------------------------------------- */}
                  {isScanFailed && lastOutcome && (
                    <div className="flex flex-1 flex-col justify-between space-y-3.5 animate-fade-in-up">
                      <div className="space-y-3">
                        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/35 bg-gradient-to-r from-destructive/15 via-destructive/5 to-transparent p-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                            <XCircle className="size-4.5" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs font-bold text-destructive">
                                Scan Not Completed
                              </h3>
                              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                <Clock className="size-3" />
                                {fmt.dateTime(lastOutcome.at)}
                              </span>
                            </div>
                            <p className="text-[11px] text-foreground/90 font-medium leading-snug">
                              {lastOutcome.rejectReason ||
                                "Hardware scan timed out or was rejected by workstation rules."}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 text-xs text-muted-foreground">
                          <p className="text-[11px] leading-relaxed">
                            Ensure tag is within 3-5 cm of Reader 0 (GPIO 27) and not assigned to
                            another lot.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                        <Button
                          size="sm"
                          onClick={() => {
                            setLastOutcome(null);
                            if (activeCtx) {
                              void handleExecuteScan();
                            } else {
                              handlePrepareContext();
                            }
                          }}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs h-8 cursor-pointer shadow-xs"
                        >
                          <RotateCcw className="size-3 mr-1" />
                          Try Again
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setLastOutcome(null);
                            setScanUid("");
                          }}
                          className="text-xs h-8 cursor-pointer"
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </div>

            {/* ========================================================= */}
            {/* WAREHOUSE FABRIC LOTS & CARD ENROLLMENT TABLE             */}
            {/* ========================================================= */}
            <Section
              title={
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-primary" />
                  <span>Registered Fabric Lots &amp; Bundle Card Status</span>
                </div>
              }
              actions={
                <span className="text-xs text-muted-foreground">
                  Total Lots: <strong className="text-foreground">{lots.length}</strong>
                </span>
              }
              className="shadow-xs transition-shadow duration-200 hover:shadow-sm"
            >
              <DataTable
                rows={lots}
                rowKey={(l) => l.id}
                empty="No fabric lots recorded."
                columns={[
                  {
                    header: "Lot Code",
                    cell: (l) => <IdLink href={paths.lot(l.id)} id={l.id} />,
                  },
                  {
                    header: "Fabric Material",
                    cell: (l) => (
                      <div>
                        <p className="font-medium text-xs sm:text-sm">{l.material}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Ref: {l.supplierRef}
                        </p>
                      </div>
                    ),
                  },
                  {
                    header: "Stock Balance",
                    cell: (l) => (
                      <span className="font-semibold tabular-nums text-xs">
                        {l.balanceQty} / {l.receivedQty} {l.unit ?? "m"}
                      </span>
                    ),
                  },
                  {
                    header: "Bundle Card (Station 1)",
                    cell: (l) =>
                      l.rfidUid ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#2B170E] bg-[#E2C8A8]/60 border border-[#CDBBA8] px-2 py-0.5 rounded shadow-2xs">
                          <Radio className="size-3" /> {l.rfidUid}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic bg-muted/60 px-2 py-0.5 rounded border border-dashed">
                          Unassigned
                        </span>
                      ),
                  },
                  {
                    header: "Incoming QC",
                    cell: (l) => <StatusBadge status={l.status} />,
                  },
                ]}
              />
            </Section>
          </div>
        );
      }}
    </Loadable>
  );
}
