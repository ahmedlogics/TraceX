import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Info,
  OctagonAlert,
  Radio,
  Scissors,
  ShieldCheck,
  Shirt,
  Sparkles,
  Wrench,
  Search,
  ScanLine,
  PackageCheck,
  Truck,
  Layers,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/wt/forms";
import { PageHeader, Section, IdLink } from "@/components/wt/layout";
import { EmptyState, Loadable, LoadingState } from "@/components/wt/states";
import { can, canAccessRoute } from "@/domain/permissions";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { StatusBadge, HoldBadge } from "@/components/wt/StatusBadge";
import { ReceiveLotDialog } from "@/features/materials/LotsView";
import { TasksSection } from "@/features/tasks/TasksView";
import { QualityView } from "@/features/quality/QualityView";
import { matchesDateFilter, type DateFilterOption } from "@/features/workstation/panels/IssuePanel";
import type { Garment, ReworkCase, ScanOutcome } from "@/domain/types";

const toneIcon = { danger: OctagonAlert, warning: AlertTriangle, info: Info } as const;
const toneClass = {
  danger: "border-destructive/30 bg-danger-soft text-destructive",
  warning: "border-warning/30 bg-warning-soft text-warning",
  info: "border-accent bg-info-soft text-accent-foreground",
} as const;

function ReceivingLotsQueue() {
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  return (
    <Loadable query={qLots}>
      {(lots) => {
        const unassigned = lots.filter((l) => !l.rfidUid && l.status === "awaiting-inspection");

        if (unassigned.length === 0) {
          return (
            <div className="rounded-xl border border-dashed p-6 text-center space-y-2 bg-muted/20">
              <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-success/10 text-success">
                <Radio className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                All lots have active bundle cards assigned
              </p>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Lots Awaiting RFID Assignment ({unassigned.length})
              </p>
            </div>
            <div className="divide-y rounded-lg border bg-card">
              {unassigned.map((lot) => (
                <div
                  key={lot.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30"
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">{lot.id} · {lot.material}</p>
                    <p className="text-xs text-muted-foreground">
                      Supplier: <span className="font-medium">{lot.supplierRef}</span> · Amount: <span className="font-medium">{lot.receivedQty} {lot.unit ?? "m"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Card Pending
                    </span>
                    <Button asChild size="sm" className="h-8 text-xs gap-1.5">
                      <AppLink href={paths.workstation}>
                        Assign Card at Station 1 <ArrowRight className="size-3" />
                      </AppLink>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </Loadable>
  );
}

function IncomingQcQueue() {
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  return (
    <Loadable query={qLots}>
      {(lots) => {
        // Only show fabric rolls that are awaiting inspection AND have been scanned & bound with an RFID tag at Station 1.
        // Rolls with unassigned tags remain at Station 1 for receiving.demo to scan and bind.
        const awaitingQc = lots.filter(
          (l) => l.status === "awaiting-inspection" && Boolean(l.rfidUid) && l.rfidUid !== "unassigned",
        );
        const awaitingReceiving = lots.filter(
          (l) => l.status === "awaiting-inspection" && (!l.rfidUid || l.rfidUid === "unassigned"),
        );

        if (awaitingQc.length === 0) {
          if (awaitingReceiving.length > 0) {
            return (
              <div className="rounded-xl border border-dashed p-6 text-center space-y-3 bg-muted/20">
                <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                  <Radio className="size-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    All tagged fabric rolls evaluated · {awaitingReceiving.length} lot(s) awaiting Receiving completion
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {awaitingReceiving.length} incoming fabric lot(s) are registered but pending bundle card assignment at Station 1 Receiving. Once tagged, they will automatically appear here for incoming QC evaluation.
                  </p>
                </div>
                <div className="pt-1 flex items-center justify-center gap-2">
                  <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                    <AppLink href={paths.workstation}>
                      Open Station 1 (Receiving) <ArrowRight className="size-3" />
                    </AppLink>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-8 text-xs gap-1.5">
                    <AppLink href={paths.quality}>
                      Open Quality Gate
                    </AppLink>
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div className="rounded-xl border border-dashed p-6 text-center space-y-2 bg-muted/20">
              <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                All scanned incoming fabric rolls have been evaluated
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                No fabric rolls are currently awaiting incoming inspection in quarantine. New deliveries logged and tagged at Station 1 will appear here.
              </p>
            </div>
          );
        }

        return (
          <div className="divide-y rounded-lg border bg-card">
            {awaitingQc.map((lot) => (
              <div
                key={lot.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground wt-id">{lot.id}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-medium text-foreground">{lot.material}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      <Radio className="size-2.5" /> Tag: {lot.rfidUid}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supplier: <span className="font-medium text-foreground">{lot.supplierRef}</span> · Amount in Quarantine: <span className="font-medium text-foreground">{lot.receivedQty} {lot.unit ?? "m"}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Awaiting QC
                  </span>
                  <Button asChild size="sm" className="h-8 text-xs gap-1.5 bg-primary">
                    <AppLink href={paths.quality}>
                      Evaluate &amp; Sign-Off <ArrowRight className="size-3" />
                    </AppLink>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        );
      }}
    </Loadable>
  );
}

function RawStoreDashboard() {
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const [dateFilter, setDateFilter] = useState<DateFilterOption>("all");

  if (qOrders.isError || qLots.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Home" description="Department of Raw Material Store" />
        <div className="rounded-xl border border-dashed p-8 text-center space-y-3 bg-muted/10">
          <AlertTriangle className="size-6 text-amber-500 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            Unable to load warehouse bundles right now.
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            The system is reconnecting to the database. Please click below to refresh.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void qOrders.refetch();
              void qLots.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (qOrders.isPending || qLots.isPending || !qOrders.data || !qLots.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Home" description="Department of Raw Material Store" />
        <LoadingState label="Loading available bundles…" />
      </div>
    );
  }

  const orders = qOrders.data;
  const lots = qLots.data;

  // 1. Available QC-Cleared Fabric Stock (Passed incoming QC)
  const acceptedLots = lots.filter(
    (l) => l.status === "accepted" && (Number(l.balanceQty) > 0 || Number(l.receivedQty) > 0),
  );
  const availableStockM = acceptedLots.reduce(
    (sum, l) => sum + (Number(l.balanceQty) || 0),
    0,
  );
  const totalStockM = lots.reduce(
    (sum, l) => sum + (Number(l.balanceQty) || 0),
    0,
  );
  const quarantineLots = lots.filter((l) => l.status === "awaiting-inspection");

  // 2. Pending Fabric Issues: approved orders awaiting fabric allocation
  const pendingFabricOrders = orders.filter(
    (o) =>
      (o.status === "approved" || o.status === "planned") &&
      (!o.lotCodes || o.lotCodes.length === 0) &&
      (!o.issues || o.issues.length === 0),
  );

  // 3. Active Production Orders: approved, planned, or in-progress
  const activeOrders = orders.filter(
    (o) => o.status === "approved" || o.status === "in-progress" || o.status === "planned",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description="Department of Raw Material Store"
      />

      {/* 4 Summary Cards Across the Top */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Available Bundles</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {acceptedLots.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {availableStockM.toFixed(1)} m available
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Stock</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Boxes className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {totalStockM.toFixed(1)} m
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {lots.length} rolls in store
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Awaiting Incoming QC</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            {quarantineLots.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {quarantineLots.reduce((acc, l) => acc + (Number(l.balanceQty) || 0), 0).toFixed(1)} m pending
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Orders</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Scissors className="size-3.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {activeOrders.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {pendingFabricOrders.length} awaiting fabric
          </p>
        </div>
      </div>

      {/* Section: Available Bundles (only bundles that passed qc.incoming) */}
      {(() => {
        const displayedLots = acceptedLots.filter((lot) =>
          matchesDateFilter((lot as any).receivedAt, (lot as any).createdAt, dateFilter),
        );

        return (
          <Section
            title="Available bundles"
            actions={
              <div className="flex items-center gap-1.5">
                <Calendar className="size-3.5 text-muted-foreground hidden sm:block" />
                <div className="w-32">
                  <NativeSelect
                    ariaLabel="Filter bundles by date"
                    value={dateFilter}
                    onChange={(val) => setDateFilter(val as DateFilterOption)}
                    options={[
                      { value: "all", label: "All dates" },
                      { value: "today", label: "Today" },
                      { value: "week", label: "This week" },
                      { value: "month", label: "This month" },
                    ]}
                  />
                </div>
              </div>
            }
          >
            {displayedLots.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center space-y-2 bg-muted/20">
                <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {dateFilter !== "all"
                    ? `No available bundles match "${dateFilter === "today" ? "Today" : dateFilter === "week" ? "This week" : "This month"}"`
                    : "No available bundles cleared by qc.incoming yet"}
                </p>
                {dateFilter !== "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs mt-2"
                    onClick={() => setDateFilter("all")}
                  >
                    Clear date filter
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y rounded-lg border bg-card overflow-hidden">
                {displayedLots.map((lot) => {
                  return (
                    <div
                      key={lot.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground wt-id">{lot.id}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-medium text-foreground">{lot.material}</span>
                          {lot.rfidUid && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              <Radio className="size-2.5" /> Tag: {lot.rfidUid}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Available Balance: <strong className="text-foreground">{lot.balanceQty} {lot.unit ?? "m"}</strong> ·{" "}
                          Received: <span className="font-medium text-foreground">{lot.receivedQty} {lot.unit ?? "m"}</span> ·{" "}
                          Supplier: <span className="font-medium text-foreground">{lot.supplierRef}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" /> Passed qc.incoming
                        </span>
                        <Button asChild size="sm" className="h-8 text-xs gap-1.5 bg-primary">
                          <AppLink href={paths.workstation}>
                            Issue at Station 2 <ArrowRight className="size-3" />
                          </AppLink>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        );
      })()}
    </div>
  );
}

function StitchingDashboard() {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 3000 });
  const qStation = useWtQuery(["rfid-station", "stitching"], (c) => c.getRfidStationData("stitching"), {
    refetchInterval: 1200,
  });

  const [activeTab, setActiveTab] = useState<"queue" | "completed">("queue");
  const [search, setSearch] = useState("");
  const [completedIds, setCompletedIds] = useState<Record<string, { at: string; uid?: string }>>({});
  const [lastOutcome, setLastOutcome] = useState<ScanOutcome | null>(null);

  // Auto-detect scans arriving via MQTT / backend hardware reader (Scanner 4)
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    const outcome = qStation.data?.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastSeenScanRef.current) {
      lastSeenScanRef.current = outcome.at;
      setLastOutcome(outcome);
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
          `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Stitching complete! Advanced to Finishing.`
        );
      }
    }
  }, [qStation.data?.lastScanOutcome, qGarments]);

  const handleScan = (garment: Garment) => {
    const uid = garment.rfidUid;
    if (!uid) {
      toast.error("No RFID card linked to this garment.");
      return;
    }
    void run(
      (c) => c.routineScan(uid, "stitching"),
      (outcome) => {
        setLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          setCompletedIds((prev) => ({
            ...prev,
            [garment.id]: { at: outcome.at || new Date().toISOString(), uid },
          }));
          void qGarments.refetch();
          return `✓ Garment ${garment.id} (${garment.productName}) Stitching complete! Advanced to Finishing.`;
        }
        return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me.displayName.split(" ")[0]}`}
        description="Production · Department of Stitching (Station 4)"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="gap-1.5 h-8 text-xs">
              <AppLink href={paths.workstation}>
                <Cpu className="size-3.5" /> Open Workstation (Station 4)
              </AppLink>
            </Button>
          </div>
        }
      />

      <Loadable query={qGarments}>
        {(garments) => {
          // Only garments cut and scanned by Station 3 Cutting (stage 'cut' or 'stitching', with bound RFID tag)
          const readyQueue = garments.filter(
            (g) =>
              ((g.stage as string) === "cut" || g.stage === "stitching") &&
              Boolean(g.rfidUid) &&
              !g.hold &&
              !completedIds[g.id]
          );

          // Garments completed stitching (in DB or completed on runtime)
          const completedQueue = garments.filter(
            (g) =>
              g.stage === "stitched" ||
              g.stage === "finishing" ||
              Boolean(completedIds[g.id])
          );

          const totalInAssembly = garments.filter(
            (g) => (g.stage as string) === "cut" || g.stage === "stitching" || g.stage === "finishing"
          ).length;

          const filteredReady = readyQueue.filter(
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
                  {/* 3 Summary KPI Cards */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">READY FOR STITCHING</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Scissors className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                        {readyQueue.length}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Scanned &amp; cut at Station 3
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">STITCHED TODAY</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                        {completedQueue.length}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Ready for Station 5 Finishing
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">IN ASSEMBLY</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Shirt className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {totalInAssembly}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Total active production
                      </p>
                    </div>
                  </div>

                  {/* Clean Tab Selector Pills (Rework and Scan UID input removed per instruction) */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                        <Scissors className="size-3.5" /> Stitching Queue ({readyQueue.length})
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
                  </div>

                  {/* TAB CONTENT: ACTIVE STITCHING QUEUE */}
                  {activeTab === "queue" && (
                    <div className="space-y-3">
                      {filteredReady.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-8 text-center space-y-2 bg-muted/20">
                          <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-4" />
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            All cut garments have been stitched
                          </p>
                          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                            No garments currently awaiting assembly. New garments created and tagged at Station 3 Cutting will appear here automatically.
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
                                    <span className="font-bold wt-id text-foreground">{garment.id}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="font-medium text-foreground">{garment.productName}</span>
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
                                    Order: <AppLink href={paths.order(garment.orderId)} className="font-medium text-foreground hover:underline">{garment.orderId}</AppLink> · Source: Cutting Table (Station 3)
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
                                        onClick={() => handleScan(garment)}
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
                    </div>
                  )}

                  {/* TAB CONTENT: COMPLETED */}
                  {activeTab === "completed" && (
                    <div className="space-y-3">
                      {filteredCompleted.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/20">
                          No garments stitched yet.
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
                                  <span className="font-bold wt-id text-foreground">{g.id}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-medium text-foreground">{g.productName}</span>
                                  <span className="font-mono text-muted-foreground">Tag: {g.rfidUid}</span>
                                </div>
                                <p className="text-muted-foreground">Order: {g.orderId}</p>
                              </div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="size-3" /> Done · Advanced to Finishing
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
        </div>
  );
}

function GeneralDashboard({ me }: { me: ReturnType<typeof useMe> }) {
  const q = useWtQuery(["dashboard"], (c) => c.getDashboard());
  const isReceivingUser = me.username === "receiving.demo" || me.department === "receiving";
  const isQualityUser = me.role === "Q";
  const isCuttingUser = me.department === "cutting" || me.username === "cutting.demo";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me.displayName.split(" ")[0]}`}
        description={`${roleLabels[me.role]} · Department of ${departmentLabels[me.department]}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <AppLink href={paths.rawStore}>
                Raw Store &amp; QC Queue
              </AppLink>
            </Button>
            {(can.createLot(me) || can.receiveLot(me)) && (
              <ReceiveLotDialog triggerLabel="+ New Fabric Lot" />
            )}
          </div>
        }
      />

      <Loadable query={q}>
        {(d) => (
          <div className="space-y-6">
            {/* Actionable Exceptions / Alerts */}
            {d.alerts.length > 0 && (
              <Section
                title="Operational exceptions"
                description="Critical holds, quality gates, and dispatch-blocking conditions."
              >
                <ul className="space-y-2.5">
                  {d.alerts.map((a, i) => {
                    const Icon = toneIcon[a.tone];
                    return (
                      <li
                        key={i}
                        className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm shadow-sm ${toneClass[a.tone]}`}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <div className="flex-1">
                          {a.href ? (
                            <AppLink
                              href={a.href}
                              className="font-medium underline-offset-2 hover:underline"
                            >
                              {a.message}
                            </AppLink>
                          ) : (
                            <p className="font-medium">{a.message}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {/* Department-tailored operational work */}
            {isReceivingUser ? (
              <Section title="Fabric Receiving">
                <ReceivingLotsQueue />
              </Section>
            ) : isQualityUser ? (
              <Section
                title="Incoming Fabric Quality Inspection Queue (Awaiting QC Sign-Off)"
                description="Physical fabric rolls scanned and tagged at Station 1 awaiting inspection and 4-point defect sign-off by Incoming QC."
                actions={
                  <Button asChild size="sm" className="gap-1.5">
                    <AppLink href={paths.quality}>
                      <ShieldCheck className="size-4" /> Open Quality Gate
                    </AppLink>
                  </Button>
                }
              >
                <IncomingQcQueue />
              </Section>
            ) : isRawStoreUser ? (
              <RawStoreDashboard />
            ) : (
              <Section
                title="Tasks & Work Queue"
                description={
                  isCuttingUser
                    ? undefined
                    : me.role === "M"
                    ? "Factory-wide task queue. Review prerequisites, bottlenecks, and assign work to operators."
                    : undefined
                }
              >
                <TasksSection hideHeader showHeader={false} />
              </Section>
            )}
          </div>
        )}
      </Loadable>
    </div>
  );
}

function AdminDashboard({ me }: { me: ReturnType<typeof useMe> }) {
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());

  const isLoading =
    qLots.isPending ||
    qOrders.isPending ||
    qGarments.isPending ||
    qFulfilment.isPending ||
    !qLots.data ||
    !qOrders.data ||
    !qGarments.data ||
    !qFulfilment.data;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Overview"
          description="Enterprise Supply Chain Diagnostics & Department Status"
        />
        <LoadingState label="Loading department metrics and live pipeline state…" />
      </div>
    );
  }

  const lots = qLots.data;
  const orders = qOrders.data;
  const garments = qGarments.data;
  const fulfilment = qFulfilment.data;
  const packages = fulfilment.packages || [];

  // 1. Raw Materials Department Metrics
  const passedLots = lots.filter((l) => l.status === "accepted");
  const quarantineLots = lots.filter((l) => l.status === "awaiting-inspection");
  const totalStockMeters = lots.reduce((acc, l) => acc + (Number(l.balanceQty) || 0), 0);
  const passedStockMeters = passedLots.reduce((acc, l) => acc + (Number(l.balanceQty) || 0), 0);

  // 2. Production Orders Metrics
  const completedOrders = orders.filter((o) => o.status === "completed");
  const activeOrders = orders.filter((o) => o.status !== "completed");
  const plannedUnits = orders.reduce((acc, o) => acc + (Number(o.plannedQty) || 0), 0);

  // 3. Station 3: Cutting Metrics
  const pendingCuttingOrders = orders.filter(
    (o) => o.status !== "completed" && (!o.issues || o.issues.length === 0 || !o.lotCodes?.length),
  );
  const cutGarments = garments.length;

  // 4. Station 4: Stitching Metrics
  const stitchingPending = garments.filter(
    (g) => g.stage === "cutting" || (g.stage === "stitching" && g.status !== "stitched"),
  );
  const stitchingDone = garments.filter(
    (g) =>
      ["finishing", "final_qc", "packing", "warehouse", "dispatched"].includes(g.stage) ||
      g.status === "stitched",
  );

  // 5. Station 5: Finishing Metrics
  const finishingPending = garments.filter((g) => g.stage === "finishing");
  const finishingDone = garments.filter(
    (g) =>
      ["final_qc", "packing", "warehouse", "dispatched"].includes(g.stage) ||
      g.status === "finished",
  );

  // 6. Station 6: Final Quality Assurance Metrics
  const qcPending = garments.filter((g) => g.stage === "final_qc");
  const qcPassed = garments.filter(
    (g) =>
      ["packing", "warehouse", "dispatched"].includes(g.stage) ||
      g.disposition === "pass",
  );
  const inReworkOrHold = garments.filter((g) => Boolean(g.hold) || g.disposition === "rework");

  // 7. Stations 7 & 8: Packing & Warehouse Metrics
  const packedCartonsCount = packages.length;
  const warehousedGarments = garments.filter(
    (g) => g.stage === "warehouse" || g.stage === "dispatched" || Boolean(g.packageId),
  );
  const storedBins = new Set(packages.map((p) => p.binId).filter(Boolean)).size;

  // 8. Station 9: Dispatch & Transparency Metrics
  const dispatchedGarments = garments.filter((g) => g.stage === "dispatched");

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" />

      {/* TOP 4 EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Fabric Stock
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Boxes className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {lots.length} <span className="text-sm font-normal text-muted-foreground">Rolls</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalStockMeters.toLocaleString()} m in stock
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Production Orders
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Scissors className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {orders.length} <span className="text-sm font-normal text-muted-foreground">Orders</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {completedOrders.length} completed · {activeOrders.length} active
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Garments Tracked
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Shirt className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {garments.length} <span className="text-sm font-normal text-muted-foreground">Units</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cutGarments} cut · {qcPassed.length} passed QC
          </p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Dispatched &amp; Live
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Truck className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {dispatchedGarments.length} <span className="text-sm font-normal text-muted-foreground">Dispatched</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Digital passports verified
          </p>
        </div>
      </div>

      {/* DEPARTMENT PIPELINE BREAKDOWN SECTION */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Department Pipeline Status</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. RAW MATERIALS STORE */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                    <Layers className="size-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">Raw Material Store</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
                  {passedLots.length} Ready
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-[11px] text-muted-foreground">Total Rolls</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{lots.length}</p>
                  <p className="text-[10px] text-muted-foreground">{totalStockMeters.toFixed(0)}m total</p>
                </div>
                <div className="rounded-lg bg-emerald-500/5 p-2.5 border border-emerald-500/20">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Passed QC</p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{passedLots.length}</p>
                  <p className="text-[10px] text-muted-foreground">{passedStockMeters.toFixed(0)}m ready</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-muted-foreground">Awaiting Incoming QC:</span>
                <span className="font-semibold text-amber-600">{quarantineLots.length} in quarantine</span>
              </div>
            </div>
          </div>

          {/* 2. PRODUCTION PLANNING */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
                    <Scissors className="size-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">Production Planning</span>
                </div>
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 border border-blue-500/20">
                  {orders.length} Total
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-[11px] text-muted-foreground">Orders Created</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{orders.length}</p>
                  <p className="text-[10px] text-muted-foreground">{plannedUnits} pcs planned</p>
                </div>
                <div className="rounded-lg bg-emerald-500/5 p-2.5 border border-emerald-500/20">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Orders Completed</p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{completedOrders.length}</p>
                  <p className="text-[10px] text-muted-foreground">{activeOrders.length} active</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-muted-foreground">Awaiting Fabric Issue:</span>
                <span className="font-semibold text-primary">{pendingCuttingOrders.length} pending</span>
              </div>
            </div>
          </div>

          {/* 3. CUTTING (STATION 3) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-purple-500/10 text-purple-600">
                    <Scissors className="size-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">Cutting (Station 3)</span>
                </div>
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 border border-purple-500/20">
                  {cutGarments} Cut
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="rounded-lg bg-amber-500/5 p-2.5 border border-amber-500/20">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Pending Cutting</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-0.5">{pendingCuttingOrders.length}</p>
                  <p className="text-[10px] text-muted-foreground">orders in queue</p>
                </div>
                <div className="rounded-lg bg-purple-500/5 p-2.5 border border-purple-500/20">
                  <p className="text-[11px] text-purple-700 dark:text-purple-400 font-medium">Done in Cutting</p>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-400 mt-0.5">{cutGarments}</p>
                  <p className="text-[10px] text-muted-foreground">units cut &amp; tagged</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-muted-foreground">Cutting Progress:</span>
                <span className="font-semibold text-foreground">
                  {plannedUnits > 0 ? Math.round((cutGarments / plannedUnits) * 100) : 100}% of planned output
                </span>
              </div>
            </div>
          </div>

          {/* 4. STITCHING (STATION 4) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600">
                    <Shirt className="size-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">Stitching (Station 4)</span>
                </div>
                <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 border border-indigo-500/20">
                  {stitchingDone.length} Stitched
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="rounded-lg bg-amber-500/5 p-2.5 border border-amber-500/20">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Pending Stitching</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-0.5">{stitchingPending.length}</p>
                  <p className="text-[10px] text-muted-foreground">units in assembly</p>
                </div>
                <div className="rounded-lg bg-indigo-500/5 p-2.5 border border-indigo-500/20">
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">Done in Stitching</p>
                  <p className="text-lg font-bold text-indigo-700 dark:text-indigo-400 mt-0.5">{stitchingDone.length}</p>
                  <p className="text-[10px] text-muted-foreground">sewing completed</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-muted-foreground">Assembly Rate:</span>
                <span className="font-semibold text-foreground">
                  {cutGarments > 0 ? Math.round((stitchingDone.length / cutGarments) * 100) : 100}% completed
                </span>
              </div>
            </div>
          </div>

          {/* 5. FINISHING & QUALITY (STATIONS 5 & 6) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-teal-500/10 text-teal-600">
                    <ShieldCheck className="size-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">Finishing &amp; Final QC (5 &amp; 6)</span>
                </div>
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-600 border border-teal-500/20">
                  {qcPassed.length} Passed
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-[11px] text-muted-foreground">In Finishing</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{finishingPending.length}</p>
                  <p className="text-[10px] text-muted-foreground">trimming &amp; pressing</p>
                </div>
                <div className="rounded-lg bg-emerald-500/5 p-2.5 border border-emerald-500/20">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Passed Final QC</p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{qcPassed.length}</p>
                  <p className="text-[10px] text-muted-foreground">cleared for packaging</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-muted-foreground">Quarantine / Rework:</span>
                <span className={`font-semibold ${inReworkOrHold.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {inReworkOrHold.length} in hold
                </span>
              </div>
            </div>
          </div>

          {/* 6. WAREHOUSE & PACKING (STATIONS 7 & 8) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                    <PackageCheck className="size-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">Packing &amp; Warehouse (7 &amp; 8)</span>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-500/20">
                  {storedBins} Bins
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-[11px] text-muted-foreground">Cartons Packed</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{packedCartonsCount}</p>
                  <p className="text-[10px] text-muted-foreground">boxes sealed</p>
                </div>
                <div className="rounded-lg bg-amber-500/5 p-2.5 border border-amber-500/20">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">In Storage Bins</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-0.5">{warehousedGarments.length}</p>
                  <p className="text-[10px] text-muted-foreground">units binned</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-muted-foreground">Storage Locations:</span>
                <span className="font-semibold text-foreground">{storedBins} active storage bins</span>
              </div>
            </div>
            <div className="pt-2 border-t">
              <Button asChild variant="outline" size="sm" className="w-full text-xs h-8">
                <AppLink href={paths.warehouseLocator}>
                  Open Warehouse Locator <ArrowRight className="size-3.5 ml-1" />
                </AppLink>
              </Button>
            </div>
          </div>

          {/* 7. DISPATCH & TRANSPARENCY (STATION 9) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4 md:col-span-2 lg:col-span-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                    <Truck className="size-4" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-foreground">Dispatch &amp; Transparency Passports (Station 9)</span>
                  </div>
                </div>
                <Button asChild size="sm" className="h-8 text-xs font-semibold">
                  <AppLink href={paths.productPassports}>
                    <QrCode className="size-3.5 mr-1" /> View Product QR Codes &amp; URLs
                  </AppLink>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2 text-xs">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">Dispatched Units</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{dispatchedGarments.length}</p>
                </div>
                <div className="rounded-lg bg-emerald-500/5 p-3 border border-emerald-500/20">
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Lifecycle Complete</p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{dispatchedGarments.length}</p>
                </div>
                <div className="rounded-lg bg-blue-500/5 p-3 border border-blue-500/20">
                  <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">Digital Passports</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mt-0.5">{dispatchedGarments.length}</p>
                </div>
                <div className="rounded-lg bg-purple-500/5 p-3 border border-purple-500/20">
                  <p className="text-[11px] text-purple-700 dark:text-purple-400 font-medium">Cryptographic Trail</p>
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-400 mt-0.5">100%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardView() {
  const me = useMe();
  const isAdmin = me.role === "A" || me.username?.toLowerCase() === "admin.demo";

  if (isAdmin) {
    return <AdminDashboard me={me} />;
  }

  const isIncomingQC = me.username?.toLowerCase() === "qc.incoming";

  if (isIncomingQC) {
    return <QualityView />;
  }

  const isStitchingUser = me.department === "stitching" || me.username === "stitching.demo";

  if (isStitchingUser) {
    return <StitchingDashboard />;
  }

  const isRawStoreUser = me.department === "raw-store" || me.username === "rawstore.demo";

  if (isRawStoreUser) {
    return <RawStoreDashboard />;
  }

  return <GeneralDashboard me={me} />;
}
