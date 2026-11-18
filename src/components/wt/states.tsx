import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Loader2, Lock, SearchX } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { errorCode, errorMessage } from "@/lib/data/hooks";

function StateBox({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode | undefined;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card px-6 py-12 text-center"
    >
      <div className="text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string | undefined }) {
  return <StateBox icon={<Loader2 className="size-5 animate-spin" />} title={label} />;
}

export function EmptyState({
  title = "Nothing here yet",
  children,
}: {
  title?: string | undefined;
  children?: ReactNode | undefined;
}) {
  return (
    <StateBox icon={<Inbox className="size-5" />} title={title}>
      {children}
    </StateBox>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <StateBox icon={<AlertTriangle className="size-5" />} title="Something went wrong">
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </StateBox>
  );
}

export function ForbiddenState({
  message,
  returnHref = paths.home,
}: {
  message?: string | undefined;
  returnHref?: string | undefined;
}) {
  return (
    <StateBox icon={<Lock className="size-5" />} title="Access denied">
      <p>{message ?? "Your role or department does not include this area."}</p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <AppLink href={returnHref}>Return to staff home</AppLink>
      </Button>
    </StateBox>
  );
}

export function NotFoundState({
  what = "record",
  backHref,
  backLabel = "Back",
}: {
  what?: string | undefined;
  backHref?: string | undefined;
  backLabel?: string | undefined;
}) {
  return (
    <StateBox icon={<SearchX className="size-5" />} title={`We couldn't find that ${what}`}>
      <p>It may have been removed, or the link may be mistyped.</p>
      {backHref && (
        <Button asChild variant="outline" size="sm" className="mt-3">
          <AppLink href={backHref}>{backLabel}</AppLink>
        </Button>
      )}
    </StateBox>
  );
}

/** Renders loading / error / forbidden / not-found states around a query result. */
export function Loadable<T>({
  query,
  what,
  backHref,
  children,
}: {
  query: UseQueryResult<T | null>;
  what?: string | undefined;
  backHref?: string | undefined;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    if (errorCode(query.error) === "forbidden")
      return <ForbiddenState message={errorMessage(query.error)} />;
    return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  }
  if (query.data == null) return <NotFoundState what={what} backHref={backHref} />;
  return <>{children(query.data)}</>;
}
