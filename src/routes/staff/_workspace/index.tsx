import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { paths } from "@/app/paths";
import { useAppNavigate } from "@/app/navigation";
import { useCurrentUser } from "@/app/auth";
import { DashboardView } from "@/features/dashboard/DashboardView";

export const Route = createFileRoute("/staff/_workspace/")({
  staticData: { access: "home" },
  head: () => pageHead("Staff home", "Role-aware metrics, assigned work and alerts."),
  component: DashboardRoute,
});

function DashboardRoute() {
  const me = useCurrentUser();
  const navigate = useAppNavigate();
  const isFinalQc = me.data?.username?.toLowerCase() === "qc.demo";

  useEffect(() => {
    if (isFinalQc) {
      void navigate(paths.quality, { replace: true });
    }
  }, [isFinalQc, navigate]);

  if (isFinalQc) return null;

  return <DashboardView />;
}
