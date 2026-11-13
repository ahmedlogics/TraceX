import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/app/head";
import { WorkstationView } from "@/features/workstation/WorkstationView";

export const Route = createFileRoute("/staff/_workspace/workstation")({
  staticData: { access: "workstation" },
  head: () => pageHead("Workstation", "Arm a checkpoint, simulate presentation and hand over."),
  component: WorkstationRoute,
});

function WorkstationRoute() {
  return <WorkstationView />;
}
