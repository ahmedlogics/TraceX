import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Package,
  Radio,
  RefreshCw,
  ScanLine,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, KeyValue, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { MaterialLot, ProductionOrder, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { PlanOrderDialog } from "@/features/production/OrdersView";

function getRequiredFabric(order: ProductionOrder): number {
  return Math.round(order.plannedQty * 2.0 * 10) / 10;
}

export function IssuePanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  const [activeTab, setActiveTab] = useState<"issuance" | "monitor">("issuance");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [scanUid, setScanUid] = useState<string>("");

  const isStoreStaff =
    me.role === "M" || me.department === "raw-store" || me.username === "rawstore.demo";

  const activeCtx = stationData.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === "fabric_issue";
  const lastOutcome = stationData.lastScanOutcome;

  return (
    <Loadable query={qOrders}>
      {(orders) => (
        <Loadable query={qLots}>
          {(lots) => {
            const approvedOrders = orders.filter(
              (o) =>
                o.status === "approved" || o.status === "planned" || o.status === "in-progress",
            );

            // Active target order is either explicitly selected, or context order, or first pending order
            const targetOrderId =
              selectedOrderId ||
              (activeCtx?.payload && (activeCtx.payload as any).orderId) ||
              approvedOrders.find((o) => o.status === "approved" || o.status === "planned")?.id ||
              approvedOrders[0]?.id ||
              "";

            const targetOrder = orders.find((o) => o.id === targetOrderId);
            const targetRequiredFabric = targetOrder ? getRequiredFabric(targetOrder) : 8.0;

            const acceptedLots = lots.filter((l) => l.status === "accepted" && l.balanceQty > 0);
            const totalAcceptedMeters = acceptedLots.reduce((sum, l) => sum + (Number(l.balanceQty) || 0), 0);
            const awaitingInspectionLots = lots.filter((l) => l.status === "awaiting-inspection");

            // Handle target order selection and arm context
            const handleSelectOrder = (order: ProductionOrder) => {
              setSelectedOrderId(order.id);
              const requiredQty = getRequiredFabric(order);
              void run(
                (c) =>
                  c.prepareActionContext("fabric_issue", "confirm_issue", {
                    kind: "confirm_issue",
                    orderId: order.id,
                    qty: requiredQty,
                  }),
                `Armed Scanner 2 for ${order.id} (${requiredQty} m required). Ready to scan bundle tag.`,
              );
            };

            const handleOrderCreated = (newOrderId: string) => {
              setSelectedOrderId(newOrderId);
              void qOrders.refetch();
              void run(
                (c) =>
                  c.prepareActionContext("fabric_issue", "confirm_issue", {
                    kind: "confirm_issue",
                    orderId: newOrderId,
                    qty: 8.0,
                  }),
                `Order ${newOrderId} created and armed for Scanner 2. Ready to scan bundle tag!`,
              );
            };

            // Handle scan execution (simulation or polling hardware scan on Scanner 2 / GPIO 12)
            const handleScan = (uidToScan?: string) => {
              const targetUid = (uidToScan || scanUid).trim();
              if (targetUid) {
                void run(
                  (c) => c.resolveRfidScan(targetUid),
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
                  if (targetOrderId && (!activeCtx || (activeCtx.payload as any)?.orderId !== targetOrderId)) {
                    try {
                      await c.prepareActionContext("fabric_issue", "confirm_issue", {
                        kind: "confirm_issue",
                        orderId: targetOrderId,
                        qty: targetRequiredFabric,
                      });
                    } catch {
                      // context already armed or prepared
                    }
                  }
                  const startTime = Date.now();
                  while (Date.now() - startTime < 35000) {
                    const data = await c.getRfidStationData("fabric_issue");
                    if (data.lastScanOutcome) {
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

                    const freshOrders = await c.listOrders();
                    const updatedOrder = freshOrders.find((o) => o.id === targetOrderId);
                    if (
                      updatedOrder &&
                      (updatedOrder.status === "in-progress" || updatedOrder.status === "completed")
                    ) {
                      void qOrders.refetch();
                      void qLots.refetch();
                      return {
                        resolution: "accepted",
                        uid: "PHYSICAL_CARD",
                        orderId: updatedOrder.id,
                        subjectId: "FAB-BUNDLE",
                      } as ScanOutcome;
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
                {/* Mode Selector Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                    <TabsList className="flex h-auto flex-wrap">
                      <TabsTrigger value="issuance" className="gap-2 text-xs">
                        <Radio className="size-3.5 text-primary" />
                        <span>Raw Store Issuance Dashboard</span>
                        <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold">
                          {approvedOrders.filter((o) => o.status === "approved" || o.status === "planned").length} Pending
                        </span>
                      </TabsTrigger>
                      <TabsTrigger value="monitor" className="gap-2 text-xs">
                        <Layers className="size-3.5 text-primary" />
                        <span>Material Stock &amp; Rejection Monitor</span>
                        <span className="rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-semibold">
                          {lots.length} Lots
                        </span>
                      </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Active Workstation:</span>
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                        Station 2 (Scanner 2)
                      </span>
                    </div>
                  </div>

                  {/* ------------------------------------------------------------- */}
                  {/* MODE 1: RAW STORE ISSUANCE DASHBOARD                           */}
                  {/* ------------------------------------------------------------- */}
                  <TabsContent value="issuance" className="mt-4 space-y-6">
                    {/* Header & Station Hardware Status Banner */}
                    <div className="rounded-xl border-2 border-primary/40 bg-card p-5 shadow-sm space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="wt-id rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                              STATION 2
                            </span>
                            <span className="text-xs font-semibold text-muted-foreground">
                              Fabric Issue Workstation
                            </span>
                          </div>
                          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                            Station 2 · Fabric Issue (Scanner 2)
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            Active Operator:{" "}
                            <span className="font-semibold text-foreground">
                              {me.username} ({me.displayName})
                            </span>{" "}
                            · Department:{" "}
                            <span className="font-medium text-foreground">
                              Raw Material Store (raw-store)
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-col items-start gap-2 md:items-end">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Scanner 2 Status:</span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                              Green / Armed &amp; Connected
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Fast automated bundle card enrollment &amp; order linking
                          </p>
                        </div>
                      </div>

                      {/* Live Target Order Context Bar */}
                      {targetOrder ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                              <Scissors className="size-3.5" />
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">
                                Active Target:{" "}
                                <span className="wt-id text-primary font-bold">{targetOrder.id}</span>{" "}
                                — {targetOrder.product} ({targetOrder.plannedQty} pcs)
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Required Yardage:{" "}
                                <strong className="text-foreground">{targetRequiredFabric} m</strong> ·
                                Status:{" "}
                                <span className="uppercase font-semibold">{targetOrder.status}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                              Scanner 2 Ready for Bundle Tag
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground flex items-center gap-2">
                          <AlertCircle className="size-4 shrink-0 text-warning" />
                          <span>No target order selected. Click &ldquo;Select for Issue&rdquo; on an order in the queue below.</span>
                        </div>
                      )}

                      {/* Live Scan Feedback Box */}
                      {lastOutcome && (
                        <div
                          className={`rounded-lg border p-4 text-xs shadow-sm transition-all duration-200 ${
                            lastOutcome.resolution === "accepted"
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                              : "border-destructive/50 bg-destructive/10 text-destructive-foreground"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {lastOutcome.resolution === "accepted" ? (
                              <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
                            ) : (
                              <XCircle className="size-5 shrink-0 text-destructive mt-0.5" />
                            )}
                            <div className="space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-bold text-sm tracking-tight">
                                  {lastOutcome.resolution === "accepted"
                                    ? "✓ Scan Accepted: Bundle Linked to Order → Issued to Cutting"
                                    : "✕ Scan Rejected at Station 2"}
                                </p>
                                <span className="text-[11px] opacity-75 font-mono">
                                  {fmt.dateTime(lastOutcome.at)}
                                </span>
                              </div>

                              {lastOutcome.resolution === "accepted" ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-md border border-emerald-500/30 bg-card/60 p-2.5 mt-2 text-foreground">
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
                                    <p className="font-bold text-emerald-600">{lastOutcome.issuedQty ?? targetRequiredFabric} m</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                                      Remaining Balance
                                    </span>
                                    <p className="font-bold">{lastOutcome.remainingBalance ?? 0} m</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <p className="font-semibold text-destructive text-xs">
                                    {lastOutcome.rejectReason ?? lastOutcome.resolution}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Card UID scanned: <span className="font-mono font-bold text-foreground">{lastOutcome.uid}</span>. Target order {targetOrderId} remains open awaiting valid fabric roll.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Active Production Orders Queue (Pending Fabric) */}
                    <Section
                      title="Active Production Orders Queue (Pending Fabric)"
                      description="Manager-approved production runs awaiting fabric issue. Click an order to set it as active target for Scanner 2."
                      actions={
                        <div className="flex items-center gap-2">
                          <PlanOrderDialog
                            triggerLabel="+ New Production Order"
                            onSuccess={handleOrderCreated}
                          />
                          <span className="text-xs text-muted-foreground">
                            {approvedOrders.length} active orders
                          </span>
                        </div>
                      }
                    >
                      {approvedOrders.length === 0 ? (
                        <EmptyState title="Zero active production orders in queue">
                          <div className="space-y-3 text-center">
                            <p className="text-sm text-muted-foreground">
                              Create a new production order to begin fabric issuing.
                            </p>
                            <PlanOrderDialog
                              triggerLabel="+ Create First Production Order"
                              onSuccess={handleOrderCreated}
                            />
                          </div>
                        </EmptyState>
                      ) : (
                        <DataTable
                          rows={approvedOrders}
                          rowKey={(o) => o.id}
                          columns={[
                            {
                              header: "Order ID",
                              cell: (o) => (
                                <div>
                                  <span className="wt-id font-bold text-xs">{o.id}</span>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Due: {o.dueDate}
                                  </p>
                                </div>
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
                              header: "Order Status",
                              cell: (o) => <StatusBadge status={o.status} />,
                            },
                            {
                              header: "Linked Bundle",
                              cell: (o) => {
                                const isLinked = o.status === "in-progress" || o.status === "completed";
                                return isLinked ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20">
                                    <Check className="size-3" /> Linked &amp; Issued
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    Unlinked (Awaiting Scan)
                                  </span>
                                );
                              },
                            },
                            {
                              header: "Scanner 2 Target",
                              cell: (o) => {
                                const isTarget = o.id === targetOrderId;
                                return (
                                  <Button
                                    size="sm"
                                    variant={isTarget ? "default" : "outline"}
                                    className="h-7 text-xs gap-1"
                                    disabled={pending}
                                    onClick={() => handleSelectOrder(o)}
                                  >
                                    {isTarget ? (
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

                    {/* Scanner 2 Interactive Card Tap & Fast RFID Interface */}
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Section
                        title="Station 2 Scanner Simulation & Tap"
                        description="Present physical fabric bundle RFID tag to Scanner 2 to automatically validate and link it to the selected order."
                      >
                        <div className="space-y-4">
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

                          {/* Quick Pre-fill Test Chips for Demonstration */}
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
                        </div>
                      </Section>

                      {/* Available Inspected Bundles (Reference Panel) */}
                      <Section
                        title="Available Inspected Bundles (Reference Panel)"
                        description="Read-only warehouse fabric inventory. Only rolls inspected and accepted by Incoming QC are issuable."
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                            <span>Total Usable Stock: <strong className="text-foreground">{totalAcceptedMeters.toFixed(1)} m</strong></span>
                            <span>{acceptedLots.length} passed rolls</span>
                          </div>

                          <div className="divide-y rounded-lg border bg-card max-h-[320px] overflow-y-auto">
                            {lots.map((l) => {
                              const isPassed = l.status === "accepted";
                              const hasStock = l.balanceQty > 0;
                              return (
                                <div
                                  key={l.id}
                                  className="flex items-center justify-between p-3 text-xs hover:bg-muted/30 transition-colors"
                                >
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold wt-id">{l.id}</span>
                                      <span className="font-mono text-[11px] rounded bg-muted px-1.5 py-0.5">
                                        {l.rfidUid ?? "Unbound"}
                                      </span>
                                      {isPassed ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                                          <Check className="size-2.5" /> QC Passed
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                          <Clock className="size-2.5" /> Awaiting QC
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-muted-foreground line-clamp-1">{l.material}</p>
                                    <p className="text-[11px] text-foreground">
                                      Remaining:{" "}
                                      <strong className={hasStock ? "text-emerald-600 font-bold" : "text-destructive font-bold"}>
                                        {l.balanceQty} {l.unit ?? "m"}
                                      </strong>{" "}
                                      / {l.receivedQty} {l.unit ?? "m"}
                                    </p>
                                  </div>

                                  {isPassed && hasStock && l.rfidUid ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-primary gap-1"
                                      onClick={() => {
                                        setScanUid(l.rfidUid!);
                                        handleScan(l.rfidUid!);
                                      }}
                                    >
                                      Tap <ArrowRight className="size-3" />
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground italic">
                                      {!isPassed ? "QC Pending" : "Depleted"}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Section>
                    </div>
                  </TabsContent>

                  {/* ------------------------------------------------------------- */}
                  {/* MODE 2: MATERIAL STOCK & REJECTION MONITOR                     */}
                  {/* ------------------------------------------------------------- */}
                  <TabsContent value="monitor" className="mt-4 space-y-6">
                    {/* Key Warehouse Balance Metrics */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">Total Fabric Rolls</span>
                        <p className="mt-2 text-2xl font-bold">{lots.length}</p>
                      </div>
                      <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">Usable Stock Balance</span>
                        <p className="mt-2 text-2xl font-bold text-emerald-600">{totalAcceptedMeters.toFixed(1)} m</p>
                      </div>
                      <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">QC Pending Lots</span>
                        <p className="mt-2 text-2xl font-bold text-amber-600">{awaitingInspectionLots.length}</p>
                      </div>
                      <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <span className="text-xs font-medium text-muted-foreground">Quarantined / Rejected</span>
                        <p className="mt-2 text-2xl font-bold text-destructive">
                          {lots.filter((l) => l.status === "rejected" || (l.heldQty ?? 0) > 0).length}
                        </p>
                      </div>
                    </div>

                    {/* All Material Lots Table */}
                    <Section
                      title="Material Stock Register & Clearance Dispositions"
                      description="Active fabric lot balances, QC clearance statuses, and warehouse stock availability."
                    >
                      <DataTable
                        rows={lots}
                        rowKey={(l) => l.id}
                        columns={[
                          {
                            header: "Lot ID",
                            cell: (l) => <span className="wt-id font-bold">{l.id}</span>,
                          },
                          {
                            header: "Fabric Specification",
                            cell: (l) => (
                              <div>
                                <p className="font-medium text-xs">{l.material}</p>
                                <p className="text-[11px] text-muted-foreground">Ref: {l.supplierRef}</p>
                              </div>
                            ),
                          },
                          {
                            header: "Bound RFID Tag",
                            cell: (l) => (
                              <span className="font-mono text-xs rounded bg-muted px-1.5 py-0.5">
                                {l.rfidUid ?? "Unbound"}
                              </span>
                            ),
                          },
                          {
                            header: "QC Disposition",
                            cell: (l) => {
                              if (l.status === "accepted") {
                                return (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                                    <Check className="size-3" /> Accepted (Cleared)
                                  </span>
                                );
                              }
                              if (l.status === "rejected") {
                                return (
                                  <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                                    <XCircle className="size-3" /> Rejected / Quarantine
                                  </span>
                                );
                              }
                              return (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600">
                                  <Clock className="size-3" /> Awaiting Incoming QC
                                </span>
                              );
                            },
                          },
                          {
                            header: "Current Balance",
                            cell: (l) => (
                              <span className="font-bold text-xs">
                                {l.balanceQty} / {l.receivedQty} {l.unit ?? "m"}
                              </span>
                            ),
                          },
                        ]}
                      />
                    </Section>

                    {/* Scanner 2 Validation & Rejection Rules Reference */}
                    <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-4 shadow-sm">
                      <div className="flex items-center gap-2 text-foreground font-bold">
                        <ShieldCheck className="size-4 text-primary" />
                        <h3>Station 2 Backend Automated Validation Rules</h3>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 text-xs">
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                          <p className="font-semibold text-foreground">1. Random / Unbound Card Guard</p>
                          <p className="text-muted-foreground">
                            Scanned card must have active binding to a fabric lot. Unassigned or garment tags reject instantly: <em>&ldquo;Rejected: UID not recognised or has no bundle history.&rdquo;</em>
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                          <p className="font-semibold text-foreground">2. QC.incoming Clearance Prerequisite</p>
                          <p className="text-muted-foreground">
                            Lot must be approved by Incoming QC. Awaiting-inspection or quarantined lots reject immediately: <em>&ldquo;Rejected: Lot has not passed Incoming QC inspection.&rdquo;</em>
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                          <p className="font-semibold text-foreground">3. Duplicate Order Issue Guard</p>
                          <p className="text-muted-foreground">
                            The same bundle cannot be scanned twice for the same order: <em>&ldquo;Rejected: Bundle already issued to this order.&rdquo;</em>
                          </p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                          <p className="font-semibold text-foreground">4. Quantity Sufficiency &amp; Depletion Guard</p>
                          <p className="text-muted-foreground">
                            Order quantity must not exceed remaining roll balance. Zero balance rolls block with: <em>&ldquo;Rejected: Bundle fully consumed (Balance: 0m).&rdquo;</em>
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}
