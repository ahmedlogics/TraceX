import { useState } from "react";
import { ArrowRight, CheckCircle2, Clock, OctagonAlert, Package, Radio, Scissors, Tag } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
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
  const [disposition, setDisposition] = useState("all");

  return (
    <>
      <PageHeader
        title="Garment Registry & Production Status"
        description="Every physical product is individually tracked with its own permanent ID, assigned RFID card, and unbroken fabric lineage."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Garments" }]}
      />

      <Loadable query={q}>
        {(gs) => {
          const inAssembly = gs.filter((g) => g.stage === "stitching" || g.stage === "finishing").length;
          const awaitingQc = gs.filter((g) => g.disposition === "awaiting-inspection" || g.disposition === "not-inspected").length;
          const heldCount = gs.filter((g) => !!g.hold).length;
          const releasedCount = gs.filter((g) => g.disposition === "released").length;

          const rows = gs.filter((g) => {
            const matchesStage = stage === "all" || g.stage === stage;
            const matchesDisp =
              disposition === "all" ||
              (disposition === "held" ? !!g.hold : g.disposition === disposition);
            const matchesSearch =
              search.trim() === "" ||
              `${g.id} ${g.orderId} ${g.productName} ${g.rfidUid ?? ""} ${g.publicId}`
                .toLowerCase()
                .includes(search.toLowerCase());
            return matchesStage && matchesDisp && matchesSearch;
          });

          return (
            <div className="space-y-6">
              {/* Metric Overview Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Tag className="size-4 text-primary" />
                    <span className="text-xs font-medium">Total Garments</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold">{gs.length}</p>
                </div>
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Scissors className="size-4 text-accent-foreground" />
                    <span className="text-xs font-medium">In Assembly</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-primary">{inAssembly}</p>
                </div>
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success" />
                    <span className="text-xs font-medium">QC Released</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-success">{releasedCount}</p>
                </div>
                <div className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <OctagonAlert className="size-4 text-destructive" />
                    <span className="text-xs font-medium">Quality Holds</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-destructive">{heldCount}</p>
                </div>
              </div>

              {/* Filter Bar */}
              <FilterBar>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search garment ID, RFID card, order, or product"
                  label="Search garments"
                />
                <div className="w-full sm:w-44">
                  <NativeSelect
                    ariaLabel="Filter by physical stage"
                    value={stage}
                    onChange={setStage}
                    options={[
                      { value: "all", label: "All Physical Stages" },
                      ...stages.map((s) => ({ value: s, label: `Stage: ${s}` })),
                    ]}
                  />
                </div>
                <div className="w-full sm:w-44">
                  <NativeSelect
                    ariaLabel="Filter by quality disposition"
                    value={disposition}
                    onChange={setDisposition}
                    options={[
                      { value: "all", label: "All Quality States" },
                      { value: "released", label: "Released Only" },
                      { value: "held", label: "On Hold Only" },
                      { value: "awaiting-inspection", label: "Awaiting Inspection" },
                      { value: "not-inspected", label: "Not Inspected" },
                    ]}
                  />
                </div>
              </FilterBar>

              <DataTable
                rows={rows}
                rowKey={(g) => g.id}
                empty="No garments match the selected filters."
                columns={[
                  {
                    header: "Garment Code",
                    cell: (g) => (
                      <div>
                        <IdLink href={paths.garment(g.id)} id={g.id} />
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{g.publicId}</p>
                      </div>
                    ),
                  },
                  {
                    header: "Product Specification",
                    cell: (g) => (
                      <div>
                        <p className="font-medium text-foreground text-xs sm:text-sm">{g.productName}</p>
                        {g.size && (
                          <span className="inline-flex rounded bg-muted px-1.5 py-0.2 text-[11px] font-medium text-muted-foreground mt-0.5">
                            Size {g.size}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: "Active RFID Card",
                    cell: (g) =>
                      g.rfidUid ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                          <Radio className="size-3" /> {g.rfidUid}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic bg-muted px-2 py-0.5 rounded">
                          Unassigned
                        </span>
                      ),
                  },
                  {
                    header: "Production Order",
                    cell: (g) => (
                      <AppLink href={paths.order(g.orderId)} className="wt-id text-xs hover:underline">
                        {g.orderId}
                      </AppLink>
                    ),
                  },
                  { header: "Physical Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                  {
                    header: "Quality Disposition",
                    cell: (g) => (
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={g.disposition} />
                        {g.hold && <HoldBadge />}
                      </div>
                    ),
                  },
                  {
                    header: "Actions",
                    cell: (g) => (
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                        <AppLink href={paths.garment(g.id)}>
                          View <ArrowRight className="size-3 ml-1" />
                        </AppLink>
                      </Button>
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
