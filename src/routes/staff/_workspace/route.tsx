import { Outlet, createFileRoute, redirect, useMatches } from "@tanstack/react-router";
import { getSessionUserId } from "@/app/session";
import { StaffWorkspace } from "@/app/StaffWorkspace";
import "@/app/route-static";

// Mock guard: anonymous visits to protected staff URLs go to staff sign-in.
export const Route = createFileRoute("/staff/_workspace")({
  beforeLoad: ({ location }) => {
    if (!getSessionUserId())
      throw redirect({ to: "/staff/login", search: { redirect: location.pathname } });
  },
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const access = useMatches({ select: (ms) => ms[ms.length - 1]?.staticData.access });
  return (
    <StaffWorkspace routeKey={access}>
      <Outlet />
    </StaffWorkspace>
  );
}
