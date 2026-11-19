import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Hash,
  Info,
  Layers,
  OctagonAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { TAGLINE } from "@/components/wt/Logo";
import { fmt } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";
import { evidenceLabel } from "./evidence";

export function PublicJourneyView({ publicId }: { publicId: string }) {
  const q = useWtQuery(["public-journey", publicId], (c) => c.getPublicJourney(publicId));
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(true);
      toast.success("Public journey hash copied to clipboard.");
      setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      toast.error("Could not copy hash.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success("Product journey URL copied.");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy URL.");
    }
  };

  return (
    <Loadable query={q} what="product journey">
      {(j) => (
        <article className="space-y-6">
          {/* Header & Product Identity */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                Verified Provenance
              </p>
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {j.productName}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {j.productDescription}
              </p>
            </div>

            {/* Status & Identifiers */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusBadge
                status={j.status}
                tone={
                  j.notice
                    ? "danger"
                    : j.status === "Dispatched to authorized retail network"
                      ? "success"
                      : j.status === "Passed quality control"
                        ? "success"
                        : "info"
                }
              />
              <span className="wt-id rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground font-semibold">
                ID: {j.publicId}
              </span>
              {j.garmentReference && (
                <span className="wt-id rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
                  Ref: {j.garmentReference}
                </span>
              )}
            </div>

            {/* Optional Garment Attributes: hidden when empty */}
            {(j.size || j.colour) && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
                {j.size && (
                  <span className="inline-flex items-center gap-1">
                    <strong className="text-foreground">Size:</strong> {j.size}
                  </span>
                )}
                {j.colour && (
                  <span className="inline-flex items-center gap-1">
                    <strong className="text-foreground">Colour:</strong> {j.colour}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Active Hold or Recall Notice */}
          {j.notice && (
            <div
              role="alert"
              className="flex gap-3.5 rounded-xl border border-destructive/40 bg-danger-soft p-4 text-foreground shadow-sm"
            >
              <OctagonAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold text-destructive">{j.notice.title}</p>
                <p className="text-sm text-foreground/90">{j.notice.message}</p>
              </div>
            </div>
          )}

          {/* General Advisory */}
          {j.advisory && (
            <div className="flex gap-3 rounded-xl border border-accent bg-info-soft p-4 text-sm text-accent-foreground shadow-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{j.advisory}</p>
            </div>
          )}

          {/* Stitched Journey Timeline */}
          <section
            aria-labelledby="journey-timeline-heading"
            className="rounded-xl border bg-card/95 p-5 shadow-sm backdrop-blur"
          >
            <div className="mb-6 flex items-center justify-between border-b pb-3">
              <div className="space-y-0.5">
                <h2 id="journey-timeline-heading" className="font-semibold text-foreground">
                  Manufacturing journey
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chronological milestones recorded across certified factory checkpoints.
                </p>
              </div>
              <span className="wt-id text-xs text-muted-foreground">v{j.payloadVersion}</span>
            </div>

            <ol className="relative space-y-7 border-l-2 border-primary/25 pl-6 ml-2 my-2">
              {j.milestones.map((m) => (
                <li key={m.key} className="relative">
                  {/* Stitched node indicator */}
                  <span
                    aria-hidden
                    className="absolute -left-[1.95rem] top-1 size-3.5 rounded-full border-2 border-card bg-primary ring-2 ring-primary/20"
                  />

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground text-sm sm:text-base">
                        {m.label}
                      </p>
                      {m.lotLevel && (
                        <span className="rounded bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                          Fabric lot
                        </span>
                      )}
                      {m.department && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {m.department}
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-muted-foreground">{fmt.date(m.date)}</p>

                    <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm pt-0.5">
                      {m.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Public Journey Hash & Technical Verification */}
          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b pb-3">
              <div className="flex items-center gap-2">
                <Hash className="size-4 text-primary" aria-hidden />
                <h3 className="font-semibold text-sm text-foreground">
                  Public journey fingerprint
                </h3>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">
                SHA-256 sealed payload
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                This cryptographic hash uniquely binds and verifies the immutable published journey
                above:
              </p>
              <div className="relative rounded-lg border bg-muted/60 p-3">
                <code className="wt-id block text-xs break-all text-foreground font-mono select-all">
                  {j.journeyHash}
                </code>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyHash(j.journeyHash)}
                className="gap-1.5"
              >
                {copiedHash ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copiedHash ? "Hash copied" : "Copy journey hash"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyLink()}
                className="gap-1.5"
              >
                {copiedLink ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copiedLink ? "Link copied" : "Copy link"}
              </Button>

              <Button size="sm" asChild className="gap-1.5 ml-auto">
                <AppLink href={paths.publicProof(j.publicId)}>
                  <ShieldCheck className="size-3.5" /> Technical proof
                </AppLink>
              </Button>
            </div>
          </section>
        </article>
      )}
    </Loadable>
  );
}
