import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { ProductPassportsView } from "@/features/public/ProductPassportsView";

export const Route = createFileRoute("/staff/_workspace/product-passports")({
  staticData: { access: "productPassports" },
  head: () =>
    pageHead(
      "Product Passports & Transparency URLs",
      "Public journey passports and QR codes for products completing Stations 1 through 9.",
    ),
  component: ProductPassportsRoute,
});

function ProductPassportsRoute() {
  return <ProductPassportsView />;
}
