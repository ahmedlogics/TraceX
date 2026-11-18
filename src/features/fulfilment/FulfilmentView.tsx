import { useState } from "react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { IdLink, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { Garment, Shipment } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function AllocateDialog({ garment, shipments }: { garment: Garment; shipments: Shipment[] }) {
  const { run } = useWtAction();
  const preferred =
    garment.shipmentId && shipments.some((s) => s.id === garment.shipmentId)
      ? garment.shipmentId
      : shipments[0]?.id;
  const [picked, setPicked] = useState("");
  const shipmentId = picked || preferred || "";
  return (
    <FormDialog
      trigger="Allocate"
      triggerVariant="outline"
      title={`Allocate ${garment.id}`}
      submitLabel="Allocate"
      disabled={shipments.length === 0}
      onSubmit={async () =>
        (await run(
          (c) => c.allocateStock(garment.id, shipmentId).then(() => true),
          `${garment.id} allocated to ${shipmentId}.`,
        )) ?? false
      }
    >
      <Field label="Shipment" htmlFor={`alloc-${garment.id}`}>
        <NativeSelect
          id={`alloc-${garment.id}`}
          value={shipmentId}
          onChange={setPicked}
          options={shipments.map((s) => ({
            value: s.id,
            label: `${s.id} — ${s.destination} (${s.status})`,
          }))}
        />
      </Field>
    </FormDialog>
  );
}

export function FulfilmentView() {
  const me = useMe();
  const q = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const { run, pending } = useWtAction();
  const defaultTab =
    me.department === "warehouse" || me.department === "dispatch" ? "stock" : "packing";
  return (
    <>
      <PageHeader
        title="Fulfilment"
        description="Packing and finished-goods stock."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Fulfilment" }]}
      />
      <Loadable query={q}>
        {(d) => (
          <div className="space-y-4">
            {d.blocked.length > 0 && (
              <Section
                title="Blocked by quality hold"
                description="Held garments cannot be packed or depart, even if they appear on a planned shipment."
              >
                <ul className="flex flex-wrap gap-2">
                  {d.blocked.map((g) => (
                    <li key={g.id} className="flex items-center gap-1.5">
                      <IdLink href={paths.garment(g.id)} id={g.id} />
                      <HoldBadge />
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Tabs defaultValue={defaultTab}>
              <TabsList>
                <TabsTrigger value="packing">Packing</TabsTrigger>
                <TabsTrigger value="stock">Finished stock</TabsTrigger>
              </TabsList>
              <TabsContent value="packing" className="mt-4 space-y-4">
                {!can.packGarment(me) && (
                  <ScopeNote>Packing actions are limited to packing staff.</ScopeNote>
                )}
                <Section title="Released garments awaiting packing">
                  <DataTable
                    rows={d.awaitingPacking}
                    rowKey={(g) => g.id}
                    empty="Nothing waiting for packing."
                    columns={[
                      {
                        header: "Garment",
                        cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                      },
                      { header: "Product", cell: (g) => g.productName },
                      { header: "Quality", cell: (g) => <StatusBadge status={g.disposition} /> },
                      {
                        header: "Action",
                        cell: (g) =>
                          can.packGarment(me) ? (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                void run(
                                  (c) => c.packGarment(g.id),
                                  (p) => `${g.id} added to ${p}.`,
                                )
                              }
                            >
                              Add to package
                            </Button>
                          ) : null,
                      },
                    ]}
                  />
                </Section>
                <Section title="Packages">
                  <DataTable
                    rows={d.packages}
                    rowKey={(p) => p.id}
                    columns={[
                      { header: "Package", cell: (p) => <span className="wt-id">{p.id}</span> },
                      {
                        header: "Garments",
                        cell: (p) => <span className="wt-id">{p.garmentIds.join(", ")}</span>,
                      },
                      { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
                    ]}
                  />
                </Section>
              </TabsContent>
              <TabsContent value="stock" className="mt-4 space-y-4">
                {!can.receiveStock(me) && (
                  <ScopeNote>Warehouse actions are limited to warehouse staff.</ScopeNote>
                )}
                <Section title="Packed, awaiting warehouse receipt">
                  <DataTable
                    rows={d.packedAwaitingReceipt}
                    rowKey={(g) => g.id}
                    empty="Nothing waiting for receipt."
                    columns={[
                      {
                        header: "Garment",
                        cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                      },
                      {
                        header: "Package",
                        cell: (g) => <span className="wt-id">{g.packageId}</span>,
                      },
                      {
                        header: "Action",
                        cell: (g) =>
                          can.receiveStock(me) ? (
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                void run(
                                  (c) => c.receiveStock(g.id),
                                  `${g.id} received into finished stock.`,
                                )
                              }
                            >
                              Receive into stock
                            </Button>
                          ) : null,
                      },
                    ]}
                  />
                </Section>
                <Section title="Finished stock">
                  <DataTable
                    rows={d.inStock}
                    rowKey={(g) => g.id}
                    empty="No finished stock."
                    columns={[
                      {
                        header: "Garment",
                        cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                      },
                      { header: "Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                      {
                        header: "Shipment",
                        cell: (g) =>
                          g.shipmentId ? (
                            <IdLink href={paths.shipment(g.shipmentId)} id={g.shipmentId} />
                          ) : (
                            "—"
                          ),
                      },
                      {
                        header: "Action",
                        cell: (g) =>
                          can.allocateStock(me) && g.stage === "warehouse" ? (
                            <AllocateDialog garment={g} shipments={d.openShipments} />
                          ) : null,
                      },
                    ]}
                  />
                </Section>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </Loadable>
    </>
  );
}
