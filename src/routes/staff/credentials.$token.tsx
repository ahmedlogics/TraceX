import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { CredentialsView } from "@/features/auth/CredentialsView";

export const Route = createFileRoute("/staff/credentials/$token")({
  head: () => pageHead("Set up password", "Set or reset your TraceX staff password."),
  component: CredentialsRoute,
});

function CredentialsRoute() {
  const { token } = Route.useParams();
  return <CredentialsView token={token} />;
}
