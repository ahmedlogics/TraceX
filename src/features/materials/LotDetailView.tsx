import { useState } from "react";
import { paths } from "@/app/paths";
import { Input } from "@/components/ui/input";
import { Field, FormDialog, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section, Timeline } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { MaterialLot, ProductionOrder } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

function IssueDialog({ lot, orders }: { lot: MaterialLot; orders: ProductionOrder[] }) {
  const { run } = useWtAction();
  const open = orders.filter((o) => o.status !== "completed");
  const [picked, setOrder] = useState("");
  const orderId = picked || open[0]?.id || "";
  const [qty, setQty] = useState("4");
  return (
    <FormDialog
      trigger="Issue material"
      title={`Issue from ${lot.id}`}
      description={`Available balance: ${lot.balanceQty} m`}
      submitLabel="Issue"
      disabled={lot.status !== "accepted"}
      onSubmit={async () => !!(await run((c) => c.issueMaterial({ lotId: lot.id, orderId, qty: Number(qty) }), (r) => `${r} issued to ${orderId}.`))}
    >
      <Field label="Production order" htmlFor="iss-order">
        <NativeSelect id="iss-order" value={orderId} onChange={setOrder} options={open.map((o) => ({ value: o.id, label: `${o.id} — ${o.product}` }))} />
      </Field>
      <Field label="Quantity (m)" htmlFor="iss-qty">
        <Input id="iss-qty" type="number" min="0" step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export function LotDetailView({ lotId }: { lotId: string }) {
  const me = useMe();
  const q = useWtQuery(["lot", lotId], (c) => c.getLot(lotId));
  return (
    <Loadable query={q} what="material lot" backHref={paths.lots}>
      {({ lot, inspection, issues, cuttingOutputs, orders }) => (
        <>
          <PageHeader
            title={<span className="wt-id text-2xl">{lot.id}</span>}
            description={lot.material}
            crumbs={[{ label: "Staff", href: paths.home }, { label: "Material lots", href: paths.lots }, { label: lot.id }]}
            meta={<StatusBadge status={lot.status} label="Incoming QC" />}
            actions={can.issueMaterial(me) ? <IssueDialog lot={lot} orders={orders} /> : undefined}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Receipt">
              <KeyValue
                items={[
                  { label: "Received", value: fmt.dateTime(lot.receivedAt) },
                  { label: "Received by", value: <UserName id={lot.receivedBy} /> },
                  { label: "Quantity", value: `${lot.receivedQty} m` },
                  { label: "Supplier ref (internal)", value: lot.supplierRef },
                ]}
              />
            </Section>
            <Section title="Inspection and balance">
              <KeyValue
                items={[
                  {
                    label: "Incoming inspection (lot-level)",
                    value: inspection ? (
                      <span className="flex items-center gap-2">
                        <LinkIf user={me} routeKey="inspection" href={paths.inspection(inspection.id)} id={inspection.id} />
                        <StatusBadge status={inspection.status} />
                      </span>
                    ) : "—",
                  },
                  { label: "Balance on hand", value: <span className="tabular-nums">{lot.balanceQty} m</span> },
                  { label: "Issued", value: `${(lot.receivedQty - lot.balanceQty).toFixed(2)} m` },
                  { label: "Cutting outputs", value: cuttingOutputs.length },
                ]}
              />
              {lot.status !== "accepted" && can.issueMaterial(me) && <div className="mt-3"><ScopeNote>Material can be issued only after the lot passes incoming inspection.</ScopeNote></div>}
            </Section>
            <Section title="Movement history" className="lg:col-span-2">
              <Timeline
                items={[
                  { key: "rcv", title: `Received ${lot.receivedQty} m`, meta: fmt.dateTime(lot.receivedAt) },
                  ...(inspection?.submittedAt
                    ? [{ key: "qc", title: `Incoming inspection ${inspection.status}`, meta: fmt.dateTime(inspection.submittedAt), tone: inspection.status === "failed" ? ("danger" as const) : ("success" as const) }]
                    : []),
                  ...issues.map((i) => ({
                    key: i.id,
                    title: <>Issued {i.qty} m to <LinkIf user={me} routeKey="productionOrder" href={paths.order(i.orderId)} id={i.orderId} /></>,
                    meta: <>{fmt.dateTime(i.at)} · <span className="wt-id">{i.id}</span> · <UserName id={i.by} /></>,
                  })),
                  ...cuttingOutputs.map((c) => ({
                    key: c.id,
                    title: <>Cut {c.fabricUsed} m → panel set {c.panelSetLabel} → <LinkIf user={me} routeKey="garment" href={paths.garment(c.garmentId)} id={c.garmentId} /></>,
                    meta: <>{fmt.dateTime(c.at)} · <span className="wt-id">{c.id}</span></>,
                  })),
                ]}
              />
            </Section>
          </div>
        </>
      )}
    </Loadable>
  );
}
