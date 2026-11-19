import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode,
  Hash,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Loadable } from "@/components/wt/states";
import { computeSha256, toCanonicalJson } from "@/domain/canonical";
import type { PublicProof } from "@/domain/public-types";
import { useWtQuery } from "@/lib/data/hooks";
import { evidenceLabel } from "./evidence";

function ProofBody({ p }: { p: PublicProof }) {
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

  const ev = evidenceLabel[p.evidence];
  const isHashMatch =
    computedDigest && p.journeyHash && computedDigest.toLowerCase() === p.journeyHash.toLowerCase();

  return (
    <article className="space-y-6">
      {/* Back to Journey Link */}
      <AppLink
        href={paths.publicJourney(p.publicId)}
        className="inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-purple-300 hover:text-white transition-colors uppercase"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Back to garment journey
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
          <ShieldCheck className="size-4 text-purple-400" aria-hidden />
          <h2 className="font-semibold text-white tracking-wide text-sm">
            Record integrity guarantees
          </h2>
        </div>
        <p className="text-purple-200/80">{ev.text}</p>
        <p className="text-purple-200/80">
          A cryptographic commitment guarantees that the published journey record has not been
          altered or tampered with since publication. It proves{" "}
          <strong className="text-white">record immutability</strong>.
        </p>
        <div className="rounded-xl border border-purple-800/30 bg-[#120B1C] p-3.5 text-xs text-purple-300/80 space-y-1">
          <p className="font-medium text-white">Physical tag note:</p>
          <p>
            Cryptographic hashes prove payload integrity, not the physical uniqueness of a cloned QR
            code or copied web URL.
          </p>
        </div>
      </section>

      {/* Fingerprint & Hash Validation */}
      <section className="space-y-4 rounded-2xl border border-purple-500/20 bg-[#1A1225]/90 p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-purple-800/30 pb-3">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2">
            <Hash className="size-4 text-purple-400" aria-hidden /> Hash verification
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
            <FileCode className="size-4 text-purple-400" aria-hidden />
            <h2 className="font-semibold text-white text-sm">Canonical public JSON payload</h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyJson()}
              className="h-7 text-xs rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white"
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
              className="h-7 text-xs rounded-full border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white"
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
  const q = useWtQuery(["public-proof", publicId], (c) => c.getPublicProof(publicId));

  return (
    <Loadable query={q} what="cryptographic proof">
      {(p) => <ProofBody p={p} />}
    </Loadable>
  );
}
