import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { LedgerView } from "@/features/ledger/LedgerView";

export const Route = createFileRoute("/staff/_workspace/ledger")({
  staticData: { access: "ledger" },
  head: () => pageHead("Ledger", "Mock record commitments."),
  component: LedgerRoute,
});

function LedgerRoute() {
  return <LedgerView />;
}
