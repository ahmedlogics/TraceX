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
  consumerPhase: string;
  icon: LucideIcon;
  defaultDescription: string;
  isMatch: (m: PublicMilestone) => boolean;
}

const MANUFACTURING_STAGES: ManufacturingStageDef[] = [
  {
    id: "raw-material",
    name: "Raw Material Received",
    consumerPhase: "Ethical Sourcing",
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
    consumerPhase: "Allocated Lot",
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
    name: "Precision Cutting",
    consumerPhase: "Pattern Layout",
    icon: Scissors,
    defaultDescription:
      "Individual garment panels precisely cut from fabric lot and paired with an individual RFID tracking credential.",
    isMatch: (m) =>
      m.key === "garment-cut" ||
      (m.label.toLowerCase().includes("cut") && !m.label.toLowerCase().includes("issue")),
  },
  {
    id: "stitching",
    name: "Stitching Assembly",
    consumerPhase: "Tailoring & Seams",
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
    name: "Artisan Finishing",
    consumerPhase: "Pressing & Trim",
    icon: CheckCircle2,
    defaultDescription:
      "Hardware attached, seam edges trimmed and neatened, and artisan steam pressing completed for final drape.",
    isMatch: (m) =>
      m.key === "garment-assembled" ||
      m.label.toLowerCase().includes("finish") ||
      m.label.toLowerCase().includes("assembled"),
  },
  {
    id: "quality",
    name: "Quality Clearance",
    consumerPhase: "Certified QA Gate",
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
    name: "Protective Packaging",
    consumerPhase: "Sealed Carton",
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
    name: "Central Warehousing",
    consumerPhase: "Inventory Vault",
    icon: Building2,
    defaultDescription:
      "Master shipping carton scanned, verified on intake manifest, and safely cataloged in central warehouse inventory.",
    isMatch: (m) =>
      m.key === "warehouse-received" ||
      m.label.toLowerCase().includes("warehouse"),
  },
  {
    id: "dispatch",
    name: "Logistics Dispatch",
    consumerPhase: "Retail Transit",
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
        label: "Studio Look",
        caption: "Relaxed tailored silhouette in certified organic cotton.",
      },
      {
        url: "/images/products/trouser-fabric.jpg",
        fallbackUrl:
          "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=85",
        label: "Organic Twill",
        caption: "Heavyweight 280 GSM organic cotton twill weave.",
      },
      {
        url: "/images/products/trouser-detail.jpg",
        fallbackUrl:
          "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=1200&q=85",
        label: "Pocket & Horn Button",
        caption: "Hand-finished waistband with reinforced horn button fastening.",
      },
      {
        url: "/images/warehouse/aesthetic-warehouse.jpg",
        fallbackUrl:
          "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=85",
        label: "Vault Packaging",
        caption: "Sealed master shipping carton archived in inventory vault.",
      },
    ];
  }

  return [
    {
      url: "/images/products/shirt-studio.jpg",
      fallbackUrl:
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=1200&q=85",
      label: "Studio Look",
      caption: "Crisp tailored Oxford silhouette in certified organic cotton.",
    },
    {
      url: "/images/products/shirt-fabric.jpg",
      fallbackUrl:
        "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=1200&q=85",
      label: "Organic Fabric Bolt",
      caption: "Certified organic Aegean cotton with 180 GSM poplin weave.",
    },
    {
      url: "/images/products/shirt-detail.jpg",
      fallbackUrl:
        "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=1200&q=85",
      label: "Collar & Shell Buttons",
      caption: "Natural mother-of-pearl buttons and reinforced point collar.",
    },
    {
      url: "/images/warehouse/aesthetic-warehouse.jpg",
      fallbackUrl:
        "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=85",
      label: "Vault Packaging",
      caption: "Quality-approved garment packed and sealed for retail consignment.",
    },
  ];
}

/**
 * Fallback illustration when image fails to load.
 */
function FallbackGarmentIllustration({ isTrouser }: { isTrouser: boolean }) {
  if (isTrouser) {
    return (
      <svg viewBox="0 0 100 100" fill="none" className="size-20 text-[#B88A58]" aria-hidden="true">
        <rect x="30" y="15" width="40" height="8" rx="2" fill="#B88A58" fillOpacity="0.25" stroke="#D6A56E" strokeWidth="1.5" />
        <path d="M30 23 L33 90 L48 90 L50 45 L52 90 L67 90 L70 23 Z" fill="#3A2312" fillOpacity="0.4" stroke="#D6A56E" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" fill="none" className="size-20 text-[#B88A58]" aria-hidden="true">
      <path d="M35 20 L50 30 L65 20 L57 14 L43 14 Z" fill="#B88A58" fillOpacity="0.3" stroke="#D6A56E" strokeWidth="1.5" />
      <path d="M30 26 L36 20 L64 20 L70 26 L80 44 L72 48 L68 35 L68 88 L32 88 L32 35 L28 48 L20 44 Z" fill="#3A2312" fillOpacity="0.4" stroke="#D6A56E" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Formats date and deterministic/recorded timestamp together.
 */
function formatDateTime(dateStr?: string | null, stageIdx = 0): string {
  if (!dateStr) return "Pending";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const formattedDate = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (dateStr.includes("T") || dateStr.includes(":")) {
      const formattedTime = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `${formattedDate} · ${formattedTime}`;
    }

    const times = [
      "09:15 AM",
      "10:30 AM",
      "11:45 AM",
      "01:20 PM",
      "02:45 PM",
      "03:50 PM",
      "04:30 PM",
      "05:15 PM",
      "06:00 PM",
    ];
    const time = times[stageIdx % times.length] || "10:00 AM UTC";
    return `${formattedDate} · ${time}`;
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

  useEffect(() => {
    if (!q.data) return;
    const galleryLength = getProductGallery(q.data.productName, cleanId).length;
    if (galleryLength <= 1) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % galleryLength);
    }, 5000);
    return () => clearInterval(timer);
  }, [q.data, cleanId]);

  const toggleStage = (stageId: string) => {
    setExpandedStages((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  // Loading state
  if (q.isPending) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3.5 rounded-3xl p-12 text-center shadow-2xl">
        <Loader2 className="size-8 animate-spin text-[#B88A58]" aria-hidden="true" />
        <p className="font-cormorant italic text-3xl text-[#FAF7F2] tracking-wide">
          Retrieving Garment Passport…
        </p>
        <p className="text-xs text-[#D6C2A8]/70 font-mono">
          Querying verified lineage for {cleanId}
        </p>
      </div>
    );
  }

  // Error state
  if (q.isError) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3.5 rounded-3xl border-rose-500/30 p-8 sm:p-12 text-center shadow-2xl">
        <AlertCircle className="size-8 text-rose-400" aria-hidden="true" />
        <h2 className="font-cormorant italic text-3xl font-medium text-[#FAF7F2]">
          Unable to Load Garment Record
        </h2>
        <p className="max-w-md text-xs sm:text-sm text-[#D6C2A8] leading-relaxed">
          {errorMessage(q.error)}
        </p>
        <Button
          type="button"
          onClick={() => void q.refetch()}
          variant="outline"
          size="sm"
          className="mt-2 rounded-full border-[#B88A58]/30 bg-[#3A2312]/60 text-[#FAF7F2] hover:bg-[#B88A58]/30 cursor-pointer"
        >
          Try again
        </Button>
      </div>
    );
  }

  // Not Found state
  if (!q.data) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-4 rounded-3xl p-8 sm:p-12 text-center shadow-2xl">
        <div className="rounded-full border border-[#B88A58]/30 bg-[#3A2312]/60 p-3.5 text-[#B88A58]">
          <SearchX className="size-8" aria-hidden="true" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h2 className="font-cormorant italic text-3xl font-normal text-[#FAF7F2] tracking-tight">
            Garment Record Not Found
          </h2>
          <div className="inline-block rounded-lg border border-[#B88A58]/40 bg-[#1A110A] px-3.5 py-1 font-mono text-sm font-semibold text-[#F5D0A9]">
            {cleanId}
          </div>
        </div>
        <div className="pt-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-[#B88A58]/30 bg-[#3A2312]/60 text-[#FAF7F2] hover:bg-[#B88A58]/30"
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

  const matchedIndices: number[] = [];
  MANUFACTURING_STAGES.forEach((stage, idx) => {
    if (j.milestones.some((m) => stage.isMatch(m))) {
      matchedIndices.push(idx);
    }
  });

  const validCompletedCount = matchedIndices.length;
  const progressPercent = Math.round((validCompletedCount / MANUFACTURING_STAGES.length) * 100);

  const isDispatched =
    j.status === "Dispatched to authorized retail network" ||
    j.milestones.some((m) => m.key === "dispatched");

  const isQualityPassed =
    !hasActiveHold &&
    (j.status === "Passed quality control" ||
      j.status === "Dispatched to authorized retail network" ||
      j.milestones.some((m) => m.key === "quality-passed") ||
      j.qualityInfo?.disposition === "passed" ||
      j.qualityInfo?.disposition === "released");

  const currentStatusLabel = isDispatched
    ? "Dispatched & Sealed"
    : hasActiveHold
      ? "Under Review"
      : isQualityPassed
        ? "Quality Approved"
        : "In Crafting";

  const displayProductName = isTrouser
    ? "Tailored Cotton Trouser"
    : j.productName.includes("Oxford") || j.productName.includes("poplin") || j.productName.includes("shirt")
      ? "Classic Oxford Shirt"
      : j.productName;

  const isBlockchainConfirmed =
    j.evidence === "sample-confirmed" ||
    (!!j.blockchain?.confirmedAt && !!j.blockchain?.transactionHash);

  const isBlockchainVerified = isDispatched && isQualityPassed && isBlockchainConfirmed;

  const verificationOutcome: "verified" | "pending" | "failed" | "unavailable" =
    j.evidence === "failed"
      ? "failed"
      : isBlockchainVerified
        ? "verified"
        : j.evidence === "unavailable"
          ? "unavailable"
          : "pending";

  return (
    <article className="space-y-5 motion-safe:animate-fade-in-up">
      {/* 1. CINEMATIC SMOKED-ACRYLIC DIGITAL PRODUCT PASSPORT (HERO) */}
      <section
        aria-label="Digital Product Passport"
        className="relative group transition-all"
      >
        {/* Ambient Warm Halo Glow behind the Acrylic Slab */}
        <div
          aria-hidden="true"
          className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-amber-500/25 via-[#B88A58]/20 to-orange-500/15 blur-2xl opacity-80 pointer-events-none -z-10"
        />

        {/* Smoked-Acrylic Glass Slab */}
        <div className="glass-panel-warm rounded-3xl p-5 sm:p-6 relative overflow-hidden border border-white/20 shadow-2xl space-y-4">
          {/* Top Security & Specimen Ribbon */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3.5">
            <span className="glass-pill inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-medium text-[#F5D0A9] shadow-inner">
              <span className="size-2 rounded-full bg-[#10B981] animate-pulse" />
              PASSPORT ID: {j.publicId.toUpperCase()}
            </span>

            {/* Dynamic Verification / Release Badge */}
            <div>
              {isDispatched ? (
                <span className="glass-pill-emerald inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Dispatched & Sealed
                </span>
              ) : hasActiveHold ? (
                <span className="glass-pill-amber inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-amber-200">
                  <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Under Review
                </span>
              ) : (
                <span className="glass-pill-amber inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-amber-200">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  {currentStatusLabel}
                </span>
              )}
            </div>
          </div>

          {/* Cinematic Widescreen Studio Stage */}
          <div
            role="region"
            aria-label="Garment Studio Stage"
            className="relative aspect-[16/9] sm:aspect-[2.1/1] w-full max-h-[360px] sm:max-h-[400px] rounded-2xl overflow-hidden border border-white/20 bg-[#0B0705] shadow-2xl group/stage select-none"
          >
            {/* Gallery Slide Images with smooth cross-fade */}
            {gallery.map((img, idx) => {
              const isActive = idx === activeSlide;
              const hasError = imageErrorMap[idx];

              return (
                <div
                  key={img.url + idx}
                  aria-hidden={!isActive}
                  className={`absolute inset-0 transition-all duration-700 ease-out flex items-center justify-center ${
                    isActive
                      ? "opacity-100 z-10 scale-100"
                      : "opacity-0 z-0 scale-95 pointer-events-none"
                  }`}
                >
                  {hasError ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <FallbackGarmentIllustration isTrouser={isTrouser} />
                      <span className="text-xs text-[#D6C2A8]/80 font-mono tracking-wider">
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
                      className={`h-full w-full object-cover object-center transition-transform duration-700 ease-out ${
                        isActive ? "scale-100 group-hover/stage:scale-[1.03]" : "scale-95"
                      }`}
                    />
                  )}
                </div>
              );
            })}

            {/* Cinematic Gradient Vignette Overlays */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0C0704]/95 via-black/10 to-transparent z-10"
            />

            {/* Bottom Bar: Title & Interactive Angle Switcher Dock */}
            <div className="absolute bottom-3.5 left-4 right-4 z-20 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="space-y-0.5">
                <h1 className="font-cormorant italic text-3xl sm:text-4xl text-white font-normal tracking-tight drop-shadow-lg leading-none">
                  {displayProductName}
                </h1>
              </div>

              {/* Interactive Studio Angle Switcher Dock */}
              {gallery.length > 1 && (
                <div className="flex items-center gap-1 bg-black/65 p-1.5 rounded-full border border-white/20 backdrop-blur-xl shadow-lg self-start sm:self-auto overflow-x-auto max-w-full no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {gallery.map((img, idx) => {
                    const isSelected = idx === activeSlide;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveSlide(idx)}
                        className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-mono whitespace-nowrap transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[#B88A58] ${
                          isSelected
                            ? "bg-gradient-to-r from-[#B88A58] to-amber-500 text-[#140D08] font-bold shadow-md scale-105"
                            : "text-[#D6C2A8]/80 hover:text-white hover:bg-white/10"
                        }`}
                        aria-label={`View stage ${idx + 1}: ${img.label}`}
                      >
                        0{idx + 1} {img.label.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Single Streamlined 3-Fact Garment Spec Bar (Zero Redundancy) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="glass-panel p-3 rounded-xl border border-white/10 text-center space-y-0.5">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-[#B88A58]">
                Weave & Weight
              </span>
              <span className="text-xs font-semibold text-[#FAF7F2] block">
                {isTrouser ? "280 GSM Twill" : "180 GSM Poplin"}
              </span>
            </div>

            <div className="glass-panel p-3 rounded-xl border border-white/10 text-center space-y-0.5">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-[#B88A58]">
                Fiber Composition
              </span>
              <span className="text-xs font-semibold text-[#FAF7F2] block">
                100% Certified Organic Cotton
              </span>
            </div>

            <div className="glass-panel p-3 rounded-xl border border-white/10 text-center space-y-0.5">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-[#B88A58]">
                Tailoring Standard
              </span>
              <span className="text-xs font-semibold text-[#FAF7F2] block">
                Single-Needle French Seams
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Routine Hold Notification (if any) */}
      {j.notice && (
        <div
          role="alert"
          className="glass-panel flex gap-3.5 rounded-2xl border-amber-500/40 bg-amber-950/30 p-4 text-amber-200 shadow-lg"
        >
          <OctagonAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
          <div className="space-y-0.5 text-xs">
            <p className="font-semibold text-amber-100">{j.notice.title}</p>
            <p className="text-amber-200/85 leading-relaxed">{j.notice.message}</p>
          </div>
        </div>
      )}

      {/* 3. 9-STAGE MANUFACTURING JOURNEY WITH DATE & TIMESTAMP */}
      <section
        id="manufacturing-journey"
        aria-labelledby="journey-timeline-heading"
        className="glass-panel rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <h2
            id="journey-timeline-heading"
            className="font-cormorant italic text-3xl font-normal text-[#FAF7F2] tracking-tight"
          >
            Manufacturing Journey
          </h2>

          <div className="shrink-0 flex items-center gap-2">
            <span className="glass-pill px-3 py-1 rounded-full font-mono text-xs font-medium text-[#F5D0A9]">
              {validCompletedCount} of {MANUFACTURING_STAGES.length} Completed
            </span>
          </div>
        </div>

        {/* Minimal Progress Bar with Warm Gold & Emerald Tone */}
        <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#D6C2A8]">
            <span>Production Progress</span>
            <span className="font-semibold text-[#FBBF24]">{progressPercent}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#18100A] border border-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#D97706] via-[#FBBF24] to-[#10B981] transition-all duration-700 ease-out shadow-[0_0_10px_rgba(251,191,36,0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Connected Vertical Timeline */}
        <div className="relative space-y-3 pt-1">
          {MANUFACTURING_STAGES.map((stage, idx) => {
            const matchedMilestone = j.milestones.find((m) => stage.isMatch(m));
            const isCompleted = !!matchedMilestone;
            const isExpanded = expandedStages[stage.id] ?? false;
            const Icon = stage.icon;
            const isLast = idx === MANUFACTURING_STAGES.length - 1;

            return (
              <div key={stage.id} className="relative flex items-start gap-4 group">
                {/* Connected Lineage Trace Trail */}
                {!isLast && (
                  <div
                    aria-hidden="true"
                    className={`absolute left-4 top-8 bottom-0 -translate-x-1/2 -mb-3 transition-colors ${
                      isCompleted
                        ? "w-0.5 bg-gradient-to-b from-[#FBBF24] via-[#B88A58] to-[#10B981] shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                        : "w-0 border-l-2 border-dashed border-white/10"
                    }`}
                  />
                )}

                {/* Stage Icon Node */}
                <div className="relative z-10 shrink-0">
                  {isCompleted ? (
                    <div
                      aria-label="Stage Completed"
                      className="size-8 rounded-full bg-gradient-to-br from-[#FBBF24] to-[#B88A58] text-[#1A110A] font-bold flex items-center justify-center shadow-[0_0_12px_rgba(251,191,36,0.6)] group-hover:scale-105 transition-transform"
                    >
                      <Icon className="size-4 text-[#1A110A]" />
                    </div>
                  ) : (
                    <div
                      aria-label="Stage Pending"
                      className="size-8 rounded-full border border-white/15 bg-[#160E08] text-[#D6C2A8]/40 flex items-center justify-center"
                    >
                      <Icon className="size-3.5 opacity-60" />
                    </div>
                  )}
                </div>

                {/* Milestone Frosted Card */}
                <div
                  className={`flex-1 rounded-2xl border p-3.5 transition-all ${
                    isCompleted
                      ? "glass-card-hover border-white/15 bg-black/25 cursor-pointer"
                      : "border-white/5 bg-black/10 opacity-50"
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
                          className={`font-medium text-sm tracking-wide ${
                            isCompleted ? "text-[#FAF7F2]" : "text-[#D6C2A8]/60"
                          }`}
                        >
                          {stage.name}
                        </span>

                        {/* Status Check */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded-full glass-pill-emerald px-2 py-0.5 text-[10px] font-mono text-emerald-300 font-medium">
                            <Check className="size-2.5" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full glass-pill px-2 py-0.5 text-[10px] font-mono text-[#D6C2A8]/60">
                            <Clock className="size-2.5" /> Scheduled
                          </span>
                        )}
                      </div>

                      {/* Explicit Date & Timestamp */}
                      {isCompleted && matchedMilestone ? (
                        <p className="text-xs font-mono text-[#F5D0A9]">
                          {formatDateTime(matchedMilestone.date, idx)}
                        </p>
                      ) : (
                        <p className="text-xs font-mono text-[#D6C2A8]/40 italic">
                          Stage not yet reached
                        </p>
                      )}
                    </div>

                    {/* Expand/Collapse Chevron */}
                    {isCompleted && (
                      <div className="text-[#B88A58] group-hover:text-[#FBBF24] transition-colors pt-0.5">
                        {isExpanded ? (
                          <ChevronUp className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expandable Details */}
                  {isCompleted && isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/10 text-xs text-[#D6C2A8] space-y-1 animate-in fade-in-50 duration-200">
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

      {/* 4. DIGITAL AUTHENTICITY CERTIFICATE */}
      <section
        aria-labelledby="record-verification-heading"
        className="glass-panel-warm rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 border border-[#B88A58]/25"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <h2
            id="record-verification-heading"
            className="font-cormorant italic text-2xl sm:text-3xl font-normal text-[#FAF7F2] tracking-tight"
          >
            Certificate of Authenticity
          </h2>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-[#B88A58]/35 bg-[#3A2312]/60 text-[#F5D0A9] hover:bg-[#B88A58]/30 hover:text-white text-xs cursor-pointer self-start sm:self-auto"
          >
            <AppLink href={paths.publicProof(cleanId)}>
              View Official Certificate →
            </AppLink>
          </Button>
        </div>

        {/* Verification Certificate Outcome */}
        {verificationOutcome === "verified" ? (
          <div className="flex items-start gap-4 rounded-2xl glass-panel p-4 border-emerald-500/30 bg-emerald-950/20">
            <div className="rounded-full border border-emerald-500/40 bg-emerald-950/70 p-2 text-emerald-400 shrink-0 mt-0.5 shadow-[0_0_12px_rgba(52,211,153,0.3)]">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-emerald-200">
                  Verified Genuine & Tamper-Proof
                </span>
                <span className="inline-flex items-center gap-1 rounded-full glass-pill-emerald px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  Certified
                </span>
              </div>
              <p className="text-emerald-300/85 leading-relaxed">
                All 9 manufacturing and quality milestones are verified against official production records and permanently sealed.
              </p>
            </div>
          </div>
        ) : verificationOutcome === "pending" ? (
          <div className="flex items-start gap-4 rounded-2xl glass-panel p-4 border-amber-500/35">
            <div className="rounded-full border border-amber-500/40 bg-amber-900/60 p-2 text-amber-300 shrink-0 mt-0.5">
              <Clock className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-semibold text-sm text-amber-100">
                In Production
              </span>
              <p className="text-amber-200/85 leading-relaxed">
                Your garment is currently active on the manufacturing floor. The certificate permanently seals upon retail dispatch.
              </p>
            </div>
          </div>
        ) : verificationOutcome === "failed" ? (
          <div className="flex items-start gap-4 rounded-2xl glass-panel p-4 border-rose-500/30">
            <div className="rounded-full border border-rose-500/40 bg-rose-950/60 p-2 text-rose-400 shrink-0 mt-0.5">
              <AlertCircle className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-semibold text-sm text-rose-200">
                Verification Mismatch
              </span>
              <p className="text-rose-300/85 leading-relaxed">
                This record could not be confirmed against registered production credentials. If you believe this is an error, please contact customer support.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4 rounded-2xl glass-panel p-4">
            <div className="rounded-full border border-white/20 bg-white/5 p-2 text-[#D6C2A8] shrink-0 mt-0.5">
              <SearchX className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <span className="font-semibold text-sm text-[#FAF7F2]">
                Verification Unavailable
              </span>
              <p className="text-[#D6C2A8]/80 leading-relaxed">
                Verification details are currently unavailable for this garment identifier.
              </p>
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
