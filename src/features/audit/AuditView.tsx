import { useState } from "react";
import { paths } from "@/app/paths";
import { DataTable } from "@/components/wt/DataTable";
import { FilterBar, NativeSelect, SearchInput } from "@/components/wt/forms";
import { fmt, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";
import { useDirectory, UserName } from "@/features/shared/directory";
import { useMe } from "@/features/shared/useMe";

export function AuditView() {
  const me = useMe();
  const q = useWtQuery(["audit"], (c) => c.listAudit());
  const { users } = useDirectory();
  const [actor, setActor] = useState("all");
  const [event, setEvent] = useState("");
  const [subject, setSubject] = useState("");
  return (
    <>
      <PageHeader
        title="Audit log"
        description={me.role === "M" ? "All events. Read-only." : me.role === "Q" ? "Quality, rework and materials events. Read-only." : "Access, admin, ledger and settings events. Read-only."}
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Audit log" }]}
      />
      <FilterBar>
        <div className="w-full sm:w-48">
          <NativeSelect ariaLabel="Filter by actor" value={actor} onChange={setActor} options={[{ value: "all", label: "All actors" }, ...users.map((u) => ({ value: u.id, label: u.username }))]} />
        </div>
        <SearchInput value={event} onChange={setEvent} placeholder="Event contains…" label="Filter by event" />
        <SearchInput value={subject} onChange={setSubject} placeholder="Subject ID contains…" label="Filter by subject" />
      </FilterBar>
      <Loadable query={q}>
        {(rows) => (
          <DataTable
            rows={rows.filter(
              (a) =>
                (actor === "all" || a.actorId === actor) &&
                a.event.toLowerCase().includes(event.toLowerCase()) &&
                `${a.subjectType} ${a.subjectId}`.toLowerCase().includes(subject.toLowerCase()),
            )}
            rowKey={(a) => a.id}
            columns={[
              { header: "Time", cell: (a) => fmt.dateTime(a.at) },
              { header: "Actor", cell: (a) => <UserName id={a.actorId} /> },
              { header: "Category", cell: (a) => <StatusBadge status={a.category} /> },
              { header: "Event", cell: (a) => <div>{a.event}{a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}</div> },
              { header: "Subject", cell: (a) => <span className="wt-id">{a.subjectType}: {a.subjectId}</span> },
            ]}
          />
        )}
      </Loadable>
    </>
  );
}
