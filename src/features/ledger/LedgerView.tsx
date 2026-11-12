import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { ScopeNote } from "@/components/wt/forms";
import { fmt, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { LedgerCommitment } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

const statuses: LedgerCommitment["status"][] = ["pending", "submitted", "failed", "confirmed"];

export function LedgerView() {
  const me = useMe();
  const q = useWtQuery(["ledger"], (c) => c.listLedger());
  const { run, pending } = useWtAction();
  return (
    <>
      <PageHeader
        title="Ledger"
        description="Mock record commitments. Independent of production and QC; no real chain is used."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Ledger" }]}
      />
      {!can.retryLedger(me) && <div className="mb-4"><ScopeNote>Read-only. Only the administrator can retry failed commitments.</ScopeNote></div>}
      <Loadable query={q}>
        {(rows) => (
          <Tabs defaultValue="failed">
            <TabsList className="flex h-auto flex-wrap">
              {statuses.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s} ({rows.filter((r) => r.status === s).length})
                </TabsTrigger>
              ))}
            </TabsList>
            {statuses.map((s) => (
              <TabsContent key={s} value={s} className="mt-4">
                <DataTable
                  rows={rows.filter((r) => r.status === s)}
                  rowKey={(r) => r.id}
                  empty={`No ${s} commitments.`}
                  columns={[
                    { header: "Commitment", cell: (r) => <span className="wt-id">{r.id}</span> },
                    { header: "Subject", cell: (r) => <span className="wt-id">{r.subjectType}: {r.subjectId}</span> },
                    { header: "Milestone", cell: (r) => r.milestone },
                    { header: "Status", cell: (r) => <div><StatusBadge status={r.status} />{r.lastError && <p className="mt-1 text-xs text-destructive">{r.lastError}</p>}</div> },
                    { header: "Attempts", cell: (r) => r.attempts },
                    { header: "Digest (sample)", cell: (r) => <span className="wt-id text-muted-foreground">{r.digest}</span> },
                    { header: "Updated", cell: (r) => fmt.dateTime(r.updatedAt) },
                    {
                      header: "Action",
                      cell: (r) =>
                        can.retryLedger(me) && r.status === "failed" ? (
                          <Button size="sm" disabled={pending} onClick={() => void run((c) => c.retryLedger(r.id), `${r.id} resubmitted (mock).`)}>
                            Retry (mock)
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </Loadable>
    </>
  );
}
