import { paths } from "@/app/paths";
import { DataTable } from "@/components/wt/DataTable";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels } from "@/domain/labels";
import { useWtQuery } from "@/lib/data/hooks";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

export function ReworkListView() {
  const me = useMe();
  const q = useWtQuery(["rework"], (c) => c.listRework());
  return (
    <>
      <PageHeader
        title="Rework"
        description={me.role === "P" ? `Cases assigned to ${departmentLabels[me.department]}.` : "All rework cases."}
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Rework" }]}
      />
      <Loadable query={q}>
        {(cases) => (
          <DataTable
            rows={cases}
            rowKey={(r) => r.id}
            empty={me.role === "P" ? "No rework assigned to your department." : "No rework cases. A failed final inspection opens one."}
            columns={[
              { header: "Case", cell: (r) => <IdLink href={paths.reworkCase(r.id)} id={r.id} /> },
              { header: "Garment", cell: (r) => <LinkIf user={me} routeKey="garment" href={paths.garment(r.garmentId)} id={r.garmentId} /> },
              { header: "Defect", cell: (r) => r.defectReason },
              { header: "Assigned to", cell: (r) => (r.assignedDepartment ? departmentLabels[r.assignedDepartment] : "—") },
              { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { header: "Opened", cell: (r) => fmt.date(r.createdAt) },
            ]}
          />
        )}
      </Loadable>
    </>
  );
}
