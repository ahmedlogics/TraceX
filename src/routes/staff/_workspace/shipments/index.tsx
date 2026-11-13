import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { ShipmentsView } from "@/features/shipments/ShipmentsView";

export const Route = createFileRoute("/staff/_workspace/shipments/")({
  staticData: { access: "shipments" },
  head: () => pageHead("Shipments", "Shipment register and planning."),
  component: ShipmentsRoute,
});

function ShipmentsRoute() {
  return <ShipmentsView />;
}
