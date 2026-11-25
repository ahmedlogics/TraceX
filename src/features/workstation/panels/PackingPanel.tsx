import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Box,
  Boxes,
  CheckCircle2,
  PackageCheck,
  PackagePlus,
  Radio,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/wt/DataTable";
import { fmt, IdLink, Section } from "@/components/wt/layout";
import { HoldBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { Garment, MaterialLot, Package as PkgType } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { getDataMode } from "@/lib/data/provider";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";

function generateFreshBoxUid(): string {
  return "04B" + Array.from({ length: 5 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join("");
}

interface ScanFeedback {
  type: "accepted_box" | "accepted_product" | "sealed" | "rejected" | "waiting_box" | "idle";
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
  const isMock = getDataMode() === "mock";
  const { run, pending } = useWtAction();

  // Queries
  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());
  const qLots = useWtQuery(["lots"], (c) => c.listLots());

  // Hardware Scanner State
  const [isWaitingForBoxScan, setIsWaitingForBoxScan] = useState<boolean>(false);
  const [localActiveBoxId, setLocalActiveBoxId] = useState<string | null>(null);
  const [testBoxUid, setTestBoxUid] = useState<string>(() => generateFreshBoxUid());

  // Durable live scan feedback box state
  const [feedback, setFeedback] = useState<ScanFeedback>({
    type: "idle",
    title: "Station 7 — Packaging & Master Carton Aggregation",
    message: "Click 'Scan Box Tag' below. Next scanned tag on hardware will be bound as a clean master shipping carton.",
  });

  const isPackingStaff =
    me.role === "M" || me.role === "A" || me.role === "L" || me.department === "packing";

  return (
    <Loadable query={qFulfilment}>
      {(fulfilment) => (
        <Loadable query={qGarments}>
          {(garments) => (
            <Loadable query={qLots}>
              {(lots) => {
                const packages: PkgType[] = fulfilment.packages || [];

                // Determine active open box:
                // Priority: explicitly initialized local box > any existing open package
                const openPackages = packages.filter((p) => p.status === "open");
                const activeBox: PkgType | undefined =
                  packages.find((p) => p.id === localActiveBoxId && p.status === "open") ||
                  openPackages[0];

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

                // Centralized Hardware Scan Processor for Scanner 7
                const handleTagScan = async (rawUid: string) => {
                  const uid = rawUid.trim().toUpperCase();
                  if (!uid || pending || !isPackingStaff) return;

                  // -------------------------------------------------------------
                  // 1. STATE: Waiting for clean Box Tag Scan
                  // -------------------------------------------------------------
                  if (isWaitingForBoxScan) {
                    // Rule A: Clean Box Tag Rule (Zero History Requirement)
                    const isUsedByLot = lots.some((l) => l.rfidUid === uid);
                    const isUsedByGarment = garments.some((g) => g.rfidUid === uid);
                    const isUsedByPackage = packages.some(
                      (p) => p.rfidUid === uid || p.id === uid || (p as any).code === uid,
                    );

                    if (isUsedByLot || isUsedByGarment || isUsedByPackage) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Tag Already Has History",
                        message: `Rejected: Tag ${uid} is already assigned to a ${
                          isUsedByLot ? "Fabric Bundle" : isUsedByGarment ? "Garment" : "Box"
                        }. Please present a fresh, unassigned Box RFID tag.`,
                        rejectReason: `Tag ${uid} already bound in production lineage. Clean box card required.`,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Fresh Box Tag Validated! Initialize new Master Box
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
                        setIsWaitingForBoxScan(false);
                        setTestBoxUid(generateFreshBoxUid());
                        setFeedback({
                          type: "accepted_box",
                          title: `✓ Box ${newBoxId} Initialized`,
                          message: `Bound with Tag ${uid}. Station 7 is now in Packing Mode — Scan finished product tags one by one on hardware.`,
                          boxId: newBoxId,
                          tagUid: uid,
                          timestamp: new Date().toLocaleTimeString(),
                        });
                        void qFulfilment.refetch();
                        void qGarments.refetch();
                        return `Box ${newBoxId} registered with Tag ${uid}. Ready for product packing.`;
                      },
                    );
                    return;
                  }

                  // -------------------------------------------------------------
                  // 2. STATE: Box is Open -> Associate Product Tags One-by-One
                  // -------------------------------------------------------------
                  if (isBoxOpen && activeBox) {
                    // Check if tag is a fabric bundle card
                    const matchingLot = lots.find((l) => l.rfidUid === uid);
                    if (matchingLot) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Invalid Tag Type: Bundle Card",
                        message: `Rejected: Scanned tag ${uid} belongs to fabric lot ${matchingLot.id}. Expected an individual garment product tag.`,
                        rejectReason: `Tag belongs to fabric lot ${matchingLot.id}. Not an enrolled garment card.`,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Check if tag is another box tag
                    const matchingPkg = packages.find((p) => p.rfidUid === uid || p.id === uid);
                    if (matchingPkg) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Invalid Tag Type: Box Tag",
                        message: `Rejected: Scanned tag ${uid} belongs to carton ${matchingPkg.id}. Expected a product garment tag.`,
                        rejectReason: `Tag belongs to box ${matchingPkg.id}. Not a garment tag.`,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Locate Garment by Tag UID or ID
                    const garment = garments.find((g) => g.rfidUid === uid || g.id.toUpperCase() === uid);
                    if (!garment) {
                      setFeedback({
                        type: "rejected",
                        title: "Scan Rejected — Unrecognised Garment Tag",
                        message: `Rejected: Tag ${uid} is not bound to any registered garment in the system.`,
                        rejectReason: `UID ${uid} is not recognised as an enrolled garment tag.`,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Quality Hold check
                    if (garment.hold) {
                      setFeedback({
                        type: "rejected",
                        title: `Scan Rejected — Active Quality Hold (${garment.id})`,
                        message: `Rejected: Garment ${garment.id} is locked under an active quality hold. Cannot pack into box.`,
                        rejectReason: `Garment ${garment.id} is on quality hold and cannot be packed.`,
                        garmentCode: garment.id,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Final QC Passed check
                    if (garment.disposition !== "passed" && garment.disposition !== "released") {
                      setFeedback({
                        type: "rejected",
                        title: `Scan Rejected — QC Clearance Required (${garment.id})`,
                        message: `Rejected: Garment ${garment.id} has not passed Final QC (disposition: ${garment.disposition}).`,
                        rejectReason: `Garment ${garment.id} has not passed Final QC inspection.`,
                        garmentCode: garment.id,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Stage / Station lineage check
                    if (garment.stage !== "packing" && (garment.stage as string) !== "final-qc") {
                      setFeedback({
                        type: "rejected",
                        title: `Scan Rejected — Wrong Lifecycle Stage (${garment.id})`,
                        message: `Rejected: Garment ${garment.id} is at stage '${garment.stage}', not ready for packing.`,
                        rejectReason: `Garment ${garment.id} is at stage '${garment.stage}'.`,
                        garmentCode: garment.id,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // Duplicate packing check
                    if (garment.packageId) {
                      setFeedback({
                        type: "rejected",
                        title: `Scan Rejected — Already Packed (${garment.id})`,
                        message: `Rejected: Garment ${garment.id} is already packed inside carton ${garment.packageId}.`,
                        rejectReason: `Garment ${garment.id} is already packed into ${garment.packageId}.`,
                        garmentCode: garment.id,
                        tagUid: uid,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      return;
                    }

                    // All checks passed! Pack garment into active box
                    const newCount = packedGarments.length + 1;
                    void run(
                      async (c) => {
                        return await c.packGarment(garment.id, activeBox.id);
                      },
                      () => {
                        setFeedback({
                          type: "accepted_product",
                          title: `✓ Product Added: ${garment.id}`,
                          message: `${garment.productName} (Size: ${(garment as any).size ?? "M"}) linked into Box ${activeBox.id} · Carton Total: ${newCount} units.`,
                          boxId: activeBox.id,
                          garmentCode: garment.id,
                          productStyle: garment.productName,
                          size: (garment as any).size || "Standard",
                          itemIndex: newCount,
                          totalPacked: newCount,
                          tagUid: uid,
                          timestamp: new Date().toLocaleTimeString(),
                        });
                        void qFulfilment.refetch();
                        void qGarments.refetch();
                        return `✓ Garment ${garment.id} packed into ${activeBox.id} (Item #${newCount}).`;
                      },
                    );
                    return;
                  }

                  // -------------------------------------------------------------
                  // 3. STATE: No box open and not waiting for box scan
                  // -------------------------------------------------------------
                  setFeedback({
                    type: "rejected",
                    title: "Scan Rejected — Scan Box First",
                    message: "Rejected: No active box open. Click 'Scan Box Tag' first before scanning product tags.",
                    rejectReason: "No active box open. Box tag must be scanned first.",
                    tagUid: uid,
                    timestamp: new Date().toLocaleTimeString(),
                  });
                };

                // Operator Action: Finalize "Box Filled"
                const handleBoxFilled = async () => {
                  if (!activeBox) return;
                  if (packedGarments.length === 0) {
                    setFeedback({
                      type: "rejected",
                      title: "Cannot Seal Empty Box",
                      message: "Cannot seal an empty carton. Please scan at least one finished product tag first.",
                      rejectReason: "Cannot seal an empty box. Minimum 1 product required.",
                      timestamp: new Date().toLocaleTimeString(),
                    });
                    return;
                  }

                  void run(
                    async (c) => {
                      await c.sealPackage(activeBox.id);
                    },
                    () => {
                      const count = packedGarments.length;
                      const sealedId = activeBox.id;
                      setLocalActiveBoxId(null);
                      setIsWaitingForBoxScan(false);
                      setTestBoxUid(generateFreshBoxUid());
                      setFeedback({
                        type: "sealed",
                        title: `✓ Box ${sealedId} Packed & Sealed`,
                        message: `Carton manifest frozen (${count} units). Scans unlinked. Box routed to Station 8 (Warehouse Intake). Ready for next box!`,
                        boxId: sealedId,
                        totalPacked: count,
                        timestamp: new Date().toLocaleTimeString(),
                      });
                      void qFulfilment.refetch();
                      void qGarments.refetch();
                      return `✓ Box ${sealedId} sealed with ${count} units. Routed to Warehouse.`;
                    },
                  );
                };

                // Auto-detect hardware scans arriving via MQTT/backend reader at Station 7
                const lastSeenOutcomeRef = useRef<string | null>(null);
                useEffect(() => {
                  const outcome = stationData?.lastScanOutcome;
                  if (!outcome) return;
                  if (outcome.at && outcome.at !== lastSeenOutcomeRef.current) {
                    lastSeenOutcomeRef.current = outcome.at;
                    if (outcome.uid) {
                      void handleTagScan(outcome.uid);
                    }
                  }
                }, [stationData?.lastScanOutcome]);

                // Global USB Keyboard Wedge RFID reader listener for Station 7
                // Zero manual typing/selecting needed: barcode/RFID reader automatically triggers scan
                useEffect(() => {
                  let buffer = "";
                  let lastKeyTime = Date.now();

                  const handleKeyDown = (e: KeyboardEvent) => {
                    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
                    if (tag === "input" || tag === "textarea") return;

                    const now = Date.now();
                    if (now - lastKeyTime > 500) {
                      buffer = "";
                    }
                    lastKeyTime = now;

                    if (e.key === "Enter") {
                      const scanned = buffer.trim().toUpperCase();
                      if (scanned) {
                        void handleTagScan(scanned);
                      }
                      buffer = "";
                    } else if (e.key.length === 1) {
                      buffer += e.key;
                    }
                  };

                  window.addEventListener("keydown", handleKeyDown);
                  return () => window.removeEventListener("keydown", handleKeyDown);
                }, [isWaitingForBoxScan, isBoxOpen, activeBox, packedGarments, lots, garments, packages]);

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

                    {/* Station 7 Hardware Status Banner */}
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
                              Hardware Reader: Armed
                            </span>
                            {isBoxOpen ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                <Box className="size-3.5" />
                                Packing Mode: {activeBox.id}
                              </span>
                            ) : isWaitingForBoxScan ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse">
                                <Radio className="size-3.5" />
                                Awaiting Fresh Box Tag Scan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                Idle · Ready to Scan Box
                              </span>
                            )}
                          </div>
                          <h2 className="text-xl font-bold tracking-tight text-foreground">
                            Packaging & Master Carton Aggregation
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            Scan clean Box Tag first, then scan finished product tags one by one on hardware. Click &quot;Box Filled&quot; to freeze carton and route to Warehouse.
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
                            <span className="text-muted-foreground">Hardware Reader:</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                              Scanner 7 Active
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Live Feedback Card */}
                      <div className="mt-4 pt-4 border-t">
                        <div
                          className={`rounded-lg border p-4 shadow-xs transition-all duration-200 ${
                            feedback.type === "accepted_box" || feedback.type === "accepted_product"
                              ? "border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-100"
                              : feedback.type === "sealed"
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : feedback.type === "rejected"
                              ? "border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive-foreground"
                              : feedback.type === "waiting_box"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
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

                              {/* Details Chips */}
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

                    {/* Main Container Session & Packing Workspace */}
                    {!isBoxOpen ? (
                      /* STATE A & B: No Active Box Open */
                      <Section
                        title="Master Carton Session"
                        description="Step 1: Scan a clean box tag on hardware to initiate container."
                      >
                        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-muted/15 p-8 text-center space-y-5 max-w-2xl mx-auto my-4">
                          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                            <Boxes className="size-8" />
                          </div>

                          <div className="space-y-1.5">
                            <h3 className="text-xl font-bold tracking-tight text-foreground">
                              {isWaitingForBoxScan ? "Scanner 7 Armed — Scan Box Tag" : "Ready to Pack Master Carton"}
                            </h3>
                            <p className="text-sm text-muted-foreground max-w-md mx-auto">
                              {isWaitingForBoxScan
                                ? "Present an unassigned Box RFID tag (zero prior history) to Scanner 7 hardware reader."
                                : "Click below to begin. The next tag scanned on hardware will be bound as a new Master Carton."}
                            </p>
                          </div>

                          {!isWaitingForBoxScan ? (
                            <div className="space-y-4 pt-2">
                              <Button
                                size="lg"
                                className="w-full sm:w-auto min-w-[240px] text-base font-bold shadow-md gap-2 h-12 bg-primary hover:bg-primary/90"
                                disabled={pending || !isPackingStaff}
                                onClick={() => {
                                  setIsWaitingForBoxScan(true);
                                  setFeedback({
                                    type: "waiting_box",
                                    title: "Scanner 7 Armed — Scan Clean Box Tag",
                                    message: "Ready on hardware! Tap an unassigned RFID tag on Scanner 7 to initialize container.",
                                    timestamp: new Date().toLocaleTimeString(),
                                  });
                                }}
                              >
                                <ScanLine className="size-5" />
                                Scan Box Tag
                              </Button>

                              {/* Quick Test Helper for Testing Without Physical Hardware - ONLY IN MOCK MODE */}
                              {isMock && (
                                <div className="pt-2">
                                  <p className="text-xs text-muted-foreground mb-1.5">
                                    Simulate Box RFID Scan (Mock Mode):
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs font-mono text-primary border-primary/30 hover:bg-primary/10 gap-1.5"
                                    disabled={pending || !isPackingStaff}
                                    onClick={() => {
                                      setIsWaitingForBoxScan(true);
                                      void handleTagScan(testBoxUid);
                                    }}
                                  >
                                    <Sparkles className="size-3.5" />
                                    Simulate Fresh Box Tag ({testBoxUid})
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-4 pt-2">
                              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 border border-amber-500/30 px-4 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 animate-pulse">
                                <Radio className="size-4 animate-spin" />
                                Listening for Box RFID Scan on Hardware Reader...
                              </div>

                              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setIsWaitingForBoxScan(false);
                                    setFeedback({
                                      type: "idle",
                                      title: "Scanner 7 Idle",
                                      message: "Box scan cancelled. Click 'Scan Box Tag' when ready.",
                                    });
                                  }}
                                >
                                  Cancel
                                </Button>

                                {isMock && (
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs gap-1.5"
                                    disabled={pending || !isPackingStaff}
                                    onClick={() => void handleTagScan(testBoxUid)}
                                  >
                                    <Sparkles className="size-3.5" />
                                    Tap Simulated Clean Tag ({testBoxUid})
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Section>
                    ) : (
                      /* STATE C: Active Box Open -> Stream Products Under Box */
                      <div className="space-y-6">
                        {/* Active Box Container Banner */}
                        <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-r from-card via-card/95 to-emerald-50/30 dark:to-emerald-950/20 p-6 shadow-md">
                          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b">
                            <div className="flex items-center gap-3.5">
                              <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
                                <Box className="size-7" />
                              </div>
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Active Master Carton
                                </span>
                                <h3 className="text-2xl font-black font-mono text-foreground flex items-center gap-2">
                                  {activeBox.id}
                                </h3>
                                <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span>Bound RFID Tag:</span>
                                  <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                    {activeBox.rfidUid || "04B5C6D7"}
                                  </span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              {/* Live Carton Unit Counter */}
                              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-center">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                  Packed Units
                                </span>
                                <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                                  {packedGarments.length}
                                </div>
                              </div>

                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                open / packing
                              </span>
                            </div>
                          </div>

                          {/* Zero-Touch Hardware Scan Beacon */}
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="font-medium text-foreground">
                                Hardware Reader Active:
                              </span>
                              <span>
                                Scan product tags one by one on Scanner 7. Scanned products will automatically link into {activeBox.id} below.
                              </span>
                            </div>

                            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                              Downstream Route: Station 8 (Warehouse)
                            </span>
                          </div>
                        </div>

                        {/* Packed Products Manifest Table Under Active Box */}
                        <Section
                          title={`Packed Products in ${activeBox.id} (${packedGarments.length} units)`}
                          description="Runtime manifest of shirts linked to this Master Carton. Updated instantly as tags are scanned on hardware."
                        >
                          {packedGarments.length === 0 ? (
                            <div className="rounded-xl border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-3">
                              <PackagePlus className="mx-auto size-10 text-emerald-600/70" />
                              <div className="space-y-1">
                                <h4 className="text-base font-bold text-foreground">
                                  Carton {activeBox.id} is Open & Ready
                                </h4>
                                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                  Scan finished garment RFID tags on hardware reader one by one. Backend will verify QC clearance and push each product directly under this box.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <DataTable
                              rows={packedGarments}
                              rowKey={(g) => g.id}
                              empty="No products in carton yet."
                              columns={[
                                {
                                  header: "Garment ID",
                                  cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                                },
                                {
                                  header: "Product Style",
                                  cell: (g) => (
                                    <div className="space-y-0.5">
                                      <span className="font-semibold text-foreground">
                                        {g.productName}
                                      </span>
                                      <div className="text-[11px] text-muted-foreground">
                                        Order: <span className="font-mono">{g.orderId}</span> · Size:{" "}
                                        <span className="font-medium">{(g as any).size ?? "M"}</span>
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
                                {
                                  header: "Status",
                                  cell: () => (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 border border-emerald-500/20">
                                      <Box className="size-3" />
                                      Packed in {activeBox.id}
                                    </span>
                                  ),
                                },
                              ]}
                            />
                          )}

                          {/* "Box Filled" Action Button Below Products */}
                          <div className="pt-6 border-t mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="text-xs text-muted-foreground text-center sm:text-left">
                              When carton is full, click <strong>Box Filled</strong> to freeze manifest, mark products packed, and reset workstation for next box.
                            </div>

                            <Button
                              size="lg"
                              className="w-full sm:w-auto min-w-[220px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md gap-2 h-11"
                              disabled={pending || packedGarments.length === 0 || !isPackingStaff}
                              onClick={() => void handleBoxFilled()}
                            >
                              <PackageCheck className="size-5" />
                              Box Filled
                            </Button>
                          </div>
                        </Section>
                      </div>
                    )}

                    {/* Section: Available Inspected Garments Awaiting Packaging */}
                    <Section
                      title={`Garments Cleared from Final QC · Ready for Packaging (${readyForPacking.length})`}
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
                            header: "Hardware Simulation",
                            cell: (g) => (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground gap-1 font-semibold"
                                disabled={pending || !isPackingStaff || !g.rfidUid}
                                onClick={() => {
                                  if (g.rfidUid) {
                                    void handleTagScan(g.rfidUid);
                                  }
                                }}
                              >
                                <ScanLine className="size-3" />
                                Simulate Scan
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
