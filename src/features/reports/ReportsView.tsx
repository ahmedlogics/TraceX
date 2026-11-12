import { paths } from "@/app/paths";
import { DataTable } from "@/components/wt/DataTable";
import { MetricGrid, PageHeader, Section } from "@/components/wt/layout";
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";

export function ReportsView() {
  const q = useWtQuery(["reports"], (c) => c.getReports());
  return (
    <>
      <PageHeader title="Reports" description="Operational counts for your scope, from fixture data." crumbs={[{ label: "Staff", href: paths.home }, { label: "Reports" }]} />
      <Loadable query={q}>
        {(r) => (
          <div className="space-y-4">
            <MetricGrid metrics={r.counts} />
            <Section title="Breakdown">
              <DataTable
                rows={r.rows}
                rowKey={(row) => row.label}
                columns={[
                  { header: "Measure", cell: (row) => row.label },
                  ...r.columns.map((col) => ({ header: col, cell: (row: (typeof r.rows)[number]) => <span className="tabular-nums">{row.columns[col]}</span> })),
                ]}
              />
            </Section>
          </div>
        )}
      </Loadable>
    </>
  );
}
