import { useMemo, useState } from "react";
import { CheckCircle2, Clock, FileText, Filter, Plus, Search, Send, Truck } from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { Shipment, ShipmentStatus } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function PlanShipmentDialog() {
  const { run } = useWtAction();
  const [destination, setDest] = useState("Authorized retail network — East region");
  const [carrier, setCarrier] = useState("Regional carrier (synthetic)");
  const [plannedDate, setDate] = useState("2026-11-25");

  return (
    <FormDialog
      trigger="Plan New Shipment"
      title="Draft an Outbound Shipment"
      description="Create a shipment header. Garments and packages are added from the manifest page."
      submitLabel="Create Shipment Draft"
      onSubmit={async () =>
        !!(await run(
          (c) => c.planShipment({ destination, carrier, plannedDate }),
          (id) => `${id} drafted.`,
        ))
      }
    >
      <Field label="Destination / Retail Hub" htmlFor="ps-dest">
        <Input id="ps-dest" value={destination} onChange={(e) => setDest(e.target.value)} />
      </Field>
      <Field label="Carrier / Logistics Provider" htmlFor="ps-car">
        <Input id="ps-car" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
      </Field>
      <Field label="Target Planned Date" htmlFor="ps-date">
        <Input
          id="ps-date"
          type="date"
          value={plannedDate}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

export function ShipmentsView() {
  const me = useMe();
  const q = useWtQuery(["shipments"], (c) => c.listShipments());

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  return (
    <>
      <PageHeader
        title="Outbound Shipments"
        description="Outbound logistics manifests, garment dispatch verification, and departure clearance."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Shipments" }]}
        actions={can.planShipment(me) ? <PlanShipmentDialog /> : undefined}
      />

      <Loadable query={q}>
        {(rows) => {
          const drafts = rows.filter((s) => s.status === "draft").length;
          const planned = rows.filter((s) => s.status === "planned").length;
          const departed = rows.filter((s) => s.status === "departed").length;

          const filtered = rows.filter((s) => {
            if (activeTab !== "all" && s.status !== activeTab) return false;
            if (search.trim()) {
              const term = search.toLowerCase();
              const matchId = s.id.toLowerCase().includes(term);
              const matchDest = s.destination.toLowerCase().includes(term);
              const matchCar = s.carrier.toLowerCase().includes(term);
              if (!matchId && !matchDest && !matchCar) return false;
            }
            return true;
          });

          return (
            <div className="space-y-6">
              {/* Metrics */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Total Shipments
                    </span>
                    <Truck className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{rows.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">All outbound records</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">Drafting</span>
                    <FileText className="size-4 text-warning" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{drafts}</p>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting manager lock</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Planned / Armed
                    </span>
                    <Clock className="size-4 text-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{planned}</p>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting dock dispatch</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">Departed</span>
                    <CheckCircle2 className="size-4 text-success" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-success">{departed}</p>
                  <p className="text-xs text-muted-foreground mt-1">On retail network</p>
                </div>
              </div>

              {/* Tabs & Search */}
              <div className="space-y-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                    <TabsList className="flex h-auto flex-wrap">
                      <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
                      <TabsTrigger value="draft">Drafts ({drafts})</TabsTrigger>
                      <TabsTrigger value="planned">Planned ({planned})</TabsTrigger>
                      <TabsTrigger value="departed">Departed ({departed})</TabsTrigger>
                    </TabsList>

                    <div className="relative">
                      <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search destination, carrier, ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 pl-8 text-xs w-[200px] sm:w-[260px]"
                      />
                    </div>
                  </div>

                  <TabsContent value={activeTab} className="mt-3">
                    <DataTable
                      rows={filtered}
                      rowKey={(s) => s.id}
                      empty="No shipments match the filter."
                      columns={[
                        {
                          header: "Shipment ID",
                          cell: (s) => <IdLink href={paths.shipment(s.id)} id={s.id} />,
                        },
                        {
                          header: "Destination",
                          cell: (s) => <span className="font-medium text-xs">{s.destination}</span>,
                        },
                        {
                          header: "Carrier",
                          cell: (s) => (
                            <span className="text-xs text-muted-foreground">{s.carrier}</span>
                          ),
                        },
                        {
                          header: "Allocation Progress",
                          cell: (s) => {
                            const total = s.garmentIds.length;
                            const alloc = s.allocatedGarmentIds.length;
                            const pct = total > 0 ? Math.round((alloc / total) * 100) : 0;
                            return (
                              <div className="flex flex-col gap-1 min-w-[120px]">
                                <span className="text-xs font-medium">
                                  {alloc} / {total} garments ({pct}%)
                                </span>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${pct === 100 ? "bg-success" : "bg-primary"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          },
                        },
                        {
                          header: "Manifest Verified",
                          cell: (s) => {
                            const total = s.garmentIds.length;
                            const verified = s.verifiedGarmentIds?.length ?? 0;
                            return (
                              <span className="text-xs font-mono">
                                {verified} / {total} verified
                              </span>
                            );
                          },
                        },
                        { header: "Planned Date", cell: (s) => fmt.date(s.plannedDate) },
                        { header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
                        {
                          header: "Action",
                          cell: (s) => (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                              <IdLink href={paths.shipment(s.id)} id="Manifest" />
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          );
        }}
      </Loadable>
    </>
  );
}
