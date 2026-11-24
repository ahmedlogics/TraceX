import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { PublicProofView } from "@/features/public/PublicProofView";

export const Route = createFileRoute("/p/$publicId/proof")({
  head: () => pageHead("Verification", "Demo evidence for a published TraceX product record."),
  component: ProofRoute,
});

function ProofRoute() {
  const { publicId } = Route.useParams();
  return <PublicProofView publicId={publicId} />;
}
