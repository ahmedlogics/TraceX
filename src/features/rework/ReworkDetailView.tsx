import { useState } from "react";
import { paths } from "@/app/paths";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormDialog, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, KeyValue, PageHeader, Section, Timeline } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels } from "@/domain/labels";
import { can } from "@/domain/permissions";
import type { Department } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

export function ReworkDetailView({ caseId }: { caseId: string }) {
  const me = useMe();
  const q = useWtQuery(["rework", caseId], (c) => c.getRework(caseId));
  const { run } = useWtAction();
  const [dept, setDept] = useState<Department>("stitching");
  const [note, setNote] = useState("Re-stitched seam and pressed.");
  return (
    <Loadable query={q} what="rework case" backHref={paths.rework}>
      {({ reworkCase: rc, garment, inspections }) => (
        <>
          <PageHeader
            title={<span className="wt-id text-2xl">{rc.id}</span>}
            description={`Rework for ${garment.id}`}
            crumbs={[
              { label: "Staff", href: paths.home },
              { label: "Rework", href: paths.rework },
              { label: rc.id },
            ]}
            meta={
              <>
                <StatusBadge status={rc.status} />
                {garment.hold && <HoldBadge />}
              </>
            }
            actions={
              <>
                <FormDialog
                  allowed={can.assignRework(me, rc)}
                  trigger="Assign rework"
                  title={`Assign ${rc.id}`}
                  submitLabel="Assign"
                  onSubmit={async () =>
                    (await run(
                      (c) => c.assignRework(rc.id, dept).then(() => true),
                      `Assigned to ${departmentLabels[dept]}.`,
                    )) ?? false
                  }
                >
                  <Field label="Production department" htmlFor="rw-dept">
                    <NativeSelect
                      id="rw-dept"
                      value={dept}
                      onChange={(v) => setDept(v as Department)}
                      options={(["cutting", "stitching", "finishing"] as const).map((d) => ({
                        value: d,
                        label: departmentLabels[d],
                      }))}
                    />
                  </Field>
                </FormDialog>
                <FormDialog
                  allowed={can.completeRework(me, rc)}
                  trigger="Record repair completion"
                  title="Record repair completion"
                  description="This opens a fresh reinspection. Operators cannot release the hold."
                  submitLabel="Mark repaired"
                  onSubmit={async () =>
                    (await run(
                      (c) => c.completeRework(rc.id, note).then(() => true),
                      "Repair recorded — reinspection opened.",
                    )) ?? false
                  }
                >
                  <Field label="Repair note (internal)" htmlFor="rw-note">
                    <Textarea
                      id="rw-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                    />
                  </Field>
                </FormDialog>
              </>
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Case">
              <KeyValue
                items={[
                  {
                    label: "Garment",
                    value: (
                      <LinkIf
                        user={me}
                        routeKey="garment"
                        href={paths.garment(garment.id)}
                        id={garment.id}
                      />
                    ),
                  },
                  { label: "Defect", value: rc.defectReason },
                  {
                    label: "Assigned department",
                    value: rc.assignedDepartment
                      ? departmentLabels[rc.assignedDepartment]
                      : "Awaiting manager",
                  },
                  {
                    label: "Repaired by",
                    value: rc.repairedBy ? <UserName id={rc.repairedBy} /> : "—",
                  },
                  { label: "Repair note", value: rc.repairNote ?? "—" },
                  {
                    label: "Fresh reinspection",
                    value: rc.reinspectionId ? (
                      <LinkIf
                        user={me}
                        routeKey="inspection"
                        href={paths.inspection(rc.reinspectionId)}
                        id={rc.reinspectionId}
                      />
                    ) : (
                      "Opens after repair"
                    ),
                  },
                ]}
              />
              <div className="mt-4">
                <ScopeNote>
                  The hold is released only by the quality inspector after a passing reinspection.
                </ScopeNote>
              </div>
            </Section>
            <Section title="Defect history" className="lg:col-span-2">
              <Timeline
                items={[
                  ...inspections
                    .filter((i) => i.status !== "open")
                    .map((i) => ({
                      key: i.id,
                      title: (
                        <>
                          {i.kind} inspection{" "}
                          <LinkIf
                            user={me}
                            routeKey="inspection"
                            href={paths.inspection(i.id)}
                            id={i.id}
                          />{" "}
                          — {i.status}
                        </>
                      ),
                      meta: fmt.dateTime(i.submittedAt),
                      body: i.defectReason,
                      tone: i.status === "failed" ? ("danger" as const) : ("success" as const),
                      at: i.submittedAt ?? i.createdAt,
                    })),
                  ...rc.history.map((h, idx) => ({
                    key: `h${idx}`,
                    title: h.label,
                    meta: (
                      <>
                        {fmt.dateTime(h.at)} · <UserName id={h.actorId} />
                      </>
                    ),
                    at: h.at,
                  })),
                ].sort((a, b) => a.at.localeCompare(b.at))}
              />
            </Section>
          </div>
        </>
      )}
    </Loadable>
  );
}
