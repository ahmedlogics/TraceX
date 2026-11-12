import { useEffect, useState } from "react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, ScopeNote } from "@/components/wt/forms";
import { fmt, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
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
  const editable = can.submitInspection(me, i);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(i.checklist);
  const [notes, setNotes] = useState(i.notes);
  const [defect, setDefect] = useState("");
  useEffect(() => {
    setChecklist(i.checklist);
    setNotes(i.notes);
  }, [i.id, i.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const allChecked = checklist.every((c) => c.checked);
  const submit = (result: "pass" | "fail") =>
    run((c) => c.submitInspection({ inspectionId: i.id, checklist, notes, result, defectReason: defect }), result === "pass" ? `${i.id} passed.` : `${i.id} failed — hold placed and rework opened.`);
  const g = d.garment;
  const canRelease = g ? can.releaseHold(me, g, d.latestForSubject) : false;

  return (
    <>
      <PageHeader
        title={<span className="wt-id text-2xl">{i.id}</span>}
        description={`${i.kind === "incoming" ? "Incoming lot-level" : i.kind === "final" ? "Final" : "Re"} inspection`}
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Quality", href: paths.quality }, { label: i.id }]}
        meta={<><StatusBadge status={i.status} label="Result" />{g?.hold && <HoldBadge />}</>}
        actions={
          canRelease && g ? (
            <Button size="sm" disabled={pending} onClick={() => void run((c) => c.releaseHold(g.id), `Hold released on ${g.id}.`)}>
              Release hold on {g.id}
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Subject">
          <KeyValue
            items={[
              {
                label: i.subjectType === "lot" ? "Fabric lot" : "Garment",
                value: i.subjectType === "lot" ? <LinkIf user={me} routeKey="materialLot" href={paths.lot(i.subjectId)} id={i.subjectId} /> : <LinkIf user={me} routeKey="garment" href={paths.garment(i.subjectId)} id={i.subjectId} />,
              },
              { label: "Inspector", value: <UserName id={i.assigneeId} /> },
              { label: "Opened", value: fmt.dateTime(i.createdAt) },
              { label: "Submitted", value: i.submittedAt ? <>{fmt.dateTime(i.submittedAt)} · <UserName id={i.submittedBy} /></> : "Not yet" },
              ...(i.previousInspectionId ? [{ label: "Previous inspection", value: <LinkIf user={me} routeKey="inspection" href={paths.inspection(i.previousInspectionId)} id={i.previousInspectionId} /> }] : []),
              ...(d.reworkCase ? [{ label: "Rework case", value: <LinkIf user={me} routeKey="reworkCase" href={paths.reworkCase(d.reworkCase.id)} id={d.reworkCase.id} /> }] : []),
            ]}
          />
        </Section>
        <Section title="Checklist and notes" className="lg:col-span-2">
          <fieldset className="space-y-2" disabled={!editable}>
            <legend className="sr-only">Checklist</legend>
            {checklist.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={c.checked}
                  onCheckedChange={(v) => setChecklist((list) => list.map((x) => (x.id === c.id ? { ...x, checked: v === true } : x)))}
                  disabled={!editable}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
          <div className="mt-4 space-y-3">
            <Field label="Notes" htmlFor="insp-notes">
              <Textarea id="insp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} rows={3} />
            </Field>
            {i.defectReason && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive">Defect reason: {i.defectReason}</p>}
            {editable ? (
              <div className="space-y-3 rounded-md border p-3">
                <Field label="Defect reason (required to fail)" htmlFor="insp-defect">
                  <Input id="insp-defect" value={defect} onChange={(e) => setDefect(e.target.value)} placeholder="e.g. Open seam at left side seam" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending || !allChecked} onClick={() => void submit("pass")}>Submit Pass</Button>
                  <Button variant="destructive" disabled={pending || !defect.trim()} onClick={() => void submit("fail")}>Submit Fail</Button>
                </div>
                {!allChecked && <p className="text-xs text-muted-foreground">Tick every checklist item to pass.</p>}
              </div>
            ) : i.status === "open" ? (
              <ScopeNote>{me.role === "M" ? "Managers have read-only access to inspections." : "Only the quality inspector can submit a result."}</ScopeNote>
            ) : null}
            <p className="text-xs text-muted-foreground">A checkpoint presentation records presence only. It never records a QC result.</p>
          </div>
        </Section>
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
