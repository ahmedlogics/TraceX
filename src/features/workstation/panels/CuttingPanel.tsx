import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Layers,
  Package,
  Radio,
  RotateCcw,
  ScanLine,
  Scissors,
  Sparkles,
  Tag,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { IdLink } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";
import type { Garment, MaterialLot, ProductionOrder, ReworkCase } from "@/domain/types";

function generateFreshUid(): string {
  return "04" + Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
}

type CuttingStep = "awaiting_bundle" | "bundle_orders" | "scanning_products";

export function CuttingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();

  // Primary Queries
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qRework = useWtQuery(["rework"], (c) => c.listRework());

  // Cutting Workflow Step:
  // 1. "awaiting_bundle" -> Staff scans fabric bundle card (RFID tag from Station 2).
  // 2. "bundle_orders"   -> Dedicated screen showing production orders linked to this bundle card.
  // 3. "scanning_products" -> Staff scans individual product garment tags to link them to the bundle & order.
  const [step, setStep] = useState<CuttingStep>("awaiting_bundle");

  // Selected State
  const [scannedLotId, setScannedLotId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("M");
  const [completedOrders, setCompletedOrders] = useState<Record<string, boolean>>({});

  // Scanner 3 Tag Input
  const [bundleTagInput, setBundleTagInput] = useState<string>("");
  const [productTagInput, setProductTagInput] = useState<string>(generateFreshUid());

  // Alerts & Feedback
  const [alertMessage, setAlertMessage] = useState<{
    type: "success" | "error" | "info";
    title: string;
    message: string;
  } | null>(null);

  // Active Tab: "cutting" (default) or "rework" (if panel recutting is needed)
  const [activeTab, setActiveTab] = useState<"cutting" | "rework">("cutting");
  const [repairNotes, setRepairNotes] = useState<string>("");

  return (
    <Loadable query={qOrders}>
      {(orders) => (
        <Loadable query={qLots}>
          {(lots) => (
            <Loadable query={qGarments}>
              {(garments) => (
                <Loadable query={qRework}>
                  {(reworkCases) => {
                    // Cutting-specific rework cases
                    const cuttingReworkCases = reworkCases.filter(
                      (rc) =>
                        rc.assignedDepartment === "cutting" ||
                        (rc.defectReason && rc.defectReason.toLowerCase().includes("panel")),
                    );

                    // Active Scanned Bundle Lot
                    const activeLot = lots.find((l) => l.id === scannedLotId);

                    // Production orders associated with this fabric bundle
                    const associatedOrders = orders.filter((o) => {
                      if (!activeLot) return false;
                      // Match orders that have material issued or match approved/in-progress
                      if ((o as any).lotId === activeLot.id) return true;
                      return o.status === "approved" || o.status === "in-progress" || o.status === "planned";
                    });

                    // Currently selected production order for cutting
                    const selectedOrder = orders.find((o) => o.id === selectedOrderId);

                    // Garments cut for current selected order
                    const currentOrderGarments = garments.filter(
                      (g) => g.orderId === selectedOrderId,
                    );
                    const plannedCount = selectedOrder ? Math.max(1, selectedOrder.plannedQty) : 1;
                    const cutCount = currentOrderGarments.length;
                    const progressPercent = Math.min(100, Math.round((cutCount / plannedCount) * 100));

                    // -------------------------------------------------------------
                    // STEP 1: Process Bundle Card Scan (RFID from Station 2)
                    // -------------------------------------------------------------
                    const handleScanBundleCard = (rawUid: string) => {
                      const uid = rawUid.trim().toUpperCase();
                      if (!uid) return;

                      // Check if UID matches an accepted fabric roll
                      const matchingLot = lots.find(
                        (l) =>
                          l.rfidUid?.toUpperCase() === uid ||
                          l.id.toUpperCase() === uid ||
                          (l.rfidUid && l.rfidUid.toUpperCase().includes(uid)),
                      );

                      if (!matchingLot) {
                        setAlertMessage({
                          type: "error",
                          title: "Scan Rejected — Unrecognised Bundle Tag",
                          message: `Tag UID '${uid}' is not registered as a fabric roll card. Present a valid fabric roll card issued from Station 2.`,
                        });
                        return;
                      }

                      // Verify Incoming QC Acceptance
                      if (matchingLot.status !== "accepted") {
                        setAlertMessage({
                          type: "error",
                          title: "Scan Rejected — Bundle Not Accepted by QC",
                          message: `Bundle ${matchingLot.id} has status '${matchingLot.status}'. Only fabric rolls inspected and accepted at dock QC can be issued to cutting.`,
                        });
                        return;
                      }

                      // Valid Bundle Scanned: Transition to "Bundle Orders" screen
                      setScannedLotId(matchingLot.id);
                      setBundleTagInput("");
                      setStep("bundle_orders");
                      setAlertMessage({
                        type: "success",
                        title: `Fabric Bundle Loaded: ${matchingLot.id}`,
                        message: `Loaded roll details for ${matchingLot.material} (${matchingLot.balanceQty || matchingLot.receivedQty}m available). Select an order to cut.`,
                      });
                    };

                    // -------------------------------------------------------------
                    // STEP 2: Operator Selects Order from "Bundle Orders" Screen
                    // -------------------------------------------------------------
                    const handleSelectOrder = (order: ProductionOrder) => {
                      setSelectedOrderId(order.id);
                      setProductTagInput(generateFreshUid());
                      setStep("scanning_products");
                      setAlertMessage({
                        type: "info",
                        title: `Order Selected: ${order.id}`,
                        message: `Ready for product serialization. Scan fresh garment RFID cards at Scanner 3 for each cut panel set. Target: ${order.plannedQty} pcs.`,
                      });
                    };

                    // -------------------------------------------------------------
                    // STEP 3: Process Individual Garment Tag Scan
                    // -------------------------------------------------------------
                    const handleScanProductTag = async (rawUid: string) => {
                      const uid = rawUid.trim().toUpperCase();
                      if (!uid || !selectedOrder || !activeLot) return;

                      // Check if card is already actively bound to another garment or lot
                      const existingGarment = garments.find((g) => g.rfidUid === uid);
                      if (existingGarment) {
                        setAlertMessage({
                          type: "error",
                          title: "Scan Rejected — Card Already Active",
                          message: `Tag UID '${uid}' is already assigned to garment ${existingGarment.id}. Please use a fresh, unassigned RFID card.`,
                        });
                        return;
                      }

                      const existingLot = lots.find((l) => l.rfidUid === uid);
                      if (existingLot) {
                        setAlertMessage({
                          type: "error",
                          title: "Scan Rejected — Fabric Bundle Card Presented",
                          message: `Tag UID '${uid}' is the fabric bundle card for lot ${existingLot.id}. Present a fresh garment card for product serialization.`,
                        });
                        return;
                      }

                      try {
                        const garmentCode = await run(
                          (c) =>
                            c.recordCuttingOutput({
                              orderId: selectedOrder.id,
                              fabricUsed: 2.0,
                              size: selectedSize,
                              tagUid: uid,
                            }),
                          `Enrolled garment at Scanner 3. Linked to Bundle ${activeLot.id} → Order ${selectedOrder.id}`,
                        );

                        // Success feedback
                        setProductTagInput(generateFreshUid());
                        setAlertMessage({
                          type: "success",
                          title: `Garment Cut & Enrolled: ${garmentCode || "Success"}`,
                          message: `Size ${selectedSize} panel set serialized with tag ${uid}. Lineage established: Lot ${activeLot.id} ➔ Order ${selectedOrder.id} ➔ ${garmentCode}. Advanced to Stitching.`,
                        });
                      } catch (err: any) {
                        setAlertMessage({
                          type: "error",
                          title: "Enrollment Error",
                          message: err?.message || "Failed to record cut product. Check server connection.",
                        });
                      }
                    };

                    // -------------------------------------------------------------
                    // STEP 4: Complete All Products for this Order
                    // -------------------------------------------------------------
                    const handleCompleteOrderCutting = () => {
                      if (!selectedOrder) return;
                      const orderId = selectedOrder.id;
                      setCompletedOrders((prev) => ({ ...prev, [orderId]: true }));
                      setStep("awaiting_bundle");
                      setScannedLotId("");
                      setSelectedOrderId("");

                      setAlertMessage({
                        type: "success",
                        title: `All Products of Order ${orderId} Scan Complete`,
                        message: `Order cutting finished successfully! All cut garments have been serialized and advanced to Station 4 (Stitching Table). Awaiting next fabric bundle.`,
                      });
                    };

                    // Inspected lots available for quick selection
                    const availableInspectedLots = lots.filter(
                      (l) => l.status === "accepted" && l.rfidUid,
                    );

                    return (
                      <div className="space-y-5">
                        {/* Streamlined Station Header — Clean and single-layered */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                                Station 3
                              </span>
                              <h2 className="text-xl font-bold tracking-tight text-foreground">
                                Cutting Table
                              </h2>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Operator: <span className="font-semibold text-foreground">{me.displayName}</span> ({me.username}) · Department: <span className="font-mono">{me.department}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            {cuttingReworkCases.length > 0 && (
                              <Button
                                variant={activeTab === "rework" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setActiveTab(activeTab === "rework" ? "cutting" : "rework")}
                                className="text-xs gap-1.5 h-8"
                              >
                                <Wrench className="size-3.5" />
                                Cutting Rework ({cuttingReworkCases.length})
                              </Button>
                            )}

                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                              Scanner 3 Online
                            </span>
                          </div>
                        </div>

                        {/* Alert / Notification Banner */}
                        {alertMessage && (
                          <div
                            className={`rounded-lg border p-3.5 text-xs flex items-start gap-3 transition-all ${
                              alertMessage.type === "success"
                                ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                                : alertMessage.type === "error"
                                  ? "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/20"
                                  : "border-primary/30 bg-primary/5 text-foreground"
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {alertMessage.type === "success" && <CheckCircle2 className="size-4 text-emerald-600" />}
                              {alertMessage.type === "error" && <XCircle className="size-4 text-destructive" />}
                              {alertMessage.type === "info" && <Sparkles className="size-4 text-primary" />}
                            </div>
                            <div className="flex-1 space-y-0.5">
                              <p className="font-bold">{alertMessage.title}</p>
                              <p className="opacity-90">{alertMessage.message}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAlertMessage(null)}
                              className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              ✕
                            </Button>
                          </div>
                        )}

                        {/* Optional Rework Panel (if active) */}
                        {activeTab === "rework" && (
                          <div className="rounded-xl border bg-card p-5 space-y-4">
                            <div className="flex items-center justify-between border-b pb-3">
                              <h3 className="text-sm font-bold flex items-center gap-2">
                                <Wrench className="size-4 text-accent" />
                                Cutting Rework Queue ({cuttingReworkCases.length} items)
                              </h3>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setActiveTab("cutting")}
                                className="text-xs h-7"
                              >
                                Return to Cutting
                              </Button>
                            </div>
                            <DataTable
                              rows={cuttingReworkCases}
                              rowKey={(rc) => rc.id}
                              columns={[
                                {
                                  header: "Garment ID",
                                  cell: (rc) => <IdLink href={paths.garment(rc.garmentId)} id={rc.garmentId} />,
                                },
                                {
                                  header: "Defect Reason",
                                  cell: (rc) => <span className="text-xs">{rc.defectReason || "Panel defect"}</span>,
                                },
                                {
                                  header: "Status",
                                  cell: (rc) => <StatusBadge status={rc.status} />,
                                },
                                {
                                  header: "Action",
                                  cell: (rc) => (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={() => {
                                        void run(
                                          (c) => c.completeRework(rc.id, repairNotes || "Recut replacement panel"),
                                          `Recut completed for ${rc.garmentId}. Routed to QA for reinspection.`,
                                        );
                                      }}
                                    >
                                      Complete Recut
                                    </Button>
                                  ),
                                },
                              ]}
                            />
                          </div>
                        )}

                        {/* ------------------------------------------------------------- */}
                        {/* SCREEN 1: Awaiting Fabric Bundle Card Scan                     */}
                        {/* Operator does NOT select anything; simply scans bundle card   */}
                        {/* ------------------------------------------------------------- */}
                        {activeTab === "cutting" && step === "awaiting_bundle" && (
                          <div className="rounded-xl border bg-card p-6 space-y-6 shadow-xs">
                            <div className="text-center max-w-lg mx-auto space-y-2">
                              <div className="size-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                                <ScanLine className="size-6" />
                              </div>
                              <h3 className="text-lg font-bold text-foreground">
                                Present Fabric Bundle Card
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                Scan the RFID card attached to the fabric roll issued from Raw Store (Station 2). The system will automatically fetch the production orders linked to this bundle.
                              </p>
                            </div>

                            {/* Scanner 3 Fast Tap / Serial Input */}
                            <div className="max-w-md mx-auto space-y-3">
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <Input
                                    value={bundleTagInput}
                                    onChange={(e) => setBundleTagInput(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleScanBundleCard(bundleTagInput);
                                      }
                                    }}
                                    placeholder="Enter or tap Bundle Tag UID (e.g. 0476FB76)"
                                    className="font-mono text-sm uppercase pl-9"
                                    autoFocus
                                  />
                                  <Radio className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                                </div>
                                <Button
                                  disabled={pending || !bundleTagInput.trim()}
                                  onClick={() => handleScanBundleCard(bundleTagInput)}
                                  className="gap-2 font-semibold"
                                >
                                  <ScanLine className="size-4" />
                                  Scan Card
                                </Button>
                              </div>

                              {/* Available Inspected Bundles (One-Click Tap for Demo & Simulation) */}
                              {availableInspectedLots.length > 0 && (
                                <div className="pt-2 border-t space-y-2">
                                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block text-center">
                                    Quick Tap Available Inspected Bundles:
                                  </span>
                                  <div className="flex flex-wrap justify-center gap-2">
                                    {availableInspectedLots.map((lot) => (
                                      <Button
                                        key={lot.id}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleScanBundleCard(lot.rfidUid!)}
                                        className="text-xs h-8 gap-1.5 font-mono"
                                      >
                                        <Package className="size-3 text-primary" />
                                        <span>{lot.id}</span>
                                        <span className="text-muted-foreground">({lot.rfidUid})</span>
                                        <span className="text-emerald-600 font-bold">✓</span>
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ------------------------------------------------------------- */}
                        {/* SCREEN 2: BUNDLE ORDERS SCREEN                                */}
                        {/* Shows orders associated with scanned bundle for staff choice  */}
                        {/* ------------------------------------------------------------- */}
                        {activeTab === "cutting" && step === "bundle_orders" && activeLot && (
                          <div className="space-y-5">
                            {/* Scanned Bundle Banner */}
                            <div className="rounded-xl border bg-card p-5 space-y-4 shadow-xs">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                    Scanned Fabric Bundle
                                  </span>
                                  <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                                    <Package className="size-5 text-primary" />
                                    {activeLot.id} — {activeLot.material}
                                  </h3>
                                </div>

                                <div className="flex items-center gap-2">
                                  <StatusBadge status="QC Passed" tone="success" />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setStep("awaiting_bundle");
                                      setScannedLotId("");
                                    }}
                                    className="text-xs h-8 gap-1"
                                  >
                                    <ArrowLeft className="size-3.5" />
                                    Scan Different Bundle
                                  </Button>
                                </div>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-4 text-xs">
                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                    Lot Code
                                  </span>
                                  <span className="font-bold text-sm text-foreground">{activeLot.id}</span>
                                </div>
                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                    Usable Roll Length
                                  </span>
                                  <span className="font-bold text-sm text-foreground">
                                    {activeLot.balanceQty || activeLot.receivedQty} m
                                  </span>
                                </div>
                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                    Bundle RFID Tag UID
                                  </span>
                                  <span className="font-mono font-bold text-sm text-foreground">
                                    {activeLot.rfidUid}
                                  </span>
                                </div>
                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                    QC Clearance
                                  </span>
                                  <span className="font-bold text-sm text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="size-3.5" /> Approved at Dock
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* "Bundle Orders" dedicated list */}
                            <div className="rounded-xl border bg-card p-5 space-y-4 shadow-xs">
                              <div>
                                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                                  <Scissors className="size-4 text-primary" />
                                  Bundle Orders
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                  Select which production order to cut from bundle {activeLot.id}. After selecting, subsequent scans will enroll individual products for that order.
                                </p>
                              </div>

                              {associatedOrders.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg bg-muted/10">
                                  No production orders currently assigned to this fabric bundle.
                                </div>
                              ) : (
                                <div className="grid gap-3">
                                  {associatedOrders.map((order) => {
                                    const orderGarments = garments.filter((g) => g.orderId === order.id);
                                    const isDone = !!completedOrders[order.id] || orderGarments.length >= order.plannedQty;
                                    const reqFabric = Math.round(order.plannedQty * 2.0 * 10) / 10;

                                    return (
                                      <div
                                        key={order.id}
                                        className={`rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all ${
                                          isDone
                                            ? "bg-muted/30 border-muted"
                                            : "bg-card hover:border-primary/50 shadow-xs"
                                        }`}
                                      >
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-foreground">
                                              {order.id}
                                            </span>
                                            <StatusBadge status={order.status} />
                                            {isDone && (
                                              <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 dark:bg-emerald-950 dark:text-emerald-300">
                                                Cutting Complete
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-xs text-foreground font-semibold">
                                            {order.product}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground">
                                            Style: <span className="font-mono">{order.styleCode}</span> · Target: <span className="font-bold text-foreground">{order.plannedQty} pcs</span> · Required: <span className="font-bold text-foreground">{reqFabric} m</span> · Progress: <span className="font-mono">{orderGarments.length} / {order.plannedQty} pcs cut</span>
                                          </p>
                                        </div>

                                        <div className="shrink-0 flex items-center gap-2">
                                          {isDone ? (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleSelectOrder(order)}
                                              className="text-xs gap-1.5"
                                            >
                                              <RotateCcw className="size-3.5" />
                                              Review Cut Garments
                                            </Button>
                                          ) : (
                                            <Button
                                              onClick={() => handleSelectOrder(order)}
                                              className="gap-2 text-xs font-bold"
                                            >
                                              <Scissors className="size-3.5" />
                                              Select Order &amp; Start Product Scans →
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ------------------------------------------------------------- */}
                        {/* SCREEN 3: PRODUCT ENROLLMENT SCANNING                         */}
                        {/* Scans individual garment tags, linking them to bundle & order */}
                        {/* ------------------------------------------------------------- */}
                        {activeTab === "cutting" && step === "scanning_products" && selectedOrder && activeLot && (
                          <div className="space-y-5">
                            {/* Active Cutting Job Card */}
                            <div className="rounded-xl border bg-card p-5 space-y-4 shadow-xs">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                                      ACTIVE ORDER
                                    </span>
                                    <h3 className="text-lg font-bold text-foreground">
                                      {selectedOrder.id} — {selectedOrder.product}
                                    </h3>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Linked Fabric Roll: <strong className="text-foreground">{activeLot.id}</strong> ({activeLot.material}) ·
                                    Style: <span className="font-mono">{selectedOrder.styleCode}</span> ·
                                    Target: <strong className="text-foreground">{selectedOrder.plannedQty} pcs</strong>
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setStep("bundle_orders")}
                                    className="text-xs h-8 gap-1"
                                  >
                                    <ArrowLeft className="size-3" />
                                    Bundle Orders
                                  </Button>

                                  <Button
                                    onClick={handleCompleteOrderCutting}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-xs font-bold h-8"
                                  >
                                    <Check className="size-4" />
                                    All Products of this Order Scan Complete
                                  </Button>
                                </div>
                              </div>

                              {/* Real-time Progress Bar */}
                              <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                  <span className="text-muted-foreground uppercase tracking-wider">
                                    Cutting Output Progress:
                                  </span>
                                  <span className="text-sm font-bold tabular-nums text-foreground">
                                    {cutCount} / {plannedCount} pcs cut ({progressPercent}%)
                                  </span>
                                </div>
                                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                              </div>

                              {/* Scanner 3 Product Enrollment Controls */}
                              <div className="rounded-lg border bg-card p-4 space-y-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                      <Tag className="size-3.5 text-primary" />
                                      Scanner 3 — Garment Tag Enrollment
                                    </h4>
                                    <p className="text-[11px] text-muted-foreground">
                                      Present a fresh RFID card for each cut garment. Automatically links to Bundle {activeLot.id} &amp; Order {selectedOrder.id}.
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-semibold text-muted-foreground">Cut Size:</span>
                                    <select
                                      value={selectedSize}
                                      onChange={(e) => setSelectedSize(e.target.value)}
                                      className="h-8 rounded-md border border-input bg-background px-2 text-xs font-bold"
                                    >
                                      {["S", "M", "L", "XL"].map((s) => (
                                        <option key={s} value={s}>
                                          Size {s}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <div className="relative flex-1">
                                    <Input
                                      value={productTagInput}
                                      onChange={(e) => setProductTagInput(e.target.value.toUpperCase())}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          void handleScanProductTag(productTagInput);
                                        }
                                      }}
                                      placeholder="Garment Tag UID (e.g. 04A1B2C3)"
                                      className="font-mono text-sm uppercase pl-9"
                                    />
                                    <Radio className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                                  </div>

                                  <Button
                                    disabled={pending || !productTagInput.trim()}
                                    onClick={() => void handleScanProductTag(productTagInput)}
                                    className="gap-2 font-bold shrink-0"
                                  >
                                    <ScanLine className="size-4" />
                                    Scan Product Tag
                                  </Button>

                                  <Button
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => void handleScanProductTag(generateFreshUid())}
                                    className="gap-1.5 shrink-0 text-xs"
                                  >
                                    <Sparkles className="size-3.5 text-primary" />
                                    Fast Tap Next Garment
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Enrolled Products Table for this Order */}
                            <div className="rounded-xl border bg-card p-5 space-y-3 shadow-xs">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                  <Layers className="size-3.5 text-primary" />
                                  Cut Products for Order {selectedOrder.id} ({currentOrderGarments.length} pcs)
                                </h4>
                                <span className="text-xs text-muted-foreground">
                                  Destination: <strong className="text-primary font-semibold">Station 4 (Stitching)</strong>
                                </span>
                              </div>

                              <DataTable
                                rows={currentOrderGarments}
                                rowKey={(g) => g.id}
                                empty="No garments serialized for this order yet. Present fresh RFID card at Scanner 3."
                                columns={[
                                  {
                                    header: "Garment ID",
                                    cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                                  },
                                  {
                                    header: "Product & Size",
                                    cell: (g) => (
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-xs">{g.productName}</span>
                                        {g.size && (
                                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                                            Size {g.size}
                                          </span>
                                        )}
                                      </div>
                                    ),
                                  },
                                  {
                                    header: "Bound RFID UID",
                                    cell: (g) =>
                                      g.rfidUid ? (
                                        <span className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 flex items-center gap-1 w-fit">
                                          <Radio className="size-3" /> {g.rfidUid}
                                        </span>
                                      ) : (
                                        <span className="text-xs italic text-muted-foreground">Unbound</span>
                                      ),
                                  },
                                  {
                                    header: "Hierarchy Lineage",
                                    cell: (g) => (
                                      <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                                        <span className="text-primary font-semibold">{activeLot.id}</span>
                                        <ArrowRight className="size-3 text-muted-foreground" />
                                        <span className="text-foreground font-semibold">{selectedOrder.id}</span>
                                        <ArrowRight className="size-3 text-muted-foreground" />
                                        <span className="text-emerald-600 font-semibold">{g.id}</span>
                                      </span>
                                    ),
                                  },
                                  {
                                    header: "Next Station",
                                    cell: () => (
                                      <span className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
                                        Station 4 (Stitching)
                                      </span>
                                    ),
                                  },
                                ]}
                              />

                              {/* Prominent Completion Button at bottom as well */}
                              {currentOrderGarments.length > 0 && (
                                <div className="pt-3 border-t flex justify-end">
                                  <Button
                                    onClick={handleCompleteOrderCutting}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold"
                                  >
                                    <Check className="size-4" />
                                    All Products of this Order Scan Complete
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                </Loadable>
              )}
            </Loadable>
          )}
        </Loadable>
      )}
    </Loadable>
  );
}
