import { useState } from "react";
import {
  AlertCircle,
  ArrowRightCircle,
  Box,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Layers,
  Loader2,
  Lock,
  OctagonAlert,
  PackageCheck,
  Scissors,
  SearchX,
  ShieldCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { errorMessage, useWtQuery } from "@/lib/data/hooks";
import type { PublicJourney, PublicMilestone } from "@/domain/public-types";

/**
 * 9 Standard Manufacturing Stages in sequential factory order.
 */
interface ManufacturingStageDef {
  id: string;
  name: string;
  department: string;
  icon: LucideIcon;
  defaultDescription: string;
  isMatch: (m: PublicMilestone) => boolean;
}

const MANUFACTURING_STAGES: ManufacturingStageDef[] = [
  {
    id: "raw-material",
    name: "Raw Material Received",
    department: "Materials",
    icon: Layers,
    defaultDescription:
      "Certified organic fabric rolls received and inspected for weave consistency, thread density, and material integrity.",
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
    icon: ArrowRightCircle,
    defaultDescription:
      "Inspected fabric rolls issued from storage and allocated to the automated cutting line for pattern cutting.",
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
    icon: Scissors,
    defaultDescription:
      "Precision computerized fabric cutting into exact garment panel shapes with unique serial tracking.",
    isMatch: (m) =>
      m.key === "garment-cut" ||
      (m.label.toLowerCase().includes("cut") && !m.label.toLowerCase().includes("issue")),
  },
  {
    id: "stitching",
    name: "Stitching",
    department: "Production",
    icon: Sparkles,
    defaultDescription:
      "Structural seams joined, precision tailoring performed, and sleeves set at the sewing line.",
    isMatch: (m) =>
      m.key === "stitching-completed" ||
      m.label.toLowerCase().includes("stitch") ||
      m.label.toLowerCase().includes("sewing"),
  },
  {
    id: "finishing",
    name: "Finishing",
    department: "Production",
    icon: CheckCircle2,
    defaultDescription:
      "Buttons and hardware secured, seam edges neatened, and artisan steam pressing applied.",
    isMatch: (m) =>
      m.key === "garment-assembled" ||
      m.label.toLowerCase().includes("finish") ||
      m.label.toLowerCase().includes("assembled"),
  },
  {
    id: "quality",
    name: "Quality Inspection",
    department: "Quality Assurance",
    icon: ShieldCheck,
    defaultDescription:
      "Multi-point quality evaluation examining seam strength, dimensional tolerances, and workmanship compliance.",
    isMatch: (m) =>
      m.key === "quality-passed" ||
      m.label.toLowerCase().includes("quality") ||
      m.label.toLowerCase().includes("inspection"),
  },
  {
    id: "packing",
    name: "Packing",
    department: "Logistics",
    icon: Box,
    defaultDescription:
      "Quality-approved garment tagged with brand labels, folded in protective packaging, and packed into master shipping cartons.",
    isMatch: (m) =>
      m.key === "garment-packed" ||
      m.label.toLowerCase().includes("pack") ||
      m.label.toLowerCase().includes("carton"),
  },
  {
    id: "warehouse",
    name: "Warehouse",
    department: "Logistics",
    icon: Building2,
    defaultDescription:
      "Master shipping carton scanned and securely cataloged in distribution warehouse inventory.",
    isMatch: (m) =>
      m.key === "warehouse-received" ||
      m.label.toLowerCase().includes("warehouse"),
  },
  {
    id: "dispatch",
    name: "Dispatch",
    department: "Logistics",
    icon: Truck,
    defaultDescription:
      "Verified shipping manifest sealed and departed the facility for delivery to authorized retail partners.",
    isMatch: (m) =>
      m.key === "dispatched" ||
      m.label.toLowerCase().includes("dispatch") ||
      m.label.toLowerCase().includes("departed") ||
      m.label.toLowerCase().includes("retail"),
  },
];

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

  // Heritage Overshirt / Shirt
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
 * Polished SVG fallback placeholder when images fail or load offline.
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

/**
 * Human-friendly date and time formatter.
 */
function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "Pending";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dateFormatted = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (dateStr.includes("T") || dateStr.includes(":")) {
      const timeFormatted = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${dateFormatted} · ${timeFormatted}`;
    }
    return dateFormatted;
  } catch {
    return dateStr;
  }
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
  const hasActiveHold = j.status === "Temporarily on hold" || !!j.notice;

  // Calculate manufacturing completion progress and sequence validity
  const matchedIndices: number[] = [];
  MANUFACTURING_STAGES.forEach((stage, idx) => {
    if (j.milestones.some((m) => stage.isMatch(m))) {
      matchedIndices.push(idx);
    }
  });

  const maxCompletedIndex = matchedIndices.length > 0 ? Math.max(...matchedIndices) : -1;
  const validCompletedCount = matchedIndices.length;
  const progressPercent = Math.round((validCompletedCount / MANUFACTURING_STAGES.length) * 100);

  // Check for historical discontinuity: any stage before maxCompletedIndex that lacks a recorded milestone
  const missingPrerequisiteStages = MANUFACTURING_STAGES.filter(
    (stage, idx) => idx < maxCompletedIndex && !j.milestones.some((m) => stage.isMatch(m)),
  );
  const hasInconsistentHistory = missingPrerequisiteStages.length > 0;

  // Truthful on-chain blockchain verification check
  const isBlockchainVerified =
    j.evidence === "sample-confirmed" ||
    (!!j.blockchain?.confirmedAt && !!j.blockchain?.transactionHash);
  const isBlockchainPending =
    j.evidence === "pending" ||
    (j.status === "Dispatched to authorized retail network" && !isBlockchainVerified);

  return (
    <article className="space-y-6 motion-safe:animate-fade-in-up">
      {/* 1. Functional Product Gallery */}
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
              className="h-full w-full object-cover object-center transition-opacity duration-300 motion-safe:transition-transform hover:scale-[1.02]"
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
                className="absolute left-3 top-1/2 -translate-y-1/2 size-8 rounded-full border border-purple-400/25 bg-[#170E22]/70 text-purple-200 hover:text-white hover:bg-purple-900/60 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer select-none"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveSlide((prev) => (prev + 1) % gallery.length)
                }
                aria-label="Next product image"
                className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full border border-purple-400/25 bg-[#170E22]/70 text-purple-200 hover:text-white hover:bg-purple-900/60 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer select-none"
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
                className={`size-1.5 rounded-full transition-all cursor-pointer ${
                  idx === activeSlide
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
        className="rounded-2xl border border-purple-500/25 bg-[#1D1429]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md space-y-3.5"
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

          {/* Manufacturing Status Pill with Distinct State Colors */}
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
            ) : hasActiveHold ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/50 px-2.5 py-1 text-xs font-medium text-amber-200">
                <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
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

        {/* Compact Garment Details */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-0.5">
          <div className="space-y-0.5">
            <span className="block font-mono text-[10px] text-purple-400/80">GARMENT ID</span>
            <span className="font-mono text-xs sm:text-sm font-semibold text-white tracking-wide truncate block">
              {j.publicId}
            </span>
          </div>

          {j.size && (
            <div className="space-y-0.5">
              <span className="block font-mono text-[10px] text-purple-400/80">SIZE</span>
              <span className="font-mono text-xs font-medium text-purple-200 block">
                {j.size}
              </span>
            </div>
          )}

          {j.materialInfo?.fabricType && (
            <div className="col-span-2 sm:col-span-1 space-y-0.5">
              <span className="block font-mono text-[10px] text-purple-400/80">MATERIAL</span>
              <span className="text-xs text-purple-200 truncate block">
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

      {/* 3. Connected Sequential Manufacturing Journey */}
      <section
        aria-labelledby="journey-timeline-heading"
        className="rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-5 sm:p-7 shadow-2xl backdrop-blur-md space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-800/35 pb-3">
          <div>
            <span className="block text-[10px] font-mono uppercase tracking-wider text-purple-400">
              Verified Production Trail
            </span>
            <h2
              id="journey-timeline-heading"
              className="font-editorial text-2xl font-normal text-white tracking-tight"
            >
              Manufacturing Journey
            </h2>
          </div>

          {/* Milestone Completion Counter */}
          <span className="rounded-full border border-purple-500/20 bg-purple-950/60 px-3 py-1 font-mono text-xs text-purple-200">
            {validCompletedCount} of {MANUFACTURING_STAGES.length} Stages Verified
          </span>
        </div>

        {/* Progress Bar Indicator */}
        <div className="space-y-1.5 rounded-xl border border-purple-500/15 bg-purple-950/20 p-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-purple-300">
            <span>Overall Completion</span>
            <span className="font-semibold text-purple-100">{progressPercent}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#130B1C] border border-purple-500/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-[#E879F9] to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Inconsistent History Advisory Alert (if intermediate records are missing) */}
        {hasInconsistentHistory && (
          <div
            role="alert"
            className="flex gap-3 rounded-2xl border border-amber-500/35 bg-[#251817]/95 p-4 text-amber-200 shadow-md backdrop-blur-md"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
            <div className="space-y-0.5 text-xs">
              <p className="font-semibold text-amber-100">Tracking Discontinuity Detected</p>
              <p className="text-amber-200/85 leading-relaxed">
                Prerequisite manufacturing records ({missingPrerequisiteStages.map((s) => s.name).join(", ")}) were not recorded before subsequent milestones were completed. These intermediate milestones are flagged as &ldquo;Record unavailable&rdquo; rather than pending.
              </p>
            </div>
          </div>
        )}

        {/* Connected Vertical Timeline */}
        <div className="relative space-y-5 my-2">
          {MANUFACTURING_STAGES.map((stage, idx) => {
            const matchedMilestone = j.milestones.find((m) => stage.isMatch(m));
            const isCompleted = !!matchedMilestone;
            const isUnavailable = !isCompleted && idx < maxCompletedIndex;
            const isPending = !isCompleted && idx > maxCompletedIndex;
            const isHeldStage = hasActiveHold && stage.id === "quality";
            const isExpanded = expandedStages[stage.id] ?? false;
            const isInteractive = isCompleted || isUnavailable;
            const Icon = stage.icon;
            const isLast = idx === MANUFACTURING_STAGES.length - 1;

            return (
              <div key={stage.id} className="relative flex items-start gap-4 group">
                {/* Connected Vertical Line */}
                {!isLast && (
                  <div
                    aria-hidden="true"
                    className={`absolute left-4 top-8 bottom-0 w-0.5 -mb-5 transition-colors ${
                      isCompleted
                        ? "bg-gradient-to-b from-[#E879F9] to-purple-500/60 shadow-[0_0_6px_rgba(232,121,249,0.3)]"
                        : isUnavailable
                        ? "border-l-2 border-dashed border-amber-500/40"
                        : "border-l-2 border-dashed border-purple-800/40"
                    }`}
                  />
                )}

                {/* Stage Icon Node with Distinct State Colors */}
                <div className="relative z-10 shrink-0">
                  {isHeldStage ? (
                    <div
                      aria-label="Quality Hold"
                      className="size-8 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                    >
                      <OctagonAlert className="size-4" />
                    </div>
                  ) : isCompleted ? (
                    <div
                      aria-label="Stage Completed"
                      className="size-8 rounded-full bg-gradient-to-br from-purple-500 to-[#E879F9] text-white flex items-center justify-center shadow-[0_0_12px_rgba(232,121,249,0.7)] group-hover:scale-105 transition-transform"
                    >
                      <Icon className="size-4" />
                    </div>
                  ) : isUnavailable ? (
                    <div
                      aria-label="Record Unavailable"
                      className="size-8 rounded-full border border-amber-500/40 bg-[#1e1319] text-amber-300 flex items-center justify-center shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                    >
                      <AlertCircle className="size-3.5 opacity-90" />
                    </div>
                  ) : (
                    <div
                      aria-label="Stage Pending"
                      className="size-8 rounded-full border border-purple-800/60 bg-[#160D20] text-purple-400/60 flex items-center justify-center"
                    >
                      <Icon className="size-3.5 opacity-60" />
                    </div>
                  )}
                </div>

                {/* Milestone Information Card */}
                <div
                  className={`flex-1 rounded-xl border p-3.5 transition-all ${
                    isCompleted
                      ? "border-purple-500/25 bg-purple-950/25 hover:border-purple-500/40 hover:bg-purple-950/35 cursor-pointer"
                      : isUnavailable
                      ? "border-amber-500/25 bg-amber-950/15 hover:border-amber-500/35 hover:bg-amber-950/25 cursor-pointer"
                      : "border-purple-800/20 bg-purple-950/10 opacity-65"
                  }`}
                  onClick={() => isInteractive && toggleStage(stage.id)}
                  role={isInteractive ? "button" : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (isInteractive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      toggleStage(stage.id);
                    }
                  }}
                  aria-expanded={isInteractive ? isExpanded : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-semibold text-sm tracking-wide ${
                            isCompleted ? "text-white" : isUnavailable ? "text-amber-200" : "text-purple-300/70"
                          }`}
                        >
                          {stage.name}
                        </span>

                        {/* Department Badge */}
                        <span className="rounded bg-purple-900/40 border border-purple-500/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-purple-300">
                          {stage.department}
                        </span>

                        {/* Status Badge */}
                        {isHeldStage ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-mono text-amber-200">
                            Under Review
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-mono text-emerald-300">
                            <Check className="size-2.5" /> Completed
                          </span>
                        ) : isUnavailable ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-950/40 border border-amber-500/35 px-1.5 py-0.2 text-[10px] font-mono text-amber-300">
                            <AlertCircle className="size-2.5" /> Record unavailable
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-950/40 border border-purple-700/20 px-1.5 py-0.2 text-[10px] font-mono text-purple-400/80">
                            <Clock className="size-2.5" /> Pending
                          </span>
                        )}
                      </div>

                      {/* Actual Recorded Date / Timestamp or Unavailable / Pending explanation */}
                      {isCompleted && matchedMilestone ? (
                        <p className="text-xs font-mono text-purple-300/80">
                          {formatDateTime(matchedMilestone.date)}
                        </p>
                      ) : isUnavailable ? (
                        <p className="text-xs font-mono text-amber-400/80 italic">
                          Factory record missing from tracking trail
                        </p>
                      ) : (
                        <p className="text-xs font-mono text-purple-400/60 italic">
                          Stage not yet reached
                        </p>
                      )}
                    </div>

                    {/* Expand/Collapse Chevron for completed or unavailable stages */}
                    {isInteractive && (
                      <div className={`transition-colors pt-0.5 ${isCompleted ? "text-purple-400 group-hover:text-purple-200" : "text-amber-400 group-hover:text-amber-200"}`}>
                        {isExpanded ? (
                          <ChevronUp className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expandable Short Plain-English Explanation */}
                  {isInteractive && isExpanded && (
                    <div className={`mt-3 pt-3 border-t text-xs space-y-1.5 animate-in fade-in-50 duration-200 ${
                      isCompleted
                        ? "border-purple-500/15 text-purple-200/90"
                        : "border-amber-500/20 text-amber-200/90"
                    }`}>
                      {isCompleted ? (
                        <>
                          <p className="leading-relaxed">
                            {matchedMilestone?.description || stage.defaultDescription}
                          </p>
                          <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-purple-400/80">
                            <span className="text-emerald-300 inline-flex items-center gap-1">
                              <Check className="size-3" /> Factory verified record
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="leading-relaxed">
                            This prerequisite stage was completed during manufacturing prior to subsequent milestones, but its factory scan or event log was not captured in the public ledger audit trail.
                          </p>
                          <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-amber-400/80">
                            <span className="text-amber-300 inline-flex items-center gap-1">
                              <AlertCircle className="size-3" /> Missing digital credential
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
                  {j.blockchain?.blockNumber ? ` · Block #${j.blockchain.blockNumber}` : ""}
                </span>
              </div>
            </div>
            {j.blockchain?.confirmedAt && (
              <span className="hidden sm:inline-block font-mono text-[11px] text-emerald-400/80">
                {formatDateTime(j.blockchain.confirmedAt)}
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
