import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  Eye,
  Layers,
  Package as PkgIcon,
  Radio,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Warehouse,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { fmt, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { Garment, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode } from "@/lib/data/provider";
import { useMe } from "@/features/shared/useMe";

interface WarehousedBoxDetails {
  boxId: string;
  rfidUid?: string;
  binId: string;
  status: string;
  garments: { id: string; productName?: string; size?: string; stage: string }[];
  scannedAt: string;
}

export function WarehousePanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();
  const [activeTab, setActiveTab] = useState<"awaiting" | "received">("awaiting");

  // Selected carton for read-only manifest inspection modal
  const [manifestCarton, setManifestCarton] = useState<any | null>(null);

  // Runtime Scanned Box Details & Outcome
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);
  const [warehousedBoxDetails, setWarehousedBoxDetails] = useState<WarehousedBoxDetails | null>(null);

  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  const isAuthorized =
    me.role === "M" || me.role === "L" || me.role === "A" || me.department === "warehouse";

  // Centralized hardware scan processor for box tags at Warehouse
  const handleProcessScan = async (rawUid: string) => {
    const uid = rawUid.trim().toUpperCase();
    if (!uid) return;

    void run(
      async (c) => {
        const binId = "BIN-A1";
        const outcome = await c.warehouseIntake(uid, binId);
        setLocalLastOutcome(outcome);

        if (outcome.resolution === "accepted") {
          const allPkgs = (await c.getFulfilment()).packages || [];
          const allGarments = await c.listGarments();

          // Resolve scanned package
          const pkg = allPkgs.find(
            (p: any) =>
              p.id.toUpperCase() === uid ||
              (p.rfidUid && p.rfidUid.toUpperCase() === uid) ||
              p.code?.toUpperCase() === uid ||
              p.id === outcome.subjectId ||
              p.id === outcome.garmentCode,
          );

          if (pkg) {
            const linkedGarments = pkg.garmentIds
              .map((gid: string) => allGarments.find((g) => g.id === gid))
              .filter(Boolean) as Garment[];

            setWarehousedBoxDetails({
              boxId: pkg.id,
              rfidUid: pkg.rfidUid || outcome.uid || uid,
              binId: (pkg as any).binCode || (pkg as any).warehouse_stock?.warehouse_bins?.code || binId,
              status: "warehoused",
              garments: linkedGarments.map((g) => ({
                id: g.id,
                productName: g.productName,
                size: g.size,
                stage: "warehouse",
              })),
              scannedAt: new Date().toLocaleTimeString(),
            });
          }
          void qFulfilment.refetch();
          void qGarments.refetch();
        } else {
          setWarehousedBoxDetails(null);
        }
        return outcome;
      },
      (outcome) =>
        outcome.resolution === "accepted"
          ? `✓ Box ${outcome.garmentCode ?? outcome.subjectId} received! Garments moved to Warehouse.`
          : `Intake rejected: ${outcome.rejectReason ?? outcome.resolution}`,
    );
  };

  // Auto-detect scans arriving via MQTT/backend hardware reader at Station 8 Warehouse
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    const outcome = stationData?.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      if (outcome.uid) {
        void handleProcessScan(outcome.uid);
      }
    }
  }, [isAuthorized, stationData?.lastScanOutcome]);

  // Global USB Keyboard Wedge RFID reader listener for Station 8 Warehouse reader
  // Enables warehouse scanner to automatically capture box tag UID without any manual typing or selecting
  useEffect(() => {
    if (!isAuthorized) return;
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
        if (scanned.length >= 3) {
          e.preventDefault();
          void handleProcessScan(scanned);
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthorized]);

  return (
    <Loadable query={qFulfilment}>
      {(fulfilment) => {
        // Real packages from PostgreSQL
        const allPackages = fulfilment.packages || [];
        const sealedAwaitingIntake = allPackages.filter((p: any) => p.status === "sealed");
        const receivedCartons = allPackages.filter((p: any) => p.status === "warehoused");

        return (
          <div className="space-y-6">
            {/* Station 8 Hardware Scanner Status Banner */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-center gap-2.5 text-primary font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                </span>
                <span>Scanner 8 Active · Station 8 Master Box Intake Reader</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-[11px]">
                  Scan carton RFID tag on hardware to intake. Nothing to select on screen.
                </span>
                {/* Discreet test button for mock simulation */}
                {isMock && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground/60 hover:text-foreground cursor-pointer"
                    onClick={() => void handleProcessScan("PKG-001")}
                    title="Simulate hardware scan for PKG-001 (Mock Mode)"
                  >
                    (Simulate PKG-001)
                  </Button>
                )}
              </div>
            </div>

            {/* Runtime Scanned Box Details Card (Dynamically displayed when hardware scan is processed) */}
            {warehousedBoxDetails && (
              <div className="rounded-xl border-2 border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-5 shadow-xs transition-all animate-in fade-in duration-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-emerald-500/20 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <PkgIcon className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-foreground font-mono">
                          Box {warehousedBoxDetails.boxId}
                        </h3>
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-background px-2 py-0.5 rounded border border-emerald-500/30">
                          <Radio className="size-3" /> {warehousedBoxDetails.rfidUid || "NFC/RFID Tag"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Carton scanned at Station 8 · Intaked into finished stock at {warehousedBoxDetails.scannedAt}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-bold shadow-2xs">
                      <CheckCircle2 className="size-3.5" /> Warehoused &amp; Stored
                    </span>
                    <button
                      type="button"
                      onClick={() => setWarehousedBoxDetails(null)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 cursor-pointer ml-1"
                    >
                      ✕ Dismiss
                    </button>
                  </div>
                </div>

                {/* Box Child Contents Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Linked Products Inside ({warehousedBoxDetails.garments.length} units):</span>
                    <span className="text-muted-foreground">
                      Destination Bin: <strong className="text-primary font-mono">{warehousedBoxDetails.binId}</strong>
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {warehousedBoxDetails.garments.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-xs shadow-2xs"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="font-mono font-bold text-foreground block truncate">{g.id}</span>
                          <span className="text-muted-foreground text-[11px] block truncate">
                            {g.productName || "Garment"} {g.size ? `(Size ${g.size})` : ""}
                          </span>
                        </div>
                        <StatusBadge status={g.stage as any} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Runtime Rejection Notification Banner */}
            {localLastOutcome && localLastOutcome.resolution !== "accepted" && (
              <div className="rounded-xl border border-destructive/50 bg-danger-soft p-4 shadow-xs text-foreground flex items-start justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-destructive">
                      Box Intake Rejected ({localLastOutcome.uid})
                    </h4>
                    <p className="text-xs font-medium">
                      {localLastOutcome.rejectReason || `Station rule violated: ${localLastOutcome.resolution}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalLastOutcome(undefined)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 cursor-pointer"
                >
                  ✕ Dismiss
                </button>
              </div>
            )}

            {/* Bottom Section: Cartons Overview (Tabs: Sealed Awaiting Intake & Received Cartons) */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "awaiting" | "received")}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-2">
                <TabsList>
                  <TabsTrigger value="awaiting" className="gap-2 cursor-pointer">
                    <Boxes className="size-4" />
                    Sealed Cartons Awaiting Intake ({sealedAwaitingIntake.length})
                  </TabsTrigger>
                  <TabsTrigger value="received" className="gap-2 cursor-pointer">
                    <Warehouse className="size-4" />
                    Received Cartons in Storage ({receivedCartons.length})
                  </TabsTrigger>
                </TabsList>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void qFulfilment.refetch();
                  }}
                  className="gap-1.5 self-end text-xs text-muted-foreground hover:text-foreground cursor-pointer"
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
                    empty="No sealed cartons awaiting warehouse intake."
                    columns={[
                      {
                        header: "Box ID / Tag",
                        cell: (p) => (
                          <span className="wt-id font-mono font-bold text-foreground">
                            {(p as any).code || p.id}
                          </span>
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
                        header: "Manifest",
                        cell: (p) => (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5 cursor-pointer"
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

              {/* TAB 2: Received Cartons with Storage Bin & Received Timestamp */}
              <TabsContent value="received" className="space-y-4 mt-0">
                <Section title="Received Cartons in Storage">
                  <DataTable
                    rows={receivedCartons}
                    rowKey={(p) => p.id}
                    empty="No cartons currently in warehouse storage."
                    columns={[
                      {
                        header: "Box ID / Tag",
                        cell: (p) => (
                          <span className="wt-id font-mono font-bold text-foreground">
                            {(p as any).code || p.id}
                          </span>
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
                            className="h-7 text-xs gap-1.5 cursor-pointer"
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

            {/* Optional Read-Only Carton Manifest Dialog */}
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
                      <span>
                        Carton Manifest:{" "}
                        <span className="font-mono font-bold">
                          {(manifestCarton as any).code || manifestCarton.id}
                        </span>
                      </span>
                    </DialogTitle>
                    <DialogDescription>
                      Inspecting sealed contents and verified garment lifecycle states.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg border p-3 text-xs bg-muted/20">
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                          Status
                        </span>
                        <StatusBadge status={manifestCarton.status} />
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                          Total Units
                        </span>
                        <span className="font-semibold text-foreground">
                          {manifestCarton.garmentIds?.length || 0} garments
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                          Current Bin
                        </span>
                        <span className="font-mono font-bold text-primary">
                          {(manifestCarton as any).binCode ||
                            (manifestCarton as any).warehouse_stock?.warehouse_bins?.code ||
                            "BIN-A1"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-foreground">
                        Member Garments Manifest
                      </h4>
                      <div className="rounded-lg border max-h-60 overflow-y-auto divide-y">
                        {(manifestCarton.garmentIds || []).map((id: string, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 text-xs hover:bg-muted/30"
                          >
                            <span className="font-mono font-bold text-foreground">
                              {id}
                            </span>
                            <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                              warehouse
                            </span>
                          </div>
                        ))}
                      </div>
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
