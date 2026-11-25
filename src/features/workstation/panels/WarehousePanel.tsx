import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Eye,
  Layers,
  Package as PkgIcon,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
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
  const { run, pending } = useWtAction();
  const [activeTab, setActiveTab] = useState<"awaiting" | "received">("awaiting");

  // Selected carton for read-only manifest inspection modal
  const [manifestCarton, setManifestCarton] = useState<any | null>(null);

  // Destination Storage Bin state (synced with workstation context)
  const initialBinId =
    (stationData.activeContext?.payload as any)?.binId ||
    (stationData.activeContext?.payload as any)?.warehouseBinId ||
    "BIN-A1";
  const [selectedBinId, setSelectedBinId] = useState<string>(initialBinId);

  // Manual entry for barcode/keyboard fallback (submitted with Enter)
  const [scanUid, setScanUid] = useState("");
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  // Auto-detect scans arriving via MQTT/backend hardware reader on Station 8
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    const outcome = stationData.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      setLocalLastOutcome(outcome);
      void qFulfilment.refetch();
    }
  }, [stationData.lastScanOutcome, qFulfilment]);

  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());

  const isAuthorized = me.role === "M" || me.role === "L" || me.role === "A" || me.department === "warehouse";
  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

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

  // Process manual/wedge scan through authoritative backend validation
  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = scanUid.trim();
    if (!trimmed || pending) return;
    void run(
      (c) => c.warehouseIntake(trimmed, selectedBinId),
      (outcome) => {
        setLocalLastOutcome(outcome);
        setScanUid("");
        void qFulfilment.refetch();
        if (outcome.resolution === "accepted") {
          return outcome.productName || "Box Received Successfully — Garments Moved to Warehouse.";
        }
        return outcome.rejectReason || "Intake rejected.";
      },
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
        // Real packages from PostgreSQL
        const allPackages = fulfilment.packages || [];
        const sealedAwaitingIntake = allPackages.filter((p: any) => p.status === "sealed");
        const receivedCartons = allPackages.filter((p: any) => p.status === "warehoused");

        return (
          <div className="space-y-6">
            {/* Top Row: Bin Selection & Live Scan Result */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left Column: Storage Bin Selection & Master Box RFID Scanning */}
              <Section title="Carton Intake">
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  {/* Real Scanner 8 Status */}
                  <div className="flex items-center justify-between text-xs pb-1 border-b">
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      Scanner 8 Active
                    </span>
                    <span className="font-mono text-muted-foreground">
                      Station 8
                    </span>
                  </div>

                  {/* Destination Storage Bin Selection */}
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

                  {/* Master Box RFID Tag Scan Input */}
                  <form onSubmit={handleManualScanSubmit} className="space-y-2 pt-2 border-t">
                    <Field
                      label="Master Box Tag UID"
                      htmlFor="master-box-scan-input"
                    >
                      <Input
                        id="master-box-scan-input"
                        value={scanUid}
                        onChange={(e) => setScanUid(e.target.value)}
                        placeholder="Scan or enter tag UID..."
                        className="font-mono text-xs"
                        disabled={pending}
                        autoFocus
                      />
                    </Field>
                  </form>

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
                            ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 text-foreground"
                            : "border-destructive/40 bg-destructive/10 text-destructive"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {details.isAccepted ? (
                            <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
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
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200"
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
                      Waiting for Master Box RFID scan.
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
                            <th className="p-2.5">Size</th>
                            <th className="p-2.5">Stage</th>
                            <th className="p-2.5">QC Disposition</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(manifestCarton.garmentDetails || manifestCarton.garmentIds || []).map(
                            (item: any, idx: number) => {
                              const code = typeof item === "string" ? item : item.code || item.id;
                              const stage = typeof item === "object" ? item.stage : manifestCarton.status === "warehoused" ? "warehouse" : "finished";
                              const disp = typeof item === "object" ? item.disposition : "released";
                              const size = typeof item === "object" && item.size ? item.size : "—";

                              return (
                                <tr key={code || idx} className="hover:bg-muted/40 transition-colors">
                                  <td className="p-2.5 font-mono text-muted-foreground">{idx + 1}</td>
                                  <td className="p-2.5 font-mono font-bold text-foreground">{code}</td>
                                  <td className="p-2.5 font-medium">{size}</td>
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
