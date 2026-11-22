import {
  AlertTriangle,
  ArrowRight,
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

        if (unassigned.length === 0) {
          return (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-3 bg-muted/20">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
                <Radio className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  No lots awaiting RFID assignment
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  All recorded fabric lots have active RFID cards assigned. Click <strong className="text-foreground">"+ New Fabric Lot"</strong> when a new roll arrives.
                </p>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Newly Created Lots Awaiting RFID Assignment ({unassigned.length})
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

export function DashboardView() {
  const me = useMe();
  const q = useWtQuery(["dashboard"], (c) => c.getDashboard());
  const isReceivingUser = me.username === "receiving.demo" || me.department === "receiving";

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
                title="Incoming Fabric Lots & RFID Assignment"
                description="Manager-registered fabric lots awaiting bundle card tagging at Station 1."
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
