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

export function PlanOrderDialog({
  triggerLabel,
  onSuccess,
}: {
  triggerLabel?: React.ReactNode;
  onSuccess?: (orderId: string) => void;
} = {}) {
  const me = useMe();
  const { run } = useWtAction();
  const qSpecs = useWtQuery(["product-specs"], (c) => c.listProductSpecs());
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [product, setProduct] = useState("Linen camp-collar shirt");
  const [styleCode, setStyle] = useState("WT-SH-320");
  const [qty, setQty] = useState("4");
  const [dueDate, setDue] = useState("2026-12-15");
  const [autoApprove, setAutoApprove] = useState(true);

  const defaultTrigger = (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      <FilePlus2 className="size-4" /> Create Production Order
    </span>
  );

  return (
    <FormDialog
      trigger={triggerLabel ?? defaultTrigger}
      triggerVariant="default"
      title="Create Production Order"
      description="Orders are digital instructions authorizing garment manufacture. Orders have NO RFID cards; individual garment cards are bound at Cutting. Approved orders can immediately be issued fabric at Station 2."
      submitLabel="Create & Authorize Order"
      onSubmit={async () => {
        const id = await run(
          (c) => c.planOrder({ product, styleCode, qty: Number(qty), dueDate }),
          (orderId) => `${orderId} created successfully.`,
        );
        if (id) {
          const resolvedId = typeof id === "string" ? id : (id as any).orderId || String(id);
          if (autoApprove && can.approveOrder(me)) {
            await run((c) => c.approveOrder(resolvedId), `${resolvedId} approved and ready for fabric issue.`);
          }
          onSuccess?.(resolvedId);
          return true;
        }
        return false;
      }}
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

            {can.approveOrder(me) && (
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer rounded-md border border-primary/20 bg-primary/5 p-2.5">
                <input
                  type="checkbox"
                  checked={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary size-4"
                />
                <span>Approve immediately for production (ready for Station 2 fabric issue)</span>
              </label>
            )}

            <p className="text-xs text-muted-foreground pt-1">
              Note: Orders are digital instructions. Fabric bundle tags are linked at Station 2; garment RFID tags are bound at Station 3 (Cutting).
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
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Total Orders</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                      <Package className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{orders.length}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-success/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Approved / Active</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-success">{approvedCount}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-warning/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Pending Approval</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning group-hover:scale-105 transition-transform">
                      <Clock className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-warning">{pendingApproval}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-muted-foreground/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Planned Garments</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:scale-105 transition-transform">
                      <ClipboardCheck className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{totalPlanned} pcs</p>
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
                        {can.issueMaterial(me) && o.status === "approved" && (!o.lotCodes || o.lotCodes.length === 0) && (
                          <Button asChild size="sm" className="h-7 text-xs bg-primary">
                            <AppLink href={paths.workstation}>
                              Issue Fabric <ArrowRight className="size-3 ml-1" />
                            </AppLink>
                          </Button>
                        )}
                        {((o.lotCodes && o.lotCodes.length > 0) || (o.lotIds && o.lotIds.length > 0) || (o.issues && o.issues.length > 0)) && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="size-2.5" /> Fabric Issued
                          </span>
                        )}
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
