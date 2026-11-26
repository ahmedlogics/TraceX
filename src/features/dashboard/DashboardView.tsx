import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  Info,
  OctagonAlert,
  Package,
  Radio,
  Scissors,
  ShieldCheck,
  Shirt,
  Sparkles,
  Wrench,
  Search,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Section, IdLink } from "@/components/wt/layout";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can, canAccessRoute } from "@/domain/permissions";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { StatusBadge, HoldBadge } from "@/components/wt/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReceiveLotDialog } from "@/features/materials/LotsView";
import { TasksSection } from "@/features/tasks/TasksView";
import { QualityView } from "@/features/quality/QualityView";
import type { Garment, ReworkCase, ScanOutcome } from "@/domain/types";

const toneIcon = { danger: OctagonAlert, warning: AlertTriangle, info: Info } as const;
const toneClass = {
  danger: "border-destructive/30 bg-danger-soft text-destructive",
  warning: "border-warning/30 bg-warning-soft text-warning",
  info: "border-accent bg-info-soft text-accent-foreground",
} as const;

function ReceivingLotsQueue() {
  const qLots = useWtQuery(["lots"], (c) => c.listLots(), { refetchInterval: 3000 });

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
  const qLots = useWtQuery(["lots"], (c) => c.listLots(), { refetchInterval: 3000 });

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
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders(), { refetchInterval: 3000 });
  const qLots = useWtQuery(["lots"], (c) => c.listLots(), { refetchInterval: 3000 });

  return (
    <Loadable query={qOrders}>
      {(orders) => (
        <Loadable query={qLots}>
          {(lots) => {
            // 1. Pending Fabric Issues: approved orders awaiting fabric allocation
            const pendingFabricOrders = orders.filter(
              (o) =>
                (o.status === "approved" || o.status === "planned") &&
                (!o.lotCodes || o.lotCodes.length === 0) &&
                (!o.issues || o.issues.length === 0),
            );

            // 2. Active Production Orders: approved, planned, or in-progress
            const activeOrders = orders.filter(
              (o) => o.status === "approved" || o.status === "in-progress" || o.status === "planned",
            );

            // 3. Issued Orders: orders that have had fabric issued
            const issuedOrders = orders.filter(
              (o) =>
                (o.lotCodes && o.lotCodes.length > 0) ||
                (o.issues && o.issues.length > 0) ||
                (o.status === "in-progress" && (o.lotIds?.length ?? 0) > 0),
            );

            // 4. Available QC-Cleared Fabric Stock
            const acceptedLots = lots.filter((l) => l.status === "accepted");
            const availableStockM = acceptedLots.reduce(
              (sum, l) => sum + (Number(l.balanceQty) || 0),
              0,
            );
            const quarantineLots = lots.filter((l) => l.status === "awaiting-inspection");

            return (
              <div className="space-y-6">
                {/* 4 Summary Cards Across the Top */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Pending Fabric Issues</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Scissors className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                      {pendingFabricOrders.length}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {pendingFabricOrders.length === 1 ? "1 order ready for Station 2" : `${pendingFabricOrders.length} orders ready for Station 2`}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Active Production Orders</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Radio className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                      {activeOrders.length}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {orders.filter((o) => o.status === "in-progress").length} in cutting &amp; assembly
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Issued Orders</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                      {issuedOrders.length}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Fabric transferred to cutting table
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Available QC-Cleared Stock</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                      {availableStockM.toFixed(1)} m
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {acceptedLots.length} passed rolls · {quarantineLots.length} in quarantine
                    </p>
                  </div>
                </div>

                {/* Section: Pending Fabric Issue Queue */}
                <Section
                  title="Pending Fabric Issue Queue"
                  actions={
                    <Button asChild size="sm" className="h-8 text-xs gap-1.5">
                      <AppLink href={paths.workstation}>
                        Open Station 2 Workstation <ArrowRight className="size-3" />
                      </AppLink>
                    </Button>
                  }
                >
                  {pendingFabricOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center space-y-2 bg-muted/20">
                      <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-4" />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        All approved production orders have been issued fabric
                      </p>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        No orders currently require fabric allocation. New manager-approved orders will automatically queue here.
                      </p>
                      <div className="pt-1">
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                          <AppLink href={paths.orders}>
                            View All Orders in Planning
                          </AppLink>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y rounded-lg border bg-card overflow-hidden">
                      {pendingFabricOrders.map((order) => {
                        const requiredMeters = Math.round(order.plannedQty * 2.0 * 10) / 10;
                        return (
                          <div
                            key={order.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground wt-id">{order.id}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="font-medium text-foreground">{order.product}</span>
                                <span className="text-xs text-muted-foreground">({order.styleCode})</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Planned Output: <strong className="text-foreground">{order.plannedQty} pcs</strong> ·{" "}
                                Required Fabric: <strong className="text-foreground">{requiredMeters} m</strong> ·{" "}
                                Due Date: <span className="font-medium text-foreground">{order.dueDate}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                Ready to Issue
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
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}

function StitchingDashboard() {
  const me = useMe();
  const inputRef = useRef<HTMLInputElement>(null);
  const { run, pending } = useWtAction();
  const [scanGarment, setScanGarment] = useState<Garment | null>(null);
  const [inputUid, setInputUid] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 2000 });
  const qStation = useWtQuery(["rfid-station", "stitching"], (c) => c.getRfidStationData("stitching"), {
    refetchInterval: scanGarment ? 600 : 1500,
  });
  const qStationFinishing = useWtQuery(["rfid-station", "finishing"], (c) => c.getRfidStationData("finishing"), {
    refetchInterval: scanGarment ? 600 : 3000,
  });

  const [activeTab, setActiveTab] = useState<"queue" | "completed">("queue");
  const [search, setSearch] = useState("");
  const [completedIds, setCompletedIds] = useState<Record<string, { at: string; uid?: string }>>({});
  const [lastOutcome, setLastOutcome] = useState<ScanOutcome | null>(null);

  // Focus input on modal open
  useEffect(() => {
    if (scanGarment) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [scanGarment]);

  // Auto-detect scans arriving via MQTT / backend hardware reader (Scanner 4 or 5)
  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    const outcome = qStation.data?.lastScanOutcome || qStationFinishing.data?.lastScanOutcome;
    if (!outcome || !outcome.at) return;
    if (outcome.at === lastSeenScanRef.current) return;
    lastSeenScanRef.current = outcome.at;
    setLastOutcome(outcome);

    const matchedGarment = qGarments.data?.find(
      (g) => g.id === outcome.subjectId || g.rfidUid === outcome.uid
    );
    const gId = matchedGarment?.id || outcome.subjectId;

    if (outcome.resolution === "accepted") {
      if (gId) {
        setCompletedIds((prev) => ({
          ...prev,
          [gId]: { at: outcome.at || new Date().toISOString(), uid: outcome.uid },
        }));
      }
      void qGarments.refetch();
      if (scanGarment && (scanGarment.id === gId || scanGarment.rfidUid === outcome.uid)) {
        setScanGarment(null);
        setInputUid("");
        setScanError(null);
      }
      toast.success(
        `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Stitching complete! Advanced to Finishing.`
      );
    } else if (scanGarment && (scanGarment.id === gId || scanGarment.rfidUid === outcome.uid)) {
      setInputUid(outcome.uid || "");
      setScanError(outcome.rejectReason || `Scan rejected: ${outcome.resolution}`);
    }
  }, [qStation.data?.lastScanOutcome, qStationFinishing.data?.lastScanOutcome, qGarments, scanGarment]);

  const handleConfirmScan = (overrideUid?: string) => {
    if (!scanGarment) return;
    const uidToUse = (overrideUid || inputUid).trim();
    if (!uidToUse) {
      setScanError("Please enter or scan an RFID tag UID.");
      return;
    }
    const targetUid = scanGarment.rfidUid;
    if (targetUid && uidToUse.toUpperCase() !== targetUid.toUpperCase()) {
      setScanError(`Tag mismatch: Entered tag "${uidToUse}" does not match garment tag "${targetUid}".`);
      return;
    }

    void run(
      (c) => c.routineScan(uidToUse, "stitching"),
      (outcome) => {
        setLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          setCompletedIds((prev) => ({
            ...prev,
            [scanGarment.id]: { at: outcome.at || new Date().toISOString(), uid: uidToUse },
          }));
          void qGarments.refetch();
          setScanGarment(null);
          setInputUid("");
          setScanError(null);
          return `✓ Garment ${scanGarment.id} (${scanGarment.productName}) Stitching complete! Advanced to Finishing.`;
        }
        setScanError(`Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`);
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
                                        onClick={() => {
                                          setScanGarment(garment);
                                          setInputUid("");
                                          setScanError(null);
                                        }}
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

          {/* Scan Garment RFID Dialog */}
          <Dialog open={!!scanGarment} onOpenChange={(open) => { if (!open) setScanGarment(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ScanLine className="size-5 text-primary" />
                  Scan Garment Tag · Station 4
                </DialogTitle>
                <DialogDescription>
                  Scan or enter the garment's RFID tag to complete seam assembly and advance to Station 5 Finishing.
                </DialogDescription>
              </DialogHeader>

              {scanGarment && (
                <div className="space-y-4 pt-1">
                  {/* Garment Details Card */}
                  <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">{scanGarment.productName}</span>
                      {scanGarment.size && (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          Size {scanGarment.size}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Garment ID:</span>
                        <span className="font-mono font-medium text-foreground">{scanGarment.id}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Order:</span>
                        <span className="font-mono text-foreground">{scanGarment.orderId}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Linked Tag UID:</span>
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          <Radio className="size-3" /> {scanGarment.rfidUid}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Live Reader Detection Beacon */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="relative flex size-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full size-2.5 bg-primary" />
                      </span>
                      <span className="font-medium text-foreground">Scanner 4 Active &amp; Listening</span>
                    </div>
                    {scanGarment.rfidUid && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1 px-2 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => {
                          const uid = scanGarment.rfidUid || "";
                          setInputUid(uid);
                          setScanError(null);
                          handleConfirmScan(uid);
                        }}
                      >
                        Auto-Fill Tag ({scanGarment.rfidUid})
                      </Button>
                    )}
                  </div>

                  {/* Scan Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      RFID Card UID
                    </label>
                    <Input
                      ref={inputRef}
                      autoFocus
                      placeholder="Scan or enter RFID card UID (e.g. D49B0103)..."
                      value={inputUid}
                      onChange={(e) => {
                        setInputUid(e.target.value);
                        if (scanError) setScanError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleConfirmScan();
                        }
                      }}
                      className="font-mono text-sm"
                    />
                  </div>

                  {scanError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
                      <OctagonAlert className="size-4 shrink-0" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  <DialogFooter className="gap-2 sm:gap-0 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setScanGarment(null)}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="gap-1.5 bg-primary font-semibold"
                      disabled={pending || !inputUid.trim()}
                      onClick={() => handleConfirmScan()}
                    >
                      <CheckCircle2 className="size-4" />
                      {pending ? "Validating..." : "Confirm & Complete"}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
  );
}

function FinishingDashboard() {
  const me = useMe();
  const inputRef = useRef<HTMLInputElement>(null);
  const { run, pending } = useWtAction();
  const [scanGarment, setScanGarment] = useState<Garment | null>(null);
  const [inputUid, setInputUid] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Record<string, { at: string; uid?: string }>>({});
  const [activeTab, setActiveTab] = useState<"queue" | "completed">("queue");
  const [search, setSearch] = useState("");
  const [lastOutcome, setLastOutcome] = useState<ScanOutcome | null>(null);

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 2000 });
  const qStation = useWtQuery(["rfid-station", "finishing"], (c) => c.getRfidStationData("finishing"), {
    refetchInterval: scanGarment ? 600 : 1500,
  });

  useEffect(() => {
    if (scanGarment) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [scanGarment]);

  const lastSeenScanRef = useRef<string | null>(null);
  useEffect(() => {
    const outcome = qStation.data?.lastScanOutcome;
    if (!outcome?.at || outcome.at === lastSeenScanRef.current) return;
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
      if (scanGarment && (scanGarment.id === gId || scanGarment.rfidUid === outcome.uid)) {
        setScanGarment(null);
        setInputUid("");
        setScanError(null);
      }
      toast.success(
        `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Finishing complete! Advanced to Station 6 QC Gate.`
      );
    } else if (scanGarment && (scanGarment.id === gId || scanGarment.rfidUid === outcome.uid)) {
      setInputUid(outcome.uid || "");
      setScanError(outcome.rejectReason || `Scan rejected: ${outcome.resolution}`);
    }
  }, [qStation.data?.lastScanOutcome, qGarments, scanGarment]);

  const handleConfirmScan = (overrideUid?: string) => {
    if (!scanGarment) return;
    const uidToUse = (overrideUid || inputUid).trim();
    if (!uidToUse) {
      setScanError("Please enter or scan an RFID tag UID.");
      return;
    }
    const targetUid = scanGarment.rfidUid;
    if (targetUid && uidToUse.toUpperCase() !== targetUid.toUpperCase()) {
      setScanError(`Tag mismatch: Entered tag "${uidToUse}" does not match garment tag "${targetUid}".`);
      return;
    }

    void run(
      (c) => c.routineScan(uidToUse, "finishing"),
      (outcome) => {
        setLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          setCompletedIds((prev) => ({
            ...prev,
            [scanGarment.id]: { at: outcome.at || new Date().toISOString(), uid: uidToUse },
          }));
          void qGarments.refetch();
          setScanGarment(null);
          setInputUid("");
          setScanError(null);
          return `✓ Garment ${scanGarment.id} (${scanGarment.productName}) Finishing complete! Advanced to Station 6 QC Gate.`;
        }
        setScanError(`Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`);
        return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me.displayName.split(" ")[0]}`}
        description="Production · Department of Finishing (Station 5)"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="gap-1.5 h-8 text-xs">
              <AppLink href={paths.workstation}>
                <Cpu className="size-3.5" /> Open Workstation (Station 5)
              </AppLink>
            </Button>
          </div>
        }
      />

      <Loadable query={qGarments}>
        {(garments) => {
          const readyQueue = garments.filter(
            (g) =>
              (g.stage === "stitched" || g.stage === "finishing") &&
              Boolean(g.rfidUid) &&
              !g.hold &&
              !completedIds[g.id]
          );

          const completedQueue = garments.filter(
            (g) =>
              g.stage === "finished" ||
              g.stage === "final-qc" ||
              g.stage === "packing" ||
              g.stage === "warehouse" ||
              g.stage === "dispatched" ||
              Boolean(completedIds[g.id])
          );

          const totalInAssembly = garments.filter(
            (g) => (g.stage as string) === "cut" || g.stage === "stitching" || g.stage === "finishing" || g.stage === "stitched"
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
              {/* Stat Cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">READY FOR FINISHING</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <Sparkles className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                    {readyQueue.length}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Stitched &amp; tagged at Station 4
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
                    Ready for Station 6 Final QC
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

              {/* Tabs and Controls */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab("queue")}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                        activeTab === "queue"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sparkles className="size-3.5" /> Finishing Queue ({readyQueue.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("completed")}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                        activeTab === "completed"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <CheckCircle2 className="size-3.5" /> Completed ({completedQueue.length})
                    </button>
                  </div>

                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search garments, order..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                {/* Queue Tab */}
                {activeTab === "queue" && (
                  <div className="space-y-3">
                    {filteredReady.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-8 text-center space-y-2 bg-muted/20">
                        <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Finishing queue is clear</p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          Garments will appear here once stitched at Station 4.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y rounded-lg border bg-card overflow-hidden">
                        {filteredReady.map((garment) => (
                          <div
                            key={garment.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-muted/30 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold wt-id text-foreground">{garment.id}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="font-semibold text-foreground">{garment.productName}</span>
                                {garment.size && (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground font-medium">
                                    Size {garment.size}
                                  </span>
                                )}
                                {garment.rfidUid && (
                                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                    <Radio className="size-2.5" /> Tag: {garment.rfidUid}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Order: <span className="font-medium text-foreground">{garment.orderId}</span>
                                {" · "}Source: Stitching Assembly (Station 4)
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                Ready to Finish
                              </span>
                              <Button
                                size="sm"
                                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                                disabled={pending}
                                onClick={() => {
                                  setScanGarment(garment);
                                  setInputUid("");
                                  setScanError(null);
                                }}
                              >
                                <ScanLine className="size-3.5" /> Scan &amp; Complete <ArrowRight className="size-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Completed Tab */}
                {activeTab === "completed" && (
                  <div className="space-y-3">
                    {filteredCompleted.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/20">
                        No garments finished yet today.
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
                              <CheckCircle2 className="size-3" /> Done · Released to Station 6 QC
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scan Garment RFID Dialog */}
              <Dialog open={!!scanGarment} onOpenChange={(open) => { if (!open) setScanGarment(null); }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ScanLine className="size-5 text-primary" />
                      Scan Garment Tag · Station 5
                    </DialogTitle>
                    <DialogDescription>
                      Scan or enter the garment's RFID tag to complete artisan finishing and advance to Station 6 QC Gate.
                    </DialogDescription>
                  </DialogHeader>

                  {scanGarment && (
                    <div className="space-y-4 pt-1">
                      <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-foreground">{scanGarment.productName}</span>
                          {scanGarment.size && (
                            <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                              Size {scanGarment.size}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center justify-between">
                            <span>Garment ID:</span>
                            <span className="font-mono font-medium text-foreground">{scanGarment.id}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Order:</span>
                            <span className="font-mono text-foreground">{scanGarment.orderId}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Linked Tag UID:</span>
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                              <Radio className="size-3" /> {scanGarment.rfidUid}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="relative flex size-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full size-2.5 bg-primary" />
                          </span>
                          <span className="font-medium text-foreground">Scanner 5 Active &amp; Listening</span>
                        </div>
                        {scanGarment.rfidUid && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1 px-2 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => {
                              const uid = scanGarment.rfidUid || "";
                              setInputUid(uid);
                              setScanError(null);
                              handleConfirmScan(uid);
                            }}
                          >
                            Auto-Fill Tag ({scanGarment.rfidUid})
                          </Button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          RFID Card UID
                        </label>
                        <Input
                          ref={inputRef}
                          autoFocus
                          placeholder="Scan or enter RFID card UID (e.g. D49B0103)..."
                          value={inputUid}
                          onChange={(e) => {
                            setInputUid(e.target.value);
                            if (scanError) setScanError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleConfirmScan();
                            }
                          }}
                          className="font-mono text-sm"
                        />
                      </div>

                      {scanError && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
                          <OctagonAlert className="size-4 shrink-0" />
                          <span>{scanError}</span>
                        </div>
                      )}

                      <DialogFooter className="gap-2 sm:gap-0 pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setScanGarment(null)}
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          className="gap-1.5 bg-primary font-semibold"
                          disabled={pending || !inputUid.trim()}
                          onClick={() => handleConfirmScan()}
                        >
                          <CheckCircle2 className="size-4" />
                          {pending ? "Validating..." : "Confirm & Complete"}
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          );
        }}
      </Loadable>
    </div>
  );
}

function PackingDashboard() {
  const [activeTab, setActiveTab] = useState<"queue" | "packed" | "cartons">("queue");
  const [search, setSearch] = useState("");

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 2000 });
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment(), { refetchInterval: 3000 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back, Packing"
        description="Logistics · Department of Packing & Packaging (Station 7)"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="gap-1.5 shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground">
              <AppLink href={paths.workstation}>
                <Package className="size-4" />
                Open Workstation (Station 7)
              </AppLink>
            </Button>
          </div>
        }
      />

      <Loadable query={qGarments}>
        {(garments) => (
          <Loadable query={qFulfilment}>
            {(fulfilment) => {
              const packages = fulfilment?.packages || [];
              const openPackages = packages.filter((p: any) => p.status === "open");

              const readyForPacking = garments.filter(
                (g) =>
                  !g.packageId &&
                  !g.hold &&
                  (g.disposition === "passed" || g.disposition === "released") &&
                  (g.stage === "packing" ||
                    (g.stage as string) === "final-qc" ||
                    (g.stage as string) === "finished")
              );

              const packedGarments = garments.filter(
                (g) => Boolean(g.packageId) || g.stage === "packed"
              );

              const filteredReady = readyForPacking.filter(
                (g) =>
                  !search.trim() ||
                  `${g.id} ${g.orderId} ${g.productName} ${g.rfidUid ?? ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
              );

              const filteredPacked = packedGarments.filter(
                (g) =>
                  !search.trim() ||
                  `${g.id} ${g.orderId} ${g.productName} ${g.rfidUid ?? ""} ${g.packageId ?? ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
              );

              return (
                <div className="space-y-6">
                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">READY FOR PACKING</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Package className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                        {readyForPacking.length}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        QC released · Station 6 inspected
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">PACKED IN CARTONS</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          <CheckCircle2 className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                        {packedGarments.length}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Packaged & sealed for warehouse
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">OPEN CARTONS</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Boxes className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                        {openPackages.length}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Active master packaging boxes
                      </p>
                    </div>
                  </div>

                  {/* Navigation Tabs & Search */}
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                      <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
                        <button
                          type="button"
                          onClick={() => setActiveTab("queue")}
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                            activeTab === "queue"
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Package className="size-3.5" />
                          Packing Queue ({readyForPacking.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("packed")}
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                            activeTab === "packed"
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <CheckCircle2 className="size-3.5" />
                          Packed Products ({packedGarments.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("cartons")}
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                            activeTab === "cartons"
                              ? "bg-card text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Boxes className="size-3.5" />
                          Master Cartons ({packages.length})
                        </button>
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search products or tags..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Tab 1: Ready For Packing Queue */}
                    {activeTab === "queue" && (
                      <div className="rounded-xl border bg-card">
                        {filteredReady.length === 0 ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">
                            {search
                              ? "No garments match your search."
                              : "No garments waiting for packing. Garments passing Station 6 Final QC will appear here."}
                          </div>
                        ) : (
                          <div className="divide-y">
                            {filteredReady.map((g) => (
                              <div
                                key={g.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-semibold text-foreground">
                                      {g.id}
                                    </span>
                                    <span className="text-sm font-medium text-muted-foreground">
                                      · {g.productName}
                                    </span>
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                      Size {(g as any).size ?? "M"}
                                    </span>
                                    {g.rfidUid && (
                                      <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                        Tag: {g.rfidUid}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span>Order: <strong className="font-medium text-foreground">{g.orderId}</strong></span>
                                    <span>•</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                      ✓ Released from Station 6 Final QC
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    Ready to Pack
                                  </span>
                                  <Button asChild size="sm" className="gap-1.5 bg-primary text-xs font-semibold shadow-xs">
                                    <AppLink href={paths.workstation}>
                                      <Package className="size-3.5" />
                                      Pack in Station 7 →
                                    </AppLink>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 2: Packed Products */}
                    {activeTab === "packed" && (
                      <div className="rounded-xl border bg-card">
                        {filteredPacked.length === 0 ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">
                            {search
                              ? "No packed garments match your search."
                              : "No garments packed yet. Open Station 7 Workstation to begin packaging."}
                          </div>
                        ) : (
                          <div className="divide-y">
                            {filteredPacked.map((g) => (
                              <div
                                key={g.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-semibold text-foreground">
                                      {g.id}
                                    </span>
                                    <span className="text-sm font-medium text-muted-foreground">
                                      · {g.productName}
                                    </span>
                                    {g.packageId && (
                                      <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                        Carton: {g.packageId}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Order: {g.orderId} · Tag: {g.rfidUid || "Assigned"}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                                    Packed
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 3: Cartons */}
                    {activeTab === "cartons" && (
                      <div className="rounded-xl border bg-card">
                        {packages.length === 0 ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">
                            No master cartons created yet.
                          </div>
                        ) : (
                          <div className="divide-y">
                            {packages.map((pkg: any) => (
                              <div
                                key={pkg.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-semibold text-foreground">
                                      {pkg.id}
                                    </span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                      Tag: {pkg.rfidUid || "Auto-Bound"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Items: {pkg.garmentIds?.length ?? pkg.itemCount ?? 0} units packed
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                      pkg.status === "open"
                                        ? "bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400"
                                        : "bg-muted border text-muted-foreground"
                                    }`}
                                  >
                                    {pkg.status === "open" ? "Open for Packing" : "Sealed"}
                                  </span>
                                  <Button asChild size="sm" variant="outline" className="text-xs h-7">
                                    <AppLink href={paths.workstation}>
                                      View at Station 7
                                    </AppLink>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          </Loadable>
        )}
      </Loadable>
    </div>
  );
}

export function DashboardView() {
  const me = useMe();
  const isIncomingQC = me.username?.toLowerCase() === "qc.incoming";

  if (isIncomingQC) {
    return <QualityView />;
  }

  const isStitchingUser = me.department === "stitching" || me.username === "stitching.demo";

  if (isStitchingUser) {
    return <StitchingDashboard />;
  }

  const isFinishingUser = me.department === "finishing" || me.username === "finishing.demo";

  if (isFinishingUser) {
    return <FinishingDashboard />;
  }

  const isPackingUser = me.department === "packing" || me.username === "packing.demo";

  if (isPackingUser) {
    return <PackingDashboard />;
  }

  const q = useWtQuery(["dashboard"], (c) => c.getDashboard());
  const isReceivingUser = me.username === "receiving.demo" || me.department === "receiving";
  const isQualityUser = me.role === "Q";
  const isRawStoreUser = me.department === "raw-store" || me.username === "rawstore.demo";
  const isCuttingUser = me.department === "cutting" || me.username === "cutting.demo";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me.displayName.split(" ")[0]}`}
        description={`${roleLabels[me.role]} · Department of ${departmentLabels[me.department]}`}
        actions={
          (can.createLot(me) || can.receiveLot(me)) ? (
            <div className="flex flex-wrap items-center gap-2">
              <ReceiveLotDialog triggerLabel="+ New Fabric Lot" />
            </div>
          ) : undefined
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
