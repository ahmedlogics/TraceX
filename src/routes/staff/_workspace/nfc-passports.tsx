import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { NfcHubView } from "@/features/nfc/NfcHubView";

export const Route = createFileRoute("/staff/_workspace/nfc-passports")({
  staticData: { access: "garments" },
  head: () =>
    pageHead(
      "NFC Tag Hub & Mobile Passports",
      "Configure localtunnel and generate ready-to-write links for NFC Tools.",
    ),
  component: NfcPassportsRoute,
});

function NfcPassportsRoute() {
  return <NfcHubView />;
}
