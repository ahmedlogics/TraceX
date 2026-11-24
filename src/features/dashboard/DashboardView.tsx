import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Info,
  OctagonAlert,
  Radio,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/wt/layout";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can, canAccessRoute } from "@/domain/permissions";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { ReceiveLotDialog } from "@/features/materials/LotsView";
import { TasksSection } from "@/features/tasks/TasksView";
import { QualityView } from "@/features/quality/QualityView";

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

export function DashboardView() {
  const me = useMe();
  const isIncomingQC = me.username?.toLowerCase() === "qc.incoming";

  if (isIncomingQC) {
    return <QualityView />;
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
