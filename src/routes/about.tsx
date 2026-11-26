import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { AboutView } from "@/features/about/AboutView";

export const Route = createFileRoute("/about")({
  head: () =>
    pageHead(
      "TraceX · Project Showcase",
      "A Blockchain-Based Real-Time Smart Supply Chain Traceability System",
    ),
  component: AboutRoute,
});

function AboutRoute() {
  return <AboutView />;
}
