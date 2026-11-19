import { useState } from "react";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
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
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";

function formatMilestoneTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year} · ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}

export function PublicJourneyView({ publicId }: { publicId: string }) {
  const q = useWtQuery(["public-journey", publicId], (c) => c.getPublicJourney(publicId));
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const toggleMilestone = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

  const scrollToTimeline = () => {
    const el = document.getElementById("production-record");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <Loadable query={q} what="product journey">
      {(j) => {
        // Split title into Roman leading word + Italic remaining words for editorial luxury
        const words = j.productName.trim().split(" ");
        const firstWord = words[0] || "Garment";
        const restWords = words.slice(1).join(" ");
        const latestMilestone = j.milestones[j.milestones.length - 1];

        return (
          <article className="space-y-10 animate-fade-in-up">
            {/* HERO SECTION: The Story Behind The Stitch (matching Image 1) */}
            <div className="relative overflow-hidden rounded-3xl border border-purple-500/20 bg-[#160E24]/90 p-7 sm:p-10 md:p-12 shadow-[0_24px_50px_-12px_rgba(8,3,15,0.85)] backdrop-blur-2xl">
              {/* Subtle denim weave overlay and ambient purple aura in the backdrop */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-purple-600/20 blur-[90px]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 right-0 h-full w-1/2 opacity-25 bg-[radial-gradient(#4a2b6d_1px,transparent_1px)] [background-size:16px_16px]"
              />

              <div className="relative z-10 max-w-2xl space-y-6">
                {/* Overline with dashes */}
                <div className="flex items-center gap-2 text-xs font-mono font-medium tracking-[0.25em] text-purple-300 uppercase">
                  <span className="text-purple-400">--------</span>
                  <span>The Story Behind The Stitch</span>
                </div>

                {/* Editorial High-Contrast Typography */}
                <div className="space-y-1">
                  <h1 className="font-editorial text-4xl sm:text-5xl md:text-6xl text-white font-normal leading-[1.08] tracking-tight">
                    <span>{firstWord}</span>
                    {restWords && (
                      <span className="block italic font-normal text-purple-100/95 mt-0.5">
                        {restWords}
                      </span>
                    )}
                  </h1>
                  <p className="pt-2 text-sm sm:text-base leading-relaxed text-purple-200/75 max-w-xl">
                    {j.productDescription ||
                      "Follow this garment from raw indigo denim through cutting, stitching, quality inspection, and dispatch."}
                  </p>
                </div>

                {/* Metadata Row: Garment ID & Latest Milestone */}
                <div className="flex flex-wrap items-center gap-8 pt-2 pb-1 border-t border-purple-800/30">
                  <div>
                    <p className="text-[11px] font-mono tracking-wider text-purple-400 uppercase">
                      Garment ID
                    </p>
                    <p className="wt-id text-sm font-semibold text-white tracking-wide mt-0.5">
                      {j.publicId}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-mono tracking-wider text-purple-400 uppercase">
                      Latest milestone
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          j.notice
                            ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                            : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                        }`}
                        aria-hidden
                      />
                      <span className="text-sm font-semibold text-white">
                        {j.status || latestMilestone?.label || "In Production"}
                      </span>
                    </div>
                  </div>

                  {/* Optional colour / size attributes: hidden when empty */}
                  {(j.size || j.colour) && (
                    <div className="flex items-center gap-3">
                      {j.size && (
                        <div>
                          <p className="text-[11px] font-mono tracking-wider text-purple-400 uppercase">
                            Size
                          </p>
                          <p className="text-sm font-semibold text-white mt-0.5">{j.size}</p>
                        </div>
                      )}
                      {j.colour && (
                        <div>
                          <p className="text-[11px] font-mono tracking-wider text-purple-400 uppercase">
                            Colour
                          </p>
                          <p className="text-sm font-semibold text-white mt-0.5">{j.colour}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Primary CTA: Explore the journey ↓ */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={scrollToTimeline}
                    className="inline-flex items-center gap-2 rounded-full bg-[#F3E8FF] px-6 py-3 text-sm font-medium text-[#1E0E38] shadow-[0_4px_24px_rgba(216,180,254,0.35)] transition-all duration-300 hover:bg-white hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    <span>Explore the journey</span>
                    <ArrowDown className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* QUALITY HOLD NOTICE (Generalized, zero defect notes) */}
            {j.notice && (
              <div
                role="alert"
                className="flex items-start gap-4 rounded-2xl border border-amber-500/30 bg-[#251817]/90 p-5 text-amber-200 shadow-xl backdrop-blur-md"
              >
                <OctagonAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-200">{j.notice.title}</p>
                  <p className="text-sm text-amber-200/80 leading-relaxed">{j.notice.message}</p>
                </div>
              </div>
            )}

            {/* ADVISORY (If present) */}
            {j.advisory && (
              <div className="flex items-start gap-3.5 rounded-2xl border border-purple-500/30 bg-[#1D142E]/80 p-5 text-sm text-purple-200/90 shadow-lg backdrop-blur-md">
                <Info className="mt-0.5 size-4 shrink-0 text-purple-400" aria-hidden />
                <p>{j.advisory}</p>
              </div>
            )}

            {/* PRODUCTION RECORD CARD: The Garment Journey (matching Image 2) */}
            <section
              id="production-record"
              aria-labelledby="garment-journey-heading"
              className="relative rounded-3xl border border-purple-500/20 bg-[#171024]/90 p-6 sm:p-10 shadow-[0_24px_50px_-12px_rgba(8,3,15,0.85)] backdrop-blur-2xl"
            >
              {/* Card Header */}
              <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-purple-800/30 pb-5">
                <div className="space-y-1">
                  <p className="text-[10px] sm:text-xs font-mono font-semibold tracking-[0.25em] text-purple-400 uppercase">
                    Production Record
                  </p>
                  <h2
                    id="garment-journey-heading"
                    className="font-editorial text-3xl sm:text-4xl text-white font-normal tracking-tight"
                  >
                    The garment journey
                  </h2>
                </div>
                <p className="text-xs text-purple-300/70 font-mono">Times shown in PKT (UTC+5)</p>
              </div>

              {/* Stitched Timeline with Diamond Lozenge Nodes */}
              <div className="relative pl-6 sm:pl-8 ml-2 my-2 border-l border-dashed border-purple-500/30 space-y-7">
                {j.milestones.map((m, idx) => {
                  const isLatest = idx === j.milestones.length - 1;
                  const isExpanded = !!expandedKeys[m.key];

                  return (
                    <div key={m.key} className="relative group">
                      {/* Diamond marker node */}
                      {isLatest ? (
                        <span
                          aria-hidden
                          className="absolute -left-[1.88rem] sm:-left-[2.38rem] top-1 size-3.5 rotate-45 bg-[#E879F9] border border-white/80 animate-diamond-glow"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="absolute -left-[1.88rem] sm:-left-[2.38rem] top-1 size-3.5 rotate-45 border-2 border-purple-400/50 bg-[#171024] transition-colors group-hover:border-purple-300"
                        />
                      )}

                      {/* Milestone row */}
                      <div className="space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <p className="text-base font-semibold text-white tracking-tight">
                                {m.label}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-purple-300/80">{m.department}</span>
                              {m.lotLevel && (
                                <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-950/60 px-2 py-0.5 text-[10px] font-mono text-purple-300">
                                  Fabric lot
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Date and Expand toggle */}
                          <div className="flex items-center gap-3 text-xs text-purple-300/80 font-mono">
                            <span>{formatMilestoneTime(m.date)}</span>
                            <button
                              type="button"
                              onClick={() => toggleMilestone(m.key)}
                              className="flex size-6 items-center justify-center rounded-full hover:bg-purple-900/40 text-purple-300 hover:text-white transition-colors cursor-pointer"
                              aria-label={isExpanded ? "Collapse milestone" : "Expand milestone"}
                            >
                              {isExpanded ? (
                                <ChevronUp className="size-3.5" />
                              ) : (
                                <ChevronDown className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expandable milestone details */}
                        {isExpanded && (
                          <div className="mt-2 rounded-xl border border-purple-800/40 bg-[#120B1C]/80 p-3.5 text-xs text-purple-200/90 space-y-1 animate-fade-in-up">
                            {m.description && <p className="leading-relaxed">{m.description}</p>}
                            <div className="flex items-center gap-4 pt-1 text-[11px] text-purple-400/80 font-mono">
                              <span>Milestone: {m.key}</span>
                              <span>Timestamp: {m.date}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Journey Hash Card (matching Image 2) */}
              <div className="mt-10 rounded-2xl border border-purple-500/20 bg-[#110A1B]/90 p-5 sm:p-6 backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white tracking-wide">
                        Journey hash
                      </span>
                      <span className="rounded-full border border-purple-600/30 bg-purple-950/60 px-2.5 py-0.5 text-[10px] font-mono font-medium text-purple-300">
                        Demo
                      </span>
                    </div>
                    <code className="wt-id block text-xs text-purple-200/90 font-mono break-all select-all pt-1">
                      {j.journeyHash}
                    </code>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void copyHash(j.journeyHash)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-950/40 hover:bg-purple-900/60 hover:border-purple-300 text-purple-100 text-xs px-4 py-2 font-medium shadow-sm transition-all duration-200 active:scale-95 cursor-pointer"
                    >
                      {copiedHash ? (
                        <Check className="size-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      <span>{copiedHash ? "Copied" : "Copy hash"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-950/40 hover:bg-purple-900/60 hover:border-purple-300 text-purple-100 text-xs px-4 py-2 font-medium shadow-sm transition-all duration-200 active:scale-95 cursor-pointer"
                    >
                      {copiedLink ? (
                        <Check className="size-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      <span>{copiedLink ? "Link copied" : "Copy link"}</span>
                    </button>
                  </div>
                </div>

                {/* Technical Proof Link */}
                <div className="mt-4 pt-3 border-t border-purple-900/30 flex items-center justify-between text-xs">
                  <span className="text-purple-400/70">
                    Sealed payload v{j.payloadVersion} · SHA-256 fingerprint
                  </span>
                  <AppLink
                    href={paths.publicProof(j.publicId)}
                    className="inline-flex items-center gap-1 text-purple-300 hover:text-white transition-colors"
                  >
                    <ShieldCheck className="size-3.5" />
                    <span>Technical proof & canonical JSON →</span>
                  </AppLink>
                </div>
              </div>
            </section>
          </article>
        );
      }}
    </Loadable>
  );
}
