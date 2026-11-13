import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { OrderDetailView } from "@/features/production/OrderDetailView";

export const Route = createFileRoute("/staff/_workspace/production-orders/$orderId")({
  staticData: { access: "productionOrder" },
  head: ({ params }) => pageHead(`${params.orderId} · Production order`, "Material inputs, cutting outputs and lineage."),
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  const { orderId } = Route.useParams();
  return <OrderDetailView orderId={orderId} />;
}
