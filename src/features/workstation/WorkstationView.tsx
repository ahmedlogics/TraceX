import { paths } from "@/app/paths";
import { PageHeader } from "@/components/wt/layout";
import { StationShell } from "./panels/StationShell";

export function WorkstationView() {
  return (
    <>
      <PageHeader
        title="Finishing Workstation"
        description="Station 5 / S4 · Finishing throughput and defect resolution."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Workstation" }]}
      />
      <StationShell />
    </>
  );
}
