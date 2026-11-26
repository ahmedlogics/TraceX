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
  Factory,
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
    <div className="min-h-screen bg-gradient-to-b from-[#F2E4CC] via-[#EBD7B8] to-[#E5CCA5] text-[#28180E] font-sans antialiased selection:bg-[#CFA872] selection:text-[#1F140D]">
      {/* ========================================================= */}
      {/* 1. TOP ROAST ESPRESSO NAVIGATION BAR                      */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 border-b border-[#3D2819] bg-[#24150D]/95 text-[#F3E5D0] shadow-md backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Standee Shield Emblem Mini */}
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#D4AF67] via-[#B88E4B] to-[#7A5B2B] p-[1.5px] shadow-sm">
              <div className="flex size-full items-center justify-center rounded-[10px] bg-[#24150D]">
                <Scissors className="size-4 text-[#D4AF67] rotate-90" />
              </div>
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-[#FAF4EA]">
                Trace<span className="text-[#D4AF67]">X</span>
              </span>
              <span className="ml-2 hidden sm:inline-block rounded-full bg-[#3D2619] border border-[#5A3B28] px-2.5 py-0.5 text-[11px] font-semibold text-[#D4AF67]">
                Visitor Showcase
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#5A3B28] bg-[#331E12] px-3.5 py-1.5 text-xs font-bold text-[#EAD5BA] hover:border-[#D4AF67] hover:text-white transition-all shadow-xs"
            >
              <QrCode className="size-3.5 text-[#D4AF67]" />
              <span className="hidden sm:inline">Live</span> Passport
            </AppLink>

            <AppLink
              href={paths.home}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#D4AF67] via-[#C59B52] to-[#B0853C] px-4 py-1.5 text-xs font-black text-[#22130B] shadow-sm hover:brightness-105 transition-all"
            >
              <span>Staff Workspace</span>
              <ArrowRight className="size-3.5" />
            </AppLink>
          </div>
        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. HERO SECTION WITH RICH CARAMEL & GOLD ACCENTS         */}
      {/* ========================================================= */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-18 sm:pb-24 border-b border-[#D8BC93]">
        {/* Subtle decorative radial grid */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#9E733D_1px,transparent_1px)] [background-size:26px_26px] opacity-20" />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center space-y-6">
          {/* Standee Shield Emblem */}
          <div className="inline-flex flex-col items-center">
            <div className="relative flex size-24 sm:size-28 items-center justify-center rounded-[32px] border-2 border-[#24150D] bg-[#FFFBF4] shadow-[0_12px_32px_rgba(36,21,13,0.18)] p-2">
              <div className="flex size-full flex-col items-center justify-center rounded-[24px] border border-[#D5B584] bg-gradient-to-b from-[#FAF2E3] to-[#F2E2C4]">
                <div className="flex items-center justify-center text-[#24150D]">
                  <Scissors className="size-9 stroke-[2.4] text-[#24150D] rotate-90" />
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="size-1.5 rounded-full bg-[#B88E4B]" />
                  <span className="h-0.5 w-4 bg-[#7A5A30]" />
                  <span className="size-1.5 rounded-full bg-[#B88E4B]" />
                </div>
              </div>
            </div>
          </div>

          {/* Title and Tagline */}
          <div className="space-y-3">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-[#22130B]">
              Trace<span className="text-[#B58943]">X</span>
            </h1>
            <p className="text-lg sm:text-2xl font-black text-[#26160D] max-w-2xl mx-auto leading-snug">
              A Blockchain-Based Real-Time Smart Supply Chain Traceability System
            </p>
          </div>

          {/* Standee Pill Banner (Warm Caramel / Gold) */}
          <div>
            <div className="inline-block rounded-full bg-[#DEC08F] border border-[#BF975A] px-5 py-2 text-xs sm:text-sm font-extrabold text-[#22130B] shadow-sm">
              From Raw Fabric Intake to Verified Customer Passport
            </div>
          </div>

          {/* Credits */}
          <p className="text-xs sm:text-sm text-[#5C4129] font-medium max-w-xl mx-auto leading-relaxed">
            Department of Software Engineering · NED University of Engineering &amp; Technology, Karachi
            <br />
            <span className="text-[11px] text-[#7A5B3E] font-semibold">Supervised by Dr. Kashif Mehboob Khan · Technology Showcase 2026</span>
          </p>

          {/* Action CTAs */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              className="inline-flex items-center gap-2 rounded-xl bg-[#24150D] px-5 py-2.5 text-xs sm:text-sm font-black text-[#F3E5D0] hover:bg-[#3D2619] transition-all shadow-md"
            >
              <QrCode className="size-4 text-[#D4AF67]" />
              <span>Explore Live Digital Passport</span>
            </AppLink>

            <AppLink
              href={paths.home}
              className="inline-flex items-center gap-2 rounded-xl border border-[#B89258] bg-[#F9F0E1]/90 px-5 py-2.5 text-xs sm:text-sm font-black text-[#26160D] hover:bg-white hover:border-[#8E6930] transition-colors shadow-xs"
            >
              <span>Open Factory Stations</span>
              <ArrowRight className="size-4" />
            </AppLink>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. THE CONVENTIONAL BLINDSPOT — 3 WHITE STAND-OUT CARDS    */}
      {/* ========================================================= */}
      <section className="py-14 sm:py-20 border-b border-[#D8BC93] bg-[#E8D4B4]/70">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-10">
          <div className="text-center space-y-2">
            <span className="inline-block rounded-full bg-[#24150D] px-5 py-1.5 text-xs font-black uppercase tracking-wider text-[#FAF4EA] shadow-xs">
              The Conventional Blindspot
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#22130B]">
              Why Modern Supply Chains Need TraceX
            </h2>
            <p className="text-sm text-[#5C4129] font-medium max-w-xl mx-auto">
              Closing the visibility gap in apparel manufacturing through edge IoT and decentralized auditability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="rounded-2xl border border-[#D5B584] bg-[#FFFDF9] p-6 shadow-[0_6px_20px_rgba(36,21,13,0.08)] space-y-4 hover:shadow-lg transition-all">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F4E4CB] text-[#7A5726] border border-[#DEBE90]">
                <Layers className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-tight text-[#22130B]">
                  Unbroken Raw-to-Garment Lineage
                </h3>
                <p className="text-xs sm:text-sm text-[#543B25] leading-relaxed">
                  Tracks physical fabric rolls directly to finished garments. TraceX binds identities at raw receiving, maintains exact meterage through split cuts, and serializes each shirt to eliminate the gap between cutting and sewing lines.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl border border-[#D5B584] bg-[#FFFDF9] p-6 shadow-[0_6px_20px_rgba(36,21,13,0.08)] space-y-4 hover:shadow-lg transition-all">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F4E4CB] text-[#7A5726] border border-[#DEBE90]">
                <Radio className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-tight text-[#22130B]">
                  Frictionless RFID Tap-to-Identify
                </h3>
                <p className="text-xs sm:text-sm text-[#543B25] leading-relaxed">
                  9-reader connected edge hardware network (13.56 MHz RC522). Machine operators tap shirts or bundle cards directly at their workstation, eliminating paper traveler sheets, barcode scanners, and manual keyboard entry.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-[#D5B584] bg-[#FFFDF9] p-6 shadow-[0_6px_20px_rgba(36,21,13,0.08)] space-y-4 hover:shadow-lg transition-all">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#F4E4CB] text-[#7A5726] border border-[#DEBE90]">
                <Lock className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-tight text-[#22130B]">
                  Zero-Knowledge Provenance Ledger
                </h3>
                <p className="text-xs sm:text-sm text-[#543B25] leading-relaxed">
                  Cryptographic SHA-256 tamper-proof ledger audit trail. Internal yields and defect logs remain strictly confidential, while providing shoppers and enterprise buyers with unalterable proof of authentic provenance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. THE TRACEABLE JOURNEY — WARM GOLDEN PARCHMENT TIMELINE  */}
      {/* ========================================================= */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-2">
            <span className="inline-block rounded-full bg-[#24150D] px-5 py-1.5 text-xs font-black uppercase tracking-wider text-[#FAF4EA] shadow-xs">
              The Traceable Journey
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#22130B]">
              From Raw Fabric to Customer Tap
            </h2>
            <p className="text-sm text-[#5C4129] font-medium max-w-xl mx-auto">
              Follow a physical fabric roll through 11 continuous checkpoints. Click any milestone to expand its technical flow.
            </p>
          </div>

          <div className="relative">
            {/* Center Vertical Connecting Spine in Mocha/Gold */}
            <div className="absolute left-6 sm:left-1/2 top-4 bottom-4 w-0.5 -translate-x-1/2 bg-gradient-to-b from-[#B88E4B] via-[#7A5726] to-[#B88E4B]" />

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
                    {/* Content Card with Warm Parchment Background */}
                    <div className="ml-14 sm:ml-0 sm:w-[calc(50%-2.25rem)] w-[calc(100%-3.5rem)]">
                      <div
                        onClick={() => toggleStep(s.step)}
                        className={`group cursor-pointer rounded-2xl border transition-all ${
                          isExpanded
                            ? "border-[#9E733D] bg-[#FFFDF9] shadow-lg ring-2 ring-[#B88E4B]/30"
                            : "border-[#D8BA8C] bg-[#FAF3E6] hover:bg-[#FFFDF9] hover:border-[#9E733D] shadow-sm"
                        } p-5 space-y-2`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono font-black uppercase tracking-wider text-[#7A5726]">
                            {s.station}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#EAD5BA] border border-[#D5B584] px-2.5 py-0.5 text-[10px] font-extrabold text-[#452D19]">
                            {s.badge}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4.5 text-[#7A5726]" />
                            <h3 className="text-sm sm:text-base font-black text-[#22130B] group-hover:text-[#8E6930] transition-colors">
                              {s.title}
                            </h3>
                          </div>
                          <ChevronDown
                            className={`size-4 text-[#7A5B3E] transition-transform duration-200 ${
                              isExpanded ? "rotate-180 text-[#8E6930]" : ""
                            }`}
                          />
                        </div>

                        <p className="text-xs text-[#5C4129] font-semibold leading-relaxed">
                          {s.tagline}
                        </p>

                        {/* Expandable Technical Narrative */}
                        <div
                          className={`overflow-hidden transition-all duration-300 text-xs sm:text-sm text-[#382414] leading-relaxed ${
                            isExpanded ? "pt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="border-t border-[#E5CCA5] pt-3 space-y-3">
                            <p>{s.narrative}</p>
                            {s.linkHref && (
                              <div className="pt-1">
                                <AppLink
                                  href={s.linkHref}
                                  className="inline-flex items-center gap-1.5 font-black text-xs text-[#7A5726] hover:text-[#24150D] transition-colors"
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

                    {/* Standee Solid Mocha/Gold Badge with White Number */}
                    <div className="absolute left-6 sm:left-1/2 -translate-x-1/2 flex size-10 items-center justify-center rounded-full bg-[#5E422C] border-2 border-[#D5B584] text-white shadow-md ring-4 ring-[#F2E4CC]">
                      <span className="font-mono text-sm font-black">{s.step}</span>
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
      {/* 5. COMPLIANCE & IMPACT METRICS (STAND-OUT CARDS)           */}
      {/* ========================================================= */}
      <section className="py-14 sm:py-20 border-t border-b border-[#D8BC93] bg-[#E8D4B4]/70">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-10 text-center">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-[#22130B]">
              Compliance &amp; Impact Metrics
            </h2>
            <p className="text-sm text-[#5C4129] font-medium">
              Measurable operational and regulatory impact on garment manufacturing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-[#D5B584] bg-[#FFFDF9] p-6 shadow-sm space-y-2">
              <div className="text-3xl sm:text-4xl font-black text-[#7A5726] tracking-tight">
                [ 100% ]
              </div>
              <h3 className="text-sm font-black text-[#22130B]">
                Traceability Lineage from Yarn to Retail
              </h3>
              <p className="text-xs text-[#5C4129] font-medium">
                Unbroken custody chain linking initial raw fabric batch specs directly to retail garments.
              </p>
            </div>

            <div className="rounded-2xl border border-[#D5B584] bg-[#FFFDF9] p-6 shadow-sm space-y-2">
              <div className="text-3xl sm:text-4xl font-black text-[#7A5726] tracking-tight">
                [ 5 – 8 ]%
              </div>
              <h3 className="text-sm font-black text-[#22130B]">
                Fabric Waste Reduction via Smart Allocation
              </h3>
              <p className="text-xs text-[#5C4129] font-medium">
                Real-time AI roll matching optimizes yardage usage and minimizes remnant offcut scrap.
              </p>
            </div>

            <div className="rounded-2xl border border-[#D5B584] bg-[#FFFDF9] p-6 shadow-sm space-y-2">
              <div className="text-3xl sm:text-4xl font-black text-[#7A5726] tracking-tight">
                [ EU DPP ]
              </div>
              <h3 className="text-sm font-black text-[#22130B]">
                Digital Product Passport Compliant
              </h3>
              <p className="text-xs text-[#5C4129] font-medium">
                Meets EU Ecodesign for Sustainable Products Regulation (ESPR) provenance requirements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. BLOCKCHAIN VERIFIED ROAST ESPRESSO CALLOUT BANNER      */}
      {/* ========================================================= */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="rounded-3xl border border-[#4A3020] bg-[#22130B] text-[#F3E5D0] p-8 sm:p-12 shadow-2xl text-center space-y-6">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#D4AF67]/15 border border-[#D4AF67]/40 text-[#D4AF67]">
              <CheckCircle2 className="size-6 text-[#D4AF67]" />
            </div>

            <div className="space-y-2 max-w-xl mx-auto">
              <h3 className="text-xl sm:text-2xl font-black tracking-wider text-[#D4AF67] uppercase">
                Blockchain Verified
              </h3>
              <p className="text-xs sm:text-sm text-[#E2CDAF] leading-relaxed">
                Every garment is sealed with an immutable SHA-256 tamperproof hash. Anyone can scan the embedded NFC tag or QR code to verify complete factory authenticity on the public ledger.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <AppLink
                href={paths.publicJourney("shirt-001-demo")}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#D4AF67] via-[#C59B52] to-[#B0853C] px-5 py-2.5 text-xs sm:text-sm font-black text-[#22130B] hover:brightness-105 transition-all shadow-md"
              >
                <QrCode className="size-4" />
                <span>Verify Sample Garment</span>
              </AppLink>

              <AppLink
                href={paths.home}
                className="inline-flex items-center gap-2 rounded-xl border border-[#5A3B28] bg-[#331E12] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#EAD5BA] hover:bg-[#452A1A] transition-colors"
              >
                <span>Factory Workspace</span>
                <ArrowRight className="size-4" />
              </AppLink>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 7. FOOTER                                                 */}
      {/* ========================================================= */}
      <footer className="border-t border-[#D5B584] bg-[#DEBA88] py-8 text-center text-xs text-[#382414] space-y-1">
        <p className="font-black text-[#22130B]">
          TraceX · Department of Software Engineering, NED University of Engineering &amp; Technology, Karachi
        </p>
        <p className="text-[11px] text-[#4A301C] font-semibold">
          Supervised by Dr. Kashif Mehboob Khan · Technology Showcase 2026
        </p>
      </footer>
    </div>
  );
}
