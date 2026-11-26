/** Routing/auth adapter for protected staff routes: session check, route guard and shell. */
import { useEffect, type ReactNode } from "react";
import { LoadingState, ForbiddenState } from "@/components/wt/states";
import { canAccessRoute, type RouteKey } from "@/domain/permissions";
import { useCurrentUser } from "./auth";
import { useAppNavigate, usePathname } from "./navigation";
import { paths } from "./paths";
import { StaffShell } from "./StaffShell";

export function StaffWorkspace({
  routeKey,
  children,
}: {
  routeKey: RouteKey | undefined;
  children: ReactNode;
}) {
  const me = useCurrentUser();
  const navigate = useAppNavigate();
  const pathname = usePathname();
  const user = me.data;

  const isFinalQc = user?.username?.toLowerCase() === "qc.demo";
  const isFinishing =
    user?.username?.toLowerCase() === "finishing.demo" ||
    user?.department?.toLowerCase() === "finishing";
  const isWarehouse =
    user?.username?.toLowerCase() === "warehouse.demo" ||
    user?.department?.toLowerCase() === "warehouse";
  const isDispatch =
    user?.username?.toLowerCase() === "dispatch.demo" ||
    user?.department?.toLowerCase() === "dispatch";
  const isRawStore =
    user?.username?.toLowerCase() === "rawstore.demo" ||
    user?.department?.toLowerCase() === "raw-store" ||
    user?.department?.toLowerCase() === "raw_store";

  const targetStationRedirect = isFinalQc
    ? paths.quality
    : isWarehouse || isDispatch || isFinishing
    ? paths.workstation
    : null;

  useEffect(() => {
    if (!me.isPending && !user)
      void navigate(`${paths.login}?redirect=${encodeURIComponent(pathname)}`, { replace: true });
    else if (user && routeKey === "home" && targetStationRedirect) {
      void navigate(targetStationRedirect, { replace: true });
    }
  }, [me.isPending, user, navigate, pathname, routeKey, targetStationRedirect]);

  if (me.isPending || !user)
    return (
      <div className="p-8">
        <LoadingState label="Checking staff session…" />
      </div>
    );

  if (user && routeKey === "home" && targetStationRedirect) {
    return (
      <StaffShell user={user}>
        <div className="p-8">
          <LoadingState label="Redirecting to workstation…" />
        </div>
      </StaffShell>
    );
  }

  const allowed = !routeKey || canAccessRoute(user, routeKey);
  return (
    <StaffShell user={user}>
      {allowed ? (
        children
      ) : (
        <ForbiddenState
          message={`${user.username} (${user.role}) does not have access to this page.`}
        />
      )}
    </StaffShell>
  );
}
