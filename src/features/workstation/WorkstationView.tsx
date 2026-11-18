import { useState } from "react";
import { Cpu, Radio, ScanLine } from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge, type Tone } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { sensorIds, sensorLabels } from "@/domain/labels";
import type { TriggerOutcome } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { SubjectLink } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";
import { StationShell } from "./panels/StationShell";

const outcomeText: Record<TriggerOutcome, { label: string; tone: Tone }> = {
  accepted: { label: "Accepted — presence recorded", tone: "success" },
  "ignored-unarmed": { label: "Ignored — checkpoint not armed", tone: "neutral" },
  "rejected-wrong-checkpoint": { label: "Rejected — wrong checkpoint", tone: "danger" },
  "ignored-duplicate": { label: "Ignored — duplicate (clear first)", tone: "warning" },
};

function LegacyIrWorkstation() {
  const me = useMe();
  const q = useWtQuery(["workstation"], (c) => c.getWorkstation());
  const { run, pending } = useWtAction();
  const [pick, setPick] = useState("");

  return (
    <Loadable query={q}>
      {({ session, tasks, selected }) => {
        const presence = session.needsClear
          ? {
              label: `Presence accepted at ${selected?.observation?.sensor ?? "checkpoint"} — clear before re-arming`,
              tone: "success" as Tone,
            }
          : session.armed
            ? {
                label: `Armed — waiting for presentation at ${selected?.checkpoint}`,
                tone: "info" as Tone,
              }
            : {
                label: selected?.observation ? "Presentation already recorded" : "Not armed",
                tone: "neutral" as Tone,
              };
        const chosen = pick || tasks[0]?.id || "";
        const locked = session.armed || session.needsClear;

        return (
          <div className="space-y-6">
            <section
              aria-label="Current subject"
              className="rounded-lg border-2 border-primary/30 bg-card p-5"
            >
              {selected ? (
                <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="space-y-1">
                    <p className="wt-eyebrow">Active subject · {selected.subjectType}</p>
                    <p className="wt-id text-3xl font-semibold text-foreground sm:text-4xl">
                      {selected.subjectId}
                    </p>
                    <p className="text-sm">{selected.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Task <span className="wt-id">{selected.id}</span> ·{" "}
                      <SubjectLink user={me} type={selected.subjectType} id={selected.subjectId} />
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent p-4 text-center">
                    <p className="wt-eyebrow">Expected checkpoint</p>
                    <p className="wt-id text-4xl font-semibold text-accent-foreground">
                      {selected.checkpoint}
                    </p>
                    <p className="text-xs text-accent-foreground">
                      {selected.checkpoint ? sensorLabels[selected.checkpoint] : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState title="No task selected">
                  Choose one of your checkpoint tasks below.
                </EmptyState>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Presence:</span>
                <StatusBadge status={presence.label} tone={presence.tone} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={pending || !selected || locked || !!selected?.observation}
                  onClick={() => void run((c) => c.armCheckpoint(), "Checkpoint armed.")}
                >
                  <Radio /> Arm checkpoint
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || !locked}
                  onClick={() => void run((c) => c.clearCheckpoint(), "Checkpoint cleared.")}
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || !selected?.observation}
                  onClick={() => void run((c) => c.handOverTask(), "Task handed over.")}
                >
                  Hand over
                </Button>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="Select task"
                description="Only checkpoint tasks in your scope are listed."
              >
                {tasks.length === 0 ? (
                  <EmptyState title="No checkpoint tasks in your scope" />
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run((c) => c.selectWorkstationTask(chosen), "Task selected.");
                    }}
                  >
                    <Field label="Task" htmlFor="ws-task">
                      <NativeSelect
                        id="ws-task"
                        value={chosen}
                        onChange={setPick}
                        options={tasks.map((t) => ({
                          value: t.id,
                          label: `${t.id} · ${t.checkpoint} · ${t.title}${t.observation ? " (observed)" : ""}`,
                        }))}
                      />
                    </Field>
                    <Button type="submit" size="sm" disabled={pending || locked}>
                      Select task
                    </Button>
                    {locked && (
                      <ScopeNote>
                        Clear the current checkpoint before selecting a different task.
                      </ScopeNote>
                    )}
                  </form>
                )}
              </Section>

              <Section
                title="Sensor simulation (demo)"
                description="Historical simulation of ESP32 proximity presence checkpoints."
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sensorIds.map((s) => (
                    <Button
                      key={s}
                      variant={selected?.checkpoint === s ? "default" : "outline"}
                      disabled={pending}
                      onClick={() =>
                        void run(
                          (c) => c.simulateTrigger(s),
                          (o) => `${s}: ${outcomeText[o].label}`,
                        )
                      }
                      className="h-auto flex-col items-start gap-0 py-2 text-left"
                    >
                      <span className="flex items-center gap-1 font-semibold">
                        <ScanLine className="size-4" /> Simulate {s}
                      </span>
                      <span className="whitespace-normal text-[11px] font-normal opacity-80">
                        {sensorLabels[s].split("· ")[1]}
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  A trigger supplies presence only. Identity comes from the selected task and its
                  physical label. A sensor event never records a QC result.
                </p>
              </Section>
            </div>

            <Section title="Trigger log">
              <DataTable
                rows={session.log}
                rowKey={(l) => `${l.at}-${l.sensor}`}
                empty="No triggers yet."
                columns={[
                  { header: "Time", cell: (l) => fmt.dateTime(l.at) },
                  { header: "Sensor", cell: (l) => <span className="wt-id">{l.sensor}</span> },
                  { header: "Task", cell: (l) => <span className="wt-id">{l.taskId ?? "—"}</span> },
                  {
                    header: "Outcome",
                    cell: (l) => (
                      <StatusBadge
                        status={outcomeText[l.outcome].label}
                        tone={outcomeText[l.outcome].tone}
                      />
                    ),
                  },
                ]}
              />
            </Section>
          </div>
        );
      }}
    </Loadable>
  );
}

export function WorkstationView() {
  return (
    <>
      <PageHeader
        title="Workstation"
        description="Nine-reader RFID prototype stations and routine production scans."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Workstation" }]}
      />
      <Tabs defaultValue="rfid">
        <TabsList className="mb-4">
          <TabsTrigger value="rfid">Nine RFID Stations</TabsTrigger>
          <TabsTrigger value="ir">Legacy IR Checkpoints</TabsTrigger>
        </TabsList>
        <TabsContent value="rfid">
          <StationShell />
        </TabsContent>
        <TabsContent value="ir">
          <LegacyIrWorkstation />
        </TabsContent>
      </Tabs>
    </>
  );
}
