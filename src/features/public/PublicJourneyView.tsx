import { Copy, Info, OctagonAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { TAGLINE } from "@/components/wt/Logo";
import { fmt } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";
import { evidenceLabel } from "./evidence";

export function PublicJourneyView({ publicId }: { publicId: string }) {
  const q = useWtQuery(["public-journey", publicId], (c) => c.getPublicJourney(publicId));
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Product link copied.");
    } catch {
      toast.error("Could not copy the link.");
    }
  };
  return (
    <Loadable query={q} what="product">
      {(j) => (
        <article className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{TAGLINE}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{j.productName}</h1>
            <p className="text-sm text-muted-foreground">{j.productDescription}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusBadge status={j.status} tone={j.notice ? "danger" : j.status.startsWith("Dispatched") ? "success" : j.status.startsWith("Passed") ? "success" : "info"} />
              <span className="wt-id text-muted-foreground">{j.publicId}</span>
            </div>
          </div>

          {j.notice && (
            <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-danger-soft p-4">
              <OctagonAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <div>
                <p className="font-medium text-destructive">{j.notice.title}</p>
                <p className="text-sm">{j.notice.message}</p>
              </div>
            </div>
          )}

          {j.advisory && (
            <div className="flex gap-3 rounded-lg bg-info-soft p-4 text-sm text-accent-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{j.advisory}</p>
            </div>
          )}

          <section aria-labelledby="journey-h" className="rounded-lg border bg-card p-5">
            <h2 id="journey-h" className="mb-4 font-semibold">Journey</h2>
            <ol className="relative space-y-6 border-l-2 border-primary/30 pl-6">
              {j.milestones.map((m) => (
                <li key={m.key} className="relative">
                  <span aria-hidden className="absolute -left-[2.07rem] top-1 size-3.5 rounded-full border-2 border-card bg-primary" />
                  <p className="font-medium">
                    {m.label}
                    {m.lotLevel && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">Lot-level</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmt.date(m.date)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" aria-hidden /> Verification</p>
              <StatusBadge status={evidenceLabel[j.evidence].label} tone={evidenceLabel[j.evidence].tone} />
            </div>
            <p className="text-sm text-muted-foreground">{evidenceLabel[j.evidence].text}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <AppLink href={paths.publicProof(j.publicId)}>View verification</AppLink>
              </Button>
              <Button variant="outline" onClick={() => void copyLink()}>
                <Copy /> Copy product link
              </Button>
            </div>
          </section>
        </article>
      )}
    </Loadable>
  );
}
