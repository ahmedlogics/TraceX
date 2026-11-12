import { useState } from "react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FilterBar, FormDialog, NativeSelect, SearchInput } from "@/components/wt/forms";
import { fmt, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels } from "@/domain/labels";
import { can } from "@/domain/permissions";
import type { Task } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useDirectory, UserName } from "@/features/shared/directory";
import { SubjectLink } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

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
      onSubmit={async () => !!(await run((c) => c.assignTask(task.id, userId).then(() => true), "Task assigned."))}
    >
      <Field label={`Staff in ${departmentLabels[task.department]}`} htmlFor={`assign-${task.id}`}>
        <NativeSelect id={`assign-${task.id}`} value={userId} onChange={setUserId} options={options.map((u) => ({ value: u.id, label: `${u.username} — ${u.displayName}` }))} />
      </Field>
    </FormDialog>
  );
}

export function TasksView() {
  const me = useMe();
  const q = useWtQuery(["tasks"], (c) => c.listTasks());
  const { run, pending } = useWtAction();
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  return (
    <>
      <PageHeader
        title="Tasks"
        description={me.role === "M" ? "All departments. Assign work to the right operator." : `Work queue for ${departmentLabels[me.department]}.`}
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Tasks" }]}
      />
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search tasks or IDs" label="Search tasks" />
        <div className="w-full sm:w-44">
          <NativeSelect
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Open & claimed" },
              { value: "open", label: "Open" },
              { value: "claimed", label: "Claimed" },
              { value: "done", label: "Done" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </FilterBar>
      <Loadable query={q}>
        {(tasks) => {
          const rows = tasks.filter(
            (t) =>
              (status === "all" || (status === "active" ? t.status !== "done" : t.status === status)) &&
              `${t.id} ${t.title} ${t.subjectId}`.toLowerCase().includes(search.toLowerCase()),
          );
          return (
            <DataTable
              rows={rows}
              rowKey={(t) => t.id}
              empty="No tasks match."
              columns={[
                { header: "Task", cell: (t) => <div><p className="font-medium">{t.title}</p><p className="wt-id text-muted-foreground">{t.id} · {fmt.date(t.createdAt)}</p></div> },
                { header: "Subject", cell: (t) => <SubjectLink user={me} type={t.subjectType} id={t.subjectId} /> },
                { header: "Department", cell: (t) => departmentLabels[t.department] },
                { header: "Checkpoint", cell: (t) => (t.checkpoint ? <span className="wt-id">{t.checkpoint}</span> : <span className="text-muted-foreground">Software</span>) },
                { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
                { header: "Assignee", cell: (t) => <UserName id={t.assigneeId} /> },
                {
                  header: "Actions",
                  cell: (t) => (
                    <div className="flex gap-2">
                      {can.claimTask(me, t) && (
                        <Button size="sm" disabled={pending} onClick={() => void run((c) => c.claimTask(t.id), `${t.id} claimed.`)}>
                          Claim
                        </Button>
                      )}
                      {can.assignTask(me) && t.status !== "done" && <AssignDialog task={t} />}
                    </div>
                  ),
                },
              ]}
            />
          );
        }}
      </Loadable>
    </>
  );
}
