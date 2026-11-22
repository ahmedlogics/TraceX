import { Fragment, type ReactNode } from "react";
import { AppLink } from "@/app/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string | undefined;
}

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode | undefined;
  crumbs?: Crumb[] | undefined;
  actions?: ReactNode | undefined;
  meta?: ReactNode | undefined;
}) {
  return (
    <header className="mb-6 space-y-3">
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {c.href ? (
                    <BreadcrumbLink asChild>
                      <AppLink href={c.href}>{c.label}</AppLink>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {meta && <div className="flex flex-wrap gap-2 pt-1">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="wt-eyebrow">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MetricGrid({
  metrics,
}: {
  metrics: { label: string; value: ReactNode; hint?: string | undefined }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-lg border bg-card p-4">
          <p className="wt-eyebrow">{m.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
          {m.hint && <p className="text-xs text-muted-foreground">{m.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function IdLink({ href, id, label }: { href: string; id: string; label?: ReactNode }) {
  return (
    <AppLink href={href} className="wt-id text-primary underline-offset-2 hover:underline">
      {label ?? id}
    </AppLink>
  );
}

export function Timeline({
  items,
}: {
  items: {
    key: string;
    title: ReactNode;
    meta?: ReactNode | undefined;
    body?: ReactNode | undefined;
    tone?: "default" | "danger" | "success" | undefined;
  }[];
}) {
  return (
    <ol className="relative space-y-5 border-l pl-6">
      {items.map((i) => (
        <li key={i.key} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[1.92rem] top-1 size-3 rounded-full border-2 border-card ring-1 ring-border",
              i.tone === "danger"
                ? "bg-destructive"
                : i.tone === "success"
                  ? "bg-success"
                  : "bg-primary",
            )}
          />
          <p className="text-sm font-medium">{i.title}</p>
          {i.meta && <p className="text-xs text-muted-foreground">{i.meta}</p>}
          {i.body && <div className="mt-1 text-sm text-muted-foreground">{i.body}</div>}
        </li>
      ))}
    </ol>
  );
}

export const fmt = {
  dateTime: (iso?: string) =>
    iso
      ? new Date(iso).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—",
  date: (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—",
};
