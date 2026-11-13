import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { OrdersView } from "@/features/production/OrdersView";

export const Route = createFileRoute("/staff/_workspace/production-orders/")({
  staticData: { access: "productionOrders" },
  head: () => pageHead("Production orders", "Orders and planning."),
  component: OrdersRoute,
});

function OrdersRoute() {
  return <OrdersView />;
}
