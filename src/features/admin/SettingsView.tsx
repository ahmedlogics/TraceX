import { useState } from "react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, ScopeNote } from "@/components/wt/forms";
import { KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels } from "@/domain/labels";
import { can } from "@/domain/permissions";
import type { CheckpointSetting, Settings } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

function CheckpointRow({ cp, editable }: { cp: CheckpointSetting; editable: boolean }) {
  const { run, pending } = useWtAction();
  const [label, setLabel] = useState(cp.label);
  const [enabled, setEnabled] = useState(cp.enabled);
  const dirty = label !== cp.label || enabled !== cp.enabled;
  return (
    <li className="grid gap-2 border-b py-3 last:border-0 sm:grid-cols-[4rem_1fr_auto_auto] sm:items-center">
      <span className="wt-id font-semibold">{cp.sensor}</span>
      <div>
        <label htmlFor={`cp-${cp.sensor}`} className="sr-only">{cp.sensor} label</label>
        <Input id={`cp-${cp.sensor}`} value={label} onChange={(e) => setLabel(e.target.value)} disabled={!editable} />
        <p className="mt-0.5 text-xs text-muted-foreground">{departmentLabels[cp.department]}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!editable} /> Enabled
      </label>
      {editable && (
        <Button size="sm" disabled={!dirty || pending} onClick={() => void run((c) => c.updateCheckpoint({ sensor: cp.sensor, label, enabled }), `${cp.sensor} saved.`)}>
          Save
        </Button>
      )}
    </li>
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
        void run((c) => c.updateBusinessSettings({ defaultCarrier: carrier, shipmentCutoff: cutoff, reinspectionRequiredAfterRework: reinspect, publicJourneyEnabled: pub }), "Business settings saved.");
      }}
    >
      <fieldset disabled={!editable} className="space-y-4">
        <Field label="Default carrier" htmlFor="bs-car"><Input id="bs-car" value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field>
        <Field label="Daily shipment cut-off" htmlFor="bs-cut"><Input id="bs-cut" type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><Switch checked={reinspect} onCheckedChange={setReinspect} disabled={!editable} /> Reinspection required after rework</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={pub} onCheckedChange={setPub} disabled={!editable} /> Public product journeys enabled</label>
      </fieldset>
      {editable && <Button type="submit" disabled={pending}>Save business settings</Button>}
    </form>
  );
}

export function SettingsView() {
  const me = useMe();
  const q = useWtQuery(["settings"], (c) => c.getSettings());
  const deviceEditable = can.editDeviceSettings(me);
  const businessEditable = can.editBusinessSettings(me);
  return (
    <>
      <PageHeader title="Settings" crumbs={[{ label: "Staff", href: paths.home }, { label: "Settings" }]} />
      <Loadable query={q}>
        {(s) => (
          <Tabs defaultValue={deviceEditable ? "device" : "business"}>
            <TabsList>
              <TabsTrigger value="device">Device & checkpoints</TabsTrigger>
              <TabsTrigger value="business">Business</TabsTrigger>
            </TabsList>
            <TabsContent value="device" className="mt-4 space-y-4">
              {!deviceEditable && <ScopeNote>Read-only. Device and checkpoint settings belong to the administrator.</ScopeNote>}
              <Section title="Board">
                <KeyValue items={[{ label: "Board", value: s.device.boardId }, { label: "Firmware", value: s.device.firmware }, { label: "Status (simulated)", value: <StatusBadge status={s.device.status} tone="success" /> }]} />
              </Section>
              <Section title="IR proximity checkpoints (proposed mapping)">
                <ul>
                  {s.checkpoints.map((cp) => <CheckpointRow key={`${cp.sensor}-${cp.label}-${cp.enabled}`} cp={cp} editable={deviceEditable} />)}
                </ul>
              </Section>
            </TabsContent>
            <TabsContent value="business" className="mt-4 space-y-4">
              {!businessEditable && <ScopeNote>Read-only. Business settings belong to the supply-chain manager.</ScopeNote>}
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
