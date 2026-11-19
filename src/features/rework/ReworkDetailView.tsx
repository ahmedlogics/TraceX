import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Hammer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormDialog, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section, Timeline } from "@/components/wt/layout";
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
  const { run, pending } = useWtAction();
  const [dept, setDept] = useState<Department>("stitching");
  const [note, setNote] = useState("Re-stitched seam and aligned.");

  return (
    <Loadable query={q} what="rework case" backHref={paths.rework}>
      {({ reworkCase: rc, garment, inspections }) => {
        // Find latest reinspection if exists
        const latestReinsp = inspections
          .filter((i) => i.kind === "reinspection" && i.subjectId === garment.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

        const isSelfRepairer = rc.repairedBy && rc.repairedBy === me.id;
        const canRelease = can.releaseHold(me, garment, latestReinsp, rc) && !isSelfRepairer;

        // Determine 5-step progress
        const steps = [
          {
            title: "1. Defect Logged",
            desc: rc.defectReason,
            done: true,
            active: false,
          },
          {
            title: "2. Department Assigned",
            desc: rc.assignedDepartment
              ? departmentLabels[rc.assignedDepartment]
              : "Awaiting Manager",
            done: !!rc.assignedDepartment,
            active: rc.status === "awaiting-assignment",
          },
          {
            title: "3. Repair Completed",
            desc: rc.repairedBy ? "Work Recorded" : "In Progress",
            done: rc.status === "repaired" || rc.status === "closed",
            active: rc.status === "assigned",
          },
          {
            title: "4. Independent Reinspection",
            desc: latestReinsp ? `Status: ${latestReinsp.status}` : "Pending Repair",
            done: latestReinsp?.status === "passed",
            active: rc.status === "repaired" && latestReinsp?.status === "open",
          },
          {
            title: "5. Quality Release",
            desc: garment.hold ? "Held" : "Released",
            done: rc.status === "closed" && !garment.hold,
            active: latestReinsp?.status === "passed" && !!garment.hold,
          },
        ];

        return (
          <>
            <PageHeader
              title={<span className="wt-id text-2xl">{rc.id}</span>}
              description={`Rework and repair tracking for garment ${garment.id} (${garment.productName})`}
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
                <div className="flex flex-wrap items-center gap-2">
                  <FormDialog
                    allowed={can.assignRework(me, rc)}
                    trigger="Assign Rework"
                    title={`Assign ${rc.id} to Production Shop`}
                    submitLabel="Confirm Assignment"
                    onSubmit={async () =>
                      (await run(
                        (c) => c.assignRework(rc.id, dept).then(() => true),
                        `Assigned to ${departmentLabels[dept]}.`,
                      )) ?? false
                    }
                  >
                    <Field label="Production Department" htmlFor="rw-dept">
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
                    trigger="Record Repair Completion"
                    title="Record Repair Work"
                    description="Detail the physical corrective action. This automatically queues an independent reinspection."
                    submitLabel="Submit Repair"
                    onSubmit={async () =>
                      (await run(
                        (c) => c.completeRework(rc.id, note).then(() => true),
                        "Repair recorded — fresh reinspection opened.",
                      )) ?? false
                    }
                  >
                    <Field label="Repair Notes & Actions Taken" htmlFor="rw-note">
                      <Textarea
                        id="rw-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="e.g. Unpicked pocket seam, replaced bobbin thread, realigned..."
                      />
                    </Field>
                  </FormDialog>

                  {canRelease && (
                    <Button
                      size="sm"
                      disabled={pending}
                      className="bg-success text-success-foreground hover:bg-success/90"
                      onClick={() =>
                        void run(
                          (c) => c.releaseHold(garment.id),
                          `Quality hold released on ${garment.id}.`,
                        )
                      }
                    >
                      <ShieldCheck className="size-4 mr-1.5" /> Release Quality Hold
                    </Button>
                  )}
                </div>
              }
            />

            {/* Stepper */}
            <div className="rounded-lg border bg-card p-4 shadow-sm mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Lifecycle & Clearance Progress
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {steps.map((st, idx) => (
                  <div
                    key={st.title}
                    className={`rounded-md p-3 border text-xs transition-colors ${
                      st.done
                        ? "border-success/40 bg-success/10 text-success-foreground"
                        : st.active
                          ? "border-primary bg-primary/10 text-primary-foreground font-semibold"
                          : "border-muted bg-muted/20 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      {st.done ? (
                        <CheckCircle2 className="size-3.5 text-success shrink-0" />
                      ) : st.active ? (
                        <RotateCcw className="size-3.5 text-primary shrink-0 animate-spin" />
                      ) : (
                        <span className="size-3.5 rounded-full border border-muted-foreground/40 shrink-0 inline-block text-center text-[10px]" />
                      )}
                      <span>{st.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] opacity-80">{st.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Independent Inspection Warning */}
            {isSelfRepairer && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-warning-foreground">
                      Independent Clearance Policy Active
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You recorded this repair. Factory traceability rules require a different
                      quality inspector to evaluate the reinspection and release the garment hold.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Case Details */}
              <Section title="Case Overview">
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
                    { label: "Product", value: garment.productName },
                    {
                      label: "Defect Identified",
                      value: (
                        <span className="font-semibold text-destructive">{rc.defectReason}</span>
                      ),
                    },
                    {
                      label: "Originating Inspection",
                      value: (
                        <LinkIf
                          user={me}
                          routeKey="inspection"
                          href={paths.inspection(rc.inspectionId)}
                          id={rc.inspectionId}
                        />
                      ),
                    },
                    {
                      label: "Assigned Department",
                      value: rc.assignedDepartment
                        ? departmentLabels[rc.assignedDepartment]
                        : "Awaiting Manager",
                    },
                    {
                      label: "Repaired By",
                      value: rc.repairedBy ? <UserName id={rc.repairedBy} /> : "—",
                    },
                    { label: "Repair Summary", value: rc.repairNote ?? "—" },
                    {
                      label: "Reinspection",
                      value: rc.reinspectionId ? (
                        <LinkIf
                          user={me}
                          routeKey="inspection"
                          href={paths.inspection(rc.reinspectionId)}
                          id={rc.reinspectionId}
                        />
                      ) : (
                        "Opens when repair is recorded"
                      ),
                    },
                  ]}
                />
              </Section>

              {/* Complete Audit & Defect History */}
              <Section title="Defect, Repair & Reinspection Chronology" className="lg:col-span-2">
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
                            — <span className="uppercase font-semibold">{i.status}</span>
                          </>
                        ),
                        meta: fmt.dateTime(i.submittedAt),
                        body: i.defectReason
                          ? `Defect: ${i.defectReason}`
                          : i.notes || "All checklist items passed spec.",
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
        );
      }}
    </Loadable>
  );
}
