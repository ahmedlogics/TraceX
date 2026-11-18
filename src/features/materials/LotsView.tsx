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
import { useAppNavigate } from "@/app/navigation";

function ReceiveLotDialog() {
  const { run } = useWtAction();
  const navigate = useAppNavigate();
  const [material, setMaterial] = useState("Cotton twill, navy, 150 cm");
  const [supplierRef, setSupplierRef] = useState("SUP-REF-031 (synthetic)");
  const [qty, setQty] = useState("60");
  return (
    <FormDialog
      trigger="Receive lot"
      title="Receive a fabric lot"
      description="A lot is received once. It then waits for a lot-level incoming inspection."
      submitLabel="Record receipt"
      onSubmit={async () => {
        const id = await run(
          (c) => c.receiveLot({ material, supplierRef, qty: Number(qty) }),
          (r) => `${r} received.`,
        );
        if (id) void navigate(paths.lot(id));
        return !!id;
      }}
    >
      <Field label="Material" htmlFor="rl-mat">
        <Input id="rl-mat" value={material} onChange={(e) => setMaterial(e.target.value)} />
      </Field>
      <Field label="Supplier reference" htmlFor="rl-sup">
        <Input id="rl-sup" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
      </Field>
      <Field label="Quantity (m)" htmlFor="rl-qty">
        <Input
          id="rl-qty"
          type="number"
          min="0"
          step="0.1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

export function LotsView() {
  const me = useMe();
  const q = useWtQuery(["lots"], (c) => c.listLots());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  return (
    <>
      <PageHeader
        title="Material lots"
        description="Fabric register. Incoming QC is a lot-level decision."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Material lots" }]}
        actions={can.receiveLot(me) ? <ReceiveLotDialog /> : undefined}
      />
      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search lot or material"
          label="Search lots"
        />
        <div className="w-full sm:w-48">
          <NativeSelect
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All statuses" },
              { value: "awaiting-inspection", label: "Awaiting inspection" },
              { value: "accepted", label: "Accepted" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
        </div>
      </FilterBar>
      <Loadable query={q}>
        {(lots) => (
          <DataTable
            rows={lots.filter(
              (l) =>
                (status === "all" || l.status === status) &&
                `${l.id} ${l.material}`.toLowerCase().includes(search.toLowerCase()),
            )}
            rowKey={(l) => l.id}
            columns={[
              { header: "Lot", cell: (l) => <IdLink href={paths.lot(l.id)} id={l.id} /> },
              { header: "Material", cell: (l) => l.material },
              { header: "Received", cell: (l) => fmt.date(l.receivedAt) },
              {
                header: "Balance",
                cell: (l) => (
                  <span className="tabular-nums">
                    {l.balanceQty} / {l.receivedQty} {l.unit ?? "m"}
                  </span>
                ),
              },
              {
                header: "RFID Card",
                cell: (l) =>
                  l.rfidUid ? (
                    <span className="wt-id font-mono text-xs">{l.rfidUid}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">Unassigned</span>
                  ),
              },
              { header: "Incoming QC", cell: (l) => <StatusBadge status={l.status} /> },
            ]}
          />
        )}
      </Loadable>
    </>
  );
}
