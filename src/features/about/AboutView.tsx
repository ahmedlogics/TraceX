import { useState } from "react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Cpu,
  ExternalLink,
  Layers,
  Lock,
  Package,
  QrCode,
  Radio,
  Scissors,
  ShieldCheck,
  Shirt,
  Sparkles,
  Truck,
  Warehouse,
  Zap,
} from "lucide-react";

interface JourneyStage {
  step: number;
  title: string;
  station: string;
  tagline: string;
  description: string;
  badge: string;
  icon: typeof Boxes;
  align: "left" | "right";
  linkHref?: string;
  linkText?: string;
}

const STAGES: JourneyStage[] = [
  {
    step: 1,
    title: "Fabric Receiving",
    station: "Station 1 · Intake Dock",
    tagline: "Raw roll logging & physical RFID binding",
    description:
      "The journey begins at fabric receiving, where the material manager enters fabric roll specifications into the dashboard and scans an RFID card at the intake scanner to digitally bind the material details to that physical bundle.",
    badge: "Intake RFID Card",
    icon: Boxes,
    align: "left",
  },
  {
    step: 2,
    title: "Incoming QC",
    station: "Station 1 QC · Quality Gate",
    tagline: "Quality checks against technical standards",
    description:
      "The bundle automatically routes to the incoming quality manager's dashboard, who inspects the fabric against standard specifications and marks it as approved.",
    badge: "Dock QC Approval",
    icon: ShieldCheck,
    align: "right",
  },
  {
    step: 3,
    title: "Raw Store Issue",
    station: "Station 2 · Material Store",
    tagline: "AI-driven material allocation & scrap reduction",
    description:
      "When the raw store manager creates a production order, an integrated AI recommender analyzes all accepted fabric inventory in real time to suggest the optimal roll that minimizes remnant cutting scrap. The manager selects the AI-recommended roll and scans its bundle card, seamlessly linking the production order to that exact fabric before issuing it to the floor.",
    badge: "AI Optimization",
    icon: Sparkles,
    align: "left",
  },
  {
    step: 4,
    title: "Cutting & RFID Bind",
    station: "Station 3 · Cutting Table",
    tagline: "Pattern cutting & individual garment serialization",
    description:
      "At the cutting table, the operator scans the bundle card to automatically load all of its associated production orders, selects the specific order currently being cut, scans individual tags one by one to serialize each garment under that order, and clicks to complete the order to release the batch to the assembly line.",
    badge: "Garment UID Serialization",
    icon: Scissors,
    align: "right",
  },
  {
    step: 5,
    title: "Stitching Assembly",
    station: "Station 4 · Sewing Line",
    tagline: "Real-time assembly progress checkpointing",
    description:
      "The garments move through stitching, where line operators simply tap each shirt on their station scanners to instantly update manufacturing progress in real time without any manual typing.",
    badge: "Tap-and-Go Tracking",
    icon: Cpu,
    align: "left",
  },
  {
    step: 6,
    title: "Finishing",
    station: "Station 5 · Finishing Table",
    tagline: "Assembly completion, trimming, and pressing",
    description:
      "The stitched garments proceed to finishing for thread trimming, buttoning, and ironing. Operators tap each garment on the finishing scanner to mark assembly complete and advance it directly to quality verification.",
    badge: "Zero-Touch Progress",
    icon: Shirt,
    align: "right",
  },
  {
    step: 7,
    title: "Final QC",
    station: "Station 6 · Inspection Gate",
    tagline: "Defect inspection & cryptographic quality seal",
    description:
      "At the final quality gate, the inspector physically examines the completed garment, enters the evaluation decision on the screen, and taps the shirt on the inspection scanner to cryptographically bind the quality clearance to the product's identity.",
    badge: "Cryptographic Clearance",
    icon: ShieldCheck,
    align: "left",
  },
  {
    step: 8,
    title: "Packaging",
    station: "Station 7 · Packing Station",
    tagline: "Master carton initialization & product packing",
    description:
      "Approved garments move to the packaging station, where the operator scans a box card to initialize a new carton on the dashboard, scans each shirt directly into that container, and seals the package.",
    badge: "Container Aggregation",
    icon: Package,
    align: "right",
  },
  {
    step: 9,
    title: "Warehouse",
    station: "Station 8 · Finished Goods",
    tagline: "Zero-touch inbound stock registration",
    description:
      "The sealed carton is transported to the finished-goods warehouse, where a zero-touch scan at the inbound reader instantly registers the box and its contents into stock inventory.",
    badge: "Automated Ingestion",
    icon: Warehouse,
    align: "left",
  },
  {
    step: 10,
    title: "Dispatch",
    station: "Station 9 · Loading Dock Gate",
    tagline: "Permanent ledger audit & carrier freight release",
    description:
      "When scheduled for delivery, the dispatch logistics officer scans the carton at the loading dock, where the system verifies that every enclosed item has passed all quality gates, writes the permanent departure record to the ledger, and clears the shipment for freight release.",
    badge: "Immutable Ledger Audit",
    icon: Truck,
    align: "right",
  },
  {
    step: 11,
    title: "To Customer",
    station: "Retail / Post-Sale · Consumer Experience",
    tagline: "Tap NFC or Scan QR for live Digital Product Passport",
    description:
      "Finally, when the garment reaches the consumer, the buyer taps their smartphone against the embedded smart tag to instantly launch its Digital Product Passport, providing complete and verifiable transparency into the garment's ethical origin, AI-optimized material efficiency, manufacturing timeline, and authentic craftsmanship.",
    badge: "Live Customer DPP",
    icon: QrCode,
    align: "left",
    linkHref: paths.publicJourney("shirt-001-demo"),
    linkText: "View Sample Passport",
  },
];

export function AboutView() {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const toggleStep = (step: number) => {
    setExpandedStep((prev) => (prev === step ? null : step));
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#2C241D] antialiased selection:bg-[#E4D5B7] selection:text-[#1F1914]">
      {/* Top Floating Navigation */}
      <header className="sticky top-0 z-50 border-b border-[#E7DEC8]/80 bg-[#FAF7F2]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3">
            {/* TraceX Shield Icon */}
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#8C6D3E] via-[#B89658] to-[#6E532B] text-white shadow-sm ring-1 ring-black/5">
              <span className="font-serif font-black tracking-tighter text-lg leading-none">TX</span>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-[#231A12]">TraceX</span>
              <span className="ml-2 hidden sm:inline-block rounded-full bg-[#EFE8D6] px-2 py-0.5 text-[11px] font-medium text-[#7A6034]">
                Project Showcase
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5C6A9] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#5A4525] shadow-xs hover:bg-white hover:border-[#B89658] transition-all"
            >
              <QrCode className="size-3.5 text-[#B89658]" />
              <span className="hidden sm:inline">Sample</span> Passport
            </AppLink>
            <AppLink
              href={paths.home}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2D2217] px-3.5 py-1.5 text-xs font-semibold text-[#F7F3EB] shadow-xs hover:bg-[#1D160E] transition-all"
            >
              <span>Staff Workspace</span>
              <ArrowRight className="size-3.5" />
            </AppLink>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-14 sm:pt-16 sm:pb-20 border-b border-[#EFE8D6]">
        {/* Subtle decorative background pattern */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#C5A880_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center space-y-6">
          {/* Standee Shield Emblem */}
          <div className="mx-auto flex size-20 sm:size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-[#8C6D3E] via-[#C5A880] to-[#5C4524] p-[3px] shadow-lg shadow-[#8C6D3E]/15">
            <div className="flex size-full items-center justify-center rounded-[21px] bg-[#FAF7F2] border border-[#E7DEC8]">
              <div className="text-center">
                <span className="font-serif font-black text-3xl sm:text-4xl text-[#7A5B2B] tracking-tight">TX</span>
              </div>
            </div>
          </div>

          {/* Title and Tagline matching Standee */}
          <div className="space-y-3 max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-[#1F1710]">
              Trace<span className="text-[#96743A]">X</span>
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl font-semibold text-[#4A3B2B] leading-snug">
              A Blockchain-Based Real-Time Smart Supply Chain Traceability System
            </p>
          </div>

          {/* Sub-banner Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D5C6A9] bg-[#EFE8D6]/80 px-4 py-1.5 text-xs sm:text-sm font-semibold text-[#6E532B] shadow-xs">
            <span className="size-2 rounded-full bg-[#B89658] animate-pulse" />
            <span>From Raw Fabric Intake to Verified Customer Passport</span>
          </div>

          {/* Academic / Showcase Credits */}
          <p className="text-xs sm:text-sm text-[#7A6852] max-w-xl mx-auto">
            Department of Software Engineering · NED University of Engineering &amp; Technology, Karachi
            <br />
            <span className="text-[11px] text-[#9A8770]">NED Alumni Convention 2026 Showcase</span>
          </p>

          {/* Visual Hardware Chain Icons */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs font-semibold text-[#7A633F]">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D6BE] bg-white/70 px-3 py-1.5">
              <Boxes className="size-3.5 text-[#A58245]" /> Raw Fabric RFID
            </span>
            <span className="text-[#C5B393]">➔</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D6BE] bg-white/70 px-3 py-1.5">
              <Scissors className="size-3.5 text-[#A58245]" /> Cutting &amp; Garment UID
            </span>
            <span className="text-[#C5B393]">➔</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D6BE] bg-white/70 px-3 py-1.5">
              <Cpu className="size-3.5 text-[#A58245]" /> Assembly Scanners
            </span>
            <span className="text-[#C5B393]">➔</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D6BE] bg-white/70 px-3 py-1.5">
              <Lock className="size-3.5 text-[#A58245]" /> Ledger Hash
            </span>
            <span className="text-[#C5B393]">➔</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D6BE] bg-white/70 px-3 py-1.5">
              <QrCode className="size-3.5 text-[#A58245]" /> Customer Passport
            </span>
          </div>
        </div>
      </section>

      {/* The Conventional Blindspot — 3 Core Pillars */}
      <section className="py-14 sm:py-18 bg-[#F4EFE6]/60 border-b border-[#EAE1CF]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center space-y-2 mb-10">
            <span className="inline-block rounded-full bg-[#E5DCBE] px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-[#634E27]">
              Core Architectural Pillars
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#231A12]">
              The Conventional Blindspot
            </h2>
            <p className="text-sm text-[#735F47] max-w-2xl mx-auto">
              How TraceX closes the critical visibility gap in cut-and-sew garment manufacturing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pillar 1 */}
            <div className="rounded-2xl border border-[#DFD3BB] bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F6F1E5] text-[#8C6D3E] border border-[#E8DFC9]">
                <Layers className="size-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-sm tracking-wide text-[#261C13] uppercase">
                  Unbroken Raw-to-Garment Lineage
                </h3>
                <p className="text-sm text-[#614F3C] leading-relaxed">
                  Tracks physical fabric rolls directly to finished garments. Unlike systems that only track packaged goods, TraceX links raw rolls through split cuts, sewing lines, and serializes every individual shirt.
                </p>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-2xl border border-[#DFD3BB] bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F6F1E5] text-[#8C6D3E] border border-[#E8DFC9]">
                <Radio className="size-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-sm tracking-wide text-[#261C13] uppercase">
                  Frictionless RFID Tap-to-Identify
                </h3>
                <p className="text-sm text-[#614F3C] leading-relaxed">
                  9-reader connected edge hardware network (13.56 MHz RC522). Machine operators tap shirts or bundle cards directly at their station, eliminating paper traveler sheets and manual keyboard entry.
                </p>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-2xl border border-[#DFD3BB] bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F6F1E5] text-[#8C6D3E] border border-[#E8DFC9]">
                <Lock className="size-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-sm tracking-wide text-[#261C13] uppercase">
                  Zero-Knowledge Provenance Ledger
                </h3>
                <p className="text-sm text-[#614F3C] leading-relaxed">
                  Cryptographic SHA-256 tamper-proof ledger audit trail. Internal yields and defect logs remain private, while providing shoppers and enterprise buyers with unalterable proof of authentic provenance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Traceable Journey — Standee Vertical Timeline */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center space-y-2 mb-12">
            <span className="inline-block rounded-full bg-[#E5DCBE] px-3.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[#634E27]">
              Step-by-Step Manufacturing Lifecycle
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#231A12]">
              The Traceable Journey
            </h2>
            <p className="text-sm text-[#735F47] max-w-xl mx-auto">
              Follow a physical fabric roll through 11 continuous checkpoints from receiving dock to consumer smartphone tap.
            </p>
          </div>

          {/* Timeline Spine Container */}
          <div className="relative">
            {/* Center Vertical Connecting Spine */}
            <div className="absolute left-6 sm:left-1/2 top-4 bottom-4 w-0.5 -translate-x-1/2 bg-gradient-to-b from-[#C5A880] via-[#8C6D3E] to-[#C5A880]" />

            <div className="space-y-6 sm:space-y-8">
              {STAGES.map((s) => {
                const Icon = s.icon;
                const isExpanded = expandedStep === s.step;
                const isLeft = s.align === "left";

                return (
                  <div
                    key={s.step}
                    className={`relative flex flex-col sm:flex-row items-start ${
                      isLeft ? "sm:flex-row-reverse" : ""
                    }`}
                  >
                    {/* Content Card */}
                    <div className="ml-14 sm:ml-0 sm:w-[calc(50%-2rem)] w-[calc(100%-3.5rem)]">
                      <div
                        onClick={() => toggleStep(s.step)}
                        className={`group cursor-pointer rounded-2xl border transition-all ${
                          isExpanded
                            ? "border-[#B89658] bg-white shadow-md ring-2 ring-[#B89658]/20"
                            : "border-[#DFD3BB] bg-white/90 hover:bg-white hover:border-[#C5A880] shadow-xs"
                        } p-5 space-y-2`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#96743A]">
                            {s.station}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F3EDE0] px-2 py-0.5 text-[10px] font-semibold text-[#664F26]">
                            {s.badge}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-bold text-[#231A12] group-hover:text-[#8C6D3E] transition-colors">
                            {s.title}
                          </h3>
                          <ChevronDown
                            className={`size-4 text-[#9C8A73] transition-transform duration-200 ${
                              isExpanded ? "rotate-180 text-[#8C6D3E]" : ""
                            }`}
                          />
                        </div>

                        <p className="text-xs font-medium text-[#7D6A54]">{s.tagline}</p>

                        {/* Expandable in-depth narrative */}
                        <div
                          className={`overflow-hidden transition-all duration-300 text-xs sm:text-sm text-[#4E3E2C] leading-relaxed ${
                            isExpanded ? "pt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="border-t border-[#EFE8D6] pt-2.5 space-y-3">
                            <p>{s.description}</p>
                            {s.linkHref && (
                              <div>
                                <AppLink
                                  href={s.linkHref}
                                  className="inline-flex items-center gap-1.5 font-semibold text-[#8C6D3E] hover:text-[#5E4723] transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>{s.linkText}</span>
                                  <ExternalLink className="size-3" />
                                </AppLink>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Numbered Center Badge matching Standee */}
                    <div className="absolute left-6 sm:left-1/2 -translate-x-1/2 flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#8C6D3E] to-[#5C4524] text-white shadow-md ring-4 ring-[#FAF7F2]">
                      <span className="font-mono font-black text-sm">{s.step}</span>
                    </div>

                    {/* Spacer for opposite side */}
                    <div className="hidden sm:block sm:w-[calc(50%-2rem)]" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Compliance & Impact Metrics matching Standee */}
      <section className="py-14 sm:py-18 bg-[#F4EFE6]/70 border-t border-b border-[#EAE1CF]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center space-y-2 mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#231A12]">
              Compliance &amp; Impact Metrics
            </h2>
            <p className="text-sm text-[#735F47]">
              Measurable operational and regulatory impact on garment manufacturing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {/* Metric 1 */}
            <div className="rounded-2xl border border-[#DFD3BB] bg-white p-6 shadow-xs space-y-2">
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-[#8C6D3E]">
                [ 100% ]
              </div>
              <h3 className="font-bold text-sm text-[#231A12]">
                Traceability Lineage from Yarn to Retail
              </h3>
              <p className="text-xs text-[#7A6852]">
                Unbroken custody chain linking initial raw fabric batch specs directly to retail garments.
              </p>
            </div>

            {/* Metric 2 */}
            <div className="rounded-2xl border border-[#DFD3BB] bg-white p-6 shadow-xs space-y-2">
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-[#8C6D3E]">
                [ 5 – 8 ]%
              </div>
              <h3 className="font-bold text-sm text-[#231A12]">
                Fabric Waste Reduction via Smart Allocation
              </h3>
              <p className="text-xs text-[#7A6852]">
                Real-time AI roll matching optimizes yardage usage and eliminates remnant offcut scrap.
              </p>
            </div>

            {/* Metric 3 */}
            <div className="rounded-2xl border border-[#DFD3BB] bg-white p-6 shadow-xs space-y-2">
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-[#8C6D3E]">
                [ EU DPP ]
              </div>
              <h3 className="font-bold text-sm text-[#231A12]">
                Digital Product Passport Compliant
              </h3>
              <p className="text-xs text-[#7A6852]">
                Meets EU Ecodesign for Sustainable Products Regulation (ESPR) provenance requirements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Blockchain Verified Callout matching Standee Footer */}
      <section className="py-14 sm:py-18">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="rounded-3xl border border-[#2B2117] bg-[#1E1711] text-[#F5EFE6] p-8 sm:p-10 shadow-xl space-y-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#C5A880]/15 text-[#E4D5B7] border border-[#C5A880]/30">
              <CheckCircle2 className="size-6 text-[#D5B889]" />
            </div>

            <div className="space-y-2 max-w-xl mx-auto">
              <h3 className="text-xl sm:text-2xl font-black tracking-wider text-[#F2E8D7] uppercase">
                Blockchain Verified
              </h3>
              <p className="text-xs sm:text-sm text-[#C8B89E] leading-relaxed">
                Every garment is sealed with an immutable SHA-256 tamperproof hash. Anyone can scan the embedded NFC tag or QR code to verify complete factory authenticity on the public ledger.
              </p>
            </div>

            {/* Interactive CTAs */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <AppLink
                href={paths.publicJourney("shirt-001-demo")}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#9E7D46] via-[#B89658] to-[#8C6D3E] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:brightness-105 transition-all"
              >
                <QrCode className="size-4" />
                <span>Explore Live Customer Passport</span>
              </AppLink>

              <AppLink
                href={paths.home}
                className="inline-flex items-center gap-2 rounded-xl border border-[#524131] bg-[#2E2319] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#EFE8D6] hover:bg-[#3D2F22] transition-colors"
              >
                <span>Open Factory Workspace</span>
                <ArrowRight className="size-4" />
              </AppLink>
            </div>
          </div>
        </div>
      </section>

      {/* Page Footer */}
      <footer className="border-t border-[#EAE1CF] py-8 text-center text-xs text-[#7A6852] space-y-2 bg-[#F6F1E6]">
        <p className="font-semibold text-[#3D2F20]">
          TraceX · Department of Software Engineering, NED University of Engineering &amp; Technology, Karachi
        </p>
        <p className="text-[11px] text-[#9A8770]">
          NED Alumni Convention 2026 Technology Showcase · Supervised by Dr. Kashif Mehboob Khan
        </p>
      </footer>
    </div>
  );
}
