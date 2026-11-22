import { paths } from "@/app/paths";
import { PageHeader } from "@/components/wt/layout";
import { StationShell } from "./panels/StationShell";

export function WorkstationView() {
  return (
    <>
      <PageHeader
        title="Workstation"
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Workstation" }]}
      />
      <StationShell />
    </>
  );
}
