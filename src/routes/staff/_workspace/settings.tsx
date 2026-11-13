import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { SettingsView } from "@/features/admin/SettingsView";

export const Route = createFileRoute("/staff/_workspace/settings")({
  staticData: { access: "settings" },
  head: () => pageHead("Settings", "Device, checkpoint and business settings."),
  component: SettingsRoute,
});

function SettingsRoute() {
  return <SettingsView />;
}
