import { useState } from "react";
import { Radio, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { KeyValue, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

export function IssuePanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [qty, setQty] = useState("4");
  const [scanUid, setScanUid] = useState("");

  const isStoreStaff =
    me.role === "M" || me.department === "raw-store" || me.department === "receiving";

  return (
    <Loadable query={qOrders}>
      {(orders) => (
        <Loadable query={qLots}>
          {(lots) => {
            const approvedOrders = orders.filter(
              (o) =>
                o.status === "approved" || o.status === "in-progress" || o.status === "planned",
            );
            const orderId = selectedOrderId || approvedOrders[0]?.id || "";
            const currentOrder = approvedOrders.find((o) => o.id === orderId);

            const acceptedLots = lots.filter((l) => l.status === "accepted" && l.balanceQty > 0);
            const lotId = selectedLotId || acceptedLots[0]?.id || "";
            const currentLot = acceptedLots.find((l) => l.id === lotId);

            const activeCtx = stationData.activeContext;
            const isCtxForThisStation = activeCtx && activeCtx.stationCode === "fabric_issue";

            return (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Section
                    title="Fabric Issue Allocation"
                    description="Select an approved production order and fabric quantity before presenting the bundle card."
                  >
                    {approvedOrders.length === 0 ? (
                      <EmptyState title="No active or approved production orders" />
                    ) : acceptedLots.length === 0 ? (
                      <EmptyState title="No accepted fabric lots with available stock" />
                    ) : (
                      <div className="space-y-4">
                        <Field label="Production Order" htmlFor="iss-order">
                          <NativeSelect
                            id="iss-order"
                            value={orderId}
                            onChange={(v) => setSelectedOrderId(v)}
                            options={approvedOrders.map((o) => ({
                              value: o.id,
                              label: `${o.id} — ${o.product} (${o.plannedQty} pcs · ${o.status})`,
                            }))}
                          />
                        </Field>

                        <Field label="Source Fabric Lot" htmlFor="iss-lot">
                          <NativeSelect
                            id="iss-lot"
                            value={lotId}
                            onChange={(v) => setSelectedLotId(v)}
                            options={acceptedLots.map((l) => ({
                              value: l.id,
                              label: `${l.id} — ${l.material} (Available: ${l.balanceQty} ${l.unit ?? "m"}${l.rfidUid ? ` · UID: ${l.rfidUid}` : " [NO CARD]"})`,
                            }))}
                          />
                        </Field>

                        <Field label="Issue Quantity (meters)" htmlFor="iss-qty">
                          <Input
                            id="iss-qty"
                            type="number"
                            min="0.1"
                            max={currentLot?.balanceQty ?? 100}
                            step="0.1"
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                          />
                        </Field>

                        {currentLot && currentOrder && (
                          <div className="rounded-md border bg-muted/40 p-3">
                            <KeyValue
                              items={[
                                {
                                  label: "Selected Order",
                                  value: `${currentOrder.id} (${currentOrder.product})`,
                                },
                                { label: "Fabric Material", value: currentLot.material },
                                {
                                  label: "Available Lot Stock",
                                  value: `${currentLot.balanceQty} ${currentLot.unit ?? "m"}`,
                                },
                                { label: "Card Bound", value: currentLot.rfidUid ?? "Unbound" },
                              ]}
                            />
                          </div>
                        )}

                        {!isStoreStaff && (
                          <ScopeNote>
                            Only raw material store staff or managers can issue fabric.
                          </ScopeNote>
                        )}

                        {isStoreStaff && (
                          <div className="pt-2">
                            <Button
                              disabled={
                                pending ||
                                !currentOrder ||
                                !currentLot ||
                                Number(qty) <= 0 ||
                                Number(qty) > (currentLot?.balanceQty ?? 0) ||
                                (isCtxForThisStation && activeCtx.status !== "expired")
                              }
                              onClick={() => {
                                // Default scanUid helper to the lot's actual card UID if bound
                                if (currentLot?.rfidUid) setScanUid(currentLot.rfidUid);
                                void run(
                                  (c) =>
                                    c.prepareActionContext("fabric_issue", "confirm_issue", {
                                      kind: "confirm_issue",
                                      lotId,
                                      orderId,
                                      qty: Number(qty),
                                    }),
                                  `Prepared issue context: ${qty} m from ${lotId} to ${orderId}.`,
                                );
                              }}
                            >
                              <Radio className="size-4" /> Prepare: Issue Fabric
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Section>

                  <Section
                    title="Reader Action & Scan Lifecycle"
                    description="Scan the physical fabric bundle's RFID card at Station 2 (Fabric Issue)."
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
                            Ready to scan! Present the fabric bundle card ({currentLot?.id}) at
                            Station 2.
                          </p>
                          <div className="space-y-2">
                            <Field
                              label="Bundle Card UID"
                              htmlFor="iss-uid"
                              hint={currentLot?.rfidUid ? `Bundle RFID: ${currentLot.rfidUid}` : "Enter tag UID to simulate tap."}
                            >
                              <Input
                                id="iss-uid"
                                value={scanUid}
                                onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                className="font-mono bg-card"
                                placeholder={currentLot?.rfidUid ?? "e.g. 04A1B2C3"}
                              />
                            </Field>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <Button
                                disabled={pending || !(scanUid.trim() || currentLot?.rfidUid)}
                                onClick={() => {
                                  const targetUid = scanUid.trim() || currentLot?.rfidUid || "";
                                  void run(
                                    (c) => c.resolveRfidScan(targetUid),
                                    (outcome) =>
                                      outcome.resolution === "accepted"
                                        ? `Fabric issue confirmed! ${qty} m allocated to order ${orderId}.`
                                        : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                  );
                                }}
                              >
                                <ScanLine className="size-4 mr-1.5" /> Simulate RFID Scan
                              </Button>
                              {currentLot?.rfidUid && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={pending}
                                  onClick={() => setScanUid(currentLot.rfidUid!)}
                                >
                                  Pre-fill Bundle Card ({currentLot.rfidUid})
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={() =>
                                  void run(
                                    (c) => c.cancelContext(activeCtx.id),
                                    "Context cancelled.",
                                  )
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
                          No pending issue action. Select an order and quantity, then click
                          &ldquo;Prepare: Issue Fabric&rdquo;.
                        </p>
                      )}
                    </div>
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
