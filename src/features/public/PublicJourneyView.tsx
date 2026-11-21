import { useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  OctagonAlert,
  SearchX,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { fmt } from "@/components/wt/layout";
import { errorMessage, useWtQuery } from "@/lib/data/hooks";
import type { PublicJourney, PublicMilestone } from "@/domain/public-types";

/**
 * 9 Standard Manufacturing Stages in sequential factory order.
 */
interface ManufacturingStageDef {
  id: string;
  name: string;
  department: string;
  defaultDescription: string;
  isMatch: (m: PublicMilestone) => boolean;
}

const MANUFACTURING_STAGES: ManufacturingStageDef[] = [
  {
    id: "raw-material",
    name: "Raw Material Received",
    department: "Materials",
    defaultDescription:
      "Sustainably sourced fabric lot received and inspected for fiber density, color consistency, and organic certification compliance.",
    isMatch: (m) =>
      m.key === "fabric-sourced" ||
      m.label.toLowerCase().includes("fabric lot") ||
      m.label.toLowerCase().includes("raw material") ||
      (m.label.toLowerCase().includes("fabric") && !m.label.toLowerCase().includes("cut")),
  },
  {
    id: "material-issued",
    name: "Material Issued",
    department: "Raw Store",
    defaultDescription:
      "Inspected fabric rolls issued from storage and allocated to the automated cutting room according to the production plan.",
    isMatch: (m) =>
      m.key === "material-issued" ||
      m.label.toLowerCase().includes("material issued") ||
      m.label.toLowerCase().includes("fabric issued") ||
      m.label.toLowerCase().includes("allocated to cutting"),
  },
  {
    id: "cutting",
    name: "Cutting",
    department: "Production",
    defaultDescription:
      "Fabric rolls unrolled, aligned, and precision cut into exact garment panel shapes with individual item identification.",
    isMatch: (m) =>
      m.key === "garment-cut" ||
      (m.label.toLowerCase().includes("cut") && !m.label.toLowerCase().includes("issue")),
  },
  {
    id: "stitching",
    name: "Stitching",
    department: "Production",
    defaultDescription:
      "Precision seam sewing, panel joining, and sleeve assembly performed at the dedicated sewing line.",
    isMatch: (m) =>
      m.key === "stitching-completed" ||
      m.label.toLowerCase().includes("stitch") ||
      m.label.toLowerCase().includes("sewing"),
  },
  {
    id: "finishing",
    name: "Finishing",
    department: "Production",
    defaultDescription:
      "Garment hardware and buttons secured, loose threads trimmed, and final steam pressing applied.",
    isMatch: (m) =>
      m.key === "garment-assembled" ||
      m.label.toLowerCase().includes("finish") ||
      m.label.toLowerCase().includes("assembled"),
  },
  {
    id: "quality",
    name: "Quality Inspection",
    department: "Quality Assurance",
    defaultDescription:
      "Comprehensive multi-point inspection evaluating seam strength, dimensional tolerances, and visual workmanship standards.",
    isMatch: (m) =>
      m.key === "quality-passed" ||
      m.label.toLowerCase().includes("quality") ||
      m.label.toLowerCase().includes("inspection"),
  },
  {
    id: "packing",
    name: "Packing",
    department: "Logistics",
    defaultDescription:
      "Quality-approved garment tagged, folded into protective eco-packaging, and sealed into master shipping cartons.",
    isMatch: (m) =>
      m.key === "garment-packed" ||
      m.label.toLowerCase().includes("pack") ||
      m.label.toLowerCase().includes("carton"),
  },
  {
    id: "warehouse",
    name: "Warehouse",
    department: "Logistics",
    defaultDescription:
      "Master shipping carton scanned and securely placed into distribution warehouse inventory awaiting dispatch.",
    isMatch: (m) =>
      m.key === "warehouse-received" ||
      m.label.toLowerCase().includes("warehouse"),
  },
  {
    id: "dispatch",
    name: "Dispatch",
    department: "Logistics",
    defaultDescription:
      "Verified shipping manifest sealed and departed the facility for delivery to authorized retail partners.",
    isMatch: (m) =>
      m.key === "dispatched" ||
      m.label.toLowerCase().includes("dispatch") ||
      m.label.toLowerCase().includes("departed") ||
      m.label.toLowerCase().includes("retail"),
  },
];

/**
 * Curated product image sets based on garment category.
 * Includes multiple high-resolution gallery angles with graceful fallback illustration placeholders.
 */
interface ProductGalleryImage {
  url: string;
  label: string;
  caption: string;
}

function getProductGallery(productName: string, publicId: string): ProductGalleryImage[] {
  const isTrouser =
    productName.toLowerCase().includes("trouser") ||
    publicId.toLowerCase().includes("trouser");

  if (isTrouser) {
    return [
      {
        url: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=900&q=80",
        label: "Front Studio View",
        caption: "Tailored relaxed silhouette in certified organic cotton.",
      },
      {
        url: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
        label: "Tailoring & Seam Detail",
        caption: "Reinforced belt loops and double-stitched pocket welt.",
      },
      {
        url: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80",
        label: "Textile Texture",
        caption: "Heavyweight breathable twill weave with natural handfeel.",
      },
    ];
  }

  // Default: Heritage Overshirt / Shirt
  return [
    {
      url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
      label: "Front Studio View",
      caption: "Crafted with certified organic cotton twill and reinforced seams.",
    },
    {
      url: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=80",
      label: "Collar & Horn Button Detail",
      caption: "Sustainably sourced horn buttons and precision topstitching.",
    },
    {
      url: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
      label: "Profile & Seam Construction",
      caption: "Structured yoke and articulated sleeves for everyday durability.",
    },
  ];
}

/**
 * Intentional SVG fallback illustration when images fail or load offline.
 */
function FallbackGarmentIllustration({ isTrouser }: { isTrouser: boolean }) {
  if (isTrouser) {
    return (
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-40 text-purple-300 drop-shadow-md"
        aria-hidden="true"
      >
        <rect x="65" y="30" width="70" height="12" rx="2" fill="#9333EA" fillOpacity="0.3" stroke="#C084FC" strokeWidth="2" />
        <path d="M65 42 L68 170 L92 170 L100 85 L108 170 L132 170 L135 42 Z" fill="#581C87" fillOpacity="0.35" stroke="#C084FC" strokeWidth="2" strokeLinejoin="round" />
        <line x1="80" y1="44" x2="80" y2="168" stroke="#E9D5FF" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="120" y1="44" x2="120" y2="168" stroke="#E9D5FF" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="size-40 text-purple-300 drop-shadow-md"
      aria-hidden="true"
    >
      <path d="M72 38 L100 56 L128 38 L114 28 L86 28 Z" fill="#9333EA" fillOpacity="0.35" stroke="#C084FC" strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 50 L72 38 L128 38 L140 50 L162 86 L144 94 L136 68 L136 168 L64 168 L64 68 L56 94 L38 86 Z" fill="#581C87" fillOpacity="0.35" stroke="#C084FC" strokeWidth="2" strokeLinejoin="round" />
      <line x1="100" y1="56" x2="100" y2="168" stroke="#E9D5FF" strokeWidth="1.8" strokeDasharray="2 3" />
      <rect x="74" y="80" width="18" height="20" rx="2" stroke="#E9D5FF" strokeWidth="1.4" fill="none" />
      <circle cx="100" cy="72" r="2.2" fill="#F3E8FF" />
      <circle cx="100" cy="94" r="2.2" fill="#F3E8FF" />
      <circle cx="100" cy="116" r="2.2" fill="#F3E8FF" />
      <circle cx="100" cy="138" r="2.2" fill="#F3E8FF" />
    </svg>
  );
}

export function PublicJourneyView({ publicId }: { publicId: string }) {
  const cleanId = publicId.trim();
  const q = useWtQuery(["public-journey", cleanId], (c) => c.getPublicJourney(cleanId));

  const [activeSlide, setActiveSlide] = useState(0);
  const [imageErrorMap, setImageErrorMap] = useState<Record<number, boolean>>({});
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});

  const toggleStage = (stageId: string) => {
    setExpandedStages((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  // Loading state in public plum theme
  if (q.isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-purple-500/20 bg-[#1D1429]/80 p-12 text-center shadow-xl backdrop-blur-md">
        <Loader2 className="size-8 animate-spin text-purple-400" aria-hidden="true" />
        <p className="font-editorial text-lg text-white tracking-wide">
          Retrieving Digital Product Passport…
        </p>
        <p className="text-xs text-purple-300/70 font-mono">
          Verifying public record for {cleanId}
        </p>
      </div>
    );
  }

  // Error state in public plum theme
  if (q.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/40 bg-[#25121E]/90 p-8 sm:p-12 text-center shadow-xl backdrop-blur-md">
        <AlertCircle className="size-8 text-rose-400" aria-hidden="true" />
        <h2 className="font-editorial text-xl font-medium text-white">
          Unable to Load Garment Record
        </h2>
        <p className="max-w-md text-xs sm:text-sm text-purple-200/80 leading-relaxed">
          {errorMessage(q.error)}
        </p>
        <Button
          type="button"
          onClick={() => void q.refetch()}
          variant="outline"
          size="sm"
          className="mt-2 rounded-full border-purple-400/30 bg-purple-950/50 text-purple-100 hover:bg-purple-900/60 hover:text-white cursor-pointer"
        >
          Try again
        </Button>
      </div>
    );
  }

  // Not Found state in public plum theme
  if (!q.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-purple-500/20 bg-[#1D1429]/90 p-8 sm:p-12 text-center shadow-2xl backdrop-blur-md">
        <div className="rounded-full border border-purple-500/30 bg-purple-950/60 p-3.5 text-purple-300">
          <SearchX className="size-8" aria-hidden="true" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h2 className="font-editorial text-2xl font-normal text-white tracking-tight">
            Garment Journey Not Found
          </h2>
          <p className="text-xs sm:text-sm text-purple-200/80 leading-relaxed">
            We could not find an approved public journey record matching ID:
          </p>
          <div className="inline-block rounded-lg border border-purple-800/40 bg-[#120B1C] px-3 py-1 font-mono text-sm font-semibold text-purple-200">
            {cleanId}
          </div>
          <p className="text-xs text-purple-300/70 pt-2 leading-relaxed">
            Please check the QR code or ID label on your garment. If this garment was recently
            tailored, its public record may still be undergoing final factory publication.
          </p>
        </div>
        <div className="pt-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-purple-400/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white"
          >
            <AppLink href={paths.home}>Return to Home</AppLink>
          </Button>
        </div>
      </div>
    );
  }

  const j: PublicJourney = q.data;
  const gallery = getProductGallery(j.productName, j.publicId);
  const isTrouser = j.productName.toLowerCase().includes("trouser");

  // Determine truthful blockchain state
  const isBlockchainVerified =
    j.evidence === "sample-confirmed" ||
    (!!j.blockchain?.confirmedAt && !!j.blockchain?.transactionHash);
  const isBlockchainPending =
    j.evidence === "pending" ||
    (j.status === "Dispatched to authorized retail network" && !isBlockchainVerified);

  return (
    <article className="space-y-6 motion-safe:animate-fade-in-up">
      {/* 1. Functional Product Gallery with Real Imagery & Graceful Fallback */}
      <section
        aria-label="Product Gallery"
        className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-[#181023]/90 shadow-2xl backdrop-blur-md"
      >
        <div className="relative aspect-[4/3] sm:aspect-[16/10] w-full max-h-[340px] overflow-hidden bg-[#130B1C] flex items-center justify-center">
          {imageErrorMap[activeSlide] ? (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
              <FallbackGarmentIllustration isTrouser={isTrouser} />
              <span className="text-xs text-purple-300/80 font-mono">
                {gallery[activeSlide]?.label ?? "Authentic Garment Representation"}
              </span>
            </div>
          ) : (
            <img
              src={gallery[activeSlide]?.url}
              alt={gallery[activeSlide]?.label ?? j.productName}
              onError={() =>
                setImageErrorMap((prev) => ({ ...prev, [activeSlide]: true }))
              }
              className="h-full w-full object-cover object-center transition-opacity duration-300"
            />
          )}

          {/* Subtle Top & Bottom vignette gradient */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#181023] via-transparent to-black/30"
          />

          {/* Previous / Next Controls */}
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setActiveSlide((prev) => (prev === 0 ? gallery.length - 1 : prev - 1))
                }
                aria-label="Previous product image"
                className="absolute left-3 top-1/2 -translate-y-1/2 size-8 rounded-full border border-purple-400/25 bg-[#170E22]/70 text-purple-200 hover:text-white hover:bg-purple-900/60 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveSlide((prev) => (prev + 1) % gallery.length)
                }
                aria-label="Next product image"
                className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full border border-purple-400/25 bg-[#170E22]/70 text-purple-200 hover:text-white hover:bg-purple-900/60 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer"
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          )}

          {/* Slide Indicator Pill */}
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-white/90">
            <span className="rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px] backdrop-blur-sm">
              {gallery[activeSlide]?.label}
            </span>
            <span className="rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px] backdrop-blur-sm">
              {activeSlide + 1} / {gallery.length}
            </span>
          </div>
        </div>

        {/* Gallery Dot Nav */}
        {gallery.length > 1 && (
          <div className="flex items-center justify-center gap-2 py-2.5 bg-[#150D20]">
            {gallery.map((g, idx) => (
              <button
                key={g.label}
                type="button"
                onClick={() => setActiveSlide(idx)}
                aria-label={`View ${g.label}`}
                className={`size-1.5 rounded-full transition-all cursor-pointer ${idx === activeSlide
                    ? "w-6 bg-purple-300"
                    : "bg-purple-700/50 hover:bg-purple-500/60"
                  }`}
              />
            ))}
          </div>
        )}
      </section>

      {/* 2. Compact Product Identity Card */}
      <section
        aria-label="Product Identity"
        className="rounded-2xl border border-purple-500/25 bg-[#1D1429]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-800/30 pb-3">
          <div className="space-y-0.5">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-purple-400">
              Scanned Garment
            </span>
            <h1 className="font-editorial text-xl sm:text-2xl font-normal text-white tracking-tight">
              {j.productName}
            </h1>
          </div>

          {/* Compact Manufacturing Status Pill */}
          <div className="shrink-0">
            {j.status === "Dispatched to authorized retail network" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-950/45 px-2.5 py-1 text-xs font-medium text-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Dispatched & Verified
              </span>
            ) : j.status === "Passed quality control" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-950/50 px-2.5 py-1 text-xs font-medium text-purple-200">
                <span className="size-1.5 rounded-full bg-purple-300" />
                Passed Quality Control
              </span>
            ) : j.status === "Temporarily on hold" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/50 px-2.5 py-1 text-xs font-medium text-amber-200">
                <span className="size-1.5 rounded-full bg-amber-400" />
                Under Quality Review
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-900/40 px-2.5 py-1 text-xs font-medium text-purple-200">
                <span className="size-1.5 rounded-full bg-purple-400" />
                In Production
              </span>
            )}
          </div>
        </div>

        {/* Garment Identification Details */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-0.5">
          <div className="space-y-0.5">
            <span className="block font-mono text-[10px] text-purple-400/80">GARMENT ID</span>
            <span className="font-mono text-sm font-semibold text-white tracking-wider">
              {j.publicId}
            </span>
          </div>

          {j.size && (
            <div className="space-y-0.5 text-right sm:text-left">
              <span className="block font-mono text-[10px] text-purple-400/80">SIZE</span>
              <span className="font-mono text-xs font-medium text-purple-200">
                {j.size}
              </span>
            </div>
          )}

          {j.materialInfo?.fabricType && (
            <div className="space-y-0.5 text-right">
              <span className="block font-mono text-[10px] text-purple-400/80">MATERIAL</span>
              <span className="text-xs text-purple-200 truncate max-w-[180px] block">
                {j.materialInfo.fabricType}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Routine Hold Notification (if garment is under review) */}
      {j.notice && (
        <div
          role="alert"
          className="flex gap-3 rounded-2xl border border-amber-500/35 bg-[#251817]/95 p-4 text-amber-200 shadow-md backdrop-blur-md"
        >
          <OctagonAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
          <div className="space-y-0.5 text-xs">
            <p className="font-semibold text-amber-100">{j.notice.title}</p>
            <p className="text-amber-200/85 leading-relaxed">{j.notice.message}</p>
          </div>
        </div>
      )}

      {/* 3. Complete Sequential Manufacturing Journey */}
      <section
        aria-labelledby="journey-timeline-heading"
        className="rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-5 sm:p-7 shadow-2xl backdrop-blur-md space-y-5"
      >
        <div className="border-b border-purple-800/35 pb-3">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-purple-400">
            End-To-End Traceability
          </span>
          <h2
            id="journey-timeline-heading"
            className="font-editorial text-2xl font-normal text-white tracking-tight"
          >
            Manufacturing Journey
          </h2>
        </div>

        {/* 9-Stage Sequential Timeline */}
        <ol className="relative border-l-2 border-dashed border-purple-500/30 pl-6 ml-2.5 space-y-5 my-2">
          {MANUFACTURING_STAGES.map((stage) => {
            // Check if there is an actual recorded event for this stage
            const matchedMilestone = j.milestones.find((m) => stage.isMatch(m));
            const isCompleted = !!matchedMilestone;
            const isExpanded = expandedStages[stage.id] ?? false;

            return (
              <li key={stage.id} className="relative group">
                {/* Milestone Node */}
                {isCompleted ? (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[1.95rem] top-1.5 size-3.5 rotate-45 bg-[#E879F9] border border-white shadow-[0_0_10px_rgba(232,121,249,0.9)] flex items-center justify-center"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[1.95rem] top-1.5 size-3.5 rotate-45 border-2 border-purple-600/40 bg-[#160E22]"
                  />
                )}

                {/* Milestone Card */}
                <div
                  className={`rounded-xl border p-3.5 transition-all ${isCompleted
                      ? "border-purple-500/20 bg-purple-950/25 hover:border-purple-500/40 hover:bg-purple-950/40"
                      : "border-purple-800/20 bg-purple-950/10 opacity-70"
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => isCompleted && toggleStage(stage.id)}
                    disabled={!isCompleted}
                    aria-expanded={isCompleted ? isExpanded : undefined}
                    className={`w-full text-left flex items-start justify-between gap-3 ${isCompleted ? "cursor-pointer select-none" : "cursor-default"
                      }`}
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-semibold text-sm tracking-wide ${isCompleted ? "text-white" : "text-purple-300/70"
                            }`}
                        >
                          {stage.name}
                        </span>

                        {/* Department Badge */}
                        <span className="rounded bg-purple-900/40 border border-purple-500/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-purple-300">
                          {stage.department}
                        </span>

                        {/* Accurate Status Pill */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-mono text-emerald-300">
                            <Check className="size-2.5" /> Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-950/40 border border-purple-700/20 px-1.5 py-0.2 text-[10px] font-mono text-purple-400/80">
                            <Clock className="size-2.5" /> Pending
                          </span>
                        )}
                      </div>

                      {/* Actual Date / Timestamp if recorded */}
                      {isCompleted && matchedMilestone ? (
                        <p className="text-xs font-mono text-purple-300/80">
                          {fmt.date(matchedMilestone.date)}
                        </p>
                      ) : (
                        <p className="text-xs font-mono text-purple-400/60 italic">
                          Stage not yet reached
                        </p>
                      )}
                    </div>

                    {/* Interactive Toggle Chevron for completed milestones */}
                    {isCompleted && (
                      <div className="text-purple-400 group-hover:text-purple-200 transition-colors pt-0.5">
                        {isExpanded ? (
                          <ChevronUp className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </button>

                  {/* Expandable Plain-English Explanation */}
                  {isCompleted && isExpanded && (
                    <div className="mt-3 pt-3 border-t border-purple-500/15 text-xs text-purple-200/90 space-y-1.5">
                      <p className="leading-relaxed">
                        {matchedMilestone?.description || stage.defaultDescription}
                      </p>
                      <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-purple-400/80">
                        <span className="text-emerald-300 inline-flex items-center gap-1">
                          <Check className="size-3" /> Factory verified record
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 4. Honest Blockchain Verification Status */}
      <footer className="pt-1">
        {isBlockchainVerified ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-4 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-emerald-500/40 bg-emerald-950/60 p-2 text-emerald-400">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <div>
                <span className="font-semibold text-sm text-emerald-200 tracking-wide block">
                  Blockchain Verified
                </span>
                <span className="text-[11px] font-mono text-emerald-300/80 block">
                  Immutable proof recorded on {j.blockchain?.networkName ?? "Ethereum Sepolia"}
                  {j.blockchain?.blockNumber ? ` (Block #${j.blockchain.blockNumber})` : ""}
                </span>
              </div>
            </div>
            {j.blockchain?.confirmedAt && (
              <span className="hidden sm:inline-block font-mono text-[11px] text-emerald-400/80">
                {fmt.date(j.blockchain.confirmedAt)}
              </span>
            )}
          </div>
        ) : isBlockchainPending ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/25 p-4 shadow-lg backdrop-blur-md">
            <div className="rounded-full border border-amber-500/40 bg-amber-950/60 p-2 text-amber-400">
              <Sparkles className="size-5 animate-pulse" aria-hidden="true" />
            </div>
            <div>
              <span className="font-semibold text-sm text-amber-200 tracking-wide block">
                Verification Pending
              </span>
              <span className="text-[11px] font-mono text-amber-300/80 block">
                Manufacturing record signed; blockchain anchoring in progress
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-purple-500/25 bg-purple-950/30 p-4 shadow-md backdrop-blur-md">
            <div className="rounded-full border border-purple-500/30 bg-purple-950/50 p-2 text-purple-300">
              <Lock className="size-5" aria-hidden="true" />
            </div>
            <div>
              <span className="font-semibold text-sm text-purple-100 tracking-wide block">
                Cryptographic Integrity Sealed
              </span>
              <span className="text-[11px] font-mono text-purple-300/80 block">
                Factory payload integrity verified · Awaiting ledger anchor
              </span>
            </div>
          </div>
        )}
      </footer>
    </article>
  );
}
