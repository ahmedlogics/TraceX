import { BarChart3, Calendar, FileSpreadsheet, ShieldAlert, TrendingUp } from "lucide-react";
import { paths } from "@/app/paths";
import { DataTable } from "@/components/wt/DataTable";
import { MetricGrid, PageHeader, Section } from "@/components/wt/layout";
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { roleLabels, departmentLabels } from "@/domain/labels";

export function ReportsView() {
  const me = useMe();
  const q = useWtQuery(["reports"], (c) => c.getReports());

  return (
    <div className="space-y-6">
      <PageHeader title="Operational reports" />

      {me.role !== "A" && (
        <div className="rounded-lg border bg-accent/30 px-4 py-2.5 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="size-3.5 text-primary" aria-hidden />
            <span>
              Reporting scope: <strong>{roleLabels[me.role]}</strong> (
              {departmentLabels[me.department]})
            </span>
          </div>
          <span className="font-mono text-[11px]">Units: integer units / meters</span>
        </div>
      )}

      <Loadable query={q}>
        {(r) => (
          <div className="space-y-6">
            <MetricGrid metrics={r.counts} />

            <Section
              title="Throughput & disposition breakdown"
              description="Authoritative operational records grouped by category."
            >
              <DataTable
                rows={r.rows}
                rowKey={(row) => row.label}
                columns={[
                  {
                    header: "Category / Measure",
                    cell: (row) => (
                      <span className="font-medium text-foreground text-sm">{row.label}</span>
                    ),
                  },
                  ...r.columns.map((col) => ({
                    header: col,
                    cell: (row: (typeof r.rows)[number]) => (
                      <span className="tabular-nums font-mono text-sm font-semibold text-foreground">
                        {row.columns[col]}
                      </span>
                    ),
                  })),
                ]}
              />
            </Section>
          </div>
        )}
      </Loadable>
    </div>
  );
}
