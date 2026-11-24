import { useState } from "react";
import { ArrowRight, CheckCircle2, Layers, Package, Radio, Scissors, Tag } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section, Timeline } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can, canAccessRoute } from "@/domain/permissions";
import type { MaterialLot, ProductionOrder } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

function IssueDialog({ lot, orders }: { lot: MaterialLot; orders: ProductionOrder[] }) {
  const { run } = useWtAction();
  const open = orders.filter((o) => o.status === "approved" || o.status === "in-progress" || o.status === "planned");
  const [picked, setOrder] = useState("");
  const orderId = picked || open[0]?.id || "";
  const [qty, setQty] = useState("4");

  return (
    <FormDialog
      trigger="Issue material to order"
      title={`Issue Fabric from Lot ${lot.id}`}
      description={`Available balance: ${lot.balanceQty} ${lot.unit ?? "m"}. Issuing reduces free stock and creates an immutable material movement.`}
      submitLabel="Confirm issue"
      disabled={lot.status !== "accepted" || lot.balanceQty <= 0 || open.length === 0}
      onSubmit={async () =>
        !!(await run(
          (c) => c.issueMaterial({ lotId: lot.id, orderId, qty: Number(qty) }),
          (r) => `${r} issued to order ${orderId}.`,
        ))
      }
    >
      <Field label="Approved production order" htmlFor="iss-order">
        <NativeSelect
          id="iss-order"
          value={orderId}
          onChange={setOrder}
          options={open.map((o) => ({ value: o.id, label: `${o.id} — ${o.product} (${o.plannedQty} pcs · ${o.status})` }))}
        />
      </Field>
      <Field label="Issue quantity (meters)" htmlFor="iss-qty">
        <Input
          id="iss-qty"
          type="number"
          min="0.01"
          max={lot.balanceQty}
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </Field>
      <p className="text-xs text-muted-foreground pt-1">
        At Station 2 (Fabric Issue), scanning bundle card {lot.rfidUid ? `(${lot.rfidUid})` : ""} confirms physical transfer to the cutting table.
      </p>
    </FormDialog>
  );
}

export function LotDetailView({ lotId }: { lotId: string }) {
  const me = useMe();
  const q = useWtQuery(["lot", lotId], (c) => c.getLot(lotId));

  return (
    <Loadable query={q} what="material lot" backHref={paths.lots}>
      {({ lot, inspection, issues, cuttingOutputs, orders }) => {
        const totalIssued = issues.reduce((acc, i) => acc + i.qty, 0);
        const totalConsumedInCutting = cuttingOutputs.reduce((acc, c) => acc + c.fabricUsed, 0);

        return (
          <>
            <PageHeader
              title={<span className="wt-id text-2xl font-bold">{lot.id}</span>}
              description={lot.material}
              meta={
                <div className="flex items-center gap-2">
                  <StatusBadge status={lot.status} label="Incoming QC" />
                  {lot.rfidUid ? (
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                      <Radio className="size-3" /> {lot.rfidUid}
                    </span>
                  ) : lot.status === "accepted" ? (
                    <span
                      className="text-xs text-muted-foreground italic bg-muted px-2 py-0.5 rounded"
                      title="Accepted via Dashboard QC · Hardware RFID card unassigned"
                    >
                      Unassigned (Dashboard Verified)
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                      Card Pending (Station 1)
                    </span>
                  )}
                </div>
              }
              actions={
                <div className="flex flex-wrap gap-2">
                  {can.issueMaterial(me) && <IssueDialog lot={lot} orders={orders} />}
                  {lot.status === "awaiting-inspection" && (me.role === "Q" || me.role === "M" || me.role === "A") && (
                    lot.rfidUid ? (
                      <Button asChild size="sm" className="bg-primary">
                        <AppLink href={paths.home}>
                          Evaluate at QC Gate <ArrowRight className="size-3.5 ml-1" />
                        </AppLink>
                      </Button>
                    ) : (
                      canAccessRoute(me, "workstation") && (
                        <Button asChild size="sm" variant="outline" className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10">
                          <AppLink href={paths.workstation}>
                            Assign Card at Station 1 <ArrowRight className="size-3.5 ml-1" />
                          </AppLink>
                        </Button>
                      )
                    )
                  )}
                  {canAccessRoute(me, "workstation") && (
                    <Button asChild variant="outline" size="sm">
                      <AppLink href={paths.workstation}>
                        Station Panel <ArrowRight className="size-3.5 ml-1" />
                      </AppLink>
                    </Button>
                  )}
                </div>
              }
            />

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
              <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Received Stock</span>
                  <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                    <Layers className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight">{lot.receivedQty} {lot.unit ?? "m"}</p>
              </div>
              <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-success/40 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Free Balance</span>
                  <div className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-success tabular-nums">{lot.balanceQty} {lot.unit ?? "m"}</p>
              </div>
              <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Issued to Orders</span>
                  <div className="flex size-7 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground group-hover:scale-105 transition-transform">
                    <Package className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-primary tabular-nums">{totalIssued.toFixed(1)} {lot.unit ?? "m"}</p>
              </div>
              <div className="group rounded-xl border border-border/80 bg-card p-3.5 shadow-xs hover:border-accent-foreground/40 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Cut Garments</span>
                  <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:scale-105 transition-transform">
                    <Scissors className="size-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{cuttingOutputs.length} pcs</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Receipt & Identification */}
              <Section title="Receipt & Identification">
                <KeyValue
                  items={[
                    { label: "Material Name", value: lot.material },
                    { label: "Supplier Ref / Slip", value: lot.supplierRef },
                    { label: "Received Timestamp", value: fmt.dateTime(lot.receivedAt) },
                    { label: "Received By Staff", value: <UserName id={lot.receivedBy} /> },
                    {
                      label: "Active Bundle RFID Card",
                      value: lot.rfidUid ? (
                        <span className="font-mono font-bold text-success">{lot.rfidUid}</span>
                      ) : lot.status === "accepted" ? (
                        <span className="text-muted-foreground italic">Unassigned (Dashboard Verified)</span>
                      ) : (
                        <span className="text-amber-600 font-medium">None (bind at Station 1)</span>
                      ),
                    },
                    {
                      label: "Lineage Rule",
                      value: "Fabric bundle supplies orders via discrete material issues; garments link to actual issue movement.",
                    },
                  ]}
                />
              </Section>

              {/* Inspection & Stock Control */}
              <Section title="Quality Clearance & Allocation">
                <KeyValue
                  items={[
                    {
                      label: "Incoming Inspection",
                      value: inspection ? (
                        <span className="flex items-center gap-2">
                          <LinkIf
                            user={me}
                            routeKey="inspection"
                            href={paths.inspection(inspection.id)}
                            id={inspection.id}
                          />
                          <StatusBadge status={inspection.status} />
                        </span>
                      ) : lot.status === "awaiting-inspection" && (!lot.rfidUid || lot.rfidUid === "unassigned") ? (
                        <span className="text-amber-600 font-medium">Awaiting Station 1 Receiving Scan</span>
                      ) : (
                        <span className="text-warning font-medium">Ready for Incoming QC Inspection</span>
                      ),
                    },
                    {
                      label: "Available Free Balance",
                      value: <span className="tabular-nums font-semibold">{lot.balanceQty} {lot.unit ?? "m"}</span>,
                    },
                    {
                      label: "Issued to Production",
                      value: <span className="tabular-nums">{totalIssued.toFixed(1)} {lot.unit ?? "m"}</span>,
                    },
                    {
                      label: "Consumed in Cutting",
                      value: <span className="tabular-nums">{totalConsumedInCutting.toFixed(1)} {lot.unit ?? "m"}</span>,
                    },
                  ]}
                />

                {lot.status !== "accepted" && (
                  <div className="mt-4">
                    <ScopeNote>
                      Fabric lot must pass incoming quality inspection before it can be issued to production orders.
                    </ScopeNote>
                  </div>
                )}
              </Section>

              {/* Material Issues Table */}
              <Section title="Material Issue Movements" className="lg:col-span-2">
                <DataTable
                  rows={issues}
                  rowKey={(i) => i.id}
                  empty="No material issues recorded yet for this fabric bundle."
                  columns={[
                    {
                      header: "Issue Code",
                      cell: (i) => <span className="wt-id font-bold text-xs">{i.id}</span>,
                    },
                    {
                      header: "Production Order",
                      cell: (i) => (
                        <LinkIf
                          user={me}
                          routeKey="productionOrder"
                          href={paths.order(i.orderId)}
                          id={i.orderId}
                        />
                      ),
                    },
                    {
                      header: "Quantity Issued",
                      cell: (i) => <span className="font-semibold tabular-nums">{i.qty} {lot.unit ?? "m"}</span>,
                    },
                    {
                      header: "Cut Consumption",
                      cell: (i) => {
                        const cutsForIssue = cuttingOutputs.filter((c) => c.issueId === i.id);
                        const used = cutsForIssue.reduce((acc, c) => acc + c.fabricUsed, 0);
                        return (
                          <span className="tabular-nums text-xs">
                            {used.toFixed(2)} m consumed ({cutsForIssue.length} garments)
                          </span>
                        );
                      },
                    },
                    {
                      header: "Timestamp",
                      cell: (i) => fmt.dateTime(i.at),
                    },
                    {
                      header: "Issued By",
                      cell: (i) => <UserName id={i.by} />,
                    },
                  ]}
                />
              </Section>

              {/* Downstream Garment Lineage */}
              <Section title="Cut Garments Attributed to this Lot" className="lg:col-span-2">
                <DataTable
                  rows={cuttingOutputs}
                  rowKey={(c) => c.id}
                  empty="No garments cut from this lot yet."
                  columns={[
                    {
                      header: "Cut Record",
                      cell: (c) => <span className="wt-id text-xs">{c.id}</span>,
                    },
                    {
                      header: "Panel Set",
                      cell: (c) => <span className="font-mono text-xs">{c.panelSetLabel}</span>,
                    },
                    {
                      header: "Garment Output",
                      cell: (c) => (
                        <LinkIf
                          user={me}
                          routeKey="garment"
                          href={paths.garment(c.garmentId)}
                          id={c.garmentId}
                        />
                      ),
                    },
                    {
                      header: "Material Issue",
                      cell: (c) => <span className="wt-id text-xs">{c.issueId}</span>,
                    },
                    {
                      header: "Fabric Consumed",
                      cell: (c) => <span className="tabular-nums">{c.fabricUsed} {lot.unit ?? "m"}</span>,
                    },
                    {
                      header: "Cut Timestamp",
                      cell: (c) => fmt.dateTime(c.at),
                    },
                  ]}
                />
              </Section>

              {/* Movement History */}
              <Section title="Chronological Movement History" className="lg:col-span-2">
                <Timeline
                  items={[
                    {
                      key: "rcv",
                      title: `Received bundle ${lot.id} (${lot.receivedQty} ${lot.unit ?? "m"})`,
                      meta: `${fmt.dateTime(lot.receivedAt)} · By ${lot.receivedBy}`,
                      body: `Supplier ref: ${lot.supplierRef} · Initial free balance: ${lot.receivedQty} ${lot.unit ?? "m"}`,
                      tone: "default",
                    },
                    ...(inspection?.submittedAt
                      ? [
                          {
                            key: "qc",
                            title: `Incoming QC inspection ${inspection.status}`,
                            meta: fmt.dateTime(inspection.submittedAt),
                            body: `Inspection record: ${inspection.id} · Lot status: ${lot.status}`,
                            tone:
                              inspection.status === "failed"
                                ? ("danger" as const)
                                : ("success" as const),
                          },
                        ]
                      : []),
                    ...issues.map((i) => ({
                      key: i.id,
                      title: `Issued ${i.qty} ${lot.unit ?? "m"} to order ${i.orderId}`,
                      meta: `${fmt.dateTime(i.at)} · Movement ${i.id}`,
                      body: `Issued to ${i.orderId} · Balance deducted`,
                      tone: "default" as const,
                    })),
                    ...cuttingOutputs.map((c) => ({
                      key: c.id,
                      title: `Cut ${c.fabricUsed} ${lot.unit ?? "m"} for garment ${c.garmentId} (${c.panelSetLabel})`,
                      meta: `${fmt.dateTime(c.at)} · Cut ${c.id}`,
                      body: `Attributed against issue ${c.issueId}`,
                      tone: "success" as const,
                    })),
                  ]}
                />
              </Section>
            </div>
          </>
        );
      }}
    </Loadable>
  );
}
