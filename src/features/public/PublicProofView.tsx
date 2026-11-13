import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Download, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { PublicProof } from "@/domain/public-types";
import { useWtQuery } from "@/lib/data/hooks";
import { evidenceLabel } from "./evidence";

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ProofBody({ p }: { p: PublicProof }) {
  const json = useMemo(() => JSON.stringify(p.payload, null, 2), [p.payload]);
  const [digest, setDigest] = useState<string | null>(null);
  useEffect(() => {
    void sha256(json).then(setDigest).catch(() => setDigest(null));
  }, [json]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast.success("Sample payload copied.");
    } catch {
      toast.error("Could not copy.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.publicId}-public-payload.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const ev = evidenceLabel[p.evidence];

  return (
    <article className="space-y-5">
      <AppLink href={paths.publicJourney(p.publicId)} className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowLeft className="size-4" aria-hidden /> Back to journey
      </AppLink>
      <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-warning bg-warning-soft px-4 py-3 text-warning">
        <FlaskConical className="size-5 shrink-0" aria-hidden />
        <p className="font-semibold">Demo evidence</p>
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Verification for {p.productName}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ev.label} tone={ev.tone} />
          <span className="wt-id text-muted-foreground">{p.publicId}</span>
        </div>
      </div>
      <section className="space-y-2 rounded-lg border bg-card p-5 text-sm">
        <p>{ev.text}</p>
        <p>A commitment can help check that the published journey record has not changed since it was committed. It verifies <strong>record integrity</strong>, not the garment itself.</p>
        <p className="text-muted-foreground">Physical authenticity cannot be determined from this URL. Anyone can open or copy a product link.</p>
        <p className="text-muted-foreground">This is sample data. There is no live chain or explorer link in this demo.</p>
      </section>
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="wt-eyebrow">Sample commitment reference</dt>
            <dd className="wt-id break-all">{p.sampleCommitmentRef} (sample)</dd>
          </div>
          <div>
            <dt className="wt-eyebrow">SHA-256 of payload (computed in your browser)</dt>
            <dd className="wt-id break-all">{digest ?? "Computing…"}</dd>
          </div>
        </dl>
        <div>
          <p className="wt-eyebrow mb-1">Public payload preview</p>
          <pre className="wt-id max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{json}</pre>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copy()}><Copy /> Copy JSON</Button>
          <Button variant="outline" onClick={download}><Download /> Download JSON</Button>
        </div>
      </section>
    </article>
  );
}

export function PublicProofView({ publicId }: { publicId: string }) {
  const q = useWtQuery(["public-proof", publicId], (c) => c.getPublicProof(publicId));
  return <Loadable query={q} what="product">{(p) => <ProofBody p={p} />}</Loadable>;
}
