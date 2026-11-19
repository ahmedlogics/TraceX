import { useState } from "react";
import { ArrowRight, CheckCircle2, Layers, Package, Radio, Scissors, ShieldAlert, Tag } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { MaterialIssue } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

function CuttingDialog({ orderId, issues }: { orderId: string; issues: MaterialIssue[] }) {
  const { run } = useWtAction();
  const [picked, setIssue] = useState("");
  const issueId = picked || issues[0]?.id || "";
  const [fabricUsed, setUsed] = useState("2.0");
  const [size, setSize] = useState("M");

  return (
    <FormDialog
      trigger="Record cutting output"
      title="Record a Cutting Output (Dashboard Fallback)"
      description="Cutting creates one labelled panel set (one garment) from actual issued fabric. Use Station 3 (Cutting) for physical RFID card binding."
      submitLabel="Record output"
      disabled={issues.length === 0}
      onSubmit={async () =>
        !!(await run(
          (c) => c.recordCuttingOutput({ orderId, issueId, fabricUsed: Number(fabricUsed), size }),
          (g) => `${g} created from cutting.`,
        ))
      }
    >
      <Field label="Material input (issued fabric)" htmlFor="co-iss">
        <NativeSelect
          id="co-iss"
          value={issueId}
          onChange={setIssue}
          options={issues.map((i) => ({
            value: i.id,
            label: `${i.id} — ${i.qty} m from ${i.lotId}`,
          }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fabric used per garment (m)" htmlFor="co-used">
          <Input
            id="co-used"
            type="number"
            step="0.1"
            min="0.1"
            value={fabricUsed}
            onChange={(e) => setUsed(e.target.value)}
          />
        </Field>
        <Field label="Size variant" htmlFor="co-size">
          <NativeSelect
            id="co-size"
            value={size}
            onChange={setSize}
            options={["S", "M", "L", "XL"].map((s) => ({ value: s, label: `Size ${s}` }))}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

export function OrderDetailView({ orderId }: { orderId: string }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const q = useWtQuery(["order", orderId], (c) => c.getOrder(orderId));

  return (
    <Loadable query={q} what="production order" backHref={paths.orders}>
      {({ order, issues, cuttingOutputs, garments }) => {
        const totalIssuedMeters = Math.round(issues.reduce((acc, i) => acc + i.qty, 0) * 1000) / 1000;
        const totalConsumedMeters = Math.round(cuttingOutputs.reduce((acc, c) => acc + c.fabricUsed, 0) * 1000) / 1000;
        const freeInIssues = Math.round(Math.max(0, totalIssuedMeters - totalConsumedMeters) * 1000) / 1000;
        const progressPct = Math.min(100, Math.round((garments.length / Math.max(1, order.plannedQty)) * 100));

        return (
          <>
            <PageHeader
              title={<span className="wt-id text-2xl font-bold">{order.id}</span>}
              description={`${order.product} · Style code: ${order.styleCode}`}
              crumbs={[
                { label: "Staff", href: paths.home },
                { label: "Production orders", href: paths.orders },
                { label: order.id },
              ]}
              meta={<StatusBadge status={order.status} />}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {can.approveOrder(me) &&
                    (order.status === "planned" || order.status === "draft") && (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            (c) => c.approveOrder(order.id),
                            `${order.id} approved for production.`,
                          )
                        }
                      >
                        <CheckCircle2 className="size-4 mr-1 text-success" /> Approve order
                      </Button>
                    )}
                  {me.role === "P" && me.department === "cutting" && issues.length > 0 && (
                    <CuttingDialog orderId={order.id} issues={issues} />
                  )}
                  <Button asChild variant="outline" size="sm">
                    <AppLink href={paths.workstation}>
                      Cutting Station <ArrowRight className="size-3.5 ml-1" />
                    </AppLink>
                  </Button>
                </div>
              }
            />

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
              <div className="rounded-lg border bg-card p-3 shadow-xs">
                <p className="text-xs text-muted-foreground font-medium">Planned Output</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{order.plannedQty} pcs</p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3 shadow-xs">
                <p className="text-xs text-muted-foreground font-medium">Garments Cut</p>
                <p className="mt-1 text-2xl font-bold text-primary tabular-nums">{garments.length} pcs</p>
                <p className="text-[11px] text-muted-foreground mt-1">{progressPct}% of target completed</p>
              </div>
              <div className="rounded-lg border bg-card p-3 shadow-xs">
                <p className="text-xs text-muted-foreground font-medium">Fabric Issued</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{totalIssuedMeters.toFixed(2)} m</p>
                <p className="text-[11px] text-muted-foreground mt-1">From {issues.length} issue movement(s)</p>
              </div>
              <div className="rounded-lg border bg-card p-3 shadow-xs">
                <p className="text-xs text-muted-foreground font-medium">Remaining Free in Issues</p>
                <p className="mt-1 text-2xl font-bold text-success tabular-nums">{freeInIssues.toFixed(2)} m</p>
                <p className="text-[11px] text-muted-foreground mt-1">{totalConsumedMeters.toFixed(2)} m consumed</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Order Metadata */}
              <Section title="Order Specifications & Approval">
                <KeyValue
                  items={[
                    { label: "Product Name", value: order.product },
                    { label: "Style Code", value: <span className="font-mono font-semibold">{order.styleCode}</span> },
                    { label: "Planned Output", value: `${order.plannedQty} pcs` },
                    { label: "Target Completion Date", value: fmt.date(order.dueDate) },
                    { label: "Planned By", value: <UserName id={order.plannedBy} /> },
                    {
                      label: "Approval Authorization",
                      value: order.approvedBy ? (
                        <span className="text-success font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="size-3.5" /> Approved by <UserName id={order.approvedBy} /> ({fmt.date(order.approvedAt)})
                        </span>
                      ) : (
                        <span className="text-warning font-medium">Awaiting Manager Approval</span>
                      ),
                    },
                    {
                      label: "Lineage Rule",
                      value: "Production orders have NO RFID cards. Garments created at Cutting receive individual RFID cards linked to actual issue movements.",
                    },
                  ]}
                />
              </Section>

              {/* 1. Actual Material Inputs (Issued Fabric) */}
              <Section
                title="1. Actual Material Inputs (Issued Fabric)"
                description="Fabric lots issued specifically to this production order."
              >
                <DataTable
                  rows={issues}
                  rowKey={(i) => i.id}
                  empty="No fabric has been issued to this order yet. Allocate stock at Station 2 (Fabric Issue)."
                  columns={[
                    {
                      header: "Issue Code",
                      cell: (i) => <span className="wt-id font-bold text-xs">{i.id}</span>,
                    },
                    {
                      header: "Source Fabric Lot",
                      cell: (i) => (
                        <LinkIf
                          user={me}
                          routeKey="materialLot"
                          href={paths.lot(i.lotId)}
                          id={i.lotId}
                        />
                      ),
                    },
                    {
                      header: "Quantity Issued",
                      cell: (i) => <span className="font-semibold tabular-nums">{i.qty} m</span>,
                    },
                    {
                      header: "Cutting Consumption",
                      cell: (i) => {
                        const cuts = cuttingOutputs.filter((c) => c.issueId === i.id);
                        const used = Math.round(cuts.reduce((acc, c) => acc + c.fabricUsed, 0) * 1000) / 1000;
                        const free = Math.round(Math.max(0, i.qty - used) * 1000) / 1000;
                        return (
                          <div className="space-y-0.5 text-xs">
                            <p className="tabular-nums font-medium">{used.toFixed(2)} m consumed ({cuts.length} cuts)</p>
                            <p className="text-[11px] text-muted-foreground">{free.toFixed(2)} m available</p>
                          </div>
                        );
                      },
                    },
                    {
                      header: "Issued Timestamp",
                      cell: (i) => fmt.dateTime(i.at),
                    },
                    {
                      header: "Issued By",
                      cell: (i) => <UserName id={i.by} />,
                    },
                  ]}
                />
              </Section>

              {/* 2. Cutting Outputs */}
              <Section
                title="2. Cutting Jobs & Outputs"
                description="Component panel sets cut from actual issued material."
              >
                <DataTable
                  rows={cuttingOutputs}
                  rowKey={(c) => c.id}
                  empty="No cutting outputs recorded yet for this order."
                  columns={[
                    {
                      header: "Cut ID",
                      cell: (c) => <span className="wt-id font-bold text-xs">{c.id}</span>,
                    },
                    {
                      header: "Panel Set Label",
                      cell: (c) => <span className="font-mono text-xs font-semibold">{c.panelSetLabel}</span>,
                    },
                    {
                      header: "Fabric Consumed",
                      cell: (c) => <span className="tabular-nums font-semibold">{c.fabricUsed} m</span>,
                    },
                    {
                      header: "Source Issue / Lot",
                      cell: (c) => (
                        <div className="text-xs">
                          <span className="wt-id">{c.issueId}</span>
                          <span className="text-muted-foreground ml-1">({c.lotId})</span>
                        </div>
                      ),
                    },
                    {
                      header: "Garment Produced",
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
                      header: "Timestamp",
                      cell: (c) => fmt.dateTime(c.at),
                    },
                  ]}
                />
              </Section>

              {/* 3. Individual Garments Created */}
              <Section
                title="3. Individual Garments (Assembly & Progress)"
                description="Physical garments created from this order's cutting runs."
              >
                <DataTable
                  rows={garments}
                  rowKey={(g) => g.id}
                  empty="No garments created yet. Scan fresh RFID cards at Station 3 (Cutting)."
                  columns={[
                    {
                      header: "Garment Code",
                      cell: (g) => (
                        <div>
                          <LinkIf
                            user={me}
                            routeKey="garment"
                            href={paths.garment(g.id)}
                            id={g.id}
                          />
                          <p className="text-[11px] text-muted-foreground mt-0.5">{g.publicId}</p>
                        </div>
                      ),
                    },
                    {
                      header: "Active RFID Card",
                      cell: (g) =>
                        g.rfidUid ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                            <Radio className="size-3" /> {g.rfidUid}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Unassigned</span>
                        ),
                    },
                    {
                      header: "Size",
                      cell: (g) => (
                        <span className="inline-flex rounded bg-muted px-2 py-0.5 text-xs font-medium">
                          {g.size ?? "—"}
                        </span>
                      ),
                    },
                    {
                      header: "Physical Stage",
                      cell: (g) => <StatusBadge status={g.stage} />,
                    },
                    {
                      header: "Quality Clearance",
                      cell: (g) => (
                        <div className="flex items-center gap-1">
                          <StatusBadge status={g.disposition} />
                          {g.hold && <HoldBadge />}
                        </div>
                      ),
                    },
                  ]}
                />
              </Section>

              {/* Visual Lineage Map */}
              <Section
                title="Lineage Provenance Map"
                description="Unbroken chain from raw fabric lot through issue and cutting to individual garments."
              >
                {cuttingOutputs.length === 0 ? (
                  <EmptyState title="Lineage records appear after cutting outputs are registered" />
                ) : (
                  <div className="space-y-2.5">
                    {cuttingOutputs.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-xs shadow-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <Layers className="size-3.5 text-primary" />
                          <span className="font-semibold text-muted-foreground">Lot:</span>
                          <LinkIf
                            user={me}
                            routeKey="materialLot"
                            href={paths.lot(c.lotId)}
                            id={c.lotId}
                          />
                        </div>
                        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-muted-foreground">Issue:</span>
                          <span className="wt-id">{c.issueId}</span>
                        </div>
                        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        <div className="flex items-center gap-1.5">
                          <Scissors className="size-3.5 text-accent-foreground" />
                          <span className="font-semibold text-muted-foreground">Cut:</span>
                          <span className="wt-id">{c.id} ({c.panelSetLabel}) · {c.fabricUsed}m</span>
                        </div>
                        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        <div className="flex items-center gap-1.5">
                          <Tag className="size-3.5 text-success" />
                          <span className="font-semibold text-muted-foreground">Garment:</span>
                          <LinkIf
                            user={me}
                            routeKey="garment"
                            href={paths.garment(c.garmentId)}
                            id={c.garmentId}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </>
        );
      }}
    </Loadable>
  );
}
