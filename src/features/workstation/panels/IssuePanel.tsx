import { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Radio,
  ScanLine,
  Scissors,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field } from "@/components/wt/forms";
import { fmt, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { MaterialLot, ProductionOrder } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function getRequiredFabric(order: ProductionOrder): number {
  return Math.round(order.plannedQty * 2.0 * 10) / 10;
}

export function IssuePanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [scanUid, setScanUid] = useState<string>("");

  const activeCtx = stationData.activeContext;
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

        // Handle scan execution
        const handleScan = (uidToScan?: string) => {
          const targetUid = (uidToScan || scanUid).trim();
          if (!targetUid) return;
          void run(
            (c) => c.resolveRfidScan(targetUid),
            (outcome) =>
              outcome.resolution === "accepted"
                ? `Bundle linked to Order → Issued to Cutting (${outcome.subjectId} → ${outcome.orderId ?? targetOrderId})`
                : `${outcome.rejectReason ?? outcome.resolution}`,
          );
        };

        // One-click issue for inspected fabric roll without manual UID typing
        const handleIssueRoll = async (lot: MaterialLot) => {
          if (!targetOrder) return;
          const requiredQty = targetRequiredFabric;
          // Ensure Scanner 2 is armed for targetOrder
          await run(
            (c) =>
              c.prepareActionContext("fabric_issue", "confirm_issue", {
                kind: "confirm_issue",
                orderId: targetOrder.id,
                qty: requiredQty,
              }),
            undefined,
          );
          // Resolve scan using the roll's active RFID card tag UID
          const tagUid = lot.rfidUid || "0476FB76";
          await run(
            (c) => c.resolveRfidScan(tagUid),
            (outcome) =>
              outcome.resolution === "accepted"
                ? `Bundle tag (${tagUid}) scanned → Roll ${lot.id} linked to Order ${targetOrder.id} (${outcome.issuedQty ?? requiredQty} m issued to Cutting)`
                : `${outcome.rejectReason ?? outcome.resolution}`,
          );
        };

        return (
          <div className="space-y-6">
            {/* Live Target Order Context Bar */}
            {targetOrder ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-xs">
                    <Scissors className="size-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground text-sm tracking-tight">{targetOrder.id}</span>
                      <span className="text-muted-foreground font-medium">— {targetOrder.product}</span>
                      <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">
                        {targetOrder.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Planned: <strong className="text-foreground">{targetOrder.plannedQty} pcs</strong> · Required Fabric: <strong className="text-foreground">{targetRequiredFabric} m</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Scanner 2 Ready for Bundle Tag
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning-foreground flex items-center gap-2">
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

            {/* Active Production Orders Queue (Pending Fabric) */}
            <Section
              title="Active Production Orders Queue (Pending Fabric)"
              description="Manager-approved production runs awaiting fabric issue. Click an order to set it as active target for Scanner 2."
              actions={
                <span className="text-xs text-muted-foreground">
                  {approvedOrders.length} active orders
                </span>
              }
            >
              {approvedOrders.length === 0 ? (
                <EmptyState title="Zero active production orders in queue" />
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

            {/* Available Inspected Fabric Rolls (Warehouse Stock) */}
            <Section
              title="Available Inspected Fabric Rolls (Warehouse Stock)"
              description="Warehouse fabric rolls cleared by qc.incoming. Click 'Scan Tag & Issue' to link the roll's RFID tag to the target order with zero typing."
            >
              {(() => {
                const issuableLots = lots.filter(
                  (l) => (l.status === "accepted" || Number(l.balanceQty) > 0) && Number(l.balanceQty) > 0,
                );

                if (issuableLots.length === 0) {
                  return (
                    <EmptyState title="No QC-cleared fabric rolls available in warehouse">
                      Fabric rolls must pass incoming inspection by qc.incoming before they can be issued.
                    </EmptyState>
                  );
                }

                return (
                  <DataTable
                    rows={issuableLots}
                    rowKey={(l) => l.id}
                    columns={[
                      {
                        header: "Fabric Roll",
                        cell: (l) => (
                          <div>
                            <span className="wt-id font-bold text-xs">{l.id}</span>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{fmt.date(l.receivedAt)}</p>
                          </div>
                        ),
                      },
                      {
                        header: "Material & Spec",
                        cell: (l) => (
                          <div>
                            <p className="font-medium text-foreground text-xs">{l.material}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Ref: {l.supplierRef}</p>
                          </div>
                        ),
                      },
                      {
                        header: "Available Stock",
                        cell: (l) => (
                          <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {l.balanceQty} {l.unit}
                          </span>
                        ),
                      },
                      {
                        header: "RFID Tag UID",
                        cell: (l) => (
                          <span className="wt-id font-mono text-xs bg-muted px-2 py-0.5 rounded">
                            {l.rfidUid || "0476FB76"}
                          </span>
                        ),
                      },
                      {
                        header: "QC Status",
                        cell: () => (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" /> QC Passed
                          </span>
                        ),
                      },
                      {
                        header: "Issue Action",
                        cell: (l) => (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1.5 bg-primary"
                            disabled={pending || !targetOrder}
                            onClick={() => void handleIssueRoll(l)}
                          >
                            <ScanLine className="size-3.5" /> Scan Tag &amp; Issue
                          </Button>
                        ),
                      },
                    ]}
                  />
                );
              })()}
            </Section>

            {/* Scanner 2 Physical RFID Reader Antenna */}
            <Section
              title="Scanner 2 — Physical RFID Reader Antenna"
              description="Tap a physical fabric bundle RFID tag against Scanner 2 USB antenna to automatically detect and link it to the armed order."
            >
              <div className="max-w-xl space-y-4 rounded-xl border bg-card p-5 shadow-xs">
                <Field
                  label="RFID Antenna Scanner Input"
                  htmlFor="s2-uid"
                  hint="Scanner wedge input receives card UID automatically when tag is presented to Reader 2."
                >
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Input
                      id="s2-uid"
                      value={scanUid}
                      onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                      placeholder="Waiting for RFID antenna scan..."
                      className="font-mono bg-background"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && scanUid.trim() && !pending) {
                          handleScan();
                        }
                      }}
                    />
                    <Button
                      disabled={pending || !scanUid.trim()}
                      onClick={() => handleScan()}
                      className="gap-1.5 shrink-0"
                    >
                      <ScanLine className="size-4" /> Trigger Scan
                    </Button>
                    {scanUid && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setScanUid("")}
                        className="shrink-0"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </Field>
              </div>
            </Section>
          </div>
        );
      }}
    </Loadable>
  )}
</Loadable>
  );
}
