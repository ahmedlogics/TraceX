import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Lock,
  Plus,
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
import { can } from "@/domain/permissions";
import type {
  ChecklistItem,
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
    kind: "final",
    label: "Final QC",
    description: "First-pass garment evaluations before packing",
  },
  {
    kind: "reinspection",
    label: "Reinspections",
    description: "Repaired garments requiring independent re-evaluation",
  },
  {
    kind: "incoming",
    label: "Incoming Fabric (Lot-level)",
    description: "Received fabric lot evaluations",
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
  const [acceptedQty, setAcceptedQty] = useState(lot?.acceptedQty ?? totalQty);
  const [heldQty, setHeldQty] = useState(lot?.heldQty ?? 0);
  const [rejectedQty, setRejectedQty] = useState(lot?.rejectedQty ?? 0);
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [defectReason, setDefectReason] = useState(inspection.defectReason ?? "");
  const [notes, setNotes] = useState(inspection.notes ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    if (inspection.checklist && inspection.checklist.length === 4) {
      return inspection.checklist;
    }
    return defaultIncomingChecklist;
  });

  const totalCalculated = Number(acceptedQty) + Number(heldQty) + Number(rejectedQty);
  const isBalanced = totalCalculated === totalQty;
  const allChecked = checklist.every((c) => c.checked);
  const canSubmit =
    isBalanced && (result === "pass" ? allChecked && acceptedQty > 0 : !!defectReason.trim());

  const handleSelectDecision = (newDecision: "pass" | "fail") => {
    setResult(newDecision);
    if (newDecision === "pass") {
      setAcceptedQty(totalQty);
      setHeldQty(0);
      setRejectedQty(0);
    } else {
      if (acceptedQty === totalQty && heldQty === 0 && rejectedQty === 0) {
        setAcceptedQty(0);
        setHeldQty(0);
        setRejectedQty(totalQty);
      }
    }
  };

  return (
    <FormDialog
      trigger={triggerLabel}
      triggerVariant="default"
      title={`Incoming Lot Evaluation & Spec Sign-Off: ${inspection.id}`}
      description={`Lot: ${lot?.id ?? inspection.subjectId} (${lot?.material ?? "Fabric"}) · Total: ${totalQty} ${lot?.unit ?? "m"}`}
      submitLabel="Submit Inspection Decision"
      disabled={!canSubmit}
      onSubmit={async () =>
        !!(await run(
          (c) =>
            c.submitIncomingQc({
              lotId: lot?.id ?? inspection.subjectId,
              inspectionId: inspection.id,
              acceptedQty: Number(acceptedQty),
              heldQty: Number(heldQty),
              rejectedQty: Number(rejectedQty),
              checklist,
              notes,
              result,
              defectReason: result === "fail" ? defectReason : undefined,
            }),
          result === "pass"
            ? `Incoming QC recorded: ${acceptedQty}${lot?.unit ?? "m"} accepted. Usable balance released to Raw Store & Cutting.`
            : `Incoming QC rejected / held: ${rejectedQty}${lot?.unit ?? "m"} rejected, ${heldQty}${lot?.unit ?? "m"} held. Defective fabric locked from production.`,
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
                min={0}
                max={totalQty}
                value={acceptedQty}
                onChange={(e) => setAcceptedQty(Number(e.target.value))}
              />
            </Field>
            <Field label="Held (Quarantine)" htmlFor="in-held">
              <Input
                id="in-held"
                type="number"
                min={0}
                max={totalQty}
                value={heldQty}
                onChange={(e) => setHeldQty(Number(e.target.value))}
              />
            </Field>
            <Field label="Rejected" htmlFor="in-rej">
              <Input
                id="in-rej"
                type="number"
                min={0}
                max={totalQty}
                value={rejectedQty}
                onChange={(e) => setRejectedQty(Number(e.target.value))}
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

export function QualityView() {
  const me = useMe();
  const insp = useWtQuery(["inspections"], (c) => c.listInspections());
  const garments = useWtQuery(["garments"], (c) => c.listGarments());
  const lots = useWtQuery(["material-lots"], (c) => c.listLots());
  const qRfidStation = useWtQuery(["rfid-station", "final_qc"], (c) =>
    c.getRfidStationData("final_qc"),
  );

  const isIncomingQC =
    me.username?.toLowerCase() === "qc.incoming" ||
    me.department?.toLowerCase() === "receiving" ||
    me.department?.toLowerCase() === "raw-store" ||
    (me.department as string)?.toLowerCase() === "raw_store";

  const [incomingMode, setIncomingMode] = useState<"queue" | "quarantine">("queue");

  const availableTabs = useMemo(() => {
    if (isIncomingQC) {
      return tabs.filter((t) => t.kind === "incoming");
    }
    if (me.role === "Q" && me.department === "quality") {
      return tabs.filter((t) => t.kind !== "incoming");
    }
    return tabs;
  }, [isIncomingQC, me.role, me.department]);

  const [activeTab, setActiveTab] = useState<InspectionKind>(() =>
    isIncomingQC ? "incoming" : "final",
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const heldGarments = useMemo(
    () => (garments.data ?? []).filter((g) => !!g.hold),
    [garments.data],
  );
  const heldSet = useMemo(() => new Set(heldGarments.map((g) => g.id)), [heldGarments]);

  const lotMap = useMemo(() => {
    const map = new Map<string, MaterialLot>();
    (lots.data ?? []).forEach((l) => {
      map.set(l.id, l);
      if ((l as any).code) map.set((l as any).code, l);
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
        <PageHeader
          title="Incoming Material Quality Assurance (qc.incoming)"
          description="Dedicated inspection workstation at factory receiving dock & quarantine zone. Physical roll sampling, 4-point defect scoring, and quantity reconciliation (Zero scanner required)."
          crumbs={[{ label: "Staff", href: paths.home }, { label: "Quality (Incoming QC)" }]}
        />

        <div className="space-y-6">
          {/* Header & Inspector Context */}
          <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{me.username}</span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      Certified Incoming Material QC Inspector
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    First gatekeeper in the supply chain · Receiving dock &amp; quarantine zone
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md border bg-muted/50 px-2.5 py-1 text-muted-foreground">
                  <strong>Assigned Department:</strong> Receiving &amp; Raw Material Stores
                </span>
                <span className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-primary font-medium">
                  <strong>Inspection Mode:</strong> Zero-Scanner / Material Lot Sign-Off
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Physical roll sampling, 4-point defect scoring, and quantity reconciliation. Approving fabric releases usable stock balance to Raw Store &amp; Cutting. Rejections lock rolls from production.
            </p>
          </div>

          {/* Key Metric Counters */}
          <Loadable query={insp}>
            {() => {
              const awaitingLotsCount = (lots.data ?? []).filter(
                (l) => l.status === "awaiting-inspection",
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Incoming Lots Pending
                      </span>
                      <Sparkles className="size-4 text-warning" />
                    </div>
                    <p className="mt-2 text-2xl font-bold">{awaitingLotsCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Arriving fabric lots awaiting dock sign-off
                    </p>
                  </div>

                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Active Quarantine / Lot Holds
                      </span>
                      <ShieldAlert className="size-4 text-destructive" />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-destructive">
                      {quarantinedLots.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Fabric rolls blocked from production
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Cleared meterage for cutting issuance
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
                        (insp.data ?? []).filter(
                          (i) => i.kind === "incoming" && i.status === "open",
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative">
                    <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search lot, spec, inspection ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-8 text-xs w-[220px] sm:w-[260px]"
                    />
                  </div>
                  <div className="w-[150px]">
                    <NativeSelect
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: "all", label: "All Statuses" },
                        { value: "open", label: "Open (Awaiting QC)" },
                        { value: "passed", label: "Passed (Accepted)" },
                        { value: "failed", label: "Failed (Rejected)" },
                      ]}
                    />
                  </div>
                </div>

                <Loadable query={insp}>
                  {(allInspections) => {
                    const incomingRows = allInspections
                      .filter((i) => i.kind === "incoming")
                      .filter((i) => {
                        if (statusFilter !== "all" && i.status !== statusFilter) return false;
                        if (search.trim()) {
                          const s = search.toLowerCase();
                          const lot = lotMap.get(i.subjectId);
                          const matchId = i.id.toLowerCase().includes(s);
                          const matchLot = i.subjectId.toLowerCase().includes(s);
                          const matchMaterial = lot?.material.toLowerCase().includes(s) ?? false;
                          const matchDefect = i.defectReason?.toLowerCase().includes(s) ?? false;
                          if (!matchId && !matchLot && !matchMaterial && !matchDefect) return false;
                        }
                        return true;
                      })
                      .sort(
                        (a, b) =>
                          (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) ||
                          b.createdAt.localeCompare(a.createdAt),
                      );

                    return (
                      <DataTable
                        rows={incomingRows}
                        rowKey={(i) => i.id}
                        empty="No incoming fabric lots matching the filter."
                        columns={[
                          {
                            header: "Inspection ID",
                            cell: (i) => <IdLink href={paths.inspection(i.id)} id={i.id} />,
                          },
                          {
                            header: "Material Lot ID",
                            cell: (i) => {
                              const lot = lotMap.get(i.subjectId);
                              return (
                                <LinkIf
                                  user={me}
                                  routeKey="materialLot"
                                  href={paths.lot(lot?.id ?? i.subjectId)}
                                  id={lot?.id ?? i.subjectId}
                                />
                              );
                            },
                          },
                          {
                            header: "Fabric Specification",
                            cell: (i) => {
                              const lot = lotMap.get(i.subjectId);
                              return (
                                <div>
                                  <p className="font-medium text-foreground text-xs">
                                    {lot?.material ?? "Fabric roll"}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Ref: {lot?.supplierRef ?? "—"}
                                  </p>
                                </div>
                              );
                            },
                          },
                          {
                            header: "Delivery & Quantity",
                            cell: (i) => {
                              const lot = lotMap.get(i.subjectId);
                              return (
                                <span className="font-semibold tabular-nums text-xs">
                                  {lot?.receivedQty ?? 20} {lot?.unit ?? "m"}
                                </span>
                              );
                            },
                          },
                          {
                            header: "Current Status",
                            cell: (i) => (
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge
                                  status={i.status}
                                  label={
                                    i.status === "open"
                                      ? "Awaiting Inspection"
                                      : i.status === "passed"
                                        ? "Passed (Accepted)"
                                        : "Failed (Quarantined)"
                                  }
                                />
                                {i.defectReason && (
                                  <span className="text-[11px] text-destructive truncate max-w-[200px]">
                                    {i.defectReason}
                                  </span>
                                )}
                              </div>
                            ),
                          },
                          {
                            header: "Action",
                            cell: (i) => {
                              const lot = lotMap.get(i.subjectId);
                              if (i.status === "open") {
                                return (
                                  <IncomingQcDialog
                                    inspection={i}
                                    lot={lot}
                                    triggerLabel="Evaluate Lot"
                                  />
                                );
                              }
                              return (
                                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                  <AppLink href={paths.inspection(i.id)}>View Details</AppLink>
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

              {/* Mode 2: Lot Rejection & Quarantine Handling */}
              <TabsContent value="quarantine" className="mt-4 space-y-4">
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 shadow-sm flex items-start gap-3">
                  <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-destructive">
                      Active Raw Material Quarantine Zone
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Managing failed fabric rolls and logging mill defect reasons. Unapproved rolls are locked with usable balance = 0 m. Downstream production guards strictly prevent Raw Store from issuing these rolls and prevent Cutting from starting orders on this material.
                    </p>
                  </div>
                </div>

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
      <PageHeader
        title="Quality Assurance"
        description={
          me.role === "M"
            ? "Managerial quality oversight. Only certified inspectors record operational decisions."
            : "Factory inspection queues, lot-level acceptance, and result-first RFID workstation."
        }
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Quality" }]}
      />

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
                  <p className="text-xs text-muted-foreground mt-1">Garments ready for Final QC</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Reinspections
                    </span>
                    <RotateCcw className="size-4 text-warning" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{openReinsp}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Repairs awaiting independent QC
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Active Holds
                    </span>
                    <ShieldAlert className="size-4 text-destructive" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-destructive">{heldGarments.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Blocked from packing/dispatch
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Incoming Lots
                    </span>
                    <Sparkles className="size-4 text-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{openIncoming}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fabric lots pending acceptance
                  </p>
                </div>
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
                <p className="text-xs text-muted-foreground">
                  Quality holds strictly prevent downstream packaging, warehouse binning, and
                  shipment departure until an independent inspector passes reinspection.
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
          <Section
            title="Station 6: RFID Final Inspection Reader (Result-First)"
            description="Examine shirt, select Pass or Fail (with defect code) to arm context, then scan card. Identity resolves automatically."
          >
            <QAPanel stationData={qRfidStation.data} />
          </Section>
        )}

        {/* Inspection Queues */}
        <Loadable query={insp}>
          {(all) => {
            const filtered = all.filter((i) => {
              if (i.kind !== activeTab) return false;
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
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InspectionKind)}>
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

                  {tabs.map((t) => (
                    <TabsContent key={t.kind} value={t.kind} className="mt-3">
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
                            cell: (i) => (
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
                                {heldSet.has(i.subjectId) && <HoldBadge />}
                              </div>
                            ),
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
                            cell: (i) => (
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge status={i.status} />
                                {i.defectReason && (
                                  <span className="text-[11px] text-destructive truncate max-w-[180px]">
                                    {i.defectReason}
                                  </span>
                                )}
                              </div>
                            ),
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
                          {
                            header: "Action",
                            cell: (i) => {
                              if (i.kind === "incoming" && i.status === "open" && me.role === "Q") {
                                const lot = lotMap.get(i.subjectId);
                                return (
                                  <IncomingQcDialog
                                    inspection={i}
                                    lot={lot}
                                    triggerLabel="Evaluate Lot"
                                  />
                                );
                              }
                              return (
                                <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                                  <AppLink href={paths.inspection(i.id)}>Inspect</AppLink>
                                </Button>
                              );
                            },
                          },
                        ]}
                      />
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
