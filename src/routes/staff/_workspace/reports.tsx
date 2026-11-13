import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { ReportsView } from "@/features/reports/ReportsView";

export const Route = createFileRoute("/staff/_workspace/reports")({
  staticData: { access: "reports" },
  head: () => pageHead("Reports", "Scoped operational counts."),
  component: ReportsRoute,
});

function ReportsRoute() {
  return <ReportsView />;
}
