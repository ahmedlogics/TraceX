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
    me.role === "M" ||
    (isStitching && me.department === "stitching") ||
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
                    description="Routine station scans automatically identify garments by card UID and advance their physical stage."
                  >
                    <div className="space-y-4">
                      <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-primary" />
                          <p className="text-sm font-medium">Continuous Routine Reader Active</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          No per-shirt form required. Simply present any assembled garment card at
                          the reader. Advancement:{" "}
                          <span className="font-semibold capitalize">{expectedStage}</span> &rarr;{" "}
                          <span className="font-semibold capitalize">{nextStage}</span>.
                        </p>

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
                              hint="Enter or scan the garment's active RFID card UID."
                            >
                              <Input
                                id="rtn-uid"
                                value={scanUid}
                                onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                className="font-mono bg-card"
                                placeholder={isStitching ? "e.g. 04A7B8C9" : "e.g. 04001122"}
                              />
                            </Field>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={pending || !scanUid.trim()}
                                onClick={() =>
                                  void run(
                                    (c) => c.routineScan(scanUid.trim(), stationCode),
                                    (outcome) =>
                                      outcome.resolution === "accepted"
                                        ? `Garment ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName}) recorded at ${stationData.stationName}.`
                                        : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                  )
                                }
                              >
                                <ScanLine className="size-4" /> Record Routine Scan
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Station guidance */}
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>
                          &bull; Duplicate scans on an already-processed garment are safely ignored.
                        </p>
                        <p>
                          &bull; Garments with an active quality hold remain blocked from routine
                          progression.
                        </p>
                        <p>&bull; Scans are linked to the active operator session.</p>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Station Work Queue & Planning"
                    description={`Garments awaiting or in progress at ${stationData.stationName}.`}
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
                          header: "Product",
                          cell: (g) => g.productName,
                        },
                        {
                          header: "Stage",
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
