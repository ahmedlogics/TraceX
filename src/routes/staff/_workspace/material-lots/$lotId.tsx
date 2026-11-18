import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { LotDetailView } from "@/features/materials/LotDetailView";

export const Route = createFileRoute("/staff/_workspace/material-lots/$lotId")({
  staticData: { access: "materialLot" },
  head: ({ params }) =>
    pageHead(`${params.lotId} · Material lot`, "Receipt, inspection, balance and movements."),
  component: LotDetailRoute,
});

function LotDetailRoute() {
  const { lotId } = Route.useParams();
  return <LotDetailView lotId={lotId} />;
}
