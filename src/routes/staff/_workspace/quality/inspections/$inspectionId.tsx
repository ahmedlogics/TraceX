import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { InspectionDetailView } from "@/features/quality/InspectionDetailView";

export const Route = createFileRoute("/staff/_workspace/quality/inspections/$inspectionId")({
  staticData: { access: "inspection" },
  head: ({ params }) =>
    pageHead(`${params.inspectionId} · Inspection`, "Checklist, notes and inspector results."),
  component: InspectionDetailRoute,
});

function InspectionDetailRoute() {
  const { inspectionId } = Route.useParams();
  return <InspectionDetailView inspectionId={inspectionId} />;
}
