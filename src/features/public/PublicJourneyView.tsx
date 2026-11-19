import { useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  Info,
  OctagonAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { fmt } from "@/components/wt/layout";
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";

/**
 * Consumer-friendly status mapping for shoppers.
 * Translates factory/disposition codes into clean, reassuring language.
 */
function getCustomerStatusDetails(status: string, notice?: { title: string; message: string }) {
  if (notice || status === "Temporarily on hold") {
    return {
      label: "Quality Review in Progress",
      badgeClass: "bg-amber-950/60 border-amber-500/40 text-amber-200",
      dotClass: "bg-amber-400",
      description: "Our quality team is performing a routine evaluation before final release.",
    };
  }
  if (status === "Dispatched to authorized retail network") {
    return {
      label: "Dispatched & Verified",
      badgeClass: "bg-emerald-950/50 border-emerald-500/40 text-emerald-200",
      dotClass: "bg-emerald-400 animate-pulse",
      description: "This garment has passed every verified checkpoint and dispatched to retail.",
    };
  }
  if (status === "Passed quality control") {
    return {
      label: "Passed Quality Control",
      badgeClass: "bg-purple-950/60 border-purple-400/40 text-purple-200",
      dotClass: "bg-purple-300",
      description: "Crafting and multi-point quality inspection successfully completed.",
    };
  }
  return {
    label: "Crafting in Progress",
    badgeClass: "bg-purple-900/40 border-purple-500/30 text-purple-200",
    dotClass: "bg-purple-400",
    description: "Currently progressing through verified factory production stations.",
  };
}

export function PublicJourneyView({ publicId }: { publicId: string }) {
  const q = useWtQuery(["public-journey", publicId], (c) => c.getPublicJourney(publicId));
  const timelineRef = useRef<HTMLElement | null>(null);

  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const toggleMilestone = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const scrollToTimeline = () => {
    if (timelineRef.current) {
      timelineRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(true);
      toast.success("Journey fingerprint copied to clipboard.");
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
      {(j) => {
        const statusDetails = getCustomerStatusDetails(j.status, j.notice);
        const latestMilestone = j.milestones[j.milestones.length - 1];

        return (
          <article className="space-y-6 motion-safe:animate-fade-in-up">
            {/* Hero / Identity Card */}
            <div className="relative overflow-hidden rounded-2xl border border-purple-500/25 bg-[#1D1429]/90 p-6 sm:p-7 shadow-2xl backdrop-blur-md space-y-5">
              {/* Subtle top stitch aura */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl"
              />

              {/* Sub-header with delicate stitch line */}
              <div className="flex items-center gap-2.5 text-xs font-mono font-medium tracking-widest uppercase text-purple-300/80">
                <span className="w-6 border-t border-dashed border-purple-400/50" aria-hidden />
                <span>The Story Behind The Stitch</span>
              </div>

              {/* Garment Title & Narrative */}
              <div className="space-y-2">
                <h1 className="font-editorial text-3xl sm:text-4xl font-normal tracking-tight text-white leading-tight">
                  {j.productName}
                </h1>
                <p className="text-sm leading-relaxed text-purple-200/85 max-w-xl">
                  {j.productDescription}
                </p>
              </div>

              {/* Attributes & Plain-English Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-purple-500/20 pt-4 text-xs">
                <div className="space-y-1">
                  <span className="block font-mono text-[11px] uppercase tracking-wider text-purple-300/70">
                    Garment ID
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white tracking-wide">
                      {j.publicId}
                    </span>
                    {j.garmentReference && (
                      <span className="rounded bg-purple-950/70 border border-purple-500/25 px-1.5 py-0.5 font-mono text-[10px] text-purple-300/90">
                        Ref: {j.garmentReference}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block font-mono text-[11px] uppercase tracking-wider text-purple-300/70">
                    Latest Milestone
                  </span>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-purple-100">
                    <span className={`size-2 rounded-full ${statusDetails.dotClass}`} aria-hidden />
                    <span>{latestMilestone?.label || statusDetails.label}</span>
                  </div>
                </div>
              </div>

              {/* Optional size & colour: only shown when present */}
              {(j.size || j.colour) && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-purple-300/80 pt-1">
                  {j.size && (
                    <span className="inline-flex items-center gap-1.5">
                      <strong className="text-white font-medium">Size:</strong> {j.size}
                    </span>
                  )}
                  {j.colour && (
                    <span className="inline-flex items-center gap-1.5">
                      <strong className="text-white font-medium">Colour:</strong> {j.colour}
                    </span>
                  )}
                </div>
              )}

              {/* Quick Scroll Action Button */}
              <div className="pt-1">
                <Button
                  type="button"
                  onClick={scrollToTimeline}
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-full border-purple-400/30 bg-purple-950/40 text-purple-100 hover:bg-purple-900/60 hover:text-white transition-all shadow-sm cursor-pointer"
                >
                  Explore the journey <ArrowDown className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Hold / Quality Review Advisory (Honest, generalized, zero internal defect notes) */}
            {j.notice && (
              <div
                role="alert"
                className="flex gap-3.5 rounded-2xl border border-amber-500/35 bg-[#251817]/95 p-4 sm:p-5 text-amber-200 shadow-lg backdrop-blur-md"
              >
                <OctagonAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-100 text-sm">{j.notice.title}</p>
                  <p className="text-xs sm:text-sm text-amber-200/85 leading-relaxed">
                    {j.notice.message}
                  </p>
                </div>
              </div>
            )}

            {/* General Advisory */}
            {j.advisory && (
              <div className="flex gap-3 rounded-2xl border border-purple-500/30 bg-[#1D142E]/80 p-4 text-xs sm:text-sm text-purple-200/90 shadow-sm backdrop-blur-md">
                <Info className="mt-0.5 size-4 shrink-0 text-purple-400" aria-hidden />
                <p>{j.advisory}</p>
              </div>
            )}

            {/* Stitched Journey Timeline Section */}
            <section
              ref={timelineRef}
              id="journey-timeline"
              aria-labelledby="journey-timeline-heading"
              className="rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 sm:p-7 shadow-2xl backdrop-blur-md space-y-6"
            >
              {/* Section Header matching reference */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-800/35 pb-4">
                <div className="space-y-1">
                  <span className="block text-[10px] font-mono font-medium tracking-wider uppercase text-purple-400">
                    Production Record
                  </span>
                  <h2
                    id="journey-timeline-heading"
                    className="font-editorial text-2xl font-normal text-white tracking-tight"
                  >
                    The garment journey
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-purple-300/70">
                  <span>Chronological verified record</span>
                  <span className="rounded bg-purple-950/60 border border-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">
                    v{j.payloadVersion}
                  </span>
                </div>
              </div>

              {/* Stitched Timeline List */}
              <ol className="relative space-y-6 border-l-2 border-dashed border-purple-500/30 pl-7 ml-2.5 my-2">
                {j.milestones.map((m, idx) => {
                  const isLatest = idx === j.milestones.length - 1;
                  const isExpanded = expandedKeys[m.key] ?? isLatest;

                  return (
                    <li key={m.key} className="relative group">
                      {/* Stitched Diamond Node */}
                      {isLatest ? (
                        <span
                          aria-hidden="true"
                          className="absolute -left-[2.35rem] top-1 size-3.5 rotate-45 bg-[#E879F9] border border-white/90 shadow-[0_0_12px_rgba(232,121,249,0.85)] motion-safe:transition-transform group-hover:scale-110"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="absolute -left-[2.35rem] top-1 size-3.5 rotate-45 border-2 border-purple-400/60 bg-[#160E22] motion-safe:transition-transform group-hover:scale-110 group-hover:border-purple-300"
                        />
                      )}

                      {/* Milestone Row Card */}
                      <div className="rounded-xl border border-purple-500/15 bg-purple-950/20 p-4 transition-all hover:border-purple-500/35 hover:bg-purple-950/40">
                        {/* Clickable Header for expanding/collapsing details */}
                        <button
                          type="button"
                          onClick={() => toggleMilestone(m.key)}
                          className="w-full text-left flex items-start justify-between gap-3 cursor-pointer select-none"
                          aria-expanded={isExpanded}
                          aria-controls={`milestone-content-${m.key}`}
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white text-sm sm:text-base tracking-wide">
                                {m.label}
                              </span>

                              {m.lotLevel && (
                                <span className="rounded-full border border-purple-400/30 bg-purple-950/70 px-2 py-0.5 text-[10px] font-mono text-purple-300">
                                  Fabric lot
                                </span>
                              )}

                              {m.department && (
                                <span className="rounded bg-purple-900/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-purple-300/80">
                                  {m.department}
                                </span>
                              )}
                            </div>

                            <p className="text-xs font-mono text-purple-300/75">
                              {fmt.date(m.date)}
                            </p>
                          </div>

                          {/* Toggle Chevron */}
                          <div className="text-purple-400 group-hover:text-purple-200 transition-colors pt-0.5">
                            {isExpanded ? (
                              <ChevronUp className="size-4" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="size-4" aria-hidden="true" />
                            )}
                          </div>
                        </button>

                        {/* Expandable Details Container */}
                        {isExpanded && (
                          <div
                            id={`milestone-content-${m.key}`}
                            className="mt-3 pt-3 border-t border-purple-500/15 text-xs text-purple-200/85 space-y-2 motion-safe:transition-all"
                          >
                            <p className="leading-relaxed">{m.description}</p>

                            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-purple-300/70">
                              <span>Department: {m.department || "Factory Station"}</span>
                              <span>·</span>
                              <span>Status: Recorded</span>
                              {m.lotLevel && (
                                <>
                                  <span>·</span>
                                  <span className="text-purple-300">Lot-level shared origin</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Public Journey Fingerprint & Technical Verification Card */}
            <section className="space-y-4 rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 sm:p-7 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between gap-2 border-b border-purple-800/35 pb-3">
                <div className="flex items-center gap-2">
                  <Hash className="size-4 text-purple-400" aria-hidden />
                  <h3 className="font-semibold text-sm text-white">Journey hash</h3>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-purple-300/80">
                  <Sparkles className="size-3 text-purple-400" aria-hidden />
                  SHA-256 sealed payload
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-purple-300/80 leading-relaxed">
                  This cryptographic fingerprint seals the authentic factory timeline above,
                  guaranteeing it cannot be modified or reordered:
                </p>
                <div className="relative rounded-xl border border-purple-800/40 bg-[#120B1C] p-3.5">
                  <code className="wt-id block text-xs break-all text-purple-100 font-mono select-all">
                    {j.journeyHash}
                  </code>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyHash(j.journeyHash)}
                  className="gap-1.5 rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white cursor-pointer"
                >
                  {copiedHash ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copiedHash ? "Hash copied" : "Copy hash"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyLink()}
                  className="gap-1.5 rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white cursor-pointer"
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
                  className="gap-1.5 ml-auto rounded-full bg-purple-100 text-purple-950 hover:bg-white font-medium cursor-pointer"
                >
                  <AppLink href={paths.publicProof(j.publicId)}>
                    <ShieldCheck className="size-3.5" /> Technical proof →
                  </AppLink>
                </Button>
              </div>
            </section>
          </article>
        );
      }}
    </Loadable>
  );
}
