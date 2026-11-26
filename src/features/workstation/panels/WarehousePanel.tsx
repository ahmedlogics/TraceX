import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Eye,
  Layers,
  Package as PkgIcon,
  Radio,
  RotateCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode } from "@/lib/data/provider";
import { useMe } from "@/features/shared/useMe";

const defaultBins = [
  { id: "BIN-A1", label: "Bin A1 — Standard Hang / Classic Poplin", capacity: 50 },
  { id: "BIN-A2", label: "Bin A2 — Standard Fold / Classic Poplin", capacity: 50 },
  { id: "BIN-B1", label: "Bin B1 — Trousers / Bottoms", capacity: 40 },
  { id: "BIN-B2", label: "Bin B2 — Outerwear / Heavyweight", capacity: 30 },
  { id: "BIN-BULK-1", label: "Bulk Staging Bin 1", capacity: 100 },
];

export function WarehousePanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();

  // Queries placed at top of component
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  const [activeTab, setActiveTab] = useState<"awaiting" | "received">("awaiting");

  // Selected carton for read-only manifest inspection modal
  const [manifestCarton, setManifestCarton] = useState<any | null>(null);

  // Hardware scanner arming state for Live API mode
  const [isArmed, setIsArmed] = useState<boolean>(false);

  // Destination Storage Bin state (defaults to BIN-A1; no manual selection required)
  const initialBinId =
    (stationData.activeContext?.payload as any)?.binId ||
    (stationData.activeContext?.payload as any)?.warehouseBinId ||
    "BIN-A1";
  const [selectedBinId, setSelectedBinId] = useState<string>(initialBinId);

  // Manual entry ONLY for Mock Mode test simulation
  const [scanUid, setScanUid] = useState("");
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  const isAuthorized =
    me.role === "M" || me.role === "L" || me.role === "A" || me.department === "warehouse";
  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  // Centralized box intake scan processor
  const handleBoxScan = async (rawUid: string) => {
    const uid = rawUid.trim().toUpperCase();
    if (!uid || pending || !isAuthorized) return;

    void run(
      (c) => c.warehouseIntake(uid, selectedBinId),
      (outcome) => {
        setLocalLastOutcome(outcome);
        setScanUid("");
        void qFulfilment.refetch();
        void qGarments.refetch();
        if (outcome.resolution === "accepted") {
          setActiveTab("received");
          return (
            outcome.productName ||
            `✓ Box ${outcome.garmentCode || uid} received into ${selectedBinId}.`
          );
        }
        return outcome.rejectReason || "Intake rejected.";
      },
    );
  };

  // Auto-detect scans arriving via MQTT/backend hardware reader on Station 8
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    const outcome = stationData.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      setLocalLastOutcome(outcome);
      void qFulfilment.refetch();
      void qGarments.refetch();
      if (outcome.resolution === "accepted") {
        setActiveTab("received");
      }
    }
  }, [stationData.lastScanOutcome, qFulfilment, qGarments]);

  // Global USB Keyboard Wedge RFID reader listener for Station 8
  // Operates without focusing any input: physical reader scan automatically ingests the box
  useEffect(() => {
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
        if (scanned) {
          void handleBoxScan(scanned);
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isArmed, selectedBinId, pending, isAuthorized]);

  // Sync bin selection with station context so hardware RFID scans route to selected bin
  const handleBinChange = (newBinId: string) => {
    setSelectedBinId(newBinId);
    void run((c) =>
      c.prepareActionContext(
        "warehouse",
        "warehouse_receive",
        { kind: "warehouse_receive", binId: newBinId } as any,
      ),
    );
  };

  // Helper to extract carton ID, failure reason, garment count and affected garment
  const getOutcomeDetails = (outcome: ScanOutcome, packages: any[]) => {
    const cartonId = outcome.garmentCode ?? outcome.subjectId ?? outcome.uid;
    const isAccepted = outcome.resolution === "accepted";

    // Lookup package in records for accurate garment count
    const matchedPkg = packages.find(
      (p: any) =>
        p.code === cartonId ||
        p.id === cartonId ||
        p.code === outcome.uid ||
        p.id === outcome.subjectId,
    );

    // Extract count from matched package or outcome message
    let garmentCount = matchedPkg?.garmentIds?.length ?? matchedPkg?.garmentDetails?.length;
    if (garmentCount === undefined && outcome.productName) {
      const match = outcome.productName.match(/(\d+)\s+Garments/i);
      if (match) garmentCount = Number(match[1]);
    }

    // Extract affected garment if embedded in contextId or rejectReason
    let affectedGarment = outcome.contextId;
    if (!affectedGarment && outcome.rejectReason) {
      const match = outcome.rejectReason.match(/Affected garment:?\s*([A-Z0-9_-]+)/i);
      if (match) affectedGarment = match[1];
    }

    return {
      cartonId,
      isAccepted,
      garmentCount,
      affectedGarment,
      reason: outcome.rejectReason || "Validation failed.",
      title: isAccepted
        ? (outcome.productName ?? "Box Received Successfully — Garments Moved to Warehouse.")
        : "On Hold / Warehouse Intake Blocked",
    };
  };

  return (
    <Loadable query={qFulfilment}>
      {(fulfilment) => {
        const allPackages = fulfilment.packages || [];
        const sealedAwaitingIntake = allPackages.filter(
          (p: any) => p.status === "sealed" || p.status === "packed",
        );
        const receivedCartons = allPackages.filter((p: any) => p.status === "warehoused");

        // Lookup map for garment details
        const garmentsList = qGarments.data || [];
        const garmentMap = new Map(garmentsList.map((g) => [g.id, g]));

        return (
          <div className="space-y-6">
            {/* Top Row: Bin Selection & Live Scan Result */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left Column: Carton Intake Console */}
              <Section title="Carton Intake">
                <div className="rounded-lg border bg-card p-5 space-y-4">
                  {/* Scanner 8 Status */}
                  <div className="flex items-center justify-between text-xs pb-2 border-b">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#2B170E]">
                      <span className="size-2 rounded-full bg-[#C79C70] animate-pulse" />
                      Scanner 8 {isArmed ? "Armed & Listening" : "Active"}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      Station 8 · Finished Goods Intake
                    </span>
                  </div>

                  {/* Destination Storage Bin Selection (Defaults to BIN-A1; zero manual selection required) */}
                  <Field label="Destination Storage Bin" htmlFor="wh-bin">
                    <NativeSelect
                      id="wh-bin"
                      value={selectedBinId}
                      onChange={(v) => handleBinChange(v)}
                      options={defaultBins.map((b) => ({
                        value: b.id,
                        label: `${b.id} — ${b.label}`,
                      }))}
                    />
                  </Field>

                  {/* LIVE API MODE: Hardware Scan Button & Arming State (NO MANUAL UID INPUT) */}
                  {!isMock ? (
                    <div className="pt-2 border-t space-y-3">
                      {!isArmed ? (
                        <div className="space-y-2">
                          <Button
                            size="lg"
                            className="w-full text-base font-bold shadow-md gap-2 h-12 bg-primary hover:bg-primary/90"
                            disabled={pending || !isAuthorized}
                            onClick={() => {
                              setIsArmed(true);
                              void run((c) =>
                                c.prepareActionContext(
                                  "warehouse",
                                  "warehouse_receive",
                                  { kind: "warehouse_receive", binId: selectedBinId } as any,
                                ),
                              );
                            }}
                          >
                            <ScanLine className="size-5" />
                            Scan Box Tag on Hardware
                          </Button>
                          <p className="text-xs text-muted-foreground text-center">
                            Click above to arm Scanner 8, then tap the physical carton RFID tag against the reader.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-[#C79C70] bg-[#E2C8A8]/30 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#2B170E]">
                              <Radio className="size-4 animate-spin text-[#6E5748]" />
                              Scanner 8 Armed &amp; Listening for Box Tag
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-muted-foreground/30 hover:bg-muted"
                              onClick={() => setIsArmed(false)}
                            >
                              Disarm
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Present the master shipping box RFID tag to Scanner 8 hardware. On hardware scan, the carton and all member garments will be automatically received into <strong className="text-foreground">{selectedBinId}</strong>.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* MOCK MODE: Manual UID Simulation & Quick Chips for Testing */
                    <div className="pt-2 border-t space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground">
                          Simulate Box RFID Scan (Mock Mode)
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="master-box-scan-input"
                            value={scanUid}
                            onChange={(e) => setScanUid(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (scanUid.trim()) void handleBoxScan(scanUid);
                              }
                            }}
                            placeholder="Enter Box RFID tag UID or ID..."
                            className="font-mono text-xs flex-1"
                            disabled={pending}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="text-xs h-9 px-4 font-semibold"
                            disabled={pending || !scanUid.trim()}
                            onClick={() => void handleBoxScan(scanUid)}
                          >
                            Receive Box
                          </Button>
                        </div>
                      </div>

                      {/* Candidate Quick Selection Chips for Sealed Boxes */}
                      {sealedAwaitingIntake.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[11px] text-muted-foreground">
                            Candidate Sealed Cartons (1-Click Test):
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {sealedAwaitingIntake.map((p) => {
                              const tagVal = (p as any).rfidUid || (p as any).code || p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-xs font-mono font-semibold text-primary cursor-pointer transition-colors"
                                  onClick={() => {
                                    setScanUid(tagVal);
                                    void handleBoxScan(tagVal);
                                  }}
                                  title={`Click to simulate intake: ${p.id}`}
                                >
                                  <Sparkles className="size-3" />
                                  {(p as any).code || p.id}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isAuthorized && (
                    <ScopeNote>
                      Only Warehouse staff or Managers can process inbound cartons.
                    </ScopeNote>
                  )}
                </div>
              </Section>

              {/* Right Column: Live Scan Result */}
              <Section title="Live Scan Result">
                {lastOutcome ? (
                  (() => {
                    const details = getOutcomeDetails(lastOutcome, allPackages);
                    return (
                      <div
                        className={`rounded-lg border p-4 shadow-sm transition-all ${
                          details.isAccepted
                            ? "border-[#CDBBA8] bg-[#F2E4D2]/40 text-[#2B170E]"
                            : "border-destructive/40 bg-destructive/10 text-destructive"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {details.isAccepted ? (
                            <ShieldCheck className="size-6 text-[#2B170E] shrink-0 mt-0.5" />
                          ) : (
                            <ShieldAlert className="size-6 text-destructive shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-2.5 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold tracking-tight">
                                {details.title}
                              </p>
                              <span
                                className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                                  details.isAccepted
                                    ? "bg-[#E2C8A8]/60 text-[#2B170E] border-[#CDBBA8]"
                                    : "bg-destructive/20 text-destructive border-destructive/40"
                                }`}
                              >
                                {details.isAccepted ? "Accepted" : "Blocked"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground font-medium">Box ID:</span>{" "}
                                <span className="font-mono font-bold text-foreground">
                                  {details.cartonId}
                                </span>
                              </div>

                              <div>
                                <span className="text-muted-foreground font-medium">Garments:</span>{" "}
                                <span className="font-semibold text-foreground">
                                  {details.garmentCount !== undefined
                                    ? `${details.garmentCount} garment${details.garmentCount !== 1 ? "s" : ""}`
                                    : "—"}
                                </span>
                              </div>
                            </div>

                            {!details.isAccepted && (
                              <div className="text-xs space-y-1 rounded bg-destructive/10 p-2 border border-destructive/20">
                                <div>
                                  <span className="font-semibold text-destructive">Reason:</span>{" "}
                                  <span className="font-medium text-destructive">
                                    {details.reason}
                                  </span>
                                </div>
                                {details.affectedGarment && (
                                  <div>
                                    <span className="font-semibold text-destructive">Affected Garment:</span>{" "}
                                    <span className="font-mono font-bold text-destructive">
                                      {details.affectedGarment}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t text-[11px] font-mono text-muted-foreground">
                              <div>
                                <span className="font-semibold text-foreground/80">Destination Bin:</span>{" "}
                                {selectedBinId}
                              </div>
                              <div>
                                <span className="font-semibold text-foreground/80">Timestamp:</span>{" "}
                                {fmt.dateTime(lastOutcome.at)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    <PkgIcon className="size-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-medium">
                      Waiting for Master Box RFID scan on Scanner 8.
                    </p>
                  </div>
                )}
              </Section>
            </div>

            {/* Bottom Section: Cartons Overview (Tabs: Sealed Awaiting Intake & Received Cartons) */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "awaiting" | "received")}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-2">
                <TabsList>
                  <TabsTrigger value="awaiting" className="gap-2">
                    <Boxes className="size-4" />
                    Sealed Cartons Awaiting Intake ({sealedAwaitingIntake.length})
                  </TabsTrigger>
                  <TabsTrigger value="received" className="gap-2">
                    <Warehouse className="size-4" />
                    Received Cartons ({receivedCartons.length})
                  </TabsTrigger>
                </TabsList>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void qFulfilment.refetch();
                    void qGarments.refetch();
                  }}
                  className="gap-1.5 self-end text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCw className="size-3.5" /> Refresh
                </Button>
              </div>

              {/* TAB 1: Sealed Cartons Awaiting Intake */}
              <TabsContent value="awaiting" className="space-y-4 mt-0">
                <Section title="Sealed Cartons Awaiting Intake">
                  <DataTable
                    rows={sealedAwaitingIntake}
                    rowKey={(p) => p.id}
                    empty="No sealed cartons awaiting warehouse intake. Pack and seal cartons at Packaging (Station 7) first."
                    columns={[
                      {
                        header: "Box ID / Tag",
                        cell: (p) => (
                          <div className="space-y-0.5">
                            <span className="wt-id font-mono font-bold text-foreground">
                              {(p as any).code || p.id}
                            </span>
                            {p.rfidUid && (
                              <div className="text-[11px] font-mono text-primary font-semibold">
                                RFID: {p.rfidUid}
                              </div>
                            )}
                          </div>
                        ),
                      },
                      {
                        header: "Garments Count",
                        cell: (p) => (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-xs">
                            <Layers className="size-3.5 text-muted-foreground" />
                            {p.garmentIds?.length || 0} garment{p.garmentIds?.length !== 1 ? "s" : ""}
                          </span>
                        ),
                      },
                      {
                        header: "Status",
                        cell: (p) => <StatusBadge status={p.status} />,
                      },
                      {
                        header: "Packed Timestamp",
                        cell: (p) => fmt.dateTime(p.createdAt),
                      },
                      {
                        header: "Actions",
                        cell: (p) => {
                          const targetTag = (p as any).rfidUid || (p as any).code || p.id;
                          return (
                            <div className="flex items-center gap-2">
                              {/* In Mock Mode, provide 1-click test intake button */}
                              {isMock && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs gap-1.5 bg-[#D8B68F] hover:bg-[#C79C70] text-[#2B170E] border border-[#CDBBA8] font-semibold shadow-xs"
                                  disabled={pending || !isAuthorized}
                                  onClick={() => {
                                    setScanUid(targetTag);
                                    void handleBoxScan(targetTag);
                                  }}
                                >
                                  <Warehouse className="size-3.5" /> Intake Box
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1.5"
                                onClick={() => setManifestCarton(p)}
                              >
                                <Eye className="size-3.5" /> Manifest
                              </Button>
                            </div>
                          );
                        },
                      },
                    ]}
                  />
                </Section>
              </TabsContent>

              {/* TAB 2: Received Cartons with Storage Bin & Received Timestamp */}
              <TabsContent value="received" className="space-y-4 mt-0">
                <Section title="Received Cartons">
                  <DataTable
                    rows={receivedCartons}
                    rowKey={(p) => p.id}
                    empty="No cartons currently in warehouse storage."
                    columns={[
                      {
                        header: "Box ID / Tag",
                        cell: (p) => (
                          <div className="space-y-0.5">
                            <span className="wt-id font-mono font-bold text-foreground">
                              {(p as any).code || p.id}
                            </span>
                            {p.rfidUid && (
                              <div className="text-[11px] font-mono text-primary font-semibold">
                                RFID: {p.rfidUid}
                              </div>
                            )}
                          </div>
                        ),
                      },
                      {
                        header: "Storage Bin",
                        cell: (p) => (
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted font-bold text-primary">
                            {(p as any).binCode ||
                              (p as any).warehouse_stock?.warehouse_bins?.code ||
                              "BIN-A1"}
                          </span>
                        ),
                      },
                      {
                        header: "Received Timestamp",
                        cell: (p) => fmt.dateTime(p.createdAt),
                      },
                      {
                        header: "Garments Count",
                        cell: (p) => (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-xs">
                            <Layers className="size-3.5 text-muted-foreground" />
                            {p.garmentIds?.length || 0} garment{p.garmentIds?.length !== 1 ? "s" : ""}
                          </span>
                        ),
                      },
                      {
                        header: "Status",
                        cell: (p) => <StatusBadge status={p.status} />,
                      },
                      {
                        header: "Manifest",
                        cell: (p) => (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => setManifestCarton(p)}
                          >
                            <Eye className="size-3.5" /> View Manifest
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Section>
              </TabsContent>
            </Tabs>

            {/* Read-Only Carton Manifest Dialog */}
            <Dialog
              open={Boolean(manifestCarton)}
              onOpenChange={(open) => {
                if (!open) setManifestCarton(null);
              }}
            >
              {manifestCarton && (
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <PkgIcon className="size-5 text-primary" />
                      Carton Manifest · {(manifestCarton as any).code || manifestCarton.id}
                    </DialogTitle>
                    <DialogDescription>
                      Read-only manifest of member garments packed inside this carton.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 pt-2">
                    {/* Carton Summary Header */}
                    <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
                      <div>
                        <span className="text-muted-foreground font-medium">Box Tag:</span>{" "}
                        <span className="font-mono font-bold text-foreground">
                          {(manifestCarton as any).code || manifestCarton.id}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Storage Bin:</span>{" "}
                        <span className="font-mono font-bold text-primary">
                          {(manifestCarton as any).binCode ||
                            (manifestCarton as any).warehouse_stock?.warehouse_bins?.code ||
                            "Awaiting intake"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Garments:</span>{" "}
                        <span className="font-semibold text-foreground">
                          {manifestCarton.garmentIds?.length || 0} units
                        </span>
                      </div>
                    </div>

                    {/* Member Garments Table */}
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted text-muted-foreground font-semibold border-b">
                          <tr>
                            <th className="p-2.5">#</th>
                            <th className="p-2.5">Garment Code</th>
                            <th className="p-2.5">Product Style</th>
                            <th className="p-2.5">Size</th>
                            <th className="p-2.5">Stage</th>
                            <th className="p-2.5">QC Disposition</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(manifestCarton.garmentDetails || manifestCarton.garmentIds || []).map(
                            (item: any, idx: number) => {
                              const code = typeof item === "string" ? item : item.code || item.id;
                              const matchedGarment = garmentMap.get(code);
                              const styleName =
                                matchedGarment?.productName ||
                                (typeof item === "object" ? item.productName : "Garment");
                              const stage =
                                matchedGarment?.stage ||
                                (typeof item === "object"
                                  ? item.stage
                                  : manifestCarton.status === "warehoused"
                                  ? "warehouse"
                                  : "packed");
                              const disp =
                                matchedGarment?.disposition ||
                                (typeof item === "object" ? item.disposition : "released");
                              const size =
                                (matchedGarment as any)?.size ||
                                (typeof item === "object" && item.size ? item.size : "M");

                              return (
                                <tr key={code || idx} className="hover:bg-muted/40 transition-colors">
                                  <td className="p-2.5 font-mono text-muted-foreground">{idx + 1}</td>
                                  <td className="p-2.5 font-mono font-bold text-foreground">{code}</td>
                                  <td className="p-2.5 font-medium">{styleName}</td>
                                  <td className="p-2.5 font-mono">{size}</td>
                                  <td className="p-2.5">
                                    <StatusBadge status={stage} />
                                  </td>
                                  <td className="p-2.5">
                                    <StatusBadge
                                      status={disp}
                                      tone={disp === "held" ? "danger" : "success"}
                                    />
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </DialogContent>
              )}
            </Dialog>
          </div>
        );
      }}
    </Loadable>
  );
}
