import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/wt/DataTable";
import { FormDialog, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { ShipmentDetail } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { useMe } from "@/features/shared/useMe";

function PlanDialog({ d }: { d: ShipmentDetail }) {
  const { run } = useWtAction();
  const [selected, setSelected] = useState<string[]>(d.shipment.garmentIds);
  const [markPlanned, setMark] = useState(d.shipment.status === "draft");
  return (
    <FormDialog
      trigger="Edit plan"
      triggerVariant="outline"
      title={`Plan ${d.shipment.id}`}
      description="Manager planning only. Departure is confirmed separately by dispatch."
      submitLabel="Save plan"
      onSubmit={async () => (await run((c) => c.updateShipmentPlan({ shipmentId: d.shipment.id, garmentIds: selected, markPlanned }).then(() => true), "Shipment plan saved.")) ?? false}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Manifest garments</legend>
        {d.candidates.map((g) => (
          <label key={g.id} className="flex items-center gap-2 text-sm">
            <Checkbox checked={selected.includes(g.id)} onCheckedChange={(v) => setSelected((s) => (v === true ? [...s, g.id] : s.filter((x) => x !== g.id)))} />
            <span className="wt-id">{g.id}</span> <StatusBadge status={g.stage} /> {g.hold && <HoldBadge />}
          </label>
        ))}
      </fieldset>
      {d.shipment.status === "draft" && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={markPlanned} onCheckedChange={(v) => setMark(v === true)} /> Mark shipment as planned
        </label>
      )}
    </FormDialog>
  );
}

export function ShipmentDetailView({ shipmentId }: { shipmentId: string }) {
  const me = useMe();
  const q = useWtQuery(["shipment", shipmentId], (c) => c.getShipment(shipmentId));
  const { run, pending } = useWtAction();
  return (
    <Loadable query={q} what="shipment" backHref={paths.shipments}>
      {(d) => {
        const sh = d.shipment;
        const eligible = d.eligibility.every((c) => c.ok);
        return (
          <>
            <PageHeader
              title={<span className="wt-id text-2xl">{sh.id}</span>}
              description={sh.destination}
              crumbs={[{ label: "Staff", href: paths.home }, { label: "Shipments", href: paths.shipments }, { label: sh.id }]}
              meta={<StatusBadge status={sh.status} />}
              actions={
                <>
                  {can.planShipment(me) && sh.status !== "departed" && <PlanDialog key={`${sh.status}-${sh.garmentIds.join()}`} d={d} />}
                  {can.confirmDeparture(me) && sh.status !== "departed" && (
                    <Button size="sm" disabled={pending || !eligible} onClick={() => void run((c) => c.confirmDeparture(sh.id), `${sh.id} departed.`)}>
                      Confirm departure
                    </Button>
                  )}
                </>
              }
            />
            <div className="grid gap-4 lg:grid-cols-3">
              <Section title="Shipment">
                <KeyValue
                  items={[
                    { label: "Carrier", value: sh.carrier },
                    { label: "Planned date", value: fmt.date(sh.plannedDate) },
                    { label: "Planned by", value: <UserName id={sh.plannedBy} /> },
                    { label: "Departed", value: sh.departedAt ? <>{fmt.dateTime(sh.departedAt)} · <UserName id={sh.departedBy} /></> : "Not yet" },
                    { label: "Dispatch task", value: d.dispatchTask ? <span className="wt-id">{d.dispatchTask.id} ({d.dispatchTask.observation ? "observed" : "awaiting S6"})</span> : "—" },
                  ]}
                />
              </Section>
              <Section title="Eligibility checks" className="lg:col-span-2" description="Hold status is re-checked at departure.">
                {sh.status === "departed" ? (
                  <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" aria-hidden /> All checks passed when dispatch confirmed departure.</p>
                ) : (
                <ul className="space-y-1.5">
                  {d.eligibility.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-sm">
                      {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Pass" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Fail" />}
                      <span>
                        {c.label}
                        {c.detail && <span className="text-muted-foreground"> — {c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                )}
                {sh.status !== "departed" && !can.confirmDeparture(me) && (
                  <div className="mt-3">
                    <ScopeNote>{me.department === "packing" ? "Packing staff cannot dispatch." : "Only dispatch staff confirm departure."}</ScopeNote>
                  </div>
                )}
              </Section>
              <Section title="Manifest" className="lg:col-span-3">
                <DataTable
                  rows={d.garments}
                  rowKey={(g) => g.id}
                  empty="No garments on this manifest."
                  columns={[
                    { header: "Garment", cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} /> },
                    { header: "Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                    { header: "Quality", cell: (g) => <div className="flex gap-1"><StatusBadge status={g.disposition} />{g.hold && <HoldBadge />}</div> },
                    { header: "Package", cell: (g) => <span className="wt-id">{g.packageId ?? "—"}</span> },
                    { header: "Allocated", cell: (g) => (sh.allocatedGarmentIds.includes(g.id) ? "Yes" : "No") },
                  ]}
                />
              </Section>
            </div>
          </>
        );
      }}
    </Loadable>
  );
}
