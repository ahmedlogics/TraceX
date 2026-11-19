import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode,
  FlaskConical,
  Hash,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/wt/StatusBadge";
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
      <AppLink
        href={paths.publicJourney(p.publicId)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to product journey
      </AppLink>

      {/* Prototype / Demo Evidence Notice */}
      <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-warning">
        <FlaskConical className="size-5 shrink-0" aria-hidden />
        <div className="text-xs space-y-0.5">
          <p className="font-semibold text-foreground">Cryptographic Record Verification</p>
          <p className="text-muted-foreground">
            Prototype demonstration: Ledger commitments verify data integrity without requiring Web3
            wallets or browser blockchain queries.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Technical proof · {p.productName}
        </h1>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusBadge status={ev.label} tone={ev.tone} />
          <span className="wt-id rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground font-semibold">
            {p.publicId}
          </span>
          <span className="wt-id rounded border px-2 py-0.5 text-xs text-muted-foreground">
            Payload v{p.version}
          </span>
        </div>
      </div>

      {/* Truthful Evidence Narrative */}
      <section className="space-y-3 rounded-xl border bg-card p-5 text-sm leading-relaxed shadow-sm">
        <div className="flex items-center gap-2 border-b pb-3">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          <h2 className="font-semibold text-foreground">Record integrity guarantees</h2>
        </div>
        <p className="text-muted-foreground">{ev.text}</p>
        <p className="text-muted-foreground">
          A cryptographic commitment guarantees that the published journey record has not been
          altered or tampered with since publication. It proves <strong>record immutability</strong>
          .
        </p>
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Physical tag note:</p>
          <p>
            Cryptographic hashes prove payload integrity, not the physical uniqueness of a cloned QR
            code or copied web URL.
          </p>
        </div>
      </section>

      {/* Fingerprint & Hash Validation */}
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <Hash className="size-4 text-primary" aria-hidden /> Hash verification
          </h2>
          {isHashMatch && (
            <span className="inline-flex items-center gap-1 rounded bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
              <CheckCircle2 className="size-3.5" /> Digest Match
            </span>
          )}
        </div>

        <dl className="grid gap-4 text-xs">
          <div>
            <dt className="wt-eyebrow mb-1">Commitment Reference</dt>
            <dd className="wt-id break-all rounded bg-muted p-2 font-mono text-foreground">
              {p.sampleCommitmentRef}
            </dd>
          </div>

          <div>
            <dt className="wt-eyebrow mb-1">Published Journey Fingerprint (SHA-256)</dt>
            <dd className="wt-id break-all rounded bg-muted p-2 font-mono text-foreground">
              {p.journeyHash}
            </dd>
          </div>

          <div>
            <dt className="wt-eyebrow mb-1">
              Client Re-computed SHA-256 (from canonical UTF-8 bytes)
            </dt>
            <dd className="wt-id break-all rounded bg-muted p-2 font-mono text-foreground">
              {computedDigest ?? "Computing in browser…"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Raw Payload Preview */}
      <section className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <FileCode className="size-4 text-primary" aria-hidden />
            <h2 className="font-semibold text-sm text-foreground">Canonical JSON payload</h2>
          </div>
          <span className="wt-id text-xs text-muted-foreground">
            {p.canonicalBytesLength} bytes UTF-8
          </span>
        </div>

        <pre className="wt-id max-h-80 overflow-auto rounded-lg bg-muted p-3.5 text-xs leading-relaxed text-foreground select-all border">
          {formattedJson}
        </pre>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => void copyJson()} className="gap-1.5">
            {copiedJson ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copiedJson ? "JSON Copied" : "Copy JSON"}
          </Button>

          <Button variant="outline" size="sm" onClick={downloadJson} className="gap-1.5">
            <Download className="size-3.5" /> Download JSON
          </Button>
        </div>
      </section>
    </article>
  );
}

export function PublicProofView({ publicId }: { publicId: string }) {
  const q = useWtQuery(["public-proof", publicId], (c) => c.getPublicProof(publicId));
  return (
    <Loadable query={q} what="product proof">
      {(p) => <ProofBody p={p} />}
    </Loadable>
  );
}
