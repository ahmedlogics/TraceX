import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { paths } from "@/app/paths";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect } from "@/components/wt/forms";
import { fmt, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { MaterialIssue } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

function CuttingDialog({ orderId, issues }: { orderId: string; issues: MaterialIssue[] }) {
  const { run } = useWtAction();
  const [picked, setIssue] = useState("");
  const issueId = picked || issues[0]?.id || "";
  const [fabricUsed, setUsed] = useState("2.1");
  const [size, setSize] = useState("M");
  return (
    <FormDialog
      trigger="Record cutting output"
      title="Record a cutting output"
      description="Cutting creates one labelled panel set (one garment) from actual issued fabric."
      submitLabel="Record output"
      disabled={issues.length === 0}
      onSubmit={async () => !!(await run((c) => c.recordCuttingOutput({ orderId, issueId, fabricUsed: Number(fabricUsed), size }), (g) => `${g} created from cutting.`))}
    >
      <Field label="Material input" htmlFor="co-iss">
        <NativeSelect id="co-iss" value={issueId} onChange={setIssue} options={issues.map((i) => ({ value: i.id, label: `${i.id} — ${i.qty} m from ${i.lotId}` }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fabric used (m)" htmlFor="co-used"><Input id="co-used" type="number" step="0.1" min="0" value={fabricUsed} onChange={(e) => setUsed(e.target.value)} /></Field>
        <Field label="Size" htmlFor="co-size"><NativeSelect id="co-size" value={size} onChange={setSize} options={["S", "M", "L", "XL"].map((s) => ({ value: s, label: s }))} /></Field>
      </div>
    </FormDialog>
  );
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  const me = useMe();
  const q = useWtQuery(["order", orderId], (c) => c.getOrder(orderId));
  return (
    <Loadable query={q} what="production order" backHref={paths.orders}>
      {({ order, issues, cuttingOutputs, garments }) => (
        <>
          <PageHeader
            title={<span className="wt-id text-2xl">{order.id}</span>}
            description={`${order.product} · ${order.styleCode}`}
            crumbs={[{ label: "Staff", href: paths.home }, { label: "Production orders", href: paths.orders }, { label: order.id }]}
            meta={<StatusBadge status={order.status} />}
            actions={me.role === "P" && me.department === "cutting" ? <CuttingDialog orderId={order.id} issues={issues} /> : undefined}
          />
          <div className="space-y-4">
            <Section title="Order">
              <KeyValue items={[{ label: "Planned quantity", value: order.plannedQty }, { label: "Due", value: fmt.date(order.dueDate) }, { label: "Planned by", value: <UserName id={order.plannedBy} /> }, { label: "Garments created", value: garments.length }]} />
            </Section>
            <Section title="Actual material inputs">
              <DataTable
                rows={issues}
                rowKey={(i) => i.id}
                empty="No material issued yet."
                columns={[
                  { header: "Issue", cell: (i) => <span className="wt-id">{i.id}</span> },
                  { header: "Lot", cell: (i) => <LinkIf user={me} routeKey="materialLot" href={paths.lot(i.lotId)} id={i.lotId} /> },
                  { header: "Quantity", cell: (i) => `${i.qty} m` },
                  { header: "Issued", cell: (i) => fmt.dateTime(i.at) },
                  { header: "By", cell: (i) => <UserName id={i.by} /> },
                ]}
              />
            </Section>
            <Section title="Cutting outputs">
              <DataTable
                rows={cuttingOutputs}
                rowKey={(c) => c.id}
                empty="No cutting outputs yet."
                columns={[
                  { header: "Output", cell: (c) => <span className="wt-id">{c.id}</span> },
                  { header: "Panel set label", cell: (c) => <span className="wt-id">{c.panelSetLabel}</span> },
                  { header: "Fabric used", cell: (c) => `${c.fabricUsed} m` },
                  { header: "Garment", cell: (c) => <LinkIf user={me} routeKey="garment" href={paths.garment(c.garmentId)} id={c.garmentId} /> },
                ]}
              />
            </Section>
            <Section title="Lineage" description="Lot → issue → cutting output → garment">
              {cuttingOutputs.length === 0 ? (
                <EmptyState title="Lineage appears after cutting" />
              ) : (
                <ul className="space-y-2">
                  {cuttingOutputs.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <LinkIf user={me} routeKey="materialLot" href={paths.lot(c.lotId)} id={c.lotId} />
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="wt-id">{c.issueId}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="wt-id">{c.id} ({c.panelSetLabel})</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                      <LinkIf user={me} routeKey="garment" href={paths.garment(c.garmentId)} id={c.garmentId} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </Loadable>
  );
}
