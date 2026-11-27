import { useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, HelpCircle, Radio, Wrench } from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { fmt, KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels, rfidStationLabels } from "@/domain/labels";
import { can } from "@/domain/permissions";
import type { CheckpointSetting, ProductSpecification, Settings } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function RfidStationRow({ cp, editable }: { cp: CheckpointSetting; editable: boolean }) {
  const { run, pending } = useWtAction();
  const [label, setLabel] = useState(cp.label);
  const [enabled, setEnabled] = useState(cp.enabled);
  const dirty = label !== cp.label || enabled !== cp.enabled;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2.5 px-3">
        <span className="wt-id font-bold text-xs">{cp.sensor}</span>
        {cp.stationCode && (
          <p className="text-[11px] font-mono text-muted-foreground">{cp.stationCode}</p>
        )}
      </td>
      <td className="py-2.5 px-3">
        {editable ? (
          <Input
            id={`cp-${cp.sensor}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8 text-xs bg-card max-w-sm"
          />
        ) : (
          <span className="text-xs font-medium">{cp.stationName ?? cp.label}</span>
        )}
        <p className="text-[11px] text-muted-foreground">{departmentLabels[cp.department]}</p>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1.5">
          {cp.verified ? (
            <span className="inline-flex items-center gap-1 rounded bg-success-soft px-1.5 py-0.5 text-[11px] text-success font-medium">
              <CheckCircle2 className="size-3" /> Verified ({cp.measuredReaderIndex ?? "Index"})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Synthetic prototype (bench unverified)
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-center">
        <label className="inline-flex items-center gap-1 text-xs">
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!editable} />
        </label>
      </td>
      {editable && (
        <td className="py-2.5 px-3 text-right">
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() =>
              void run(
                (c) => c.updateCheckpoint({ sensor: cp.sensor, label, enabled }),
                `${cp.sensor} saved.`,
              )
            }
          >
            Save
          </Button>
        </td>
      )}
    </tr>
  );
}

function BusinessForm({ b, editable }: { b: Settings["business"]; editable: boolean }) {
  const { run, pending } = useWtAction();
  const [carrier, setCarrier] = useState(b.defaultCarrier);
  const [cutoff, setCutoff] = useState(b.shipmentCutoff);
  const [reinspect, setReinspect] = useState(b.reinspectionRequiredAfterRework);
  const [pub, setPub] = useState(b.publicJourneyEnabled);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          (c) =>
            c.updateBusinessSettings({
              defaultCarrier: carrier,
              shipmentCutoff: cutoff,
              reinspectionRequiredAfterRework: reinspect,
              publicJourneyEnabled: pub,
            }),
          "Business settings saved.",
        );
      }}
    >
      <fieldset disabled={!editable} className="space-y-4">
        <Field label="Default carrier" htmlFor="bs-car">
          <Input id="bs-car" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </Field>
        <Field label="Daily shipment cut-off" htmlFor="bs-cut">
          <Input
            id="bs-cut"
            type="time"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={reinspect} onCheckedChange={setReinspect} disabled={!editable} />{" "}
          Reinspection required after rework
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={pub} onCheckedChange={setPub} disabled={!editable} /> Public product
          journeys enabled
        </label>
      </fieldset>
      {editable && (
        <Button type="submit" disabled={pending}>
          Save business settings
        </Button>
      )}
    </form>
  );
}

function SpecFormDialog({
  spec,
  editable,
}: {
  spec?: ProductSpecification | undefined;
  editable: boolean;
}) {
  const { run } = useWtAction();
  const [name, setName] = useState(spec?.name ?? "");
  const [styleCode, setStyleCode] = useState(spec?.styleCode ?? "");
  const [category, setCategory] = useState<"shirt" | "trouser" | "jacket" | "other">(
    spec?.category ?? "shirt",
  );
  const [consumption, setConsumption] = useState(String(spec?.standardConsumptionMeters ?? 1.8));
  const [sizes, setSizes] = useState(spec?.sizeVariants.join(", ") ?? "S, M, L, XL");
  const [desc, setDesc] = useState(spec?.description ?? "");

  if (!editable) return null;

  return (
    <FormDialog
      trigger={spec ? "Edit spec" : "Add product specification"}
      triggerVariant={spec ? "outline" : "default"}
      title={spec ? `Edit ${spec.styleCode}` : "Add Product Specification"}
      description="Standardize garment model name, style code, and consumption per shirt/trouser."
      submitLabel="Save specification"
      onSubmit={async () => {
        if (!name.trim() || !styleCode.trim()) return false;
        const sizeVariants = sizes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const res = await run(
          (c) =>
            c.saveProductSpec({
              id: spec?.id ?? "",
              name: name.trim(),
              styleCode: styleCode.trim(),
              category,
              standardConsumptionMeters: Number(consumption) || 1.8,
              sizeVariants: sizeVariants.length > 0 ? sizeVariants : ["M"],
              active: true,
              description: desc.trim() || undefined,
            }),
          `Specification ${styleCode} saved.`,
        );
        return !!res;
      }}
    >
      <Field label="Model / product name" htmlFor="sp-name">
        <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Linen camp-collar shirt" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Style code" htmlFor="sp-code">
          <Input id="sp-code" value={styleCode} onChange={(e) => setStyleCode(e.target.value)} placeholder="e.g. WT-SH-320" />
        </Field>
        <Field label="Category" htmlFor="sp-cat">
          <NativeSelect
            id="sp-cat"
            value={category}
            onChange={(v) => setCategory(v as any)}
            options={[
              { value: "shirt", label: "Shirt" },
              { value: "trouser", label: "Trouser" },
              { value: "jacket", label: "Jacket" },
              { value: "other", label: "Other" },
            ]}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Standard consumption (m)" htmlFor="sp-cons">
          <Input
            id="sp-cons"
            type="number"
            step="0.05"
            min="0.1"
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
          />
        </Field>
        <Field label="Size variants (comma-separated)" htmlFor="sp-sizes">
          <Input id="sp-sizes" value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" />
        </Field>
      </div>
      <Field label="Description / notes" htmlFor="sp-desc">
        <Input id="sp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional style notes" />
      </Field>
    </FormDialog>
  );
}

function ProductSpecsSection({ editable }: { editable: boolean }) {
  const qSpecs = useWtQuery(["product-specs"], (c) => c.listProductSpecs());

  return (
    <Section
      title="Approved Product Specifications"
      description="Standard digital specifications for factory styles. Orders reference these specifications to set product names and standard material consumption."
      actions={<SpecFormDialog editable={editable} />}
    >
      <Loadable query={qSpecs}>
        {(specs) => (
          <div className="space-y-4">
            <DataTable
              rows={specs}
              rowKey={(sp) => sp.id}
              empty="No product specifications configured yet."
              columns={[
                {
                  header: "Style Code",
                  cell: (sp) => (
                    <div>
                      <span className="wt-id font-mono font-bold text-xs">{sp.styleCode}</span>
                      <p className="text-[11px] text-muted-foreground">{sp.id} · v{sp.version}</p>
                    </div>
                  ),
                },
                {
                  header: "Product Model Name",
                  cell: (sp) => (
                    <div>
                      <p className="font-semibold text-foreground text-xs sm:text-sm">{sp.name}</p>
                      {sp.description && <p className="text-[11px] text-muted-foreground">{sp.description}</p>}
                    </div>
                  ),
                },
                {
                  header: "Category",
                  cell: (sp) => (
                    <span className="capitalize text-xs font-medium bg-muted px-2 py-0.5 rounded">
                      {sp.category}
                    </span>
                  ),
                },
                {
                  header: "Standard Consumption",
                  cell: (sp) => (
                    <span className="tabular-nums font-semibold text-xs">
                      {sp.standardConsumptionMeters} m / garment
                    </span>
                  ),
                },
                {
                  header: "Sizes",
                  cell: (sp) => (
                    <span className="text-xs font-mono text-muted-foreground">
                      {sp.sizeVariants.join(", ")}
                    </span>
                  ),
                },
                {
                  header: "Status",
                  cell: (sp) => (
                    <StatusBadge
                      status={sp.active ? "Active" : "Archived"}
                      tone={sp.active ? "success" : "neutral"}
                    />
                  ),
                },
                {
                  header: "Actions",
                  cell: (sp) => <SpecFormDialog spec={sp} editable={editable} />,
                },
              ]}
            />
          </div>
        )}
      </Loadable>
    </Section>
  );
}

export function SettingsView() {
  const me = useMe();
  const q = useWtQuery(["settings"], (c) => c.getSettings());
  const deviceEditable = can.editDeviceSettings(me);
  const businessEditable = can.editBusinessSettings(me);
  const productionEditable = me.role === "A" || me.role === "M" || me.role === "P";

  return (
    <>
      <PageHeader title="Settings & Hardware Configuration" />
      <Loadable query={q}>
        {(s) => (
          <Tabs defaultValue={deviceEditable ? "rfid" : "production"}>
            <TabsList className="mb-4">
              <TabsTrigger value="rfid">Nine-Reader RFID Topology</TabsTrigger>
              <TabsTrigger value="production">Product Specifications</TabsTrigger>
              <TabsTrigger value="device">Bridge & Hardware Health</TabsTrigger>
              <TabsTrigger value="business">Business Rules</TabsTrigger>
            </TabsList>

            <TabsContent value="production" className="space-y-4">
              {!productionEditable && (
                <ScopeNote>
                  Read-only. Product specifications configuration belongs to production management and engineering.
                </ScopeNote>
              )}
              <ProductSpecsSection editable={productionEditable} />
            </TabsContent>

            <TabsContent value="rfid" className="space-y-4">
              {!deviceEditable && (
                <ScopeNote>
                  Read-only. RFID station and mapping configuration belongs to technical
                  administrators.
                </ScopeNote>
              )}

              <Section
                title="Logical RFID Stations (Nine-Reader Layout)"
                description="RFID reader stations and checkpoint mappings."
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                        <th className="py-2 px-3">Checkpoint</th>
                        <th className="py-2 px-3">Station Name / Department</th>
                        <th className="py-2 px-3">Hardware Index Status</th>
                        <th className="py-2 px-3 text-center">Active</th>
                        {deviceEditable && <th className="py-2 px-3 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {s.checkpoints.map((cp) => (
                        <RfidStationRow
                          key={`${cp.sensor}-${cp.label}-${cp.enabled}`}
                          cp={cp}
                          editable={deviceEditable}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <HelpCircle className="size-3.5" /> Bench Hardware vs Logical Topology:
                  </p>
                  <p>
                    Station positions 1 through 9 represent workflow ordering. Firmware reader
                    indices are verified on physical hardware calibration. Unverified stations use
                    synthetic prototype mappings for development and simulation.
                  </p>
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="device" className="space-y-4">
              {!deviceEditable && (
                <ScopeNote>
                  Read-only. Device and hardware settings belong to the administrator.
                </ScopeNote>
              )}
              <Section title="USB Serial Bridge & Reader Host">
                <KeyValue
                  items={[
                    { label: "Board ID", value: s.device.boardId },
                    { label: "Firmware version", value: s.device.firmware },
                    {
                      label: "Topology mapping version",
                      value: `v${s.device.mappingVersion ?? 1}`,
                    },
                    {
                      label: "Bridge session ID",
                      value: s.device.bridgeSessionId ? (
                        <span className="wt-id">{s.device.bridgeSessionId}</span>
                      ) : (
                        "None (mock disconnected)"
                      ),
                    },
                    {
                      label: "Physical Bridge Status",
                      value: (
                        <StatusBadge
                          status={
                            s.device.status === "disconnected"
                              ? "Disconnected (Simulated)"
                              : s.device.status
                          }
                          tone={s.device.status === "disconnected" ? "neutral" : "success"}
                        />
                      ),
                    },
                  ]}
                />
              </Section>

              <div className="rounded-lg border border-primary/20 bg-muted/20 p-4 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Cpu className="size-4 text-primary" /> Future USB Hardware Bridge Integration
                  Seam:
                </p>
                <p>
                  The Express backend owns the physical USB serial connection (`/dev/ttyUSB0` or
                  `COM3`), authenticates the hardware credentials, and broadcasts real-time tag tap
                  events via Server-Sent Events (SSE). The React client interfaces through the typed
                  `WearTrailClient` boundary.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="business" className="space-y-4">
              {!businessEditable && (
                <ScopeNote>
                  Read-only. Business settings belong to the supply-chain manager.
                </ScopeNote>
              )}
              <Section title="Business rules">
                <BusinessForm b={s.business} editable={businessEditable} />
              </Section>
            </TabsContent>
          </Tabs>
        )}
      </Loadable>
    </>
  );
}
