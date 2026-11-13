import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { AuditView } from "@/features/audit/AuditView";

export const Route = createFileRoute("/staff/_workspace/audit")({
  staticData: { access: "audit" },
  head: () => pageHead("Audit log", "Scoped read-only event log."),
  component: AuditRoute,
});

function AuditRoute() {
  return <AuditView />;
}
