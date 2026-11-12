import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
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
const toneClass = { danger: "bg-danger-soft text-destructive", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-accent-foreground" } as const;

export function DashboardView() {
  const me = useMe();
  const q = useWtQuery(["dashboard"], (c) => c.getDashboard());
  return (
    <>
      <PageHeader
        title={`Hello, ${me.displayName.split(" ")[0]}`}
        description={`${roleLabels[me.role]} · ${departmentLabels[me.department]}`}
        actions={
          canAccessRoute(me, "workstation") ? (
            <Button asChild size="sm">
              <AppLink href={paths.workstation}>Open workstation</AppLink>
            </Button>
          ) : undefined
        }
      />
      <Loadable query={q}>
        {(d) => (
          <div className="space-y-6">
            <MetricGrid metrics={d.metrics} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="Assigned work"
                actions={
                  canAccessRoute(me, "tasks") ? (
                    <Button asChild variant="ghost" size="sm">
                      <AppLink href={paths.tasks}>All tasks</AppLink>
                    </Button>
                  ) : undefined
                }
              >
                {d.assigned.length === 0 ? (
                  <EmptyState title="No open work for you right now" />
                ) : (
                  <ul className="divide-y">
                    {d.assigned.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="wt-id">{t.id}</span> · <SubjectLink user={me} type={t.subjectType} id={t.subjectId} />
                            {t.checkpoint && <> · checkpoint {t.checkpoint}</>}
                          </p>
                        </div>
                        <StatusBadge status={t.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="Alerts">
                {d.alerts.length === 0 ? (
                  <EmptyState title="No alerts in your scope" />
                ) : (
                  <ul className="space-y-2">
                    {d.alerts.map((a, i) => {
                      const Icon = toneIcon[a.tone];
                      return (
                        <li key={i} className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${toneClass[a.tone]}`}>
                          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                          {a.href ? (
                            <AppLink href={a.href} className="underline-offset-2 hover:underline">
                              {a.message}
                            </AppLink>
                          ) : (
                            a.message
                          )}
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
    </>
  );
}
