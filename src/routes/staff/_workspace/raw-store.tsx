import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { RawStoreDashboard } from "@/features/rawstore/RawStoreDashboard";

export const Route = createFileRoute("/staff/_workspace/raw-store")({
  staticData: { access: "rawStore" },
  head: () => pageHead("Raw Store & Fabric Inventory", "Raw Store KPIs, verified incoming QC rolls queue, and fabric issuance."),
  component: RawStoreRoute,
});

function RawStoreRoute() {
  return <RawStoreDashboard />;
}
