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
import { can, canAccessRoute } from "@/domain/permissions";
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
    case "incoming-qc": {
      const lot = lots.find(
        (l) =>
          l.id === task.subjectId ||
          (l as any).lotId === task.subjectId ||
          (l as any).code === task.subjectId,
      );
      if (lot && (!lot.rfidUid || lot.rfidUid === "unassigned")) {
        return {
          ready: false,
          label: "Blocked: Awaiting Receiving",
          detail: "Station 1 bundle card registration pending",
        };
      }
      return { ready: true, label: "Ready for Inspection", detail: "Fabric bundle in quarantine" };
    }
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

export function TasksSection() {
  const me = useMe();
  const qTasks = useWtQuery(["tasks"], (c) => c.listTasks());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const { run, pending } = useWtAction();
  const isManager = me.role === "M" || me.role === "A";
  const isIncomingQC = me.username === "qc.incoming";
  const isQualityRole = me.role === "Q";

  const [status, setStatus] = useState("active");
  const [deptFilter, setDeptFilter] = useState(
    isManager ? "all" : (isIncomingQC || isQualityRole) ? "quality" : me.department,
  );
  const [search, setSearch] = useState("");

  const deptOptions = isManager
    ? [
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
      ]
    : isIncomingQC || isQualityRole
    ? [
        { value: "quality", label: "Quality Inspection Queue" },
        { value: "all", label: "All Tasks" },
        { value: "receiving", label: "Receiving" },
        { value: "raw-store", label: "Raw Store" },
      ]
    : [
        { value: me.department, label: `My Department (${departmentLabels[me.department] || me.department})` },
        { value: "all", label: "All Factory Tasks" },
      ];

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

                      const resolveSubjectDisplay = (t: Task) => {
                        if (t.subjectCode && !t.subjectCode.includes("-uuid-") && t.subjectCode.length < 32) {
                          return t.subjectCode;
                        }
                        if (t.subjectType === "order") {
                          const match = orders.find(
                            (o) => o.id === t.subjectId || (o as any).orderId === t.subjectId || (o as any).code === t.subjectId,
                          );
                          if (match) return match.id;
                        }
                        if (t.subjectType === "lot") {
                          const match = lots.find(
                            (l) => l.id === t.subjectId || (l as any).lotId === t.subjectId || (l as any).code === t.subjectId,
                          );
                          if (match) return (match as any).code || match.id;
                        }
                        if (t.subjectType === "garment") {
                          const match = garments.find(
                            (g) => g.id === t.subjectId || (g as any).garmentId === t.subjectId || (g as any).code === t.subjectId,
                          );
                          if (match) return match.id;
                        }
                        // Fallback: check across all collections in case subjectType is missing or generic
                        const anyLot = lots.find((l) => l.id === t.subjectId || (l as any).lotId === t.subjectId);
                        if (anyLot) return (anyLot as any).code || anyLot.id;
                        const anyOrder = orders.find((o) => o.id === t.subjectId || (o as any).orderId === t.subjectId);
                        if (anyOrder) return anyOrder.id;

                        if (t.subjectCode) return t.subjectCode;
                        return t.subjectId.length > 16 ? `#${t.subjectId.slice(0, 8)}` : t.subjectId;
                      };

                      return (
                        <div className="space-y-6">
                        {/* Metric Overview Cards */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-warning/40 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">Open Tasks</span>
                              <div className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning group-hover:scale-105 transition-transform">
                                <Clock className="size-3.5" />
                              </div>
                            </div>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-warning">{openCount}</p>
                          </div>
                          <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">Claimed / In Work</span>
                              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                                <UserCheck className="size-3.5" />
                              </div>
                            </div>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-primary">{claimedCount}</p>
                          </div>
                          <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-accent-foreground/40 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">My Dept Queue</span>
                              <div className="flex size-7 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground group-hover:scale-105 transition-transform">
                                <Radio className="size-3.5" />
                              </div>
                            </div>
                            <p className="mt-2 text-2xl font-bold tracking-tight">{myDeptCount}</p>
                          </div>
                          <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-success/40 hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">Completed</span>
                              <div className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success group-hover:scale-105 transition-transform">
                                <CheckCircle2 className="size-3.5" />
                              </div>
                            </div>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-muted-foreground">{doneCount}</p>
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
                            <div className="w-full sm:w-56">
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
                            <div className="w-full sm:w-64">
                              <NativeSelect
                                ariaLabel="Filter by department"
                                value={deptFilter}
                                onChange={setDeptFilter}
                                options={deptOptions}
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
                              cell: (t) => {
                                const cleanTitle = t.title
                                  ? t.title.replace(/^([a-z])/, (m) => m.toUpperCase()).replace(/-/g, " ")
                                  : t.kind.replace(/-/g, " ");
                                return (
                                  <div>
                                    <p className="font-semibold text-foreground text-xs sm:text-sm capitalize">{cleanTitle}</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      Created {fmt.date(t.createdAt)}
                                    </p>
                                  </div>
                                );
                              },
                            },
                            {
                              header: "Subject",
                              cell: (t) => (
                                <SubjectLink
                                  user={me}
                                  type={t.subjectType}
                                  id={t.subjectId}
                                  label={resolveSubjectDisplay(t)}
                                />
                              ),
                            },
                            ...(deptFilter === "all"
                              ? [
                                  {
                                    header: "Department",
                                    cell: (t: Task) => (
                                      <span className="inline-flex rounded bg-muted px-2 py-0.5 text-xs font-medium">
                                        {departmentLabels[t.department]}
                                      </span>
                                    ),
                                  },
                                ]
                              : []),
                            {
                              header: "Station",
                              cell: (t) =>
                                t.checkpoint ? (
                                  <span className="wt-id rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                                    {t.checkpoint}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40 text-xs">—</span>
                                ),
                            },
                            {
                              header: "Readiness",
                              cell: (t) => {
                                const prereq = getTaskPrerequisite(t, lots, orders, garments);
                                return (
                                  <div>
                                    {prereq.ready ? (
                                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success border border-success/30">
                                        <CheckCircle2 className="size-3" /> {prereq.label}
                                      </span>
                                    ) : (
                                      <div>
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive border border-destructive/30">
                                          <AlertCircle className="size-3" /> {prereq.label}
                                        </span>
                                        {prereq.detail && (
                                          <p className="text-[11px] text-destructive/80 mt-0.5">{prereq.detail}</p>
                                        )}
                                      </div>
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
                                const prereq = getTaskPrerequisite(t, lots, orders, garments);
                                const stCode = taskStationCode(t.checkpoint);
                                let domainHref = "";
                                if (t.subjectType === "order") domainHref = paths.order(t.subjectId);
                                else if (t.subjectType === "lot") domainHref = paths.lot(t.subjectId);
                                else if (t.subjectType === "garment") domainHref = paths.garment(t.subjectId);

                                return (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {can.assignTask(me) && t.status !== "done" && <AssignDialog task={t} />}

                                    {t.kind === "issue-material" && can.issueMaterial(me) && t.status !== "done" && (
                                      <Button asChild size="sm" className="h-7 text-xs bg-primary">
                                        <AppLink href={paths.workstation}>
                                          Issue Fabric <ArrowRight className="size-3 ml-0.5" />
                                        </AppLink>
                                      </Button>
                                    )}

                                    {t.kind === "incoming-qc" && (me.role === "Q" || isManager) && t.status !== "done" && (
                                      prereq.ready ? (
                                        <Button asChild size="sm" className="h-7 text-xs bg-primary">
                                          <AppLink href={paths.home}>
                                            Evaluate <ArrowRight className="size-3 ml-0.5" />
                                          </AppLink>
                                        </Button>
                                      ) : canAccessRoute(me, "workstation") ? (
                                        <Button
                                          asChild
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                                        >
                                          <AppLink href={paths.workstation}>
                                            Station 1 <ArrowRight className="size-3 ml-0.5" />
                                          </AppLink>
                                        </Button>
                                      ) : null
                                    )}

                                    {t.kind === "receive-lot" && (me.department === "receiving" || isManager) && t.status !== "done" && (
                                      <Button asChild size="sm" className="h-7 text-xs">
                                        <AppLink href={paths.lots}>
                                          Receive Fabric <ArrowRight className="size-3 ml-0.5" />
                                        </AppLink>
                                      </Button>
                                    )}

                                    {stCode && (me.role === "P" || isManager) && t.status !== "done" && (
                                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                                        <AppLink href={paths.workstation}>
                                          Station {t.checkpoint} <ArrowRight className="size-3 ml-0.5" />
                                        </AppLink>
                                      </Button>
                                    )}

                                    {domainHref && t.kind !== "issue-material" && (t.kind !== "incoming-qc" || (me.role !== "Q" && !isManager)) && (
                                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                        <AppLink href={domainHref}>
                                          View <ArrowRight className="size-3 ml-0.5" />
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

export function TasksView() {
  return (
    <>
      <PageHeader
        title="Tasks & Factory Work Queue"
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Tasks" }]}
      />
      <TasksSection />
    </>
  );
}
