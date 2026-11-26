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
  sub: string;
  station: string;
  narrative: string;
  side: "left" | "right";
  icon: typeof Boxes;
  badge: string;
}

const JOURNEY_STAGES: JourneyStage[] = [
  {
    step: 1,
    title: "FABRIC RECEIVING",
    sub: "Raw roll logging",
    station: "Station 1 · Intake Dock",
    narrative:
      "The journey begins at fabric receiving, where the material manager enters fabric roll specifications into the dashboard and scans an RFID card at the intake scanner to digitally bind the material details to that physical bundle.",
    side: "left",
    icon: Boxes,
    badge: "Intake RFID Card",
  },
  {
    step: 2,
    title: "INCOMING QC",
    sub: "Quality checks",
    station: "Station 1 QC · Quality Gate",
    narrative:
      "The bundle automatically routes to the incoming quality manager's dashboard, who inspects the fabric against standard specifications and marks it as approved.",
    side: "right",
    icon: ShieldCheck,
    badge: "Dock QC Approval",
  },
  {
    step: 3,
    title: "RAW STORE ISSUE",
    sub: "Material allocation",
    station: "Station 2 · Material Store",
    narrative:
      "When the raw store manager creates a production order, an integrated AI recommender analyzes all accepted fabric inventory in real time to suggest the optimal roll that minimizes remnant cutting scrap. The manager selects the AI-recommended roll and scans its bundle card, seamlessly linking the production order to that exact fabric before issuing it to the floor.",
    side: "left",
    icon: Sparkles,
    badge: "AI Roll Matching",
  },
  {
    step: 4,
    title: "CUTTING & RFID BIND",
    sub: "Identify assignment",
    station: "Station 3 · Cutting Table",
    narrative:
      "At the cutting table, the operator scans the bundle card to automatically load all of its associated production orders, selects the specific order currently being cut, scans individual tags one by one to serialize each garment under that order, and clicks to complete the order to release the batch to the assembly line.",
    side: "right",
    icon: Scissors,
    badge: "Garment Serialization",
  },
  {
    step: 5,
    title: "STITCHING ASSEMBLY",
    sub: "Real-time tracking",
    station: "Station 4 · Sewing Line",
    narrative:
      "The garments move through stitching, where line operators simply tap each shirt on their station scanners to instantly update manufacturing progress in real time without any manual typing.",
    side: "left",
    icon: Cpu,
    badge: "Direct RFID Tap",
  },
  {
    step: 6,
    title: "FINISHING",
    sub: "Assembly completion",
    station: "Station 5 · Finishing Table",
    narrative:
      "The stitched garments proceed to finishing for thread trimming, buttoning, and pressing. Operators tap each garment on the finishing scanner to mark assembly complete and advance it directly to quality verification.",
    side: "right",
    icon: Shirt,
    badge: "Finishing Sensor",
  },
  {
    step: 7,
    title: "FINAL QC",
    sub: "Inspection",
    station: "Station 6 · Inspection Gate",
    narrative:
      "At the final quality gate, the inspector physically examines the completed garment, enters the evaluation decision on the screen, and taps the shirt on the inspection scanner to cryptographically bind the quality clearance to the product's identity.",
    side: "left",
    icon: ShieldCheck,
    badge: "Cryptographic Seal",
  },
  {
    step: 8,
    title: "PACKAGING",
    sub: "Verification",
    station: "Station 7 · Packing Station",
    narrative:
      "Approved garments move to the packaging station, where the operator scans a box card to initialize a new carton on the dashboard, scans each shirt directly into that container, and seals the package.",
    side: "right",
    icon: Package,
    badge: "Master Carton Tag",
  },
  {
    step: 9,
    title: "WAREHOUSE",
    sub: "stocking",
    station: "Station 8 · Finished Goods",
    narrative:
      "The sealed carton is transported to the finished-goods warehouse, where a zero-touch scan at the inbound reader instantly registers the box and its contents into stock inventory.",
    side: "left",
    icon: Warehouse,
    badge: "Zero-Touch Ingestion",
  },
  {
    step: 10,
    title: "DISPATCH",
    sub: "Final ledger",
    station: "Station 9 · Loading Dock Gate",
    narrative:
      "When scheduled for delivery, the dispatch logistics officer scans the carton at the loading dock, where the system verifies that every enclosed item has passed all quality gates, writes the permanent departure record to the ledger, and clears the shipment for freight release.",
    side: "right",
    icon: Truck,
    badge: "Outbound Clearance",
  },
  {
    step: 11,
    title: "TO CUSTOMER",
    sub: "SCAN QR → Live",
    station: "Retail / Post-Sale · Customer Experience",
    narrative:
      "Finally, when the garment reaches the consumer, the buyer taps their smartphone against the embedded smart tag to instantly launch its Digital Product Passport, providing complete and verifiable transparency into the garment's ethical origin, AI-optimized material efficiency, manufacturing timeline, and authentic craftsmanship.",
    side: "left",
    icon: QrCode,
    badge: "Live Passport",
  },
];

export function AboutView() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const toggleStep = (step: number) => {
    setActiveStep((prev) => (prev === step ? null : step));
  };

  return (
    <div className="min-h-screen bg-[#F4E8D3] text-[#291B12] font-sans selection:bg-[#DEC49F] selection:text-[#1F140D]">
      {/* Top Standee Organic Arch Frame */}
      <div className="w-full bg-[#291B12] text-[#F3E7D3] pt-3 pb-4 px-4 border-b border-[#3E2C20]">
        <div className="mx-auto max-w-4xl flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#C29F6C] animate-pulse" />
            <span className="tracking-wider uppercase text-[11px] text-[#C29F6C] font-semibold">
              NED Alumni Convention 2026 Showcase
            </span>
          </div>

          <div className="flex items-center gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              className="inline-flex items-center gap-1.5 text-xs text-[#E8D6BF] hover:text-white transition-colors"
            >
              <QrCode className="size-3.5 text-[#C29F6C]" />
              <span>Live Passport</span>
            </AppLink>
            <span className="text-[#594132]">·</span>
            <AppLink
              href={paths.home}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#C29F6C] text-[#24150D] font-bold px-3 py-1 text-[11px] hover:bg-[#D5B584] transition-colors"
            >
              <span>Staff Workspace</span>
              <ArrowRight className="size-3" />
            </AppLink>
          </div>
        </div>
      </div>

      {/* Main Standee Column (max-w-2xl creates the exact vertical standee proportion) */}
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12 space-y-10">
        {/* ========================================================= */}
        {/* HEADER SECTION: LOGO, TITLE, TAGLINE, HERO BANNER         */}
        {/* ========================================================= */}
        <section className="text-center space-y-5">
          {/* Standee Shield Logo Badge */}
          <div className="inline-flex flex-col items-center">
            <div className="relative flex size-24 sm:size-28 items-center justify-center rounded-[32px] border-2 border-[#291B12] bg-[#FAF5EC] shadow-[0_8px_24px_rgba(41,27,18,0.12)] p-2">
              {/* Inner Shield Graphic with Scissors and Blockchain nodes */}
              <div className="flex size-full flex-col items-center justify-center rounded-[24px] border border-[#D9C4A6] bg-[#F7EFE1]">
                <div className="flex items-center justify-center text-[#291B12]">
                  <Scissors className="size-9 stroke-[2.2] text-[#291B12] rotate-90" />
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="size-1.5 rounded-full bg-[#C29F6C]" />
                  <span className="h-0.5 w-4 bg-[#8C6D4A]" />
                  <span className="size-1.5 rounded-full bg-[#C29F6C]" />
                </div>
              </div>
            </div>
          </div>

          {/* Title: TraceX */}
          <div className="space-y-1">
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-[#24160E]">
              Trace<span className="text-[#C29F6C]">X</span>
            </h1>
            <p className="text-base sm:text-lg font-bold text-[#2A1B12] max-w-lg mx-auto leading-snug">
              A Blockchain-Based Real-Time Smart Supply Chain Traceability System
            </p>
          </div>

          {/* Golden Tan Pill Banner */}
          <div>
            <div className="inline-block rounded-full bg-[#DEC49F] border border-[#C5AA82] px-5 py-1.5 text-xs sm:text-sm font-bold text-[#26170E] shadow-xs">
              From Raw Fabric Intake to Verified Customer Passport
            </div>
          </div>

          {/* Standee Visual Vignette Chain (Fabric Roll ➔ Factory ➔ Sewing ➔ Box ➔ Blockchain) */}
          <div className="pt-2">
            <div className="rounded-2xl border border-[#DBC19C] bg-[#ECE0CB]/70 p-3.5 shadow-inner">
              <div className="flex items-center justify-between max-w-md mx-auto text-[#291B12]">
                {/* 1. Fabric Roll */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex size-11 items-center justify-center rounded-full bg-white/90 border border-[#D5BE98] shadow-xs">
                    <Boxes className="size-5 text-[#8A673E]" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A412F]">Fabric</span>
                </div>

                <span className="text-[#C29F6C] font-bold">➔</span>

                {/* 2. Factory */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex size-11 items-center justify-center rounded-full bg-white/90 border border-[#D5BE98] shadow-xs">
                    <Factory className="size-5 text-[#8A673E]" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A412F]">Factory</span>
                </div>

                <span className="text-[#C29F6C] font-bold">➔</span>

                {/* 3. Sewing */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex size-11 items-center justify-center rounded-full bg-white/90 border border-[#D5BE98] shadow-xs">
                    <Shirt className="size-5 text-[#8A673E]" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A412F]">Assembly</span>
                </div>

                <span className="text-[#C29F6C] font-bold">➔</span>

                {/* 4. Carton */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex size-11 items-center justify-center rounded-full bg-white/90 border border-[#D5BE98] shadow-xs">
                    <Package className="size-5 text-[#8A673E]" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A412F]">Carton</span>
                </div>

                <span className="text-[#C29F6C] font-bold">➔</span>

                {/* 5. Blockchain Cubes */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex size-11 items-center justify-center rounded-full bg-[#291B12] text-[#DEC49F] shadow-xs">
                    <Lock className="size-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#291B12]">Ledger</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* THE CONVENTIONAL BLINDSPOT — 3 WHITE CARDS                */}
        {/* ========================================================= */}
        <section className="space-y-4">
          {/* Dark Espresso Badge */}
          <div className="text-center">
            <span className="inline-block rounded-full bg-[#291B12] px-5 py-1 text-xs font-bold uppercase tracking-wider text-[#FAF5EC] shadow-xs">
              The Conventional Blindspot
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Card 1 */}
            <div className="rounded-2xl border border-[#D8C2A0] bg-white p-4 text-center shadow-[0_4px_16px_rgba(41,27,18,0.06)] space-y-2.5">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-[#F7EFE1] text-[#291B12] border border-[#E5D2B8]">
                <Layers className="size-5 text-[#8A673E]" />
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-tight text-[#24160E] leading-snug">
                Unbroken Raw-to-Garment Lineage
              </h3>
              <p className="text-[11px] text-[#594435] leading-relaxed">
                Tracks physical fabric rolls directly to finished garments.
              </p>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl border border-[#D8C2A0] bg-white p-4 text-center shadow-[0_4px_16px_rgba(41,27,18,0.06)] space-y-2.5">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-[#F7EFE1] text-[#291B12] border border-[#E5D2B8]">
                <Radio className="size-5 text-[#8A673E]" />
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-tight text-[#24160E] leading-snug">
                Frictionless RFID Tap-to-Identify
              </h3>
              <p className="text-[11px] text-[#594435] leading-relaxed">
                9-reader connected edge hardware network (13.56 MHz RC522).
              </p>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-[#D8C2A0] bg-white p-4 text-center shadow-[0_4px_16px_rgba(41,27,18,0.06)] space-y-2.5">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-[#F7EFE1] text-[#291B12] border border-[#E5D2B8]">
                <Lock className="size-5 text-[#8A673E]" />
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-tight text-[#24160E] leading-snug">
                Zero-Knowledge Provenance Ledger
              </h3>
              <p className="text-[11px] text-[#594435] leading-relaxed">
                Cryptographic SHA-256 tamper-proof ledger audit trail.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* THE TRACEABLE JOURNEY — STANDEE ZIG-ZAG TIMELINE          */}
        {/* ========================================================= */}
        <section className="space-y-4">
          {/* Dark Espresso Badge */}
          <div className="text-center">
            <span className="inline-block rounded-full bg-[#291B12] px-6 py-1 text-xs font-bold uppercase tracking-wider text-[#FAF5EC] shadow-xs">
              The Traceable Journey
            </span>
          </div>

          {/* Main Beige/Caramel Card Container */}
          <div className="rounded-3xl border border-[#D5BE98] bg-[#F7ECD9] p-5 sm:p-7 shadow-[0_8px_24px_rgba(41,27,18,0.08)]">
            <div className="relative">
              {/* Central Spine Line */}
              <div className="absolute left-1/2 top-3 bottom-3 w-0.5 -translate-x-1/2 bg-[#B89B7A]" />

              <div className="space-y-5">
                {JOURNEY_STAGES.map((s) => {
                  const Icon = s.icon;
                  const isExpanded = activeStep === s.step;
                  const isLeft = s.side === "left";

                  return (
                    <div key={s.step} className="relative flex items-center justify-between">
                      {/* Left Slot */}
                      <div className="w-[calc(50%-1.5rem)] text-right pr-2">
                        {isLeft ? (
                          <div
                            onClick={() => toggleStep(s.step)}
                            className="group cursor-pointer select-none space-y-0.5 inline-block text-right"
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-extrabold text-xs sm:text-sm text-[#26170E] group-hover:text-[#8C6D4A] transition-colors uppercase">
                                {s.title}
                              </span>
                              <Icon className="size-4 shrink-0 text-[#7A5B3D]" />
                            </div>
                            <div className="text-[10px] sm:text-[11px] text-[#69513F] font-medium flex items-center justify-end gap-1">
                              <span>{s.sub}</span>
                              <span className="text-[#8C6D4A] font-bold">➔</span>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Center Solid Circle Badge with Number */}
                      <button
                        type="button"
                        onClick={() => toggleStep(s.step)}
                        aria-label={`Toggle details for ${s.title}`}
                        className="relative z-10 flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-full bg-[#6D5545] text-white shadow-sm ring-2 ring-[#F7ECD9] hover:bg-[#291B12] transition-colors cursor-pointer"
                      >
                        <span className="font-mono text-xs sm:text-sm font-extrabold">{s.step}</span>
                      </button>

                      {/* Right Slot */}
                      <div className="w-[calc(50%-1.5rem)] text-left pl-2">
                        {!isLeft ? (
                          <div
                            onClick={() => toggleStep(s.step)}
                            className="group cursor-pointer select-none space-y-0.5 inline-block text-left"
                          >
                            <div className="flex items-center justify-start gap-1.5">
                              <Icon className="size-4 shrink-0 text-[#7A5B3D]" />
                              <span className="font-extrabold text-xs sm:text-sm text-[#26170E] group-hover:text-[#8C6D4A] transition-colors uppercase">
                                {s.title}
                              </span>
                            </div>
                            <div className="text-[10px] sm:text-[11px] text-[#69513F] font-medium flex items-center justify-start gap-1">
                              <span className="text-[#8C6D4A] font-bold">➔</span>
                              <span>{s.sub}</span>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Expandable narrative drawer popup directly under the stage */}
                      {isExpanded && (
                        <div className="absolute left-0 right-0 top-11 z-20 rounded-2xl border border-[#C5AA82] bg-white p-4 shadow-xl text-left space-y-2 animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#8A673E]">
                              {s.station}
                            </span>
                            <span className="rounded-full bg-[#F4E8D3] px-2 py-0.5 text-[10px] font-bold text-[#5C422E]">
                              {s.badge}
                            </span>
                          </div>
                          <p className="text-xs text-[#3D2C1E] leading-relaxed">{s.narrative}</p>
                          {s.step === 11 && (
                            <div className="pt-1">
                              <AppLink
                                href={paths.publicJourney("shirt-001-demo")}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8A673E] hover:underline"
                              >
                                <span>Launch Live Sample Digital Product Passport</span>
                                <ExternalLink className="size-3" />
                              </AppLink>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Standee QR Code Tap CTA at bottom of timeline */}
            <div className="mt-8 pt-5 border-t border-[#DEC8A6] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left space-y-0.5">
                <span className="text-xs font-black text-[#26170E] uppercase tracking-wide">
                  Touch-free Visitor Experience
                </span>
                <p className="text-[11px] text-[#69513F]">
                  Tap any numbered milestone above to view live technical execution details.
                </p>
              </div>

              <AppLink
                href={paths.publicJourney("shirt-001-demo")}
                className="inline-flex items-center gap-2 rounded-xl bg-[#291B12] px-4 py-2 text-xs font-bold text-[#F3E7D3] hover:bg-[#3E2C20] shadow-sm transition-all"
              >
                <QrCode className="size-4 text-[#C29F6C]" />
                <span>Open Live Customer Passport</span>
              </AppLink>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* COMPLIANCE & IMPACT METRICS                               */}
        {/* ========================================================= */}
        <section className="space-y-4">
          <div className="text-center">
            <h2 className="text-lg sm:text-xl font-extrabold text-[#26170E]">
              Compliance &amp; Impact Metrics
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-center">
            {/* Metric 1 */}
            <div className="rounded-2xl border border-[#D5BE98] bg-[#F7ECD9] p-4 shadow-xs space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-[#26170E] tracking-tight">
                [ 100% ]
              </div>
              <p className="text-xs font-bold text-[#2A1B12]">
                Traceability Lineage
              </p>
              <p className="text-[11px] text-[#6E5544]">
                from Yarn to Retail
              </p>
            </div>

            {/* Metric 2 */}
            <div className="rounded-2xl border border-[#D5BE98] bg-[#F7ECD9] p-4 shadow-xs space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-[#26170E] tracking-tight">
                [ 5 – 8]%
              </div>
              <p className="text-xs font-bold text-[#2A1B12]">
                Fabric Waste Reduction
              </p>
              <p className="text-[11px] text-[#6E5544]">
                via Smart Allocation
              </p>
            </div>

            {/* Metric 3 */}
            <div className="rounded-2xl border border-[#D5BE98] bg-[#F7ECD9] p-4 shadow-xs space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-[#26170E] tracking-tight">
                [ EU DPP ]
              </div>
              <p className="text-xs font-bold text-[#2A1B12]">
                Digital Product Passport
              </p>
              <p className="text-[11px] text-[#6E5544]">
                Compliant
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* BLOCKCHAIN VERIFIED FOOTER CARD (DEEP ROAST ESPRESSO)      */}
        {/* ========================================================= */}
        <section>
          <div className="rounded-3xl border border-[#3E2B1E] bg-[#22150E] text-[#F3E7D3] p-6 sm:p-8 shadow-xl text-center space-y-4">
            {/* Golden Shield / Check Icon */}
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#C29F6C]/15 border border-[#C29F6C]/40 text-[#C29F6C]">
              <CheckCircle2 className="size-6 text-[#C29F6C]" />
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-lg sm:text-xl font-black tracking-wider text-[#C29F6C] uppercase">
                BLOCKCHAIN VERIFIED
              </h3>
              <p className="text-xs text-[#E5D2BA] leading-relaxed">
                Every garment sealed with a SHA-256 tamperproof hash. Scan to verify authenticity on the public ledger.
              </p>
            </div>

            {/* Standee Dot Chain Indicator */}
            <div className="flex items-center justify-center gap-2 pt-1 text-[#C29F6C]/60">
              <span className="size-1.5 rounded-full bg-[#C29F6C]" />
              <span className="h-0.5 w-6 bg-[#C29F6C]/30" />
              <span className="size-1.5 rounded-full bg-[#C29F6C]" />
              <span className="h-0.5 w-6 bg-[#C29F6C]/30" />
              <span className="size-1.5 rounded-full bg-[#C29F6C]" />
              <span className="h-0.5 w-6 bg-[#C29F6C]/30" />
              <span className="size-1.5 rounded-full bg-[#C29F6C]" />
            </div>

            {/* Quick Actions */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <AppLink
                href={paths.publicJourney("shirt-001-demo")}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C29F6C] px-4 py-2 text-xs font-bold text-[#24150D] hover:bg-[#D5B584] transition-all shadow-sm"
              >
                <QrCode className="size-3.5" />
                <span>Verify Sample Garment</span>
              </AppLink>

              <AppLink
                href={paths.home}
                className="inline-flex items-center gap-2 rounded-xl border border-[#543C2C] bg-[#332117] px-4 py-2 text-xs font-bold text-[#E5D2BA] hover:bg-[#452D20] transition-colors"
              >
                <span>Factory Login</span>
                <ArrowRight className="size-3.5" />
              </AppLink>
            </div>
          </div>
        </section>

        {/* Footer Credits */}
        <footer className="text-center text-[11px] text-[#7A604D] space-y-1 pt-2 pb-6">
          <p className="font-bold text-[#291B12]">
            TraceX · Department of Software Engineering, NED University of Engineering &amp; Technology, Karachi
          </p>
          <p>
            Supervised by Dr. Kashif Mehboob Khan · Technology Showcase 2026
          </p>
        </footer>
      </main>
    </div>
  );
}
