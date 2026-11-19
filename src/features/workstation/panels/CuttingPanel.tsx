import { useState } from "react";
import { ArrowRight, CheckCircle2, Layers, Radio, RotateCcw, ScanLine, Scissors, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";

function generateFreshUid(): string {
  return "04" + Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
}

export function CuttingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [consumedQty, setConsumedQty] = useState("2.0");
  const [wasteQty, setWasteQty] = useState("0.1");
  const [size, setSize] = useState("M");
  const [scanUid, setScanUid] = useState("04B1C2D3");

  const isCuttingStaff = me.role === "M" || me.department === "cutting";
  const source = stationData.cuttingSourceSelection;
  const activeCtx = stationData.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === "cutting";

  const orderId = selectedOrderId || source?.orderId || "";
  const qOrderDetail = useWtQuery(["order", orderId], (c) =>
    orderId ? c.getOrder(orderId) : Promise.resolve(null),
  );
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  return (
    <Loadable query={qOrders}>
      {(orders) => (
        <Loadable query={qLots}>
          {(lots) => {
            const approvedOrders = orders.filter(
              (o) =>
                o.status === "approved" || o.status === "in-progress" || o.status === "planned",
            );
            const orderId = selectedOrderId || source?.orderId || approvedOrders[0]?.id || "";
            const currentOrder = orders.find((o) => o.id === orderId);
            const availableIssues = qOrderDetail.data?.issues ?? [];
            const activeIssueId = selectedIssueId || availableIssues[0]?.id || "";
            const activeIssue = availableIssues.find((i) => i.id === activeIssueId);
            const activeIssueLot = lots.find((l) => l.id === activeIssue?.lotId);
            const orderGarments = (qGarments.data ?? []).filter(
              (g) => g.orderId === (source?.orderId ?? orderId),
            );

            return (
              <div className="space-y-6">
                {/* Mode 1: Confirmed source banner if active */}
                {source && source.active ? (
                  <section className="rounded-lg border-2 border-primary/50 bg-card p-5 space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="size-5 text-success" />
                            <h3 className="font-semibold text-lg">Active Confirmed Fabric Source</h3>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Selection ID: <span className="wt-id">{source.id}</span> · Fabric
                            confirmed by RFID scan
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            if (activeCtx) {
                              void run((c) => c.cancelContext(activeCtx.id));
                            }
                            setSelectedOrderId("");
                          }}
                        >
                          <RotateCcw className="size-4 mr-1" /> Change Fabric Source
                        </Button>
                      </div>

                      <div className="rounded-md border bg-muted/30 p-3">
                        <KeyValue
                          items={[
                            {
                              label: "Production Order",
                              value: `${source.orderId} (${currentOrder?.product ?? "Order"})`,
                            },
                            {
                              label: "Material Issue",
                              value: <span className="wt-id">{source.issueId}</span>,
                            },
                            {
                              label: "Fabric Lot",
                              value: <span className="wt-id">{source.lotId}</span>,
                            },
                            { label: "Consumption Per Garment", value: `${source.consumedQty} m` },
                            { label: "Estimated Waste", value: `${source.wasteQty} m` },
                            {
                              label: "Status",
                              value: <StatusBadge status="Source active" tone="success" />,
                            },
                          ]}
                        />
                      </div>

                      {/* Production Progress Bar */}
                      {currentOrder && (
                        <div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-muted-foreground">
                              Cutting Progress for Order {currentOrder.id}:
                            </span>
                            <span className="font-bold tabular-nums">
                              {orderGarments.length} / {currentOrder.plannedQty} cut (
                              {Math.min(
                                100,
                                Math.round(
                                  (orderGarments.length / Math.max(1, currentOrder.plannedQty)) * 100,
                                ),
                              )}
                              %)
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{
                                width: `${Math.min(100, Math.round((orderGarments.length / Math.max(1, currentOrder.plannedQty)) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Sub-mode: Assign Next Garment Tag */}
                      <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-sm">Assign Next Garment Tag</h4>
                            <p className="text-xs text-muted-foreground">
                              Scan a fresh, unassigned RFID card for each cut panel set. Creates
                              garment and binds actual material lineage.
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Garment Size" htmlFor="cut-size">
                            <NativeSelect
                              id="cut-size"
                              value={size}
                              onChange={setSize}
                              options={["S", "M", "L", "XL"].map((s) => ({
                                value: s,
                                label: `Size ${s}`,
                              }))}
                            />
                          </Field>

                          <div className="flex items-end">
                            <Button
                              className="w-full sm:w-auto"
                              disabled={
                                pending ||
                                !isCuttingStaff ||
                                (isCtxForThisStation && activeCtx.status !== "expired")
                              }
                              onClick={() =>
                                void run(
                                  (c) =>
                                    c.prepareActionContext("cutting", "bind_garment_tag", {
                                      kind: "bind_garment_tag",
                                      cuttingSourceSelectionId: source.id,
                                      orderId: source.orderId,
                                      size,
                                    }),
                                  "Prepared context for garment tag assignment.",
                                )
                              }
                            >
                              <Radio className="size-4 mr-1.5" /> Prepare Next Garment Card
                            </Button>
                          </div>
                        </div>
                      </div>
                    </section>
                ) : (
                  /* Mode 2: Select Fabric Source */
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Section
                      title="Step 1: Select Fabric Source"
                      description="Select an approved order and issued fabric bundle, then scan the lot card to confirm source."
                    >
                      {approvedOrders.length === 0 ? (
                        <EmptyState title="No approved production orders available" />
                      ) : (
                        <div className="space-y-4">
                          <Field label="Production Order" htmlFor="cut-order">
                            <NativeSelect
                              id="cut-order"
                              value={orderId}
                              onChange={(v) => {
                                setSelectedOrderId(v);
                                setSelectedIssueId("");
                              }}
                              options={approvedOrders.map((o) => ({
                                value: o.id,
                                label: `${o.id} — ${o.product} (${o.plannedQty} planned)`,
                              }))}
                            />
                          </Field>

                          {(() => {
                            const availableIssues = qOrderDetail.data?.issues ?? [];
                            const activeIssueId = selectedIssueId || availableIssues[0]?.id || "";
                            const activeIssue = availableIssues.find((i) => i.id === activeIssueId);

                            return (
                              <>
                                <Field
                                  label="Material Input (Issued Fabric)"
                                  htmlFor="cut-issue"
                                  hint={
                                    activeIssue
                                      ? `Allocated from Lot ${activeIssue.lotId} · ${activeIssue.qty} m issued`
                                      : undefined
                                  }
                                >
                                  {availableIssues.length === 0 ? (
                                    <div className="rounded-md border border-warning/40 bg-warning-soft p-2.5 text-xs text-warning-foreground">
                                      No material has been issued to {orderId} yet. Allocate fabric at Station 2 (Fabric Issue) first.
                                    </div>
                                  ) : (
                                    <NativeSelect
                                      id="cut-issue"
                                      value={activeIssueId}
                                      onChange={(v) => setSelectedIssueId(v)}
                                      options={availableIssues.map((i) => ({
                                        value: i.id,
                                        label: `${i.id} — ${i.qty} m from Lot ${i.lotId}`,
                                      }))}
                                    />
                                  )}
                                </Field>

                                <div className="grid grid-cols-2 gap-3">
                                  <Field label="Fabric Consumed (m)" htmlFor="cut-cons">
                                    <Input
                                      id="cut-cons"
                                      type="number"
                                      min="0.1"
                                      step="0.1"
                                      value={consumedQty}
                                      onChange={(e) => setConsumedQty(e.target.value)}
                                    />
                                  </Field>
                                  <Field label="Fabric Waste (m)" htmlFor="cut-waste">
                                    <Input
                                      id="cut-waste"
                                      type="number"
                                      min="0"
                                      step="0.05"
                                      value={wasteQty}
                                      onChange={(e) => setWasteQty(e.target.value)}
                                    />
                                  </Field>
                                </div>

                                {!isCuttingStaff && (
                                  <ScopeNote>
                                    Only cutting department staff or managers can prepare cutting sources.
                                  </ScopeNote>
                                )}

                                {isCuttingStaff && (
                                  <div className="pt-2">
                                    <Button
                                      disabled={
                                        pending ||
                                        !currentOrder ||
                                        availableIssues.length === 0 ||
                                        !activeIssueId ||
                                        Number(consumedQty) <= 0 ||
                                        (isCtxForThisStation && activeCtx.status !== "expired")
                                      }
                                      onClick={() =>
                                        void run(
                                          (c) =>
                                            c.prepareActionContext("cutting", "select_cutting_source", {
                                              kind: "select_cutting_source",
                                              orderId,
                                              issueId: activeIssueId,
                                              consumedQty: Number(consumedQty),
                                              wasteQty: Number(wasteQty),
                                            }),
                                          "Prepared cutting source confirmation.",
                                        )
                                      }
                                    >
                                      <Radio className="size-4" /> Prepare: Select Fabric Source
                                    </Button>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </Section>

                    <Section
                      title="Reader Action & Scan Lifecycle"
                      description="Scan the fabric bundle card to confirm source input."
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
                              Context <span className="wt-id">{activeCtx.id}</span> created.
                              Awaiting reader board acknowledgement.
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
                                  void run(
                                    (c) => c.cancelContext(activeCtx.id),
                                    "Context cancelled.",
                                  )
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
                              Ready to scan! Present the fabric bundle card at Station 3 (Cutting).
                            </p>
                            <div className="space-y-2">
                              <Field label="Fabric Bundle Card UID" htmlFor="cut-src-uid">
                                <Input
                                  id="cut-src-uid"
                                  value={scanUid}
                                  onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                  className="font-mono bg-card"
                                  placeholder="e.g. 04A1B2C3"
                                />
                              </Field>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <Button
                                    disabled={pending || !scanUid.trim()}
                                    onClick={() =>
                                      void run(
                                        (c) => c.resolveRfidScan(scanUid.trim()),
                                        (outcome) =>
                                          outcome.resolution === "accepted"
                                            ? `Fabric source confirmed! Ready to assign garment tags.`
                                            : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                      )
                                    }
                                  >
                                    <ScanLine className="size-4 mr-1.5" /> Simulate Scan
                                  </Button>
                                  {activeIssueLot?.rfidUid && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      disabled={pending}
                                      onClick={() => setScanUid(activeIssueLot.rfidUid!)}
                                    >
                                      Pre-fill Lot Card ({activeIssueLot.rfidUid})
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
                            No pending source selection. Select an order and click &ldquo;Prepare:
                            Select Fabric Source&rdquo;.
                          </p>
                        )}
                      </div>
                    </Section>
                  </div>
                )}

                {/* Reader Scan Lifecycle for Garment Tag Binding */}
                {source && source.active && (
                  <Section
                    title="Station 3 Reader & Tag Assignment"
                    description="Hardware lifecycle: prepare tag assignment → board ack → scan fresh card → garment created."
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
                            Ready to scan! Present a FRESH, UNBOUND RFID card for the cut panel set.
                          </p>
                          <div className="space-y-2">
                            <Field
                              label="Fresh Garment Card UID"
                              htmlFor="cut-tag-uid"
                              hint="Must be an unassigned card UID."
                            >
                              <Input
                                id="cut-tag-uid"
                                value={scanUid}
                                onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                className="font-mono bg-card"
                                placeholder="e.g. 04FF1122"
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
                                        return `Garment ${outcome.garmentCode ?? outcome.subjectId} created! Product: ${outcome.productName}`;
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
                          Ready to assign tags. Click &ldquo;Prepare Next Garment Card&rdquo; above.
                        </p>
                      )}
                    </div>
                  </Section>
                )}

                {/* Garments Cut for this Active Order */}
                {source && source.active && (
                  <Section
                    title={`Garments Cut for Order ${source.orderId}`}
                    description="Individually tagged outputs with actual material lineage from confirmed fabric source."
                  >
                    <DataTable
                      rows={orderGarments}
                      rowKey={(g) => g.id}
                      empty="No garments cut yet for this order."
                      columns={[
                        {
                          header: "Garment Code",
                          cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                        },
                        {
                          header: "Product & Size",
                          cell: (g) => (
                            <div>
                              <span className="font-medium text-xs sm:text-sm">{g.productName}</span>
                              {g.size && (
                                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
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
                              <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                                <Radio className="size-3" /> {g.rfidUid}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Unassigned</span>
                            ),
                        },
                        {
                          header: "Physical Stage",
                          cell: (g) => <StatusBadge status={g.stage} />,
                        },
                        {
                          header: "Quality Clearance",
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
                )}
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}
