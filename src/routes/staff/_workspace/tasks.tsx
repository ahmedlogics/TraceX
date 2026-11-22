import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { paths } from "@/app/paths";
import { DashboardView } from "@/features/dashboard/DashboardView";

export const Route = createFileRoute("/staff/_workspace/tasks")({
  staticData: { access: "home" },
  head: () => pageHead("Staff Home", "Role-aware metrics, unified work queue and alerts."),
  beforeLoad: () => {
    throw redirect({ to: paths.home });
  },
  component: DashboardView,
});
