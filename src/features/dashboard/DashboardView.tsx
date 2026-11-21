import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Info,
  Layers,
  OctagonAlert,
  Package,
  Scissors,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { MetricGrid, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { canAccessRoute } from "@/domain/permissions";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { useWtQuery } from "@/lib/data/hooks";
import { SubjectLink } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

const toneIcon = { danger: OctagonAlert, warning: AlertTriangle, info: Info } as const;
const toneClass = {
  danger: "border-destructive/30 bg-danger-soft text-destructive",
  warning: "border-warning/30 bg-warning-soft text-warning",
  info: "border-accent bg-info-soft text-accent-foreground",
} as const;

export function DashboardView() {
  const me = useMe();
  const q = useWtQuery(["dashboard"], (c) => c.getDashboard());

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me.displayName.split(" ")[0]}`}
        description={`${roleLabels[me.role]} · Department of ${departmentLabels[me.department]}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAccessRoute(me, "workstation") && (
              <Button asChild size="sm" className="gap-1.5">
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
        {canAccessRoute(me, "productionOrders") && (
          <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
            <AppLink href={paths.orders}>
              <Scissors className="size-3.5 text-primary" /> Orders
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

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Assigned Work Queue */}
              <Section
                title="Assigned work"
                description="Actionable tasks currently allocated to your department."
                actions={
                  canAccessRoute(me, "tasks") ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-primary gap-1"
                    >
                      <AppLink href={paths.tasks}>
                        View all tasks <ArrowRight className="size-3" />
                      </AppLink>
                    </Button>
                  ) : undefined
                }
              >
                {d.assigned.length === 0 ? (
                  <EmptyState title="No pending tasks in your scope right now" />
                ) : (
                  <ul className="divide-y rounded-lg border bg-card">
                    {d.assigned.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors hover:bg-muted/30"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium text-foreground">{t.title}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="wt-id font-semibold">{t.id}</span> ·{" "}
                            <SubjectLink user={me} type={t.subjectType} id={t.subjectId} />
                            {t.checkpoint && (
                              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                                {t.checkpoint}
                              </span>
                            )}
                          </p>
                        </div>
                        <StatusBadge status={t.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Actionable Exceptions / Alerts */}
              <Section
                title="Operational exceptions"
                description="Critical holds, quality gates, and dispatch-blocking conditions."
              >
                {d.alerts.length === 0 ? (
                  <EmptyState title="Zero active blocking alerts" />
                ) : (
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
                )}
              </Section>
            </div>
          </div>
        )}
      </Loadable>
    </div>
  );
}
