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
  narrative: string;
  badge: string;
  icon: typeof Boxes;
  linkHref?: string;
  linkText?: string;
}

const STAGES: JourneyStage[] = [
  {
    step: 1,
    title: "Fabric Receiving",
    station: "Station 1 · Intake Dock",
    tagline: "Raw roll logging & physical RFID binding",
    narrative:
      "The journey begins at fabric receiving, where the material manager enters fabric roll specifications into the dashboard and scans an RFID card at the intake scanner to digitally bind the material details to that physical bundle.",
    badge: "Intake RFID Card",
    icon: Boxes,
  },
  {
    step: 2,
    title: "Incoming QC",
    station: "Station 1 QC · Quality Gate",
    tagline: "Technical specification & defect inspection",
    narrative:
      "The bundle automatically routes to the incoming quality manager's dashboard, who inspects the fabric against standard specifications and marks it as approved.",
    badge: "Dock QC Approval",
    icon: ShieldCheck,
  },
  {
    step: 3,
    title: "Raw Store Issue & AI Recommender",
    station: "Station 2 · Material Store",
    tagline: "AI-driven material allocation to minimize remnant scrap",
    narrative:
      "When the raw store manager creates a production order, an integrated AI recommender analyzes all accepted fabric inventory in real time to suggest the optimal roll that minimizes remnant cutting scrap. The manager selects the AI-recommended roll and scans its bundle card, seamlessly linking the production order to that exact fabric before issuing it to the floor.",
    badge: "AI Optimization",
    icon: Sparkles,
  },
  {
    step: 4,
    title: "Cutting & RFID Serialization",
    station: "Station 3 · Cutting Table",
    tagline: "Pattern cutting & individual garment UID assignment",
    narrative:
      "At the cutting table, the operator scans the bundle card to automatically load all of its associated production orders, selects the specific order currently being cut, scans individual tags one by one to serialize each garment under that order, and clicks to complete the order to release the batch to the assembly line.",
    badge: "Garment Serialization",
    icon: Scissors,
  },
  {
    step: 5,
    title: "Stitching Assembly",
    station: "Station 4 · Sewing Line",
    tagline: "Real-time assembly progress checkpointing",
    narrative:
      "The garments move through stitching, where line operators simply tap each shirt on their station scanners to instantly update manufacturing progress in real time without any manual typing.",
    badge: "Direct RFID Tap",
    icon: Cpu,
  },
  {
    step: 6,
    title: "Finishing & Detailing",
    station: "Station 5 · Finishing Table",
    tagline: "Assembly completion, thread trimming, and pressing",
    narrative:
      "The stitched garments proceed to finishing for thread trimming, buttoning, and pressing. Operators tap each garment on the finishing scanner to mark assembly complete and advance it directly to quality verification.",
    badge: "Zero-Touch Sensor",
    icon: Shirt,
  },
  {
    step: 7,
    title: "Final QC & Cryptographic Clearance",
    station: "Station 6 · Inspection Gate",
    tagline: "100% garment inspection & immutable quality clearance",
    narrative:
      "At the final quality gate, the inspector physically examines the completed garment, enters the evaluation decision on the screen, and taps the shirt on the inspection scanner to cryptographically bind the quality clearance to the product's identity.",
    badge: "Cryptographic Seal",
    icon: ShieldCheck,
  },
  {
    step: 8,
    title: "Packaging & Carton Aggregation",
    station: "Station 7 · Packing Station",
    tagline: "Master carton initialization & product packing",
    narrative:
      "Approved garments move to the packaging station, where the operator scans a box card to initialize a new carton on the dashboard, scans each shirt directly into that container, and seals the package.",
    badge: "Container Aggregation",
    icon: Package,
  },
  {
    step: 9,
    title: "Warehouse Ingestion",
    station: "Station 8 · Finished Goods",
    tagline: "Zero-touch inbound stock registration",
    narrative:
      "The sealed carton is transported to the finished-goods warehouse, where a zero-touch scan at the inbound reader instantly registers the box and its contents into stock inventory.",
    badge: "Automated Ingestion",
    icon: Warehouse,
  },
  {
    step: 10,
    title: "Outbound Dispatch & Ledger Audit",
    station: "Station 9 · Loading Dock Gate",
    tagline: "Permanent ledger audit record & freight departure clearance",
    narrative:
      "When scheduled for delivery, the dispatch logistics officer scans the carton at the loading dock, where the system verifies that every enclosed item has passed all quality gates, writes the permanent departure record to the ledger, and clears the shipment for freight release.",
    badge: "Immutable Ledger Audit",
    icon: Truck,
  },
  {
    step: 11,
    title: "Consumer Digital Product Passport",
    station: "Retail / Post-Sale · Consumer Experience",
    tagline: "Tap NFC or scan QR for complete garment provenance",
    narrative:
      "Finally, when the garment reaches the consumer, the buyer taps their smartphone against the embedded smart tag to instantly launch its Digital Product Passport, providing complete and verifiable transparency into the garment's ethical origin, AI-optimized material efficiency, manufacturing timeline, and authentic craftsmanship.",
    badge: "Live Customer DPP",
    icon: QrCode,
    linkHref: paths.publicJourney("shirt-001-demo"),
    linkText: "Explore Live Sample Passport",
  },
];

export function AboutView() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const toggleStep = (step: number) => {
    setActiveStep((prev) => (prev === step ? null : step));
  };

  return (
    <div className="min-h-screen bg-[#F6EEDF] text-[#24170E] font-sans selection:bg-[#DFC7A2] selection:text-[#1F140D]">
      {/* ========================================================= */}
      {/* TOP NAVIGATION BAR                                        */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 border-b border-[#E2D2BC] bg-[#F6EEDF]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#8C6D4A] via-[#B89658] to-[#6E5334] text-white shadow-xs">
              <span className="font-serif font-black text-lg leading-none tracking-tight">TX</span>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-[#24170E]">
                Trace<span className="text-[#B89658]">X</span>
              </span>
              <span className="ml-2 hidden sm:inline-block rounded-full bg-[#EADCC8] px-2.5 py-0.5 text-[11px] font-semibold text-[#664F34]">
                Visitor Information
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5C2A5] bg-white/80 px-3.5 py-1.5 text-xs font-bold text-[#5C4329] shadow-xs hover:bg-white hover:border-[#B89658] transition-all"
            >
              <QrCode className="size-3.5 text-[#B89658]" />
              <span className="hidden sm:inline">Live</span> Passport
            </AppLink>

            <AppLink
              href={paths.home}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#24170E] px-4 py-1.5 text-xs font-bold text-[#F6EEDF] shadow-xs hover:bg-[#382618] transition-all"
            >
              <span>Staff Workspace</span>
              <ArrowRight className="size-3.5" />
            </AppLink>
          </div>
        </div>
      </header>

      {/* ========================================================= */}
      {/* HERO SECTION                                              */}
      {/* ========================================================= */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-24 border-b border-[#E5D7C2]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#C29F6C_1px,transparent_1px)] [background-size:28px_28px] opacity-25" />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center space-y-6">
          {/* Pill Banner */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D5C2A5] bg-[#EADCC8]/80 px-4 py-1.5 text-xs sm:text-sm font-bold text-[#5C4329] shadow-xs">
            <span className="size-2 rounded-full bg-[#B89658] animate-pulse" />
            <span>From Raw Fabric Intake to Verified Customer Passport</span>
          </div>

          {/* Main Title & Subtitle */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-[#24170E]">
              Trace<span className="text-[#B89658]">X</span>
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-[#453221] max-w-2xl mx-auto leading-snug">
              A Blockchain-Based Real-Time Smart Supply Chain Traceability System
            </p>
          </div>

          <p className="text-xs sm:text-sm text-[#735C45] max-w-xl mx-auto leading-relaxed">
            Department of Software Engineering · NED University of Engineering &amp; Technology, Karachi
            <br />
            <span className="text-[11px] text-[#8E755B]">Supervised by Dr. Kashif Mehboob Khan · Technology Showcase 2026</span>
          </p>

          {/* CTA Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#24170E] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#F6EEDF] hover:bg-[#382618] transition-all shadow-sm"
            >
              <QrCode className="size-4 text-[#B89658]" />
              <span>Explore Live Digital Passport</span>
            </AppLink>

            <AppLink
              href={paths.home}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D5C2A5] bg-white/90 px-5 py-2.5 text-xs sm:text-sm font-bold text-[#453221] hover:bg-white hover:border-[#B89658] transition-colors shadow-xs"
            >
              <span>Open Factory Stations</span>
              <ArrowRight className="size-4" />
            </AppLink>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3 CORE ARCHITECTURAL PILLARS                              */}
      {/* ========================================================= */}
      <section className="py-14 sm:py-20 border-b border-[#E5D7C2] bg-[#EFE4D2]/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-10">
          <div className="text-center space-y-2">
            <span className="inline-block rounded-full bg-[#24170E] px-4 py-1 text-xs font-bold uppercase tracking-wider text-[#F6EEDF]">
              The Conventional Blindspot
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#24170E]">
              Why Supply Chains Need TraceX
            </h2>
            <p className="text-sm text-[#66513D] max-w-xl mx-auto">
              Closing the visibility gap in apparel manufacturing through edge IoT and decentralized auditability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pillar 1 */}
            <div className="rounded-2xl border border-[#D5C2A5] bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F6EEDF] text-[#8C6D4A] border border-[#E0D0BB]">
                <Layers className="size-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-[#24170E]">
                  Unbroken Raw-to-Garment Lineage
                </h3>
                <p className="text-xs sm:text-sm text-[#5C4735] leading-relaxed">
                  Tracks physical fabric rolls directly to finished garments. TraceX binds identities at raw receiving, maintains exact meterage through split cuts, and serializes each shirt to eliminate the gap between cutting and sewing lines.
                </p>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-2xl border border-[#D5C2A5] bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F6EEDF] text-[#8C6D4A] border border-[#E0D0BB]">
                <Radio className="size-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-[#24170E]">
                  Frictionless RFID Tap-to-Identify
                </h3>
                <p className="text-xs sm:text-sm text-[#5C4735] leading-relaxed">
                  9-reader connected edge hardware network (13.56 MHz RC522). Machine operators tap shirts or bundle cards directly at their workstation, eliminating paper traveler sheets, barcode scanners, and manual keyboard entry.
                </p>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-2xl border border-[#D5C2A5] bg-white p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F6EEDF] text-[#8C6D4A] border border-[#E0D0BB]">
                <Lock className="size-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-[#24170E]">
                  Zero-Knowledge Provenance Ledger
                </h3>
                <p className="text-xs sm:text-sm text-[#5C4735] leading-relaxed">
                  Cryptographic SHA-256 tamper-proof ledger audit trail. Internal yields and defect logs remain strictly confidential, while providing shoppers and enterprise buyers with unalterable proof of authentic provenance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* THE TRACEABLE JOURNEY — 11-STAGE INTERACTIVE TIMELINE     */}
      {/* ========================================================= */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-2">
            <span className="inline-block rounded-full bg-[#24170E] px-4 py-1 text-xs font-bold uppercase tracking-wider text-[#F6EEDF]">
              The Traceable Journey
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#24170E]">
              From Raw Fabric to Customer Tap
            </h2>
            <p className="text-sm text-[#66513D] max-w-xl mx-auto">
              Follow a physical fabric roll through 11 continuous checkpoints. Click any milestone to expand its technical flow.
            </p>
          </div>

          <div className="relative">
            {/* Center Vertical Connecting Spine */}
            <div className="absolute left-6 sm:left-1/2 top-4 bottom-4 w-0.5 -translate-x-1/2 bg-gradient-to-b from-[#C29F6C] via-[#8C6D4A] to-[#C29F6C]" />

            <div className="space-y-6 sm:space-y-8">
              {STAGES.map((s) => {
                const Icon = s.icon;
                const isExpanded = activeStep === s.step;
                const isLeft = s.step % 2 !== 0;

                return (
                  <div
                    key={s.step}
                    className={`relative flex flex-col sm:flex-row items-start ${
                      isLeft ? "sm:flex-row-reverse" : ""
                    }`}
                  >
                    {/* Content Card */}
                    <div className="ml-14 sm:ml-0 sm:w-[calc(50%-2.25rem)] w-[calc(100%-3.5rem)]">
                      <div
                        onClick={() => toggleStep(s.step)}
                        className={`group cursor-pointer rounded-2xl border transition-all ${
                          isExpanded
                            ? "border-[#B89658] bg-white shadow-md ring-2 ring-[#B89658]/20"
                            : "border-[#D5C2A5] bg-[#FDFBF7] hover:bg-white hover:border-[#B89658] shadow-xs"
                        } p-5 space-y-2`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#8C6D4A]">
                            {s.station}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#EFE4D2] px-2.5 py-0.5 text-[10px] font-bold text-[#5C4329]">
                            {s.badge}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-[#8C6D4A]" />
                            <h3 className="text-sm sm:text-base font-extrabold text-[#24170E] group-hover:text-[#8C6D4A] transition-colors">
                              {s.title}
                            </h3>
                          </div>
                          <ChevronDown
                            className={`size-4 text-[#8E755B] transition-transform duration-200 ${
                              isExpanded ? "rotate-180 text-[#8C6D4A]" : ""
                            }`}
                          />
                        </div>

                        <p className="text-xs text-[#66513D] font-medium leading-relaxed">
                          {s.tagline}
                        </p>

                        {/* Expandable Technical Narrative */}
                        <div
                          className={`overflow-hidden transition-all duration-300 text-xs sm:text-sm text-[#453221] leading-relaxed ${
                            isExpanded ? "pt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="border-t border-[#EAE0D0] pt-3 space-y-3">
                            <p>{s.narrative}</p>
                            {s.linkHref && (
                              <div className="pt-1">
                                <AppLink
                                  href={s.linkHref}
                                  className="inline-flex items-center gap-1.5 font-bold text-xs text-[#8C6D4A] hover:text-[#5C4329] transition-colors"
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

                    {/* Numbered Center Badge */}
                    <div className="absolute left-6 sm:left-1/2 -translate-x-1/2 flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#8C6D4A] to-[#5C4329] text-white shadow-md ring-4 ring-[#F6EEDF]">
                      <span className="font-mono text-sm font-extrabold">{s.step}</span>
                    </div>

                    {/* Opposite side spacer */}
                    <div className="hidden sm:block sm:w-[calc(50%-2.25rem)]" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* COMPLIANCE & IMPACT METRICS                               */}
      {/* ========================================================= */}
      <section className="py-14 sm:py-20 border-t border-b border-[#E5D7C2] bg-[#EFE4D2]/60">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-10 text-center">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#24170E]">
              Compliance &amp; Impact Metrics
            </h2>
            <p className="text-sm text-[#66513D]">
              Measurable operational and regulatory impact on garment manufacturing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-[#D5C2A5] bg-white p-6 shadow-sm space-y-2">
              <div className="text-3xl sm:text-4xl font-black text-[#8C6D4A] tracking-tight">
                [ 100% ]
              </div>
              <h3 className="text-sm font-bold text-[#24170E]">
                Traceability Lineage from Yarn to Retail
              </h3>
              <p className="text-xs text-[#66513D]">
                Unbroken custody chain linking initial raw fabric batch specs directly to retail garments.
              </p>
            </div>

            <div className="rounded-2xl border border-[#D5C2A5] bg-white p-6 shadow-sm space-y-2">
              <div className="text-3xl sm:text-4xl font-black text-[#8C6D4A] tracking-tight">
                [ 5 – 8 ]%
              </div>
              <h3 className="text-sm font-bold text-[#24170E]">
                Fabric Waste Reduction via Smart Allocation
              </h3>
              <p className="text-xs text-[#66513D]">
                Real-time AI roll matching optimizes yardage usage and minimizes remnant offcut scrap.
              </p>
            </div>

            <div className="rounded-2xl border border-[#D5C2A5] bg-white p-6 shadow-sm space-y-2">
              <div className="text-3xl sm:text-4xl font-black text-[#8C6D4A] tracking-tight">
                [ EU DPP ]
              </div>
              <h3 className="text-sm font-bold text-[#24170E]">
                Digital Product Passport Compliant
              </h3>
              <p className="text-xs text-[#66513D]">
                Meets EU Ecodesign for Sustainable Products Regulation (ESPR) provenance requirements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* BLOCKCHAIN VERIFIED CALLOUT BANNER                        */}
      {/* ========================================================= */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="rounded-3xl border border-[#3E2C20] bg-[#22150E] text-[#F6EEDF] p-8 sm:p-12 shadow-xl text-center space-y-6">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#C29F6C]/15 border border-[#C29F6C]/30 text-[#C29F6C]">
              <CheckCircle2 className="size-6 text-[#C29F6C]" />
            </div>

            <div className="space-y-2 max-w-xl mx-auto">
              <h3 className="text-xl sm:text-2xl font-black tracking-wider text-[#C29F6C] uppercase">
                Blockchain Verified
              </h3>
              <p className="text-xs sm:text-sm text-[#D8C7B0] leading-relaxed">
                Every garment is sealed with an immutable SHA-256 tamperproof hash. Anyone can scan the embedded NFC tag or QR code to verify complete factory authenticity on the public ledger.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <AppLink
                href={paths.publicJourney("shirt-001-demo")}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C29F6C] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#24150D] hover:bg-[#D5B584] transition-all shadow-sm"
              >
                <QrCode className="size-4" />
                <span>Verify Sample Garment</span>
              </AppLink>

              <AppLink
                href={paths.home}
                className="inline-flex items-center gap-2 rounded-xl border border-[#523A2B] bg-[#332015] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#E5D5C1] hover:bg-[#452D1F] transition-colors"
              >
                <span>Factory Workspace</span>
                <ArrowRight className="size-4" />
              </AppLink>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* FOOTER                                                    */}
      {/* ========================================================= */}
      <footer className="border-t border-[#E2D2BC] bg-[#EFE4D2] py-8 text-center text-xs text-[#66513D] space-y-1">
        <p className="font-bold text-[#24170E]">
          TraceX · Department of Software Engineering, NED University of Engineering &amp; Technology, Karachi
        </p>
        <p className="text-[11px] text-[#8C745C]">
          Supervised by Dr. Kashif Mehboob Khan · Technology Showcase 2026
        </p>
      </footer>
    </div>
  );
}
