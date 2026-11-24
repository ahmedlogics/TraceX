import { paths } from "@/app/paths";
import { IdLink } from "@/components/wt/layout";
import { canAccessRoute, type RouteKey } from "@/domain/permissions";
import type { StaffUser, Task } from "@/domain/types";

const map: Record<Task["subjectType"], { key: RouteKey; href: (id: string) => string }> = {
  lot: { key: "materialLot", href: paths.lot },
  order: { key: "productionOrder", href: paths.order },
  garment: { key: "garment", href: paths.garment },
  shipment: { key: "shipment", href: paths.shipment },
  inspection: { key: "inspection", href: paths.inspection },
  rework: { key: "reworkCase", href: paths.reworkCase },
};

/** Link to a record if the user's role can open it; plain ID otherwise. */
export function SubjectLink({
  user,
  type,
  id,
  label,
}: {
  user: StaffUser;
  type: Task["subjectType"];
  id: string;
  label?: string | null | undefined;
}) {
  const m = map[type];
  const display = label || id;
  return canAccessRoute(user, m.key) ? (
    <IdLink href={m.href(id)} id={id} label={display} />
  ) : (
    <span className="wt-id">{display}</span>
  );
}

export function LinkIf({
  user,
  routeKey,
  href,
  id,
}: {
  user: StaffUser;
  routeKey: RouteKey;
  href: string;
  id: string;
}) {
  return canAccessRoute(user, routeKey) ? (
    <IdLink href={href} id={id} />
  ) : (
    <span className="wt-id">{id}</span>
  );
}

export const subjectHref = (t: Pick<Task, "subjectType" | "subjectId">) =>
  map[t.subjectType].href(t.subjectId);
