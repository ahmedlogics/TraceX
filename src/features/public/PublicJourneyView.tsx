import { useEffect, useState } from "react";
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
  Cpu,
  Layers,
  Loader2,
  OctagonAlert,
  Pause,
  Play,
  QrCode,
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
      "Inspected fabric rolls cleared from storage and allocated to the cutting line for precision pattern layout.",
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
      "Individual garment panels precisely cut from fabric lot and paired with an individual tracking credential.",
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
      "Structural seams joined, sleeve panels set, and precision tailoring completed at the designated sewing line.",
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
      "Hardware attached, seam edges trimmed and neatened, and artisan steam pressing completed for final shape.",
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
      "Garment passed multi-point quality inspection, verifying seam integrity, dimensional tolerances, and finish.",
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
      "Quality-approved garment tagged with brand label, folded in protective wrap, and packed into master shipping carton.",
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
      "Master shipping carton scanned, verified on intake manifest, and safely cataloged in central warehouse inventory.",
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
      "Sealed commercial consignment departed our facility on scheduled transit to an authorized retail partner.",
    isMatch: (m) =>
      m.key === "dispatched" ||
      m.label.toLowerCase().includes("dispatch") ||
      m.label.toLowerCase().includes("departed") ||
      m.label.toLowerCase().includes("retail"),
  },
];

interface ProductGalleryImage {
  url: string;
  fallbackUrl?: string;
  label: string;
  caption: string;
}

function getProductGallery(productName: string, publicId: string): ProductGalleryImage[] {
  const isTrouser =
    productName.toLowerCase().includes("trouser") ||
    publicId.toLowerCase().includes("trouser") ||
    productName.toLowerCase().includes("pant") ||
    publicId.toLowerCase().includes("pant");

  if (isTrouser) {
    return [
      {
        url: "/images/products/trouser-studio.jpg",
        fallbackUrl:
          "https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?auto=format&fit=crop&w=1200&q=85",
        label: "Front Studio View",
        caption: "Minimalist relaxed tailored silhouette in certified organic cotton.",
      },
      {
        url: "/images/products/trouser-detail.jpg",
        fallbackUrl:
          "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=1200&q=85",
        label: "Tailoring & Seam Detail",
        caption: "Hand-finished waistband, reinforced horn button, and tailored pocket welt.",
      },
      {
        url: "/images/products/trouser-fabric.jpg",
        fallbackUrl:
          "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=85",
        label: "Artisanal Twill Drape",
        caption: "Heavyweight organic cotton weave with fluid, tactile handfeel.",
      },
    ];
  }

  // Heritage Overshirt / Oxford Shirt (Clean flat lay from the very start as default)
  return [
    {
      url: "/images/products/shirt-fabric.jpg",
      fallbackUrl:
        "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=1200&q=85",
      label: "Classic Oxford View",
      caption: "Crisp organic cotton Oxford shirt with precision tailoring and clean drape.",
    },
    {
      url: "/images/products/shirt-detail.jpg",
      fallbackUrl:
        "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=1200&q=85",
      label: "Collar & Pearl Button Detail",
      caption: "Sustainably sourced mother-of-pearl buttons and single-needle topstitching.",
    },
    {
      url: "/images/products/shirt-studio.jpg",
      fallbackUrl:
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=1200&q=85",
      label: "Studio Tailored View",
      caption: "Fine organic poplin weave with natural breathability and tactile depth.",
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
 * Elegant tailoring needle with flowing golden thread motif.
 * Adds artisanal craftsmanship and warm contrast against the dark plum palette.
 */
function SewingNeedleMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Curved golden thread flowing through the eye */}
      <path
        d="M6 24 C28 6, 44 42, 68 24 C82 14, 96 32, 112 21"
        stroke="#F59E0B"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="3.5 3.5"
      />
      <path
        d="M112 21 C117 18, 122 19, 127 21"
        stroke="#FCD34D"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Needle Eye */}
      <ellipse cx="127.5" cy="21" rx="1.8" ry="0.9" transform="rotate(-15 127.5 21)" stroke="#E2E8F0" strokeWidth="1" />
      {/* Needle Body (sleek tapered metallic needle) */}
      <path
        d="M125 21.5 L154 14.5 L127 20 Z"
        fill="url(#needleMetallicGrad)"
      />
      {/* Needle Tip Shimmer */}
      <circle cx="154" cy="14.5" r="0.8" fill="#FEF08A" />
      <defs>
        <linearGradient id="needleMetallicGrad" x1="125" y1="21.5" x2="154" y2="14.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CBD5E1" />
          <stop offset="0.6" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#FEF08A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Human-friendly date formatter.
 */
function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Pending";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function PublicJourneyView({ publicId }: { publicId: string }) {
  const cleanId = publicId.trim();
  const q = useWtQuery(["public-journey", cleanId], (c) => c.getPublicJourney(cleanId));

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [imageErrorMap, setImageErrorMap] = useState<Record<number, boolean>>({});
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});

  // Auto-play slideshow every 4.2 seconds; pauses on hover or user interaction
  useEffect(() => {
    if (isPaused || !q.data) return;
    const galleryLength = getProductGallery(q.data.productName, cleanId).length;
    if (galleryLength <= 1) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % galleryLength);
    }, 4200);
    return () => clearInterval(timer);
  }, [isPaused, q.data, cleanId]);

  const toggleStage = (stageId: string) => {
    setExpandedStages((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  const scrollToJourney = () => {
    const el = document.getElementById("manufacturing-journey");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Loading state in public plum theme
  if (q.isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-purple-500/20 bg-[#1D1429]/80 p-12 text-center shadow-xl backdrop-blur-md">
        <Loader2 className="size-8 animate-spin text-purple-400" aria-hidden="true" />
        <p className="font-cormorant italic text-2xl text-white tracking-wide">
          Loading garment journey…
        </p>
        <p className="text-xs text-purple-300/70 font-mono">
          Retrieving passport for {cleanId}
        </p>
      </div>
    );
  }

  // Error state in public plum theme
  if (q.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/40 bg-[#25121E]/90 p-8 sm:p-12 text-center shadow-xl backdrop-blur-md">
        <AlertCircle className="size-8 text-rose-400" aria-hidden="true" />
        <h2 className="font-cormorant italic text-2xl font-medium text-white">
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
          <h2 className="font-cormorant italic text-3xl font-normal text-white tracking-tight">
            Garment Journey Not Found
          </h2>
          <p className="text-xs sm:text-sm text-purple-200/80 leading-relaxed">
            No published garment record was found matching ID:
          </p>
          <div className="inline-block rounded-lg border border-purple-800/40 bg-[#120B1C] px-3 py-1 font-mono text-sm font-semibold text-purple-200">
            {cleanId}
          </div>
          <p className="text-xs text-purple-300/70 pt-2 leading-relaxed">
            Please check the QR code or tracking code on your garment tag.
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
  const isTrouser =
    j.productName.toLowerCase().includes("trouser") ||
    j.publicId.toLowerCase().includes("trouser") ||
    j.productName.toLowerCase().includes("pant") ||
    j.publicId.toLowerCase().includes("pant");
  const hasActiveHold = j.status === "Temporarily on hold" || !!j.notice;

  // Calculate manufacturing completion progress
  const matchedIndices: number[] = [];
  MANUFACTURING_STAGES.forEach((stage, idx) => {
    if (j.milestones.some((m) => stage.isMatch(m))) {
      matchedIndices.push(idx);
    }
  });

  const validCompletedCount = matchedIndices.length;
  const progressPercent = Math.round((validCompletedCount / MANUFACTURING_STAGES.length) * 100);

  // Real manufacturing completion check strictly from records
  const isDispatched =
    j.status === "Dispatched to authorized retail network" ||
    j.milestones.some((m) => m.key === "dispatched");
  const isAllStagesCompleted = validCompletedCount === MANUFACTURING_STAGES.length;

  // Real Quality Control check - strictly based on garment records
  const isQualityPassed =
    !hasActiveHold &&
    (j.status === "Passed quality control" ||
      j.status === "Dispatched to authorized retail network" ||
      j.milestones.some((m) => m.key === "quality-passed") ||
      j.qualityInfo?.disposition === "passed" ||
      j.qualityInfo?.disposition === "released");

  // Status mapping - strictly derived from records (never claim quality passed or dispatched prematurely)
  const currentStatusLabel = isDispatched
    ? "Dispatched"
    : hasActiveHold
      ? "Under Review"
      : isQualityPassed
        ? "Quality Approved"
        : "In Production";

  // Product Display Name (Clean editorial formatting)
  const displayProductName = isTrouser
    ? "Cotton Trouser"
    : j.productName.includes("Oxford") || j.productName.includes("poplin") || j.productName.includes("shirt")
      ? "Classic Oxford Shirt"
      : j.productName;

  // Genuine Ledger confirmation status - true ONLY when real blockchain confirmation exists
  const isBlockchainConfirmed =
    j.evidence === "sample-confirmed" ||
    (!!j.blockchain?.confirmedAt && !!j.blockchain?.transactionHash);

  // Genuinely verified: only when all stages are completed, Final QC passed, and ledger is confirmed
  const isBlockchainVerified = isDispatched && isQualityPassed && isBlockchainConfirmed;

  // 4-state customer verification outcome
  const verificationOutcome: "verified" | "pending" | "failed" | "unavailable" =
    j.evidence === "failed"
      ? "failed"
      : isBlockchainVerified
        ? "verified"
        : j.evidence === "unavailable"
          ? "unavailable"
          : "pending";

  return (
    <article className="space-y-4 motion-safe:animate-fade-in-up">
      {/* 1. Centered Product Image Gallery with Integrated Garment Header & Sign of Stitching */}
      <section
        aria-label="Product Gallery"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative overflow-hidden rounded-2xl border border-purple-500/25 bg-[#140D1E] shadow-xl backdrop-blur-md w-full"
      >
        {/* Progress Timer Bar */}
        {gallery.length > 1 && !isPaused && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-purple-950/60 z-30 overflow-hidden">
            <div
              key={activeSlide}
              className="h-full bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 animate-pulse"
              style={{
                width: "100%",
                transition: "width 4200ms linear",
              }}
            />
          </div>
        )}

        {/* Integrated Header: Product Name, Status & Sign of Stitching */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-purple-500/20 bg-gradient-to-r from-[#191024]/90 via-[#160E22]/80 to-[#120B1C]/90">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h1 className="font-cormorant italic text-2xl sm:text-3xl font-normal tracking-tight text-white leading-tight">
              {displayProductName}
            </h1>
            <span className="font-mono text-xs text-purple-300/80">
              {j.size ? `Size ${j.size} · ` : ""}Organic Cotton · {j.publicId.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Badge */}
            <div className="shrink-0">
              {isDispatched ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-950/45 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Dispatched
                </span>
              ) : hasActiveHold ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-950/45 px-2.5 py-0.5 text-xs font-medium text-amber-200">
                  <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Under Review
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/35 bg-purple-950/50 px-2.5 py-0.5 text-xs font-medium text-purple-200">
                  <span className="size-1.5 rounded-full bg-purple-400" />
                  {currentStatusLabel}
                </span>
              )}
            </div>

            {/* Sign of Stitching Motif */}
            <SewingNeedleMotif className="h-4 w-20 text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
          </div>
        </div>

        {/* Centered Image Stage - Proportional Banner */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveSlide((prev) => (prev + 1) % gallery.length)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveSlide((prev) => (prev + 1) % gallery.length);
            }
          }}
          aria-label={`Slide ${activeSlide + 1} of ${gallery.length}: ${gallery[activeSlide]?.label}. Click to advance.`}
          className="relative aspect-[21/9] sm:aspect-[2.4/1] w-full max-h-[250px] sm:max-h-[275px] overflow-hidden bg-[#100818] flex items-center justify-center cursor-pointer group select-none"
        >
          {gallery.map((img, idx) => {
            const isActive = idx === activeSlide;
            const hasError = imageErrorMap[idx];

            return (
              <div
                key={img.url + idx}
                aria-hidden={!isActive}
                className={`absolute inset-0 transition-all duration-700 ease-in-out flex items-center justify-center ${isActive
                  ? "opacity-100 z-10 scale-100"
                  : "opacity-0 z-0 scale-95 pointer-events-none"
                  }`}
              >
                {hasError ? (
                  <div className="flex flex-col items-center justify-center p-4 text-center space-y-1.5">
                    <FallbackGarmentIllustration isTrouser={isTrouser} />
                    <span className="text-[11px] text-purple-300/80 font-mono">
                      {img.label}
                    </span>
                  </div>
                ) : (
                  <img
                    src={img.url}
                    alt={img.label}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (img.fallbackUrl && target.src !== img.fallbackUrl) {
                        target.src = img.fallbackUrl;
                      } else {
                        setImageErrorMap((prev) => ({ ...prev, [idx]: true }));
                      }
                    }}
                    className={`h-full w-full object-cover object-center transition-transform duration-700 ease-out ${isActive ? "scale-100 group-hover:scale-[1.02]" : "scale-95"
                      }`}
                  />
                )}
              </div>
            );
          })}

          {/* Subtle Vignette Overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#140D1E] via-transparent to-black/20 z-10"
          />

          {/* Chevrons */}
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSlide((prev) => (prev === 0 ? gallery.length - 1 : prev - 1));
                }}
                aria-label="Previous product image"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 size-7 sm:size-8 rounded-full border border-purple-400/30 bg-[#170E22]/80 text-purple-200 hover:text-white hover:bg-purple-900/90 flex items-center justify-center backdrop-blur-md transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSlide((prev) => (prev + 1) % gallery.length);
                }}
                aria-label="Next product image"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 size-7 sm:size-8 rounded-full border border-purple-400/30 bg-[#170E22]/80 text-purple-200 hover:text-white hover:bg-purple-900/90 flex items-center justify-center backdrop-blur-md transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          )}

          {/* Centered Indicator Dots */}
          {gallery.length > 1 && (
            <div className="absolute bottom-2.5 left-0 right-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full border border-purple-500/25 backdrop-blur-md shadow-md pointer-events-auto">
                {gallery.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSlide(idx);
                    }}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${idx === activeSlide
                      ? "w-5 bg-gradient-to-r from-amber-400 via-pink-400 to-purple-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                      : "w-1.5 bg-purple-700/60 hover:bg-purple-400"
                      }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. Three Separate Customer Statuses: Production, Quality, Blockchain */}
      <section
        aria-label="Garment Status Overview"
        className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full"
      >
        {/* Production Status */}
        <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-[#1C1226]/90 to-[#140C1E]/90 p-3.5 space-y-1">
          <span className="block font-mono text-[9px] uppercase tracking-wider text-purple-400/80">
            1. Production Status
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${isDispatched
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : hasActiveHold
                  ? "bg-amber-400 animate-pulse"
                  : "bg-purple-400 animate-pulse"
                }`}
            />
            <span className="text-xs font-semibold text-white">
              {isDispatched
                ? "Complete (9 of 9 Stages)"
                : hasActiveHold
                  ? "Temporarily on Hold"
                  : `In Production (${validCompletedCount}/9)`}
            </span>
          </div>
          <p className="text-[11px] text-purple-300/70 font-light">
            {isDispatched
              ? "All factory stages completed"
              : `Stage ${validCompletedCount} of 9 reached`}
          </p>
        </div>

        {/* Quality Approval */}
        <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-[#1C1226]/90 to-[#140C1E]/90 p-3.5 space-y-1">
          <span className="block font-mono text-[9px] uppercase tracking-wider text-purple-400/80">
            2. Quality Approval
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${isQualityPassed
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : hasActiveHold
                  ? "bg-amber-400 animate-pulse"
                  : "bg-purple-400"
                }`}
            />
            <span className="text-xs font-semibold text-white">
              {isQualityPassed
                ? "Quality Approved"
                : hasActiveHold
                  ? "Under Quality Review"
                  : "Pending Final QC"}
            </span>
          </div>
          <p className="text-[11px] text-purple-300/70 font-light">
            {isQualityPassed
              ? "Multi-point inspection passed"
              : hasActiveHold
                ? "Quality evaluation in progress"
                : "Final inspection after assembly"}
          </p>
        </div>

        {/* Blockchain Record */}
        <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-[#1C1226]/90 to-[#140C1E]/90 p-3.5 space-y-1">
          <span className="block font-mono text-[9px] uppercase tracking-wider text-purple-400/80">
            3. Blockchain Record
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${isBlockchainVerified
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : verificationOutcome === "failed"
                  ? "bg-rose-400"
                  : verificationOutcome === "unavailable"
                    ? "bg-slate-400"
                    : "bg-amber-400 animate-pulse"
                }`}
            />
            <span className="text-xs font-semibold text-white">
              {isBlockchainVerified
                ? "Blockchain Verified"
                : verificationOutcome === "failed"
                  ? "Verification Failed"
                  : verificationOutcome === "unavailable"
                    ? "Verification Unavailable"
                    : "Verification Pending"}
            </span>
          </div>
          <p className="text-[11px] text-purple-300/70 font-light">
            {isBlockchainVerified
              ? "Digital ledger sealed"
              : verificationOutcome === "failed"
                ? "Credentials unconfirmed"
                : verificationOutcome === "unavailable"
                  ? "Record not found"
                  : "Seals upon retail dispatch"}
          </p>
        </div>
      </section>

      {/* Required In-Production Message */}
      {!isDispatched && validCompletedCount < 9 && (
        <div className="flex items-center gap-3 rounded-2xl border border-purple-500/25 bg-gradient-to-r from-purple-950/50 via-[#1F1230]/60 to-purple-950/50 p-3.5 sm:p-4 text-purple-200 shadow-md">
          <span className="size-2 rounded-full bg-amber-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          <p className="text-xs sm:text-sm text-purple-100 font-medium leading-relaxed">
            Your garment is still in production. Its journey will update as manufacturing progresses.
          </p>
        </div>
      )}

      {/* Routine Hold Notification (if garment is under active review) */}
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

      {/* 2. Manufacturing Journey (9 Stages in factory order) */}
      <section
        id="manufacturing-journey"
        aria-labelledby="journey-timeline-heading"
        className="rounded-3xl border border-purple-500/20 bg-[#1A1225]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-800/35 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2
                id="journey-timeline-heading"
                className="font-cormorant italic text-3xl sm:text-4xl font-normal text-white tracking-tight"
              >
                Manufacturing Journey
              </h2>
              <SewingNeedleMotif className="h-4 w-24 text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 font-mono text-[10px]">
                <span className="size-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                Continuous Stitch
              </span>
            </div>
            <p className="text-xs text-purple-300/70 font-light">
              Sequential stages from certified fabric receipt through to final dispatch.
            </p>
          </div>

          {/* Single Clear Progress Indicator */}
          <div className="shrink-0 flex items-center gap-2">
            <span className="rounded-full border border-purple-500/25 bg-purple-950/60 px-3.5 py-1 font-mono text-xs font-medium text-purple-200">
              {validCompletedCount} of {MANUFACTURING_STAGES.length} stages completed
            </span>
          </div>
        </div>

        {/* Minimal Progress Bar with Warm Gold Accent */}
        <div className="space-y-1.5 rounded-xl border border-purple-500/15 bg-purple-950/20 p-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-purple-300">
            <span>Production Progress</span>
            <span className="font-semibold text-amber-200">{progressPercent}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#130B1C] border border-purple-500/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-[#E879F9] to-emerald-400 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(251,191,36,0.4)]"
              style={{ width: `${progressPercent}% ` }}
            />
          </div>
        </div>

        {/* Connected Vertical Timeline */}
        <div className="relative space-y-3 pt-2">
          {MANUFACTURING_STAGES.map((stage, idx) => {
            const matchedMilestone = j.milestones.find((m) => stage.isMatch(m));
            const isCompleted = !!matchedMilestone;
            const isExpanded = expandedStages[stage.id] ?? false;
            const Icon = stage.icon;
            const isLast = idx === MANUFACTURING_STAGES.length - 1;

            return (
              <div key={stage.id} className="relative flex items-start gap-4 group">
                {/* Connected Vertical Chain Line */}
                {!isLast && (
                  <div
                    aria-hidden="true"
                    className={`absolute left-4 top-8 bottom-0 -translate-x-1/2 -mb-3 transition-colors ${isCompleted
                      ? "w-0.5 bg-gradient-to-b from-purple-400 via-[#E879F9] to-purple-600 shadow-[0_0_8px_rgba(232,121,249,0.5)]"
                      : "w-0 border-l-2 border-dashed border-purple-800/40"
                      }`}
                  />
                )}

                {/* Stage Icon Node */}
                <div className="relative z-10 shrink-0">
                  {isCompleted ? (
                    <div
                      aria-label="Stage Completed"
                      className="size-8 rounded-full bg-gradient-to-br from-purple-500 to-[#E879F9] text-white flex items-center justify-center shadow-[0_0_12px_rgba(232,121,249,0.7)] group-hover:scale-105 transition-transform"
                    >
                      <Icon className="size-4" />
                    </div>
                  ) : (
                    <div
                      aria-label="Stage Pending"
                      className="size-8 rounded-full border border-purple-800/60 bg-[#160D20] text-purple-400/50 flex items-center justify-center"
                    >
                      <Icon className="size-3.5 opacity-60" />
                    </div>
                  )}
                </div>

                {/* Milestone Information Card */}
                <div
                  className={`flex-1 rounded-xl border p-3 sm:p-3.5 transition-all ${isCompleted
                    ? "border-purple-500/25 bg-purple-950/25 hover:border-purple-500/40 hover:bg-purple-950/35 cursor-pointer"
                    : "border-purple-800/20 bg-purple-950/10 opacity-60"
                    }`}
                  onClick={() => isCompleted && toggleStage(stage.id)}
                  role={isCompleted ? "button" : undefined}
                  tabIndex={isCompleted ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (isCompleted && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      toggleStage(stage.id);
                    }
                  }}
                  aria-expanded={isCompleted ? isExpanded : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
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

                        {/* Status Badge */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300 font-medium">
                            <Check className="size-2.5" /> Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-950/40 border border-purple-700/20 px-2 py-0.5 text-[10px] font-mono text-purple-400/70">
                            <Clock className="size-2.5" /> Pending
                          </span>
                        )}
                      </div>

                      {/* Actual Recorded Date or Pending label */}
                      {isCompleted && matchedMilestone ? (
                        <p className="text-xs font-mono text-purple-300/80">
                          {formatDate(matchedMilestone.date)}
                        </p>
                      ) : (
                        <p className="text-xs font-mono text-purple-400/60 italic">
                          Stage not yet reached
                        </p>
                      )}
                    </div>

                    {/* Expand/Collapse Chevron for completed stages */}
                    {isCompleted && (
                      <div className="text-purple-400 group-hover:text-purple-200 transition-colors pt-0.5">
                        {isExpanded ? (
                          <ChevronUp className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expandable Description */}
                  {isCompleted && isExpanded && (
                    <div className="mt-3 pt-3 border-t border-purple-500/15 text-xs text-purple-200/90 space-y-1 animate-in fade-in-50 duration-200">
                      <p className="leading-relaxed">
                        {matchedMilestone?.description || stage.defaultDescription}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Compact Record Verification Section */}
      <section
        aria-labelledby="record-verification-heading"
        className="rounded-3xl border border-purple-500/20 bg-[#1A1225]/90 p-6 sm:p-7 shadow-xl backdrop-blur-md space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-800/25 pb-3.5">
          <div>
            <h2
              id="record-verification-heading"
              className="font-cormorant italic text-2xl sm:text-3xl font-normal text-white tracking-tight"
            >
              Record Verification
            </h2>
            <p className="text-xs text-purple-300/70 pt-0.5 font-light">
              Cryptographic integrity status for this garment.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white text-xs cursor-pointer self-start sm:self-auto"
          >
            <AppLink href={paths.publicProof(cleanId)}>
              View Verification Details →
            </AppLink>
          </Button>
        </div>

        {/* Verification Status Card */}
        {verificationOutcome === "verified" ? (
          <div className="flex items-start gap-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-4">
            <div className="rounded-full border border-emerald-500/40 bg-emerald-950/60 p-2 text-emerald-400 shrink-0 mt-0.5">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-emerald-200">
                  Blockchain Verified
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/60 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  Digital Ledger Sealed
                </span>
              </div>
              <p className="text-emerald-300/85 leading-relaxed">
                All 9 manufacturing milestones are verified against factory records and permanently anchored to the digital ledger.
              </p>
            </div>
          </div>
        ) : verificationOutcome === "pending" ? (
          <div className="flex items-start gap-3.5 rounded-2xl border border-purple-400/30 bg-purple-950/30 p-4">
            <div className="rounded-full border border-purple-400/35 bg-purple-900/50 p-2 text-purple-300 shrink-0 mt-0.5">
              <Clock className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-purple-100">
                  Verification Pending
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-900/60 border border-purple-500/30 px-2 py-0.5 text-[10px] font-mono text-purple-300">
                  In Production
                </span>
              </div>
              <p className="text-purple-200/85 leading-relaxed">
                Your garment is currently in production. Final digital ledger verification is conducted once manufacturing, quality inspection, and retail dispatch are complete.
              </p>
            </div>
          </div>
        ) : verificationOutcome === "failed" ? (
          <div className="flex items-start gap-3.5 rounded-2xl border border-rose-500/30 bg-rose-950/25 p-4">
            <div className="rounded-full border border-rose-500/40 bg-rose-950/60 p-2 text-rose-400 shrink-0 mt-0.5">
              <AlertCircle className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-semibold text-sm text-rose-200">
                Verification Failed
              </span>
              <p className="text-rose-300/85 leading-relaxed">
                This record could not be confirmed against registered production credentials. If you believe this is an error, please contact customer support.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3.5 rounded-2xl border border-purple-500/20 bg-purple-950/20 p-4">
            <div className="rounded-full border border-purple-500/30 bg-purple-950/40 p-2 text-purple-400 shrink-0 mt-0.5">
              <SearchX className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-semibold text-sm text-purple-200">
                Verification Unavailable
              </span>
              <p className="text-purple-300/80 leading-relaxed">
                Digital verification details are currently unavailable for this garment identifier. Please verify the code on your garment tag or check back shortly.
              </p>
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
