import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode,
  Hash,
  Loader2,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { computeSha256, toCanonicalJson } from "@/domain/canonical";
import type { PublicProof } from "@/domain/public-types";
import { errorMessage, useWtQuery } from "@/lib/data/hooks";
import { evidenceLabel } from "./evidence";

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
  const canonicalJson = useMemo(() => toCanonicalJson(p.payload), [p.payload]);
  const formattedJson = useMemo(() => JSON.stringify(p.payload, null, 2), [p.payload]);
  const [computedDigest, setComputedDigest] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    void computeSha256(canonicalJson)
      .then(setComputedDigest)
      .catch(() => setComputedDigest(null));
  }, [canonicalJson]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopiedJson(true);
      toast.success("Payload JSON copied to clipboard.");
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      toast.error("Could not copy JSON.");
    }
  };

  const downloadJson = () => {
    const blob = new Blob([formattedJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.publicId}-v${p.version}-public-payload.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded payload JSON.");
  };

  const ev = evidenceLabel[p.evidence] || evidenceLabel["unavailable"];
  const isHashMatch =
    computedDigest && p.journeyHash && computedDigest.toLowerCase() === p.journeyHash.toLowerCase();

  return (
    <article className="space-y-6 motion-safe:animate-fade-in-up motion-reduce:transform-none">
      {/* Back to Journey Link */}
      <AppLink
        href={paths.publicJourney(p.publicId)}
        className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-purple-300 hover:text-white transition-colors uppercase"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to garment journey
      </AppLink>

      {/* Header Card */}
      <div className="rounded-2xl border border-purple-500/20 bg-[#1D1429]/90 p-6 shadow-xl backdrop-blur-md space-y-2">
        <p className="text-[10px] font-mono font-medium tracking-wider uppercase text-purple-400">
          Cryptographic Integrity Proof
        </p>
        <h1 className="font-editorial text-2xl sm:text-3xl font-medium tracking-tight text-white">
          Technical proof · {p.productName}
        </h1>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center rounded-full border border-purple-400/30 bg-purple-950/60 px-2.5 py-0.5 text-xs font-mono text-purple-200">
            {ev.label}
          </span>
          <span className="wt-id rounded-full border border-purple-500/20 bg-[#140D1E] px-2.5 py-0.5 text-xs font-mono text-white font-semibold">
            ID: {p.publicId}
          </span>
          <span className="wt-id rounded-full border border-purple-500/20 bg-[#140D1E] px-2.5 py-0.5 text-xs font-mono text-purple-300/80">
            Payload v{p.version}
          </span>
        </div>
      </div>

      {/* Truthful Evidence Narrative */}
      <section className="rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 text-sm leading-relaxed shadow-xl backdrop-blur-md space-y-3">
        <div className="flex items-center gap-2 border-b border-purple-800/30 pb-3">
          <ShieldCheck className="size-4 text-purple-400" aria-hidden="true" />
          <h2 className="font-semibold text-white tracking-wide text-sm">
            Record integrity guarantees
          </h2>
        </div>
        <p className="text-purple-200/80">{ev.text}</p>
        <p className="text-purple-200/80">
          A cryptographic commitment guarantees that the published journey record has not been
          altered, tampered with, or reordered since publication. It proves{" "}
          <strong className="text-white">record immutability</strong>.
        </p>
        <div className="rounded-xl border border-purple-800/30 bg-[#120B1C] p-3.5 text-xs text-purple-300/80 space-y-1">
          <p className="font-medium text-white">Physical authentication boundary:</p>
          <p>
            Cryptographic hashes prove payload and timeline immutability. They do not by themselves
            prevent the copying or cloning of a physical label without verified RFID/NFC hardware
            interrogation.
          </p>
        </div>
      </section>

      {/* Blockchain Evidence (Rendered only when genuinely present from Member 1's ledger) */}
      {p.blockchain && p.blockchain.transactionHash && (
        <section className="space-y-4 rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-purple-800/30 pb-3">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" /> On-Chain
              Registration Evidence
            </h2>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-mono text-emerald-300 font-semibold">
              Confirmed
            </span>
          </div>

          <dl className="grid gap-3.5 text-xs">
            {p.blockchain.networkName && (
              <div>
                <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
                  Network
                </dt>
                <dd className="rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200">
                  {p.blockchain.networkName}
                </dd>
              </div>
            )}

            {p.blockchain.contractAddress && (
              <div>
                <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
                  Contract Address
                </dt>
                <dd className="break-all rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200">
                  {p.blockchain.contractAddress}
                </dd>
              </div>
            )}

            <div>
              <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
                Transaction Hash
              </dt>
              <dd className="break-all rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200">
                {p.blockchain.transactionHash}
              </dd>
            </div>

            {p.blockchain.blockNumber !== undefined && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
                    Block Number
                  </dt>
                  <dd className="rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200">
                    {p.blockchain.blockNumber}
                  </dd>
                </div>
                {p.blockchain.confirmedAt && (
                  <div>
                    <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
                      Confirmed At
                    </dt>
                    <dd className="rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200">
                      {p.blockchain.confirmedAt}
                    </dd>
                  </div>
                )}
              </div>
            )}
          </dl>
        </section>
      )}

      {/* Fingerprint & Hash Validation */}
      <section className="space-y-4 rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-purple-800/30 pb-3">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2">
            <Hash className="size-4 text-purple-400" aria-hidden="true" /> Hash verification
          </h2>
          {isHashMatch && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="size-3.5" /> Digest Match
            </span>
          )}
        </div>

        <dl className="grid gap-3.5 text-xs">
          <div>
            <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
              Commitment Reference
            </dt>
            <dd className="wt-id break-all rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200">
              {p.sampleCommitmentRef}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
              Published Journey Fingerprint (SHA-256)
            </dt>
            <dd className="wt-id break-all rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200">
              {p.journeyHash}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-mono tracking-wider text-purple-400 uppercase mb-1">
              Client Re-computed SHA-256 (from canonical UTF-8 bytes)
            </dt>
            <dd className="wt-id break-all rounded-lg border border-purple-800/30 bg-[#120B1C] p-2.5 font-mono text-purple-200 flex items-center justify-between gap-2">
              <span>{computedDigest || "Computing SHA-256 in browser runtime…"}</span>
              {isHashMatch && <Check className="size-4 text-emerald-400 shrink-0" />}
            </dd>
          </div>
        </dl>
      </section>

      {/* Canonical JSON Payload View */}
      <section className="space-y-4 rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-800/30 pb-3">
          <div className="flex items-center gap-2">
            <FileCode className="size-4 text-purple-400" aria-hidden="true" />
            <h2 className="font-semibold text-white text-sm">Canonical public JSON payload</h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyJson()}
              className="h-7 text-xs rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white cursor-pointer"
            >
              {copiedJson ? (
                <Check className="size-3 text-emerald-400 mr-1" />
              ) : (
                <Copy className="size-3 mr-1" />
              )}
              {copiedJson ? "Copied" : "Copy JSON"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={downloadJson}
              className="h-7 text-xs rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white cursor-pointer"
            >
              <Download className="size-3 mr-1" />
              Download
            </Button>
          </div>
        </div>

        <p className="text-xs text-purple-300/80 leading-relaxed">
          Generated according to the explicit public allowlist schema ({p.payload.schema}). Internal
          worker IDs, defect logs, and private nonces are excluded.
        </p>

        <div className="relative rounded-xl border border-purple-800/40 bg-[#120B1C] p-3.5 overflow-x-auto max-h-[380px]">
          <pre className="font-mono text-xs text-purple-100/90 leading-relaxed">
            <code>{formattedJson}</code>
          </pre>
        </div>
      </section>
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
        <p className="font-editorial text-lg text-white tracking-wide">
          Verifying cryptographic proof…
        </p>
        <p className="text-xs text-purple-300/70 font-mono">
          Loading payload commitment for {cleanId}
        </p>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/40 bg-[#25121E]/90 p-8 sm:p-12 text-center shadow-xl backdrop-blur-md">
        <AlertCircle className="size-8 text-rose-400" aria-hidden="true" />
        <h2 className="font-editorial text-xl font-medium text-white">
          Unable to Load Technical Proof
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
          <h2 className="font-editorial text-2xl font-normal text-white tracking-tight">
            Cryptographic Proof Not Found
          </h2>
          <p className="text-xs sm:text-sm text-purple-200/80 leading-relaxed">
            No published canonical payload or commitment was found for:
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
