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
    badge: "AI Optimization",
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
    badge: "Zero-Touch Sensor",
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
    badge: "Automated Ingestion",
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
    badge: "Immutable Ledger Audit",
  },
  {
    step: 11,
    title: "TO CUSTOMER",
    sub: "SCAN QR → Live",
    station: "Retail / Post-Sale · Consumer Experience",
    narrative:
      "Finally, when the garment reaches the consumer, the buyer taps their smartphone against the embedded smart tag to instantly launch its Digital Product Passport, providing complete and verifiable transparency into the garment's ethical origin, AI-optimized material efficiency, manufacturing timeline, and authentic craftsmanship.",
    side: "left",
    icon: QrCode,
    badge: "Live Customer DPP",
  },
];

export function AboutView() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const toggleStep = (step: number) => {
    setActiveStep((prev) => (prev === step ? null : step));
  };

  return (
    <div
      style={{
        backgroundColor: "#EFE0C9",
        color: "#28180E",
        minHeight: "100vh",
      }}
      className="font-sans antialiased selection:bg-[#CFA872] selection:text-[#1F140D]"
    >
      {/* ========================================================= */}
      {/* 1. TOP ROAST ESPRESSO NAVIGATION BAR                      */}
      {/* ========================================================= */}
      <header
        style={{
          backgroundColor: "#24150D",
          borderBottom: "1px solid #3D2819",
          color: "#F3E5D0",
        }}
        className="sticky top-0 z-50 shadow-md backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/images/tracex-icon-dark-optimized.png"
              alt="TraceX Logo"
              className="size-9 object-contain drop-shadow-sm"
            />
            <div>
              <span className="text-xl font-black tracking-tight text-[#FAF4EA]">
                Trace<span style={{ color: "#D4AF67" }}>X</span>
              </span>
              <span
                style={{
                  backgroundColor: "#3D2619",
                  borderColor: "#5A3B28",
                  color: "#D4AF67",
                }}
                className="ml-2.5 hidden sm:inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              >
                Visitor Showcase
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              style={{
                backgroundColor: "#331E12",
                borderColor: "#5A3B28",
                color: "#EAD5BA",
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-bold hover:border-[#D4AF67] hover:text-white transition-all shadow-xs"
            >
              <QrCode className="size-3.5 text-[#D4AF67]" />
              <span className="hidden sm:inline">Live</span> Passport
            </AppLink>

            <AppLink
              href={paths.home}
              style={{
                background: "linear-gradient(90deg, #D4AF67 0%, #C59B52 50%, #B0853C 100%)",
                color: "#22130B",
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-black shadow-sm hover:brightness-105 transition-all"
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
      <section
        style={{
          borderBottom: "1px solid #D5BE9B",
          backgroundColor: "#F2E4CC",
        }}
        className="relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-20"
      >
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center space-y-6">
          {/* Authentic TraceX Brand Emblem */}
          <div className="inline-flex flex-col items-center">
            <div
              style={{
                backgroundColor: "#FFFBF4",
                borderColor: "#3D2819",
                boxShadow: "0 16px 40px rgba(36,21,13,0.16)",
              }}
              className="relative flex size-28 sm:size-36 items-center justify-center rounded-[32px] border-2 p-3 sm:p-4 hover:scale-105 transition-transform duration-300"
            >
              <img
                src="/images/tracex-icon.png"
                alt="TraceX Logo"
                className="size-full object-contain drop-shadow-md"
              />
            </div>
          </div>

          {/* Title and Tagline */}
          <div className="space-y-2">
            <h1 style={{ color: "#22130B" }} className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight">
              Trace<span style={{ color: "#B58943" }}>X</span>
            </h1>
            <p style={{ color: "#28180E" }} className="text-lg sm:text-2xl font-black max-w-2xl mx-auto leading-snug">
              A Blockchain-Based Real-Time Smart Supply Chain Traceability System
            </p>
          </div>

          {/* Standee Pill Banner (Warm Caramel / Gold) */}
          <div>
            <div
              style={{
                backgroundColor: "#DEC08F",
                borderColor: "#BF975A",
                color: "#22130B",
              }}
              className="inline-block rounded-full border px-5 py-2 text-xs sm:text-sm font-extrabold shadow-sm"
            >
              From Raw Fabric Intake to Verified Customer Passport
            </div>
          </div>

          {/* Credits */}
          <p style={{ color: "#5C4129" }} className="text-xs sm:text-sm font-medium max-w-xl mx-auto leading-relaxed">
            Department of Software Engineering · NED University of Engineering &amp; Technology, Karachi
            <br />
            <span style={{ color: "#7A5B3E" }} className="text-[11px] font-semibold">
              Supervised by Dr. Kashif Mehboob Khan · Technology Showcase 2026
            </span>
          </p>

          {/* Action CTAs */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <AppLink
              href={paths.publicJourney("shirt-001-demo")}
              style={{
                backgroundColor: "#24150D",
                color: "#F3E5D0",
              }}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-black hover:bg-[#3D2619] transition-all shadow-md"
            >
              <QrCode className="size-4 text-[#D4AF67]" />
              <span>Explore Live Digital Passport</span>
            </AppLink>

            <AppLink
              href={paths.home}
              style={{
                backgroundColor: "#FAF2E3",
                borderColor: "#B89258",
                color: "#26160D",
              }}
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-xs sm:text-sm font-black hover:bg-white transition-colors shadow-xs"
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
      <section
        style={{
          backgroundColor: "#E8D5B9",
          borderBottom: "1px solid #D5BE9B",
        }}
        className="py-14 sm:py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-10">
          <div className="text-center space-y-2">
            <span
              style={{
                backgroundColor: "#24150D",
                color: "#FAF4EA",
              }}
              className="inline-block rounded-full px-5 py-1.5 text-xs font-black uppercase tracking-wider shadow-xs"
            >
              The Conventional Blindspot
            </span>
            <h2 style={{ color: "#22130B" }} className="text-2xl sm:text-3xl font-black">
              Why Modern Supply Chains Need TraceX
            </h2>
            <p style={{ color: "#5C4129" }} className="text-sm font-medium max-w-xl mx-auto">
              Closing the visibility gap in apparel manufacturing through edge IoT and decentralized auditability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div
              style={{
                backgroundColor: "#FFFDF9",
                borderColor: "#D5B584",
                boxShadow: "0 6px 20px rgba(36,21,13,0.08)",
              }}
              className="rounded-2xl border p-6 space-y-4 hover:shadow-lg transition-all"
            >
              <div
                style={{
                  backgroundColor: "#F4E4CB",
                  color: "#7A5726",
                  borderColor: "#DEBE90",
                }}
                className="flex size-12 items-center justify-center rounded-xl border"
              >
                <Layers className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 style={{ color: "#22130B" }} className="text-sm font-black uppercase tracking-tight">
                  Unbroken Raw-to-Garment Lineage
                </h3>
                <p style={{ color: "#543B25" }} className="text-xs sm:text-sm leading-relaxed">
                  Tracks physical fabric rolls directly to finished garments. TraceX binds identities at raw receiving, maintains exact meterage through split cuts, and serializes each shirt to eliminate the gap between cutting and sewing lines.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div
              style={{
                backgroundColor: "#FFFDF9",
                borderColor: "#D5B584",
                boxShadow: "0 6px 20px rgba(36,21,13,0.08)",
              }}
              className="rounded-2xl border p-6 space-y-4 hover:shadow-lg transition-all"
            >
              <div
                style={{
                  backgroundColor: "#F4E4CB",
                  color: "#7A5726",
                  borderColor: "#DEBE90",
                }}
                className="flex size-12 items-center justify-center rounded-xl border"
              >
                <Radio className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 style={{ color: "#22130B" }} className="text-sm font-black uppercase tracking-tight">
                  Frictionless RFID Tap-to-Identify
                </h3>
                <p style={{ color: "#543B25" }} className="text-xs sm:text-sm leading-relaxed">
                  9-reader connected edge hardware network (13.56 MHz RC522). Machine operators tap shirts or bundle cards directly at their workstation, eliminating paper traveler sheets, barcode scanners, and manual keyboard entry.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div
              style={{
                backgroundColor: "#FFFDF9",
                borderColor: "#D5B584",
                boxShadow: "0 6px 20px rgba(36,21,13,0.08)",
              }}
              className="rounded-2xl border p-6 space-y-4 hover:shadow-lg transition-all"
            >
              <div
                style={{
                  backgroundColor: "#F4E4CB",
                  color: "#7A5726",
                  borderColor: "#DEBE90",
                }}
                className="flex size-12 items-center justify-center rounded-xl border"
              >
                <Lock className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 style={{ color: "#22130B" }} className="text-sm font-black uppercase tracking-tight">
                  Zero-Knowledge Provenance Ledger
                </h3>
                <p style={{ color: "#543B25" }} className="text-xs sm:text-sm leading-relaxed">
                  Cryptographic SHA-256 tamper-proof ledger audit trail. Internal yields and defect logs remain strictly confidential, while providing shoppers and enterprise buyers with unalterable proof of authentic provenance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. THE TRACEABLE JOURNEY — WARM GOLDEN PARCHMENT CONTAINER */}
      {/* ========================================================= */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-2">
            <span
              style={{
                backgroundColor: "#24150D",
                color: "#FAF4EA",
              }}
              className="inline-block rounded-full px-5 py-1.5 text-xs font-black uppercase tracking-wider shadow-xs"
            >
              The Traceable Journey
            </span>
            <h2 style={{ color: "#22130B" }} className="text-3xl sm:text-4xl font-black">
              From Raw Fabric to Customer Tap
            </h2>
            <p style={{ color: "#5C4129" }} className="text-sm font-medium max-w-xl mx-auto">
              Follow a physical fabric roll through 11 continuous checkpoints. Click any milestone to expand its technical flow.
            </p>
          </div>

          <div
            style={{
              backgroundColor: "#F7ECD9",
              borderColor: "#D5BE98",
              boxShadow: "0 8px 30px rgba(41,27,18,0.08)",
            }}
            className="rounded-3xl border p-5 sm:p-8"
          >
            <div className="relative">
              {/* Central Spine Line */}
              <div
                style={{
                  background: "linear-gradient(180deg, #B88E4B 0%, #7A5726 50%, #B88E4B 100%)",
                }}
                className="absolute left-6 sm:left-1/2 top-4 bottom-4 w-0.5 -translate-x-1/2"
              />

              <div className="space-y-6 sm:space-y-8">
                {JOURNEY_STAGES.map((s) => {
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
                          style={{
                            backgroundColor: isExpanded ? "#FFFDF9" : "#FFF8ED",
                            borderColor: isExpanded ? "#9E733D" : "#D8BA8C",
                            boxShadow: isExpanded ? "0 8px 24px rgba(36,21,13,0.12)" : "0 2px 8px rgba(36,21,13,0.04)",
                          }}
                          className="group cursor-pointer rounded-2xl border p-5 space-y-2 transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span style={{ color: "#7A5726" }} className="text-[11px] font-mono font-black uppercase tracking-wider">
                              {s.station}
                            </span>
                            <span
                              style={{
                                backgroundColor: "#EAD5BA",
                                borderColor: "#D5B584",
                                color: "#452D19",
                              }}
                              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold"
                            >
                              {s.badge}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Icon className="size-4.5 text-[#7A5726]" />
                              <h3 style={{ color: "#22130B" }} className="text-sm sm:text-base font-black group-hover:text-[#8E6930] transition-colors">
                                {s.title}
                              </h3>
                            </div>
                            <ChevronDown
                              className={`size-4 text-[#7A5B3E] transition-transform duration-200 ${
                                isExpanded ? "rotate-180 text-[#8E6930]" : ""
                              }`}
                            />
                          </div>

                          <p style={{ color: "#5C4129" }} className="text-xs font-semibold leading-relaxed">
                            {s.tagline}
                          </p>

                          {/* Expandable Technical Narrative */}
                          <div
                            className={`overflow-hidden transition-all duration-300 text-xs sm:text-sm leading-relaxed ${
                              isExpanded ? "pt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"
                            }`}
                            style={{ color: "#382414" }}
                          >
                            <div style={{ borderTop: "1px solid #E5CCA5" }} className="pt-3 space-y-3">
                              <p>{s.narrative}</p>
                              {s.step === 11 && (
                                <div className="pt-1">
                                  <AppLink
                                    href={paths.publicJourney("shirt-001-demo")}
                                    style={{ color: "#7A5726" }}
                                    className="inline-flex items-center gap-1.5 font-black text-xs hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span>Explore Live Sample Passport</span>
                                    <ExternalLink className="size-3" />
                                  </AppLink>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Standee Solid Mocha/Gold Badge with White Number */}
                      <button
                        type="button"
                        onClick={() => toggleStep(s.step)}
                        style={{
                          backgroundColor: "#5E422C",
                          borderColor: "#D5B584",
                          boxShadow: "0 0 0 4px #F7ECD9",
                        }}
                        className="absolute left-6 sm:left-1/2 -translate-x-1/2 flex size-10 items-center justify-center rounded-full border-2 text-white shadow-md cursor-pointer hover:scale-105 transition-transform"
                      >
                        <span className="font-mono text-sm font-black">{s.step}</span>
                      </button>

                      {/* Opposite side spacer */}
                      <div className="hidden sm:block sm:w-[calc(50%-2.25rem)]" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. COMPLIANCE & IMPACT METRICS                            */}
      {/* ========================================================= */}
      <section
        style={{
          backgroundColor: "#E8D5B9",
          borderTop: "1px solid #D5BE9B",
          borderBottom: "1px solid #D5BE9B",
        }}
        className="py-14 sm:py-20"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-10 text-center">
          <div className="space-y-2">
            <h2 style={{ color: "#22130B" }} className="text-2xl sm:text-3xl font-black">
              Compliance &amp; Impact Metrics
            </h2>
            <p style={{ color: "#5C4129" }} className="text-sm font-medium">
              Measurable operational and regulatory impact on garment manufacturing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div
              style={{
                backgroundColor: "#FFFDF9",
                borderColor: "#D5B584",
                boxShadow: "0 4px 16px rgba(36,21,13,0.06)",
              }}
              className="rounded-2xl border p-6 space-y-2"
            >
              <div style={{ color: "#7A5726" }} className="text-3xl sm:text-4xl font-black tracking-tight">
                [ 100% ]
              </div>
              <h3 style={{ color: "#22130B" }} className="text-sm font-black">
                Traceability Lineage from Yarn to Retail
              </h3>
              <p style={{ color: "#5C4129" }} className="text-xs font-medium">
                Unbroken custody chain linking initial raw fabric batch specs directly to retail garments.
              </p>
            </div>

            <div
              style={{
                backgroundColor: "#FFFDF9",
                borderColor: "#D5B584",
                boxShadow: "0 4px 16px rgba(36,21,13,0.06)",
              }}
              className="rounded-2xl border p-6 space-y-2"
            >
              <div style={{ color: "#7A5726" }} className="text-3xl sm:text-4xl font-black tracking-tight">
                [ 5 – 8 ]%
              </div>
              <h3 style={{ color: "#22130B" }} className="text-sm font-black">
                Fabric Waste Reduction via Smart Allocation
              </h3>
              <p style={{ color: "#5C4129" }} className="text-xs font-medium">
                Real-time AI roll matching optimizes yardage usage and minimizes remnant offcut scrap.
              </p>
            </div>

            <div
              style={{
                backgroundColor: "#FFFDF9",
                borderColor: "#D5B584",
                boxShadow: "0 4px 16px rgba(36,21,13,0.06)",
              }}
              className="rounded-2xl border p-6 space-y-2"
            >
              <div style={{ color: "#7A5726" }} className="text-3xl sm:text-4xl font-black tracking-tight">
                [ EU DPP ]
              </div>
              <h3 style={{ color: "#22130B" }} className="text-sm font-black">
                Digital Product Passport Compliant
              </h3>
              <p style={{ color: "#5C4129" }} className="text-xs font-medium">
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
          <div
            style={{
              backgroundColor: "#22130B",
              borderColor: "#4A3020",
              boxShadow: "0 16px 40px rgba(20,10,5,0.25)",
            }}
            className="rounded-3xl border p-8 sm:p-12 text-center space-y-6"
          >
            <div
              style={{
                backgroundColor: "rgba(212,175,103,0.15)",
                borderColor: "rgba(212,175,103,0.4)",
                color: "#D4AF67",
              }}
              className="mx-auto flex size-12 items-center justify-center rounded-2xl border"
            >
              <CheckCircle2 className="size-6 text-[#D4AF67]" />
            </div>

            <div className="space-y-2 max-w-xl mx-auto">
              <h3 style={{ color: "#D4AF67" }} className="text-xl sm:text-2xl font-black tracking-wider uppercase">
                Blockchain Verified
              </h3>
              <p style={{ color: "#E2CDAF" }} className="text-xs sm:text-sm leading-relaxed">
                Every garment is sealed with an immutable SHA-256 tamperproof hash. Anyone can scan the embedded NFC tag or QR code to verify complete factory authenticity on the public ledger.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <AppLink
                href={paths.publicJourney("shirt-001-demo")}
                style={{
                  background: "linear-gradient(90deg, #D4AF67 0%, #C59B52 50%, #B0853C 100%)",
                  color: "#22130B",
                }}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-black hover:brightness-105 transition-all shadow-md"
              >
                <QrCode className="size-4" />
                <span>Verify Sample Garment</span>
              </AppLink>

              <AppLink
                href={paths.home}
                style={{
                  backgroundColor: "#331E12",
                  borderColor: "#5A3B28",
                  color: "#EAD5BA",
                }}
                className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-xs sm:text-sm font-bold hover:bg-[#452A1A] transition-colors"
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
      <footer
        style={{
          backgroundColor: "#DEBA88",
          borderTop: "1px solid #D5B584",
          color: "#382414",
        }}
        className="py-8 text-center text-xs space-y-2"
      >
        <div className="flex items-center justify-center gap-2">
          <img
            src="/images/tracex-icon.png"
            alt="TraceX Logo"
            className="size-5 object-contain"
          />
          <span style={{ color: "#22130B" }} className="font-black text-sm tracking-tight">
            TraceX
          </span>
        </div>
        <p style={{ color: "#22130B" }} className="font-bold">
          Department of Software Engineering, NED University of Engineering &amp; Technology, Karachi
        </p>
        <p style={{ color: "#4A301C" }} className="text-[11px] font-semibold">
          Supervised by Dr. Kashif Mehboob Khan · Technology Showcase 2026
        </p>
      </footer>
    </div>
  );
}
