import { useState } from "react";
import { paths } from "@/app/paths";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FilterBar, FormDialog, NativeSelect, SearchInput } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function PlanOrderDialog() {
  const { run } = useWtAction();
  const [product, setProduct] = useState("Linen camp-collar shirt");
  const [styleCode, setStyle] = useState("WT-SH-320");
  const [qty, setQty] = useState("6");
  const [dueDate, setDue] = useState("2026-12-15");
  return (
    <FormDialog
      trigger="Plan order"
      title="Plan a production order"
      submitLabel="Create order"
      onSubmit={async () => !!(await run((c) => c.planOrder({ product, styleCode, qty: Number(qty), dueDate }), (id) => `${id} planned.`))}
    >
      <Field label="Product" htmlFor="po-p"><Input id="po-p" value={product} onChange={(e) => setProduct(e.target.value)} /></Field>
      <Field label="Style code" htmlFor="po-s"><Input id="po-s" value={styleCode} onChange={(e) => setStyle(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" htmlFor="po-q"><Input id="po-q" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Due date" htmlFor="po-d"><Input id="po-d" type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
    </FormDialog>
  );
}

export function OrdersView() {
  const me = useMe();
  const q = useWtQuery(["orders"], (c) => c.listOrders());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  return (
    <>
      <PageHeader
        title="Production orders"
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Production orders" }]}
        actions={can.planOrder(me) ? <PlanOrderDialog /> : undefined}
      />
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search order or product" label="Search orders" />
        <div className="w-full sm:w-44">
          <NativeSelect ariaLabel="Filter by status" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "planned", label: "Planned" }, { value: "in-progress", label: "In progress" }, { value: "completed", label: "Completed" }]} />
        </div>
      </FilterBar>
      <Loadable query={q}>
        {(orders) => (
          <DataTable
            rows={orders.filter((o) => (status === "all" || o.status === status) && `${o.id} ${o.product} ${o.styleCode}`.toLowerCase().includes(search.toLowerCase()))}
            rowKey={(o) => o.id}
            columns={[
              { header: "Order", cell: (o) => <IdLink href={paths.order(o.id)} id={o.id} /> },
              { header: "Product", cell: (o) => <div>{o.product}<p className="wt-id text-muted-foreground">{o.styleCode}</p></div> },
              { header: "Qty", cell: (o) => o.plannedQty },
              { header: "Due", cell: (o) => fmt.date(o.dueDate) },
              { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
            ]}
          />
        )}
      </Loadable>
    </>
  );
}
