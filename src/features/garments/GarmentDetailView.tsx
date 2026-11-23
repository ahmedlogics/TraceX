import { useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Layers, OctagonAlert, Radio, Scissors, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, ScopeNote } from "@/components/wt/forms";
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

function ReplaceCardDialog({ garmentId, currentUid }: { garmentId: string; currentUid?: string | undefined }) {
  const { run } = useWtAction();
  const [newUid, setNewUid] = useState("");

  return (
    <FormDialog
      trigger="Replace RFID card"
      triggerVariant="outline"
      title={`Replace RFID Card for ${garmentId}`}
      description="Deactivates the previous physical card binding and binds a fresh, unbound card. The garment's permanent UUID, tracking code, and lineage history are preserved."
      submitLabel="Rebind fresh card"
      onSubmit={async () => {
        if (!newUid.trim()) return false;
        const res = await run(
          (c) => c.replaceGarmentCard(garmentId, newUid.trim()),
          (outcome) =>
            outcome.resolution === "accepted"
              ? `Garment ${garmentId} rebound to card ${newUid.trim()}.`
              : `Replacement rejected: ${outcome.rejectReason ?? outcome.resolution}`,
        );
        return res?.resolution === "accepted";
      }}
    >
      {currentUid && (
        <div className="rounded-md border bg-muted/40 p-2.5 text-xs mb-3">
          <span className="text-muted-foreground">Current Active UID: </span>
          <span className="font-mono font-bold text-foreground">{currentUid}</span>
        </div>
      )}
      <Field label="New fresh RFID card UID" htmlFor="rep-uid" hint="Enter or tap an unassigned card UID (hex)">
        <Input
          id="rep-uid"
          value={newUid}
          onChange={(e) => setNewUid(e.target.value.toUpperCase())}
          placeholder="e.g. 04FA1234"
          className="font-mono"
        />
      </Field>
    </FormDialog>
  );
}

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
        const canReplaceCard = me.role === "A" || me.role === "M" || me.role === "P";

        return (
          <>
            <PageHeader
              title={<span className="wt-id text-2xl font-bold">{g.id}</span>}
              description={g.productName}
              crumbs={[
                { label: "Staff", href: paths.home },
                { label: "Garments", href: paths.garments },
                { label: g.id },
              ]}
              meta={
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={g.stage} label="Stage" />
                  <StatusBadge status={g.disposition} label="Quality" />
                  {sec.proof && <StatusBadge status={ledgerStatus} label="Ledger" />}
                  {g.hold && <HoldBadge />}
                </div>
              }
              actions={
                <div className="flex flex-wrap items-center gap-2">
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
                  {canReplaceCard && <ReplaceCardDialog garmentId={g.id} currentUid={g.rfidUid} />}
                  <Button asChild variant="default" size="sm" className="bg-primary text-primary-foreground shadow-xs">
                    <AppLink
                      href={paths.publicJourney(g.publicId || g.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Sparkles className="size-3.5 mr-1" /> NFC Digital Passport <ExternalLink className="size-3.5 ml-1" />
                    </AppLink>
                  </Button>
                </div>
              }
            />

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Unbroken Material Lineage Chain Banner */}
              <section className="rounded-xl border border-border/80 bg-card p-4 shadow-xs lg:col-span-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Unbroken Raw-to-Garment Lineage
                  </h3>
                  <span className="text-[11px] font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                    Audited Chain
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {d.lot ? (
                    <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2.5 hover:border-primary/40 transition-colors">
                      <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                        <Layers className="size-3.5" />
                      </div>
                      <div>
                        <LinkIf
                          user={me}
                          routeKey="materialLot"
                          href={paths.lot(d.lot.id)}
                          id={d.lot.id}
                        />
                        <p className="text-[11px] text-muted-foreground">{d.lot.material}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No lot record</span>
                  )}

                  <ArrowRight className="size-4 text-muted-foreground/60 shrink-0" />

                  {d.cuttingOutput ? (
                    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2.5 hover:border-primary/40 transition-colors">
                      <span className="text-muted-foreground font-semibold">Issue:</span>
                      <span className="wt-id font-mono font-bold text-foreground">{d.cuttingOutput.issueId}</span>
                    </div>
                  ) : null}

                  <ArrowRight className="size-4 text-muted-foreground/60 shrink-0" />

                  {d.cuttingOutput ? (
                    <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2.5 hover:border-primary/40 transition-colors">
                      <div className="flex size-7 items-center justify-center rounded-md bg-accent/30 text-accent-foreground shrink-0">
                        <Scissors className="size-3.5" />
                      </div>
                      <div>
                        <p className="font-semibold font-mono text-foreground">{d.cuttingOutput.panelSetLabel}</p>
                        <p className="text-[11px] text-muted-foreground">{d.cuttingOutput.fabricUsed} m attributed</p>
                      </div>
                    </div>
                  ) : null}

                  <ArrowRight className="size-4 text-muted-foreground/60 shrink-0" />

                  <div className="flex items-center gap-2.5 rounded-lg border-2 border-primary bg-primary/5 px-3.5 py-2.5 shadow-2xs">
                    <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
                      <Tag className="size-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-primary">{g.id}</p>
                      <p className="text-[11px] text-muted-foreground">{g.size ? `Size ${g.size}` : "One Size"}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Quality Hold Alert */}
              {g.hold && (
                <section
                  className="rounded-lg border border-destructive/40 bg-danger-soft p-4 lg:col-span-3"
                  aria-label="Quality hold"
                >
                  <p className="flex items-center gap-2 font-medium text-destructive">
                    <OctagonAlert className="size-4" aria-hidden /> On quality hold since{" "}
                    {fmt.dateTime(g.hold.since)}
                  </p>
                  <p className="mt-1 text-sm font-semibold">Reason: {g.hold.reason}</p>
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
                        Rework Case:{" "}
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
                    Downstream operations (packing, warehousing, departure) remain hard-blocked until an independent inspector completes reinspection.
                  </p>
                </section>
              )}

              {/* Identity & Technical Specs */}
              <Section title="Identity & Physical Tag">
                <KeyValue
                  items={[
                    {
                      label: "Active RFID Card UID",
                      value: g.rfidUid ? (
                        <span className="font-mono font-bold text-success flex items-center gap-1.5">
                          <Radio className="size-3.5" /> {g.rfidUid}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">None (bind at Cutting station)</span>
                      ),
                    },
                    {
                      label: "Production Order",
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
                      label: "Cutting Output",
                      value: d.cuttingOutput ? (
                        <span className="wt-id">
                          {d.cuttingOutput.id} · {d.cuttingOutput.panelSetLabel}
                        </span>
                      ) : (
                        "—"
                      ),
                    },
                    { label: "Garment Size", value: g.size ?? "—" },
                    { label: "Public Tracking Ref", value: <span className="wt-id font-mono">{g.publicId}</span> },
                    ...(can.accessNfcHub(me)
                      ? [
                          {
                            label: "NFC Tag Link (Mobile Tap)",
                            value: (
                              <div className="flex flex-wrap items-center gap-2">
                                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-primary font-bold">
                                  /p/{g.publicId || g.id}
                                </code>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                  onClick={() => {
                                    const fullUrl = `${window.location.origin}/p/${g.publicId || g.id}`;
                                    navigator.clipboard.writeText(fullUrl);
                                    toast.success(`Copied NFC link: ${fullUrl}`);
                                  }}
                                >
                                  <Copy className="size-3" /> Copy URL
                                </button>
                              </div>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </Section>

              {/* Timeline */}
              <Section title="Audited Factory Timeline" className="lg:col-span-2">
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

              {/* Inspections */}
              {sec.inspections && (
                <Section title="Quality Inspections" className="lg:col-span-2">
                  <DataTable
                    rows={d.inspections}
                    rowKey={(i) => i.id}
                    empty="No quality inspections recorded for this garment yet."
                    columns={[
                      {
                        header: "Inspection Code",
                        cell: (i) => (
                          <LinkIf
                            user={me}
                            routeKey="inspection"
                            href={paths.inspection(i.id)}
                            id={i.id}
                          />
                        ),
                      },
                      { header: "Inspection Kind", cell: (i) => i.kind },
                      { header: "Outcome", cell: (i) => <StatusBadge status={i.status} /> },
                      { header: "Submitted Timestamp", cell: (i) => fmt.dateTime(i.submittedAt) },
                      { header: "Defect Code / Note", cell: (i) => i.defectReason ?? "—" },
                    ]}
                  />
                </Section>
              )}

              {/* Rework Cases */}
              <Section title="Rework & Corrective Actions">
                {d.rework.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rework cases recorded.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {d.rework.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 border-b pb-2">
                        <div>
                          <LinkIf
                            user={me}
                            routeKey="reworkCase"
                            href={paths.reworkCase(r.id)}
                            id={r.id}
                          />
                          <p className="text-xs text-muted-foreground">{r.defectReason}</p>
                        </div>
                        <StatusBadge status={r.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Logistics */}
              {sec.logistics ? (
                <Section title="Downstream Logistics & Packing" className="lg:col-span-2">
                  <KeyValue
                    items={[
                      {
                        label: "Package Carton",
                        value: d.pkg ? (
                          <span className="wt-id">
                            {d.pkg.id} ({d.pkg.status})
                          </span>
                        ) : (
                          "Not packed"
                        ),
                      },
                      {
                        label: "Shipment Manifest",
                        value: d.shipment ? (
                          <LinkIf
                            user={me}
                            routeKey="shipment"
                            href={paths.shipment(d.shipment.id)}
                            id={d.shipment.id}
                          />
                        ) : (
                          "Not assigned to shipment"
                        ),
                      },
                      {
                        label: "Shipment status",
                        value: d.shipment ? <StatusBadge status={d.shipment.status} /> : "—",
                      },
                      {
                        label: "Allocated to Departure",
                        value: d.shipment?.allocatedGarmentIds?.includes(g.id) ? "Yes" : "No",
                      },
                    ]}
                  />
                </Section>
              ) : null}

              {sec.proof ? (
                <Section title="Ledger & Public Verification">
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
