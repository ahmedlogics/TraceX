import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { paths } from "@/app/paths";
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

function IncomingQcDialog({
  inspection,
  lot,
  triggerLabel = "Perform Incoming QC",
}: {
  inspection: Inspection;
  lot?: MaterialLot | undefined;
  triggerLabel?: string | undefined;
}) {
  const { run } = useWtAction();
  const totalQty = lot?.receivedQty ?? 20;
  const [acceptedQty, setAcceptedQty] = useState(totalQty);
  const [heldQty, setHeldQty] = useState(0);
  const [rejectedQty, setRejectedQty] = useState(0);
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [defectReason, setDefectReason] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(inspection.checklist);

  const totalCalculated = Number(acceptedQty) + Number(heldQty) + Number(rejectedQty);
  const isBalanced = totalCalculated === totalQty;
  const allChecked = checklist.every((c) => c.checked);
  const canSubmit =
    isBalanced && (result === "pass" ? allChecked && acceptedQty > 0 : !!defectReason.trim());

  return (
    <FormDialog
      trigger={triggerLabel}
      triggerVariant="default"
      title={`Incoming Inspection: ${inspection.id}`}
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
          `Incoming QC recorded: ${acceptedQty}${lot?.unit ?? "m"} accepted, lot marked ${result === "pass" ? "accepted" : "rejected"}.`,
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
              onClick={() => setResult("pass")}
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
              onClick={() => setResult("fail")}
            >
              <XCircle className="size-4 mr-1.5" /> Reject / Hold Lot
            </Button>
          </div>
        </div>

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
              <span className="text-destructive">
                Quantities must balance to received quantity.
              </span>
            )}
          </div>
        </div>

        {result === "fail" && (
          <Field label="Defect Reason (Required on Fail)" htmlFor="in-defect">
            <Input
              id="in-defect"
              value={defectReason}
              onChange={(e) => setDefectReason(e.target.value)}
              placeholder="e.g. Shading mismatch across roll, oil contamination"
            />
          </Field>
        )}

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Fabric Quality Checklist
          </p>
          {checklist.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
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
                className="rounded border-input text-primary"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>

        <Field label="Inspection Notes" htmlFor="in-notes">
          <Input
            id="in-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Visual texture, thread count, lab test reference..."
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

  const [activeTab, setActiveTab] = useState<InspectionKind>("final");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const heldGarments = useMemo(
    () => (garments.data ?? []).filter((g) => !!g.hold),
    [garments.data],
  );
  const heldSet = useMemo(() => new Set(heldGarments.map((g) => g.id)), [heldGarments]);

  const lotMap = useMemo(() => {
    const map = new Map<string, MaterialLot>();
    (lots.data ?? []).forEach((l) => map.set(l.id, l));
    return map;
  }, [lots.data]);

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
                  <p className="text-xs text-muted-foreground mt-1">Garments ready at S6</p>
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

        {/* Active Holds Banner */}
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

        {/* Workstation RFID Station Panel */}
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
                      {tabs.map((t) => {
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
                                  <IdLink href={paths.inspection(i.id)} id="Inspect" />
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
