import { useState } from "react";
import { CheckCircle2, Radio, ScanLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, KeyValue, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

export function ReceivingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const [selectedLotId, setSelectedLotId] = useState("");
  const [scanUid, setScanUid] = useState("04E1F2A3");

  const isReceivingStaff = me.role === "M" || me.department === "receiving";

  return (
    <Loadable query={qLots}>
      {(lots) => {
        const lotId = selectedLotId || lots[0]?.id || "";
        const currentLot = lots.find((l) => l.id === lotId);
        const activeCtx = stationData.activeContext;
        const isCtxForThisStation = activeCtx && activeCtx.stationCode === "fabric_receiving";
        const hasCard = !!currentLot?.rfidUid;

        return (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Section
                title="Fabric Bundle Selection"
                description="Select a physical fabric bundle to assign or verify an RFID card."
              >
                {lots.length === 0 ? (
                  <EmptyState title="No fabric lots recorded" />
                ) : (
                  <div className="space-y-4">
                    <Field label="Fabric lot" htmlFor="rcv-lot">
                      <NativeSelect
                        id="rcv-lot"
                        value={lotId}
                        onChange={(v) => setSelectedLotId(v)}
                        options={lots.map((l) => ({
                          value: l.id,
                          label: `${l.id} — ${l.material} (${l.balanceQty} ${l.unit ?? "m"}${l.rfidUid ? ` · UID: ${l.rfidUid}` : " · Unassigned"})`,
                        }))}
                      />
                    </Field>

                    {currentLot && (
                      <div className="rounded-md border bg-muted/40 p-3">
                        <KeyValue
                          items={[
                            { label: "Material name", value: currentLot.material },
                            { label: "Supplier reference", value: currentLot.supplierRef },
                            {
                              label: "Received quantity",
                              value: `${currentLot.receivedQty} ${currentLot.unit ?? "m"}`,
                            },
                            {
                              label: "Available balance",
                              value: `${currentLot.balanceQty} ${currentLot.unit ?? "m"}`,
                            },
                            {
                              label: "Incoming QC",
                              value: <StatusBadge status={currentLot.status} />,
                            },
                            {
                              label: "Active RFID card",
                              value: currentLot.rfidUid ? (
                                <span className="wt-id font-bold text-success">
                                  {currentLot.rfidUid}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">None assigned</span>
                              ),
                            },
                          ]}
                        />
                      </div>
                    )}

                    {!isReceivingStaff && (
                      <ScopeNote>
                        Only receiving staff or managers can prepare and assign bundle cards.
                      </ScopeNote>
                    )}

                    {isReceivingStaff && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          disabled={
                            pending ||
                            !currentLot ||
                            (isCtxForThisStation && activeCtx.status !== "expired")
                          }
                          onClick={() =>
                            void run(
                              (c) =>
                                c.prepareActionContext("fabric_receiving", "assign_bundle_card", {
                                  kind: "assign_bundle_card",
                                  lotId,
                                }),
                              "Prepared action context for card assignment.",
                            )
                          }
                        >
                          <Radio className="size-4" />
                          {hasCard ? "Reassign bundle card" : "Prepare: Assign bundle card"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <Section
                title="Reader Action & Scan Lifecycle"
                description="Hardware bridge state: prepare action → board ack → ready to scan → confirm."
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Lifecycle state:</span>
                    {isCtxForThisStation ? (
                      <StatusBadge
                        status={activeCtx.status}
                        tone={
                          activeCtx.status === "ready"
                            ? "success"
                            : activeCtx.status === "awaiting_ack"
                              ? "warning"
                              : activeCtx.status === "confirmed"
                                ? "success"
                                : "neutral"
                        }
                      />
                    ) : (
                      <StatusBadge status="idle" tone="neutral" />
                    )}
                  </div>

                  {isCtxForThisStation && activeCtx.status === "awaiting_ack" && (
                    <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 space-y-3">
                      <p className="text-sm font-medium text-warning-foreground">
                        Context <span className="wt-id">{activeCtx.id}</span> created. Awaiting
                        reader board acknowledgement.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            void run(
                              (c) => c.acknowledgeContext(activeCtx.id),
                              "Reader board acknowledged context.",
                            )
                          }
                        >
                          Simulate Board Acknowledgment
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            void run((c) => c.cancelContext(activeCtx.id), "Context cancelled.")
                          }
                        >
                          Cancel context
                        </Button>
                      </div>
                    </div>
                  )}

                  {isCtxForThisStation && activeCtx.status === "ready" && (
                    <div className="rounded-lg border border-success/40 bg-success-soft p-4 space-y-3">
                      <p className="text-sm font-medium text-success-foreground">
                        Ready to scan! Present fabric bundle RFID card at Station 1 (Fabric
                        Receiving).
                      </p>
                      <div className="space-y-2">
                        <Field
                          label="Card UID (Hex)"
                          htmlFor="rcv-uid"
                          hint="Enter tag UID to simulate tap."
                        >
                          <Input
                            id="rcv-uid"
                            value={scanUid}
                            onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                            className="font-mono bg-card"
                            placeholder="e.g. 04E1F2A3"
                          />
                        </Field>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            disabled={pending || !scanUid.trim()}
                            onClick={() =>
                              void run(
                                (c) => c.resolveRfidScan(scanUid.trim()),
                                (outcome) =>
                                  outcome.resolution === "accepted"
                                    ? `Card ${outcome.uid} bound to ${outcome.subjectId}`
                                    : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                              )
                            }
                          >
                            <ScanLine className="size-4" /> Simulate RFID Scan
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              void run((c) => c.cancelContext(activeCtx.id), "Context cancelled.")
                            }
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isCtxForThisStation && (
                    <p className="text-sm text-muted-foreground">
                      No pending action context. Click &ldquo;Prepare: Assign bundle card&rdquo; to
                      begin a scan session.
                    </p>
                  )}
                </div>
              </Section>
            </div>
          </div>
        );
      }}
    </Loadable>
  );
}
