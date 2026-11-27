import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { WarehouseLocatorView } from "@/features/fulfilment/WarehouseLocatorView";

export const Route = createFileRoute("/staff/_workspace/warehouse-locator")({
  staticData: { access: "warehouseLocator" },
  head: () =>
    pageHead(
      "Warehouse Storage Locator",
      "Locate cartons, products, and garment serials placed across warehouse storage bins.",
    ),
  component: WarehouseLocatorRoute,
});

function WarehouseLocatorRoute() {
  return <WarehouseLocatorView />;
}
