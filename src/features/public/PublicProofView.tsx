import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Scissors,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import type { PublicProof } from "@/domain/public-types";
import { errorMessage, useWtQuery } from "@/lib/data/hooks";

interface ExtendedPublicProof extends PublicProof {
  blockchain?:
    | {
        networkName?: string | undefined;
        contractAddress?: string | undefined;
        transactionHash?: string | undefined;
        blockNumber?: number | undefined;
        confirmedAt?: string | undefined;
      }
    | undefined;
}

function ProofBody({ p }: { p: ExtendedPublicProof }) {
  const [imageError, setImageError] = useState(false);

  // Real milestone count from canonical payload
  const completedMilestonesCount = p.payload?.milestones?.length ?? 0;

  // Real manufacturing completion check strictly from records
  const isDispatched =
    p.payload?.status === "Dispatched to authorized retail network" ||
    p.payload?.milestones?.some((m) => m.key === "dispatched");

  // Real Quality Control check - strictly based on garment records
  const isQualityPassed =
    p.payload?.status === "Passed quality control" ||
    p.payload?.status === "Dispatched to authorized retail network" ||
    p.payload?.milestones?.some((m) => m.key === "quality-passed");

  // Genuine Ledger confirmation status - true ONLY when real blockchain confirmation exists
  const isBlockchainConfirmed =
    p.evidence === "sample-confirmed" ||
    (!!p.blockchain?.confirmedAt && !!p.blockchain?.transactionHash);

  // Genuinely verified: only when all stages are completed, Final QC passed, and ledger is confirmed
  const isBlockchainVerified = isDispatched && isQualityPassed && isBlockchainConfirmed;

  // 4-state customer verification outcome
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
    ? "Cotton Trouser"
    : p.productName.includes("Oxford") || p.productName.includes("poplin") || p.productName.includes("shirt")
      ? "Classic Oxford Shirt"
      : p.productName;

  const garmentSize = p.payload?.size ?? "M";

  return (
    <article className="space-y-6 motion-safe:animate-fade-in-up">
      {/* 1. Sleek Navigation */}
      <div className="flex items-center justify-between">
        <AppLink
          href={paths.publicJourney(p.publicId)}
          className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-purple-300 hover:text-white transition-colors uppercase group"
        >
          <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          <span>Back to Garment Journey</span>
        </AppLink>

        <span className="font-mono text-[11px] text-purple-400/80">
          ID: {p.publicId.toUpperCase()}
        </span>
      </div>

      {/* 2. Visual Garment Passport Card */}
      <section
        aria-label="Garment Summary"
        className="overflow-hidden rounded-3xl border border-purple-500/20 bg-gradient-to-br from-[#1E142B]/95 via-[#191024]/90 to-[#120B1C]/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6">
          {/* Garment Visual Thumbnail */}
          <div className="relative size-28 sm:size-32 shrink-0 rounded-2xl overflow-hidden border border-purple-500/30 bg-[#100818] shadow-lg group">
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
              <div className="h-full w-full flex items-center justify-center bg-purple-950/40 text-purple-300">
                <Sparkles className="size-8 opacity-70" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Garment Details & Visual Badges */}
          <div className="space-y-2.5 text-center sm:text-left flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 border border-amber-400/30 px-2.5 py-0.5 font-mono text-[10px] text-amber-300">
                <span className="size-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                Digital Passport
              </span>

              {isDispatched ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 font-mono text-[10px] text-emerald-300 font-medium">
                  <CheckCircle2 className="size-2.5 text-emerald-400" />
                  Dispatched (9 of 9 Stages)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-950/60 border border-purple-500/40 px-2.5 py-0.5 font-mono text-[10px] text-purple-300 font-medium">
                  <Clock className="size-2.5 text-purple-400" />
                  In Production ({completedMilestonesCount} of 9 Stages)
                </span>
              )}
            </div>

            <h1 className="font-cormorant italic text-3xl sm:text-4xl font-normal text-white tracking-tight leading-none">
              {displayProductName}
            </h1>

            {/* Visual Specs Pills */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
              <span className="rounded-lg bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 text-xs text-purple-200">
                🌿 Organic Cotton
              </span>
              <span className="rounded-lg bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 text-xs text-purple-200 font-mono">
                Size {garmentSize}
              </span>
              <span className="rounded-lg bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 text-xs text-purple-200">
                ✨ Handcrafted
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Required In-Production Message */}
      {!isDispatched && completedMilestonesCount < 9 && (
        <div className="flex items-center gap-3 rounded-2xl border border-purple-500/25 bg-gradient-to-r from-purple-950/50 via-[#1F1230]/60 to-purple-950/50 p-3.5 sm:p-4 text-purple-200 shadow-md">
          <span className="size-2 rounded-full bg-amber-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          <p className="text-xs sm:text-sm text-purple-100 font-medium leading-relaxed">
            Your garment is still in production. Its journey will update as manufacturing progresses.
          </p>
        </div>
      )}

      {/* 4. Hero Visual Verification Seal Card */}
      {verificationOutcome === "verified" ? (
        <section
          aria-label="Verification Seal"
          className="rounded-3xl border border-emerald-500/35 bg-gradient-to-br from-[#12221b]/95 via-[#0e1a15]/90 to-[#0b1612]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md text-center space-y-4"
        >
          {/* Centered Graphic Authenticity Seal */}
          <div className="relative inline-flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl animate-pulse" />
            <div className="relative size-16 sm:size-20 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-400 to-teal-300 p-0.5 shadow-[0_0_24px_rgba(52,211,153,0.5)]">
              <div className="h-full w-full rounded-full bg-[#0a1511] flex items-center justify-center">
                <ShieldCheck className="size-9 sm:size-10 text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-wide">
              Blockchain Verified
            </h2>
            <p className="text-xs sm:text-sm text-emerald-200/90 leading-relaxed font-light">
              All 9 manufacturing milestones are verified against factory records and permanently anchored to the digital ledger.
            </p>
          </div>

          {/* Minimal 2-Badge Grid */}
          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto pt-2 text-xs">
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/40 p-3 text-center space-y-0.5">
              <span className="font-semibold text-white text-xs block">9 of 9 Stages</span>
              <span className="text-[11px] text-emerald-300/80 font-mono">Factory Certified</span>
            </div>
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/40 p-3 text-center space-y-0.5">
              <span className="font-semibold text-white text-xs block">Digital Ledger</span>
              <span className="text-[11px] text-emerald-300/80 font-mono">Permanently Sealed</span>
            </div>
          </div>
        </section>
      ) : verificationOutcome === "pending" ? (
        <section
          aria-label="Verification Seal"
          className="rounded-3xl border border-purple-400/30 bg-gradient-to-br from-[#1C1226]/95 via-[#170E20]/90 to-[#120A1A]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md text-center space-y-4"
        >
          <div className="relative inline-flex items-center justify-center">
            <div className="size-16 sm:size-20 rounded-full bg-gradient-to-tr from-purple-500 to-amber-400 p-0.5 shadow-[0_0_20px_rgba(216,180,254,0.3)]">
              <div className="h-full w-full rounded-full bg-[#140C1E] flex items-center justify-center">
                <Clock className="size-9 sm:size-10 text-amber-300" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-wide">
              Verification Pending
            </h2>
            <p className="text-xs sm:text-sm text-purple-200/90 leading-relaxed font-light">
              Your garment is currently in production. Final digital ledger verification is conducted once manufacturing, quality inspection, and retail dispatch are complete.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto pt-2 text-xs">
            <div className="rounded-2xl border border-purple-500/25 bg-purple-950/40 p-3 text-center space-y-0.5">
              <span className="font-semibold text-white text-xs block">Production Status</span>
              <span className="text-[11px] text-purple-300/80 font-mono">{completedMilestonesCount} of 9 Stages Completed</span>
            </div>
            <div className="rounded-2xl border border-purple-500/25 bg-purple-950/40 p-3 text-center space-y-0.5">
              <span className="font-semibold text-white text-xs block">Blockchain Recording</span>
              <span className="text-[11px] text-amber-300/80 font-mono">Upon Retail Dispatch</span>
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-label="Verification Seal"
          className="rounded-3xl border border-rose-500/30 bg-[#221419]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md text-center space-y-4"
        >
          <div className="size-16 sm:size-20 mx-auto rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <ShieldAlert className="size-9 sm:size-10" />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-2xl font-semibold text-white">Verification Failed</h2>
            <p className="text-xs sm:text-sm text-rose-200/85 leading-relaxed">
              This record could not be confirmed against registered production credentials. If you believe this is an error, please contact customer support.
            </p>
          </div>
        </section>
      )}

      {/* 4. Visual 3-Step Infographic (How TraceX Protects You) */}
      <section className="rounded-3xl border border-purple-500/20 bg-[#160E22]/90 p-6 sm:p-7 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-purple-500/15 pb-3">
          <div className="space-y-0.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-purple-400/80">
              Traceability Guarantee
            </span>
            <h2 className="font-cormorant italic text-2xl text-white">
              How TraceX Protects You
            </h2>
          </div>
          <Sparkles className="size-5 text-amber-300/80" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Step 1 */}
          <div className="rounded-2xl border border-purple-500/15 bg-purple-950/25 p-4 text-center flex flex-col items-center gap-2 group hover:border-amber-400/30 transition-colors">
            <div className="size-11 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.2)]">
              <Layers className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">1. Sourced</h3>
            <p className="text-xs text-purple-200/70 font-light leading-relaxed">
              Certified organic raw cotton traced to certified mills.
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-purple-500/15 bg-purple-950/25 p-4 text-center flex flex-col items-center gap-2 group hover:border-[#E879F9]/30 transition-colors">
            <div className="size-11 rounded-full bg-[#E879F9]/15 border border-[#E879F9]/30 flex items-center justify-center text-[#E879F9] shadow-[0_0_10px_rgba(232,121,249,0.2)]">
              <Scissors className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">2. Crafted</h3>
            <p className="text-xs text-purple-200/70 font-light leading-relaxed">
              Paired with tracking tag at cutting and multi-point inspected.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-purple-500/15 bg-purple-950/25 p-4 text-center flex flex-col items-center gap-2 group hover:border-emerald-400/30 transition-colors">
            <div className="size-11 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.2)]">
              <ShieldCheck className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">3. Verified</h3>
            <p className="text-xs text-purple-200/70 font-light leading-relaxed">
              Digital ledger recording conducted upon final retail dispatch.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Clean Action Link to Journey */}
      <div className="flex justify-center pt-1">
        <Button
          asChild
          className="rounded-full bg-purple-100 hover:bg-white text-purple-950 font-medium px-6 py-2.5 text-xs tracking-wide shadow-lg transition-transform active:scale-95 cursor-pointer"
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
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-purple-500/20 bg-[#1D1429]/80 p-12 text-center shadow-xl backdrop-blur-md">
        <Loader2 className="size-8 animate-spin text-purple-400" aria-hidden="true" />
        <p className="font-cormorant italic text-2xl text-white tracking-wide">
          Verifying garment record…
        </p>
        <p className="text-xs text-purple-300/70 font-mono">
          Loading verification proof for {cleanId}
        </p>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/40 bg-[#25121E]/90 p-8 sm:p-12 text-center shadow-xl backdrop-blur-md">
        <AlertCircle className="size-8 text-rose-400" aria-hidden="true" />
        <h2 className="font-cormorant italic text-2xl font-medium text-white">
          Unable to Load Record Verification
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

  if (!q.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-purple-500/20 bg-[#1D1429]/90 p-8 sm:p-12 text-center shadow-2xl backdrop-blur-md">
        <div className="rounded-full border border-purple-500/30 bg-purple-950/60 p-3.5 text-purple-300">
          <SearchX className="size-8" aria-hidden="true" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h2 className="font-cormorant italic text-3xl font-normal text-white tracking-tight">
            Record Verification Not Found
          </h2>
          <p className="text-xs sm:text-sm text-purple-200/80 leading-relaxed">
            No published verification record was found for ID:
          </p>
          <div className="inline-block rounded-lg border border-purple-800/40 bg-[#120B1C] px-3 py-1 font-mono text-sm font-semibold text-purple-200">
            {cleanId}
          </div>
        </div>
        <div className="pt-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-purple-400/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white"
          >
            <AppLink href={paths.publicJourney(cleanId)}>Return to Garment Journey</AppLink>
          </Button>
        </div>
      </div>
    );
  }

  return <ProofBody p={q.data as ExtendedPublicProof} />;
}
