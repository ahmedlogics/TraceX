import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Eye,
  Package as PkgIcon,
  Radio,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Warehouse,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/wt/DataTable";
import { ScopeNote } from "@/components/wt/forms";
import { fmt, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { Garment, Package, ScanOutcome, Shipment } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { getDataMode } from "@/lib/data/provider";

export function DispatchPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();

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

  // State
  const [isArmed, setIsArmed] = useState<boolean>(false);
  const [scanUid, setScanUid] = useState("");
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);
  const [viewProductsBox, setViewProductsBox] = useState<Package | null>(null);
  const [cartonFilter, setCartonFilter] = useState<"all" | "awaiting" | "dispatched">("awaiting");

  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  // Authorization check
  const isAuthorized =
    me.department === "dispatch" || me.role === "L" || me.role === "M" || me.role === "A";

  // Central box dispatch scanner executor
  const handleBoxScan = async (rawUid: string) => {
    const uid = rawUid.trim().toUpperCase();
    if (!uid || pending || !isAuthorized) return;

    void run(
      async (c) => {
        const outcome = await c.dispatchBoxScan(uid);
        setLocalLastOutcome(outcome);
        setScanUid("");
        void qShipments.refetch();
        void qFulfilment.refetch();
        void qGarments.refetch();
        return outcome;
      },
      (outcome) =>
        outcome.resolution === "accepted"
          ? `Carton ${outcome.garmentCode ?? outcome.subjectId ?? uid} accepted! Linked units marked dispatched.`
          : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
    );
  };

  // Auto-detect scans arriving via MQTT/backend hardware reader at Station 9 Dock Gate
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    const outcome = stationData?.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      setLocalLastOutcome(outcome);
      void qShipments.refetch();
      void qFulfilment.refetch();
      void qGarments.refetch();
    }
  }, [isAuthorized, stationData?.lastScanOutcome, qShipments, qFulfilment, qGarments]);

  // Global USB Keyboard Wedge RFID reader listener for Station 9 Dock Gate
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
          void handleBoxScan(scanned);
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthorized]);

  return (
    <Loadable query={qShipments}>
      {(shipments) => (
        <Loadable query={qFulfilment}>
          {(fulfilment) => (
            <Loadable query={qGarments}>
              {(garments) => {
                const packages = fulfilment.packages;

                // Garment map for fast lookups
                const garmentMap = new Map(garments.map((g) => [g.id, g]));

                // Shipment lookup helper for each carton
                const getCartonShipment = (pkg: Package): Shipment | undefined => {
                  return shipments.find((s) =>
                    pkg.garmentIds.some(
                      (gid) =>
                        s.garmentIds.includes(gid) || s.allocatedGarmentIds.includes(gid),
                    ),
                  );
                };

                // Quality hold helper for a carton
                const getCartonHold = (pkg: Package) => {
                  const heldGarments = pkg.garmentIds
                    .map((gid) => garmentMap.get(gid))
                    .filter((g) => Boolean(g?.hold));
                  return heldGarments.length > 0 ? heldGarments : null;
                };

                // Filtered packages
                const awaitingDispatch = packages.filter((p) => p.status !== "dispatched");
                const dispatchedPackages = packages.filter((p) => p.status === "dispatched");
                const displayedPackages =
                  cartonFilter === "awaiting"
                    ? awaitingDispatch
                    : cartonFilter === "dispatched"
                    ? dispatchedPackages
                    : packages;

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
                        <div className="flex items-center gap-2 md:justify-end">
                          <span className="relative flex size-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1B5E5A] opacity-75"></span>
                            <span className="relative inline-flex rounded-full size-2.5 bg-[#1B5E5A]"></span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#99C5C1] bg-[#E6F0EE] px-2.5 py-1 text-xs font-bold text-[#134441] shadow-2xs">
                            <Radio className="size-3.5 text-[#1B5E5A]" />
                            {isArmed ? "Dock Reader: Armed & Listening" : "Dock Reader: Ready"}
                          </span>
                        </div>
                      </div>

                      {/* Live Scan Feedback Banner */}
                      {lastOutcome && (
                        <div
                          className={`mt-4 rounded-xl border border-[#CDBBA8] p-4 text-xs transition-all shadow-2xs ${
                            lastOutcome.resolution === "accepted"
                              ? "bg-[#FFFDFC] border-l-[4px] border-l-[#1B5E5A] text-[#2B170E]"
                              : "border-[#BFA894] bg-[#E8D7C2]/50 text-[#2B170E]"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {lastOutcome.resolution === "accepted" ? (
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E6F0EE] text-[#1B5E5A] border border-[#99C5C1]">
                                <CheckCircle2 className="size-5 text-[#1B5E5A]" />
                              </div>
                            ) : (
                              <XCircle className="size-5 shrink-0 text-[#8C5348] mt-0.5" />
                            )}
                            <div className="space-y-1">
                              <p className="font-bold text-sm text-[#2B170E]">
                                {lastOutcome.resolution === "accepted"
                                  ? `Accepted: Container ${lastOutcome.garmentCode ?? lastOutcome.subjectId} Dispatched`
                                  : `Rejected: ${lastOutcome.rejectReason ?? "Dispatch Gate Rejected Scan"}`}
                              </p>
                              <p className="text-xs text-[#6E5748] font-medium">
                                {lastOutcome.resolution === "accepted"
                                  ? `Box Scanned → All linked garments updated to 'dispatched'.`
                                  : lastOutcome.rejectReason}
                              </p>
                              <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-[#6E5748]">
                                <span className="bg-[#F2E4D2] px-2 py-0.5 rounded border border-[#CDBBA8] text-[#2B170E]">
                                  Scanned UID / ID: {lastOutcome.uid}
                                </span>
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

                    {/* DOCK GATE INGESTION: LIVE API (HARDWARE ONLY) VS MOCK (TEST SIMULATION) */}
                    <Section title="Dock Gate Carton Dispatch">
                      {!isMock ? (
                        /* LIVE API MODE: PURE HARDWARE SCANNING — NO MANUAL UID WRITING */
                        <div className="rounded-xl border bg-card p-5">
                          {!isArmed ? (
                            <Button
                              size="lg"
                              className="w-full text-base font-bold shadow-md gap-2 h-14 bg-primary hover:bg-primary/90 text-primary-foreground"
                              disabled={pending || !isAuthorized}
                              onClick={() => setIsArmed(true)}
                            >
                              <ScanLine className="size-5" />
                              Scan Box Tag on Hardware
                            </Button>
                          ) : (
                            <div className="rounded-xl border border-[#C79C70] bg-[#E2C8A8]/30 p-4 flex items-center justify-between">
                              <div className="inline-flex items-center gap-2 text-sm font-bold text-[#2B170E]">
                                <Radio className="size-5 animate-spin text-[#6E5748]" />
                                Scanner 9 Dock Reader Armed &amp; Listening for Master Box Tag
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-muted-foreground/30 hover:bg-muted"
                                onClick={() => setIsArmed(false)}
                              >
                                Disarm
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* MOCK MODE: Manual simulation & 1-click test chips for testing without hardware */
                        <div className="rounded-xl border bg-card p-5 space-y-3">
                          <div className="flex items-center gap-2">
                            <Input
                              id="master-box-scan-input"
                              value={scanUid}
                              onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (scanUid.trim()) void handleBoxScan(scanUid);
                                }
                              }}
                              placeholder="Enter Box RFID tag UID or ID (e.g. PKG-001)..."
                              className="font-mono text-xs flex-1"
                              disabled={pending}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="text-xs h-9 px-4 font-semibold"
                              disabled={pending || !scanUid.trim() || !isAuthorized}
                              onClick={() => void handleBoxScan(scanUid)}
                            >
                              Dispatch Box
                            </Button>
                          </div>

                          {/* Candidate Quick Selection Chips for Cartons Awaiting Dispatch */}
                          {awaitingDispatch.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {awaitingDispatch.map((p) => {
                                const tagVal = p.rfidUid || (p as any).code || p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-xs font-mono font-semibold text-primary cursor-pointer transition-colors"
                                    onClick={() => {
                                      setScanUid(tagVal);
                                      void handleBoxScan(tagVal);
                                    }}
                                    title={`Click to simulate dispatch: ${p.id}`}
                                  >
                                    <Sparkles className="size-3" />
                                    {(p as any).code || p.id}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </Section>

                    {/* MASTER CARTONS MANIFEST TABLE */}
                    <Section title="Outbound Cartons Manifest">
                      <div className="space-y-4">
                        {/* Status Filter Tabs */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCartonFilter("awaiting")}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                              cartonFilter === "awaiting"
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            Awaiting Dispatch ({awaitingDispatch.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCartonFilter("dispatched")}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                              cartonFilter === "dispatched"
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            Dispatched ({dispatchedPackages.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCartonFilter("all")}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                              cartonFilter === "all"
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            All Cartons ({packages.length})
                          </button>
                        </div>

                        {/* Cartons Table (NO garment names or IDs printed inline in the row) */}
                        <DataTable
                          rows={displayedPackages}
                          rowKey={(p) => p.id}
                          empty="No cartons found matching current filter."
                          columns={[
                            {
                              header: "Carton ID",
                              cell: (p) => (
                                <div className="flex items-center gap-1.5">
                                  <PkgIcon className="size-4 text-primary shrink-0" />
                                  <span className="font-mono font-bold text-foreground">
                                    {(p as any).code || p.id}
                                  </span>
                                </div>
                              ),
                            },
                            {
                              header: "Master Tag UID",
                              cell: (p) => (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {p.rfidUid || `TAG-${p.id}`}
                                </span>
                              ),
                            },
                            {
                              header: "Linked Units",
                              cell: (p) => (
                                <span className="text-xs font-semibold text-foreground">
                                  {p.garmentIds.length} Garments
                                </span>
                              ),
                            },
                            {
                              header: "Assigned Shipment",
                              cell: (p) => {
                                const s = getCartonShipment(p);
                                return s ? (
                                  <div>
                                    <p className="font-mono font-medium text-xs text-foreground">
                                      {s.id}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                                      {s.destination}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">General Stock</span>
                                );
                              },
                            },
                            {
                              header: "Carton Status",
                              cell: (p) => <StatusBadge status={p.status} />,
                            },
                            {
                              header: "Hold Status",
                              cell: (p) => {
                                const holds = getCartonHold(p);
                                return holds ? (
                                  <HoldBadge />
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#134441] bg-[#E6F0EE] border border-[#99C5C1] px-2 py-0.5 rounded-full shadow-2xs">
                                    <CheckCircle2 className="size-3.5 text-[#1B5E5A]" /> Clear
                                  </span>
                                );
                              },
                            },
                            {
                              header: "Action",
                              cell: (p) => (
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => setViewProductsBox(p)}
                                  >
                                    <Eye className="size-3.5" />
                                    View Products
                                  </Button>

                                  {isMock && p.status !== "dispatched" && isAuthorized && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      disabled={pending}
                                      onClick={() => void handleBoxScan(p.rfidUid || p.id)}
                                    >
                                      <Truck className="size-3" />
                                      Dispatch
                                    </Button>
                                  )}
                                </div>
                              ),
                            },
                          ]}
                        />
                      </div>
                    </Section>

                    {/* MODAL: VIEW PRODUCTS LINKED TO SELECTED CARTON */}
                    <Dialog
                      open={Boolean(viewProductsBox)}
                      onOpenChange={(open) => {
                        if (!open) setViewProductsBox(null);
                      }}
                    >
                      {viewProductsBox && (
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <PkgIcon className="size-5 text-primary" />
                              Carton Products · {(viewProductsBox as any).code || viewProductsBox.id}
                            </DialogTitle>
                          </DialogHeader>

                          <div className="space-y-4 pt-2">
                            {/* Summary Banner */}
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border bg-muted/30 p-3 text-xs">
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Master Tag UID
                                </span>
                                <span className="font-mono font-bold text-foreground">
                                  {viewProductsBox.rfidUid || `TAG-${viewProductsBox.id}`}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Carton Status
                                </span>
                                <StatusBadge status={viewProductsBox.status} />
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Total Packed
                                </span>
                                <span className="font-semibold text-foreground">
                                  {viewProductsBox.garmentIds.length} Garments
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px] uppercase">
                                  Destination
                                </span>
                                <span className="font-semibold text-foreground truncate block">
                                  {getCartonShipment(viewProductsBox)?.destination ?? "General Stock"}
                                </span>
                              </div>
                            </div>

                            {/* Products Table inside Modal */}
                            <div className="rounded-lg border overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-muted text-muted-foreground font-semibold border-b">
                                  <tr>
                                    <th className="p-2.5">#</th>
                                    <th className="p-2.5">Garment ID</th>
                                    <th className="p-2.5">Product Style</th>
                                    <th className="p-2.5">Size</th>
                                    <th className="p-2.5">Stage</th>
                                    <th className="p-2.5">QC Clearance</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {viewProductsBox.garmentIds.map((gid, idx) => {
                                    const g = garmentMap.get(gid);
                                    const isHeld = Boolean(g?.hold);

                                    return (
                                      <tr key={gid} className="hover:bg-muted/40 transition-colors">
                                        <td className="p-2.5 font-mono text-muted-foreground">
                                          {idx + 1}
                                        </td>
                                        <td className="p-2.5 font-mono font-bold text-foreground">
                                          {gid}
                                        </td>
                                        <td className="p-2.5 font-medium">
                                          {g?.productName ?? "Garment Unit"}
                                        </td>
                                        <td className="p-2.5 font-mono">{g?.size ?? "M"}</td>
                                        <td className="p-2.5">
                                          <StatusBadge
                                            status={
                                              viewProductsBox.status === "dispatched"
                                                ? "dispatched"
                                                : g?.stage ?? "packed"
                                            }
                                          />
                                        </td>
                                        <td className="p-2.5">
                                          {isHeld ? (
                                            <HoldBadge />
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                              <CheckCircle2 className="size-3" /> Passed
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
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
          )}
        </Loadable>
      )}
    </Loadable>
  );
}
