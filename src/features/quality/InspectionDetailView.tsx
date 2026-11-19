import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import { checkIndependentInspection } from "@/domain/quality-fulfilment-types";
import type { ChecklistItem } from "@/domain/types";
import type { InspectionDetail } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

function InspectionBody({ d }: { d: InspectionDetail }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const i = d.inspection;
  const g = d.garment;
  const rc = d.reworkCase;

  // Independent QC check
  const isSelfRepairer = !!(i.kind === "reinspection" && rc?.repairedBy && rc.repairedBy === me.id);
  const editable = can.submitInspection(me, i) && !isSelfRepairer;

  const [checklist, setChecklist] = useState<ChecklistItem[]>(i.checklist);
  const [notes, setNotes] = useState(i.notes);
  const [defect, setDefect] = useState(i.defectReason ?? "");

  // Lot-level quantity states if this is an incoming inspection
  const lotQty = d.lot?.receivedQty ?? 20;
  const [acceptedQty, setAcceptedQty] = useState(d.lot?.acceptedQty ?? lotQty);
  const [heldQty, setHeldQty] = useState(d.lot?.heldQty ?? 0);
  const [rejectedQty, setRejectedQty] = useState(d.lot?.rejectedQty ?? 0);

  useEffect(() => {
    setChecklist(i.checklist);
    setNotes(i.notes);
    setDefect(i.defectReason ?? "");
  }, [i.id, i.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const allChecked = checklist.every((c) => c.checked);

  const canRelease = g ? can.releaseHold(me, g, d.latestForSubject, rc) && !isSelfRepairer : false;

  const submit = (result: "pass" | "fail") => {
    if (i.subjectType === "lot" && d.lot) {
      return run(
        (c) =>
          c.submitIncomingQc({
            lotId: d.lot!.id,
            inspectionId: i.id,
            acceptedQty,
            heldQty,
            rejectedQty,
            checklist,
            notes,
            result,
            defectReason: result === "fail" ? defect : undefined,
          }),
        result === "pass"
          ? `Incoming inspection ${i.id} passed: ${acceptedQty}m accepted.`
          : `Incoming inspection ${i.id} failed / held.`,
      );
    }

    return run(
      (c) =>
        c.submitInspection({
          inspectionId: i.id,
          checklist,
          notes,
          result,
          defectReason: result === "fail" ? defect : undefined,
        }),
      result === "pass" ? `${i.id} passed.` : `${i.id} failed — hold placed and rework opened.`,
    );
  };

  return (
    <>
      <PageHeader
        title={<span className="wt-id text-2xl">{i.id}</span>}
        description={`${
          i.kind === "incoming"
            ? "Incoming material lot-level evaluation"
            : i.kind === "final"
              ? "Final garment inspection before packing"
              : "Reinspection of repaired garment"
        }`}
        crumbs={[
          { label: "Staff", href: paths.home },
          { label: "Quality", href: paths.quality },
          { label: i.id },
        ]}
        meta={
          <>
            <StatusBadge status={i.status} label="Result" />
            {g?.hold && <HoldBadge />}
          </>
        }
        actions={
          canRelease && g ? (
            <Button
              size="sm"
              disabled={pending}
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => void run((c) => c.releaseHold(g.id), `Hold released on ${g.id}.`)}
            >
              <ShieldCheck className="size-4 mr-1.5" /> Release hold on {g.id}
            </Button>
          ) : undefined
        }
      />

      {/* Independent QC Alert */}
      {isSelfRepairer && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-warning-foreground">
                Independent Quality Clearance Required
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You recorded the repair on this garment ({rc?.id}). To maintain strict manufacturing
                integrity, an independent quality inspector must evaluate and release this
                reinspection.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Subject & Metadata */}
        <div className="space-y-6">
          <Section title="Subject Details">
            <KeyValue
              items={[
                {
                  label: i.subjectType === "lot" ? "Fabric lot" : "Garment",
                  value:
                    i.subjectType === "lot" ? (
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
                    ),
                },
                ...(g
                  ? [
                      { label: "Product", value: g.productName },
                      { label: "Physical Stage", value: <StatusBadge status={g.stage} /> },
                      { label: "Quality Status", value: <StatusBadge status={g.disposition} /> },
                    ]
                  : []),
                ...(d.lot
                  ? [
                      { label: "Material", value: d.lot.material },
                      { label: "Supplier Ref", value: d.lot.supplierRef },
                      { label: "Total Quantity", value: `${d.lot.receivedQty} ${d.lot.unit}` },
                    ]
                  : []),
                { label: "Inspector", value: <UserName id={i.assigneeId} /> },
                { label: "Opened", value: fmt.dateTime(i.createdAt) },
                {
                  label: "Submitted",
                  value: i.submittedAt ? (
                    <>
                      {fmt.dateTime(i.submittedAt)} · <UserName id={i.submittedBy} />
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">Pending evaluation</span>
                  ),
                },
                ...(i.rfidScanId
                  ? [
                      {
                        label: "RFID Scan Evidence",
                        value: (
                          <span className="font-mono text-xs font-semibold text-success">
                            {i.rfidScanId}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Section>

          {/* Chronology & Links */}
          <Section title="Quality Lineage & Links">
            <KeyValue
              items={[
                ...(i.previousInspectionId
                  ? [
                      {
                        label: "Previous Inspection",
                        value: (
                          <LinkIf
                            user={me}
                            routeKey="inspection"
                            href={paths.inspection(i.previousInspectionId)}
                            id={i.previousInspectionId}
                          />
                        ),
                      },
                    ]
                  : []),
                ...(rc
                  ? [
                      {
                        label: "Associated Rework Case",
                        value: (
                          <LinkIf
                            user={me}
                            routeKey="reworkCase"
                            href={paths.reworkCase(rc.id)}
                            id={rc.id}
                          />
                        ),
                      },
                      {
                        label: "Repair Performed By",
                        value: rc.repairedBy ? <UserName id={rc.repairedBy} /> : "—",
                      },
                      {
                        label: "Repair Note",
                        value: rc.repairNote ?? "—",
                      },
                    ]
                  : []),
                ...(g?.hold
                  ? [
                      {
                        label: "Active Hold Reason",
                        value: (
                          <span className="text-xs font-semibold text-destructive">
                            {g.hold.reason}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Section>
        </div>

        {/* Right Column: Checklist & Submission Form */}
        <div className="lg:col-span-2 space-y-6">
          <Section
            title="Inspection Checklist & Verification"
            description="All quality verification parameters must be examined and certified."
          >
            {/* Incoming lot breakdown form */}
            {i.subjectType === "lot" && editable && (
              <div className="rounded-lg border bg-muted/30 p-4 mb-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Lot Quantity Allocation ({d.lot?.unit ?? "m"})
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Accepted" htmlFor="dt-acc">
                    <Input
                      id="dt-acc"
                      type="number"
                      value={acceptedQty}
                      onChange={(e) => setAcceptedQty(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Held (Quarantine)" htmlFor="dt-held">
                    <Input
                      id="dt-held"
                      type="number"
                      value={heldQty}
                      onChange={(e) => setHeldQty(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Rejected" htmlFor="dt-rej">
                    <Input
                      id="dt-rej"
                      type="number"
                      value={rejectedQty}
                      onChange={(e) => setRejectedQty(Number(e.target.value))}
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Accepted quantity will become the active issuable stock for production cutting.
                </p>
              </div>
            )}

            {/* Checklist */}
            <fieldset className="space-y-3 rounded-lg border p-4 bg-card" disabled={!editable}>
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Required Quality Points
              </legend>
              {checklist.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-start gap-3 text-sm p-2 rounded-md transition-colors ${
                    editable ? "hover:bg-muted/50 cursor-pointer" : "opacity-90"
                  }`}
                >
                  <Checkbox
                    checked={c.checked}
                    onCheckedChange={(v) =>
                      setChecklist((list) =>
                        list.map((x) => (x.id === c.id ? { ...x, checked: v === true } : x)),
                      )
                    }
                    disabled={!editable}
                    className="mt-0.5"
                  />
                  <span className="leading-snug">{c.label}</span>
                </label>
              ))}
            </fieldset>

            {/* Notes & Defect Reasons */}
            <div className="space-y-4 pt-2">
              <Field label="Inspection Notes & Findings" htmlFor="insp-notes">
                <Textarea
                  id="insp-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!editable}
                  rows={3}
                  placeholder="Record observations, measurements, tolerance deviations..."
                  className="bg-card"
                />
              </Field>

              {i.defectReason && !editable && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
                    Recorded Defect Reason
                  </p>
                  <p className="text-sm text-destructive font-medium mt-1">{i.defectReason}</p>
                </div>
              )}

              {/* Action Buttons for Open Inspection */}
              {editable ? (
                <div className="rounded-lg border bg-card p-4 space-y-4 shadow-sm">
                  <Field
                    label="Defect Reason (Mandatory if Failing)"
                    htmlFor="insp-defect"
                    hint="Provide exact defect code and description (e.g. Open seam, tension fault, broken stitch)"
                  >
                    <Input
                      id="insp-defect"
                      value={defect}
                      onChange={(e) => setDefect(e.target.value)}
                      placeholder="e.g. Open seam at left sleeve hem"
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      disabled={pending || !allChecked}
                      onClick={() => void submit("pass")}
                      className="bg-success text-success-foreground hover:bg-success/90"
                    >
                      <CheckCircle2 className="size-4 mr-1.5" /> Submit Passing Result
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={pending || !defect.trim()}
                      onClick={() => void submit("fail")}
                    >
                      <XCircle className="size-4 mr-1.5" /> Submit Fail & Open Hold
                    </Button>
                  </div>

                  {!allChecked && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5 text-warning" />
                      All checklist points must be verified to submit a Pass.
                    </p>
                  )}
                </div>
              ) : i.status === "open" ? (
                <ScopeNote>
                  {isSelfRepairer
                    ? "Independent QC rule: Another quality inspector must perform this reinspection."
                    : me.role === "M"
                      ? "Managers have read-only quality oversight."
                      : "Only authorized quality inspectors can submit inspection results."}
                </ScopeNote>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  This inspection is finalized ({i.status.toUpperCase()}). Historical results remain
                  immutable.
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

export function InspectionDetailView({ inspectionId }: { inspectionId: string }) {
  const q = useWtQuery(["inspection", inspectionId], (c) => c.getInspection(inspectionId));
  return (
    <Loadable query={q} what="inspection" backHref={paths.quality}>
      {(d) => <InspectionBody key={d.inspection.id} d={d} />}
    </Loadable>
  );
}
