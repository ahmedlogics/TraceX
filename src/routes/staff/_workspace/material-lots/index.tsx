import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { LotsView } from "@/features/materials/LotsView";

export const Route = createFileRoute("/staff/_workspace/material-lots/")({
  staticData: { access: "materialLots" },
  head: () => pageHead("Material lots", "Fabric register and receiving."),
  component: LotsRoute,
});

function LotsRoute() {
  return <LotsView />;
}
