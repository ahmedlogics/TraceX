import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { GarmentsView } from "@/features/garments/GarmentsView";

export const Route = createFileRoute("/staff/_workspace/garments/")({
  staticData: { access: "garments" },
  head: () => pageHead("Garments", "Garment register with stage and quality disposition."),
  component: GarmentsRoute,
});

function GarmentsRoute() {
  return <GarmentsView />;
}
