import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { GarmentDetailView } from "@/features/garments/GarmentDetailView";

export const Route = createFileRoute("/staff/_workspace/garments/$garmentId")({
  staticData: { access: "garment" },
  head: ({ params }) =>
    pageHead(
      `${params.garmentId} · Garment`,
      "Internal garment timeline, holds, inspections and logistics.",
    ),
  component: GarmentDetailRoute,
});

function GarmentDetailRoute() {
  const { garmentId } = Route.useParams();
  return <GarmentDetailView garmentId={garmentId} />;
}
