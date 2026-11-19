import { useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock, FilePlus2, Package } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FilterBar, FormDialog, NativeSelect, SearchInput } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useDirectory, UserName } from "@/features/shared/directory";
import { useMe } from "@/features/shared/useMe";

function PlanOrderDialog() {
  const { run } = useWtAction();
  const qSpecs = useWtQuery(["product-specs"], (c) => c.listProductSpecs());
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [product, setProduct] = useState("Linen camp-collar shirt");
  const [styleCode, setStyle] = useState("WT-SH-320");
  const [qty, setQty] = useState("4");
  const [dueDate, setDue] = useState("2026-12-15");

  return (
    <FormDialog
      trigger="Plan production order"
      title="Plan a Production Order"
      description="Orders are digital instructions authorizing garment manufacture. Orders have NO RFID cards; individual garment cards are bound at Cutting."
      submitLabel="Create production order"
      onSubmit={async () =>
        !!(await run(
          (c) => c.planOrder({ product, styleCode, qty: Number(qty), dueDate }),
          (id) => `${id} planned successfully.`,
        ))
      }
    >
      <Loadable query={qSpecs}>
        {(specs) => (
          <div className="space-y-4">
            {specs.length > 0 && (
              <Field label="Approved product specification template" htmlFor="po-spec" hint="Select a spec to auto-fill product and style code">
                <NativeSelect
                  id="po-spec"
                  value={selectedSpecId}
                  onChange={(v) => {
                    setSelectedSpecId(v);
                    const matched = specs.find((s) => s.id === v);
                    if (matched) {
                      setProduct(matched.name);
                      setStyle(matched.styleCode);
                    }
                  }}
                  options={[
                    { value: "", label: "-- Custom / Manual Entry --" },
                    ...specs.map((s) => ({ value: s.id, label: `${s.name} (${s.styleCode}) · ~${s.standardConsumptionMeters}m` })),
                  ]}
                />
              </Field>
            )}

            <Field label="Product name" htmlFor="po-p" hint="Canonical garment model name">
              <Input id="po-p" value={product} onChange={(e) => setProduct(e.target.value)} />
            </Field>

            <Field label="Style code" htmlFor="po-s" hint="e.g. WT-SH-100 or WT-TR-200">
              <Input id="po-s" value={styleCode} onChange={(e) => setStyle(e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned quantity (pieces)" htmlFor="po-q">
                <Input
                  id="po-q"
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </Field>
              <Field label="Target completion date" htmlFor="po-d">
                <Input id="po-d" type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} />
              </Field>
            </div>

            {selectedSpecId && (() => {
              const matched = specs.find((s) => s.id === selectedSpecId);
              if (!matched) return null;
              const estFabric = Math.round(matched.standardConsumptionMeters * Number(qty) * 10) / 10;
              return (
                <div className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Fabric Consumption Estimate:</p>
                  <p>Standard rate: <span className="font-semibold">{matched.standardConsumptionMeters} m</span> per piece</p>
                  <p>Total raw fabric required: <span className="font-semibold text-primary">{estFabric} m</span> ({matched.category})</p>
                </div>
              );
            })()}

            <p className="text-xs text-muted-foreground pt-1">
              Note: Factory managers approve planned orders before fabric can be issued at Station 2.
            </p>
          </div>
        )}
      </Loadable>
    </FormDialog>
  );
}

export function OrdersView() {
  const me = useMe();
  const q = useWtQuery(["orders"], (c) => c.listOrders());
  const { run, pending } = useWtAction();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  return (
    <>
      <PageHeader
        title="Production Orders & Planning"
        description="Digital manufacturing authorizations. Approved orders allow fabric issue from accepted lots and cutting output creation."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Production orders" }]}
        actions={can.planOrder(me) ? <PlanOrderDialog /> : undefined}
      />

      <Loadable query={q}>
        {(orders) => {
          const totalPlanned = orders.reduce((acc, o) => acc + o.plannedQty, 0);
          const approvedCount = orders.filter((o) => o.status === "approved" || o.status === "in-progress").length;
          const pendingApproval = orders.filter((o) => o.status === "planned" || o.status === "draft").length;
          const completedCount = orders.filter((o) => o.status === "completed").length;

          const rows = orders.filter(
            (o) =>
              (status === "all" || o.status === status) &&
              `${o.id} ${o.product} ${o.styleCode}`.toLowerCase().includes(search.toLowerCase()),
          );

          return (
            <div className="space-y-6">
              {/* Metric Overview Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="size-4 text-primary" />
                    <span className="text-xs font-medium">Total Orders</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold">{orders.length}</p>
                </div>
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success" />
                    <span className="text-xs font-medium">Approved / In Progress</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-success">{approvedCount}</p>
                </div>
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="size-4 text-warning" />
                    <span className="text-xs font-medium">Pending Approval</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-warning">{pendingApproval}</p>
                </div>
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ClipboardCheck className="size-4 text-muted-foreground" />
                    <span className="text-xs font-medium">Planned Garments</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold">{totalPlanned} pcs</p>
                </div>
              </div>

              {/* Filters */}
              <FilterBar>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search order ID, product name, or style code"
                  label="Search orders"
                />
                <div className="w-full sm:w-44">
                  <NativeSelect
                    ariaLabel="Filter by status"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: "all", label: "All Statuses" },
                      { value: "approved", label: "Approved" },
                      { value: "in-progress", label: "In Progress" },
                      { value: "planned", label: "Planned (Pending)" },
                      { value: "completed", label: "Completed" },
                      { value: "draft", label: "Draft" },
                    ]}
                  />
                </div>
              </FilterBar>

              <DataTable
                rows={rows}
                rowKey={(o) => o.id}
                empty="No production orders match the filter."
                columns={[
                  {
                    header: "Order Code",
                    cell: (o) => (
                      <div>
                        <IdLink href={paths.order(o.id)} id={o.id} />
                        <p className="text-[11px] text-muted-foreground mt-0.5">Due {fmt.date(o.dueDate)}</p>
                      </div>
                    ),
                  },
                  {
                    header: "Product Specification",
                    cell: (o) => (
                      <div>
                        <p className="font-semibold text-foreground text-xs sm:text-sm">{o.product}</p>
                        <p className="wt-id font-mono text-[11px] text-muted-foreground">{o.styleCode}</p>
                      </div>
                    ),
                  },
                  {
                    header: "Planned Output",
                    cell: (o) => <span className="font-semibold tabular-nums">{o.plannedQty} pcs</span>,
                  },
                  {
                    header: "Approval State",
                    cell: (o) => <StatusBadge status={o.status} />,
                  },
                  {
                    header: "Planner / Approver",
                    cell: (o) => (
                      <div className="text-xs text-muted-foreground">
                        <p>Plan: <UserName id={o.plannedBy} /></p>
                        {o.approvedBy && <p>Appr: <UserName id={o.approvedBy} /></p>}
                      </div>
                    ),
                  },
                  {
                    header: "Actions",
                    cell: (o) => (
                      <div className="flex items-center gap-1.5">
                        {can.approveOrder(me) && (o.status === "planned" || o.status === "draft") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={pending}
                            onClick={() =>
                              void run((c) => c.approveOrder(o.id), `${o.id} approved for production.`)
                            }
                          >
                            <CheckCircle2 className="size-3 mr-1 text-success" /> Approve
                          </Button>
                        )}
                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                          <AppLink href={paths.order(o.id)}>
                            View <ArrowRight className="size-3 ml-1" />
                          </AppLink>
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          );
        }}
      </Loadable>
    </>
  );
}
