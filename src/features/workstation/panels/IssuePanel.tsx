import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  Package,
  Radio,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { MaterialLot, ProductionOrder, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode } from "@/lib/data/provider";
import { useMe } from "@/features/shared/useMe";
import { PlanOrderDialog } from "@/features/production/OrdersView";

function getRequiredFabric(order: ProductionOrder): number {
  return Math.round(order.plannedQty * 2.0 * 10) / 10;
}

export function IssuePanel({
  stationData,
  headerActions,
}: {
  stationData?: RfidStationData | undefined;
  headerActions?: React.ReactNode | undefined;
}) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [scanUid, setScanUid] = useState<string>("");
  const [queueTab, setQueueTab] = useState<"pending" | "issued">("pending");
  // Only show scan feedback (error or success) after a scan occurs in this session, never on screen arrival
  const [activeOutcome, setActiveOutcome] = useState<ScanOutcome | null>(null);
  const lastSeenScanAt = useRef<string | null>(stationData?.lastScanOutcome?.at ?? null);
  const scannerRef = useRef<HTMLDivElement>(null);

  // Listen for new hardware scan arrivals from Station 2 reader
  useEffect(() => {
    const incoming = stationData?.lastScanOutcome;
    if (!incoming || !incoming.at) return;
    if (incoming.at !== lastSeenScanAt.current) {
      lastSeenScanAt.current = incoming.at;
      setActiveOutcome(incoming);
    }
  }, [stationData?.lastScanOutcome]);

  const isStoreStaff =
    me.role === "M" || me.department === "raw-store" || me.username === "rawstore.demo";
  const isLive = getDataMode() === "live";

  const activeCtx = stationData?.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === "fabric_issue";
  const lastOutcome = activeOutcome;
  const showFeedback = Boolean(activeOutcome);

  return (
    <Loadable query={qOrders}>
      {(orders) => (
        <Loadable query={qLots}>
          {(lots) => {
            // Pending orders: approved/planned orders awaiting fabric allocation
            const pendingOrders = orders
              .filter(
                (o) =>
                  (o.status === "approved" || o.status === "planned") &&
                  (!o.lotCodes || o.lotCodes.length === 0) &&
                  (!o.issues || o.issues.length === 0),
              )
              .sort((a, b) => {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
              });

            // Issued orders: already have fabric issued
            const issuedOrders = orders.filter(
              (o) =>
                (o.lotCodes && o.lotCodes.length > 0) ||
                (o.issues && o.issues.length > 0) ||
                (o.status === "in-progress" && (o.lotIds?.length ?? 0) > 0),
            );

            const displayedOrders = queueTab === "pending" ? pendingOrders : issuedOrders;

            // Active target order is either explicitly selected, or context order, or first pending order (only in pending queue)
            const targetOrderId =
              queueTab === "issued"
                ? ""
                : selectedOrderId === "__none__"
                  ? ""
                  : selectedOrderId ||
                    (activeCtx?.payload && (activeCtx.payload as any).orderId) ||
                    pendingOrders[0]?.id ||
                    "";

            const targetOrder = orders.find((o) => o.id === targetOrderId);
            const targetRequiredFabric = targetOrder ? getRequiredFabric(targetOrder) : 8.0;

            // Handle target order selection and arm context
            const handleSelectOrder = (order: ProductionOrder) => {
              setSelectedOrderId(order.id);
              setTimeout(() => {
                scannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
              const requiredQty = getRequiredFabric(order);
              void run(
                async (c) => {
                  const ctxId = await c.prepareActionContext("fabric_issue", "confirm_issue", {
                    kind: "confirm_issue",
                    orderId: order.id,
                    qty: requiredQty,
                  });
                  if (ctxId) {
                    await c.acknowledgeContext(ctxId);
                  }
                  return ctxId;
                },
                `Armed Scanner 2 for ${order.id} (${requiredQty} m required). Ready to scan bundle tag.`,
              );
            };

            const handleDeselectOrder = () => {
              setSelectedOrderId("__none__");
              if (activeCtx) {
                void run((c) => c.cancelContext(activeCtx.id), "Order deselected. Scanner 2 disarmed.");
              }
            };

            const handleOrderCreated = (newOrderId: string) => {
              setSelectedOrderId(newOrderId);
              void qOrders.refetch();
              setTimeout(() => {
                scannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
              void run(
                async (c) => {
                  const ctxId = await c.prepareActionContext("fabric_issue", "confirm_issue", {
                    kind: "confirm_issue",
                    orderId: newOrderId,
                    qty: 8.0,
                  });
                  if (ctxId) {
                    await c.acknowledgeContext(ctxId);
                  }
                  return ctxId;
                },
                `Order ${newOrderId} created and armed for Scanner 2. Ready to scan bundle tag!`,
              );
            };

            // Handle scan execution (simulation or polling hardware scan on Scanner 2 / GPIO 12)
            const handleScan = (uidToScan?: string) => {
              const targetUid = (uidToScan || scanUid).trim();
              if (targetUid) {
                void run(
                  async (c) => {
                    // Ensure active context exists and is acknowledged for target order before scan
                    if (
                      targetOrderId &&
                      (!activeCtx ||
                        (activeCtx.payload as any)?.orderId !== targetOrderId ||
                        activeCtx.status !== "ready")
                    ) {
                      try {
                        const ctxId = await c.prepareActionContext("fabric_issue", "confirm_issue", {
                          kind: "confirm_issue",
                          orderId: targetOrderId,
                          qty: targetRequiredFabric,
                        });
                        if (ctxId) {
                          await c.acknowledgeContext(ctxId);
                        }
                      } catch {
                        // context already armed or prepared
                      }
                    }
                    const outcome = await c.resolveRfidScan(targetUid);
                    lastSeenScanAt.current = outcome.at;
                    setActiveOutcome(outcome);
                    return outcome;
                  },
                  (outcome) => {
                    setScanUid("");
                    void qOrders.refetch();
                    void qLots.refetch();
                    return outcome.resolution === "accepted"
                      ? `Bundle linked to Order → Issued to Cutting (${outcome.subjectId} → ${outcome.orderId ?? targetOrderId})`
                      : `${outcome.rejectReason ?? outcome.resolution}`;
                  },
                );
                return;
              }

              // Polling loop to wait for hardware scan from ESP32 on Reader 1 (GPIO 12)
              void run(
                async (c) => {
                  if (
                    targetOrderId &&
                    (!activeCtx ||
                      (activeCtx.payload as any)?.orderId !== targetOrderId ||
                      activeCtx.status !== "ready")
                  ) {
                    try {
                      const ctxId = await c.prepareActionContext("fabric_issue", "confirm_issue", {
                        kind: "confirm_issue",
                        orderId: targetOrderId,
                        qty: targetRequiredFabric,
                      });
                      if (ctxId) {
                        await c.acknowledgeContext(ctxId);
                      }
                    } catch {
                      // context already armed or prepared
                    }
                  }
                  const startTime = Date.now();
                  while (Date.now() - startTime < 35000) {
                    const data = await c.getRfidStationData("fabric_issue");
                    if (data.lastScanOutcome) {
                      const outcomeTime = new Date(data.lastScanOutcome.at).getTime();
                      if (
                        outcomeTime >= startTime - 2000 &&
                        data.lastScanOutcome.at !== lastSeenScanAt.current
                      ) {
                        lastSeenScanAt.current = data.lastScanOutcome.at;
                        setActiveOutcome(data.lastScanOutcome);
                        if (data.lastScanOutcome.resolution === "accepted") {
                          void qOrders.refetch();
                          void qLots.refetch();
                          return data.lastScanOutcome;
                        }
                        throw new Error(
                          data.lastScanOutcome.rejectReason ??
                            "Hardware scan on Scanner 2 was rejected by workstation rules.",
                        );
                      }
                    }

                    const freshOrders = await c.listOrders();
                    const updatedOrder = freshOrders.find((o) => o.id === targetOrderId);
                    if (
                      updatedOrder &&
                      (updatedOrder.status === "in-progress" || updatedOrder.status === "completed")
                    ) {
                      void qOrders.refetch();
                      void qLots.refetch();
                      const fallbackOutcome: ScanOutcome = {
                        resolution: "accepted",
                        uid: "PHYSICAL_CARD",
                        orderId: updatedOrder.id,
                        subjectId: "FAB-BUNDLE",
                        at: new Date().toISOString(),
                      };
                      lastSeenScanAt.current = fallbackOutcome.at;
                      setActiveOutcome(fallbackOutcome);
                      return fallbackOutcome;
                    }

                    await new Promise((resolve) => setTimeout(resolve, 1000));
                  }

                  throw new Error(
                    "No hardware card scan detected on Scanner 2 (GPIO 12) within 35 seconds. Please tap your RFID card and try again.",
                  );
                },
                (outcome) => {
                  setScanUid("");
                  void qOrders.refetch();
                  void qLots.refetch();
                  if (outcome?.resolution === "accepted") {
                    return `Physical card ${outcome.uid} caught and linked to Order ${outcome.orderId ?? targetOrderId} → Issued to Cutting!`;
                  }
                  return `Scan outcome: ${outcome?.rejectReason ?? outcome?.resolution ?? "Completed"}`;
                },
              );
            };

            return (
              <div className="space-y-6">
                <PageHeader
                  title="Raw Store Workstation"
                  description="Station 2 · Fabric allocation and bundle card enrollment for production cutting."
                  actions={headerActions}
                />

                {/* Active Production Orders Queue */}
                <Section
                  title={
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setQueueTab("pending")}
                          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                            queueTab === "pending"
                              ? "bg-card text-foreground shadow-xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Pending Fabric ({pendingOrders.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setQueueTab("issued")}
                          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                            queueTab === "issued"
                              ? "bg-card text-foreground shadow-xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Already Issued ({issuedOrders.length})
                        </button>
                      </div>
                      <PlanOrderDialog
                        triggerLabel="+ New Order"
                        onSuccess={handleOrderCreated}
                      />
                    </div>
                  }
                >
                      {displayedOrders.length === 0 ? (
                        <EmptyState
                          title={
                            queueTab === "pending"
                              ? "All approved orders have been issued fabric"
                              : "No orders with issued fabric yet"
                          }
                        >
                          <div className="space-y-3 text-center">
                            <p className="text-sm text-muted-foreground">
                              {queueTab === "pending"
                                ? "No production orders are currently awaiting fabric allocation. Approved orders will appear here automatically."
                                : "When bundles are scanned and issued at Scanner 2, completed orders will appear here."}
                            </p>
                            <div className="flex items-center justify-center gap-2">
                              {queueTab === "pending" && issuedOrders.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => setQueueTab("issued")}
                                >
                                  View Already Issued Orders ({issuedOrders.length})
                                </Button>
                              )}
                              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                                <AppLink href={paths.orders}>
                                  View All Orders in Planning
                                </AppLink>
                              </Button>
                            </div>
                          </div>
                        </EmptyState>
                      ) : (
                        <DataTable
                          rows={displayedOrders}
                          rowKey={(o) => o.id}
                          columns={[
                            {
                              header: "Order ID",
                              cell: (o) => (
                                <AppLink
                                  href={paths.order(o.id)}
                                  className="wt-id font-bold text-xs hover:underline text-primary"
                                >
                                  {o.id}
                                </AppLink>
                              ),
                            },
                            {
                              header: "Product & Style",
                              cell: (o) => (
                                <div>
                                  <p className="font-medium text-foreground text-xs">{o.product}</p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Style: {o.styleCode}
                                  </p>
                                </div>
                              ),
                            },
                            {
                              header: "Planned Output",
                              cell: (o) => (
                                <span className="font-semibold text-xs">{o.plannedQty} pcs</span>
                              ),
                            },
                            {
                              header: "Required Fabric",
                              cell: (o) => (
                                <span className="inline-flex items-center gap-1 rounded bg-accent/40 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                                  {getRequiredFabric(o)} m
                                </span>
                              ),
                            },
                            {
                              header: "Due Date",
                              cell: (o) => (
                                <span className="text-xs font-medium">
                                  {o.dueDate ? fmt.date(o.dueDate) : "—"}
                                </span>
                              ),
                            },
                            {
                              header: "Fabric Allocation",
                              cell: (o) => {
                                const hasIssued =
                                  (o.lotCodes && o.lotCodes.length > 0) ||
                                  (o.issues && o.issues.length > 0) ||
                                  (o.status === "in-progress" && (o.lotIds?.length ?? 0) > 0);
                                return hasIssued ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    <Check className="size-3" /> Issued ({o.lotCodes?.[0] || o.lotId || "Done"})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                    Awaiting Allocation
                                  </span>
                                );
                              },
                            },
                            {
                              header: "Workstation Action",
                              cell: (o) => {
                                const isTarget = o.id === targetOrderId;
                                const isArmed = Boolean(
                                  activeCtx &&
                                    activeCtx.stationCode === "fabric_issue" &&
                                    (activeCtx.payload as any)?.orderId === o.id &&
                                    activeCtx.status === "ready",
                                );
                                const isIssued =
                                  (o.lotCodes && o.lotCodes.length > 0) ||
                                  (o.issues && o.issues.length > 0) ||
                                  (o.status === "in-progress" && (o.lotIds?.length ?? 0) > 0);

                                if (isIssued && queueTab === "issued") {
                                  return (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-muted-foreground italic">
                                        Allocation complete
                                      </span>
                                      <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
                                        <AppLink href={paths.order(o.id)}>
                                          View Order →
                                        </AppLink>
                                      </Button>
                                    </div>
                                  );
                                }

                                return (
                                  <Button
                                    size="sm"
                                    variant={isArmed ? "default" : isTarget ? "secondary" : "outline"}
                                    className="h-7 text-xs gap-1"
                                    disabled={pending}
                                    onClick={() =>
                                      isTarget ? handleDeselectOrder() : handleSelectOrder(o)
                                    }
                                    title={isTarget ? "Click to deselect" : "Select order for fabric issue"}
                                  >
                                    {isArmed ? (
                                      <>
                                        <Check className="size-3" /> Ready / Armed
                                      </>
                                    ) : (
                                      <>
                                        <Radio className="size-3" /> Select for Issue
                                      </>
                                    )}
                                  </Button>
                                );
                              },
                            },
                          ]}
                        />
                      )}
                    </Section>

                    {/* Scanner 2 Interactive Card Tap & Fast RFID Interface (Active only for pending orders awaiting issue) */}
                    {queueTab === "pending" && (
                      <>
                        <div ref={scannerRef} className="scroll-mt-6">
                          <Section
                            title="Station 2 Scanner Simulation & Tap"
                            actions={
                              targetOrderId ? (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-muted-foreground">Order Target:</span>
                                  <span className="font-mono font-bold text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                                    {targetOrderId} ({targetRequiredFabric} m)
                                  </span>
                                  {activeCtx &&
                                    activeCtx.stationCode === "fabric_issue" &&
                                    (activeCtx.payload as any)?.orderId === targetOrderId &&
                                    activeCtx.status === "ready" && (
                                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        <Check className="size-3" /> Armed
                                      </span>
                                    )}
                                </div>
                              ) : undefined
                            }
                          >
                        <div className="space-y-4">
                          {/* Selected Target Order Details for Scan */}
                          {targetOrder ? (
                            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-xs">
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 pb-3">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Selected Order for Issue:
                                  </span>
                                  <span className="wt-id font-mono font-bold text-sm text-primary">
                                    {targetOrder.id}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                    <CheckCircle2 className="size-3.5" /> Ready for Scan
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs gap-1 border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                                    onClick={handleDeselectOrder}
                                  >
                                    <X className="size-3" /> Deselect
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground text-[11px] block">Product & Style</span>
                                  <p className="font-semibold text-foreground text-sm mt-0.5">{targetOrder.product}</p>
                                  <p className="text-[11px] font-mono text-muted-foreground">{targetOrder.styleCode}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground text-[11px] block">Planned Output</span>
                                  <p className="font-bold text-foreground text-sm mt-0.5">{targetOrder.plannedQty} pcs</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground text-[11px] block">Required Fabric</span>
                                  <p className="font-bold text-primary text-sm mt-0.5">{targetRequiredFabric} m</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground text-[11px] block">Due Date</span>
                                  <p className="font-semibold text-foreground text-sm mt-0.5">
                                    {targetOrder.dueDate ? fmt.date(targetOrder.dueDate) : "—"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center">
                              <p className="text-xs text-muted-foreground">
                                No order selected for fabric issue.
                              </p>
                              <p className="text-[11px] text-muted-foreground/80 mt-1">
                                Click <span className="font-semibold text-foreground">Select for Issue</span> on any order in the queue above to arm Scanner 2.
                              </p>
                            </div>
                          )}

                          <div className="space-y-2">
                          <Field
                            label="Bundle Card Tag UID"
                            htmlFor="s2-uid"
                            hint="Tap bundle card on Scanner 2 (GPIO 12), or enter UID to test manually."
                          >
                            <Input
                              id="s2-uid"
                              value={scanUid}
                              onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                              placeholder="e.g. BB4A0003 or tap physical card"
                              className="font-mono bg-card"
                            />
                          </Field>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              disabled={pending}
                              onClick={() => handleScan()}
                              className="gap-1.5"
                            >
                              {pending ? (
                                <>
                                  <span className="relative flex h-2.5 w-2.5 mr-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                                  </span>
                                  Awaiting Hardware Card Tap (Scanner 2)...
                                </>
                              ) : scanUid.trim() ? (
                                <>
                                  <ScanLine className="size-4" /> Simulate RFID Scan ({scanUid.trim()})
                                </>
                              ) : (
                                <>
                                  <Radio className="size-4" /> Catch Hardware Scan (Scanner 2)
                                </>
                              )}
                            </Button>
                            {scanUid && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={() => setScanUid("")}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Quick Pre-fill Test Chips for Demonstration (Mock Mode Only) */}
                        {!isLive && (
                          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              One-Click Test Cards:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {lots.map((l) => (
                                <Button
                                  key={l.id}
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-xs font-mono"
                                  disabled={pending || !l.rfidUid}
                                  onClick={() => {
                                    if (l.rfidUid) {
                                      setScanUid(l.rfidUid);
                                      handleScan(l.rfidUid);
                                    }
                                  }}
                                  title={`Status: ${l.status}, Balance: ${l.balanceQty}m`}
                                >
                                  {l.id} ({l.rfidUid ?? "NO-CARD"}) {l.status === "accepted" ? "✓" : "⏳"}
                                </Button>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs font-mono text-destructive border-destructive/30"
                                onClick={() => {
                                  setScanUid("04999999");
                                  handleScan("04999999");
                                }}
                                title="Unrecognised Card test"
                              >
                                04999999 (Unbound Card)
                              </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Clicking a card immediately sends it to Scanner 2 to test validation, duplicate prevention, and QC clearance guards.
                            </p>
                          </div>
                        )}
                      </div>
                    </Section>
                  </div>

                    {/* Live Scan Feedback Box */}
                    {showFeedback && lastOutcome && (
                      <div
                        className={`rounded-xl border p-4 text-xs shadow-xs transition-all duration-200 ${
                          lastOutcome.resolution === "accepted"
                            ? "border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-100"
                            : "border-rose-400/50 bg-rose-50 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {lastOutcome.resolution === "accepted" ? (
                            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                          ) : (
                            <XCircle className="size-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                          )}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p
                                className={`font-bold text-sm tracking-tight ${
                                  lastOutcome.resolution === "accepted"
                                    ? "text-emerald-900 dark:text-emerald-200"
                                    : "text-rose-900 dark:text-rose-200"
                                }`}
                              >
                                {lastOutcome.resolution === "accepted"
                                  ? "✓ Scan Accepted: Bundle Linked to Order → Issued to Cutting"
                                  : "✕ Scan Rejected at Station 2"}
                              </p>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[11px] font-mono ${
                                    lastOutcome.resolution === "accepted"
                                      ? "text-emerald-800/80 dark:text-emerald-300/80"
                                      : "text-rose-800/80 dark:text-rose-300/80"
                                  }`}
                                >
                                  {fmt.dateTime(lastOutcome.at)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveOutcome(null)}
                                  className={`inline-flex size-6 items-center justify-center rounded-full transition-colors cursor-pointer ${
                                    lastOutcome.resolution === "accepted"
                                      ? "text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-emerald-100"
                                      : "text-rose-700 hover:bg-rose-500/20 hover:text-rose-950 dark:text-rose-300 dark:hover:text-rose-100"
                                  }`}
                                  aria-label="Dismiss scan notification"
                                  title="Dismiss feedback"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            </div>

                            {lastOutcome.resolution === "accepted" ? (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-lg border border-emerald-500/20 bg-background/80 p-2.5 mt-2 text-foreground">
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                                    Order ID
                                  </span>
                                  <p className="font-bold wt-id">{lastOutcome.orderId ?? targetOrderId}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                                    Matched Lot ID
                                  </span>
                                  <p className="font-bold wt-id text-primary">{lastOutcome.lotCode ?? lastOutcome.subjectId}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                                    Issued Meterage
                                  </span>
                                  <p className="font-bold text-emerald-600 dark:text-emerald-400">{lastOutcome.issuedQty ?? targetRequiredFabric} m</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                                    Remaining Balance
                                  </span>
                                  <p className="font-bold">{lastOutcome.remainingBalance ?? 0} m</p>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1 pt-0.5">
                                <p className="font-semibold text-rose-700 dark:text-rose-300 text-xs">
                                  {lastOutcome.rejectReason ?? lastOutcome.resolution}
                                </p>
                                <p className="text-[11px] text-rose-950/80 dark:text-rose-200/85">
                                  Card UID scanned: <span className="font-mono font-bold text-foreground">{lastOutcome.uid}</span>. Target order {targetOrderId} remains open awaiting valid fabric roll.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}
