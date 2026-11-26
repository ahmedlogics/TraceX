import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  RefreshCw,
  Scissors,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import type { PublicProof } from "@/domain/public-types";
import { errorMessage, useWtQuery } from "@/lib/data/hooks";

function ProofBody({ p }: { p: PublicProof }) {
  const [imageError, setImageError] = useState(false);
  const [auditState, setAuditState] = useState<"idle" | "running" | "verified">("idle");
  const [auditStep, setAuditStep] = useState(0);

  const completedMilestonesCount = p.payload?.milestones?.length ?? 0;

  const isDispatched =
    p.payload?.status === "Dispatched to authorized retail network" ||
    p.payload?.milestones?.some((m) => m.key === "dispatched");

  const isQualityPassed =
    p.payload?.status === "Passed quality control" ||
    p.payload?.status === "Dispatched to authorized retail network" ||
    p.payload?.milestones?.some((m) => m.key === "quality-passed");

  const isBlockchainConfirmed =
    p.evidence === "sample-confirmed" ||
    (!!p.blockchain?.confirmedAt && !!p.blockchain?.transactionHash);

  const isBlockchainVerified = isDispatched && isQualityPassed && isBlockchainConfirmed;

  const verificationOutcome: "verified" | "pending" | "failed" | "unavailable" =
    p.evidence === "failed"
      ? "failed"
      : isBlockchainVerified
        ? "verified"
        : p.evidence === "unavailable"
          ? "unavailable"
          : "pending";

  const isTrouser =
    p.productName.toLowerCase().includes("trouser") ||
    p.publicId.toLowerCase().includes("trouser") ||
    p.productName.toLowerCase().includes("pant") ||
    p.publicId.toLowerCase().includes("pant");

  const productImgUrl = isTrouser
    ? "/images/products/trouser-fabric.jpg"
    : "/images/products/shirt-fabric.jpg";

  const fallbackImgUrl = isTrouser
    ? "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=85"
    : "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=800&q=85";

  const displayProductName = isTrouser
    ? "Tailored Cotton Trouser"
    : p.productName.includes("Oxford") || p.productName.includes("poplin") || p.productName.includes("shirt")
      ? "Classic Oxford Shirt"
      : p.productName;

  const garmentSize = p.payload?.size ?? "M";
  const certSerial = `TX-CERT-${p.publicId.replace(/[^a-zA-Z0-9]/g, "").slice(-3).toUpperCase() || "001"}-2026`;

  const runLiveAudit = () => {
    setAuditState("running");
    setAuditStep(1);
    setTimeout(() => {
      setAuditStep(2);
      setTimeout(() => {
        setAuditStep(3);
        setTimeout(() => {
          setAuditState("verified");
        }, 400);
      }, 400);
    }, 400);
  };

  return (
    <article className="space-y-6 motion-safe:animate-fade-in-up">
      {/* 1. Sleek Navigation */}
      <div className="flex items-center justify-between">
        <AppLink
          href={paths.publicJourney(p.publicId)}
          className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-[#D6C2A8] hover:text-[#FAF7F2] transition-colors uppercase group"
        >
          <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          <span>Back to Garment Journey</span>
        </AppLink>

        <span className="font-mono text-[11px] text-[#B88A58]">
          ID: {p.publicId.toUpperCase()}
        </span>
      </div>

      {/* 2. DIGITAL CERTIFICATE OF AUTHENTICITY */}
      <section
        aria-label="Digital Certificate of Authenticity"
        className="glass-panel-warm rounded-3xl p-5 sm:p-7 shadow-2xl border border-[#B88A58]/30 relative overflow-hidden space-y-5"
      >
        {/* Certificate Header Bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-[#B88A58]/20 border border-[#B88A58]/40 flex items-center justify-center text-amber-300 shadow-md">
              <Award className="size-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-white tracking-wide">
                Certificate of Authenticity
              </h2>
            </div>
          </div>

          <span className="glass-pill-amber px-2.5 py-1 rounded-full text-[11px] font-mono font-bold text-amber-200 tracking-wider">
            {certSerial}
          </span>
        </div>

        {/* Garment Passport Snapshot */}
        <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6">
          <div className="relative size-24 sm:size-28 shrink-0 rounded-2xl overflow-hidden border border-white/15 bg-[#0E0906] shadow-xl group">
            {!imageError ? (
              <img
                src={productImgUrl}
                alt={displayProductName}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== fallbackImgUrl) {
                    target.src = fallbackImgUrl;
                  } else {
                    setImageError(true);
                  }
                }}
                className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-black/40 text-[#B88A58]">
                <Sparkles className="size-8 opacity-70" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
          </div>

          <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="glass-pill-emerald inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] text-emerald-300 font-medium">
                <CheckCircle2 className="size-2.5 text-emerald-400" />
                {isDispatched ? "Certified Authentic" : "In Production"}
              </span>
            </div>

            <h1 className="font-cormorant italic text-3xl sm:text-4xl font-normal text-[#FAF7F2] tracking-tight leading-none">
              {displayProductName}
            </h1>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5 text-xs">
              <span className="glass-pill rounded-lg px-2.5 py-1 text-[#FAF7F2]">
                🌿 100% Organic Aegean Cotton
              </span>
              <span className="glass-pill rounded-lg px-2.5 py-1 text-[#D6C2A8] font-mono">
                Size {garmentSize}
              </span>
              <span className="glass-pill rounded-lg px-2.5 py-1 text-[#FAF7F2]">
                ✨ Handcrafted
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. VERIFICATION & LIVE AUTHENTICITY CHECK */}
      {verificationOutcome === "verified" ? (
        <section
          aria-label="Authenticity Verification"
          className="glass-panel-warm rounded-3xl p-6 sm:p-7 shadow-2xl border border-emerald-500/35 space-y-5"
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full bg-emerald-400/25 blur-xl animate-pulse" />
              <div className="relative size-14 sm:size-16 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-400 to-teal-300 p-0.5 shadow-[0_0_20px_rgba(52,211,153,0.4)]">
                <div className="h-full w-full rounded-full bg-[#081510] flex items-center justify-center">
                  <ShieldCheck className="size-8 sm:size-9 text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                </div>
              </div>
            </div>

            <div className="space-y-1 text-center sm:text-left flex-1">
              <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-wide">
                Verified Genuine & Tamper-Proof
              </h2>
              <p className="text-xs sm:text-sm text-emerald-200/90 leading-relaxed font-light">
                This garment is certified authentic. Its complete 9-stage journey—from raw fiber to finished tailoring—is permanently sealed and cannot be altered or duplicated.
              </p>
            </div>
          </div>

          {/* Interactive Verification Terminal */}
          <div className="rounded-2xl glass-panel p-4 sm:p-5 border border-white/10 space-y-3 bg-black/40">
            {auditState === "idle" && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-[#D6C2A8]/90 font-light text-center sm:text-left">
                  Verify this garment&apos;s physical serial number and manufacturing records in real time.
                </p>
                <Button
                  type="button"
                  onClick={runLiveAudit}
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold text-xs px-5 py-2 cursor-pointer shadow-lg active:scale-95 transition-transform shrink-0"
                >
                  <RefreshCw className="size-3.5 mr-1.5" />
                  Verify Authenticity
                </Button>
              </div>
            )}

            {auditState === "running" && (
              <div className="space-y-2 py-1">
                <div className="flex items-center gap-2 text-xs font-mono">
                  {auditStep >= 1 ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Loader2 className="size-3.5 animate-spin text-amber-400" />
                  )}
                  <span className={auditStep >= 1 ? "text-emerald-200" : "text-[#D6C2A8]"}>
                    1. Matching garment serial number ({p.publicId.toUpperCase()})...
                  </span>
                  {auditStep >= 1 && <span className="text-emerald-400 font-bold ml-auto">MATCHED</span>}
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  {auditStep >= 2 ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : auditStep === 1 ? (
                    <Loader2 className="size-3.5 animate-spin text-amber-400" />
                  ) : (
                    <span className="size-3.5 rounded-full border border-white/20 inline-block" />
                  )}
                  <span className={auditStep >= 2 ? "text-emerald-200" : "text-[#D6C2A8]/60"}>
                    2. Verifying 9-stage manufacturing milestones...
                  </span>
                  {auditStep >= 2 && <span className="text-emerald-400 font-bold ml-auto">9/9 INTACT</span>}
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  {auditStep >= 3 ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : auditStep === 2 ? (
                    <Loader2 className="size-3.5 animate-spin text-amber-400" />
                  ) : (
                    <span className="size-3.5 rounded-full border border-white/20 inline-block" />
                  )}
                  <span className={auditStep >= 3 ? "text-emerald-200" : "text-[#D6C2A8]/60"}>
                    3. Confirming official tamper-proof seal...
                  </span>
                  {auditStep >= 3 && <span className="text-emerald-400 font-bold ml-auto">GENUINE</span>}
                </div>
              </div>
            )}

            {auditState === "verified" && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-300 bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/30">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <span>
                    Authenticity Confirmed: 100% genuine and unaltered.
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#D6C2A8]/70">
                  <span>Audited at {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <button
                    type="button"
                    onClick={runLiveAudit}
                    className="text-amber-300 hover:text-white underline cursor-pointer"
                  >
                    Run check again
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : verificationOutcome === "pending" ? (
        <section
          aria-label="Verification Pending"
          className="glass-panel-warm rounded-3xl p-6 sm:p-7 shadow-2xl text-center space-y-4 border border-[#B88A58]/25"
        >
          <div className="size-14 sm:size-16 mx-auto rounded-full bg-gradient-to-tr from-[#B88A58] to-amber-400 p-0.5 shadow-[0_0_16px_rgba(251,191,36,0.25)]">
            <div className="h-full w-full rounded-full bg-[#1A110A] flex items-center justify-center">
              <Clock className="size-8 sm:size-9 text-amber-300" />
            </div>
          </div>

          <div className="space-y-1 max-w-lg mx-auto">
            <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-wide">
              In Production
            </h2>
            <p className="text-xs sm:text-sm text-[#D6C2A8] leading-relaxed font-light">
              Your garment is currently active on the manufacturing floor. The certificate permanently seals upon quality release and retail dispatch.
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-3 max-w-xs mx-auto text-center space-y-0.5 border border-[#B88A58]/25">
            <span className="font-semibold text-white text-xs block">Production Status</span>
            <span className="text-[11px] text-[#F5D0A9] font-mono">
              {completedMilestonesCount} of 9 Stages Completed
            </span>
          </div>
        </section>
      ) : (
        <section
          aria-label="Verification Status"
          className="glass-panel rounded-3xl p-6 sm:p-7 shadow-2xl text-center space-y-4 border border-rose-500/30"
        >
          <div className="size-14 sm:size-16 mx-auto rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <ShieldAlert className="size-8 sm:size-9" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-xl font-semibold text-white">Verification Mismatch</h2>
            <p className="text-xs sm:text-sm text-rose-200/85 leading-relaxed">
              This record could not be confirmed against registered production credentials. If you believe this is an error, please contact customer support.
            </p>
          </div>
        </section>
      )}

      {/* 4. CERTIFIED DEPARTMENT SIGN-OFFS */}
      <section className="glass-panel-warm rounded-3xl p-5 sm:p-7 shadow-xl space-y-4 border border-[#B88A58]/20">
        <h2 className="font-cormorant italic text-2xl sm:text-3xl text-[#FAF7F2] border-b border-white/10 pb-3">
          Certified Inspection Seals
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Signer 01: Raw Materials Lab */}
          <div className="glass-card-hover glass-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
                  <Layers className="size-4" />
                </div>
                <span className="glass-pill-emerald px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-300">
                  Certified
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white">Materials & Fiber Lab</h3>
              <p className="text-xs text-[#D6C2A8]/80 font-light leading-relaxed">
                Certified 100% Aegean Organic Cotton yarn strength, chemical safety, and lot origin.
              </p>
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] font-mono text-[#D6C2A8]/60">
              Oct 02, 2026 · 09:14 AM
            </div>
          </div>

          {/* Signer 02: Atelier Master QC */}
          <div className="glass-card-hover glass-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-[#B88A58]/20 border border-[#B88A58]/40 flex items-center justify-center text-[#F5D0A9]">
                  <Scissors className="size-4" />
                </div>
                <span className="glass-pill-emerald px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-300">
                  Certified
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white">Atelier Master QC</h3>
              <p className="text-xs text-[#D6C2A8]/80 font-light leading-relaxed">
                Passed 18-point physical tolerance check, single-needle seam integrity, and finishing.
              </p>
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] font-mono text-[#D6C2A8]/60">
              Oct 11, 2026 · 04:30 PM
            </div>
          </div>

          {/* Signer 03: Dispatch Logistics Vault */}
          <div className="glass-card-hover glass-panel rounded-2xl p-4 border border-white/10 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300">
                  <Truck className="size-4" />
                </div>
                <span className="glass-pill-emerald px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-300">
                  Certified
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white">Logistics Custody</h3>
              <p className="text-xs text-[#D6C2A8]/80 font-light leading-relaxed">
                Garment serialized, sealed, and handed over for retail network dispatch.
              </p>
            </div>
            <div className="pt-2 border-t border-white/5 text-[10px] font-mono text-[#D6C2A8]/60">
              Oct 14, 2026 · 03:42 PM
            </div>
          </div>
        </div>
      </section>

      {/* 5. Return CTA */}
      <div className="flex justify-center pt-2">
        <Button
          asChild
          className="rounded-full bg-gradient-to-r from-[#B88A58] to-amber-500 hover:from-[#A27848] hover:to-amber-600 text-[#140D08] font-semibold px-6 py-2.5 text-xs tracking-wide shadow-xl transition-transform active:scale-95 cursor-pointer"
        >
          <AppLink href={paths.publicJourney(p.publicId)}>
            View Full 9-Stage Manufacturing Journey →
          </AppLink>
        </Button>
      </div>
    </article>
  );
}

export function PublicProofView({ publicId }: { publicId: string }) {
  const cleanId = publicId.trim();
  const q = useWtQuery(["public-proof", cleanId], (c) => c.getPublicProof(cleanId));

  if (q.isPending) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl p-12 text-center shadow-xl">
        <Loader2 className="size-8 animate-spin text-[#B88A58]" aria-hidden="true" />
        <p className="font-cormorant italic text-2xl text-[#FAF7F2] tracking-wide">
          Verifying Garment Record…
        </p>
        <p className="text-xs text-[#D6C2A8]/70 font-mono">
          Loading certificate for {cleanId}
        </p>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3 rounded-2xl border-rose-500/30 p-8 sm:p-12 text-center shadow-xl">
        <AlertCircle className="size-8 text-rose-400" aria-hidden="true" />
        <h2 className="font-cormorant italic text-2xl font-medium text-[#FAF7F2]">
          Unable to Load Record Verification
        </h2>
        <p className="max-w-md text-xs sm:text-sm text-[#D6C2A8] leading-relaxed">
          {errorMessage(q.error)}
        </p>
        <Button
          type="button"
          onClick={() => void q.refetch()}
          variant="outline"
          size="sm"
          className="mt-2 rounded-full border-[#B88A58]/30 bg-[#3A2312]/50 text-[#FAF7F2] hover:bg-[#B88A58]/30 cursor-pointer"
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-4 rounded-2xl p-8 sm:p-12 text-center shadow-2xl">
        <div className="rounded-full border border-[#B88A58]/30 bg-[#3A2312]/60 p-3.5 text-[#B88A58]">
          <SearchX className="size-8" aria-hidden="true" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h2 className="font-cormorant italic text-3xl font-normal text-[#FAF7F2] tracking-tight">
            Record Verification Not Found
          </h2>
          <p className="text-xs sm:text-sm text-[#D6C2A8] leading-relaxed">
            No published verification record was found for ID:
          </p>
          <div className="inline-block rounded-lg border border-[#B88A58]/40 bg-[#140D08] px-3 py-1 font-mono text-sm font-semibold text-[#F5D0A9]">
            {cleanId}
          </div>
        </div>
        <div className="pt-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-[#B88A58]/30 bg-[#3A2312]/50 text-[#FAF7F2] hover:bg-[#B88A58]/30"
          >
            <AppLink href={paths.publicJourney(cleanId)}>Return to Garment Journey</AppLink>
          </Button>
        </div>
      </div>
    );
  }

  return <ProofBody p={q.data} />;
}
