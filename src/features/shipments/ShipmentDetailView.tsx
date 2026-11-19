import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, ScopeNote } from "@/components/wt/forms";
import { fmt, IdLink, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { can } from "@/domain/permissions";
import type { ShipmentDetail } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { useMe } from "@/features/shared/useMe";

function PlanDialog({ d }: { d: ShipmentDetail }) {
  const { run } = useWtAction();
  const [selected, setSelected] = useState<string[]>(d.shipment.garmentIds);
  const [markPlanned, setMark] = useState(d.shipment.status === "draft");

  return (
    <FormDialog
      trigger="Edit Manifest Plan"
      triggerVariant="outline"
      title={`Plan ${d.shipment.id}`}
      description="Manager planning only. Add or remove garments from the outbound manifest."
      submitLabel="Save Manifest"
      onSubmit={async () =>
        (await run(
          (c) =>
            c
              .updateShipmentPlan({ shipmentId: d.shipment.id, garmentIds: selected, markPlanned })
              .then(() => true),
          "Shipment plan saved.",
        )) ?? false
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Select Garments to Include on Manifest
        </legend>
        {d.candidates.map((g) => (
          <label
            key={g.id}
            className="flex items-center gap-2.5 text-xs p-1.5 rounded hover:bg-muted/40 cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(g.id)}
              onCheckedChange={(v) =>
                setSelected((s) => (v === true ? [...s, g.id] : s.filter((x) => x !== g.id)))
              }
            />
            <span className="wt-id font-mono font-medium">{g.id}</span>
            <span className="text-muted-foreground truncate max-w-[140px]">{g.productName}</span>
            <StatusBadge status={g.stage} />
            {g.hold && <HoldBadge />}
          </label>
        ))}
      </fieldset>
      {d.shipment.status === "draft" && (
        <label className="flex items-center gap-2 text-xs pt-2 border-t font-medium">
          <Checkbox checked={markPlanned} onCheckedChange={(v) => setMark(v === true)} />
          Mark shipment as planned (locks manifest for dispatch)
        </label>
      )}
    </FormDialog>
  );
}

export function ShipmentDetailView({ shipmentId }: { shipmentId: string }) {
  const me = useMe();
  const q = useWtQuery(["shipment", shipmentId], (c) => c.getShipment(shipmentId));
  const { run, pending } = useWtAction();
  const [scanUid, setScanUid] = useState("");

  return (
    <Loadable query={q} what="shipment" backHref={paths.shipments}>
      {(d) => {
        const sh = d.shipment;
        const verifiedIds = sh.verifiedGarmentIds ?? [];
        const eligible = d.eligibility.every((c) => c.ok);
        const hasHoldOnManifest = d.garments.some((g) => !!g.hold);

        return (
          <>
            <PageHeader
              title={<span className="wt-id text-2xl">{sh.id}</span>}
              description={`Destination: ${sh.destination} · Carrier: ${sh.carrier}`}
              crumbs={[
                { label: "Staff", href: paths.home },
                { label: "Shipments", href: paths.shipments },
                { label: sh.id },
              ]}
              meta={<StatusBadge status={sh.status} />}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {can.planShipment(me) && sh.status !== "departed" && (
                    <PlanDialog key={`${sh.status}-${sh.garmentIds.join()}`} d={d} />
                  )}
                  {can.confirmDeparture(me) && sh.status !== "departed" && (
                    <Button
                      size="sm"
                      disabled={pending || !eligible}
                      className={
                        eligible ? "bg-success text-success-foreground hover:bg-success/90" : ""
                      }
                      onClick={() =>
                        void run((c) => c.confirmDeparture(sh.id), `${sh.id} confirmed departed.`)
                      }
                    >
                      <Truck className="size-4 mr-1.5" /> Confirm Actual Departure
                    </Button>
                  )}
                </div>
              }
            />

            {/* Hold Warning Alert */}
            {hasHoldOnManifest && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      Departure Hard-Blocked: Quality Hold on Manifest
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      One or more garments on this manifest have an active quality hold. Factory
                      policy mandates that any hold added — even after earlier verification or
                      shipment planning — strictly halts outbound departure.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Shipment Metadata */}
              <Section title="Shipment Specifications">
                <KeyValue
                  items={[
                    { label: "Carrier", value: sh.carrier },
                    { label: "Planned Date", value: fmt.date(sh.plannedDate) },
                    { label: "Planned By", value: <UserName id={sh.plannedBy} /> },
                    {
                      label: "Departure Time",
                      value: sh.departedAt ? (
                        <>
                          {fmt.dateTime(sh.departedAt)} · <UserName id={sh.departedBy} />
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Awaiting dispatch gate</span>
                      ),
                    },
                    {
                      label: "Dispatch Task",
                      value: d.dispatchTask ? (
                        <span className="wt-id font-mono text-xs">
                          {d.dispatchTask.id} (
                          {d.dispatchTask.observation ? "Observed" : "Awaiting Station 9 scan"})
                        </span>
                      ) : (
                        "—"
                      ),
                    },
                  ]}
                />
              </Section>

              {/* Authoritative Gate */}
              <Section
                title="Authoritative Departure Gate"
                className="lg:col-span-2"
                description="All operational and quality preconditions must be satisfied before actual departure."
              >
                {sh.status === "departed" ? (
                  <div className="rounded-lg border border-success/40 bg-success/10 p-4 flex items-center gap-3">
                    <CheckCircle2 className="size-5 text-success shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-success-foreground">
                        Shipment Departed
                      </p>
                      <p className="text-xs text-muted-foreground">
                        All manifest verification checks passed and cryptographic ledger commitments
                        were queued.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ul className="space-y-2 rounded-lg border bg-card p-3">
                      {d.eligibility.map((c) => (
                        <li key={c.label} className="flex items-start gap-2.5 text-xs">
                          {c.ok ? (
                            <CheckCircle2
                              className="size-4 shrink-0 text-success mt-0.5"
                              aria-label="Passed"
                            />
                          ) : (
                            <XCircle
                              className="size-4 shrink-0 text-destructive mt-0.5"
                              aria-label="Failed"
                            />
                          )}
                          <div className="flex flex-col">
                            <span
                              className={c.ok ? "font-medium" : "font-semibold text-destructive"}
                            >
                              {c.label}
                            </span>
                            {c.detail && (
                              <span className="text-[11px] text-muted-foreground">{c.detail}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {!can.confirmDeparture(me) && (
                      <ScopeNote>
                        {me.department === "packing"
                          ? "Packing staff cannot dispatch shipments."
                          : "Only authorized dispatch staff (Role L, Dispatch dept) can confirm departure."}
                      </ScopeNote>
                    )}
                  </div>
                )}
              </Section>

              {/* Manifest Table */}
              <Section title="Shipment Manifest" className="lg:col-span-3">
                <DataTable
                  rows={d.garments}
                  rowKey={(g) => g.id}
                  empty="No garments on this manifest. Add garments using 'Edit Manifest Plan' above."
                  columns={[
                    {
                      header: "Garment",
                      cell: (g) => <IdLink href={paths.garment(g.id)} id={g.id} />,
                    },
                    { header: "Product", cell: (g) => g.productName },
                    {
                      header: "RFID Card",
                      cell: (g) =>
                        g.rfidUid ? (
                          <span className="font-mono text-xs text-success">{g.rfidUid}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        ),
                    },
                    { header: "Physical Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                    {
                      header: "Quality Status",
                      cell: (g) => (
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={g.disposition} />
                          {g.hold && <HoldBadge />}
                        </div>
                      ),
                    },
                    {
                      header: "Package Carton",
                      cell: (g) => (
                        <span className="wt-id font-mono text-xs">{g.packageId ?? "—"}</span>
                      ),
                    },
                    {
                      header: "Allocated",
                      cell: (g) => {
                        const isAlloc = sh.allocatedGarmentIds.includes(g.id);
                        return (
                          <span
                            className={`text-xs font-medium ${isAlloc ? "text-success" : "text-warning"}`}
                          >
                            {isAlloc ? "Allocated" : "Pending Allocation"}
                          </span>
                        );
                      },
                    },
                    {
                      header: "Dispatch Verification",
                      cell: (g) => {
                        const isVer = verifiedIds.includes(g.id);
                        return isVer ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                            <CheckCircle2 className="size-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground italic">
                            Awaiting Dispatch Scan
                          </span>
                        );
                      },
                    },
                    {
                      header: "Dispatch Action",
                      cell: (g) => {
                        const isVer = verifiedIds.includes(g.id);
                        if (sh.status === "departed") return null;
                        if (!can.confirmDeparture(me)) return null;

                        return !isVer ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={pending || !sh.allocatedGarmentIds.includes(g.id) || !!g.hold}
                            onClick={() =>
                              void run(
                                (c) => c.verifyGarmentDispatch(sh.id, g.id),
                                `${g.id} verified at dispatch reader.`,
                              )
                            }
                          >
                            <ScanLine className="size-3.5 mr-1" /> Verify at Dispatch (S9)
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Ready</span>
                        );
                      },
                    },
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
