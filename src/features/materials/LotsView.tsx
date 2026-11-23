import { useState } from "react";
import { ArrowRight, CheckCircle2, Layers, PackagePlus, Radio, Tag } from "lucide-react";
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
import { useMe } from "@/features/shared/useMe";

export function ReceiveLotDialog({
  triggerLabel,
  onSuccess,
}: {
  triggerLabel?: string;
  onSuccess?: (lotId: string) => void;
}) {
  const { run } = useWtAction();
  const [material, setMaterial] = useState("Cotton poplin, natural white, 140 cm");
  const [supplierRef, setSupplierRef] = useState("SUP-REF-042");
  const [qty, setQty] = useState("25");
  const [unit, setUnit] = useState<"m" | "kg" | "pcs">("m");

  return (
    <FormDialog
      trigger={triggerLabel ?? "+ Log Fabric Delivery"}
      title="Log Incoming Raw Fabric Roll"
      submitLabel="Log Delivery Receipt"
      onSubmit={async () => {
        const id = await run(
          (c) => c.receiveLot({ material, supplierRef, qty: Number(qty), unit }),
          (r) => `${r} recorded.`,
        );
        if (id && onSuccess) {
          onSuccess(id);
        }
        return !!id;
      }}
    >
      <Field label="Cloth / Fabric material type" htmlFor="rl-mat" hint="e.g. Cotton twill, Denim, Poplin 140cm">
        <Input id="rl-mat" value={material} onChange={(e) => setMaterial(e.target.value)} />
      </Field>
      <Field label="Supplier reference / delivery slip" htmlFor="rl-sup">
        <Input id="rl-sup" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Received amount" htmlFor="rl-qty">
          <Input
            id="rl-qty"
            type="number"
            min="0.01"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Field>
        <Field label="Unit of measure" htmlFor="rl-unit">
          <NativeSelect
            id="rl-unit"
            value={unit}
            onChange={(v) => setUnit(v as "m" | "kg" | "pcs")}
            options={[
              { value: "m", label: "Meters (m)" },
              { value: "kg", label: "Kilograms (kg)" },
              { value: "pcs", label: "Pieces (pcs)" },
            ]}
          />
        </Field>
      </div>
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
        title="Material Lots & Fabric Register"
        description={
          me.username === "rawstore.demo" || me.department === "raw-store"
            ? undefined
            : "Physical raw fabric deliveries from suppliers. Newly received rolls arrive in quarantine (0 m stock balance) until cleared by qc.incoming. Only cleared rolls can be issued to production orders at Station 2."
        }
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Material lots" }]}
        actions={can.receiveLot(me) ? <ReceiveLotDialog /> : undefined}
      />

      <Loadable query={q}>
        {(lots) => {
          const totalReceived = lots.reduce((acc, l) => acc + l.receivedQty, 0);
          const totalBalance = lots.filter((l) => l.status === "accepted").reduce((acc, l) => acc + l.balanceQty, 0);
          const awaitingQc = lots.filter((l) => l.status === "awaiting-inspection").length;
          const assignedCards = lots.filter((l) => !!l.rfidUid).length;

          const rows = lots.filter(
            (l) =>
              (status === "all" || l.status === status) &&
              `${l.id} ${l.material} ${l.supplierRef} ${l.rfidUid ?? ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          );

          return (
            <div className="space-y-6">
              {/* Metric Overview Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Fabric Lots</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                      <Layers className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{lots.length}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-success/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Accepted Balance</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-success">{totalBalance.toFixed(1)} m</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-warning/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Lots Awaiting Inspection</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning group-hover:scale-105 transition-transform">
                      <PackagePlus className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-warning">{awaitingQc}</p>
                </div>
                <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-accent-foreground/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">RFID Tagged</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground group-hover:scale-105 transition-transform">
                      <Tag className="size-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{assignedCards} / {lots.length}</p>
                </div>
              </div>

              {/* Filters */}
              <FilterBar>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search lot ID, fabric material, supplier ref, or RFID UID"
                  label="Search lots"
                />
                <div className="w-full sm:w-48">
                  <NativeSelect
                    ariaLabel="Filter by status"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: "all", label: "All QC Statuses" },
                      { value: "awaiting-inspection", label: "Awaiting Inspection" },
                      { value: "accepted", label: "Accepted (Stock Eligible)" },
                      { value: "rejected", label: "Rejected" },
                    ]}
                  />
                </div>
              </FilterBar>

              <DataTable
                rows={rows}
                rowKey={(l) => l.id}
                empty="No fabric lots match the filter criteria."
                columns={[
                  {
                    header: "Lot Code",
                    cell: (l) => (
                      <div>
                        <IdLink href={paths.lot(l.id)} id={l.id} />
                        <p className="text-[11px] text-muted-foreground mt-0.5">{fmt.date(l.receivedAt)}</p>
                      </div>
                    ),
                  },
                  {
                    header: "Fabric Material",
                    cell: (l) => (
                      <div>
                        <p className="font-medium text-foreground text-xs sm:text-sm">{l.material}</p>
                        <p className="text-[11px] text-muted-foreground">Ref: {l.supplierRef}</p>
                      </div>
                    ),
                  },
                  {
                    header: "Stock Balance",
                    cell: (l) => {
                      const pct = Math.max(0, Math.min(100, Math.round((l.balanceQty / l.receivedQty) * 100)));
                      return (
                        <div className="space-y-1.5 min-w-[130px]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold tabular-nums text-foreground">{l.balanceQty} {l.unit ?? "m"}</span>
                            <span className="text-muted-foreground text-[11px]">of {l.receivedQty} {l.unit ?? "m"}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted/80 overflow-hidden shadow-inner">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                l.balanceQty > 0 ? "bg-gradient-to-r from-primary to-primary/80" : "bg-muted-foreground"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    header: "Active Bundle RFID",
                    cell: (l) => {
                      if (l.rfidUid) {
                        return (
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                            <Radio className="size-3" /> {l.rfidUid}
                          </span>
                        );
                      }
                      if (l.status === "accepted") {
                        return (
                          <span
                            className="inline-flex items-center text-xs text-muted-foreground italic bg-muted px-2 py-0.5 rounded"
                            title="Accepted via Dashboard QC · Hardware RFID card unassigned"
                          >
                            Unassigned (Dashboard Verified)
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          Card Pending (Station 1)
                        </span>
                      );
                    },
                  },
                  {
                    header: "Incoming QC",
                    cell: (l) => <StatusBadge status={l.status} />,
                  },
                  {
                    header: "Actions",
                    cell: (l) => (
                      <div className="flex items-center gap-1.5">
                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                          <AppLink href={paths.lot(l.id)}>
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
