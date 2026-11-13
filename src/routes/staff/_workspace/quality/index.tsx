import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { QualityView } from "@/features/quality/QualityView";

export const Route = createFileRoute("/staff/_workspace/quality/")({
  staticData: { access: "quality" },
  head: () => pageHead("Quality", "Incoming, final and reinspection queues."),
  component: QualityRoute,
});

function QualityRoute() {
  return <QualityView />;
}
