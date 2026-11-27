import { useState, useMemo } from "react";
import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Check,
  Filter,
  MapPin,
  Package,
  PackageCheck,
  Radio,
  Search,
  Shirt,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { paths } from "@/app/paths";
import { PageHeader } from "@/components/wt/layout";
import { Loadable, EmptyState, LoadingState } from "@/components/wt/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/wt/forms";
import { useWtQuery } from "@/lib/data/hooks";
import type { Garment, Package as PackageType } from "@/domain/types";

export function WarehouseLocatorView() {
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  const [search, setSearch] = useState("");
  const [selectedBin, setSelectedBin] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedPackages, setExpandedPackages] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`Copied: ${text}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedPackages((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Storage Locator"
        description="Search and locate products, master boxes, and garment serials placed across warehouse storage bins."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Warehouse Locator" }]}
      />

      <Loadable query={qFulfilment}>
        {(fulfilment) => (
          <Loadable query={qGarments}>
            {(garments) => {
              const packages = fulfilment.packages || [];

              // Map of garment by ID
              const garmentMap = new Map<string, Garment>();
              garments.forEach((g) => garmentMap.set(g.id, g));

              // Extract all known bins
              const binSet = new Set<string>();
              packages.forEach((p) => {
                if (p.binId) binSet.add(p.binId);
              });
              garments.forEach((g) => {
                if ((g as any).binId) binSet.add((g as any).binId);
              });
              const allBins = Array.from(binSet).sort();

              // Metrics
              const storedPackages = packages.filter((p) => p.status === "warehoused" || Boolean(p.binId));
              const pendingIntakePackages = packages.filter((p) => p.status === "sealed" && !p.binId);
              const warehousedGarments = garments.filter(
                (g) => g.stage === "warehouse" || g.stage === "dispatched" || Boolean(g.packageId),
              );

              // Enrich each package with its garments
              const enrichedPackages = packages.map((pkg) => {
                const linkedGarments = (pkg.garmentIds || [])
                  .map((id) => garmentMap.get(id))
                  .filter(Boolean) as Garment[];

                // Unique products in this box
                const products = Array.from(
                  new Set(linkedGarments.map((g) => `${g.productName} (${g.styleCode})`)),
                );

                return {
                  ...pkg,
                  linkedGarments,
                  products,
                  resolvedBin: pkg.binId || "Unassigned",
                };
              });

              // Filtering
              const query = search.trim().toLowerCase();
              const filteredPackages = enrichedPackages.filter((pkg) => {
                // Bin filter
                if (selectedBin !== "all") {
                  if (selectedBin === "unassigned") {
                    if (pkg.binId) return false;
                  } else if (pkg.resolvedBin !== selectedBin) {
                    return false;
                  }
                }

                // Status filter
                if (statusFilter !== "all") {
                  if (statusFilter === "warehoused" && pkg.status !== "warehoused" && !pkg.binId) {
                    return false;
                  }
                  if (statusFilter === "sealed" && (pkg.status !== "sealed" || Boolean(pkg.binId))) {
                    return false;
                  }
                  if (statusFilter === "dispatched" && pkg.status !== "dispatched") {
                    return false;
                  }
                }

                // Search query
                if (!query) return true;

                const matchBoxId = pkg.id.toLowerCase().includes(query);
                const matchTagUid = pkg.rfidUid?.toLowerCase().includes(query) ?? false;
                const matchBin = pkg.resolvedBin.toLowerCase().includes(query);
                const matchProducts = pkg.products.some((p) => p.toLowerCase().includes(query));
                const matchGarments = pkg.linkedGarments.some(
                  (g) =>
                    g.id.toLowerCase().includes(query) ||
                    (g.rfidUid && g.rfidUid.toLowerCase().includes(query)) ||
                    g.productName.toLowerCase().includes(query) ||
                    g.styleCode.toLowerCase().includes(query),
                );

                return matchBoxId || matchTagUid || matchBin || matchProducts || matchGarments;
              });

              // Individual garments matching query directly (Quick Product Finder)
              const matchedGarments = query
                ? garments.filter((g) => {
                    const match =
                      g.id.toLowerCase().includes(query) ||
                      (g.rfidUid && g.rfidUid.toLowerCase().includes(query)) ||
                      g.productName.toLowerCase().includes(query) ||
                      g.styleCode.toLowerCase().includes(query);
                    return match;
                  })
                : [];

              return (
                <div className="space-y-6">
                  {/* METRIC OVERVIEW CARDS */}
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Warehoused Cartons
                        </span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <PackageCheck className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {storedPackages.length} <span className="text-sm font-normal text-muted-foreground">Boxes</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Placed in designated warehouse storage bins
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Units in Storage
                        </span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          <Shirt className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {warehousedGarments.length} <span className="text-sm font-normal text-muted-foreground">Units</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Finished products stored in master cartons
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Active Storage Bins
                        </span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          <MapPin className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {allBins.length} <span className="text-sm font-normal text-muted-foreground">Locations</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Racks &amp; storage bins actively populated
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Pending Intake
                        </span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Clock className="size-4" />
                        </div>
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        {pendingIntakePackages.length} <span className="text-sm font-normal text-muted-foreground">Boxes</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Awaiting Station 8 storage scan &amp; bin placement
                      </p>
                    </div>
                  </div>

                  {/* SEARCH AND LOCATION FILTER CONTROLS */}
                  <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by product name, style code, garment ID, box tag UID, or bin (e.g. BIN-A1)..."
                        className="pl-9 text-xs h-9 bg-background"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-44">
                        <NativeSelect
                          ariaLabel="Filter by Storage Bin"
                          value={selectedBin}
                          onChange={setSelectedBin}
                          options={[
                            { value: "all", label: "All Storage Bins" },
                            ...allBins.map((bin) => ({
                              value: bin,
                              label: `📍 ${bin}`,
                            })),
                            { value: "unassigned", label: "Pending Bin Placement" },
                          ]}
                        />
                      </div>

                      <div className="w-40">
                        <NativeSelect
                          ariaLabel="Filter by Status"
                          value={statusFilter}
                          onChange={setStatusFilter}
                          options={[
                            { value: "all", label: "All Statuses" },
                            { value: "warehoused", label: "Warehoused in Bin" },
                            { value: "sealed", label: "Packed / Unbinned" },
                            { value: "dispatched", label: "Dispatched" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  {/* INSTANT PRODUCT/GARMENT FINDER CALLOUT IF SEARCH ACTIVE */}
                  {query && matchedGarments.length > 0 && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-sm text-primary">
                        <Sparkles className="size-4" />
                        Instant Garment Search Result ({matchedGarments.length} matching units)
                      </div>
                      <div className="divide-y rounded-lg border bg-card overflow-hidden">
                        {matchedGarments.slice(0, 5).map((g) => {
                          const parentPkg = packages.find(
                            (p) => p.garmentIds?.includes(g.id) || p.id === g.packageId,
                          );
                          const locationBin = parentPkg?.binId || (g as any).binId || "Awaiting Binning";

                          return (
                            <div
                              key={g.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 text-xs gap-2 hover:bg-muted/30"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground wt-id">{g.id}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="font-semibold text-foreground">{g.productName}</span>
                                  {g.size && (
                                    <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                                      Size {g.size}
                                    </span>
                                  )}
                                  <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                                    {g.styleCode}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                  {g.rfidUid && (
                                    <span>
                                      Tag UID: <strong className="font-mono text-foreground">{g.rfidUid}</strong>
                                    </span>
                                  )}
                                  {parentPkg && (
                                    <span>
                                      Carton Box: <strong className="text-foreground">{parentPkg.id}</strong> (Tag: {parentPkg.rfidUid || "N/A"})
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                  <MapPin className="size-3.5" />
                                  Storage Location: {locationBin}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {matchedGarments.length > 5 && (
                        <p className="text-[11px] text-muted-foreground text-center">
                          Showing top 5 of {matchedGarments.length} matching units. Narrow search term for specific serial.
                        </p>
                      )}
                    </div>
                  )}

                  {/* MASTER CARTONS AND WAREHOUSE BINS LIST */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-foreground">
                        Warehouse Boxes &amp; Storage Bins ({filteredPackages.length})
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Each carton displays its storage bin placement, master RFID tag, and enclosed products.
                      </span>
                    </div>

                    {filteredPackages.length === 0 ? (
                      <EmptyState
                        title="No warehouse boxes found"
                        description={
                          search
                            ? `No cartons or products match "${search}". Try searching by garment ID or storage bin.`
                            : "No master boxes are currently registered in warehouse inventory."
                        }
                      />
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {filteredPackages.map((pkg) => {
                          const isExpanded = Boolean(expandedPackages[pkg.id]);
                          const hasBin = Boolean(pkg.binId);

                          return (
                            <div
                              key={pkg.id}
                              className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-primary/30 transition-all space-y-4"
                            >
                              {/* TOP BAR: STORAGE BIN BADGE + BOX ID */}
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Package className="size-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-base font-bold text-foreground">Box #{pkg.id}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(pkg.id, `box-${pkg.id}`)}
                                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                                        title="Copy Box ID"
                                      >
                                        {copiedId === `box-${pkg.id}` ? (
                                          <Check className="size-3.5 text-emerald-600" />
                                        ) : (
                                          <Copy className="size-3.5" />
                                        )}
                                      </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Master Box Tag UID:{" "}
                                      <span className="font-mono font-semibold text-foreground">
                                        {pkg.rfidUid || "Unassigned"}
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                {/* STORAGE LOCATION CALLOUT BADGE */}
                                <div className="flex items-center gap-2">
                                  {hasBin ? (
                                    <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                      <MapPin className="size-4 shrink-0" />
                                      <span>Storage Area: {pkg.binId}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                                      <Clock className="size-4 shrink-0" />
                                      <span>Awaiting Station 8 Storage Scan</span>
                                    </div>
                                  )}
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                                      pkg.status === "warehoused"
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                        : pkg.status === "dispatched"
                                        ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {pkg.status}
                                  </span>
                                </div>
                              </div>

                              {/* PRODUCTS CONTAINED IN THIS BOX */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-foreground">
                                    Enclosed Products ({pkg.linkedGarments.length} units total):
                                  </span>
                                  <span className="text-muted-foreground">
                                    Packaged by {pkg.packedBy || "Logistics"}
                                  </span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {pkg.products.map((prod, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                                    >
                                      <Shirt className="size-3 text-muted-foreground" />
                                      {prod}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* EXPANDABLE GARMENT SERIALS LIST */}
                              <div className="border-t pt-3">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleExpand(pkg.id)}
                                  className="h-7 text-xs font-semibold gap-1 text-primary hover:text-primary/90"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronDown className="size-3.5" /> Hide Enclosed Garment Serials
                                    </>
                                  ) : (
                                    <>
                                      <ChevronRight className="size-3.5" /> View Enclosed Garment Serials ({pkg.linkedGarments.length})
                                    </>
                                  )}
                                </Button>

                                {isExpanded && (
                                  <div className="mt-3 divide-y rounded-lg border bg-muted/20 overflow-hidden text-xs">
                                    {pkg.linkedGarments.map((g) => (
                                      <div
                                        key={g.id}
                                        className="flex flex-wrap items-center justify-between p-2.5 gap-2 hover:bg-muted/40"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-foreground wt-id">{g.id}</span>
                                          <span className="text-muted-foreground">·</span>
                                          <span className="font-medium text-foreground">{g.productName}</span>
                                          {g.size && (
                                            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                                              Size {g.size}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {g.rfidUid && (
                                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                              <Radio className="size-3" /> {g.rfidUid}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-muted-foreground uppercase">
                                            Stage: {g.stage}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          </Loadable>
        )}
      </Loadable>
    </div>
  );
}
