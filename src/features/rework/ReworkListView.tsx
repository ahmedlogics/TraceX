import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Hammer,
  RotateCcw,
  Search,
  UserCheck,
  Wrench,
} from "lucide-react";
import { paths } from "@/app/paths";
import { AppLink } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { NativeSelect } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { departmentLabels } from "@/domain/labels";
import type { Department, ReworkCase, ReworkStatus } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

export function ReworkListView() {
  const me = useMe();
  const q = useWtQuery(["rework"], (c) => c.listRework());

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  return (
    <>
      <PageHeader
        title="Rework & Repairs"
        description={
          me.role === "P"
            ? `Production repair queue for ${departmentLabels[me.department]}.`
            : "Factory-wide defect rework cases, repair assignments, and reinspection clearance."
        }
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Rework" }]}
      />

      <Loadable query={q}>
        {(allCases) => {
          const awaitingAssign = allCases.filter((r) => r.status === "awaiting-assignment").length;
          const assigned = allCases.filter((r) => r.status === "assigned").length;
          const repaired = allCases.filter((r) => r.status === "repaired").length;
          const closed = allCases.filter((r) => r.status === "closed").length;

          const filtered = allCases.filter((r) => {
            if (activeTab !== "all" && r.status !== activeTab) return false;
            if (deptFilter !== "all" && r.assignedDepartment !== deptFilter) return false;
            if (search.trim()) {
              const s = search.toLowerCase();
              const matchId = r.id.toLowerCase().includes(s);
              const matchGarment = r.garmentId.toLowerCase().includes(s);
              const matchDefect = r.defectReason.toLowerCase().includes(s);
              if (!matchId && !matchGarment && !matchDefect) return false;
            }
            return true;
          });

          return (
            <div className="space-y-6">
              {/* Metrics */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Awaiting Assignment
                    </span>
                    <Clock className="size-4 text-warning" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{awaitingAssign}</p>
                  <p className="text-xs text-muted-foreground mt-1">Requires manager routing</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Under Repair
                    </span>
                    <Hammer className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{assigned}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active in production shops</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Awaiting Reinspection
                    </span>
                    <RotateCcw className="size-4 text-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{repaired}</p>
                  <p className="text-xs text-muted-foreground mt-1">Pending independent QC</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Closed Cases
                    </span>
                    <CheckCircle2 className="size-4 text-success" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{closed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Released back to packing</p>
                </div>
              </div>

              {/* Tabs & Controls */}
              <div className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                    <TabsList className="flex h-auto flex-wrap">
                      <TabsTrigger value="all">All Cases ({allCases.length})</TabsTrigger>
                      <TabsTrigger value="awaiting-assignment">
                        Awaiting Assignment ({awaitingAssign})
                      </TabsTrigger>
                      <TabsTrigger value="assigned">In Repair ({assigned})</TabsTrigger>
                      <TabsTrigger value="repaired">Awaiting QC ({repaired})</TabsTrigger>
                      <TabsTrigger value="closed">Closed ({closed})</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search garment or defect..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-8 pl-8 text-xs w-[180px] sm:w-[220px]"
                        />
                      </div>
                      <div className="w-[130px]">
                        <NativeSelect
                          value={deptFilter}
                          onChange={setDeptFilter}
                          options={[
                            { value: "all", label: "All Depts" },
                            { value: "cutting", label: "Cutting" },
                            { value: "stitching", label: "Stitching" },
                            { value: "finishing", label: "Finishing" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  <TabsContent value={activeTab} className="mt-3">
                    <DataTable
                      rows={filtered}
                      rowKey={(r) => r.id}
                      empty={
                        me.role === "P"
                          ? "No active rework cases currently assigned to your department."
                          : "No rework cases match the active filter criteria."
                      }
                      columns={[
                        {
                          header: "Case",
                          cell: (r) => <IdLink href={paths.reworkCase(r.id)} id={r.id} />,
                        },
                        {
                          header: "Garment",
                          cell: (r) => (
                            <LinkIf
                              user={me}
                              routeKey="garment"
                              href={paths.garment(r.garmentId)}
                              id={r.garmentId}
                            />
                          ),
                        },
                        {
                          header: "Defect Reason",
                          cell: (r) => (
                            <span className="font-medium text-destructive">{r.defectReason}</span>
                          ),
                        },
                        {
                          header: "Assigned Department",
                          cell: (r) =>
                            r.assignedDepartment ? (
                              <span className="text-xs font-medium">
                                {departmentLabels[r.assignedDepartment]}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                Pending manager
                              </span>
                            ),
                        },
                        { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
                        { header: "Opened", cell: (r) => fmt.date(r.createdAt) },
                        {
                          header: "Action",
                          cell: (r) => (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                              <AppLink href={paths.reworkCase(r.id)}>Manage</AppLink>
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          );
        }}
      </Loadable>
    </>
  );
}
