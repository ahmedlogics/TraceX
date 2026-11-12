import { useState } from "react";
import { paths } from "@/app/paths";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function PlanShipmentDialog() {
  const { run } = useWtAction();
  const [destination, setDest] = useState("Authorized retail network — East region");
  const [carrier, setCarrier] = useState("Regional carrier (synthetic)");
  const [plannedDate, setDate] = useState("2026-11-25");
  return (
    <FormDialog
      trigger="Plan shipment"
      title="Draft a shipment"
      description="Add garments and mark it planned from the shipment page."
      submitLabel="Create draft"
      onSubmit={async () => !!(await run((c) => c.planShipment({ destination, carrier, plannedDate }), (id) => `${id} drafted.`))}
    >
      <Field label="Destination" htmlFor="ps-dest"><Input id="ps-dest" value={destination} onChange={(e) => setDest(e.target.value)} /></Field>
      <Field label="Carrier" htmlFor="ps-car"><Input id="ps-car" value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field>
      <Field label="Planned date" htmlFor="ps-date"><Input id="ps-date" type="date" value={plannedDate} onChange={(e) => setDate(e.target.value)} /></Field>
    </FormDialog>
  );
}

export function ShipmentsView() {
  const me = useMe();
  const q = useWtQuery(["shipments"], (c) => c.listShipments());
  return (
    <>
      <PageHeader title="Shipments" crumbs={[{ label: "Staff", href: paths.home }, { label: "Shipments" }]} actions={can.planShipment(me) ? <PlanShipmentDialog /> : undefined} />
      <Loadable query={q}>
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(s) => s.id}
            columns={[
              { header: "Shipment", cell: (s) => <IdLink href={paths.shipment(s.id)} id={s.id} /> },
              { header: "Destination", cell: (s) => s.destination },
              { header: "Garments", cell: (s) => `${s.allocatedGarmentIds.length}/${s.garmentIds.length} allocated` },
              { header: "Planned", cell: (s) => fmt.date(s.plannedDate) },
              { header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
            ]}
          />
        )}
      </Loadable>
    </>
  );
}
