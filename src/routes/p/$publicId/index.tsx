import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { PublicJourneyView } from "@/features/public/PublicJourneyView";

export const Route = createFileRoute("/p/$publicId/")({
  head: () =>
    pageHead(
      "Product journey",
      "Follow the journey behind what you wear — from fabric to dispatch.",
    ),
  component: JourneyRoute,
});

function JourneyRoute() {
  const { publicId } = Route.useParams();
  return <PublicJourneyView publicId={publicId} />;
}
