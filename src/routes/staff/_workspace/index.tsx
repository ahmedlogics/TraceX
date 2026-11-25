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
  const isWarehouse =
    me.data?.username?.toLowerCase() === "warehouse.demo" ||
    me.data?.department?.toLowerCase() === "warehouse";
  const isDispatch =
    me.data?.username?.toLowerCase() === "dispatch.demo" ||
    me.data?.department?.toLowerCase() === "dispatch";

  useEffect(() => {
    if (isFinalQc) {
      void navigate(paths.quality, { replace: true });
    } else if (isWarehouse || isDispatch) {
      void navigate(paths.workstation, { replace: true });
    }
  }, [isFinalQc, isWarehouse, isDispatch, navigate]);

  if (isFinalQc || isWarehouse || isDispatch) return null;

  return <DashboardView />;
}
