import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Box,
  Boxes,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Package,
  PackageCheck,
  PackagePlus,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  Warehouse,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { Garment, MaterialLot, Package as PkgType, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";

function generateFreshBoxUid(): string {
  return "04B" + Array.from({ length: 5 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
}

interface ScanFeedback {
  type: "accepted_box" | "accepted_product" | "sealed" | "rejected" | "idle";
  title: string;
  message: string;
  boxId?: string | undefined;
  tagUid?: string | undefined;
  garmentCode?: string | undefined;
  productStyle?: string | undefined;
  size?: string | undefined;
  itemIndex?: number | undefined;
  totalPacked?: number | undefined;
  rejectReason?: string | undefined;
  timestamp?: string | undefined;
}

export function PackingPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();

  // Queries
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  // Scanner 7 input & simulation
  const [scanUid, setScanUid] = useState<string>("04B5C6D7");
  const [isArmingForBox, setIsArmingForBox] = useState<boolean>(false);
  const [localActiveBoxId, setLocalActiveBoxId] = useState<string | null>(null);

  // Live scan feedback box state
  const [feedback, setFeedback] = useState<ScanFeedback>({
    type: "idle",
    title: "Scanner 7 Ready — Awaiting Clean Box Tag",
    message: "Click 'Scan Box' below to arm Scanner 7 for a clean container RFID tag (zero prior history required).",
  });

  const isPackingStaff = me.role === "M" || me.department === "packing";

  return (
    <Loadable query={qFulfilment}>
      {(fulfilment) => (
        <Loadable query={qGarments}>
          {(garments) => (
            <Loadable query={qLots}>
              {(lots) => {
                const packages: PkgType[] = fulfilment.packages || [];

                // Determine active open box
                // Priority: explicitly selected/created local box > existing open package
                const openPackages = packages.filter((p) => p.status === "open");
                const activeBox: PkgType | undefined =
                  packages.find((p) => p.id === localActiveBoxId && p.status === "open") ||
                  openPackages[0];

                const activeBoxId = activeBox?.id;
                const isBoxOpen = !!activeBox && activeBox.status === "open";

                // Garments inside the active box
                const packedGarments: Garment[] = isBoxOpen
                  ? garments.filter(
                      (g) =>
                        g.packageId === activeBox.id ||
                        activeBox.garmentIds.includes(g.id),
                    )
                  : [];

                // Garments waiting for packaging (Cleared from Final QC, not yet packed)
                const readyForPacking: Garment[] = garments.filter(
                  (g) =>
                    !g.packageId &&
                    !g.hold &&
                    (g.disposition === "passed" || g.disposition === "released") &&
                    (g.stage === "packing" || (g.stage as string) === "final-qc"),
                );

                // Centralized Scanner 7 Tag Resolution & Guard Pipeline
                const handleScanner7Scan = async (rawUid: string) => {
                  const uid = rawUid.trim().toUpperCase();
                  if (!uid) return;

                  // -------------------------------------------------------------
                  // RULE E: Post-"Box Filled" Lockdown Check
                  // -------------------------------------------------------------
                  if (!isBoxOpen && !isArmingForBox) {
                    // Check if tag is a product tag attempted when no box is open
                    const isGarmentTag = garments.some((g) => g.rfidUid === uid);
                    if (isGarmentTag) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Scan Box First",
                        message: "Rejected: No active box open. Click 'Scan Box' and scan a box tag first.",
                        rejectReason: "Rejected: No active box open. Click 'Scan Box' and scan a box tag first.",
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }
                  }

                  // -------------------------------------------------------------
                  // FLOW STEP 2: Scanning a Clean Master Box Tag
                  // -------------------------------------------------------------
                  if (isArmingForBox || !isBoxOpen) {
                    // RULE A: Fresh Box Tag Rule (Zero History Requirement)
                    // If tag was previously used for another box, an issued fabric bundle, or an existing garment
                    const isUsedByLot = lots.some((l) => l.rfidUid === uid);
                    const isUsedByGarment = garments.some((g) => g.rfidUid === uid);
                    const isUsedByPackage = packages.some(
                      (p) => p.rfidUid === uid || p.id === uid || (p as any).code === uid,
                    );

                    if (isUsedByLot || isUsedByGarment || isUsedByPackage) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Box Tag Already Used",
                        message: "Rejected: Tag already has history (Assigned to Lot/Garment/Box). Use a clean, unassigned box card.",
                        rejectReason: "Rejected: Tag already has history (Assigned to Lot/Garment/Box). Use a clean, unassigned box card.",
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // RULE D Check: Ensure not a fabric bundle card or garment card
                    if (isUsedByLot || isUsedByGarment) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Invalid Tag Type",
                        message: "Rejected: Invalid tag type. Expected an enrolled box tag, got a bundle/garment card.",
                        rejectReason: "Rejected: Invalid tag type. Expected an enrolled box tag, got a bundle/garment card.",
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Fresh Box Tag Validated! Create new Box Session
                    // Generate clean sequential BOX ID
                    const existingBoxNums = packages
                      .map((p) => {
                        const m = p.id.match(/BOX-(\d+)/i) || p.id.match(/PKG-(\d+)/i);
                        return m ? parseInt(m[1]!, 10) : 0;
                      })
                      .filter((n) => !isNaN(n));
                    const nextNum = existingBoxNums.length > 0 ? Math.max(...existingBoxNums) + 1 : 5;
                    const newBoxId = `BOX-${String(nextNum).padStart(3, "0")}`;

                    void run(
                      async (c) => {
                        return await c.createPackage(uid, newBoxId);
                      },
                      () => {
                        setLocalActiveBoxId(newBoxId);
                        setIsArmingForBox(false);
                        setFeedback({
                          type: "accepted_box",
                          title: `Accepted Box: ${newBoxId}`,
                          message: "Box Initialized → Ready to Pack Products",
                          boxId: newBoxId,
                          tagUid: uid,
                          timestamp: new Date().toLocaleTimeString(),
                        });
                        return `Box ${newBoxId} registered with Tag ${uid}. Ready for garment packing.`;
                      },
                    );
                    return;
                  }

                  // -------------------------------------------------------------
                  // FLOW STEP 3: Subsequent Scans: Finished Garment Tags
                  // -------------------------------------------------------------
                  if (isBoxOpen && activeBox) {
                    // Check if operator scans an unassigned or bundle tag
                    const matchingLot = lots.find((l) => l.rfidUid === uid);
                    if (matchingLot) {
                      // RULE D: Authentic Product Tag Rule (No Bundle Cards)
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Invalid Tag Type: Bundle Card",
                        message: "Rejected: Invalid tag type. Expected an enrolled garment tag, got a bundle/unknown card.",
                        rejectReason: "Rejected: Invalid tag type. Expected an enrolled garment tag, got a bundle/unknown card.",
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Locate Garment by Tag UID
                    const garment = garments.find((g) => g.rfidUid === uid);
                    if (!garment) {
                      // Tag is unrecognised / not an enrolled garment tag
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Invalid Tag Type",
                        message: "Rejected: Invalid tag type. Expected an enrolled garment tag, got a bundle/unknown card.",
                        rejectReason: "Rejected: Invalid tag type. Expected an enrolled garment tag, got a bundle/unknown card.",
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // RULE C1: Quality Hold Guard
                    if (garment.hold) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — QC Not Passed / Active Hold",
                        message: `Rejected: Garment ${garment.id} has an active Quality Hold. Cannot pack.`,
                        rejectReason: `Rejected: Garment ${garment.id} has an active Quality Hold. Cannot pack.`,
                        garmentCode: garment.id,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // RULE C2: Mandatory QC Clearance & Station Lineage Guard
                    if (garment.disposition !== "passed" && garment.disposition !== "released") {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — QC Clearance Required",
                        message: `Rejected: Garment ${garment.id} has not passed Final QC (Station 6).`,
                        rejectReason: `Rejected: Garment ${garment.id} has not passed Final QC (Station 6).`,
                        garmentCode: garment.id,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // RULE C3: Duplicate Packing Guard
                    if (garment.packageId) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Duplicate Packing Guard",
                        message: `Rejected: Garment ${garment.id} is already packed inside ${garment.packageId}.`,
                        rejectReason: `Rejected: Garment ${garment.id} is already packed inside ${garment.packageId}.`,
                        garmentCode: garment.id,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Valid Garment Scan Accepted! Add to Active Box
                    const currentPackedCount = packedGarments.length + 1;
                    void run(
                      async (c) => {
                        return await c.packGarment(garment.id, activeBox.id);
                      },
                      () => {
                        setFeedback({
                          type: "accepted_product",
                          title: `Accepted Product: ${garment.id}`,
                          message: `Linked into Box ${activeBox.id} (Item ${currentPackedCount} of Box)`,
                          boxId: activeBox.id,
                          garmentCode: garment.id,
                          productStyle: garment.productName,
                          size: (garment as any).size || "Standard",
                          itemIndex: currentPackedCount,
                          totalPacked: currentPackedCount,
                          tagUid: uid,
                          timestamp: new Date().toLocaleTimeString(),
                        });
                        return `Garment ${garment.id} packed into ${activeBox.id}. Item count: ${currentPackedCount}.`;
                      },
                    );
                    return;
                  }
                };

                // Operator Action: Finalize "Box Filled"
                const handleBoxFilled = async () => {
                  if (!activeBox) return;
                  if (packedGarments.length === 0) {
                    setFeedback({
                      type: "rejected",
                      title: "Cannot Seal Empty Box",
                      message: "Cannot seal an empty box. Scan at least one finished garment tag first.",
                      rejectReason: "Cannot seal an empty box. Scan at least one finished garment tag first.",
                      timestamp: new Date().toLocaleTimeString(),
                    });
                    return;
                  }

                  void run(
                    async (c) => {
                      await c.sealPackage(activeBox.id);
                    },
                    () => {
                      const sealedCount = packedGarments.length;
                      const sealedId = activeBox.id;
                      setLocalActiveBoxId(null);
                      setIsArmingForBox(false);
                      setFeedback({
                        type: "sealed",
                        title: `Box ${sealedId} Sealed & Frozen`,
                        message: `Carton manifest frozen (${sealedCount} units). Container routed to Station 8 (Warehouse Inbound). Ready for next box.`,
                        boxId: sealedId,
                        totalPacked: sealedCount,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return `Box ${sealedId} sealed with ${sealedCount} units. Routed to Station 8 (Warehouse).`;
                    },
                  );
                };

                return (
                  <div className="space-y-6">
                    {/* RFID Hierarchy Architecture Banner */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5 text-xs text-muted-foreground shadow-xs">
                      <div className="flex items-center gap-2">
                        <Tag className="size-4 text-primary" />
                        <span className="font-semibold text-foreground">
                          Factory RFID Hierarchy (Third Tag Type):
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded bg-muted px-2 py-0.5 font-mono">
                          1. Bundle Tag (Raw Store & Cutting)
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <span className="rounded bg-muted px-2 py-0.5 font-mono">
                          2. Product Tag (Garment ➔ QC)
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <span className="rounded bg-primary/20 text-primary font-bold px-2 py-0.5 font-mono border border-primary/30">
                          3. Box Tag (Packing ➔ Warehouse ➔ Dispatch)
                        </span>
                      </div>
                    </div>

                    {/* Section 2.A: Header & Station Hardware Status */}
                    <section
                      aria-label="Packaging Station Hardware Status"
                      className="relative overflow-hidden rounded-xl border-2 border-primary/25 bg-card p-5 shadow-xs"
                    >
                      <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                              Station 7 · Packaging & Aggregation (Scanner 7)
                            </span>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                              Bench Reader: Armed
                            </span>
                            {isBoxOpen ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                <Box className="size-3" />
                                Packing Mode: {activeBox.id}
                              </span>
                            ) : isArmingForBox ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse">
                                <Radio className="size-3" />
                                Awaiting Box Card Scan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                Idle · Click &quot;Scan Box&quot;
                              </span>
                            )}
                          </div>
                          <h2 className="text-xl font-bold tracking-tight text-foreground">
                            Packaging & Master Carton Aggregation
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            Inspected garment packing station. Scans clean Master Box Tags, binds finished
                            shirts into shipping cartons, and advances container batches to Station 8 (Warehouse).
                          </p>
                        </div>

                        <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3 text-xs md:min-w-[230px]">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Active Operator:</span>
                            <span className="font-semibold text-foreground">
                              {me.displayName || me.username}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Department:</span>
                            <span className="font-mono text-primary font-semibold">
                              {me.department}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Scanner Hardware:</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                              Active / Ready
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Live Scan Feedback Box */}
                      <div className="mt-4 pt-4 border-t">
                        <div
                          className={`rounded-lg border p-4 shadow-xs transition-all duration-200 ${
                            feedback.type === "accepted_box"
                              ? "border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-100"
                              : feedback.type === "accepted_product"
                              ? "border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-100"
                              : feedback.type === "sealed"
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : feedback.type === "rejected"
                              ? "border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive-foreground"
                              : "border-primary/20 bg-muted/30 text-foreground"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {feedback.type === "accepted_box" || feedback.type === "accepted_product" ? (
                              <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            ) : feedback.type === "sealed" ? (
                              <PackageCheck className="size-6 text-primary shrink-0 mt-0.5" />
                            ) : feedback.type === "rejected" ? (
                              <ShieldAlert className="size-6 text-destructive shrink-0 mt-0.5" />
                            ) : (
                              <Radio className="size-6 text-primary shrink-0 mt-0.5 animate-pulse" />
                            )}

                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold tracking-tight">
                                  {feedback.title}
                                </h3>
                                {feedback.timestamp && (
                                  <span className="text-[11px] font-mono text-muted-foreground">
                                    {feedback.timestamp}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium leading-relaxed opacity-95">
                                {feedback.message}
                              </p>

                              {/* Rich Details Chips */}
                              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
                                {feedback.boxId && (
                                  <span className="rounded bg-background/80 px-2 py-0.5 border shadow-2xs font-semibold">
                                    Box: {feedback.boxId}
                                  </span>
                                )}
                                {feedback.tagUid && (
                                  <span className="rounded bg-background/80 px-2 py-0.5 border shadow-2xs">
                                    UID: {feedback.tagUid}
                                  </span>
                                )}
                                {feedback.garmentCode && (
                                  <span className="rounded bg-background/80 px-2 py-0.5 border shadow-2xs font-semibold">
                                    Garment: {feedback.garmentCode}
                                  </span>
                                )}
                                {feedback.productStyle && (
                                  <span className="rounded bg-background/80 px-2 py-0.5 border shadow-2xs text-muted-foreground">
                                    Style: {feedback.productStyle} ({feedback.size ?? "M"})
                                  </span>
                                )}
                                {feedback.totalPacked !== undefined && (
                                  <span className="rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 border border-emerald-500/30">
                                    Carton Total: {feedback.totalPacked} units
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Section 2.B: Active Container Manifest Panel */}
                    <div className="grid gap-6 lg:grid-cols-3">
                      <div className="lg:col-span-1 space-y-4">
                        <Section
                          title="Container Session"
                          description="Manage active Master Carton manifest."
                        >
                          {!isBoxOpen ? (
                            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-muted/20 p-6 text-center space-y-4">
                              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Boxes className="size-6" />
                              </div>
                              <div className="space-y-1">
                                <h3 className="font-bold text-foreground">No Active Box Open</h3>
                                <p className="text-xs text-muted-foreground">
                                  Click &quot;Scan Box&quot; to arm Scanner 7 and scan an unassigned Master Box Tag (zero history).
                                </p>
                              </div>

                              <Button
                                size="lg"
                                className="w-full font-bold shadow-md gap-2"
                                disabled={pending || !isPackingStaff}
                                onClick={() => {
                                  setIsArmingForBox(true);
                                  setFeedback({
                                    type: "idle",
                                    title: "Scanner 7 Armed: Scan Master Box Tag",
                                    message: "Awaiting clean Box Tag: Present an unassigned RFID tag on Scanner 7 to initiate container.",
                                    timestamp: new Date().toLocaleTimeString(),
                                  });
                                }}
                              >
                                <Radio className="size-4 animate-pulse" />
                                Scan Box
                              </Button>

                              {isArmingForBox && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium animate-pulse">
                                  Bench antenna armed for Container Tag. Tap fresh tag below.
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-xl border-2 border-emerald-500/30 bg-card p-5 space-y-4 shadow-sm">
                              {/* Active Box Banner */}
                              <div className="flex items-center justify-between pb-3 border-b">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Master Carton ID
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Box className="size-5 text-emerald-600 dark:text-emerald-400" />
                                    <span className="font-mono text-lg font-black text-foreground">
                                      {activeBox.id}
                                    </span>
                                  </div>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                  open / packing
                                </span>
                              </div>

                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between py-1 border-b border-muted">
                                  <span className="text-muted-foreground">Bound Box Tag:</span>
                                  <span className="font-mono font-bold text-primary">
                                    {activeBox.rfidUid || "04B5C6D7"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between py-1 border-b border-muted">
                                  <span className="text-muted-foreground">Created:</span>
                                  <span>{fmt.date(activeBox.createdAt)}</span>
                                </div>
                                <div className="flex items-center justify-between py-1">
                                  <span className="text-muted-foreground">Downstream Route:</span>
                                  <span className="font-medium text-foreground">
                                    Station 8 (Warehouse)
                                  </span>
                                </div>
                              </div>

                              {/* Live Carton Unit Counter */}
                              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-center space-y-1">
                                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                                  Live Carton Unit Count
                                </span>
                                <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                  {packedGarments.length}
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  units packed in manifest
                                </span>
                              </div>

                              {/* Box Filled Action Button */}
                              <Button
                                size="lg"
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md gap-2"
                                disabled={pending || packedGarments.length === 0 || !isPackingStaff}
                                onClick={() => void handleBoxFilled()}
                              >
                                <PackageCheck className="size-4" />
                                Box Filled
                              </Button>

                              <p className="text-[11px] text-center text-muted-foreground">
                                Finalizes and seals {activeBox.id}, freezes container manifest, and generates Station 8 intake task.
                              </p>
                            </div>
                          )}
                        </Section>
                      </div>

                      {/* Section 2.C: Packed Products Manifest Table */}
                      <div className="lg:col-span-2 space-y-4">
                        <Section
                          title={
                            isBoxOpen
                              ? `Packed Products Manifest · ${activeBox.id} (${packedGarments.length} units)`
                              : "Packed Products Manifest"
                          }
                          description="Real-time manifest of finished shirts bound into the active carton."
                        >
                          {!isBoxOpen ? (
                            <EmptyState title="No active box open">
                              <p className="text-xs text-muted-foreground">
                                Click &quot;Scan Box&quot; and scan a clean Master Box Tag to view and build the container manifest.
                              </p>
                            </EmptyState>
                          ) : packedGarments.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
                              <PackagePlus className="mx-auto size-8 text-muted-foreground/60" />
                              <h4 className="text-sm font-semibold">Box is Ready for Products</h4>
                              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                Scan or tap finished garment tags below to link inspected shirts into {activeBox.id}.
                              </p>
                            </div>
                          ) : (
                            <DataTable
                              rows={packedGarments}
                              rowKey={(g) => g.id}
                              empty="No products in manifest."
                              columns={[
                                {
                                  header: "Garment ID",
                                  cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                                },
                                {
                                  header: "Product Details",
                                  cell: (g) => (
                                    <div className="space-y-0.5">
                                      <div className="font-medium text-foreground">
                                        {g.productName}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground">
                                        Order: {g.orderId} · Size: {(g as any).size ?? "M"}
                                      </div>
                                    </div>
                                  ),
                                },
                                {
                                  header: "Quality Clearance",
                                  cell: (g) => (
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                        <CheckCircle2 className="size-3 text-emerald-600" />
                                        Final QC: Passed
                                      </span>
                                      {g.hold && <HoldBadge />}
                                    </div>
                                  ),
                                },
                                {
                                  header: "Tag UID",
                                  cell: (g) => (
                                    <span className="font-mono text-xs text-primary font-semibold">
                                      {g.rfidUid || "—"}
                                    </span>
                                  ),
                                },
                              ]}
                            />
                          )}
                        </Section>
                      </div>
                    </div>

                    {/* Section 3: Hardware Simulation & Rapid Operational Testing Bar */}
                    <Section
                      title="Scanner 7 Hardware Bench Simulator"
                      description="Simulate real RFID reader card scans on Station 7 to verify the container aggregation workflow and all 5 backend guards."
                    >
                      <div className="rounded-xl border bg-card p-5 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <Field
                              label="Bench Antenna Reader (Scanner 7 UID)"
                              htmlFor="packing-scan-uid"
                              hint="Present an RFID tag to Scanner 7 or enter tag UID manually."
                            >
                              <Input
                                id="packing-scan-uid"
                                value={scanUid}
                                onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                className="font-mono uppercase text-sm"
                                placeholder="e.g. 04B5C6D7"
                              />
                            </Field>
                          </div>

                          <Button
                            disabled={pending || !scanUid.trim() || !isPackingStaff}
                            onClick={() => void handleScanner7Scan(scanUid)}
                            className="font-bold gap-2 shrink-0"
                          >
                            <ScanLine className="size-4" />
                            Simulate Scan on Scanner 7
                          </Button>
                        </div>

                        {/* Testing Aids & Scenario Chips */}
                        <div className="space-y-2 pt-2 border-t">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Interactive Fast-Test Scenarios & Guard Verification:
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Fresh Box Tag */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50"
                              onClick={() => {
                                const clean = generateFreshBoxUid();
                                setScanUid(clean);
                                void handleScanner7Scan(clean);
                              }}
                            >
                              <Sparkles className="size-3 mr-1 text-emerald-600" />
                              Scan Fresh Box Tag
                            </Button>

                            {/* Ready Garment Scan */}
                            {readyForPacking[0]?.rfidUid && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-xs border-primary/40 text-primary"
                                onClick={() => {
                                  const uid = readyForPacking[0]!.rfidUid!;
                                  setScanUid(uid);
                                  void handleScanner7Scan(uid);
                                }}
                              >
                                <Tag className="size-3 mr-1" />
                                Pack Next Ready Shirt ({readyForPacking[0].id})
                              </Button>
                            )}

                            {/* Test Rule C: Active Quality Hold */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setScanUid("04DAEBFC"); // SHIRT-002 seed tag with hold
                                void handleScanner7Scan("04DAEBFC");
                              }}
                            >
                              <ShieldAlert className="size-3 mr-1 text-destructive" />
                              Test Held Shirt (Rule C: Hold Block)
                            </Button>

                            {/* Test Rule D: Invalid Tag Type (Bundle Card) */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50"
                              onClick={() => {
                                setScanUid("04A1B2C3"); // FAB-001 bundle tag
                                void handleScanner7Scan("04A1B2C3");
                              }}
                            >
                              <AlertTriangle className="size-3 mr-1 text-amber-600" />
                              Test Bundle Tag (Rule D: No Bundle Cards)
                            </Button>

                            {/* Test Rule A: Already Used Tag */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs border-muted-foreground/30 text-muted-foreground"
                              onClick={() => {
                                setScanUid("04A7B8C9"); // Already assigned tag
                                void handleScanner7Scan("04A7B8C9");
                              }}
                            >
                              <RotateCcw className="size-3 mr-1" />
                              Test Used Tag (Rule A: Zero History)
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Section>

                    {/* Section 4: Available Garments Awaiting Packing */}
                    <Section
                      title="Garments Cleared from Final QC (Awaiting Packaging)"
                      description="Serialized shirts that passed Station 6 inspection with zero active holds, ready to pack into shipping cartons."
                    >
                      <DataTable
                        rows={readyForPacking}
                        rowKey={(g) => g.id}
                        empty="No garments currently awaiting packaging. All cleared items are packed or in production."
                        columns={[
                          {
                            header: "Garment ID",
                            cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                          },
                          {
                            header: "Product Style",
                            cell: (g) => g.productName,
                          },
                          {
                            header: "Order",
                            cell: (g) => <span className="font-mono text-xs">{g.orderId}</span>,
                          },
                          {
                            header: "Tag UID",
                            cell: (g) =>
                              g.rfidUid ? (
                                <span className="font-mono text-xs font-semibold text-primary">
                                  {g.rfidUid}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              ),
                          },
                          {
                            header: "Quality Status",
                            cell: (g) => (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="size-3" />
                                  Passed
                                </span>
                                {g.hold && <HoldBadge />}
                              </div>
                            ),
                          },
                          {
                            header: "Action",
                            cell: (g) => (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground gap-1 font-semibold"
                                disabled={pending || !isPackingStaff || !g.rfidUid}
                                onClick={() => {
                                  if (g.rfidUid) {
                                    setScanUid(g.rfidUid);
                                    void handleScanner7Scan(g.rfidUid);
                                  }
                                }}
                              >
                                <ScanLine className="size-3" />
                                Tap Tag
                              </Button>
                            ),
                          },
                        ]}
                      />
                    </Section>
                  </div>
                );
              }}
            </Loadable>
          )}
        </Loadable>
      )}
    </Loadable>
  );
}
