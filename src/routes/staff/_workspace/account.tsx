import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { AccountView } from "@/features/auth/AccountView";

export const Route = createFileRoute("/staff/_workspace/account")({
  staticData: { access: "account" },
  head: () => pageHead("My account", "Your profile, role and account controls."),
  component: AccountRoute,
});

function AccountRoute() {
  return <AccountView />;
}
