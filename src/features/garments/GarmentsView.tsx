import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Clock, ExternalLink, OctagonAlert, Package, Radio, ScanLine, Scissors, Shirt, Tag, Zap } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { FilterBar, NativeSelect, SearchInput } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { LifecycleStage, ScanOutcome } from "@/domain/types";
import { can } from "@/domain/permissions";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode } from "@/lib/data/provider";
import { useMe } from "@/features/shared/useMe";
import { NfcHubView } from "@/features/nfc/NfcHubView";

const stages: LifecycleStage[] = [
  "cutting",
  "stitching",
  "stitched",
  "finishing",
  "finished",
  "final-qc",
  "rework",
  "packing",
  "warehouse",
  "allocated",
  "dispatched",
];

export function GarmentsView() {
  const me = useMe();
  const isMock = getDataMode() === "mock";
  const isStitching = me?.department === "stitching" || me?.username === "stitching.demo";
  const isFinishing = me?.department === "finishing" || me?.username === "finishing.demo";
  const activeStationCode: "stitching" | null = isStitching ? "stitching" : null;

  const canAccessNfc = can.accessNfcHub(me);
  const q = useWtQuery(["garments"], (c) => c.listGarments());
  const { run, pending } = useWtAction();
  const [scanInput, setScanInput] = useState("");
  const [awaitingHardware, setAwaitingHardware] = useState(false);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [disposition, setDisposition] = useState("all");
  const [activeTab, setActiveTab] = useState<"register" | "nfc">("register");
  const [recentScanOutcome, setRecentScanOutcome] = useState<ScanOutcome | null>(null);
  const [completedIds, setCompletedIds] = useState<Record<string, boolean>>({});

  // Poll hardware station data for Station 4 (Stitching) or Station 5 (Finishing)
  const qStation = useWtQuery(
    ["rfid-station", activeStationCode ?? "stitching"],
    (c) => c.getRfidStationData((activeStationCode ?? "stitching") as any),
    {
      enabled: !!activeStationCode,
      refetchInterval: 1200,
    },
  );

  // Auto-detect scans arriving via MQTT/backend hardware reader
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeStationCode) return;
    const outcome = qStation.data?.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      setRecentScanOutcome(outcome);
      void q.refetch();
    }
  }, [activeStationCode, qStation.data?.lastScanOutcome, q]);

  // Global USB Keyboard Wedge RFID reader listener for Station 4 & 5
  // Enables hardware scanner to automatically capture card UID without any manual typing or selecting
  useEffect(() => {
    if (!activeStationCode) return;
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
          void run(
            (c) => c.routineScan(scanned, activeStationCode),
            (outcome) => {
              setRecentScanOutcome(outcome);
              void q.refetch();
              const stationLabel = activeStationCode === "finishing" ? "Finishing" : "Stitching";
              const targetStatus = activeStationCode === "finishing" ? "Finished" : "Stitched";
              if (outcome.resolution === "accepted") {
                return `✓ Garment ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName ?? "Garment"}) ${stationLabel} complete! Status updated to ${targetStatus}.`;
              }
              return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
            },
          );
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeStationCode, q, run]);

  const effectiveTab = canAccessNfc ? activeTab : "register";
  const activeOutcome = recentScanOutcome ?? qStation.data?.lastScanOutcome ?? null;

  return (
    <>
      <PageHeader
        title={effectiveTab === "nfc" ? "NFC Tag Programming & Localtunnel Hub" : "Garment Registry & Production Status"}
        actions={
          canAccessNfc ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={effectiveTab === "nfc" ? "default" : "outline"}
                onClick={() => setActiveTab(effectiveTab === "nfc" ? "register" : "nfc")}
                className={`text-xs font-semibold h-8 ${
                  effectiveTab === "nfc" ? "bg-primary" : "text-primary border-primary/25 hover:bg-primary/5"
                }`}
              >
                <Zap className="size-3.5 mr-1" />
                {effectiveTab === "nfc" ? "Switch to Garment Register" : "⚡ NFC Localtunnel Hub"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {canAccessNfc && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-6">
          <div className="inline-flex rounded-lg border bg-muted/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("register")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                effectiveTab === "register"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shirt className="size-3.5" /> Garment Production Register
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("nfc")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                effectiveTab === "nfc"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="size-3.5" /> ⚡ NFC Tag Hub & Localtunnel Links
            </button>
          </div>
        </div>
      )}

      {effectiveTab === "nfc" && canAccessNfc ? (
        <NfcHubView />
      ) : (
      <Loadable query={q}>
        {(gs) => {
          const inAssembly = gs.filter((g) => g.stage === "stitching" || g.stage === "finishing").length;
          const awaitingQc = gs.filter((g) => g.disposition === "awaiting-inspection" || g.disposition === "not-inspected").length;
          const heldCount = gs.filter((g) => !!g.hold).length;
          const releasedCount = gs.filter((g) => g.disposition === "released").length;

          const rows = gs.filter((g) => {
            // For stitching operators: show only garments approved and cut by Cutting (or completed in session)
            if (isStitching && stage === "all") {
              const isRelevant =
                (((g.stage as string) === "cut" || g.stage === "stitching" || g.stage === "stitched") ||
                  Boolean(completedIds[g.id])) &&
                Boolean(g.rfidUid);
              if (!isRelevant) return false;
            }
            // For finishing operators: show only garments completed at Stitching (or completed in session)
            if (isFinishing && stage === "all") {
              const isRelevant =
                ((g.stage === "stitched" || g.stage === "finishing" || g.stage === "finished") ||
                  Boolean(completedIds[g.id])) &&
                Boolean(g.rfidUid);
              if (!isRelevant) return false;
            }

            const matchesStage = stage === "all" || g.stage === stage;
            const matchesDisp =
              disposition === "all" ||
              (disposition === "held" ? !!g.hold : g.disposition === disposition);
            const matchesSearch =
              search.trim() === "" ||
              `${g.id} ${g.orderId} ${g.productName} ${g.rfidUid ?? ""} ${g.publicId}`
                .toLowerCase()
                .includes(search.toLowerCase());
            return matchesStage && matchesDisp && matchesSearch;
          });

          // Find next garment ready for this station's operation
          const nextReadyGarment = gs.find(
            (g: Garment) =>
              (activeStationCode === "finishing"
                ? g.stage === "stitched" || g.stage === "finishing"
                : (g.stage as string) === "cut" || g.stage === "stitching") &&
              Boolean(g.rfidUid) &&
              !g.hold &&
              !completedIds[g.id],
          );

          return (
            <div className="space-y-6">
              {/* Station 4/5 Stitching & Finishing Live Hardware Reader / Simulation Status */}
              {activeStationCode && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                        <Radio className="size-5 animate-pulse" />
                        <span className="absolute -top-1 -right-1 flex size-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex size-3 rounded-full bg-success" />
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-foreground">
                            {isMock
                              ? activeStationCode === "finishing"
                                ? "Station 5 — Finishing Line Simulation"
                                : "Station 4 — Stitching Line Simulation"
                              : activeStationCode === "finishing"
                                ? "Station 5 — Finishing Line Reader (Live Scanner 5 Active)"
                                : "Station 4 — Stitching Line Reader (Live Scanner 4 Active)"}
                          </h2>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                              isMock
                                ? "bg-warning-soft text-warning border-warning/30"
                                : "bg-success-soft text-success border-success/30"
                            }`}
                          >
                            {isMock ? "Mock Simulation" : "Ready for Scans"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isMock
                            ? "Enter garment card UID or click Simulate Scan below to advance stitched garments to Finishing."
                            : activeStationCode === "finishing"
                              ? "Present physical garment tag to Scanner 5, or use the quick scan controls below."
                              : "Present physical garment tag to Scanner 4, or use the quick scan controls below."}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isMock ? (
                        <>
                          <Input
                            value={scanInput}
                            onChange={(e) => setScanInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const targetUid = scanInput.trim() || nextReadyGarment?.rfidUid || "";
                                if (targetUid) {
                                  void run(
                                    (c) => c.routineScan(targetUid, activeStationCode),
                                    (outcome) => {
                                      setScanInput("");
                                      setRecentScanOutcome(outcome);
                                      void q.refetch();
                                      if (outcome.resolution === "accepted") {
                                        return activeStationCode === "finishing"
                                          ? `✓ Garment ${outcome.garmentCode ?? outcome.subjectId} Finished! Released to QC.`
                                          : `✓ Garment ${outcome.garmentCode ?? outcome.subjectId} Stitching complete! Advanced to Finishing.`;
                                      }
                                      return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
                                    },
                                  );
                                }
                              }
                            }}
                            placeholder="Scan or enter card UID..."
                            className="h-8 w-44 font-mono text-xs bg-card"
                          />
                          {nextReadyGarment && !scanInput && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-mono gap-1"
                              onClick={() => setScanInput(nextReadyGarment.rfidUid || "")}
                            >
                              Pre-fill Next ({nextReadyGarment.id})
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground"
                            disabled={pending}
                            onClick={() => {
                              const targetUid = scanInput.trim() || nextReadyGarment?.rfidUid || "";
                              if (targetUid) {
                                void run(
                                  (c) => c.routineScan(targetUid, activeStationCode),
                                  (outcome) => {
                                    setScanInput("");
                                    setRecentScanOutcome(outcome);
                                    void q.refetch();
                                    if (outcome.resolution === "accepted") {
                                      return activeStationCode === "finishing"
                                        ? `✓ Garment ${outcome.garmentCode ?? outcome.subjectId} Finished! Released to QC.`
                                        : `✓ Garment ${outcome.garmentCode ?? outcome.subjectId} Stitching complete! Advanced to Finishing.`;
                                    }
                                    return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
                                  },
                                );
                              }
                            }}
                          >
                            <ScanLine className="size-3.5" />
                            Simulate Scan {scanInput.trim() ? `(${scanInput.trim()})` : nextReadyGarment ? `(${nextReadyGarment.id})` : ""}
                          </Button>
                          {scanInput && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs px-2"
                              onClick={() => setScanInput("")}
                            >
                              Clear
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground"
                          disabled={pending}
                          onClick={() => {
                            setAwaitingHardware(true);
                            void run(
                              async (c) => {
                                const startTime = Date.now();
                                while (Date.now() - startTime < 35000) {
                                  const data = await c.getRfidStationData(activeStationCode);
                                  if (data.lastScanOutcome && data.lastScanOutcome.at !== lastSeenScanRef.current) {
                                    lastSeenScanRef.current = data.lastScanOutcome.at ?? null;
                                    setRecentScanOutcome(data.lastScanOutcome);
                                    void q.refetch();
                                    return data.lastScanOutcome;
                                  }
                                  await new Promise((r) => setTimeout(r, 1000));
                                }
                                throw new Error(
                                  `No hardware scan detected on Scanner ${activeStationCode === "finishing" ? 5 : 4} within 35 seconds. Please tap tag on reader.`,
                                );
                              },
                              (outcome) => {
                                setAwaitingHardware(false);
                                void q.refetch();
                                return outcome?.resolution === "accepted"
                                  ? activeStationCode === "finishing"
                                    ? `✓ Scan accepted: Garment ${outcome.garmentCode ?? outcome.subjectId} Finished! Released to QC.`
                                    : `✓ Scan accepted: Garment ${outcome.garmentCode ?? outcome.subjectId} Stitched! Advanced to Finishing.`
                                  : `Scan outcome: ${outcome?.rejectReason ?? outcome?.resolution ?? "Completed"}`;
                              },
                            ).finally(() => setAwaitingHardware(false));
                          }}
                        >
                          {awaitingHardware ? (
                            <>
                              <span className="relative flex h-2 w-2 mr-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                              </span>
                              Awaiting Card Tap on Scanner {activeStationCode === "finishing" ? 5 : 4}...
                            </>
                          ) : (
                            <>
                              <Radio className="size-3.5" /> Scan Product Tag (Hardware)
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {activeOutcome && (
                    <div
                      className={`rounded-lg border p-3 text-xs flex items-center justify-between gap-3 ${
                        activeOutcome.resolution === "accepted"
                          ? "border-success/40 bg-success-soft text-foreground"
                          : "border-destructive/40 bg-danger-soft text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {activeOutcome.resolution === "accepted" ? (
                          <CheckCircle2 className="size-4 text-success shrink-0" />
                        ) : (
                          <OctagonAlert className="size-4 text-destructive shrink-0" />
                        )}
                        <div>
                          <span className="font-bold">
                            {activeOutcome.resolution === "accepted"
                              ? `Scan Confirmed: ${activeOutcome.garmentCode ?? activeOutcome.subjectId}${
                                  activeOutcome.productName ? ` · ${activeOutcome.productName}` : ""
                                }`
                              : `Scan Rejected (${activeOutcome.uid})`}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {activeOutcome.resolution === "accepted"
                              ? activeStationCode === "finishing"
                                ? "· Finishing Complete → Status Updated to Finished"
                                : "· Stitching Complete → Status Updated to Stitched"
                              : `· ${activeOutcome.rejectReason ?? activeOutcome.resolution}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span>Tag: {activeOutcome.uid}</span>
                        {activeOutcome.at && <span>· {fmt.dateTime(activeOutcome.at)}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Metric Overview Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Total Garments</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                      <Tag className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{gs.length}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-accent-foreground/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">In Assembly</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground group-hover:scale-105 transition-transform">
                      <Scissors className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-primary">{inAssembly}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-success/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">QC Released</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-success">{releasedCount}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-destructive/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Quality Holds</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive group-hover:scale-105 transition-transform">
                      <OctagonAlert className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-destructive">{heldCount}</p>
                </div>
              </div>

              {/* Filter Bar */}
              <FilterBar>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search garment ID, RFID card, order, or product"
                  label="Search garments"
                />
                <div className="w-full sm:w-44">
                  <NativeSelect
                    ariaLabel="Filter by physical stage"
                    value={stage}
                    onChange={setStage}
                    options={[
                      { value: "all", label: "All Physical Stages" },
                      ...stages.map((s) => ({ value: s, label: `Stage: ${s}` })),
                    ]}
                  />
                </div>
                <div className="w-full sm:w-44">
                  <NativeSelect
                    ariaLabel="Filter by quality disposition"
                    value={disposition}
                    onChange={setDisposition}
                    options={[
                      { value: "all", label: "All Quality States" },
                      { value: "released", label: "Released Only" },
                      { value: "held", label: "On Hold Only" },
                      { value: "awaiting-inspection", label: "Awaiting Inspection" },
                      { value: "not-inspected", label: "Not Inspected" },
                    ]}
                  />
                </div>
              </FilterBar>

              <DataTable
                rows={rows}
                rowKey={(g) => g.id}
                empty="No garments match the selected filters."
                columns={[
                  {
                    header: "Garment Code",
                    cell: (g) => (
                      <div>
                        <IdLink href={paths.garment(g.id)} id={g.id} />
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{g.publicId}</p>
                      </div>
                    ),
                  },
                  {
                    header: "Product Specification",
                    cell: (g) => (
                      <div>
                        <p className="font-medium text-foreground text-xs sm:text-sm">{g.productName}</p>
                        {g.size && (
                          <span className="inline-flex rounded bg-muted px-1.5 py-0.2 text-[11px] font-medium text-muted-foreground mt-0.5">
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
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                          <Radio className="size-3" /> {g.rfidUid}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic bg-muted px-2 py-0.5 rounded">
                          Unassigned
                        </span>
                      ),
                  },
                  {
                    header: "Production Order",
                    cell: (g) => (
                      <AppLink href={paths.order(g.orderId)} className="wt-id text-xs hover:underline">
                        {g.orderId}
                      </AppLink>
                    ),
                  },
                  { header: "Physical Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                  {
                    header: "Quality Disposition",
                    cell: (g) => (
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={g.disposition} />
                        {g.hold && <HoldBadge />}
                      </div>
                    ),
                  },
                  {
                    header: "Actions",
                    cell: (g) => {
                      const isDone = Boolean(completedIds[g.id]);
                      if (isDone) {
                        return (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                            <CheckCircle2 className="size-3.5" /> Done
                          </span>
                        );
                      }

                      const canStitch =
                        (activeStationCode === "stitching" || isStitching) &&
                        ((g.stage as string) === "cut" || g.stage === "cutting" || g.stage === "stitching");
                      const canFinish =
                        (activeStationCode === "finishing" || isFinishing) &&
                        (g.stage === "stitched" || g.stage === "finishing");

                      return (
                        <div className="flex items-center gap-1.5">
                          {canStitch && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-primary text-primary-foreground font-semibold gap-1"
                              disabled={pending}
                              title={g.rfidUid ? `Scan Card ${g.rfidUid} to complete stitching` : "Scan product tag"}
                              onClick={() => {
                                const targetUid = g.rfidUid || scanInput.trim();
                                if (!targetUid) return;
                                void run(
                                  (c) => c.routineScan(targetUid, "stitching"),
                                  (outcome) => {
                                    setRecentScanOutcome(outcome);
                                    if (outcome.resolution === "accepted") {
                                      setCompletedIds((prev) => ({ ...prev, [g.id]: true }));
                                    }
                                    void q.refetch();
                                    if (outcome.resolution === "accepted") {
                                      return `✓ Garment ${g.id} Stitching complete! Advanced to Finishing.`;
                                    }
                                    return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
                                  }
                                );
                              }}
                            >
                              <Radio className="size-3" /> Scan &amp; Complete
                            </Button>
                          )}
                          {canFinish && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-primary text-primary-foreground font-semibold gap-1 shadow-xs"
                              disabled={pending}
                              title={g.rfidUid ? `Scan Card ${g.rfidUid} to finish and release to QC` : "Scan product tag on hardware"}
                              onClick={() => {
                                const targetUid = g.rfidUid || scanInput.trim();
                                if (!targetUid) return;
                                void run(
                                  (c) => c.routineScan(targetUid, "finishing"),
                                  (outcome) => {
                                    setRecentScanOutcome(outcome);
                                    if (outcome.resolution === "accepted") {
                                      setCompletedIds((prev) => ({ ...prev, [g.id]: true }));
                                    }
                                    void q.refetch();
                                    if (outcome.resolution === "accepted") {
                                      return `✓ Garment ${g.id} Finished! Released to QC.`;
                                    }
                                    return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
                                  }
                                );
                              }}
                            >
                              <Radio className="size-3" /> Scan &amp; Finish
                            </Button>
                          )}
                          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                            <AppLink href={paths.garment(g.id)}>
                              View <ArrowRight className="size-3 ml-1" />
                            </AppLink>
                          </Button>
                          {!isStitching && !isFinishing && (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs text-primary border-primary/20 hover:bg-primary/5" title="Open NFC Digital Passport">
                              <AppLink href={paths.publicJourney(g.publicId || g.id)} target="_blank" rel="noreferrer">
                                <ExternalLink className="size-3 mr-1" /> Passport
                              </AppLink>
                            </Button>
                          )}
                        </div>
                      );
                    },
                  },
                ]}
              />
            </div>
          );
        }}
      </Loadable>
      )}
    </>
  );
}
