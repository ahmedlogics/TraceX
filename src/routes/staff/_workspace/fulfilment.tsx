import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { FulfilmentView } from "@/features/fulfilment/FulfilmentView";

export const Route = createFileRoute("/staff/_workspace/fulfilment")({
  staticData: { access: "fulfilment" },
  head: () => pageHead("Fulfilment", "Packing and finished stock."),
  component: FulfilmentRoute,
});

function FulfilmentRoute() {
  return <FulfilmentView />;
}
