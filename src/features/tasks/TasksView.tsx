import { useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Filter, Radio, UserCheck } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FilterBar, FormDialog, NativeSelect, SearchInput } from "@/components/wt/forms";
import { fmt, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels } from "@/domain/labels";
import { can } from "@/domain/permissions";
import type { Department, Garment, MaterialLot, ProductionOrder, Task } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useDirectory, UserName } from "@/features/shared/directory";
import { SubjectLink } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

function getTaskPrerequisite(
  task: Task,
  lots: MaterialLot[],
  orders: ProductionOrder[],
  garments: Garment[],
): { ready: boolean; label: string; detail?: string } {
  if (task.status === "done") {
    return { ready: true, label: "Completed" };
  }
  switch (task.kind) {
    case "incoming-qc":
      return { ready: true, label: "Ready for Inspection", detail: "Fabric bundle in quarantine" };
    case "issue-material": {
      const order = orders.find((o) => o.id === task.subjectId);
      if (order && order.status !== "approved" && order.status !== "in-progress") {
        return { ready: false, label: "Blocked: Order Pending Approval", detail: `Status: ${order.status}` };
      }
      const eligibleLots = lots.filter((l) => l.status === "accepted" && l.balanceQty > 0);
      if (eligibleLots.length === 0) {
        return { ready: false, label: "Blocked: No Accepted Fabric", detail: "Awaiting incoming QC clearance" };
      }
      return { ready: true, label: "Ready to Issue", detail: `${eligibleLots.length} accepted lot(s) in stock` };
    }
    case "cut": {
      const order = orders.find((o) => o.id === task.subjectId);
      if (order && order.status === "planned") {
        return { ready: false, label: "Blocked: Awaiting Order Approval", detail: "Manager approval required" };
      }
      return { ready: true, label: "Ready for Cutting", detail: "Station 3 (Cutting) available" };
    }
    case "stitch": {
      const g = garments.find((x) => x.id === task.subjectId);
      if (g?.hold) {
        return { ready: false, label: "Blocked: Quality Hold", detail: g.hold.reason };
      }
      if (g && g.stage !== "stitching") {
        return { ready: false, label: `Pending Stage: ${g.stage}`, detail: "Awaiting cutting output" };
      }
      return { ready: true, label: "Ready for Stitching", detail: "Panel set cut & tagged" };
    }
    case "finish": {
      const g = garments.find((x) => x.id === task.subjectId);
      if (g?.hold) {
        return { ready: false, label: "Blocked: Quality Hold", detail: g.hold.reason };
      }
      if (g && g.stage !== "finishing") {
        return { ready: false, label: `Pending Stage: ${g.stage}`, detail: "Awaiting stitching completion" };
      }
      return { ready: true, label: "Ready for Finishing", detail: "Stitching recorded" };
    }
    case "final-qc-presentation": {
      const g = garments.find((x) => x.id === task.subjectId);
      if (g?.hold) {
        return { ready: false, label: "Blocked: Quality Hold", detail: g.hold.reason };
      }
      return { ready: true, label: "Ready for QA Inspection", detail: "Station 6 (Final QC)" };
    }
    default:
      return { ready: true, label: "Ready" };
  }
}

function AssignDialog({ task }: { task: Task }) {
  const { users } = useDirectory();
  const { run } = useWtAction();
  const options = users.filter((u) => u.department === task.department && u.status === "active");
  const [picked, setUserId] = useState("");
  const userId = picked || options[0]?.id || "";
  return (
    <FormDialog
      trigger="Assign"
      triggerVariant="outline"
      title={`Assign ${task.id}`}
      description={task.title}
      submitLabel="Assign"
      onSubmit={async () =>
        !!(await run((c) => c.assignTask(task.id, userId).then(() => true), "Task assigned."))
      }
    >
      <Field label={`Staff in ${departmentLabels[task.department]}`} htmlFor={`assign-${task.id}`}>
        <NativeSelect
          id={`assign-${task.id}`}
          value={userId}
          onChange={setUserId}
          options={options.map((u) => ({ value: u.id, label: `${u.username} — ${u.displayName}` }))}
        />
      </Field>
    </FormDialog>
  );
}

function taskStationCode(checkpoint?: string): string | null {
  if (!checkpoint) return null;
  switch (checkpoint) {
    case "S1":
      return "fabric_receiving";
    case "RAW_ISSUE":
      return "fabric_issue";
    case "S2":
      return "cutting";
    case "S3":
      return "stitching";
    case "S4":
      return "finishing";
    case "FINAL_QC":
      return "final_qc";
    case "S5":
      return "packing";
    case "WAREHOUSE":
      return "warehouse";
    case "S6":
      return "dispatch";
    default:
      return null;
  }
}

export function TasksView() {
  const me = useMe();
  const qTasks = useWtQuery(["tasks"], (c) => c.listTasks());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const { run, pending } = useWtAction();
  const [status, setStatus] = useState("active");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  return (
    <>
      <PageHeader
        title="Tasks & Factory Work Queue"
        description={
          me.role === "M"
            ? "Factory-wide task queue. Review prerequisites, bottlenecks, and assign work to operators."
            : `Departmental work queue for ${departmentLabels[me.department]}.`
        }
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Tasks" }]}
      />

      <Loadable query={qTasks}>
        {(tasks) => (
          <Loadable query={qLots}>
            {(lots) => (
              <Loadable query={qOrders}>
                {(orders) => (
                  <Loadable query={qGarments}>
                    {(garments) => {
                      const openCount = tasks.filter((t) => t.status === "open").length;
                      const claimedCount = tasks.filter((t) => t.status === "claimed").length;
                      const myDeptCount = tasks.filter(
                        (t) => t.department === me.department && t.status !== "done",
                      ).length;
                      const doneCount = tasks.filter((t) => t.status === "done").length;

                      const rows = tasks.filter((t) => {
                        const matchesStatus =
                          status === "all" ||
                          (status === "active" ? t.status !== "done" : t.status === status);
                        const matchesDept = deptFilter === "all" || t.department === deptFilter;
                        const matchesSearch =
                          search.trim() === "" ||
                          `${t.id} ${t.title} ${t.subjectId} ${t.department}`
                            .toLowerCase()
                            .includes(search.toLowerCase());
                        return matchesStatus && matchesDept && matchesSearch;
                      });

                      return (
                        <div className="space-y-6">
                          {/* Metric Overview Cards */}
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-lg border bg-card p-3 shadow-xs">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="size-4 text-warning" />
                                <span className="text-xs font-medium">Open Tasks</span>
                              </div>
                              <p className="mt-1 text-2xl font-bold">{openCount}</p>
                            </div>
                            <div className="rounded-lg border bg-card p-3 shadow-xs">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <UserCheck className="size-4 text-primary" />
                                <span className="text-xs font-medium">Claimed / In Work</span>
                              </div>
                              <p className="mt-1 text-2xl font-bold">{claimedCount}</p>
                            </div>
                            <div className="rounded-lg border bg-card p-3 shadow-xs">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Radio className="size-4 text-accent-foreground" />
                                <span className="text-xs font-medium">My Dept Queue</span>
                              </div>
                              <p className="mt-1 text-2xl font-bold text-primary">{myDeptCount}</p>
                            </div>
                            <div className="rounded-lg border bg-card p-3 shadow-xs">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <CheckCircle2 className="size-4 text-success" />
                                <span className="text-xs font-medium">Completed</span>
                              </div>
                              <p className="mt-1 text-2xl font-bold text-muted-foreground">{doneCount}</p>
                            </div>
                          </div>

                          {/* Filter Controls */}
                          <FilterBar>
                            <SearchInput
                              value={search}
                              onChange={setSearch}
                              placeholder="Search tasks, title, or subject ID"
                              label="Search tasks"
                            />
                            <div className="w-full sm:w-44">
                              <NativeSelect
                                ariaLabel="Filter by status"
                                value={status}
                                onChange={setStatus}
                                options={[
                                  { value: "active", label: "Active (Open & Claimed)" },
                                  { value: "open", label: "Open Only" },
                                  { value: "claimed", label: "Claimed Only" },
                                  { value: "done", label: "Completed" },
                                  { value: "all", label: "All Statuses" },
                                ]}
                              />
                            </div>
                            <div className="w-full sm:w-48">
                              <NativeSelect
                                ariaLabel="Filter by department"
                                value={deptFilter}
                                onChange={setDeptFilter}
                                options={[
                                  { value: "all", label: "All Departments" },
                                  { value: "receiving", label: "Receiving" },
                                  { value: "raw-store", label: "Raw Store" },
                                  { value: "cutting", label: "Cutting" },
                                  { value: "stitching", label: "Stitching" },
                                  { value: "finishing", label: "Finishing" },
                                  { value: "quality", label: "Quality" },
                                  { value: "packing", label: "Packing" },
                                  { value: "warehouse", label: "Warehouse" },
                                  { value: "dispatch", label: "Dispatch" },
                                ]}
                              />
                            </div>
                          </FilterBar>

                          <DataTable
                            rows={rows}
                            rowKey={(t) => t.id}
                            empty="No tasks match the active filters."
                            columns={[
                              {
                                header: "Task",
                                cell: (t) => (
                                  <div>
                                    <p className="font-semibold text-foreground text-xs sm:text-sm">{t.title}</p>
                                    <p className="wt-id text-[11px] text-muted-foreground mt-0.5">
                                      {t.id} · Created {fmt.dateTime(t.createdAt)}
                                    </p>
                                  </div>
                                ),
                              },
                              {
                                header: "Subject",
                                cell: (t) => <SubjectLink user={me} type={t.subjectType} id={t.subjectId} />,
                              },
                              {
                                header: "Department",
                                cell: (t) => (
                                  <span className="inline-flex rounded bg-muted px-2 py-0.5 text-xs font-medium">
                                    {departmentLabels[t.department]}
                                  </span>
                                ),
                              },
                              {
                                header: "Station / Checkpoint",
                                cell: (t) =>
                                  t.checkpoint ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="wt-id font-bold text-xs">{t.checkpoint}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">Software Form</span>
                                  ),
                              },
                              {
                                header: "Prerequisites & Readiness",
                                cell: (t) => {
                                  const prereq = getTaskPrerequisite(t, lots, orders, garments);
                                  return (
                                    <div>
                                      {prereq.ready ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                                          <CheckCircle2 className="size-3" /> {prereq.label}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                                          <AlertCircle className="size-3" /> {prereq.label}
                                        </span>
                                      )}
                                      {prereq.detail && (
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{prereq.detail}</p>
                                      )}
                                    </div>
                                  );
                                },
                              },
                              { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
                              { header: "Assignee", cell: (t) => <UserName id={t.assigneeId} /> },
                              {
                                header: "Actions",
                                cell: (t) => {
                                  const stCode = taskStationCode(t.checkpoint);
                                  let domainHref = "";
                                  if (t.subjectType === "order") domainHref = paths.order(t.subjectId);
                                  else if (t.subjectType === "lot") domainHref = paths.lot(t.subjectId);
                                  else if (t.subjectType === "garment") domainHref = paths.garment(t.subjectId);

                                  return (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {can.claimTask(me, t) && (
                                        <Button
                                          size="sm"
                                          disabled={pending}
                                          onClick={() => void run((c) => c.claimTask(t.id), `${t.id} claimed.`)}
                                        >
                                          Claim
                                        </Button>
                                      )}
                                      {can.assignTask(me) && t.status !== "done" && <AssignDialog task={t} />}
                                      {domainHref && (
                                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                          <AppLink href={domainHref}>
                                            View <ArrowRight className="size-3 ml-0.5" />
                                          </AppLink>
                                        </Button>
                                      )}
                                      {stCode && t.status !== "done" && (
                                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                                          <AppLink href={paths.workstation}>
                                            Station <ArrowRight className="size-3 ml-0.5" />
                                          </AppLink>
                                        </Button>
                                      )}
                                    </div>
                                  );
                                },
                              },
                            ]}
                          />
                        </div>
                      );
                    }}
                  </Loadable>
                )}
              </Loadable>
            )}
          </Loadable>
        )}
      </Loadable>
    </>
  );
}
