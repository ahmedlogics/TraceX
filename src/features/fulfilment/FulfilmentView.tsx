import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Lock,
  Package as PkgIcon,
  Plus,
  ShieldAlert,
  Truck,
  Warehouse,
} from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { Garment, Package, Shipment } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

const defaultBins = [
  { id: "BIN-A1", label: "Bin A1 — Standard Hang / Classic Poplin", capacity: 50 },
  { id: "BIN-A2", label: "Bin A2 — Standard Fold / Classic Poplin", capacity: 50 },
  { id: "BIN-B1", label: "Bin B1 — Trousers / Bottoms", capacity: 40 },
  { id: "BIN-B2", label: "Bin B2 — Outerwear / Heavyweight", capacity: 30 },
  { id: "BIN-BULK-1", label: "Bulk Staging Bin 1", capacity: 100 },
];

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
      trigger="Allocate to Shipment"
      triggerVariant="outline"
      title={`Allocate ${garment.id}`}
      submitLabel="Confirm Allocation"
      disabled={shipments.length === 0}
      onSubmit={async () =>
        (await run(
          (c) => c.allocateStock(garment.id, shipmentId).then(() => true),
          `${garment.id} allocated to ${shipmentId}.`,
        )) ?? false
      }
    >
      <Field label="Target Outbound Shipment" htmlFor={`alloc-${garment.id}`}>
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
        title="Fulfilment & Warehousing"
        description="Packaging assembly, finished goods binning, and outbound stock allocation."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Fulfilment" }]}
        actions={
          can.packGarment(me) ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                void run(
                  (c) => c.createPackage(),
                  (id) => `Package ${id} created.`,
                )
              }
            >
              <Plus className="size-4 mr-1.5" /> Create New Package
            </Button>
          ) : undefined
        }
      />

      <Loadable query={q}>
        {(d) => {
          const openPackages = d.packages.filter((p) => p.status === "open");
          const sealedPackages = d.packages.filter((p) => p.status === "sealed");

          return (
            <div className="space-y-6">
              {/* Quality Hold Guard Alert */}
              {d.blocked.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-destructive">
                        {d.blocked.length} Garment{d.blocked.length > 1 ? "s" : ""} Blocked by
                        Quality Hold
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Authoritative server-side gates strictly block these garments from being
                        added to packages or dispatched on shipments.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {d.blocked.map((g) => (
                          <div
                            key={g.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                          >
                            <IdLink href={paths.garment(g.id)} id={g.id} />
                            <span className="text-muted-foreground">·</span>
                            <span className="italic">
                              {g.hold?.reason ?? "Quality hold active"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Awaiting Packing
                    </span>
                    <PkgIcon className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{d.awaitingPacking.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">QC passed & released</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Packed (Dock)
                    </span>
                    <Boxes className="size-4 text-warning" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{d.packedAwaitingReceipt.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting warehouse receipt</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Finished Stock
                    </span>
                    <Warehouse className="size-4 text-success" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{d.inStock.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">In warehouse storage bins</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Open Packages
                    </span>
                    <Lock className="size-4 text-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{openPackages.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {sealedPackages.length} sealed
                  </p>
                </div>
              </div>

              {/* Main Tabs */}
              <Tabs defaultValue={defaultTab}>
                <TabsList>
                  <TabsTrigger value="packing">
                    Packing Queue ({d.awaitingPacking.length})
                  </TabsTrigger>
                  <TabsTrigger value="stock">Finished Goods Stock ({d.inStock.length})</TabsTrigger>
                  <TabsTrigger value="packages">Packages ({d.packages.length})</TabsTrigger>
                </TabsList>

                {/* Tab 1: Packing */}
                <TabsContent value="packing" className="mt-4 space-y-6">
                  {!can.packGarment(me) && (
                    <ScopeNote>
                      Packaging actions are limited to authorized packing staff (Role L, Packing
                      dept).
                    </ScopeNote>
                  )}

                  <Section
                    title="Released Garments Awaiting Packing"
                    description="Only garments with quality clearance ('released') and zero active holds may be packed."
                  >
                    <DataTable
                      rows={d.awaitingPacking}
                      rowKey={(g) => g.id}
                      empty="No garments awaiting packing. Released finished shirts appear here."
                      columns={[
                        {
                          header: "Garment",
                          cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                        },
                        { header: "Product", cell: (g) => g.productName },
                        {
                          header: "RFID Card",
                          cell: (g) =>
                            g.rfidUid ? (
                              <span className="font-mono text-xs text-success">{g.rfidUid}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            ),
                        },
                        {
                          header: "Quality",
                          cell: (g) => (
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={g.disposition} />
                              {g.hold && <HoldBadge />}
                            </div>
                          ),
                        },
                        {
                          header: "Eligibility",
                          cell: (g) => (
                            <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                              <CheckCircle2 className="size-3.5" /> Eligible for Packing
                            </span>
                          ),
                        },
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
                                Add to Package
                              </Button>
                            ) : null,
                        },
                      ]}
                    />
                  </Section>
                </TabsContent>

                {/* Tab 2: Warehouse Stock */}
                <TabsContent value="stock" className="mt-4 space-y-6">
                  {!can.receiveStock(me) && (
                    <ScopeNote>
                      Warehouse bin operations are limited to warehouse personnel.
                    </ScopeNote>
                  )}

                  <Section
                    title="Packed Garments Awaiting Warehouse Receipt"
                    description="Move garments from the packaging station into physical storage bins."
                  >
                    <DataTable
                      rows={d.packedAwaitingReceipt}
                      rowKey={(g) => g.id}
                      empty="No packed garments awaiting warehouse receipt."
                      columns={[
                        {
                          header: "Garment",
                          cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                        },
                        { header: "Product", cell: (g) => g.productName },
                        {
                          header: "Package",
                          cell: (g) => (
                            <span className="wt-id font-mono text-xs">{g.packageId}</span>
                          ),
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
                                Receive into Bin
                              </Button>
                            ) : null,
                        },
                      ]}
                    />
                  </Section>

                  {/* Bin Topology Overview */}
                  <Section title="Warehouse Storage Bins">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {defaultBins.map((bin) => (
                        <div key={bin.id} className="rounded-lg border bg-card p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-primary">
                              {bin.id}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Cap: {bin.capacity}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{bin.label}</p>
                        </div>
                      ))}
                    </div>
                  </Section>

                  <Section
                    title="Finished Stock Inventory"
                    description="Garments currently stored in finished stock ready for outbound manifest allocation."
                  >
                    <DataTable
                      rows={d.inStock}
                      rowKey={(g) => g.id}
                      empty="No finished stock in warehouse."
                      columns={[
                        {
                          header: "Garment",
                          cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                        },
                        { header: "Product", cell: (g) => g.productName },
                        { header: "Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                        {
                          header: "Allocated Shipment",
                          cell: (g) =>
                            g.shipmentId ? (
                              <IdLink href={paths.shipment(g.shipmentId)} id={g.shipmentId} />
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                Unallocated
                              </span>
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

                {/* Tab 3: Packages */}
                <TabsContent value="packages" className="mt-4 space-y-6">
                  <Section
                    title="Packaging Cartons"
                    description="Active and sealed shipment packages."
                  >
                    <DataTable
                      rows={d.packages}
                      rowKey={(p) => p.id}
                      empty="No packages created yet."
                      columns={[
                        {
                          header: "Package ID",
                          cell: (p) => (
                            <span className="wt-id font-mono font-semibold">{p.id}</span>
                          ),
                        },
                        {
                          header: "Garments Count",
                          cell: (p) => (
                            <span className="text-xs font-medium">
                              {p.garmentIds.length} item{p.garmentIds.length !== 1 ? "s" : ""}
                            </span>
                          ),
                        },
                        {
                          header: "Item IDs",
                          cell: (p) => (
                            <span className="text-xs font-mono text-muted-foreground">
                              {p.garmentIds.join(", ") || "Empty"}
                            </span>
                          ),
                        },
                        { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
                        { header: "Created", cell: (p) => fmt.dateTime(p.createdAt) },
                        {
                          header: "Action",
                          cell: (p) =>
                            p.status === "open" && can.packGarment(me) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending || p.garmentIds.length === 0}
                                onClick={() =>
                                  void run((c) => c.sealPackage(p.id), `Package ${p.id} sealed.`)
                                }
                              >
                                Seal Package
                              </Button>
                            ) : null,
                        },
                      ]}
                    />
                  </Section>
                </TabsContent>
              </Tabs>
            </div>
          );
        }}
      </Loadable>
    </>
  );
}
