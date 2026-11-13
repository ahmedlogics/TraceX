import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { UsersView } from "@/features/admin/UsersView";

export const Route = createFileRoute("/staff/_workspace/admin/users")({
  staticData: { access: "adminUsers" },
  head: () => pageHead("Staff directory", "Invite, scope, suspend and reset staff."),
  component: UsersRoute,
});

function UsersRoute() {
  return <UsersView />;
}
