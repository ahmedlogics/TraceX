import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
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
import { ReceiveLotDialog } from "@/features/materials/LotsView";
import { TasksSection } from "@/features/tasks/TasksView";
import { QualityView } from "@/features/quality/QualityView";
import type { Garment, ReworkCase, ScanOutcome } from "@/domain/types";

const toneIcon = { danger: OctagonAlert, warning: AlertTriangle, info: Info } as const;
const toneClass = {
  danger: "border-[#BFA894] bg-[#E8D7C2]/70 text-[#2B170E]",
  warning: "border-[#C79C70] bg-[#F4EADA] text-[#2B170E]",
  info: "border-[#CDBBA8] bg-[#EFE3D3] text-[#2B170E]",
} as const;

function ReceivingLotsQueue() {
  const qLots = useWtQuery(["lots"], (c) => c.listLots(), { refetchInterval: 3000 });

  return (
    <Loadable query={qLots}>
      {(lots) => {
        const unassigned = lots.filter((l) => !l.rfidUid && l.status === "awaiting-inspection");

        if (unassigned.length === 0) {
          return (
            <div className="rounded-xl border border-dashed border-[#CDBBA8] p-6 text-center space-y-2 bg-[#FFFDFC]">
              <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#F2E4D2] text-[#2B170E]">
                <Radio className="size-4" />
              </div>
              <p className="text-sm font-semibold text-[#2B170E]">
                All lots have active bundle cards assigned
              </p>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">
                Lots Awaiting RFID Assignment ({unassigned.length})
              </p>
            </div>
            <div className="divide-y divide-[#CDBBA8]/60 rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] overflow-hidden">
              {unassigned.map((lot) => (
                <div
                  key={lot.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-[#F2E4D2]/30 transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#2B170E]">{lot.id} · {lot.material}</p>
                    <p className="text-xs text-[#6E5748]">
                      Supplier: <span className="font-semibold text-[#2B170E]">{lot.supplierRef}</span> · Amount: <span className="font-semibold text-[#2B170E]">{lot.receivedQty} {lot.unit ?? "m"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[#E2C8A8]/60 border border-[#CDBBA8] px-2.5 py-0.5 text-xs font-bold text-[#2B170E]">
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
              <div className="rounded-xl border border-dashed border-[#CDBBA8] p-6 text-center space-y-3 bg-[#FFFDFC]">
                <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#F2E4D2] text-[#2B170E]">
                  <Radio className="size-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#2B170E]">
                    All tagged fabric rolls evaluated · {awaitingReceiving.length} lot(s) awaiting Receiving completion
                  </p>
                  <p className="text-xs text-[#6E5748] max-w-md mx-auto">
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
            <div className="rounded-xl border border-dashed border-[#CDBBA8] p-6 text-center space-y-2 bg-[#FFFDFC]">
              <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#F2E4D2] text-[#2B170E]">
                <CheckCircle2 className="size-4" />
              </div>
              <p className="text-sm font-semibold text-[#2B170E]">
                All scanned incoming fabric rolls have been evaluated
              </p>
              <p className="text-xs text-[#6E5748] max-w-md mx-auto">
                No fabric rolls are currently awaiting incoming inspection in quarantine. New deliveries logged and tagged at Station 1 will appear here.
              </p>
            </div>
          );
        }

        return (
          <div className="divide-y divide-[#CDBBA8]/60 rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] overflow-hidden">
            {awaitingQc.map((lot) => (
              <div
                key={lot.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm hover:bg-[#F2E4D2]/30 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#2B170E] wt-id">{lot.id}</span>
                    <span className="text-[#6E5748]">·</span>
                    <span className="font-semibold text-[#2B170E]">{lot.material}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#2B170E] bg-[#E2C8A8]/50 px-2 py-0.5 rounded border border-[#CDBBA8]">
                      <Radio className="size-2.5" /> Tag: {lot.rfidUid}
                    </span>
                  </div>
                  <p className="text-xs text-[#6E5748]">
                    Supplier: <span className="font-semibold text-[#2B170E]">{lot.supplierRef}</span> · Amount in Quarantine: <span className="font-semibold text-[#2B170E]">{lot.receivedQty} {lot.unit ?? "m"}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#E2C8A8]/60 border border-[#CDBBA8] px-2.5 py-0.5 text-xs font-bold text-[#2B170E]">
                    Awaiting QC
                  </span>
                  <Button asChild size="sm" className="h-8 text-xs gap-1.5">
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
                  <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">Pending Fabric Issues</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                        <Scissors className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                      {pendingFabricOrders.length}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6E5748]">
                      {pendingFabricOrders.length === 1 ? "1 order ready for Station 2" : `${pendingFabricOrders.length} orders ready for Station 2`}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">Active Production Orders</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                        <Radio className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                      {activeOrders.length}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6E5748]">
                      {orders.filter((o) => o.status === "in-progress").length} in cutting &amp; assembly
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">Issued Orders</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                        <CheckCircle2 className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                      {issuedOrders.length}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6E5748]">
                      Fabric transferred to cutting table
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">Available QC-Cleared Stock</span>
                      <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                        <ShieldCheck className="size-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                      {availableStockM.toFixed(1)} m
                    </p>
                    <p className="mt-1 text-[11px] text-[#6E5748]">
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
                    <div className="rounded-xl border border-dashed border-[#CDBBA8] p-6 text-center space-y-2 bg-[#FFFDFC]">
                      <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#F2E4D2] text-[#2B170E]">
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
                              <span className="inline-flex items-center rounded-full bg-[#F4EADA] border border-[#CDBBA8] px-2.5 py-0.5 text-xs font-semibold text-[#6E5748]">
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
                    <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">READY FOR STITCHING</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                          <Scissors className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                        {readyQueue.length}
                      </p>
                      <p className="mt-1 text-[11px] text-[#6E5748]">
                        Scanned &amp; cut at Station 3
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">STITCHED TODAY</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                          <CheckCircle2 className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                        {completedQueue.length}
                      </p>
                      <p className="mt-1 text-[11px] text-[#6E5748]">
                        Ready for Station 5 Finishing
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">IN ASSEMBLY</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                          <Shirt className="size-3.5" />
                        </div>
                      </div>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                        {totalInAssembly}
                      </p>
                      <p className="mt-1 text-[11px] text-[#6E5748]">
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
                          <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#F2E4D2] text-[#2B170E]">
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
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F0EE] border border-[#99C5C1] px-2.5 py-0.5 text-xs font-semibold text-[#134441] shadow-2xs">
                                      <CheckCircle2 className="size-3 text-[#1B5E5A]" /> Done · Stitched
                                    </span>
                                  ) : (
                                    <>
                                      <span className="inline-flex items-center rounded-full bg-[#F4EADA] border border-[#CDBBA8] px-2.5 py-0.5 text-xs font-semibold text-[#6E5748]">
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
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F0EE] px-2 py-0.5 text-xs font-bold text-[#134441] border border-[#99C5C1] shadow-2xs">
                                <CheckCircle2 className="size-3 text-[#1B5E5A]" /> Done · Advanced to Finishing
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

function FinishingDashboard() {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments(), { refetchInterval: 3000 });
  const qStation = useWtQuery(["rfid-station", "finishing"], (c) => c.getRfidStationData("finishing"), {
    refetchInterval: 1200,
  });

  const [activeTab, setActiveTab] = useState<"queue" | "completed">("queue");
  const [search, setSearch] = useState("");
  const [completedIds, setCompletedIds] = useState<Record<string, { at: string; uid?: string }>>({});
  const [lastOutcome, setLastOutcome] = useState<ScanOutcome | null>(null);

  // Auto-detect scans arriving via MQTT / backend hardware reader (Scanner 5)
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
          `✓ Garment ${outcome.garmentCode ?? outcome.subjectId ?? ""} Finishing complete! Released to Station 6 QC Gate.`
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
      (c) => c.routineScan(uid, "finishing"),
      (outcome) => {
        setLastOutcome(outcome);
        if (outcome.resolution === "accepted") {
          setCompletedIds((prev) => ({
            ...prev,
            [garment.id]: { at: outcome.at || new Date().toISOString(), uid },
          }));
          void qGarments.refetch();
          return `✓ Garment ${garment.id} (${garment.productName}) Finishing complete! Released to Station 6 QC Gate.`;
        }
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
                <Cpu className="size-3.5" /> Open Workstation
              </AppLink>
            </Button>
          </div>
        }
      />

      <Loadable query={qGarments}>
        {(garments) => {
          // Only garments that completed Stitching at Station 4 (stage 'stitched' or 'finishing', with bound RFID tag)
          const readyQueue = garments.filter(
            (g) =>
              (g.stage === "stitched" || g.stage === "finishing") &&
              Boolean(g.rfidUid) &&
              !g.hold &&
              !completedIds[g.id]
          );

          // Garments finished (in DB or completed on runtime)
          const completedQueue = garments.filter(
            (g) =>
              g.stage === "finished" ||
              g.stage === "final-qc" ||
              Boolean(completedIds[g.id])
          );

          const releasedToQcCount = garments.filter(
            (g) => g.stage === "final-qc" || g.stage === "packing" || g.stage === "warehouse"
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
                <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">READY FOR FINISHING</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                      <Sparkles className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                    {readyQueue.length}
                  </p>
                  <p className="mt-1 text-[11px] text-[#6E5748]">
                    Stitched at Station 4
                  </p>
                </div>

                <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">FINISHED TODAY</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                      <CheckCircle2 className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                    {completedQueue.length}
                  </p>
                  <p className="mt-1 text-[11px] text-[#6E5748]">
                    Advanced to Station 6 QC
                  </p>
                </div>

                <div className="rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#6E5748] uppercase tracking-wider">AT FINAL QC GATE</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-[#F2E4D2] text-[#2B170E]">
                      <ShieldCheck className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-[#2B170E]">
                    {releasedToQcCount}
                  </p>
                  <p className="mt-1 text-[11px] text-[#6E5748]">
                    Under Station 6 inspection
                  </p>
                </div>
              </div>

              {/* Clean Tab Selector Pills */}
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
                    <Sparkles className="size-3.5" /> Finishing Queue ({readyQueue.length})
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

                <div className="flex items-center gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter garments..."
                    className="h-8 w-48 text-xs bg-card"
                  />
                </div>
              </div>

              {/* TAB CONTENT: ACTIVE FINISHING QUEUE */}
              {activeTab === "queue" && (
                <div className="space-y-3">
                  {filteredReady.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center space-y-2 bg-muted/20">
                      <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#F2E4D2] text-[#2B170E]">
                        <CheckCircle2 className="size-4" />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        All stitched garments have been finished
                      </p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        No garments currently awaiting finishing. When Station 4 Stitching completes assembly, garments will appear here automatically.
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
                                Order: <AppLink href={paths.order(garment.orderId)} className="font-medium text-foreground hover:underline">{garment.orderId}</AppLink> · Source: Stitching Line (Station 4)
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {isDone ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F0EE] border border-[#99C5C1] px-2.5 py-0.5 text-xs font-semibold text-[#134441] shadow-2xs">
                                  <CheckCircle2 className="size-3 text-[#1B5E5A]" /> Done · Finished
                                </span>
                              ) : (
                                <>
                                  <span className="inline-flex items-center rounded-full bg-[#F4EADA] border border-[#CDBBA8] px-2.5 py-0.5 text-xs font-semibold text-[#6E5748]">
                                    Ready to Finish
                                  </span>
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                                    disabled={pending}
                                    onClick={() => handleScan(garment)}
                                  >
                                    <ScanLine className="size-3.5" /> Scan &amp; Finish <ArrowRight className="size-3" />
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
                      No garments finished yet.
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
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F0EE] px-2 py-0.5 text-xs font-bold text-[#134441] border border-[#99C5C1] shadow-2xs">
                            <CheckCircle2 className="size-3 text-[#1B5E5A]" /> Done · Released to QC Gate
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

export function DashboardView() {
  const me = useMe();
  const isIncomingQC = me.username?.toLowerCase() === "qc.incoming";

  if (isIncomingQC) {
    return <QualityView />;
  }

  const isStitchingUser = me.department === "stitching" || me.username === "stitching.demo";
  const isFinishingUser = me.department === "finishing" || me.username === "finishing.demo";

  if (isStitchingUser) {
    return <StitchingDashboard />;
  }

  if (isFinishingUser) {
    return <FinishingDashboard />;
  }

  const q = useWtQuery(["dashboard"], (c) => c.getDashboard());
  const isReceivingUser = me.username === "receiving.demo" || me.department === "receiving";
  const isQualityUser = me.role === "Q";
  const isRawStoreUser = me.department === "raw-store" || me.username === "rawstore.demo";

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
                  me.role === "M"
                    ? "Factory-wide task queue. Review prerequisites, bottlenecks, and assign work to operators."
                    : `Actionable work queue for ${departmentLabels[me.department]}.`
                }
              >
                <TasksSection />
              </Section>
            )}
          </div>
        )}
      </Loadable>
    </div>
  );
}
