import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/app/head";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/staff" });
  },
  head: () => pageHead("TraceX", "Garment traceability for factory staff and shoppers."),
});
