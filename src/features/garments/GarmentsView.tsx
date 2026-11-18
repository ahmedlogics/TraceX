import { useState } from "react";
import { paths } from "@/app/paths";
import { DataTable } from "@/components/wt/DataTable";
import { FilterBar, NativeSelect, SearchInput } from "@/components/wt/forms";
import { IdLink, PageHeader } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { LifecycleStage } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";

const stages: LifecycleStage[] = [
  "cutting",
  "stitching",
  "finishing",
  "final-qc",
  "rework",
  "packing",
  "warehouse",
  "allocated",
  "dispatched",
];

export function GarmentsView() {
  const q = useWtQuery(["garments"], (c) => c.listGarments());
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  return (
    <>
      <PageHeader
        title="Garments"
        description="Each garment has its own ID, history and quality disposition."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Garments" }]}
      />
      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search garment, order or product"
          label="Search garments"
        />
        <div className="w-full sm:w-44">
          <NativeSelect
            ariaLabel="Filter by stage"
            value={stage}
            onChange={setStage}
            options={[
              { value: "all", label: "All stages" },
              ...stages.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>
      </FilterBar>
      <Loadable query={q}>
        {(gs) => (
          <DataTable
            rows={gs.filter(
              (g) =>
                (stage === "all" || g.stage === stage) &&
                `${g.id} ${g.orderId} ${g.productName}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )}
            rowKey={(g) => g.id}
            columns={[
              { header: "Garment", cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} /> },
              {
                header: "RFID Card",
                cell: (g) =>
                  g.rfidUid ? (
                    <span className="wt-id font-mono text-xs">{g.rfidUid}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">Unbound</span>
                  ),
              },
              { header: "RFID Card", cell: (g) => g.rfidUid ? <span className="wt-id font-mono text-xs">{g.rfidUid}</span> : <span className="text-muted-foreground text-xs italic">Unbound</span> },
              { header: "Product", cell: (g) => g.productName },
              { header: "Stage", cell: (g) => <StatusBadge status={g.stage} /> },
              {
                header: "Quality",
                cell: (g) => (
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={g.disposition} />
                    {g.hold && <HoldBadge />}
                  </div>
                ),
              },
              { header: "Order", cell: (g) => <span className="wt-id">{g.orderId}</span> },
            ]}
          />
        )}
      </Loadable>
    </>
  );
}
