import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Package as PkgIcon,
  Radio,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Warehouse,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { Garment, Package, ScanOutcome, Shipment } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { can } from "@/domain/permissions";

export function DispatchPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();

  // Mode switcher: "dashboard" (Outbound Dispatch Dashboard) | "manifest" (Manifest & Clearance Monitor)
  const [activeTab, setActiveTab] = useState<"dashboard" | "manifest">("dashboard");
  const [scanInput, setScanInput] = useState("");
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>("");
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  // Queries
  const qShipments = useWtQuery(["shipments"], (c) => c.listShipments(), {
    refetchInterval: 3000,
  });
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment(), {
    refetchInterval: 3000,
  });
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), {
    refetchInterval: 3000,
  });

  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  // Authorization check
  const isAuthorized =
    me.department === "dispatch" || me.role === "L" || me.role === "M" || me.role === "A";

  return (
    <Loadable query={qShipments}>
      {(shipments) => (
        <Loadable query={qFulfilment}>
          {(fulfilment) => (
            <Loadable query={qGarments}>
              {(garments) => {
                const packages = fulfilment.packages;

                // Active or selected shipment
                const activeShipments = shipments.filter((s) => s.status !== "departed");
                const currentShipmentId =
                  selectedShipmentId || activeShipments[0]?.id || shipments[0]?.id || "";
                const currentShipment = shipments.find((s) => s.id === currentShipmentId);

                // Cartons/packages linked to current shipment
                const shipmentPackages = useMemo(() => {
                  if (!currentShipment) return [];
                  return packages.filter((pkg) => {
                    // Check if package garments overlap with shipment garments
                    return pkg.garmentIds.some(
                      (gid) =>
                        currentShipment.garmentIds.includes(gid) ||
                        currentShipment.allocatedGarmentIds.includes(gid),
                    );
                  });
                }, [currentShipment, packages]);

                // All packages if none explicitly linked
                const displayedPackages =
                  shipmentPackages.length > 0 ? shipmentPackages : packages;

                // Active inspected package
                const currentPkg =
                  displayedPackages.find((p) => p.id === selectedPackageId) ||
                  displayedPackages[0];

                // Manifest garments for current shipment
                const manifestGarments = useMemo(() => {
                  if (!currentShipment) return [];
                  return currentShipment.garmentIds
                    .map((id) => garments.find((g) => g.id === id))
                    .filter(Boolean) as Garment[];
                }, [currentShipment, garments]);

                // Quality holds check across all manifest garments
                const heldManifestGarments = manifestGarments.filter((g) => Boolean(g.hold));
                const allQualityClear =
                  manifestGarments.length > 0 && heldManifestGarments.length === 0;

                // Cartons dispatched progress
                const dispatchedCartonsCount = shipmentPackages.filter(
                  (p) => p.status === "dispatched",
                ).length;
                const allCartonsDispatched =
                  shipmentPackages.length > 0 &&
                  dispatchedCartonsCount === shipmentPackages.length;

                return (
                  <div className="space-y-6">
                    {/* Station Identifier & Hardware Status Header */}
                    <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-xs">
                      <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="wt-eyebrow">Station 9 · Outbound Logistics</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                              Dock Scanner 9
                            </span>
                          </div>
                          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            Station 9: Dispatch & Outbound Gate
                          </h2>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              Active Operator:{" "}
                              <strong className="text-foreground">{me.displayName}</strong> (
                              {me.username})
                            </span>
                            <span>·</span>
                            <span>
                              Department:{" "}
                              <span className="inline-flex items-center rounded-sm bg-primary/10 px-1.5 py-0.5 font-medium text-primary uppercase text-[10px]">
                                {me.department}
                              </span>
                            </span>
                            <span>·</span>
                            <span className="text-muted-foreground font-mono">Role: {me.role}</span>
                          </div>
                        </div>

                        {/* Hardware RFID Status */}
                        <div className="flex flex-col items-start gap-2 md:items-end">
                          <div className="flex items-center gap-2">
                            <span className="relative flex size-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500"></span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <Radio className="size-3.5" /> Dock Reader: Armed & Ready
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground">
                            Mode: Aggregate Carton Dispatch (Zero-Touch Garment Scanning)
                          </p>
                        </div>
                      </div>

                      {/* Live Scan Feedback Box */}
                      {lastOutcome && (
                        <div
                          className={`mt-4 rounded-lg border p-4 text-xs transition-all shadow-xs ${
                            lastOutcome.resolution === "accepted"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
                              : "border-destructive/40 bg-destructive/10 text-destructive"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {lastOutcome.resolution === "accepted" ? (
                              <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                            ) : (
                              <XCircle className="size-5 shrink-0 text-destructive mt-0.5" />
                            )}
                            <div className="space-y-1">
                              <p className="font-semibold text-sm">
                                {lastOutcome.resolution === "accepted"
                                  ? `Accepted: Container ${lastOutcome.garmentCode ?? lastOutcome.subjectId} Dispatched`
                                  : `Rejected: ${lastOutcome.rejectReason ?? "Dispatch Gate Rejected Scan"}`}
                              </p>
                              <p className="text-xs opacity-90">
                                {lastOutcome.resolution === "accepted"
                                  ? `Box Scanned → All linked garments updated to 'dispatched'.`
                                  : lastOutcome.rejectReason}
                              </p>
                              <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-muted-foreground">
                                <span>Scanned UID / ID: {lastOutcome.uid}</span>
                                <span>·</span>
                                <span>Gate: Station 9 Dock</span>
                                <span>·</span>
                                <span>Time: {fmt.dateTime(lastOutcome.at)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Department Scope Guard */}
                    {!isAuthorized && (
                      <ScopeNote>
                        You are currently viewing Station 9 as <strong>{me.role}</strong> (
                        {me.department}). Only authorized dispatch associates (Role: L, Department:
                        dispatch) can record carton scans and confirm departure.
                      </ScopeNote>
                    )}

                    {/* View Switcher Tabs */}
                    <Tabs
                      value={activeTab}
                      onValueChange={(v) => setActiveTab(v as "dashboard" | "manifest")}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between border-b pb-2">
                        <TabsList className="grid grid-cols-2 w-full max-w-md h-9">
                          <TabsTrigger value="dashboard" className="text-xs gap-1.5">
                            <Truck className="size-3.5" /> Outbound Dispatch Dashboard
                          </TabsTrigger>
                          <TabsTrigger value="manifest" className="text-xs gap-1.5">
                            <ShieldCheck className="size-3.5" /> Manifest & Clearance Monitor
                          </TabsTrigger>
                        </TabsList>

                        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground font-mono">
                          <span>Active Shipment:</span>
                          <span className="font-semibold text-foreground">
                            {currentShipment?.id ?? "None"}
                          </span>
                        </div>
                      </div>

                      {/* TAB 1: OUTBOUND DISPATCH DASHBOARD */}
                      <TabsContent value="dashboard" className="space-y-6 m-0">
                        {/* Active Shipment Focus Card */}
                        {currentShipment ? (
                          <div className="rounded-xl border bg-card p-4 shadow-xs space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Active Outbound Shipment Consignment
                                </span>
                                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                  <span className="font-mono">{currentShipment.id}</span>
                                  <span className="text-sm font-normal text-muted-foreground">
                                    → {currentShipment.destination}
                                  </span>
                                </h3>
                              </div>

                              <div className="flex items-center gap-2">
                                <StatusBadge status={currentShipment.status} />
                                <span className="text-xs text-muted-foreground font-mono">
                                  Carrier: {currentShipment.carrier}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1 border-t text-xs">
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Carrier
                                </span>
                                <span className="font-semibold text-foreground">
                                  {currentShipment.carrier}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Destination Hub
                                </span>
                                <span className="font-semibold text-foreground">
                                  {currentShipment.destination}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Assigned Cartons
                                </span>
                                <span className="font-semibold text-foreground">
                                  {dispatchedCartonsCount} of {displayedPackages.length} Dispatched
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Total Units
                                </span>
                                <span className="font-semibold text-foreground">
                                  {currentShipment.garmentIds.length} Garments
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <EmptyState title="No Outbound Shipments Scheduled" />
                        )}

                        {/* Routine RFID Ingestion & Carton Inspection Grid */}
                        <div className="grid gap-6 lg:grid-cols-2">
                          {/* Continuous Reader Input */}
                          <Section
                            title="Single-Scan Box RFID Ingestion"
                            description="Carton moves through Station 9 dock gate. Present master container RFID tag UID or enter carton code."
                          >
                            <div className="space-y-4">
                              <Field
                                label="Master Carton Tag UID or Box ID"
                                htmlFor="box-uid"
                                hint="Zero-Touch Handling: Scanning this single carton tag automatically updates all child products inside directly to dispatched."
                              >
                                <Input
                                  id="box-uid"
                                  value={scanInput}
                                  onChange={(e) => setScanInput(e.target.value.toUpperCase())}
                                  className="font-mono bg-card"
                                  placeholder="e.g. PKG-001 or 04A7B8C9 or BOX-004"
                                />
                              </Field>

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Button
                                  disabled={pending || !scanInput.trim() || !isAuthorized}
                                  onClick={() =>
                                    void run(
                                      async (c) => {
                                        const outcome = await c.dispatchBoxScan(
                                          scanInput.trim(),
                                          currentShipment?.id,
                                        );
                                        setLocalLastOutcome(outcome);
                                        if (outcome.resolution === "accepted") {
                                          setScanInput("");
                                        }
                                        return outcome;
                                      },
                                      (outcome) =>
                                        outcome.resolution === "accepted"
                                          ? `Carton ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName}) accepted! Linked units marked dispatched.`
                                          : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                    )
                                  }
                                >
                                  <ScanLine className="size-4 mr-1.5" /> Record Box Scan
                                </Button>

                                {/* Pre-fill button for fast bench processing */}
                                {displayedPackages.find((p) => p.status !== "dispatched") && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pending}
                                    onClick={() => {
                                      const nextPkg = displayedPackages.find(
                                        (p) => p.status !== "dispatched",
                                      );
                                      if (nextPkg) {
                                        setScanInput(nextPkg.rfidUid ?? nextPkg.id);
                                        setSelectedPackageId(nextPkg.id);
                                      }
                                    }}
                                  >
                                    Pre-fill Next Box (
                                    {
                                      displayedPackages.find((p) => p.status !== "dispatched")?.id
                                    }
                                    )
                                  </Button>
                                )}
                              </div>
                            </div>
                          </Section>

                          {/* Scanned Box Inspection Card */}
                          <Section
                            title="Active Carton Contents Inspection"
                            description="Pre-linked contents inside the selected or scanned master carton."
                          >
                            {currentPkg ? (
                              <div className="space-y-4">
                                <div className="rounded-lg border bg-card p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Container Identifier
                                      </span>
                                      <p className="font-mono text-base font-bold text-foreground flex items-center gap-2">
                                        <PkgIcon className="size-4 text-primary" /> {currentPkg.id}
                                      </p>
                                    </div>
                                    <StatusBadge status={currentPkg.status} />
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase">
                                        Master Tag UID
                                      </span>
                                      <span className="font-mono font-semibold text-foreground">
                                        {currentPkg.rfidUid ?? "TAG-" + currentPkg.id}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase">
                                        Total Linked Units
                                      </span>
                                      <span className="font-semibold text-foreground">
                                        {currentPkg.garmentIds.length} pcs
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase">
                                        Destination / Shipment ID
                                      </span>
                                      <span className="font-mono font-semibold text-foreground">
                                        {currentShipment ? currentShipment.id : "Unassigned"}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block text-[10px] uppercase">
                                        Carton Status
                                      </span>
                                      <StatusBadge status={currentPkg.status} />
                                    </div>
                                  </div>

                                  {/* Quality Hold Status Check */}
                                  <div className="rounded-md border p-2.5 text-xs">
                                    {(() => {
                                      const boxGarments = currentPkg.garmentIds
                                        .map((id) => garments.find((g) => g.id === id))
                                        .filter(Boolean) as Garment[];
                                      const held = boxGarments.filter((g) => Boolean(g.hold));

                                      if (held.length > 0) {
                                        return (
                                          <div className="flex items-center gap-2 text-destructive font-semibold">
                                            <ShieldAlert className="size-4 shrink-0" />
                                            <span>
                                              Active Quality Hold: {held.length} garment(s) blocked inside box
                                            </span>
                                          </div>
                                        );
                                      }

                                      return (
                                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                                          <ShieldCheck className="size-4 shrink-0" />
                                          <span>
                                            Hold Status Check: None
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  {/* Linked Items List */}
                                  <div className="space-y-1.5 pt-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                                      Linked Garments
                                    </span>
                                    <div className="max-h-36 overflow-y-auto rounded border bg-muted/20 p-2 divide-y divide-border/60">
                                      {currentPkg.garmentIds.map((gid) => {
                                        const g = garments.find((x) => x.id === gid);
                                        return (
                                          <div
                                            key={gid}
                                            className="py-1 flex items-center justify-between text-xs"
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono font-medium text-foreground">
                                                {gid}
                                              </span>
                                              <span className="text-muted-foreground text-[11px] truncate max-w-[180px]">
                                                {g?.productName ?? "Garment Unit"}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              {g?.size && (
                                                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                                                  {g.size}
                                                </span>
                                              )}
                                              <StatusBadge status={g?.stage ?? "packed"} />
                                              {g?.hold && <HoldBadge />}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* One-click bench dispatch button */}
                                  {currentPkg.status !== "dispatched" && isAuthorized && (
                                    <Button
                                      size="sm"
                                      className="w-full"
                                      disabled={pending}
                                      onClick={() =>
                                        void run(
                                          async (c) => {
                                            const outcome = await c.dispatchBoxScan(
                                              currentPkg.id,
                                              currentShipment?.id,
                                            );
                                            setLocalLastOutcome(outcome);
                                            return outcome;
                                          },
                                          (outcome) =>
                                            outcome.resolution === "accepted"
                                              ? `Box ${currentPkg.id} dispatched successfully!`
                                              : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                        )
                                      }
                                    >
                                      <Truck className="size-3.5 mr-1.5" /> 1-Click Scan & Dispatch
                                      Carton
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <EmptyState title="No Cartons Available for Inspection" />
                            )}
                          </Section>
                        </div>

                        {/* Active Outbound Shipments Queue Table */}
                        <Section
                          title="Active Outbound Shipments Queue"
                          description="Scheduled carrier pickups awaiting dock gate loading and departure clearance."
                        >
                          <DataTable
                            rows={shipments}
                            rowKey={(s) => s.id}
                            empty="No outbound shipments scheduled."
                            columns={[
                              {
                                header: "Shipment ID",
                                cell: (s) => (
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-foreground">
                                      {s.id}
                                    </span>
                                    {s.id === currentShipmentId && (
                                      <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                        Selected
                                      </span>
                                    )}
                                  </div>
                                ),
                              },
                              {
                                header: "Carrier & Destination",
                                cell: (s) => (
                                  <div>
                                    <p className="font-medium text-xs text-foreground">
                                      {s.carrier}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {s.destination}
                                    </p>
                                  </div>
                                ),
                              },
                              {
                                header: "Carton Count",
                                cell: (s) => {
                                  const count = packages.filter((p) =>
                                    p.garmentIds.some((gid) => s.garmentIds.includes(gid)),
                                  ).length;
                                  return (
                                    <span className="font-semibold text-xs">
                                      {count > 0 ? `${count} Boxes` : "1 Box"}
                                    </span>
                                  );
                                },
                              },
                              {
                                header: "Total Units",
                                cell: (s) => (
                                  <span className="text-xs font-mono font-medium">
                                    {s.garmentIds.length} garments
                                  </span>
                                ),
                              },
                              {
                                header: "Manifest Status",
                                cell: (s) => <StatusBadge status={s.status} />,
                              },
                              {
                                header: "Action",
                                cell: (s) => (
                                  <Button
                                    variant={s.id === currentShipmentId ? "secondary" : "outline"}
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setSelectedShipmentId(s.id)}
                                  >
                                    {s.id === currentShipmentId ? "Active" : "Select / Load"}
                                  </Button>
                                ),
                              },
                            ]}
                          />
                        </Section>
                      </TabsContent>

                      {/* TAB 2: MANIFEST & SHIPMENT CLEARANCE MONITOR */}
                      <TabsContent value="manifest" className="space-y-6 m-0">
                        {currentShipment ? (
                          <div className="space-y-6">
                            {/* Clearance Audit Gate Summary */}
                            <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                                <div>
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Consignment Clearance Audit
                                  </span>
                                  <h3 className="text-lg font-bold text-foreground font-mono">
                                    {currentShipment.id} · {currentShipment.destination}
                                  </h3>
                                </div>

                                <div className="flex items-center gap-2">
                                  <StatusBadge status={currentShipment.status} />
                                </div>
                              </div>

                              {/* Three-Check Gate Verification Grid */}
                              <div className="grid gap-3 sm:grid-cols-3">
                                {/* Gate Check 1: Carton Dispatch Status */}
                                <div
                                  className={`rounded-lg border p-3 text-xs space-y-1 ${
                                    allCartonsDispatched
                                      ? "border-emerald-500/30 bg-emerald-500/10"
                                      : "border-warning/30 bg-warning/10"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-foreground">
                                      Carton Dispatch Gate
                                    </span>
                                    {allCartonsDispatched ? (
                                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Clock className="size-4 text-warning-foreground" />
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {dispatchedCartonsCount} of {displayedPackages.length} Cartons
                                    Dispatched
                                  </p>
                                </div>

                                {/* Gate Check 2: Zero Quality Holds */}
                                <div
                                  className={`rounded-lg border p-3 text-xs space-y-1 ${
                                    allQualityClear
                                      ? "border-emerald-500/30 bg-emerald-500/10"
                                      : "border-destructive/30 bg-destructive/10"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-foreground">
                                      Quality Hold Check
                                    </span>
                                    {allQualityClear ? (
                                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <ShieldAlert className="size-4 text-destructive" />
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {heldManifestGarments.length === 0
                                      ? "100% Units Verified Clear"
                                      : `${heldManifestGarments.length} Active Hold Detected`}
                                  </p>
                                </div>

                                {/* Gate Check 3: Operator Clearance Authority */}
                                <div
                                  className={`rounded-lg border p-3 text-xs space-y-1 ${
                                    isAuthorized
                                      ? "border-emerald-500/30 bg-emerald-500/10"
                                      : "border-destructive/30 bg-destructive/10"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-foreground">
                                      Dispatch Authority
                                    </span>
                                    {isAuthorized ? (
                                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <XCircle className="size-4 text-destructive" />
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {me.displayName} ({me.department})
                                  </p>
                                </div>
                              </div>

                              {/* Quality Hold Alert if present */}
                              {heldManifestGarments.length > 0 && (
                                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                                  <div className="space-y-0.5">
                                    <p className="font-semibold">
                                      Departure Clearance Intercepted by Quality Hold
                                    </p>
                                    <p className="text-[11px] opacity-90">
                                      Garment {heldManifestGarments[0]?.id} inside carton is
                                      flagged: &quot;{heldManifestGarments[0]?.hold?.reason}&quot;.
                                      The hold must be resolved at Quality before this shipment can
                                      depart.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Departure Action / Completed Receipt */}
                              {currentShipment.status === "departed" ? (
                                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs space-y-2">
                                  <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                                    <CheckCircle2 className="size-5" /> Proof of Departure Recorded
                                  </div>
                                  <p className="text-muted-foreground">
                                    This consignment has departed Station 9 and is in transit with{" "}
                                    <strong>{currentShipment.carrier}</strong>.
                                  </p>
                                  <div className="flex flex-wrap gap-4 pt-1 font-mono text-[11px] text-muted-foreground">
                                    <span>
                                      Departed At:{" "}
                                      {currentShipment.departedAt
                                        ? fmt.dateTime(currentShipment.departedAt)
                                        : "Confirmed"}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      Departed By: {currentShipment.departedBy ?? me.username}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="pt-2">
                                  <Button
                                    size="lg"
                                    className="w-full sm:w-auto"
                                    disabled={
                                      pending ||
                                      !allQualityClear ||
                                      !allCartonsDispatched ||
                                      !isAuthorized
                                    }
                                    onClick={() =>
                                      void run(
                                        (c) => c.confirmDeparture(currentShipment.id),
                                        `Shipment ${currentShipment.id} confirmed departed! Outbound gate released.`,
                                      )
                                    }
                                  >
                                    <Truck className="size-4 mr-2" /> Record Proof of Departure &
                                    Release Gate
                                  </Button>
                                  {!allCartonsDispatched && (
                                    <span className="text-xs text-muted-foreground block pt-2">
                                      * All cartons must be scanned and dispatched at Dock Scanner 9
                                      before recording proof of departure.
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Manifest Cartons Breakdown Table */}
                            <Section
                              title="Manifest Cartons Audit Table"
                              description="Detailed carton manifest for the selected outbound consignment."
                            >
                              <DataTable
                                rows={displayedPackages}
                                rowKey={(p) => p.id}
                                empty="No cartons linked to this shipment manifest."
                                columns={[
                                  {
                                    header: "Carton ID",
                                    cell: (p) => (
                                      <span className="font-mono font-bold text-foreground">
                                        {p.id}
                                      </span>
                                    ),
                                  },
                                  {
                                    header: "Master Tag UID",
                                    cell: (p) => (
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {p.rfidUid ?? "TAG-" + p.id}
                                      </span>
                                    ),
                                  },
                                  {
                                    header: "Units Count",
                                    cell: (p) => (
                                      <span className="text-xs font-semibold">
                                        {p.garmentIds.length} pcs
                                      </span>
                                    ),
                                  },
                                  {
                                    header: "Carton Status",
                                    cell: (p) => <StatusBadge status={p.status} />,
                                  },
                                  {
                                    header: "Hold Status Check",
                                    cell: (p) => {
                                      const boxGarments = p.garmentIds
                                        .map((id) => garments.find((g) => g.id === id))
                                        .filter(Boolean) as Garment[];
                                      const hasHold = boxGarments.some((g) => Boolean(g.hold));
                                      return hasHold ? (
                                        <HoldBadge />
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                          <CheckCircle2 className="size-3.5" /> Clear
                                        </span>
                                      );
                                    },
                                  },
                                  {
                                    header: "Action",
                                    cell: (p) => (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          setSelectedPackageId(p.id);
                                          setActiveTab("dashboard");
                                          setScanInput(p.rfidUid ?? p.id);
                                        }}
                                      >
                                        Inspect Carton
                                      </Button>
                                    ),
                                  },
                                ]}
                              />
                            </Section>
                          </div>
                        ) : (
                          <EmptyState title="No Shipment Selected" />
                        )}
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
