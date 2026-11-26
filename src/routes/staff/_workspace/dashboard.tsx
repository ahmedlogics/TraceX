import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { DashboardView } from "@/features/dashboard/DashboardView";

export const Route = createFileRoute("/staff/_workspace/dashboard")({
  staticData: { access: "home" },
  head: () => pageHead("Staff Dashboard", "Role-aware metrics, assigned work and alerts."),
  component: DashboardView,
});
