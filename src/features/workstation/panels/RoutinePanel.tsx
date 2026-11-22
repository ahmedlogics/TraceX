import { useState } from "react";
import { ArrowRight, CheckCircle2, RotateCw, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";

export function RoutinePanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const stationCode = stationData.stationCode as "stitching" | "finishing";
  const [scanUid, setScanUid] = useState("");

  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qTasks = useWtQuery(["tasks"], (c) => c.listTasks());

  const isStitching = stationCode === "stitching";
  const expectedStage = isStitching ? "stitching" : "finishing";
  const nextStage = isStitching ? "finishing" : "final-qc";

  const isAuthorized =
    me.role === "A" ||
    me.role === "O" ||
    me.role === "P" ||
    (isStitching && (me.department === "stitching" || me.department === "finishing")) ||
    (!isStitching && me.department === "finishing");

  return (
    <Loadable query={qGarments}>
      {(garments) => (
        <Loadable query={qTasks}>
          {(tasks) => {
            const queue = garments.filter(
              (g) => g.stage === expectedStage || g.stage === nextStage,
            );
            const deptTasks = tasks.filter(
              (t) =>
                t.department === (isStitching ? "stitching" : "finishing") && t.status !== "done",
            );

            return (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Section
                    title={`Routine ${stationData.stationName} Reader`}
                  >
                    <div className="space-y-4">
                      <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                          </span>
                          <p className="text-sm font-semibold text-foreground">Continuous Routine Reader Active</p>
                        </div>

                        {!isAuthorized && (
                          <ScopeNote>
                            Only {isStitching ? "stitching" : "finishing"} staff or managers can
                            record routine completions.
                          </ScopeNote>
                        )}

                        {isAuthorized && (
                          <div className="pt-2 space-y-3">
                            <Field
                              label="Garment Card UID"
                              htmlFor="rtn-uid"
                            >
                              <Input
                                id="rtn-uid"
                                value={scanUid}
                                onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                className="font-mono bg-card"
                                placeholder={isStitching ? "e.g. 04A7B8C9" : "e.g. 04001122"}
                              />
                            </Field>

                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                disabled={pending || !scanUid.trim()}
                                onClick={() =>
                                  void run(
                                    (c) => c.routineScan(scanUid.trim(), stationCode),
                                    (outcome) => {
                                      if (outcome.resolution === "accepted") {
                                        setScanUid("");
                                        return `Garment ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName}) recorded at ${stationData.stationName}. Advanced to ${nextStage}.`;
                                      }
                                      return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
                                    },
                                  )
                                }
                              >
                                <ScanLine className="size-4 mr-1.5" /> Record Routine Scan
                              </Button>

                              {queue.find((g) => g.stage === expectedStage && g.rfidUid) && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={pending}
                                  onClick={() => {
                                    const next = queue.find((g) => g.stage === expectedStage && g.rfidUid);
                                    if (next?.rfidUid) setScanUid(next.rfidUid);
                                  }}
                                >
                                  Pre-fill Next ({queue.find((g) => g.stage === expectedStage && g.rfidUid)?.id})
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Station Work Queue & Planning"
                  >
                    <DataTable
                      rows={queue}
                      rowKey={(g) => g.id}
                      empty={`No garments in queue for ${stationData.stationName}.`}
                      columns={[
                        {
                          header: "Garment",
                          cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                        },
                        {
                          header: "Product & Size",
                          cell: (g) => (
                            <div>
                              <p className="font-medium text-xs sm:text-sm">{g.productName}</p>
                              {g.size && (
                                <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold mt-0.5">
                                  Size {g.size}
                                </span>
                              )}
                            </div>
                          ),
                        },
                        {
                          header: "Active RFID Card",
                          cell: (g) =>
                            g.rfidUid ? (
                              <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                {g.rfidUid}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">Unbound</span>
                            ),
                        },
                        {
                          header: "Physical Stage",
                          cell: (g) => <StatusBadge status={g.stage} />,
                        },
                        {
                          header: "Quality",
                          cell: (g) => (
                            <div className="flex items-center gap-1">
                              <StatusBadge status={g.disposition} />
                              {g.hold && <HoldBadge />}
                            </div>
                          ),
                        },
                        {
                          header: "Quick Scan",
                          cell: (g) => {
                            if (g.stage !== expectedStage) {
                              return (
                                <span className="text-xs text-muted-foreground italic">Processed</span>
                              );
                            }
                            if (g.hold) {
                              return (
                                <span className="text-xs text-danger font-medium">On Hold</span>
                              );
                            }
                            if (!g.rfidUid) {
                              return (
                                <span className="text-xs text-warning font-medium">No Card</span>
                              );
                            }
                            return (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs font-semibold border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 shadow-2xs"
                                disabled={pending || !isAuthorized}
                                onClick={() =>
                                  void run(
                                    (c) => c.routineScan(g.rfidUid!, stationCode),
                                    (outcome) =>
                                      outcome.resolution === "accepted"
                                        ? `Garment ${outcome.garmentCode ?? outcome.subjectId} recorded at ${stationData.stationName}. Advanced to ${nextStage}.`
                                        : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                  )
                                }
                              >
                                <ScanLine className="size-3 mr-1" /> Tap Card
                              </Button>
                            );
                          },
                        },
                      ]}
                    />
                  </Section>
                </div>
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}
