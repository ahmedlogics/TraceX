/** Routing/auth adapter for protected staff routes: session check, route guard and shell. */
import { useEffect, type ReactNode } from "react";
import { LoadingState, ForbiddenState } from "@/components/wt/states";
import { canAccessRoute, type RouteKey } from "@/domain/permissions";
import { useCurrentUser } from "./auth";
import { useAppNavigate, usePathname } from "./navigation";
import { paths } from "./paths";
import { StaffShell } from "./StaffShell";

export function StaffWorkspace({ routeKey, children }: { routeKey: RouteKey | undefined; children: ReactNode }) {
  const me = useCurrentUser();
  const navigate = useAppNavigate();
  const pathname = usePathname();
  const user = me.data;

  useEffect(() => {
    if (!me.isPending && !user) void navigate(`${paths.login}?redirect=${encodeURIComponent(pathname)}`, { replace: true });
  }, [me.isPending, user, navigate, pathname]);

  if (me.isPending || !user) return <div className="p-8"><LoadingState label="Checking staff session…" /></div>;

  const allowed = !routeKey || canAccessRoute(user, routeKey);
  return (
    <StaffShell user={user}>
      {allowed ? children : <ForbiddenState message={`${user.username} (${user.role}) does not have access to this page.`} />}
    </StaffShell>
  );
}
