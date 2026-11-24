import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Package as PkgIcon,
  Plus,
  Radio,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { paths } from "@/app/paths";
import { AppLink } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { Garment, Package, ScanOutcome, Shipment, ShipmentStatus } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function PlanShipmentDialog() {
  const { run } = useWtAction();
  const [destination, setDest] = useState("Authorized retail network — East region");
  const [carrier, setCarrier] = useState("Regional carrier (synthetic)");
  const [plannedDate, setDate] = useState("2026-11-25");

  return (
    <FormDialog
      trigger="Plan New Shipment"
      title="Draft an Outbound Shipment"
      description="Create a shipment header. Garments and packages are added from the manifest page."
      submitLabel="Create Shipment Draft"
      onSubmit={async () =>
        !!(await run(
          (c) => c.planShipment({ destination, carrier, plannedDate }),
          (id) => `${id} drafted.`,
        ))
      }
    >
      <Field label="Destination / Retail Hub" htmlFor="ps-dest">
        <Input id="ps-dest" value={destination} onChange={(e) => setDest(e.target.value)} />
      </Field>
      <Field label="Carrier / Logistics Provider" htmlFor="ps-car">
        <Input id="ps-car" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
      </Field>
      <Field label="Target Planned Date" htmlFor="ps-date">
        <Input
          id="ps-date"
          type="date"
          value={plannedDate}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

interface DispatchedBoxDetails {
  boxId: string;
  rfidUid?: string;
  status: string;
  garments: { id: string; productName?: string; size?: string; stage: string }[];
  destination?: string;
  shipmentId?: string;
  scannedAt: string;
}

export function ShipmentsView() {
  const me = useMe();
  const { run } = useWtAction();
  const q = useWtQuery(["shipments"], (c) => c.listShipments());
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  const isDispatch =
    me?.username === "dispatch.demo" ||
    me?.department === "dispatch" ||
    me?.role === "L" ||
    me?.role === "M" ||
    me?.role === "A";

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [recentBoxOutcome, setRecentBoxOutcome] = useState<ScanOutcome | null>(null);
  const [dispatchedBoxDetails, setDispatchedBoxDetails] = useState<DispatchedBoxDetails | null>(null);

  // Poll hardware station data for Station 9 (Dispatch Dock Gate reader)
  const qStation = useWtQuery(
    ["rfid-station", "dispatch"],
    (c) => c.getRfidStationData("dispatch"),
    {
      enabled: isDispatch,
      refetchInterval: 1200,
    },
  );

  // Centralized hardware scan processor for box tags
  const handleProcessScan = async (rawUid: string) => {
    const uid = rawUid.trim().toUpperCase();
    if (!uid) return;

    void run(
      async (c) => {
        const outcome = await c.dispatchBoxScan(uid);
        setRecentBoxOutcome(outcome);

        if (outcome.resolution === "accepted") {
          const allPkgs = (await c.getFulfilment()).packages;
          const allGarments = await c.listGarments();
          const allShipments = await c.listShipments();

          // Find the scanned box/package
          const pkg = allPkgs.find(
            (p) =>
              p.id.toUpperCase() === uid ||
              (p.rfidUid && p.rfidUid.toUpperCase() === uid) ||
              p.id === outcome.subjectId ||
              p.id === outcome.garmentCode,
          );

          if (pkg) {
            const linkedGarments = pkg.garmentIds
              .map((gid) => allGarments.find((g) => g.id === gid))
              .filter(Boolean) as Garment[];

            const linkedShipment = allShipments.find((sh) =>
              sh.garmentIds.some((gid) => pkg.garmentIds.includes(gid)),
            );

            setDispatchedBoxDetails({
              boxId: pkg.id,
              rfidUid: pkg.rfidUid || outcome.uid || uid,
              status: pkg.status,
              garments: linkedGarments.map((g) => ({
                id: g.id,
                productName: g.productName,
                size: g.size,
                stage: g.stage,
              })),
              shipmentId: linkedShipment?.id,
              destination: linkedShipment?.destination,
              scannedAt: new Date().toLocaleTimeString(),
            });
          }
          void q.refetch();
          void qFulfilment.refetch();
          void qGarments.refetch();
        } else {
          setDispatchedBoxDetails(null);
        }
        return outcome;
      },
      (outcome) =>
        outcome.resolution === "accepted"
          ? `✓ Box ${outcome.garmentCode ?? outcome.subjectId} dispatched! Linked units marked dispatched.`
          : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
    );
  };

  // Auto-detect scans arriving via MQTT/backend hardware reader at Station 9 Dock Gate
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isDispatch) return;
    const outcome = qStation.data?.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      if (outcome.uid) {
        void handleProcessScan(outcome.uid);
      }
    }
  }, [isDispatch, qStation.data?.lastScanOutcome]);

  // Global USB Keyboard Wedge RFID reader listener for Station 9 Dock Gate
  // Enables dock gate hardware scanner to automatically capture box tag UID without any manual typing or selecting
  useEffect(() => {
    if (!isDispatch) return;
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
  }, [isDispatch]);

  return (
    <>
      <PageHeader
        title="Outbound Shipments"
        description="Outbound logistics manifests, garment dispatch verification, and departure clearance."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Shipments" }]}
        actions={can.planShipment(me) ? <PlanShipmentDialog /> : undefined}
      />

      <div className="space-y-6">
        {/* Hardware Scanner 9 Dock Gate Status Banner */}
        {isDispatch && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5 text-primary font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
              </span>
              <span>Scanner 9 Active · Outbound Dock Gate Reader</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-[11px]">
                Scan carton RFID tag on hardware to dispatch. Nothing to select or type.
              </span>
              {/* Discreet test button for environments without physical USB hardware plugged in */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground/60 hover:text-foreground cursor-pointer"
                onClick={() => void handleProcessScan("PKG-001")}
                title="Simulate hardware scan for PKG-001"
              >
                (Dev: Test PKG-001)
              </Button>
            </div>
          </div>
        )}

        {/* Runtime Scanned Box Confirmation Card */}
        {dispatchedBoxDetails && (
          <div className="rounded-xl border-2 border-success/60 bg-success-soft/30 p-5 shadow-xs transition-all animate-in fade-in duration-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-success/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-success text-success-foreground flex items-center justify-center shrink-0">
                  <PkgIcon className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-foreground font-mono">
                      Box {dispatchedBoxDetails.boxId}
                    </h3>
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-success bg-background px-2 py-0.5 rounded border border-success/30">
                      <Radio className="size-3" /> {dispatchedBoxDetails.rfidUid || "NFC/RFID Tag"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Carton scanned &amp; verified at Dock Gate · Scanned at {dispatchedBoxDetails.scannedAt}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-success text-success-foreground px-2.5 py-1 text-xs font-bold shadow-2xs">
                  <CheckCircle2 className="size-3.5" /> Dispatched
                </span>
                <button
                  type="button"
                  onClick={() => setDispatchedBoxDetails(null)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 cursor-pointer ml-1"
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>

            {/* Box Child Contents Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span>Linked Products Inside ({dispatchedBoxDetails.garments.length} units):</span>
                {dispatchedBoxDetails.shipmentId && (
                  <span className="text-muted-foreground">
                    Shipment: <strong className="text-foreground font-mono">{dispatchedBoxDetails.shipmentId}</strong>
                    {dispatchedBoxDetails.destination ? ` · ${dispatchedBoxDetails.destination}` : ""}
                  </span>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {dispatchedBoxDetails.garments.map((g) => (
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
        {recentBoxOutcome && recentBoxOutcome.resolution !== "accepted" && (
          <div className="rounded-xl border border-destructive/50 bg-danger-soft p-4 shadow-xs text-foreground flex items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-destructive">
                  Box Scan Rejected ({recentBoxOutcome.uid})
                </h4>
                <p className="text-xs font-medium">
                  {recentBoxOutcome.rejectReason || `Station rule violated: ${recentBoxOutcome.resolution}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRecentBoxOutcome(null)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 cursor-pointer"
            >
              ✕ Dismiss
            </button>
          </div>
        )}

        <Loadable query={q}>
          {(rows) => {
            const drafts = rows.filter((s) => s.status === "draft").length;
            const planned = rows.filter((s) => s.status === "planned").length;
            const departed = rows.filter((s) => s.status === "departed").length;

            const filtered = rows.filter((s) => {
              if (activeTab !== "all" && s.status !== activeTab) return false;
              if (search.trim()) {
                const term = search.toLowerCase();
                const matchId = s.id.toLowerCase().includes(term);
                const matchDest = s.destination.toLowerCase().includes(term);
                const matchCar = s.carrier.toLowerCase().includes(term);
                if (!matchId && !matchDest && !matchCar) return false;
              }
              return true;
            });

            return (
              <div className="space-y-6">
                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wider">
                        Total Shipments
                      </span>
                      <Truck className="size-4 text-primary" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{rows.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">All outbound records</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wider">Drafting</span>
                      <FileText className="size-4 text-warning" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{drafts}</p>
                    <p className="text-xs text-muted-foreground mt-1">Awaiting manager lock</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wider">
                        Planned / Armed
                      </span>
                      <Clock className="size-4 text-accent" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{planned}</p>
                    <p className="text-xs text-muted-foreground mt-1">Awaiting dock dispatch</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wider">Departed</span>
                      <CheckCircle2 className="size-4 text-success" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-success">{departed}</p>
                    <p className="text-xs text-muted-foreground mt-1">On retail network</p>
                  </div>
                </div>

                {/* Tabs & Search */}
                <div className="space-y-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                      <TabsList className="flex h-auto flex-wrap">
                        <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
                        <TabsTrigger value="draft">Drafts ({drafts})</TabsTrigger>
                        <TabsTrigger value="planned">Planned ({planned})</TabsTrigger>
                        <TabsTrigger value="departed">Departed ({departed})</TabsTrigger>
                      </TabsList>

                      <div className="relative">
                        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search destination, carrier, ID..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-8 pl-8 text-xs w-[200px] sm:w-[260px]"
                        />
                      </div>
                    </div>

                    <TabsContent value={activeTab} className="mt-3">
                      <DataTable
                        rows={filtered}
                        rowKey={(s) => s.id}
                        empty="No shipments match the filter."
                        columns={[
                          {
                            header: "Shipment ID",
                            cell: (s) => <IdLink href={paths.shipment(s.id)} id={s.id} />,
                          },
                          {
                            header: "Destination",
                            cell: (s) => <span className="font-medium text-xs">{s.destination}</span>,
                          },
                          {
                            header: "Carrier",
                            cell: (s) => (
                              <span className="text-xs text-muted-foreground">{s.carrier}</span>
                            ),
                          },
                          {
                            header: "Allocation Progress",
                            cell: (s) => {
                              const total = s.garmentIds.length;
                              const alloc = s.allocatedGarmentIds.length;
                              const pct = total > 0 ? Math.round((alloc / total) * 100) : 0;
                              return (
                                <div className="flex flex-col gap-1 min-w-[120px]">
                                  <span className="text-xs font-medium">
                                    {alloc} / {total} garments ({pct}%)
                                  </span>
                                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${pct === 100 ? "bg-success" : "bg-primary"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            },
                          },
                          {
                            header: "Manifest Verified",
                            cell: (s) => {
                              const total = s.garmentIds.length;
                              const verified = s.verifiedGarmentIds?.length ?? 0;
                              return (
                                <span className="text-xs font-mono">
                                  {verified} / {total} verified
                                </span>
                              );
                            },
                          },
                          { header: "Planned Date", cell: (s) => fmt.date(s.plannedDate) },
                          { header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
                          {
                            header: "Action",
                            cell: (s) => (
                              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                <AppLink href={paths.shipment(s.id)}>Manifest</AppLink>
                              </Button>
                            ),
                          },
                        ]}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            );
          }}
        </Loadable>
      </div>
    </>
  );
}
