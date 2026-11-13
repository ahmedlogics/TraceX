import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { ReworkListView } from "@/features/rework/ReworkListView";

export const Route = createFileRoute("/staff/_workspace/rework/")({
  staticData: { access: "rework" },
  head: () => pageHead("Rework", "Scoped rework queue."),
  component: ReworkListRoute,
});

function ReworkListRoute() {
  return <ReworkListView />;
}
