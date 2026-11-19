import { useState } from "react";
import { Check, Copy, Hash, Info, OctagonAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { fmt } from "@/components/wt/layout";
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";

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
          <div className="rounded-2xl border border-purple-500/20 bg-[#1D1429]/90 p-6 shadow-xl backdrop-blur-md space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" aria-hidden />
              <p className="text-xs font-mono font-medium tracking-wider uppercase text-purple-300/80">
                Verified Provenance
              </p>
            </div>

            <div className="space-y-1">
              <h1 className="font-editorial text-2xl sm:text-3xl font-medium tracking-tight text-white">
                {j.productName}
              </h1>
              <p className="text-sm leading-relaxed text-purple-200/80">{j.productDescription}</p>
            </div>

            {/* Status & Identifiers */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  j.notice
                    ? "bg-amber-950/60 border border-amber-600/40 text-amber-200"
                    : j.status === "Dispatched to authorized retail network" ||
                        j.status === "Passed quality control"
                      ? "bg-purple-950/60 border border-purple-400/30 text-purple-200"
                      : "bg-purple-900/40 border border-purple-500/20 text-purple-200"
                }`}
              >
                {j.status}
              </span>
              <span className="wt-id rounded-full border border-purple-500/20 bg-[#140D1E] px-2.5 py-0.5 text-xs font-mono text-purple-200">
                ID: {j.publicId}
              </span>
              {j.garmentReference && (
                <span className="wt-id rounded-full border border-purple-500/20 bg-[#140D1E] px-2.5 py-0.5 text-xs font-mono text-purple-300/80">
                  Ref: {j.garmentReference}
                </span>
              )}
            </div>

            {/* Optional Garment Attributes: hidden when empty */}
            {(j.size || j.colour) && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-purple-300/80">
                {j.size && (
                  <span className="inline-flex items-center gap-1">
                    <strong className="text-white">Size:</strong> {j.size}
                  </span>
                )}
                {j.colour && (
                  <span className="inline-flex items-center gap-1">
                    <strong className="text-white">Colour:</strong> {j.colour}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Active Hold or Recall Notice (Generalized, zero internal defect notes) */}
          {j.notice && (
            <div
              role="alert"
              className="flex gap-3.5 rounded-2xl border border-amber-500/30 bg-[#251817]/90 p-4 text-amber-200 shadow-sm backdrop-blur-md"
            >
              <OctagonAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold text-amber-200">{j.notice.title}</p>
                <p className="text-sm text-amber-200/80 leading-relaxed">{j.notice.message}</p>
              </div>
            </div>
          )}

          {/* General Advisory */}
          {j.advisory && (
            <div className="flex gap-3 rounded-2xl border border-purple-500/30 bg-[#1D142E]/80 p-4 text-sm text-purple-200/90 shadow-sm backdrop-blur-md">
              <Info className="mt-0.5 size-4 shrink-0 text-purple-400" aria-hidden />
              <p>{j.advisory}</p>
            </div>
          )}

          {/* Stitched Journey Timeline */}
          <section
            aria-labelledby="journey-timeline-heading"
            className="rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 shadow-xl backdrop-blur-md"
          >
            <div className="mb-6 flex items-center justify-between border-b border-purple-800/30 pb-3">
              <div className="space-y-0.5">
                <h2
                  id="journey-timeline-heading"
                  className="font-editorial text-xl font-medium text-white tracking-tight"
                >
                  Manufacturing journey
                </h2>
                <p className="text-xs text-purple-300/70">
                  Chronological milestones recorded across certified factory checkpoints.
                </p>
              </div>
              <span className="wt-id text-xs font-mono text-purple-400">v{j.payloadVersion}</span>
            </div>

            <ol className="relative space-y-7 border-l border-dashed border-purple-500/30 pl-6 ml-2 my-2">
              {j.milestones.map((m, idx) => {
                const isLatest = idx === j.milestones.length - 1;
                return (
                  <li key={m.key} className="relative group">
                    {/* Stitched node indicator */}
                    {isLatest ? (
                      <span
                        aria-hidden
                        className="absolute -left-[1.88rem] top-1 size-3.5 rotate-45 bg-[#E879F9] border border-white/80 shadow-[0_0_10px_rgba(232,121,249,0.7)]"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="absolute -left-[1.88rem] top-1 size-3.5 rotate-45 border-2 border-purple-400/50 bg-[#1A1225]"
                      />
                    )}

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white text-sm sm:text-base">{m.label}</p>
                        {m.lotLevel && (
                          <span className="rounded-full border border-purple-500/30 bg-purple-950/60 px-2 py-0.5 text-[10px] font-mono text-purple-300">
                            Fabric lot
                          </span>
                        )}
                        {m.department && (
                          <span className="rounded bg-purple-900/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-purple-300/80">
                            {m.department}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-mono text-purple-300/70">{fmt.date(m.date)}</p>

                      <p className="text-xs leading-relaxed text-purple-200/80 pt-0.5">
                        {m.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Public Journey Hash & Technical Verification */}
          <section className="space-y-4 rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 border-b border-purple-800/30 pb-3">
              <div className="flex items-center gap-2">
                <Hash className="size-4 text-purple-400" aria-hidden />
                <h3 className="font-semibold text-sm text-white">Public journey fingerprint</h3>
              </div>
              <span className="text-[11px] font-mono text-purple-300/70">
                SHA-256 sealed payload
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-purple-300/80 leading-relaxed">
                This cryptographic hash uniquely binds and verifies the immutable published journey
                above:
              </p>
              <div className="relative rounded-xl border border-purple-800/40 bg-[#120B1C] p-3">
                <code className="wt-id block text-xs break-all text-purple-100 font-mono select-all">
                  {j.journeyHash}
                </code>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyHash(j.journeyHash)}
                className="gap-1.5 rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white"
              >
                {copiedHash ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copiedHash ? "Hash copied" : "Copy journey hash"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyLink()}
                className="gap-1.5 rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white"
              >
                {copiedLink ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copiedLink ? "Link copied" : "Copy link"}
              </Button>

              <Button
                size="sm"
                asChild
                className="gap-1.5 ml-auto rounded-full bg-purple-100 text-purple-950 hover:bg-white font-medium"
              >
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
