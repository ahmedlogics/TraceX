import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { LoginView } from "@/features/auth/LoginView";

export const Route = createFileRoute("/staff/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  head: () =>
    pageHead("Staff sign-in", "Sign in to the WearTrail staff workspace or pick a demo account."),
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <LoginView redirectTo={redirect} />;
}
