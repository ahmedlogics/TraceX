import { useState, useEffect } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  Info,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { Garment } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";

const STORAGE_KEY = "weartrail_nfc_tunnel_url";

export function NfcHubView() {
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  // Local state for the tunnel base URL (defaults to origin or saved localtunnel)
  const [tunnelUrl, setTunnelUrl] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
      return window.location.origin;
    }
    return "http://localhost:5173";
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedQrGarment, setSelectedQrGarment] = useState<{
    id: string;
    code: string;
    name: string;
    url: string;
  } | null>(null);
  const [search, setSearch] = useState("");

  const handleSaveTunnel = (url: string) => {
    const clean = url.trim().replace(/\/+$/, "");
    setTunnelUrl(clean);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, clean);
    }
    toast.success("NFC Base URL updated!");
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Link copied! Paste directly into NFC Tools app.");
    setTimeout(() => setCopiedId(null), 2500);
  };

  const getGarmentPassportUrl = (g: Garment) => {
    const targetIdentifier = (g as any).code || g.publicId || g.id;
    const base = tunnelUrl.trim().replace(/\/+$/, "");
    return `${base}/p/${encodeURIComponent(targetIdentifier)}`;
  };

  return (
    <div className="space-y-6">
      {/* Configuration & Localtunnel Banner */}
      <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Zap className="size-3.5 fill-primary" />
              NFC Tag Programming & Localtunnel Hub
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Mobile Digital Passport Dispatcher
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm leading-relaxed">
              Generate live URLs for all finished factory garments. If presenting locally on your
              laptop, run <code className="bg-muted px-1.5 py-0.5 rounded font-mono font-bold text-foreground">npx localtunnel --port 5173</code> to give your phone an instant live HTTPS link, then write it to your tag with the <strong>NFC Tools</strong> app.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border bg-background/80 p-3 text-xs shadow-xs min-w-[280px]">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Terminal className="size-3.5 text-primary" /> 1-Command Tunnel Setup
            </span>
            <div className="flex items-center gap-1 bg-muted p-1.5 rounded-lg font-mono text-[11px] text-foreground font-semibold justify-between">
              <code>npx localtunnel --port 5173</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText("npx localtunnel --port 5173");
                  toast.success("Copied: npx localtunnel --port 5173");
                }}
                className="text-primary hover:text-primary/80 px-1 py-0.5"
                title="Copy terminal command"
              >
                <Copy className="size-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Run in PowerShell or terminal → copy the generated <code className="text-primary">.loca.lt</code> link into the box below.
            </span>
          </div>
        </div>

        {/* Base URL Input Form */}
        <div className="mt-5 pt-5 border-t border-border/60">
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Active Mobile Base URL (Localtunnel / Wi-Fi IP / Localhost):
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Globe className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tunnelUrl}
                onChange={(e) => setTunnelUrl(e.target.value)}
                placeholder="e.g. https://weartrail-demo.loca.lt or http://192.168.1.50:5173"
                className="pl-9 font-mono text-xs h-9 bg-background shadow-xs font-medium"
              />
            </div>
            <Button
              size="sm"
              onClick={() => handleSaveTunnel(tunnelUrl)}
              className="h-9 px-4 text-xs font-semibold shrink-0"
            >
              <Check className="size-3.5 mr-1" /> Set Base URL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const origin = window.location.origin;
                handleSaveTunnel(origin);
              }}
              className="h-9 px-3 text-xs shrink-0"
              title="Reset to current browser origin"
            >
              <RefreshCw className="size-3.5 mr-1" /> Reset to Origin
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Current target origin: <strong className="font-mono text-primary">{tunnelUrl}</strong>
          </p>
        </div>
      </div>

      {/* Quick 4-Step Walkthrough Card */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-2 text-primary font-bold text-xs mb-1">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px]">1</span>
            Run Localtunnel
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Run <code className="text-foreground">npx localtunnel --port 5173</code> in terminal and paste the link above.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-2 text-primary font-bold text-xs mb-1">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px]">2</span>
            Copy Garment Link
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Click &ldquo;Copy for NFC Tools&rdquo; next to your finished shirt in the list below.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-2 text-primary font-bold text-xs mb-1">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px]">3</span>
            Open NFC Tools App
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            In app: <strong>Write → Add record → URL</strong>. Paste the copied link and tap <strong>Write</strong>.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-2 text-success font-bold text-xs mb-1">
            <span className="flex size-5 items-center justify-center rounded-full bg-success-soft text-[11px]">4</span>
            Touch Tag to Phone
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Tap tag on phone. It chimes &ldquo;Write complete!&rdquo;. Now tapping opens the live digital passport!
          </p>
        </div>
      </div>

      {/* Garments & NFC Passport Registry Table */}
      <Loadable query={qGarments}>
        {(garments) => {
          const filtered = garments.filter((g) => {
            const query = search.toLowerCase().trim();
            if (!query) return true;
            return `${g.id} ${(g as any).code || ""} ${g.productName} ${g.rfidUid || ""} ${g.stage} ${g.publicId || ""}`
              .toLowerCase()
              .includes(query);
          });

          return (
            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    Finished Garments & NFC Tag Links ({filtered.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Copy any product&apos;s link directly into your NFC Tools app or scan its QR code.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search product, code, or tag..."
                    className="pl-8 text-xs h-8 bg-background"
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState title="No garments match your search filter." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="border-b bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Garment / Code</th>
                        <th className="py-2.5 px-3">Product Style</th>
                        <th className="py-2.5 px-3">Bound Tag UID</th>
                        <th className="py-2.5 px-3">Stage / Quality</th>
                        <th className="py-2.5 px-3">Mobile Tap URL (Localtunnel)</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filtered.map((g) => {
                        const fullPassportUrl = getGarmentPassportUrl(g);
                        const isCopied = copiedId === g.id;

                        return (
                          <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-3 font-semibold text-foreground">
                              <div className="flex items-center gap-1.5">
                                <span className="wt-id font-bold text-xs">{(g as any).code || g.id}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {g.publicId || g.id}
                              </p>
                            </td>

                            <td className="py-3 px-3">
                              <p className="font-medium text-foreground">{g.productName}</p>
                              {g.size && (
                                <span className="inline-flex rounded bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground mt-0.5">
                                  Size {g.size}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              {g.rfidUid ? (
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-success bg-success-soft border border-success/25 px-2 py-0.5 rounded-full">
                                  <Radio className="size-3" /> {g.rfidUid}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-[11px] italic">
                                  Unbound
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 space-y-1">
                              <div>
                                <StatusBadge status={g.stage} />
                              </div>
                              <div>
                                <StatusBadge status={g.disposition} />
                              </div>
                            </td>

                            <td className="py-3 px-3 max-w-[320px]">
                              <div className="flex items-center gap-1.5 bg-muted/70 rounded-md p-1 border font-mono text-[11px]">
                                <span className="truncate flex-1 select-all text-primary font-medium pl-1">
                                  {fullPassportUrl}
                                </span>
                                <Button
                                  size="sm"
                                  variant={isCopied ? "default" : "secondary"}
                                  onClick={() => copyToClipboard(fullPassportUrl, g.id)}
                                  className="h-6 text-[10px] px-2 shrink-0 font-semibold"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="size-3 mr-1 text-primary-foreground" /> Copied!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="size-3 mr-1" /> Copy for NFC
                                    </>
                                  )}
                                </Button>
                              </div>
                            </td>

                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setSelectedQrGarment({
                                      id: g.id,
                                      code: (g as any).code || g.id,
                                      name: g.productName,
                                      url: fullPassportUrl,
                                    })
                                  }
                                  className="h-7 px-2 text-xs"
                                  title="Display QR code for mobile camera scanning"
                                >
                                  <QrCode className="size-3.5 mr-1 text-primary" /> QR Code
                                </Button>

                                <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                                  <AppLink href={fullPassportUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="size-3.5 mr-1" /> Test Link
                                  </AppLink>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        }}
      </Loadable>

      {/* QR Code Modal Dialog for Presentation Demonstration */}
      {selectedQrGarment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl text-center space-y-4">
            <div className="space-y-1">
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                Digital Product Passport QR
              </span>
              <h3 className="text-lg font-bold text-foreground">
                {selectedQrGarment.code} — {selectedQrGarment.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Point any smartphone camera at this code to view the live passport:
              </p>
            </div>

            {/* Live Generated QR Code */}
            <div className="flex justify-center p-3 bg-white rounded-xl border-2 border-primary/20 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
                  selectedQrGarment.url,
                )}`}
                alt={`QR code for ${selectedQrGarment.code}`}
                className="size-48 object-contain"
              />
            </div>

            <div className="space-y-2">
              <p className="font-mono text-[11px] text-muted-foreground bg-muted p-2 rounded-lg break-all select-all">
                {selectedQrGarment.url}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedQrGarment.url);
                    toast.success("NFC Link copied!");
                  }}
                  className="text-xs"
                >
                  <Copy className="size-3.5 mr-1" /> Copy Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedQrGarment(null)}
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
}
