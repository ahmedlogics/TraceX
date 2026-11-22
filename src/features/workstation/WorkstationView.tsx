import { paths } from "@/app/paths";
import { PageHeader } from "@/components/wt/layout";
import { StationShell } from "./panels/StationShell";

export function WorkstationView() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Workstation"
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Workstation" }]}
      />
      <StationShell />
    </div>
  );
}
