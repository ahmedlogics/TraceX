import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { ShipmentDetailView } from "@/features/shipments/ShipmentDetailView";

export const Route = createFileRoute("/staff/_workspace/shipments/$shipmentId")({
  staticData: { access: "shipment" },
  head: ({ params }) =>
    pageHead(`${params.shipmentId} · Shipment`, "Manifest, eligibility checks and departure."),
  component: ShipmentDetailRoute,
});

function ShipmentDetailRoute() {
  const { shipmentId } = Route.useParams();
  return <ShipmentDetailView shipmentId={shipmentId} />;
}
