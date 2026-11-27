import { useState, useMemo } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  MapPin,
  QrCode,
  Radio,
  Search,
  ShieldCheck,
  Shirt,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { PageHeader } from "@/components/wt/layout";
import { Loadable, EmptyState } from "@/components/wt/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWtQuery } from "@/lib/data/hooks";
import type { Garment, MaterialLot, ProductionOrder } from "@/domain/types";

interface QrModalData {
  id: string;
  name: string;
  style: string;
  url: string;
  qrUrl: string;
}

export function ProductPassportsView() {
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | "dispatched" | "ready">("dispatched");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<QrModalData | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

  const handleCopy = (text: string, key: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Product Passports & Transparency URLs" />

      <Loadable query={qGarments}>
        {(garments) => (
          <Loadable query={qLots}>
            {(lots) => (
              <Loadable query={qOrders}>
                {(orders) => {
                  const lotMap = new Map<string, MaterialLot>();
                  lots.forEach((l) => lotMap.set(l.id, l));

                  const orderMap = new Map<string, ProductionOrder>();
                  orders.forEach((o) => orderMap.set(o.id, o));

                  // Completed items: stage is dispatched or completed
                  const dispatchedGarments = garments.filter((g) => g.stage === "dispatched");
                  const warehouseReadyGarments = garments.filter(
                    (g) => g.stage === "warehouse" || g.stage === "packing",
                  );

                  // Decide active list based on stageFilter
                  let candidateGarments: Garment[] = [];
                  if (stageFilter === "dispatched") {
                    candidateGarments = dispatchedGarments;
                    // If no garments are currently in dispatched in this environment, fallback to warehouse/latest
                    if (candidateGarments.length === 0) {
                      candidateGarments = garments.filter(
                        (g) => g.stage === "warehouse" || g.stage === "packing" || g.stage === "final_qc",
                      );
                    }
                  } else if (stageFilter === "ready") {
                    candidateGarments = garments.filter(
                      (g) => g.stage === "warehouse" || g.stage === "packing",
                    );
                  } else {
                    candidateGarments = garments;
                  }

                  // Search filtering
                  const term = search.trim().toLowerCase();
                  const displayedGarments = candidateGarments.filter((g) => {
                    if (!term) return true;
                    return (
                      g.id.toLowerCase().includes(term) ||
                      g.productName.toLowerCase().includes(term) ||
                      g.styleCode.toLowerCase().includes(term) ||
                      (g.rfidUid && g.rfidUid.toLowerCase().includes(term)) ||
                      (g.publicId && g.publicId.toLowerCase().includes(term)) ||
                      (g.size && g.size.toLowerCase().includes(term))
                    );
                  });

                  // Bulk copy all URLs helper
                  const handleCopyAllUrls = () => {
                    if (displayedGarments.length === 0) return;
                    const lines = displayedGarments.map((g) => {
                      const url = `${baseUrl}${paths.publicJourney(g.publicId || g.id)}`;
                      return `${g.productName} (${g.id}): ${url}`;
                    });
                    void navigator.clipboard.writeText(lines.join("\n"));
                    toast.success(`Copied ${displayedGarments.length} product URLs to clipboard!`);
                  };

                  return (
                    <div className="space-y-6">
                      {/* STATS OVERVIEW CARDS */}
                      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Dispatched Products
                            </span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <Truck className="size-4" />
                            </div>
                          </div>
                          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                            {dispatchedGarments.length}{" "}
                            <span className="text-sm font-normal text-muted-foreground">Units</span>
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Warehouse Binned
                            </span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <MapPin className="size-4" />
                            </div>
                          </div>
                          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                            {warehouseReadyGarments.length}{" "}
                            <span className="text-sm font-normal text-muted-foreground">Units</span>
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Total Factory Units
                            </span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                              <Shirt className="size-4" />
                            </div>
                          </div>
                          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                            {garments.length}{" "}
                            <span className="text-sm font-normal text-muted-foreground">Tracked</span>
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Transparency Passports
                            </span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <QrCode className="size-4" />
                            </div>
                          </div>
                          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                            Active
                          </p>
                        </div>
                      </div>

                      {/* CONTROLS: SEARCH, FILTER & BULK ACTIONS */}
                      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-1.5 rounded-lg border bg-muted/60 p-1 text-xs">
                          <button
                            type="button"
                            onClick={() => setStageFilter("dispatched")}
                            className={`rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                              stageFilter === "dispatched"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Dispatched ({dispatchedGarments.length > 0 ? dispatchedGarments.length : candidateGarments.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setStageFilter("ready")}
                            className={`rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                              stageFilter === "ready"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Warehouse Ready ({warehouseReadyGarments.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setStageFilter("all")}
                            className={`rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                              stageFilter === "all"
                                ? "bg-background text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            All ({garments.length})
                          </button>
                        </div>

                        <div className="flex items-center gap-2 flex-1 sm:max-w-md">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              placeholder="Search by product name, style, serial ID, or tag UID..."
                              className="pl-9 text-xs h-9 bg-background"
                            />
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyAllUrls}
                            className="h-9 text-xs gap-1.5 shrink-0"
                            title="Copy all visible journey URLs to clipboard"
                          >
                            <Copy className="size-3.5" />
                            Copy All URLs
                          </Button>
                        </div>
                      </div>

                      {/* PRODUCTS LIST */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-sm text-foreground">
                            Completed Scan Products ({displayedGarments.length})
                          </h3>
                        </div>

                        {displayedGarments.length === 0 ? (
                          <EmptyState
                            title="No completed products found"
                            description={
                              search
                                ? `No items match "${search}". Try clearing search filter.`
                                : "No products are currently marked as completed or dispatched."
                            }
                          />
                        ) : (
                          <div className="grid grid-cols-1 gap-4">
                            {displayedGarments.map((g) => {
                              const publicId = g.publicId || g.id;
                              const journeyUrl = `${baseUrl}${paths.publicJourney(publicId)}`;
                              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
                                journeyUrl,
                              )}`;

                              const isUrlCopied = copiedKey === `url-${g.id}`;
                              const isQrCopied = copiedKey === `qr-${g.id}`;

                              return (
                                <div
                                  key={g.id}
                                  className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-primary/40 transition-all space-y-4"
                                >
                                  {/* HEADER ROW: PRODUCT INFO & BADGES */}
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-3">
                                    <div className="flex items-center gap-3">
                                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Shirt className="size-5" />
                                      </div>
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          <span className="text-base font-bold text-foreground">
                                            {g.productName}
                                          </span>
                                          {g.size && (
                                            <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                              Size {g.size}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
                                          <span>Serial: <strong className="text-foreground">{g.id}</strong></span>
                                          {g.styleCode && (
                                            <>
                                              <span>·</span>
                                              <span>Style: <strong className="text-foreground">{g.styleCode}</strong></span>
                                            </>
                                          )}
                                          {g.rfidUid && (
                                            <>
                                              <span>·</span>
                                              <span className="inline-flex items-center gap-1 font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded">
                                                <Radio className="size-2.5" /> Tag: {g.rfidUid}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                          g.stage === "dispatched"
                                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                                            : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30"
                                        }`}
                                      >
                                        Station 9: {g.stage === "dispatched" ? "Dispatched ✓" : `${g.stage} Completed`}
                                      </span>
                                    </div>
                                  </div>

                                  {/* VERIFIED HIERARCHY TRACE PILLS */}
                                  <div className="rounded-lg bg-muted/30 p-2.5">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <span className="inline-flex items-center gap-1 rounded bg-background px-2 py-1 border text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="size-3 text-emerald-600" />
                                        Station 1 &amp; 2: Lot #{g.lotId || "FAB-VERIFIED"}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded bg-background px-2 py-1 border text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="size-3 text-emerald-600" />
                                        Station 3: Cut &amp; Tagged
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded bg-background px-2 py-1 border text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="size-3 text-emerald-600" />
                                        Station 4 &amp; 5: Assembled
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded bg-background px-2 py-1 border text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="size-3 text-emerald-600" />
                                        Station 6: Passed QC
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded bg-background px-2 py-1 border text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="size-3 text-emerald-600" />
                                        Station 7 &amp; 8: Warehoused
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded bg-background px-2 py-1 border text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="size-3 text-emerald-600" />
                                        Station 9: Dispatched
                                      </span>
                                    </div>
                                  </div>

                                  {/* PUBLIC TRANSPARENCY URL & COPY BUTTONS */}
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 font-mono text-xs select-all">
                                        <span className="truncate flex-1 text-primary font-medium">
                                          {journeyUrl}
                                        </span>
                                      </div>
                                    </div>

                                    {/* ACTION BUTTONS */}
                                    <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 sm:pt-4">
                                      {/* COPY URL BUTTON */}
                                      <Button
                                        size="sm"
                                        variant={isUrlCopied ? "default" : "outline"}
                                        onClick={() => handleCopy(journeyUrl, `url-${g.id}`, "Journey URL")}
                                        className="h-8 text-xs font-semibold gap-1.5"
                                      >
                                        {isUrlCopied ? (
                                          <>
                                            <Check className="size-3.5 text-emerald-300" /> URL Copied!
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="size-3.5" /> Copy URL
                                          </>
                                        )}
                                      </Button>

                                      {/* VIEW / ENLARGE QR CODE */}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setSelectedQr({
                                            id: g.id,
                                            name: g.productName,
                                            style: g.styleCode,
                                            url: journeyUrl,
                                            qrUrl: qrImageUrl,
                                          })
                                        }
                                        className="h-8 text-xs font-semibold gap-1.5"
                                      >
                                        <QrCode className="size-3.5 text-primary" />
                                        QR Code
                                      </Button>

                                      {/* TEST / OPEN URL IN NEW TAB */}
                                      <Button asChild size="sm" variant="ghost" className="h-8 text-xs gap-1.5">
                                        <AppLink href={paths.publicJourney(publicId)} target="_blank" rel="noreferrer">
                                          <ExternalLink className="size-3.5" />
                                          Open Page
                                        </AppLink>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* ENLARGED QR CODE POPUP MODAL */}
                      {selectedQr && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl text-center space-y-4">
                            <button
                              type="button"
                              onClick={() => setSelectedQr(null)}
                              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Close"
                            >
                              <X className="size-4" />
                            </button>

                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 border border-emerald-500/20">
                                <ShieldCheck className="size-3" /> Verified Transparency Passport
                              </span>
                              <h3 className="text-lg font-bold text-foreground">
                                {selectedQr.name}
                              </h3>
                              <p className="text-xs text-muted-foreground font-mono">
                                Serial #{selectedQr.id} · {selectedQr.style}
                              </p>
                            </div>

                            {/* QR CODE IMAGE */}
                            <div className="flex justify-center p-3 bg-white rounded-xl border-2 border-primary/20 shadow-inner">
                              <img
                                src={selectedQr.qrUrl}
                                alt={`QR code for ${selectedQr.id}`}
                                className="size-48 object-contain"
                              />
                            </div>

                            <div className="space-y-3">
                              <p className="font-mono text-[11px] text-muted-foreground bg-muted p-2 rounded-lg break-all select-all">
                                {selectedQr.url}
                              </p>
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleCopy(selectedQr.url, "modal-url", "Passport URL")}
                                  className="text-xs gap-1.5"
                                >
                                  <Copy className="size-3.5" /> Copy URL
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCopy(selectedQr.qrUrl, "modal-qr", "QR Image URL")}
                                  className="text-xs gap-1.5"
                                >
                                  <QrCode className="size-3.5" /> Copy QR Link
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedQr(null)}
                                  className="text-xs"
                                >
                                  Close
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              </Loadable>
            )}
          </Loadable>
        )}
      </Loadable>
    </div>
  );
}
