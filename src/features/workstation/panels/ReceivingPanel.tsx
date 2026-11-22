import { useState } from "react";
import { CheckCircle2, Radio, ScanLine, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";
import { ReceiveLotDialog } from "@/features/materials/LotsView";

function generateFreshUid(): string {
  return "04" + Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
}

export function ReceivingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qLots = useWtQuery(["lots"], (c) => c.listLots(), { refetchInterval: 3000 });
  const [selectedLotId, setSelectedLotId] = useState("");
  const [scanUid, setScanUid] = useState("04E1F2A3");

  const isReceivingStaff = me.role === "M" || me.department === "receiving" || me.department === "raw-store";

  return (
    <Loadable query={qLots}>
      {(lots) => {
        const unassignedLots = lots.filter((l) => !l.rfidUid);
        const lotId =
          selectedLotId && lots.some((l) => l.id === selectedLotId)
            ? selectedLotId
            : unassignedLots[0]?.id || lots[0]?.id || "";
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
                actions={
                  isReceivingStaff ? (
                    <ReceiveLotDialog
                      triggerLabel="+ New Fabric Roll"
                      onSuccess={(newId) => setSelectedLotId(newId)}
                    />
                  ) : undefined
                }
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
                        options={[
                          ...unassignedLots.map((l) => ({
                            value: l.id,
                            label: `[NEW · Card Pending] ${l.id} — ${l.material} (${l.balanceQty} ${l.unit ?? "m"})`,
                          })),
                          ...lots
                            .filter((l) => !!l.rfidUid)
                            .map((l) => ({
                              value: l.id,
                              label: `${l.id} — ${l.material} (${l.balanceQty} ${l.unit ?? "m"} · UID: ${l.rfidUid})`,
                            })),
                        ]}
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
                      <div className="inline-flex items-center gap-1.5">
                        {activeCtx.status === "ready" && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                          </span>
                        )}
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
                      </div>
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
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            disabled={pending || !scanUid.trim()}
                            onClick={() =>
                              void run(
                                (c) => c.resolveRfidScan(scanUid.trim()),
                                (outcome) => {
                                  if (outcome.resolution === "accepted") {
                                    setScanUid(generateFreshUid());
                                    return `Card ${outcome.uid} bound to ${outcome.subjectId}!`;
                                  }
                                  return `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`;
                                },
                              )
                            }
                          >
                            <ScanLine className="size-4 mr-1.5" /> Simulate RFID Scan
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={pending}
                            onClick={() => setScanUid(generateFreshUid())}
                          >
                            <Sparkles className="size-3 mr-1" /> Generate Fresh UID
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

            {/* Warehouse Fabric Lots Table */}
            <Section
              title="Registered Fabric Lots & Bundle Card Status"
              description="Inventory summary of raw fabric lots and assigned Station 1 bundle cards."
            >
              <DataTable
                rows={lots}
                rowKey={(l) => l.id}
                empty="No fabric lots recorded."
                columns={[
                  {
                    header: "Lot Code",
                    cell: (l) => <IdLink href={paths.lot(l.id)} id={l.id} />,
                  },
                  {
                    header: "Fabric Material",
                    cell: (l) => (
                      <div>
                        <p className="font-medium text-xs sm:text-sm">{l.material}</p>
                        <p className="text-[11px] text-muted-foreground">Ref: {l.supplierRef}</p>
                      </div>
                    ),
                  },
                  {
                    header: "Stock Balance",
                    cell: (l) => (
                      <span className="font-semibold tabular-nums text-xs">
                        {l.balanceQty} / {l.receivedQty} {l.unit ?? "m"}
                      </span>
                    ),
                  },
                  {
                    header: "Bundle Card (Station 1)",
                    cell: (l) =>
                      l.rfidUid ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                          <Radio className="size-3" /> {l.rfidUid}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic bg-muted px-2 py-0.5 rounded">
                          Unassigned
                        </span>
                      ),
                  },
                  {
                    header: "Incoming QC",
                    cell: (l) => <StatusBadge status={l.status} />,
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
