import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { ReworkDetailView } from "@/features/rework/ReworkDetailView";

export const Route = createFileRoute("/staff/_workspace/rework/$caseId")({
  staticData: { access: "reworkCase" },
  head: ({ params }) =>
    pageHead(`${params.caseId} · Rework case`, "Defect history, assignment and repair completion."),
  component: ReworkDetailRoute,
});

function ReworkDetailRoute() {
  const { caseId } = Route.useParams();
  return <ReworkDetailView caseId={caseId} />;
}
