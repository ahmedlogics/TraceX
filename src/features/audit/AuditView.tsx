import { useState } from "react";
import { Clock, Eye, Filter, Info, Search, Shield, X } from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/wt/DataTable";
import { FilterBar, NativeSelect, SearchInput } from "@/components/wt/forms";
import { fmt, KeyValue, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { AuditCategory, AuditEvent } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";
import { useDirectory, UserName } from "@/features/shared/directory";
import { useMe } from "@/features/shared/useMe";

const categoryOptions: { value: string; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "auth", label: "Authentication & Sessions" },
  { value: "admin", label: "Staff & Administration" },
  { value: "quality", label: "Quality Assurance & Holds" },
  { value: "rework", label: "Rework & Repairs" },
  { value: "materials", label: "Materials & Lots" },
  { value: "rfid", label: "RFID Scans & Tags" },
  { value: "workstation", label: "Station Operations" },
  { value: "ledger", label: "Ledger Commitments" },
  { value: "settings", label: "System & Device Settings" },
];

export function AuditView() {
  const me = useMe();
  const q = useWtQuery(["audit"], (c) => c.listAudit());
  const { users } = useDirectory();

  const [actor, setActor] = useState("all");
  const [category, setCategory] = useState("all");
  const [event, setEvent] = useState("");
  const [subject, setSubject] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description={
          me.role === "M"
            ? "Factory-wide activity trail."
            : me.role === "Q"
              ? "Quality, rework, and material movement compliance records."
              : "System access, authentication, and administrative event trail."
        }
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Audit log" }]}
      />

      <FilterBar>
        <div className="w-full sm:w-48">
          <NativeSelect
            ariaLabel="Filter by actor"
            value={actor}
            onChange={setActor}
            options={[
              { value: "all", label: "All actors" },
              ...users.map((u) => ({ value: u.id, label: u.username })),
            ]}
          />
        </div>

        <div className="w-full sm:w-52">
          <NativeSelect
            ariaLabel="Filter by category"
            value={category}
            onChange={setCategory}
            options={categoryOptions}
          />
        </div>

        <SearchInput
          value={event}
          onChange={setEvent}
          placeholder="Filter event description…"
          label="Filter by event"
        />

        <SearchInput
          value={subject}
          onChange={setSubject}
          placeholder="Subject ID contains…"
          label="Filter by subject"
        />
      </FilterBar>

      <Loadable query={q}>
        {(rows) => {
          const filtered = rows.filter((a) => {
            const matchesActor = actor === "all" || a.actorId === actor;
            const matchesCategory = category === "all" || a.category === category;
            const matchesEvent = a.event.toLowerCase().includes(event.toLowerCase());
            const matchesSubject = `${a.subjectType} ${a.subjectId}`
              .toLowerCase()
              .includes(subject.toLowerCase());
            return matchesActor && matchesCategory && matchesEvent && matchesSubject;
          });

          return (
            <DataTable
              rows={filtered}
              rowKey={(a) => a.id}
              columns={[
                {
                  header: "Timestamp",
                  cell: (a) => (
                    <div>
                      <p className="text-xs font-medium text-foreground">{fmt.dateTime(a.at)}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{a.id}</p>
                    </div>
                  ),
                },
                {
                  header: "Actor",
                  cell: (a) => (
                    <div className="flex items-center gap-1.5">
                      <span className="wt-id font-medium">
                        <UserName id={a.actorId} />
                      </span>
                    </div>
                  ),
                },
                {
                  header: "Category",
                  cell: (a) => <StatusBadge status={a.category} />,
                },
                {
                  header: "Event",
                  cell: (a) => (
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{a.event}</p>
                      {a.detail && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{a.detail}</p>
                      )}
                    </div>
                  ),
                },
                {
                  header: "Subject",
                  cell: (a) => (
                    <span className="wt-id rounded bg-muted/70 px-1.5 py-0.5 text-xs text-foreground font-mono">
                      {a.subjectType}: {a.subjectId}
                    </span>
                  ),
                },
                {
                  header: "Inspect",
                  cell: (a) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEvent(a)}
                      className="h-8 text-xs text-primary gap-1"
                    >
                      <Eye className="size-3.5" /> Details
                    </Button>
                  ),
                },
              ]}
            />
          );
        }}
      </Loadable>

      {/* Event Details Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        {selectedEvent && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="size-5 text-primary" /> Audit Record · {selectedEvent.id}
              </DialogTitle>
              <DialogDescription>
                Immutable factory record recorded at {fmt.dateTime(selectedEvent.at)}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <KeyValue
                items={[
                  {
                    label: "Audit ID",
                    value: <span className="wt-id font-semibold">{selectedEvent.id}</span>,
                  },
                  { label: "Timestamp (UTC)", value: selectedEvent.at },
                  { label: "Actor Identity", value: <UserName id={selectedEvent.actorId} /> },
                  { label: "Category", value: <StatusBadge status={selectedEvent.category} /> },
                  { label: "Event Name", value: selectedEvent.event },
                  {
                    label: "Subject",
                    value: (
                      <span className="wt-id font-semibold">
                        {selectedEvent.subjectType} → {selectedEvent.subjectId}
                      </span>
                    ),
                  },
                ]}
              />

              {selectedEvent.detail && (
                <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
                  <p className="wt-eyebrow">Event Detail</p>
                  <p className="text-xs font-mono leading-relaxed break-all text-foreground">
                    {selectedEvent.detail}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
