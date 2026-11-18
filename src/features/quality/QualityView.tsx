import { paths } from "@/app/paths";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { fmt, IdLink, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { InspectionKind } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";
import { QAPanel } from "@/features/workstation/panels/QAPanel";

const tabs: { kind: InspectionKind; label: string }[] = [
  { kind: "incoming", label: "Incoming (lot-level)" },
  { kind: "final", label: "Final" },
  { kind: "reinspection", label: "Reinspection" },
];

export function QualityView() {
  const me = useMe();
  const insp = useWtQuery(["inspections"], (c) => c.listInspections());
  const garments = useWtQuery(["garments"], (c) => c.listGarments());
  const qRfidStation = useWtQuery(["rfid-station", "final_qc"], (c) =>
    c.getRfidStationData("final_qc"),
  );
  const held = new Set((garments.data ?? []).filter((g) => g.hold).map((g) => g.id));
  return (
    <>
      <PageHeader
        title="Quality"
        description={
          me.role === "M"
            ? "Read-only view for managers. Only the inspector records results."
            : "Your inspection queues and RFID inspection reader."
        }
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Quality" }]}
      />
      <div className="space-y-6">
        {qRfidStation.data && (
          <Section
            title="RFID Final Inspection Station"
            description="Choose Pass/Fail and checklist, then scan the garment's card. Identity is resolved automatically."
          >
            <QAPanel stationData={qRfidStation.data} />
          </Section>
        )}

        <Loadable query={insp}>
          {(all) => (
            <Tabs defaultValue="final">
              <TabsList className="flex h-auto flex-wrap">
                {tabs.map((t) => (
                  <TabsTrigger key={t.kind} value={t.kind}>
                    {t.label} ({all.filter((i) => i.kind === t.kind && i.status === "open").length}{" "}
                    open)
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((t) => (
                <TabsContent key={t.kind} value={t.kind} className="mt-4">
                  <DataTable
                    rows={all
                      .filter((i) => i.kind === t.kind)
                      .sort(
                        (a, b) =>
                          (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) ||
                          b.createdAt.localeCompare(a.createdAt),
                      )}
                    rowKey={(i) => i.id}
                    empty="No inspections in this queue."
                    columns={[
                      {
                        header: "Inspection",
                        cell: (i) => <IdLink href={paths.inspection(i.id)} id={i.id} />,
                      },
                      {
                        header: "Subject",
                        cell: (i) => (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {i.subjectType === "lot" ? (
                              <LinkIf
                                user={me}
                                routeKey="materialLot"
                                href={paths.lot(i.subjectId)}
                                id={i.subjectId}
                              />
                            ) : (
                              <LinkIf
                                user={me}
                                routeKey="garment"
                                href={paths.garment(i.subjectId)}
                                id={i.subjectId}
                              />
                            )}
                            {held.has(i.subjectId) && <HoldBadge />}
                          </div>
                        ),
                      },
                      { header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
                      { header: "Inspector", cell: (i) => <UserName id={i.assigneeId} /> },
                      { header: "Opened", cell: (i) => fmt.dateTime(i.createdAt) },
                    ]}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </Loadable>
      </div>
    </>
  );
}
