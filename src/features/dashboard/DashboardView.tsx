import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Info,
  Layers,
  OctagonAlert,
  Package,
  Radio,
  Scissors,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { MetricGrid, PageHeader, Section } from "@/components/wt/layout";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can, canAccessRoute } from "@/domain/permissions";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { ReceiveLotDialog } from "@/features/materials/LotsView";
import { TasksSection } from "@/features/tasks/TasksView";

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
        const unassigned = lots.filter((l) => !l.rfidUid);
        const assignedLots = lots.filter((l) => !!l.rfidUid);

        return (
          <div className="space-y-6">
            {/* Step 1: Newly Created Lots Awaiting RFID Assignment */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Step 1: Lots Awaiting RFID Assignment at Station 1 ({unassigned.length})
                </p>
              </div>
              {unassigned.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center space-y-2 bg-muted/20">
                  <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-success/10 text-success">
                    <Radio className="size-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    All lots have active bundle cards assigned
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    New incoming rolls created by managers will appear here ready for RFID tagging at Station 1.
                  </p>
                </div>
              ) : (
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
              )}
            </div>

            {/* Step 2 Quality Tracking: Fabric Lots Quality & Inspection Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Step 2 QC Status: Material Inspection Tracking ({assignedLots.length})
                </p>
              </div>
              {assignedLots.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No fabric lots tagged yet.</p>
              ) : (
                <div className="divide-y rounded-lg border bg-card">
                  {assignedLots.map((lot) => (
                    <div
                      key={lot.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-sm hover:bg-muted/30"
                    >
                      <div className="space-y-0.5 min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{lot.id}</span>
                          <span className="text-xs font-mono text-muted-foreground">({lot.material})</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Ref: <span className="font-medium">{lot.supplierRef}</span> · Balance: <span className="font-medium tabular-nums">{lot.balanceQty} / {lot.receivedQty} {lot.unit ?? "m"}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded border border-success/30">
                          <Radio className="size-3" /> {lot.rfidUid}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={lot.status} />
                          {lot.status === "accepted" && (
                            <span className="hidden sm:inline-block text-[11px] text-success font-medium">
                              (Approved for Step 3)
                            </span>
                          )}
                          {lot.status === "awaiting-inspection" && (
                            <span className="hidden sm:inline-block text-[11px] text-warning font-medium">
                              (Pending Step 2 QC)
                            </span>
                          )}
                          {lot.status === "rejected" && (
                            <span className="hidden sm:inline-block text-[11px] text-destructive font-medium">
                              (Disapproved)
                            </span>
                          )}
                        </div>

                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                          <AppLink href={paths.lot(lot.id)}>
                            View <ArrowRight className="size-3 ml-0.5" />
                          </AppLink>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

        if (awaitingQc.length === 0) {
          return (
            <div className="rounded-xl border border-dashed p-6 text-center space-y-2 bg-muted/20">
              <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                All scanned incoming fabric rolls have been evaluated
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                No tagged fabric rolls are currently awaiting incoming inspection in quarantine. New deliveries logged and tagged at Station 1 will appear here.
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

export function DashboardView() {
  const me = useMe();
  const q = useWtQuery(["dashboard"], (c) => c.getDashboard());
  const isReceivingUser = me.username === "receiving.demo" || me.department === "receiving";
  const isQualityUser = me.role === "Q" || me.username === "qc.incoming";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me.displayName.split(" ")[0]}`}
        description={`${roleLabels[me.role]} · Department of ${departmentLabels[me.department]}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(can.createLot(me) || can.receiveLot(me)) && (
              <ReceiveLotDialog triggerLabel="+ New Fabric Lot" />
            )}
            {canAccessRoute(me, "workstation") && (
              <Button asChild size="sm" variant={(can.createLot(me) || can.receiveLot(me)) ? "outline" : "default"} className="gap-1.5">
                <AppLink href={paths.workstation}>
                  <Cpu className="size-4" /> Open workstation
                </AppLink>
              </Button>
            )}
          </div>
        }
      />

      {/* Quick Navigation Shortcuts */}
      <div className="flex flex-wrap gap-2 pt-0.5">
        {canAccessRoute(me, "materialLots") && (
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <AppLink href={paths.lots}>
              <Layers className="size-3.5 text-primary" /> Fabric Lots
            </AppLink>
          </Button>
        )}
        {canAccessRoute(me, "quality") && (
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <AppLink href={paths.quality}>
              <ShieldCheck className="size-3.5 text-primary" /> Quality
            </AppLink>
          </Button>
        )}
        {canAccessRoute(me, "fulfilment") && (
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <AppLink href={paths.fulfilment}>
              <Package className="size-3.5 text-primary" /> Fulfilment
            </AppLink>
          </Button>
        )}
        {canAccessRoute(me, "shipments") && (
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <AppLink href={paths.shipments}>
              <Truck className="size-3.5 text-primary" /> Shipments
            </AppLink>
          </Button>
        )}
      </div>

      <Loadable query={q}>
        {(d) => (
          <div className="space-y-6">
            {/* Domain Metric Grid */}
            <MetricGrid metrics={d.metrics} />

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
              <Section
                title="Step 1 & Step 2: Fabric Receiving & Inspection Tracking"
                description="Manager-registered fabric lots awaiting bundle card tagging at Station 1 and downstream Step 2 QC clearance."
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <ReceiveLotDialog triggerLabel="+ New Fabric Lot" />
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                      <AppLink href={paths.workstation}>
                        <Cpu className="size-4" /> Open Station 1
                      </AppLink>
                    </Button>
                  </div>
                }
              >
                <ReceivingLotsQueue />
              </Section>
            ) : isQualityUser ? (
              <Section
                title="Incoming Fabric Quality Inspection Queue (Awaiting QC Sign-Off)"
                description="Physical fabric rolls scanned and tagged at Station 1 awaiting inspection and 4-point defect sign-off by qc.incoming."
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
