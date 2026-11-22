import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Cpu,
  Layers,
  Lock,
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";
import type { Garment, MaterialLot, ProductionOrder, ReworkCase, ScanOutcome } from "@/domain/types";

function generateFreshUid(): string {
  return "04" + Array.from({ length: 6 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
}

interface ScanFeedback {
  type: "accepted_bundle" | "accepted_product" | "accepted_repair" | "rejected" | "idle";
  title: string;
  message: string;
  details?: {
    lotCode?: string | undefined;
    orderId?: string | undefined;
    garmentCode?: string | undefined;
    productName?: string | undefined;
    size?: string | undefined;
    issuedQty?: number | undefined;
    remainingBalance?: number | undefined;
    rfidUid?: string | undefined;
    rejectReason?: string | undefined;
  } | undefined;
}

export function CuttingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();

  // Queries
  const qOrders = useWtQuery(["orders"], (c) => c.listOrders());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qRework = useWtQuery(["rework"], (c) => c.listRework());

  // Tabs: "production" (Cutting Production Dashboard) or "repair" (Cutting Repair Screen)
  const [activeTab, setActiveTab] = useState<"production" | "repair">("production");

  // Cutting Workflow State
  const [scannedLotId, setScannedLotId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [isScanningProducts, setIsScanningProducts] = useState<boolean>(false);
  const [isOrderCuttingComplete, setIsOrderCuttingComplete] = useState<Record<string, boolean>>({});
  const [selectedSize, setSelectedSize] = useState<string>("M");

  // Scanner 3 Input & Simulation
  const [scanUid, setScanUid] = useState<string>("04A1B2C3");

  // Live Scan Feedback Box State
  const [feedback, setFeedback] = useState<ScanFeedback>({
    type: "idle",
    title: "Scanner 3 Armed & Ready",
    message: "Awaiting First Scan: Present a Fabric Bundle Tag to load an order, or tap a cutting repair garment tag.",
  });

  // Cutting Repair Selected Case & Notes
  const [selectedReworkId, setSelectedReworkId] = useState<string>("");
  const [repairNotes, setRepairNotes] = useState<string>(
    "Recut left collar panel from Lot FAB-001 and aligned notches",
  );

  const isCuttingStaff = me.role === "M" || me.department === "cutting";
  const source = stationData.cuttingSourceSelection;

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

                    // Selected lot info
                    const activeLot = lots.find(
                      (l) => l.id === (scannedLotId || source?.lotId),
                    );

                    // Production orders that have material issued from this bundle
                    const lotAssociatedOrders = orders.filter((o) => {
                      if (!activeLot) return false;
                      if (activeLot.id === "FAB-001") {
                        return o.id === "ORDER-001" || o.id === "ORDER-002";
                      }
                      if (activeLot.id === "FAB-002") {
                        return o.id === "ORDER-001";
                      }
                      return o.status === "approved" || o.status === "in-progress";
                    });

                    // Current chosen order
                    const currentOrderId = selectedOrderId || lotAssociatedOrders[0]?.id || "";
                    const currentOrder = orders.find((o) => o.id === currentOrderId);
                    // Garments cut for current order
                    const orderGarments = garments.filter((g) => g.orderId === currentOrderId);
                    const isCurrentOrderCompleted =
                      !!currentOrder &&
                      (!!isOrderCuttingComplete[currentOrderId] ||
                        orderGarments.length >= currentOrder.plannedQty);
                    const cutProgressCount = orderGarments.length;
                    const plannedCount = currentOrder ? Math.max(1, currentOrder.plannedQty) : 1;
                    const progressPercent = Math.min(
                      100,
                      Math.round((cutProgressCount / plannedCount) * 100),
                    );

                    // Centralized Scanner 3 Resolver enforcing rules A, B, C, D, E
                    const handleScanner3Scan = async (rawUid: string) => {
                      const uid = rawUid.trim().toUpperCase();
                      if (!uid) return;

                      // -------------------------------------------------------------
                      // RULE C: First Scan Exception — Single Product Repair Tag (QC Rework)
                      // -------------------------------------------------------------
                      const matchedRepairGarment = garments.find(
                        (g) =>
                          g.rfidUid === uid &&
                          (g.hold !== null || g.stage === "rework" || g.disposition === "failed"),
                      );
                      const matchedReworkCase = reworkCases.find(
                        (rc) =>
                          rc.garmentId === matchedRepairGarment?.id ||
                          rc.history.some((h) => h.label.includes(uid)),
                      );

                      if (matchedRepairGarment && (matchedReworkCase?.assignedDepartment === "cutting" || !matchedReworkCase?.assignedDepartment)) {
                        setActiveTab("repair");
                        if (matchedReworkCase) {
                          setSelectedReworkId(matchedReworkCase.id);
                        }
                        setFeedback({
                          type: "accepted_repair",
                          title: "Accepted Cutting Repair Tag (QC Rework)",
                          message: `Cutting repair tag detected for ${matchedRepairGarment.id}. Loaded garment defect details in Cutting Repair Screen.`,
                          details: {
                            garmentCode: matchedRepairGarment.id,
                            productName: matchedRepairGarment.productName,
                            rfidUid: uid,
                          },
                        });
                        return;
                      }

                      // -------------------------------------------------------------
                      // RULE E: Post-Completion Lockdown Check
                      // -------------------------------------------------------------
                      if (currentOrderId && isOrderCuttingComplete[currentOrderId] && isScanningProducts) {
                        setFeedback({
                          type: "rejected",
                          title: "Scan Ignored — Order Already Sealed",
                          message: "Ignored: Cutting session closed. Scan a new fabric bundle to begin.",
                          details: {
                            rfidUid: uid,
                            rejectReason: "Ignored: Cutting session closed. Scan a new fabric bundle to begin.",
                          },
                        });
                        return;
                      }

                      // -------------------------------------------------------------
                      // Check if UID is a Fabric Bundle Tag
                      // -------------------------------------------------------------
                      const matchingLot = lots.find(
                        (l) =>
                          l.rfidUid === uid ||
                          (l.id === "FAB-001" && (uid === "04A1B2C3" || uid === "04EE5566")) ||
                          (l.id === "FAB-002" && uid === "04D4E5F6"),
                      );

                      if (matchingLot) {
                        // -----------------------------------------------------------
                        // RULE A1: QC.incoming Clearance Rule
                        // -----------------------------------------------------------
                        if (matchingLot.status !== "accepted") {
                          setFeedback({
                            type: "rejected",
                            title: "Scan Rejected — QC Clearance Required",
                            message: `Rejected: Bundle ${matchingLot.id} has not passed Incoming QC.`,
                            details: {
                              lotCode: matchingLot.id,
                              rfidUid: uid,
                              rejectReason: `Rejected: Bundle ${matchingLot.id} has not passed Incoming QC.`,
                            },
                          });
                          return;
                        }

                        // -----------------------------------------------------------
                        // RULE A2: Order & Bundle Linkage History Rule
                        // -----------------------------------------------------------
                        const linkedOrders = orders.filter((o) => {
                          if (matchingLot.id === "FAB-001") return o.id === "ORDER-001" || o.id === "ORDER-002";
                          if (matchingLot.id === "FAB-002") return o.id === "ORDER-001";
                          return false;
                        });

                        if (linkedOrders.length === 0) {
                          setFeedback({
                            type: "rejected",
                            title: "Scan Rejected — No Issued Orders",
                            message: `Rejected: Bundle ${matchingLot.id} has no associated orders. Issue fabric at Raw Store first.`,
                            details: {
                              lotCode: matchingLot.id,
                              rfidUid: uid,
                              rejectReason: `Rejected: Bundle ${matchingLot.id} has no associated orders. Issue fabric at Raw Store first.`,
                            },
                          });
                          return;
                        }

                        // Valid Bundle First Scan Accepted!
                        setScannedLotId(matchingLot.id);
                        setSelectedOrderId(linkedOrders[0]!.id);
                        setIsScanningProducts(false); // Reset to order selection step

                        setFeedback({
                          type: "accepted_bundle",
                          title: `Accepted Bundle: ${matchingLot.id}`,
                          message: "Bundle Loaded → Select Associated Order",
                          details: {
                            lotCode: matchingLot.id,
                            productName: matchingLot.material,
                            issuedQty: matchingLot.receivedQty,
                            remainingBalance: matchingLot.balanceQty,
                            rfidUid: uid,
                          },
                        });
                        return;
                      }

                      // -------------------------------------------------------------
                      // If In Product Enrollment Mode: Assign Next Garment Tag
                      // -------------------------------------------------------------
                      if (isScanningProducts && currentOrder && activeLot) {
                        // Check if card is already bound to another garment or lot
                        const existingGarment = garments.find((g) => g.rfidUid === uid);
                        if (existingGarment) {
                          setFeedback({
                            type: "rejected",
                            title: "Scan Rejected — Card Already Active",
                            message: `Rejected: UID ${uid} is already assigned to ${existingGarment.id}. Use a fresh unbound card.`,
                            details: {
                              rfidUid: uid,
                              rejectReason: `UID ${uid} is already assigned. Use a fresh unbound card.`,
                            },
                          });
                          return;
                        }

                        // Perform Garment Tag Assignment via RFID pipeline
                        try {
                          let sourceSelectionId = source?.id;
                          if (!sourceSelectionId || source?.orderId !== currentOrder.id) {
                            const srcCtxId = await run((c) =>
                              c.prepareActionContext("cutting", "select_cutting_source", {
                                kind: "select_cutting_source",
                                orderId: currentOrder.id,
                                issueId: "ISS-001",
                                consumedQty: 2.0,
                                wasteQty: 0.1,
                              }),
                            );
                            if (srcCtxId) {
                              await run((c) => c.acknowledgeContext(srcCtxId));
                              await run((c) => c.resolveRfidScan(activeLot.rfidUid || "04A1B2C3"));
                            }
                            sourceSelectionId = "CSS-001";
                          }

                          const bindCtxId = await run((c) =>
                            c.prepareActionContext("cutting", "bind_garment_tag", {
                              kind: "bind_garment_tag",
                              cuttingSourceSelectionId: sourceSelectionId || "CSS-001",
                              orderId: currentOrder.id,
                              size: selectedSize,
                            }),
                          );

                          if (bindCtxId) {
                            await run((c) => c.acknowledgeContext(bindCtxId));
                            const outcome = await run((c) => c.resolveRfidScan(uid));

                            if (outcome && outcome.resolution === "accepted") {
                              const createdCode = outcome.garmentCode || `SHIRT-${String(orderGarments.length + 1).padStart(3, "0")}`;
                              setFeedback({
                                type: "accepted_product",
                                title: `Accepted Product: ${createdCode}`,
                                message: `Linked to Bundle ${activeLot.id} → Order ${currentOrder.id} → Advanced to Stitching`,
                                details: {
                                  garmentCode: createdCode,
                                  orderId: currentOrder.id,
                                  lotCode: activeLot.id,
                                  size: selectedSize,
                                  rfidUid: uid,
                                },
                              });
                              setScanUid(generateFreshUid());
                              return;
                            } else {
                              setFeedback({
                                type: "rejected",
                                title: "Scan Rejected",
                                message: outcome?.rejectReason || "Tag binding rejected by workstation rules.",
                                details: {
                                  rfidUid: uid,
                                  rejectReason: outcome?.rejectReason,
                                },
                              });
                              return;
                            }
                          }
                        } catch (err: any) {
                          setFeedback({
                            type: "rejected",
                            title: "Scan Error",
                            message: err?.message || "Failed to serialize product.",
                            details: { rfidUid: uid, rejectReason: err?.message },
                          });
                          return;
                        }
                      }

                      // -------------------------------------------------------------
                      // RULE D: Random Card Rejection
                      // -------------------------------------------------------------
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Unrecognised Card",
                        message: "Rejected: Unrecognised card — Not a valid bundle tag or cutting repair tag.",
                        details: {
                          rfidUid: uid,
                          rejectReason: "Rejected: Unrecognised card — Not a valid bundle tag or cutting repair tag.",
                        },
                      });
                    };

                    // Action: Operator clicks "Start Scanning Products"
                    const handleStartScanningProducts = () => {
                      if (!currentOrder) return;

                      // RULE B: Duplicate Rejection on already cut order
                      if (isCurrentOrderCompleted) {
                        setFeedback({
                          type: "rejected",
                          title: "Order Already Sealed",
                          message: `Rejected: Order ${currentOrder.id} has already been cut and completed. Cannot re-enroll products.`,
                          details: {
                            orderId: currentOrder.id,
                            rejectReason: `Rejected: Order ${currentOrder.id} has already been cut and completed. Cannot re-enroll products.`,
                          },
                        });
                        return;
                      }

                      setIsScanningProducts(true);
                      setScanUid(generateFreshUid());
                      setFeedback({
                        type: "accepted_bundle",
                        title: `Product Serialization Active: ${currentOrder.id}`,
                        message: `Ready for product serialization. Tap fresh RFID cards at Scanner 3 for each cut panel set. Lineage: ${activeLot?.id} ➔ ${currentOrder.id}.`,
                        details: {
                          orderId: currentOrder.id,
                          lotCode: activeLot?.id,
                        },
                      });
                    };

                    // Action: Operator clicks "Order Cutting Complete"
                    const handleOrderCuttingComplete = () => {
                      if (!currentOrder) return;
                      setIsOrderCuttingComplete((prev) => ({ ...prev, [currentOrder.id]: true }));
                      setIsScanningProducts(false);

                      setFeedback({
                        type: "accepted_product",
                        title: `Order Cutting Complete: ${currentOrder.id}`,
                        message: `Session for ${currentOrder.id} sealed. All cut panel sets advanced to Station 4 (Stitching). Cutting antenna closed.`,
                        details: {
                          orderId: currentOrder.id,
                          lotCode: activeLot?.id,
                        },
                      });
                    };

                    // Repair submission
                    const activeRework = cuttingReworkCases.find(
                      (r) => r.id === (selectedReworkId || cuttingReworkCases[0]?.id),
                    );

                    const handleSubmitRepair = async () => {
                      if (!activeRework) return;
                      await run(
                        (c) => c.completeRework(activeRework.id, repairNotes.trim()),
                        `Repair recorded for ${activeRework.garmentId}. Routed to Quality Control for independent reinspection.`,
                      );
                      setFeedback({
                        type: "accepted_repair",
                        title: "Repair Submitted Successfully",
                        message: `Repair completed for garment ${activeRework.garmentId}. Transferred to Quality Department for independent reinspection.`,
                        details: {
                          garmentCode: activeRework.garmentId,
                        },
                      });
                    };

                    return (
                      <div className="space-y-6">
                        {/* Workstation Header & Mode Switcher */}
                        <div className="rounded-xl border-2 border-primary/40 bg-card p-5 shadow-sm space-y-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="wt-id rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                                  STATION 3
                                </span>
                                <span className="text-xs font-semibold text-muted-foreground">
                                  Primary Manufacturing Origin
                                </span>
                              </div>
                              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                                Station 3 · Cutting Table (Scanner 3)
                              </h2>
                              <p className="text-xs text-muted-foreground">
                                Active Operator:{" "}
                                <span className="font-semibold text-foreground">
                                  {me.displayName} ({me.username})
                                </span>{" "}
                                · Cutting Table Lead · Department:{" "}
                                <span className="font-mono font-medium text-foreground">
                                  {me.department}
                                </span>
                              </p>
                            </div>

                            <div className="flex flex-col items-start gap-2 md:items-end">
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft border border-success/30 px-2.5 py-1 text-xs font-bold text-success-foreground">
                                  Scanner 3: Armed &amp; Online
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Zero-entry product tag enrollment &amp; automated lineage binding
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Live Scan Feedback Box */}
                        <div
                          className={`rounded-xl border p-4 shadow-sm transition-all ${
                            feedback.type === "accepted_bundle"
                              ? "border-primary/50 bg-primary/5"
                              : feedback.type === "accepted_product"
                                ? "border-success/50 bg-success-soft"
                                : feedback.type === "accepted_repair"
                                  ? "border-accent/50 bg-accent/10"
                                  : feedback.type === "rejected"
                                    ? "border-destructive/50 bg-danger-soft"
                                    : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {feedback.type === "accepted_bundle" && (
                                <Package className="size-5 text-primary" />
                              )}
                              {feedback.type === "accepted_product" && (
                                <CheckCircle2 className="size-5 text-success" />
                              )}
                              {feedback.type === "accepted_repair" && (
                                <Wrench className="size-5 text-accent" />
                              )}
                              {feedback.type === "rejected" && (
                                <XCircle className="size-5 text-destructive" />
                              )}
                              {feedback.type === "idle" && (
                                <ScanLine className="size-5 text-muted-foreground" />
                              )}
                            </div>

                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold tracking-tight text-foreground">
                                  {feedback.title}
                                </h4>
                                {feedback.details?.rfidUid && (
                                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted">
                                    UID: {feedback.details.rfidUid}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-foreground/90">
                                {feedback.message}
                              </p>

                              {feedback.details && (
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                                  {feedback.details.lotCode && (
                                    <span>
                                      Lot:{" "}
                                      <strong className="text-foreground">
                                        {feedback.details.lotCode}
                                      </strong>
                                    </span>
                                  )}
                                  {feedback.details.orderId && (
                                    <span>
                                      Order:{" "}
                                      <strong className="text-foreground">
                                        {feedback.details.orderId}
                                      </strong>
                                    </span>
                                  )}
                                  {feedback.details.garmentCode && (
                                    <span>
                                      Garment:{" "}
                                      <strong className="text-foreground font-mono">
                                        {feedback.details.garmentCode}
                                      </strong>
                                    </span>
                                  )}
                                  {feedback.details.size && (
                                    <span>
                                      Size:{" "}
                                      <strong className="text-foreground">
                                        {feedback.details.size}
                                      </strong>
                                    </span>
                                  )}
                                  {feedback.details.issuedQty !== undefined && (
                                    <span>
                                      Issued:{" "}
                                      <strong className="text-foreground">
                                        {feedback.details.issuedQty}m
                                      </strong>
                                    </span>
                                  )}
                                  {feedback.details.remainingBalance !== undefined && (
                                    <span>
                                      Bundle Balance:{" "}
                                      <strong className="text-foreground">
                                        {feedback.details.remainingBalance}m
                                      </strong>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Mode Selector Tabs */}
                        <Tabs
                          value={activeTab}
                          onValueChange={(v) => setActiveTab(v as "production" | "repair")}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                            <TabsList className="flex h-auto flex-wrap">
                              <TabsTrigger value="production" className="gap-2 text-xs">
                                <Scissors className="size-3.5 text-primary" />
                                <span>Cutting Production Dashboard</span>
                                {currentOrder && (
                                  <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold">
                                    {currentOrder.id}
                                  </span>
                                )}
                              </TabsTrigger>
                              <TabsTrigger value="repair" className="gap-2 text-xs">
                                <Wrench className="size-3.5 text-accent" />
                                <span>Cutting Repair Screen</span>
                                {cuttingReworkCases.length > 0 && (
                                  <span className="rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.5 text-[10px] font-semibold">
                                    {cuttingReworkCases.length}
                                  </span>
                                )}
                              </TabsTrigger>
                            </TabsList>

                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">Antenna:</span>
                              <span className="font-mono font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                                Scanner 3 (Table)
                              </span>
                            </div>
                          </div>

                          {/* ------------------------------------------------------------- */}
                          {/* TAB 1: CUTTING PRODUCTION DASHBOARD                           */}
                          {/* ------------------------------------------------------------- */}
                          <TabsContent value="production" className="mt-4 space-y-6">
                            {/* Fast Scanner 3 Antenna Hardware Interaction */}
                            <div className="rounded-lg border bg-card p-4 space-y-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <ScanLine className="size-3.5 text-primary" />
                                    Scanner 3 Antenna Interface (Fast Tap / Serial Reader)
                                  </h4>
                                  <p className="text-[11px] text-muted-foreground">
                                    {isScanningProducts
                                      ? "Step 2: Tap fresh unassigned RFID card to serialize cut panel set"
                                      : "Step 1: Tap Fabric Bundle Card (issued at Station 2) to load order"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="relative flex-1">
                                  <Input
                                    value={scanUid}
                                    onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        void handleScanner3Scan(scanUid);
                                      }
                                    }}
                                    placeholder="Enter or tap tag UID (e.g. 04A1B2C3)"
                                    className="font-mono font-bold tracking-wider text-sm bg-background pl-9"
                                  />
                                  <Radio className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                                </div>

                                <Button
                                  disabled={pending || !scanUid.trim()}
                                  onClick={() => void handleScanner3Scan(scanUid)}
                                  className="gap-2"
                                >
                                  <ScanLine className="size-4" />
                                  Scan at Scanner 3
                                </Button>
                              </div>
                            </div>

                            {/* Section B: Active Bundle & Order Selection Panel */}
                            {activeLot ? (
                              <section className="rounded-xl border bg-card p-5 space-y-4 shadow-xs">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                                  <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                      Active Scanned Bundle
                                    </span>
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                      <Package className="size-5 text-primary" />
                                      {activeLot.id} — {activeLot.material}
                                    </h3>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <StatusBadge status="QC Passed" tone="success" />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-xs h-7 gap-1"
                                      onClick={() => {
                                        setScannedLotId("");
                                        setIsScanningProducts(false);
                                      }}
                                    >
                                      <RotateCcw className="size-3" /> Change Bundle
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                                  <div className="rounded-md border bg-muted/20 p-2.5">
                                    <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                      Total Issued Length
                                    </span>
                                    <span className="font-bold text-sm text-foreground">
                                      {activeLot.receivedQty} m
                                    </span>
                                  </div>
                                  <div className="rounded-md border bg-muted/20 p-2.5">
                                    <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                      Remaining Roll Balance
                                    </span>
                                    <span className="font-bold text-sm text-foreground">
                                      {activeLot.balanceQty} m
                                    </span>
                                  </div>
                                  <div className="rounded-md border bg-muted/20 p-2.5">
                                    <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                      Bound Bundle Card UID
                                    </span>
                                    <span className="font-mono font-bold text-sm text-foreground">
                                      {activeLot.rfidUid}
                                    </span>
                                  </div>
                                  <div className="rounded-md border bg-muted/20 p-2.5">
                                    <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                      QC Status
                                    </span>
                                    <span className="font-bold text-sm text-success flex items-center gap-1">
                                      <CheckCircle2 className="size-3.5" /> Cleared at Dock
                                    </span>
                                  </div>
                                </div>

                                {/* Associated Orders Selector */}
                                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                                        Associated Production Orders (Issued at Raw Store)
                                      </h4>
                                      <p className="text-[11px] text-muted-foreground">
                                        Select the order to cut from this fabric bundle
                                      </p>
                                    </div>
                                    {currentOrder && (
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded font-bold ${
                                          isCurrentOrderCompleted
                                            ? "bg-destructive/10 text-destructive border border-destructive/20"
                                            : "bg-success-soft text-success-foreground border border-success/30"
                                        }`}
                                      >
                                        {isCurrentOrderCompleted ? "Already Cut" : "Ready for Cutting"}
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                                    <select
                                      value={currentOrderId}
                                      onChange={(e) => {
                                        setSelectedOrderId(e.target.value);
                                        setIsScanningProducts(false);
                                      }}
                                      disabled={isScanningProducts}
                                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                      {lotAssociatedOrders.map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.id} — {o.product} ({o.plannedQty} pcs planned) ·{" "}
                                          {isOrderCuttingComplete[o.id] || o.status === "completed"
                                            ? "Already Cut"
                                            : "Ready for Cutting"}
                                        </option>
                                      ))}
                                    </select>

                                    {!isScanningProducts ? (
                                      <Button
                                        onClick={handleStartScanningProducts}
                                        disabled={pending || !currentOrder || isCurrentOrderCompleted}
                                        className="gap-2 shrink-0 font-bold"
                                      >
                                        <Scissors className="size-4" />
                                        Start Scanning Products
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        onClick={() => setIsScanningProducts(false)}
                                        className="gap-2 shrink-0"
                                      >
                                        <RotateCcw className="size-4" />
                                        Pause Enrollment
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </section>
                            ) : (
                              <div className="rounded-xl border border-dashed border-primary/40 bg-card/60 p-8 text-center space-y-3">
                                <Package className="size-10 text-primary mx-auto opacity-70" />
                                <div className="space-y-1">
                                  <h3 className="font-bold text-base text-foreground">
                                    Step 1: First Scan — Present Fabric Bundle Tag
                                  </h3>
                                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                    Place the fabric roll tag (from Raw Store) on Scanner 3 to automatically load its
                                    specifications and linked production orders.
                                  </p>
                                </div>
                                <div className="pt-2 flex justify-center gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void handleScanner3Scan("04A1B2C3")}
                                    className="gap-1.5 font-mono text-xs"
                                  >
                                    <ScanLine className="size-3.5" />
                                    Scan Bundle FAB-001 (04A1B2C3)
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleScanner3Scan("04D4E5F6")}
                                    className="gap-1.5 font-mono text-xs"
                                  >
                                    <ScanLine className="size-3.5" />
                                    Scan Bundle FAB-002 (04D4E5F6)
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Section C: Cutting Progress & Serialized Products Table */}
                            {currentOrder && isScanningProducts && (
                              <section className="rounded-xl border-2 border-primary/40 bg-card p-5 space-y-5 shadow-sm">
                                {/* Active Order Banner */}
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="wt-id rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                                        ACTIVE ORDER
                                      </span>
                                      <h3 className="text-lg font-bold text-foreground">
                                        {currentOrder.id} — {currentOrder.product}
                                      </h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Style Code: <strong className="text-foreground">{currentOrder.styleCode}</strong> ·
                                      Target Run: <strong className="text-foreground">{currentOrder.plannedQty} pcs</strong>
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="font-semibold text-muted-foreground">Panel Size:</span>
                                      <select
                                        value={selectedSize}
                                        onChange={(e) => setSelectedSize(e.target.value)}
                                        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs font-bold shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      >
                                        {["S", "M", "L", "XL"].map((s) => (
                                          <option key={s} value={s}>
                                            Size {s}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <Button
                                      variant="default"
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold"
                                      onClick={handleOrderCuttingComplete}
                                    >
                                      <CheckSquare className="size-4" />
                                      Order Cutting Complete
                                    </Button>
                                  </div>
                                </div>

                                {/* Real-Time Cutting Counter */}
                                <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                                  <div className="flex items-center justify-between text-xs font-semibold">
                                    <span className="text-muted-foreground uppercase tracking-wider">
                                      Real-Time Cutting Progress:
                                    </span>
                                    <span className="text-sm font-bold tabular-nums text-foreground">
                                      {cutProgressCount} / {plannedCount} pcs cut ({progressPercent}%)
                                    </span>
                                  </div>
                                  <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-primary transition-all duration-300"
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    Tap fresh unassigned RFID card to serialize cut panel set. Lineage:{" "}
                                    <strong className="text-foreground font-mono">
                                      {activeLot?.id} ➔ {currentOrder.id} ➔ SHIRT-xxx
                                    </strong>
                                  </p>
                                </div>

                                {/* Enrolled Products Table */}
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                      <Tag className="size-3.5 text-primary" />
                                      Serialized Products Stream (Cut Panel Sets)
                                    </h4>
                                    <span className="text-xs text-muted-foreground font-medium">
                                      Next Station:{" "}
                                      <strong className="text-primary font-semibold">Station 4 (Stitching)</strong>
                                    </span>
                                  </div>

                                  <DataTable
                                    rows={orderGarments}
                                    rowKey={(g) => g.id}
                                    empty="No panel sets serialized yet. Present fresh RFID card at Scanner 3."
                                    columns={[
                                      {
                                        header: "Garment ID",
                                        cell: (g) => (
                                          <IdLink href={paths.garment(g.id)} id={g.id} />
                                        ),
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
                                        header: "Assigned Tag UID",
                                        cell: (g) =>
                                          g.rfidUid ? (
                                            <span className="font-mono text-xs font-bold text-success bg-success-soft px-2 py-0.5 rounded border border-success/30 flex items-center gap-1 w-fit">
                                              <Radio className="size-3" /> {g.rfidUid}
                                            </span>
                                          ) : (
                                            <span className="text-xs italic text-muted-foreground">Unassigned</span>
                                          ),
                                      },
                                      {
                                        header: "Hierarchy Lineage",
                                        cell: (g) => (
                                          <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                                            <span className="text-primary font-semibold">{activeLot?.id}</span>
                                            <ArrowRight className="size-3 text-muted-foreground" />
                                            <span className="text-foreground font-semibold">{currentOrder.id}</span>
                                            <ArrowRight className="size-3 text-muted-foreground" />
                                            <span className="text-success font-semibold">{g.id}</span>
                                          </span>
                                        ),
                                      },
                                      {
                                        header: "Next Stage",
                                        cell: () => (
                                          <span className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
                                            stitching (S4)
                                          </span>
                                        ),
                                      },
                                    ]}
                                  />
                                </div>
                              </section>
                            )}
                          </TabsContent>

                          {/* ------------------------------------------------------------- */}
                          {/* TAB 2: CUTTING REPAIR SCREEN (QC RE-SENT PRODUCTS)            */}
                          {/* ------------------------------------------------------------- */}
                          <TabsContent value="repair" className="mt-4 space-y-6">
                            <div className="rounded-lg border bg-card p-5 space-y-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                                <div>
                                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                                    <Wrench className="size-4 text-accent" />
                                    Cutting Department Rework &amp; Panel Recutting Queue
                                  </h3>
                                  <p className="text-xs text-muted-foreground">
                                    Garments failed by Quality Control (Station 6) and routed back to Cutting for panel correction
                                  </p>
                                </div>
                                <span className="rounded bg-destructive/10 border border-destructive/20 px-2.5 py-1 text-xs font-bold text-destructive">
                                  {cuttingReworkCases.length} Active Rework Cases
                                </span>
                              </div>

                              {cuttingReworkCases.length === 0 ? (
                                <EmptyState title="No Cutting Rework Cases">
                                  <p className="text-xs">
                                    No garments are currently quarantined or routed to Cutting for panel recutting.
                                  </p>
                                </EmptyState>
                              ) : (
                                <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                                  {/* Rework Cases Table */}
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                      Active QC Defect Items
                                    </h4>
                                    <div className="space-y-2">
                                      {cuttingReworkCases.map((rc) => {
                                        const garment = garments.find((g) => g.id === rc.garmentId);
                                        const isSelected = (selectedReworkId || cuttingReworkCases[0]?.id) === rc.id;

                                        return (
                                          <div
                                            key={rc.id}
                                            onClick={() => setSelectedReworkId(rc.id)}
                                            className={`rounded-lg border p-3 cursor-pointer transition-all ${
                                              isSelected
                                                ? "border-primary bg-primary/5 shadow-xs"
                                                : "border-border bg-card hover:border-primary/40"
                                            }`}
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="wt-id font-bold text-xs">{rc.id}</span>
                                              <span className="text-[10px] font-mono bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded font-bold">
                                                QC Hold Active
                                              </span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-xs">
                                              <strong className="text-foreground">{rc.garmentId}</strong>
                                              <span className="text-muted-foreground">·</span>
                                              <span className="text-muted-foreground truncate max-w-[200px]">
                                                {garment?.productName}
                                              </span>
                                            </div>
                                            <p className="mt-1 text-[11px] text-destructive font-medium line-clamp-2">
                                              Defect: {rc.defectReason}
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Rework Action Form */}
                                  {activeRework && (
                                    <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                                      <div className="border-b pb-3 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-semibold text-muted-foreground uppercase">
                                            Rework Case Details
                                          </span>
                                          <HoldBadge />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground">
                                          Case {activeRework.id} — Garment {activeRework.garmentId}
                                        </h4>
                                      </div>

                                      <div className="rounded-md border bg-card p-3 space-y-2 text-xs">
                                        <div>
                                          <span className="text-muted-foreground block text-[10px] font-semibold uppercase">
                                            QC Inspector Defect Note:
                                          </span>
                                          <p className="font-semibold text-destructive mt-0.5">
                                            {activeRework.defectReason}
                                          </p>
                                        </div>
                                        <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-[11px]">
                                          <div>
                                            <span className="text-muted-foreground block">Linked Order:</span>
                                            <strong className="text-foreground">ORDER-001</strong>
                                          </div>
                                          <div>
                                            <span className="text-muted-foreground block">Original Bundle:</span>
                                            <strong className="text-foreground">FAB-001</strong>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="space-y-3">
                                        <Field
                                          label="Corrective Action Notes (Recutting Log)"
                                          htmlFor="repair-notes"
                                          hint="Record the specific panels recut and replacement material lot used."
                                        >
                                          <Textarea
                                            id="repair-notes"
                                            rows={3}
                                            value={repairNotes}
                                            onChange={(e) => setRepairNotes(e.target.value)}
                                            className="text-xs"
                                            placeholder="e.g. Recut left collar panel from Lot FAB-001 and aligned notches"
                                          />
                                        </Field>

                                        <Button
                                          onClick={handleSubmitRepair}
                                          disabled={pending || !repairNotes.trim()}
                                          className="w-full gap-2 font-bold"
                                        >
                                          <CheckCircle2 className="size-4" />
                                          Submit Repair &amp; Route to QC Reinspection
                                        </Button>
                                        <p className="text-[11px] text-muted-foreground text-center">
                                          Submitting marks the rework case as repaired and automatically assigns an open reinspection task to Quality Control.
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TabsContent>
                        </Tabs>
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
