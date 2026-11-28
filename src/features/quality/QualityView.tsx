import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Lock,
  Plus,
  Radio,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { paths } from "@/app/paths";
import { AppLink } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can, canAccessRoute } from "@/domain/permissions";
import type {
  ChecklistItem,
  Garment,
  Inspection,
  InspectionKind,
  InspectionStatus,
  MaterialLot,
} from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";
import { QAPanel } from "@/features/workstation/panels/QAPanel";

const tabs: { kind: InspectionKind; label: string; description: string }[] = [
  {
    kind: "incoming",
    label: "Incoming Fabric (Step 2 QC)",
    description: "Evaluations and sign-offs for fabric rolls arriving from Station 1 Receiving",
  },
  {
    kind: "final",
    label: "Final QC (Station 6)",
    description: "First-pass garment evaluations before packing",
  },
  {
    kind: "reinspection",
    label: "Reinspections",
    description: "Repaired garments requiring independent re-evaluation",
  },
];

const defaultIncomingChecklist: ChecklistItem[] = [
  { id: "i1", label: "Lot paperwork matches delivery", checked: false },
  { id: "i2", label: "Shade within approved range", checked: false },
  { id: "i3", label: "Width and weight within spec", checked: false },
  { id: "i4", label: "Four-point defect check acceptable", checked: false },
];

function IncomingQcDialog({
  inspection,
  lot,
  triggerLabel = "Evaluate Lot",
}: {
  inspection: Inspection;
  lot?: MaterialLot | undefined;
  triggerLabel?: string | undefined;
}) {
  const { run } = useWtAction();
  const totalQty = lot?.receivedQty ?? 20;
  const isInitiallyAccepted = lot?.status === "accepted";
  const isInitiallyRejected = lot?.status === "rejected";
  const [acceptedQty, setAcceptedQty] = useState<number | string>(
    isInitiallyAccepted ? (lot?.balanceQty ?? totalQty) : totalQty,
  );
  const [heldQty, setHeldQty] = useState<number | string>(lot?.heldQty ?? 0);
  const [rejectedQty, setRejectedQty] = useState<number | string>(
    isInitiallyRejected ? totalQty : (lot?.rejectedQty ?? 0),
  );
  const [result, setResult] = useState<"pass" | "fail">(
    isInitiallyRejected ? "fail" : "pass",
  );
  const [defectReason, setDefectReason] = useState(inspection.defectReason ?? "");
  const [notes, setNotes] = useState(inspection.notes ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    if (inspection.checklist && inspection.checklist.length === 4) {
      return inspection.checklist;
    }
    return defaultIncomingChecklist.map((c) => ({
      ...c,
      checked: isInitiallyAccepted,
    }));
  });

  const parsedAccepted = Number(acceptedQty) || 0;
  const parsedHeld = Number(heldQty) || 0;
  const parsedRejected = Number(rejectedQty) || 0;
  const totalCalculated = Math.round((parsedAccepted + parsedHeld + parsedRejected) * 1000) / 1000;
  const isBalanced = Math.abs(totalCalculated - totalQty) < 1e-3;
  const allChecked = checklist.every((c) => c.checked);
  const canSubmit =
    isBalanced && (result === "pass" ? allChecked && parsedAccepted > 0 : !!defectReason.trim());

  const handleSelectDecision = (newDecision: "pass" | "fail") => {
    setResult(newDecision);
    if (newDecision === "pass") {
      setAcceptedQty(totalQty);
      setHeldQty(0);
      setRejectedQty(0);
      setChecklist((prev) => prev.map((c) => ({ ...c, checked: true })));
    } else {
      if (parsedAccepted === totalQty && parsedHeld === 0 && parsedRejected === 0) {
        setAcceptedQty(0);
        setHeldQty(0);
        setRejectedQty(totalQty);
      }
    }
  };

  return (
    <FormDialog
      trigger={triggerLabel}
      triggerVariant={triggerLabel === "Evaluate Lot" ? "default" : "outline"}
      title={`Incoming Lot Evaluation & Spec Sign-Off: ${inspection.id}`}
      description={`Lot: ${lot?.id ?? inspection.subjectId} (${lot?.material ?? "Fabric"}) · Total: ${totalQty} ${lot?.unit ?? "m"}`}
      submitLabel="Submit Inspection Decision"
      submitDisabled={!canSubmit}
      onSubmit={async () =>
        !!(await run(
          (c) =>
            c.submitIncomingQc({
              lotId: lot?.id ?? inspection.subjectId,
              inspectionId: inspection.id,
              acceptedQty: parsedAccepted,
              heldQty: parsedHeld,
              rejectedQty: parsedRejected,
              checklist,
              notes,
              result,
              defectReason: result === "fail" ? defectReason : undefined,
            }),
          result === "pass"
            ? `Incoming QC approved: ${parsedAccepted}${lot?.unit ?? "m"} accepted for ${lot?.id ?? inspection.subjectId}. Usable balance released to Raw Store & Cutting.`
            : `Incoming QC rejected / held: ${parsedRejected}${lot?.unit ?? "m"} rejected for ${lot?.id ?? inspection.subjectId}. Defective fabric locked from production.`,
        ))
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Inspection Decision
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={result === "pass" ? "default" : "outline"}
              className={
                result === "pass"
                  ? "border-success bg-success text-success-foreground hover:bg-success/90"
                  : ""
              }
              onClick={() => handleSelectDecision("pass")}
            >
              <CheckCircle2 className="size-4 mr-1.5" /> Accept Lot (Pass)
            </Button>
            <Button
              type="button"
              variant={result === "fail" ? "default" : "outline"}
              className={
                result === "fail"
                  ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={() => handleSelectDecision("fail")}
            >
              <XCircle className="size-4 mr-1.5" /> Reject / Hold Lot (Fail)
            </Button>
          </div>
        </div>

        {/* 4-Point Fabric Quality Checklist */}
        <div className="space-y-2 rounded-md border p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              4-Point Fabric Quality Checklist
            </p>
            {result === "pass" && !allChecked && (
              <span className="text-[11px] font-medium text-warning">
                All 4 checks required for Pass
              </span>
            )}
          </div>
          {checklist.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2.5 text-xs p-1.5 rounded hover:bg-muted/40 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={c.checked}
                onChange={(e) =>
                  setChecklist((prev) =>
                    prev.map((item) =>
                      item.id === c.id ? { ...item, checked: e.target.checked } : item,
                    ),
                  )
                }
                className="size-4 rounded border-input text-primary focus:ring-primary"
              />
              <span className="font-medium text-foreground">{c.label}</span>
            </label>
          ))}
        </div>

        {/* Quantity Breakdown Reconciliation */}
        <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quantity Breakdown ({lot?.unit ?? "m"})
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Accepted" htmlFor="in-acc">
              <Input
                id="in-acc"
                type="number"
                step="any"
                min={0}
                max={totalQty}
                value={acceptedQty}
                onChange={(e) => setAcceptedQty(e.target.value)}
              />
            </Field>
            <Field label="Held (Quarantine)" htmlFor="in-held">
              <Input
                id="in-held"
                type="number"
                step="any"
                min={0}
                max={totalQty}
                value={heldQty}
                onChange={(e) => setHeldQty(e.target.value)}
              />
            </Field>
            <Field label="Rejected" htmlFor="in-rej">
              <Input
                id="in-rej"
                type="number"
                step="any"
                min={0}
                max={totalQty}
                value={rejectedQty}
                onChange={(e) => setRejectedQty(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span
              className={isBalanced ? "text-success font-medium" : "text-destructive font-semibold"}
            >
              Total accounted: {totalCalculated} / {totalQty} {lot?.unit ?? "m"}
            </span>
            {!isBalanced && (
              <span className="text-destructive font-medium">
                Strict Balance Required: (Accepted + Held + Rejected = {totalQty} {lot?.unit ?? "m"}).
              </span>
            )}
          </div>
        </div>

        {/* Mandatory Defect Reason on Fail */}
        {result === "fail" && (
          <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <Field label="Mandatory Defect Reason (Required on Fail)" htmlFor="in-defect">
              <Input
                id="in-defect"
                value={defectReason}
                onChange={(e) => setDefectReason(e.target.value)}
                placeholder="e.g. Shade variation across roll width; center-to-selvedge shading, oil stains at 45m, GSM 210 below 240 tolerance"
              />
            </Field>
            <p className="text-[11px] text-destructive">
              Logging defect reason locks unapproved fabric from being issued to production. Usable balance will be restricted to accepted meterage (or 0m).
            </p>
          </div>
        )}

        <Field label="Inspection Notes (Optional)" htmlFor="in-notes">
          <Input
            id="in-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Visual texture, thread count, mill batch reference, lab test reference..."
          />
        </Field>
      </div>
    </FormDialog>
  );
}

function IncomingLotsTable({
  lotsQuery,
  inspQuery,
  statusFilter,
  search,
}: {
  lotsQuery: ReturnType<typeof useWtQuery<MaterialLot[]>>;
  inspQuery: ReturnType<typeof useWtQuery<Inspection[]>>;
  statusFilter: string;
  search: string;
}) {
  const me = useMe();
  const canEvaluate =
    me.role === "Q" ||
    me.role === "M" ||
    me.role === "A" ||
    me.username?.toLowerCase() === "qc.incoming" ||
    me.username?.toLowerCase() === "qc.demo";

  return (
    <Loadable query={lotsQuery}>
      {(allLots) => {
        const filteredLots = allLots
          .filter((l) => {
            const isReadyForQc =
              l.status === "awaiting-inspection" && Boolean(l.rfidUid) && l.rfidUid !== "unassigned";
            const isAwaitingReceiving =
              l.status === "awaiting-inspection" && (!l.rfidUid || l.rfidUid === "unassigned");
            const isPassed = l.status === "accepted";
            const isFailed = l.status === "rejected";

            if (statusFilter === "ready" && !isReadyForQc) return false;
            if (statusFilter === "awaiting_receiving" && !isAwaitingReceiving) return false;
            if (statusFilter === "open" && l.status !== "awaiting-inspection") return false;
            if (statusFilter === "passed" && !isPassed) return false;
            if (statusFilter === "failed" && !isFailed) return false;

            if (search.trim()) {
              const s = search.toLowerCase();
              const matchId = l.id.toLowerCase().includes(s);
              const matchMaterial = l.material.toLowerCase().includes(s);
              const matchRef = l.supplierRef.toLowerCase().includes(s);
              const matchTag = (l.rfidUid ?? "").toLowerCase().includes(s);
              if (!matchId && !matchMaterial && !matchRef && !matchTag) return false;
            }
            return true;
          })
          .sort((a, b) => {
            // Sort: ready for QC first, then awaiting receiving, then passed/failed
            const aReady =
              a.status === "awaiting-inspection" && Boolean(a.rfidUid) && a.rfidUid !== "unassigned"
                ? 0
                : a.status === "awaiting-inspection"
                  ? 1
                  : 2;
            const bReady =
              b.status === "awaiting-inspection" && Boolean(b.rfidUid) && b.rfidUid !== "unassigned"
                ? 0
                : b.status === "awaiting-inspection"
                  ? 1
                  : 2;
            if (aReady !== bReady) return aReady - bReady;
            return (b.receivedAt ?? "").localeCompare(a.receivedAt ?? "");
          });

        return (
          <DataTable
            rows={filteredLots}
            rowKey={(l) => l.id}
            empty="No incoming fabric lots matching the filter."
            columns={[
              {
                header: "Lot Code",
                cell: (l) => (
                  <div>
                    <IdLink href={paths.lot(l.id)} id={l.id} />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {fmt.date(l.receivedAt)}
                    </p>
                  </div>
                ),
              },
              {
                header: "Fabric Material",
                cell: (l) => (
                  <div>
                    <p className="font-medium text-foreground text-xs sm:text-sm">{l.material}</p>
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
                cell: (l) => {
                  if (l.rfidUid && l.rfidUid !== "unassigned") {
                    return (
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                        <Radio className="size-3" /> {l.rfidUid}
                      </span>
                    );
                  }
                  if (l.status === "accepted") {
                    return (
                      <span className="inline-flex items-center text-xs text-muted-foreground italic bg-muted px-2 py-0.5 rounded">
                        Unassigned (Dashboard Verified)
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded border border-warning/25">
                      Card Pending (Station 1)
                    </span>
                  );
                },
              },
              {
                header: "Incoming QC",
                cell: (l) => {
                  const matchingInsp = (inspQuery.data ?? []).find(
                    (i) =>
                      i.kind === "incoming" &&
                      (i.subjectId === l.id || (l as any).code === i.subjectId),
                  );
                  const isReadyForQc =
                    l.status === "awaiting-inspection" && Boolean(l.rfidUid) && l.rfidUid !== "unassigned";
                  const isAwaitingReceiving =
                    l.status === "awaiting-inspection" && (!l.rfidUid || l.rfidUid === "unassigned");

                  return (
                    <div className="flex flex-col gap-0.5">
                      <StatusBadge status={l.status} />
                      {l.status === "accepted" && (
                        <span className="text-[11px] font-medium text-success">
                          Approved for Step 3
                        </span>
                      )}
                      {isReadyForQc && (
                        <span className="text-[11px] font-semibold text-warning">
                          Ready for QC Sign-Off
                        </span>
                      )}
                      {isAwaitingReceiving && (
                        <span className="text-[11px] font-medium text-warning">
                          Awaiting Station 1 Scan
                        </span>
                      )}
                      {l.status === "rejected" && (
                        <span className="text-[11px] font-medium text-destructive">
                          Disapproved (Quarantined)
                        </span>
                      )}
                      {matchingInsp?.defectReason && (
                        <span
                          className="text-[11px] text-destructive truncate max-w-[200px]"
                          title={matchingInsp.defectReason}
                        >
                          {matchingInsp.defectReason}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                header: "Action",
                cell: (l) => {
                  const matchingInsp = (inspQuery.data ?? []).find(
                    (i) =>
                      i.kind === "incoming" &&
                      (i.subjectId === l.id || (l as any).code === i.subjectId),
                  );
                  const inspObj: Inspection = matchingInsp ?? {
                    id: (l as any).incomingInspectionId || `INSP-${l.id}`,
                    kind: "incoming",
                    subjectType: "lot",
                    subjectId: l.id,
                    status:
                      l.status === "accepted"
                        ? "passed"
                        : l.status === "rejected"
                          ? "failed"
                          : "open",
                    checklist: defaultIncomingChecklist.map((c) => ({
                      ...c,
                      checked: l.status === "accepted",
                    })),
                    notes: "",
                    createdAt: l.receivedAt,
                  };

                  const isReadyForQc =
                    l.status === "awaiting-inspection" && Boolean(l.rfidUid) && l.rfidUid !== "unassigned";
                  const isAwaitingReceiving =
                    l.status === "awaiting-inspection" && (!l.rfidUid || l.rfidUid === "unassigned");

                  if (isReadyForQc) {
                    return canEvaluate ? (
                      <IncomingQcDialog
                        inspection={inspObj}
                        lot={l}
                        triggerLabel="Evaluate Lot"
                      />
                    ) : (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <AppLink href={paths.lot(l.id)}>View Lot</AppLink>
                      </Button>
                    );
                  }

                  if (isAwaitingReceiving) {
                    return (
                      <div className="flex items-center gap-1.5">
                        {canAccessRoute(me, "workstation") && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1 text-warning border-warning/35 hover:bg-warning-soft/70">
                            <AppLink href={paths.workstation}>
                              Station 1 <ArrowRight className="size-3" />
                            </AppLink>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                          <AppLink href={paths.lot(l.id)}>View</AppLink>
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div className="flex items-center gap-1.5">
                      {canEvaluate && (
                        <IncomingQcDialog
                          inspection={inspObj}
                          lot={l}
                          triggerLabel="Re-Evaluate"
                        />
                      )}
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                        <AppLink href={paths.lot(l.id)}>View Lot</AppLink>
                      </Button>
                    </div>
                  );
                },
              },
            ]}
          />
        );
      }}
    </Loadable>
  );
}

export function QualityView() {
  const me = useMe();
  const insp = useWtQuery(["inspections"], (c) => c.listInspections());
  const garments = useWtQuery(["garments"], (c) => c.listGarments());
  const lots = useWtQuery(["lots"], (c) => c.listLots(), { refetchInterval: 3000 });
  const qRfidStation = useWtQuery(["rfid-station", "final_qc"], (c) =>
    c.getRfidStationData("final_qc"),
  );

  const isIncomingQC = me.username?.toLowerCase() === "qc.incoming";
  const isFinalQc = me.username?.toLowerCase() === "qc.demo" || (me.role === "Q" && !isIncomingQC);

  const [incomingMode, setIncomingMode] = useState<"queue" | "quarantine">("queue");

  const availableTabs = useMemo(() => {
    if (isIncomingQC) {
      return tabs.filter((t) => t.kind === "incoming");
    }
    if (isFinalQc) {
      return tabs.filter((t) => t.kind !== "incoming");
    }
    return tabs;
  }, [isIncomingQC, isFinalQc]);

  const [activeTab, setActiveTab] = useState<InspectionKind>(
    isIncomingQC ? "incoming" : "final",
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const garmentMap = useMemo(() => {
    const map = new Map<string, Garment>();
    (garments.data ?? []).forEach((g) => {
      map.set(g.id, g);
      if ((g as any).code) map.set((g as any).code, g);
      if ((g as any).publicId) map.set((g as any).publicId, g);
    });
    return map;
  }, [garments.data]);

  const isDiscarded = (subjectId: string, defectReason?: string | null): boolean => {
    if (
      defectReason &&
      (defectReason.startsWith("[SCRAP/DISCARD]") ||
        defectReason.toLowerCase().includes("scrap") ||
        defectReason.toLowerCase().includes("discard"))
    ) {
      return true;
    }
    const g = garmentMap.get(subjectId);
    if (!g) return false;
    return (
      g.stage === "scrapped" ||
      g.disposition === ("scrapped" as any) ||
      Boolean(g.hold?.reason?.toLowerCase().includes("scrap")) ||
      Boolean(g.hold?.reason?.toLowerCase().includes("discard"))
    );
  };

  const heldGarments = useMemo(
    () =>
      (garments.data ?? []).filter(
        (g) =>
          Boolean(g.hold) &&
          g.stage !== "scrapped" &&
          g.disposition !== ("scrapped" as any) &&
          !g.hold?.reason?.toLowerCase().includes("scrap") &&
          !g.hold?.reason?.toLowerCase().includes("discard"),
      ),
    [garments.data],
  );
  const heldSet = useMemo(() => new Set(heldGarments.map((g) => g.id)), [heldGarments]);

  const lotMap = useMemo(() => {
    const map = new Map<string, MaterialLot>();
    (lots.data ?? []).forEach((l) => {
      map.set(l.id, l);
      if ((l as any).code) map.set((l as any).code, l);
      if ((l as any).lotId) map.set((l as any).lotId, l);
    });
    return map;
  }, [lots.data]);

  const lotInspMap = useMemo(() => {
    const map = new Map<string, Inspection>();
    (insp.data ?? []).forEach((i) => {
      if (i.kind === "incoming") {
        map.set(i.subjectId, i);
      }
    });
    return map;
  }, [insp.data]);

  // -------------------------------------------------------------
  // DEDICATED INCOMING QC WORKSTATION VIEW (qc.incoming)
  // -------------------------------------------------------------
  if (isIncomingQC) {
    return (
      <>
        <PageHeader title="Incoming Material Quality Assurance" />

        <div className="space-y-6">
          {/* Key Metric Counters */}
          <Loadable query={insp}>
            {() => {
              const readyLotsCount = (lots.data ?? []).filter(
                (l) =>
                  l.status === "awaiting-inspection" &&
                  Boolean(l.rfidUid) &&
                  l.rfidUid !== "unassigned",
              ).length;
              const awaitingReceivingCount = (lots.data ?? []).filter(
                (l) =>
                  l.status === "awaiting-inspection" &&
                  (!l.rfidUid || l.rfidUid === "unassigned"),
              ).length;
              const quarantinedLots = (lots.data ?? []).filter(
                (l) => l.status === "rejected" || (l.heldQty ?? 0) > 0,
              );
              const acceptedLots = (lots.data ?? []).filter((l) => l.status === "accepted");
              const acceptedInventoryMeters = acceptedLots.reduce(
                (sum, l) => sum + (Number(l.balanceQty) || 0),
                0,
              );

              return (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Ready for QC
                      </span>
                      <Sparkles className="size-4 text-warning" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{readyLotsCount}</p>
                  </div>

                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Awaiting Receiving
                      </span>
                      <Radio className="size-4 text-warning" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-warning">
                      {awaitingReceivingCount}
                    </p>
                  </div>

                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Quarantine / Holds
                      </span>
                      <ShieldAlert className="size-4 text-destructive" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-destructive">
                      {quarantinedLots.length}
                    </p>
                  </div>

                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Accepted Inventory
                      </span>
                      <CheckCircle2 className="size-4 text-success" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-success">
                      {Math.round(acceptedInventoryMeters)} m
                    </p>
                  </div>
                </div>
              );
            }}
          </Loadable>

          {/* Two Primary Modes / Views */}
          <div className="space-y-4">
            <Tabs
              value={incomingMode}
              onValueChange={(v) => setIncomingMode(v as "queue" | "quarantine")}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                <TabsList className="flex h-auto flex-wrap">
                  <TabsTrigger value="queue" className="gap-2">
                    <span>Incoming QC Dashboard &amp; Queue</span>
                    <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold">
                      {
                        (lots.data ?? []).filter(
                          (l) =>
                            l.status === "awaiting-inspection" &&
                            Boolean(l.rfidUid) &&
                            l.rfidUid !== "unassigned",
                        ).length
                      }
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="quarantine" className="gap-2">
                    <span>Lot Rejection &amp; Quarantine Handling</span>
                    <span className="rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.5 text-[10px] font-semibold">
                      {
                        (lots.data ?? []).filter(
                          (l) => l.status === "rejected" || (l.heldQty ?? 0) > 0,
                        ).length
                      }
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Mode 1: Incoming Fabric Inspection Queue */}
              <TabsContent value="queue" className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search lot, spec, inspection ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-8 text-xs w-[220px] sm:w-[260px]"
                    />
                  </div>
                  <div className="w-[180px]">
                    <NativeSelect
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: "all", label: "All Lots" },
                        { value: "ready", label: "Ready for QC" },
                        { value: "awaiting_receiving", label: "Awaiting Receiving" },
                        { value: "open", label: "All Open Lots" },
                        { value: "passed", label: "Passed (Accepted)" },
                        { value: "failed", label: "Failed (Quarantined)" },
                      ]}
                    />
                  </div>
                </div>

                <IncomingLotsTable
                  lotsQuery={lots}
                  inspQuery={insp}
                  statusFilter={statusFilter}
                  search={search}
                />
              </TabsContent>

              {/* Mode 2: Lot Rejection & Quarantine Handling */}
              <TabsContent value="quarantine" className="mt-4 space-y-4">
                <Loadable query={lots}>
                  {(allLots) => {
                    const quarantinedLots = allLots.filter(
                      (l) => l.status === "rejected" || (l.heldQty ?? 0) > 0,
                    );

                    return (
                      <DataTable
                        rows={quarantinedLots}
                        rowKey={(l) => l.id}
                        empty="No fabric rolls currently in quarantine or rejected."
                        columns={[
                          {
                            header: "Material Lot ID",
                            cell: (l) => <IdLink href={paths.lot(l.id)} id={l.id} />,
                          },
                          {
                            header: "Inspection Record",
                            cell: (l) => {
                              const inspRecord = lotInspMap.get(l.id);
                              return inspRecord ? (
                                <IdLink href={paths.inspection(inspRecord.id)} id={inspRecord.id} />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              );
                            },
                          },
                          {
                            header: "Fabric Specification",
                            cell: (l) => (
                              <div>
                                <p className="font-medium text-foreground text-xs">{l.material}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Ref: {l.supplierRef}
                                </p>
                              </div>
                            ),
                          },
                          {
                            header: "Quarantine Allocation",
                            cell: (l) => (
                              <div className="space-y-0.5 text-xs">
                                <span className="font-semibold text-destructive tabular-nums">
                                  {l.rejectedQty ?? 0} {l.unit ?? "m"} rejected
                                </span>
                                {(l.heldQty ?? 0) > 0 && (
                                  <span className="text-warning block tabular-nums">
                                    {l.heldQty} {l.unit ?? "m"} held (testing)
                                  </span>
                                )}
                              </div>
                            ),
                          },
                          {
                            header: "Mill Defect Reason",
                            cell: (l) => {
                              const inspRecord = lotInspMap.get(l.id);
                              return (
                                <span className="text-xs text-destructive font-medium italic">
                                  {inspRecord?.defectReason || "Spec deviation / defect noted"}
                                </span>
                              );
                            },
                          },
                          {
                            header: "Production Safeguard",
                            cell: () => (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                                <Lock className="size-3.5" /> Usable Balance 0m (Issue Blocked)
                              </span>
                            ),
                          },
                          {
                            header: "Action",
                            cell: (l) => {
                              const inspRecord = lotInspMap.get(l.id);
                              if (inspRecord) {
                                return (
                                  <IncomingQcDialog
                                    inspection={inspRecord}
                                    lot={l}
                                    triggerLabel="Re-Evaluate Lot"
                                  />
                                );
                              }
                              return (
                                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                  <AppLink href={paths.lot(l.id)}>View Lot</AppLink>
                                </Button>
                              );
                            },
                          },
                        ]}
                      />
                    );
                  }}
                </Loadable>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------
  // GENERAL QUALITY ASSURANCE & STATION 6 QA VIEW (qc.demo / Manager)
  // -------------------------------------------------------------
  return (
    <>
      <PageHeader title="Quality Assurance" />

      <div className="space-y-6">
        {/* KPI Summary Cards */}
        <Loadable query={insp}>
          {(all) => {
            const openFinal = all.filter((i) => i.kind === "final" && i.status === "open").length;
            const openReinsp = all.filter(
              (i) => i.kind === "reinspection" && i.status === "open",
            ).length;
            const openIncoming = all.filter(
              (i) => i.kind === "incoming" && i.status === "open",
            ).length;
            const passedFinalCount = all.filter(
              (i) => i.kind === "final" && i.status === "passed",
            ).length;

            return (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Awaiting Final QC
                    </span>
                    <ClipboardCheck className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{openFinal}</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Reinspections
                    </span>
                    <RotateCcw className="size-4 text-warning" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{openReinsp}</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Active Holds
                    </span>
                    <ShieldAlert className="size-4 text-destructive" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-destructive">{heldGarments.length}</p>
                </div>
                {isFinalQc ? (
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wider">
                        QC Released
                      </span>
                      <ShieldCheck className="size-4 text-success" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-success">{passedFinalCount}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wider">
                        Incoming Lots
                      </span>
                      <Sparkles className="size-4 text-accent" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{openIncoming}</p>
                  </div>
                )}
              </div>
            );
          }}
        </Loadable>

        {/* Active Garment Holds Banner (Final QA / Managers only) */}
        {heldGarments.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive">
                  {heldGarments.length} Garment{heldGarments.length > 1 ? "s" : ""} on Active
                  Quality Hold
                </p>
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {heldGarments.map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                    >
                      <IdLink href={paths.garment(g.id)} id={g.id} />
                      <span className="text-muted-foreground">·</span>
                      <span className="italic">{g.hold?.reason ?? "Held"}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Workstation RFID Station Panel (Station 6 Final QA only) */}
        {qRfidStation.data && (
          <Section title="Station 6: Final Quality Inspection Console">
            <QAPanel
              stationData={qRfidStation.data}
              onScanComplete={() => {
                void insp.refetch();
                void garments.refetch();
              }}
            />
          </Section>
        )}

        {/* Inspection Queues */}
        <Loadable query={insp}>
          {(all) => {
            const resolvedTab = isFinalQc && activeTab === "incoming" ? "final" : activeTab;

            const filtered = all.filter((i) => {
              if (i.kind !== resolvedTab) return false;
              if (statusFilter !== "all" && i.status !== statusFilter) return false;
              if (search.trim()) {
                const s = search.toLowerCase();
                const matchId = i.id.toLowerCase().includes(s);
                const matchSubject = i.subjectId.toLowerCase().includes(s);
                const matchDefect = i.defectReason?.toLowerCase().includes(s) ?? false;
                if (!matchId && !matchSubject && !matchDefect) return false;
              }
              return true;
            });

            return (
              <div className="space-y-4">
                <Tabs value={resolvedTab} onValueChange={(v) => setActiveTab(v as InspectionKind)}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                    <TabsList className="flex h-auto flex-wrap">
                      {availableTabs.map((t) => {
                        const openCount = all.filter(
                          (i) => i.kind === t.kind && i.status === "open",
                        ).length;
                        return (
                          <TabsTrigger key={t.kind} value={t.kind} className="gap-2">
                            <span>{t.label}</span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                openCount > 0
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {openCount}
                            </span>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>

                    {/* Filter & Search Bar */}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search inspections..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="h-8 pl-8 text-xs w-[180px] sm:w-[220px]"
                        />
                      </div>
                      <div className="w-[110px]">
                        <NativeSelect
                          value={statusFilter}
                          onChange={setStatusFilter}
                          options={[
                            { value: "all", label: "All Status" },
                            { value: "open", label: "Open" },
                            { value: "passed", label: "Passed" },
                            { value: "failed", label: "Failed" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  {availableTabs.map((t) => (
                    <TabsContent key={t.kind} value={t.kind} className="mt-3">
                      {t.kind === "incoming" ? (
                        <IncomingLotsTable
                          lotsQuery={lots}
                          inspQuery={insp}
                          statusFilter={statusFilter}
                          search={search}
                        />
                      ) : (
                        <DataTable
                          rows={filtered.sort(
                            (a, b) =>
                              (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) ||
                              b.createdAt.localeCompare(a.createdAt),
                          )}
                          rowKey={(i) => i.id}
                          empty={`No ${t.kind} inspections matching the selected filter.`}
                          columns={[
                            {
                              header: "Inspection",
                              cell: (i) => <IdLink href={paths.inspection(i.id)} id={i.id} />,
                            },
                            {
                              header: "Subject",
                              cell: (i) => {
                                const discarded = isDiscarded(i.subjectId, i.defectReason);
                                return (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {i.subjectType === "lot" ? (
                                      <LinkIf
                                        user={me}
                                        routeKey="materialLot"
                                        href={paths.lot(i.subjectId)}
                                        id={i.subjectId}
                                      />
                                    ) : (
                                      <LinkIf
                                        user={me}
                                        routeKey="garment"
                                        href={paths.garment(i.subjectId)}
                                        id={i.subjectId}
                                      />
                                    )}
                                    {discarded ? (
                                      <span className="inline-flex items-center gap-1 rounded bg-warning-soft border border-warning/30 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                                        Discard
                                      </span>
                                    ) : heldSet.has(i.subjectId) ? (
                                      <HoldBadge />
                                    ) : null}
                                  </div>
                                );
                              },
                            },
                            {
                              header: "Type",
                              cell: (i) => (
                                <span className="text-xs text-muted-foreground capitalize">
                                  {i.subjectType === "lot" ? "Fabric Lot" : "Garment"}
                                </span>
                              ),
                            },
                            {
                              header: "Result / Status",
                              cell: (i) => {
                                const discarded = isDiscarded(i.subjectId, i.defectReason);
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    {discarded ? (
                                      <span className="inline-flex items-center w-fit gap-1 rounded bg-warning-soft border border-warning/30 px-2 py-0.5 text-xs font-semibold text-warning">
                                        Discarded
                                      </span>
                                    ) : (
                                      <StatusBadge status={i.status} />
                                    )}
                                    {i.defectReason && (
                                      <span className="text-[11px] text-destructive truncate max-w-[180px]">
                                        {i.defectReason.replace(/^\[SCRAP\/DISCARD\]\s*/i, "")}
                                      </span>
                                    )}
                                  </div>
                                );
                              },
                            },
                            {
                              header: "RFID Evidence",
                              cell: (i) =>
                                i.rfidScanId ? (
                                  <span className="font-mono text-[11px] text-success font-medium">
                                    {i.rfidScanId}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ),
                            },
                            {
                              header: "Opened",
                              cell: (i) => (
                                <span className="text-xs text-muted-foreground">
                                  {fmt.dateTime(i.createdAt)}
                                </span>
                              ),
                            },
                          ]}
                        />
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            );
          }}
        </Loadable>
      </div>
    </>
  );
}
