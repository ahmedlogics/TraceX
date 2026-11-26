import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { paths } from "@/app/paths";
import { useAppNavigate } from "@/app/navigation";
import { useCurrentUser } from "@/app/auth";
import { LoadingState } from "@/components/wt/states";
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
  const isFinishing =
    me.data?.username?.toLowerCase() === "finishing.demo" ||
    me.data?.department?.toLowerCase() === "finishing";
  const isWarehouse =
    me.data?.username?.toLowerCase() === "warehouse.demo" ||
    me.data?.department?.toLowerCase() === "warehouse";
  const isDispatch =
    me.data?.username?.toLowerCase() === "dispatch.demo" ||
    me.data?.department?.toLowerCase() === "dispatch";
  const isRawStore =
    me.data?.username?.toLowerCase() === "rawstore.demo" ||
    me.data?.department?.toLowerCase() === "raw-store" ||
    me.data?.department?.toLowerCase() === "raw_store";

  useEffect(() => {
    if (isFinalQc) {
      void navigate(paths.quality, { replace: true });
    } else if (isWarehouse || isDispatch || isFinishing) {
      void navigate(paths.workstation, { replace: true });
    }
  }, [isFinalQc, isWarehouse, isDispatch, isFinishing, navigate]);

  if (me.isPending || !me.data) {
    return (
      <div className="p-8">
        <LoadingState label="Loading staff home…" />
      </div>
    );
  }

  if (isFinalQc || isWarehouse || isDispatch || isFinishing) return null;

  return <DashboardView />;
}
