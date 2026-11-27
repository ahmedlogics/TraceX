import { useState, useMemo } from "react";
import { useWtQuery } from "@/lib/data/hooks";
import { useAppNavigate } from "@/app/navigation";
import { paths } from "@/app/paths";
import { PageHeader } from "@/components/wt/layout";
import { Loadable, EmptyState } from "@/components/wt/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanOrderDialog } from "@/features/production/OrdersView";
import { useMe } from "@/features/shared/useMe";
import type { MaterialLot, ProductionOrder } from "@/domain/types";
import {
  Boxes,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Cpu,
  Search,
  Scissors,
  Radio,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export function RawStoreDashboard() {
  const me = useMe();
  const isAdmin = me.role === "A" || me.username?.toLowerCase() === "admin.demo";
  const navigate = useAppNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"passed" | "awaiting" | "orders">("passed");
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());

  const handleCopyUid = (uid: string) => {
    void navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    toast.success(`RFID Tag UID copied: ${uid}`);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  const handleOrderCreated = (newOrderId: string) => {
    void qOrders.refetch();
    toast.success(`Order ${newOrderId} created.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? "Raw Store & QC Queue" : "Home"}
        description={
          isAdmin
            ? "Inventory monitor of verified incoming QC fabric rolls and allocation demand."
            : "Department of Raw Material Store · Verified Incoming QC Queue & Production Allocation"
        }
        actions={
          isAdmin ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <PlanOrderDialog
                triggerLabel="+ New Order"
                onSuccess={handleOrderCreated}
              />
              <Button
                className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-xs"
                onClick={() => void navigate(paths.workstation)}
              >
                <Cpu className="size-4" /> Go to Station 2 Workstation
              </Button>
            </div>
          )
        }
      />

      <Loadable query={qLots}>
        {(lots) => (
          <Loadable query={qOrders}>
            {(orders) => {
              // Categorize lots based on incoming QC status
              const passedLots = lots.filter(
                (l) => l.status === "accepted" && (Number(l.balanceQty) > 0 || Number(l.receivedQty) > 0),
              );
              const awaitingLots = lots.filter(
                (l) => l.status === "awaiting-inspection" || l.status === "rejected",
              );

              // Metrics calculation
              const totalStockMeters = lots.reduce((acc, l) => acc + (Number(l.balanceQty) || 0), 0);
              const passedStockMeters = passedLots.reduce((acc, l) => acc + (Number(l.balanceQty) || 0), 0);
              const awaitingStockMeters = awaitingLots.reduce((acc, l) => acc + (Number(l.balanceQty) || 0), 0);

              // Orders needing fabric allocation (pending fabric issue)
              const ordersAwaitingFabric = orders.filter(
                (o) =>
                  o.status === "approved" ||
                  o.status === "planned" ||
                  (!o.lotId && !o.issues?.length && o.status !== "completed"),
              );

              const issuedOrdersCount = orders.filter(
                (o) => Boolean(o.lotId || (o.issues && o.issues.length > 0)),
              ).length;

              // Filtered list based on search
              const term = search.trim().toLowerCase();
              const filterLot = (l: MaterialLot) => {
                if (!term) return true;
                return (
                  l.id.toLowerCase().includes(term) ||
                  l.material.toLowerCase().includes(term) ||
                  (l.rfidUid && l.rfidUid.toLowerCase().includes(term)) ||
                  (l.supplierRef && l.supplierRef.toLowerCase().includes(term))
                );
              };

              const displayedPassedLots = passedLots.filter(filterLot);
              const displayedAwaitingLots = awaitingLots.filter(filterLot);

              return (
                <div className="space-y-6">
                  {/* KPI SUMMARY CARDS */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* CARD 1: QC-PASSED QUEUE */}
                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          PASSED QC QUEUE
                        </span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                        {passedLots.length} <span className="text-sm font-normal text-muted-foreground">Rolls</span>
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{passedStockMeters.toLocaleString()}m verified fabric</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Ready for Issue
                        </span>
                      </div>
                    </div>

                    {/* CARD 2: TOTAL STORE STOCK */}
                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          TOTAL WAREHOUSE STOCK
                        </span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Boxes className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {totalStockMeters.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">Meters</span>
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {lots.length} total fabric rolls in inventory
                      </p>
                    </div>

                    {/* CARD 3: AWAITING INCOMING QC */}
                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          AWAITING INCOMING QC
                        </span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Clock className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                        {awaitingLots.length} <span className="text-sm font-normal text-muted-foreground">Rolls</span>
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{awaitingStockMeters.toLocaleString()}m pending</span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          Allocation Blocked
                        </span>
                      </div>
                    </div>

                    {/* CARD 4: FABRIC ISSUED TO ORDERS */}
                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          ORDERS ACTIVE
                        </span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          <Scissors className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {ordersAwaitingFabric.length} <span className="text-sm font-normal text-muted-foreground">Pending</span>
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {issuedOrdersCount} orders already cut
                      </p>
                    </div>
                  </div>

                  {/* HARDWARE RFID VERIFICATION POLICY NOTICE BANNER */}
                  {!isAdmin && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-foreground space-y-1">
                      <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="size-4.5" />
                        Station 2 Hardware RFID Verification Policy (Scanner 2 · GPIO 12)
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        When a manager creates a production order and scans a bundle card at Station 2, the system validates that the scanned tag is present in the <strong>Approved Incoming QC Queue</strong>. Any bundle that has not passed <code>qc.incoming</code> inspection is strictly rejected by the reader (<code>WT_ERR_QC_NOT_PASSED</code>).
                      </p>
                    </div>
                  )}

                  {/* SEARCH AND TAB FILTER BAR */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="inline-flex rounded-lg border bg-muted/60 p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveTab("passed")}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                          activeTab === "passed"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        Available bundles ({passedLots.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("awaiting")}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                          activeTab === "awaiting"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
                        Awaiting QC ({awaitingLots.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("orders")}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                          activeTab === "orders"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Scissors className="size-3.5 text-purple-600 dark:text-purple-400" />
                        Orders Awaiting Fabric ({ordersAwaitingFabric.length})
                      </button>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search lot ID, fabric, color, or UID…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 pl-8 text-xs bg-card"
                      />
                    </div>
                  </div>

                  {/* TAB 1: PASSED INCOMING QC ROLLS QUEUE */}
                  {activeTab === "passed" && (
                    <div className="space-y-3">
                      {displayedPassedLots.length === 0 ? (
                        <EmptyState
                          title={search ? "No matching rolls found" : "No approved rolls in queue"}
                          description="Only rolls that have passed incoming inspection appear in this queue."
                        />
                      ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                          {displayedPassedLots.map((lot) => {
                            const balance = Number(lot.balanceQty) || 0;
                            const received = Number(lot.receivedQty) || balance;
                            const pct = Math.min(100, Math.round((balance / (received || 1)) * 100));

                            return (
                              <div
                                key={lot.id}
                                className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
                              >
                                <div className="space-y-2.5">
                                  {/* Card Top: Lot ID & Verified Badge */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-sm text-foreground">
                                        Lot #{lot.id}
                                      </span>
                                    </div>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      <CheckCircle2 className="size-3" /> Passed qc.incoming
                                    </span>
                                  </div>

                                  {/* Fabric Name */}
                                  <div>
                                    <p className="font-semibold text-xs text-foreground line-clamp-1">
                                      {lot.material}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      Supplier: {lot.supplierRef || "Verified Mills"}
                                    </p>
                                  </div>

                                  {/* RFID Card UID */}
                                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2 text-[11px]">
                                    <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                                      <Radio className="size-3 text-primary" />
                                      <span>Tag: <strong className="text-foreground">{lot.rfidUid || "Not bound"}</strong></span>
                                    </div>
                                    {lot.rfidUid && (
                                      <button
                                        type="button"
                                        onClick={() => handleCopyUid(lot.rfidUid!)}
                                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer"
                                        title="Copy tag UID"
                                      >
                                        {copiedUid === lot.rfidUid ? (
                                          <Check className="size-3 text-emerald-600" />
                                        ) : (
                                          <Copy className="size-3" />
                                        )}
                                        {copiedUid === lot.rfidUid ? "Copied" : "Copy"}
                                      </button>
                                    )}
                                  </div>

                                  {/* Balance & Progress */}
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-muted-foreground">Available Roll Balance:</span>
                                      <span className="font-bold text-foreground">
                                        {balance}m / {received}m ({pct}%)
                                      </span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full bg-emerald-500 transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Card Bottom Action: Station 2 Issue */}
                                <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                    Cleared for Cutting
                                  </span>
                                  {!isAdmin && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-[11px] gap-1 font-semibold"
                                      onClick={() => void navigate(paths.workstation)}
                                    >
                                      Issue at Station 2 <ArrowRight className="size-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: AWAITING INCOMING QC */}
                  {activeTab === "awaiting" && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <p className="font-bold">Rolls in this queue cannot be issued to production</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Any bundle tag scanned at Station 2 from this section will trigger an automatic hardware scan rejection because inspection by <code>qc.incoming</code> has not been completed.
                          </p>
                        </div>
                      </div>

                      {displayedAwaitingLots.length === 0 ? (
                        <EmptyState
                          title="No lots awaiting incoming QC"
                          description="All fabric rolls in Raw Store have been cleared or processed."
                        />
                      ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                          {displayedAwaitingLots.map((lot) => (
                            <div
                              key={lot.id}
                              className="rounded-xl border border-amber-500/30 bg-card p-4 shadow-xs opacity-90"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-foreground">Lot #{lot.id}</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  <Clock className="size-3" /> Awaiting QC
                                </span>
                              </div>
                              <p className="mt-2 font-semibold text-xs text-foreground line-clamp-1">
                                {lot.material}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Qty: {lot.balanceQty ?? lot.receivedQty}m · Tag: {lot.rfidUid || "Unassigned"}
                              </p>
                              <div className="mt-3 rounded-md bg-amber-500/10 p-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                🔒 Locked: Blocked from Station 2 issuance until approved by qc.incoming
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: ORDERS AWAITING FABRIC ALLOCATION */}
                  {activeTab === "orders" && (
                    <div className="space-y-3">
                      {ordersAwaitingFabric.length === 0 ? (
                        <EmptyState
                          title="All production orders have fabric issued"
                          description="Click '+ New Order' at the top to plan a new cutting order."
                        />
                      ) : (
                        <div className="divide-y rounded-xl border bg-card overflow-hidden">
                          {ordersAwaitingFabric.map((order) => {
                            const reqFabric = Math.max(1, (order.plannedQty || 10) * 2);

                            return (
                              <div
                                key={order.id}
                                className="flex flex-col gap-3 p-4 text-xs sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-primary">{order.id}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="font-semibold text-foreground">{order.product}</span>
                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                      Style: {order.styleCode}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                    <span>Output: <strong className="text-foreground">{order.plannedQty} pcs</strong></span>
                                    <span>·</span>
                                    <span>Required Fabric: <strong className="text-primary">{reqFabric} m</strong></span>
                                    <span>·</span>
                                    <span>Due Date: {order.dueDate}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                    Awaiting Allocation
                                  </span>
                                  {!isAdmin && (
                                    <Button
                                      size="sm"
                                      className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                                      onClick={() => void navigate(paths.workstation)}
                                    >
                                      <Cpu className="size-3.5" /> Issue at Station 2 <ArrowRight className="size-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }}
          </Loadable>
        )}
      </Loadable>
    </div>
  );
}
