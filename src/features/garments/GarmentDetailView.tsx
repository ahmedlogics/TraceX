import { ExternalLink, OctagonAlert } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/wt/DataTable";
import { ScopeNote } from "@/components/wt/forms";
import { fmt, KeyValue, PageHeader, Section, Timeline } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can, garmentSections } from "@/domain/permissions";
import type { LedgerStatus } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { publicProductRecords } from "@/mock/public-fixtures";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

export function GarmentDetailView({ garmentId }: { garmentId: string }) {
  const me = useMe();
  const q = useWtQuery(["garment", garmentId], (c) => c.getGarment(garmentId));
  const { run, pending } = useWtAction();
  const sec = garmentSections(me);
  return (
    <Loadable query={q} what="garment" backHref={paths.garments}>
      {(d) => {
        const g = d.garment;
        const latest = [...d.inspections].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        const ledgerStatus: LedgerStatus = d.ledger[0]?.status ?? "not-queued";
        const published = publicProductRecords.some((r) => r.publicId === g.publicId);
        return (
          <>
            <PageHeader
              title={<span className="wt-id text-2xl">{g.id}</span>}
              description={g.productName}
              crumbs={[
                { label: "Staff", href: paths.home },
                { label: "Garments", href: paths.garments },
                { label: g.id },
              ]}
              meta={
                <>
                  <StatusBadge status={g.stage} label="Stage" />
                  <StatusBadge status={g.disposition} label="Quality" />
                  {sec.proof && <StatusBadge status={ledgerStatus} label="Ledger" />}
                  {g.hold && <HoldBadge />}
                </>
              }
              actions={
                <>
                  {can.releaseHold(me, g, latest) && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        void run((c) => c.releaseHold(g.id), `Hold released on ${g.id}.`)
                      }
                    >
                      Release hold
                    </Button>
                  )}
                  {published && (
                    <Button asChild variant="outline" size="sm">
                      <AppLink
                        href={paths.publicJourney(g.publicId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Public page <ExternalLink />
                      </AppLink>
                    </Button>
                  )}
                </>
              }
            />
            <div className="grid gap-4 lg:grid-cols-3">
              {g.hold && (
                <section
                  className="rounded-lg border border-destructive/40 bg-danger-soft p-4 lg:col-span-3"
                  aria-label="Quality hold"
                >
                  <p className="flex items-center gap-2 font-medium text-destructive">
                    <OctagonAlert className="size-4" aria-hidden /> On quality hold since{" "}
                    {fmt.dateTime(g.hold.since)}
                  </p>
                  <p className="mt-1 text-sm">Reason: {g.hold.reason}</p>
                  <p className="mt-1 flex flex-wrap gap-3 text-sm">
                    <span>
                      Inspection:{" "}
                      <LinkIf
                        user={me}
                        routeKey="inspection"
                        href={paths.inspection(g.hold.inspectionId)}
                        id={g.hold.inspectionId}
                      />
                    </span>
                    {g.hold.reworkCaseId && (
                      <span>
                        Rework:{" "}
                        <LinkIf
                          user={me}
                          routeKey="reworkCase"
                          href={paths.reworkCase(g.hold.reworkCaseId)}
                          id={g.hold.reworkCaseId}
                        />
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Packing and departure stay blocked until the inspector releases the hold after a
                    passing reinspection.
                  </p>
                </section>
              )}
              <Section title="Identity & Lineage">
                <KeyValue
                  items={[
                    {
                      label: "Active RFID card",
                      value: g.rfidUid ? (
                        <span className="wt-id font-bold text-success">{g.rfidUid}</span>
                      ) : (
                        <span className="text-muted-foreground italic">None assigned</span>
                      ),
                    },
                    {
                      label: "Order",
                      value: d.order ? (
                        <LinkIf
                          user={me}
                          routeKey="productionOrder"
                          href={paths.order(d.order.id)}
                          id={d.order.id}
                        />
                      ) : (
                        "—"
                      ),
                    },
                    {
                      label: "Fabric lot",
                      value: d.lot ? (
                        <LinkIf
                          user={me}
                          routeKey="materialLot"
                          href={paths.lot(d.lot.id)}
                          id={d.lot.id}
                        />
                      ) : (
                        "—"
                      ),
                    },
                    {
                      label: "Cutting output",
                      value: d.cuttingOutput ? (
                        <span className="wt-id">
                          {d.cuttingOutput.id} · {d.cuttingOutput.panelSetLabel}
                        </span>
                      ) : (
                        "—"
                      ),
                    },
                    { label: "Size", value: g.size ?? "—" },
                    { label: "Public ID", value: <span className="wt-id">{g.publicId}</span> },
                  ]}
                />
              </Section>
              <Section title="Internal timeline" className="lg:col-span-2">
                <Timeline
                  items={d.events.map((e) => ({
                    key: e.id,
                    title: e.label,
                    meta: (
                      <>
                        {fmt.dateTime(e.at)} · <UserName id={e.actorId} />
                      </>
                    ),
                    body: e.detail,
                    tone: /fail|hold —/i.test(e.label)
                      ? "danger"
                      : /passed|released|dispatched/i.test(e.label)
                        ? "success"
                        : "default",
                  }))}
                />
              </Section>
              {sec.inspections && (
                <Section title="Inspections" className="lg:col-span-2">
                  <DataTable
                    rows={d.inspections}
                    rowKey={(i) => i.id}
                    empty="No inspections yet."
                    columns={[
                      {
                        header: "Inspection",
                        cell: (i) => (
                          <LinkIf
                            user={me}
                            routeKey="inspection"
                            href={paths.inspection(i.id)}
                            id={i.id}
                          />
                        ),
                      },
                      { header: "Kind", cell: (i) => i.kind },
                      { header: "Result", cell: (i) => <StatusBadge status={i.status} /> },
                      { header: "Submitted", cell: (i) => fmt.dateTime(i.submittedAt) },
                      { header: "Defect", cell: (i) => i.defectReason ?? "—" },
                    ]}
                  />
                </Section>
              )}
              <Section title="Rework">
                {d.rework.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rework cases.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {d.rework.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2">
                        <LinkIf
                          user={me}
                          routeKey="reworkCase"
                          href={paths.reworkCase(r.id)}
                          id={r.id}
                        />
                        <StatusBadge status={r.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              {sec.logistics ? (
                <Section title="Logistics" className="lg:col-span-2">
                  <KeyValue
                    items={[
                      {
                        label: "Package",
                        value: d.pkg ? (
                          <span className="wt-id">
                            {d.pkg.id} ({d.pkg.status})
                          </span>
                        ) : (
                          "Not packed"
                        ),
                      },
                      {
                        label: "Shipment",
                        value: d.shipment ? (
                          <LinkIf
                            user={me}
                            routeKey="shipment"
                            href={paths.shipment(d.shipment.id)}
                            id={d.shipment.id}
                          />
                        ) : (
                          "Not on a shipment"
                        ),
                      },
                      {
                        label: "Shipment status",
                        value: d.shipment ? <StatusBadge status={d.shipment.status} /> : "—",
                      },
                      {
                        label: "Allocated",
                        value: d.shipment?.allocatedGarmentIds.includes(g.id) ? "Yes" : "No",
                      },
                    ]}
                  />
                </Section>
              ) : null}
              {sec.proof ? (
                <Section title="Proof state">
                  {d.ledger.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No commitments queued for this garment.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {d.ledger.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2">
                          <span>
                            <span className="wt-id">{l.id}</span> · {l.milestone}
                          </span>
                          <StatusBadge status={l.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              ) : null}
              {!sec.logistics && !sec.proof && (
                <div className="lg:col-span-3">
                  <ScopeNote>
                    Logistics and proof details are limited to managers and logistics staff.
                  </ScopeNote>
                </div>
              )}
            </div>
          </>
        );
      }}
    </Loadable>
  );
}
