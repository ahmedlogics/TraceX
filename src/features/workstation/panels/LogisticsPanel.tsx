import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Package as PkgIcon,
  Radio,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { IdLink, KeyValue, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

const defaultBins = [
  { id: "BIN-A1", label: "Bin A1 — Standard Hang" },
  { id: "BIN-A2", label: "Bin A2 — Standard Fold" },
  { id: "BIN-B1", label: "Bin B1 — Trousers" },
  { id: "BIN-B2", label: "Bin B2 — Outerwear" },
  { id: "BIN-BULK-1", label: "Bulk Staging Bin 1" },
];

export function LogisticsPanel({ stationData }: { stationData: RfidStationData }) {
  const me = useMe();
  const { run, pending } = useWtAction();
  const stationCode = stationData.stationCode as "packing" | "warehouse" | "dispatch";

  const qFulfilment = useWtQuery(["fulfilment"], (c) => c.getFulfilment());
  const qShipments = useWtQuery(["shipments"], (c) => c.listShipments());

  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedBinId, setSelectedBinId] = useState("BIN-A1");
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [scanUid, setScanUid] = useState("04A7B8C9"); // default demo card UID
  const [localLastOutcome, setLocalLastOutcome] = useState<ScanOutcome | undefined>(undefined);

  const activeCtx = stationData.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === stationCode;
  const lastOutcome = localLastOutcome ?? stationData.lastScanOutcome;

  // Department authorization checks
  const isAuthorized =
    me.role === "M" ||
    (stationCode === "packing" && me.department === "packing") ||
    (stationCode === "warehouse" && me.department === "warehouse") ||
    (stationCode === "dispatch" && me.department === "dispatch");

  return (
    <Loadable query={qFulfilment}>
      {(fulfilment) => (
        <Loadable query={qShipments}>
          {(shipments) => {
            const openPackages = fulfilment.packages.filter((p) => p.status === "open");
            const packageId = selectedPackageId || openPackages[0]?.id || "";
            const currentPkg = fulfilment.packages.find((p) => p.id === packageId);

            const activeShipments = shipments.filter(
              (s) => s.status === "planned" || s.status === "draft",
            );
            const shipmentId = selectedShipmentId || activeShipments[0]?.id || "";
            const currentShipment = shipments.find((s) => s.id === shipmentId);

            return (
              <div className="space-y-6">
                {/* Persistent Feedback Banner */}
                {lastOutcome && (
                  <div
                    className={`rounded-lg border p-4 shadow-sm transition-all ${
                      lastOutcome.resolution === "accepted"
                        ? "border-success/40 bg-success/10 text-success-foreground"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {lastOutcome.resolution === "accepted" ? (
                        <ShieldCheck className="size-5 text-success shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">
                          {lastOutcome.resolution === "accepted"
                            ? `Logistics Operation Confirmed: ${lastOutcome.garmentCode ?? lastOutcome.subjectId}`
                            : "Logistics Scan Rejected"}
                        </p>
                        <p className="text-xs opacity-90">
                          {lastOutcome.resolution === "accepted"
                            ? `Garment: ${lastOutcome.productName ?? "Garment"}. Operation recorded and confirmed at Station ${stationData.stationName}.`
                            : (lastOutcome.rejectReason ??
                              `Station rule failed: ${lastOutcome.resolution}`)}
                        </p>
                        <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-muted-foreground">
                          <span>Card UID: {lastOutcome.uid}</span>
                          <span>·</span>
                          <span>Station: {stationData.stationName}</span>
                          <span>·</span>
                          <span>Time: {new Date(lastOutcome.at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                  <Section
                    title={
                      stationCode === "packing"
                        ? "1. Packaging Destination"
                        : stationCode === "warehouse"
                          ? "1. Warehouse Location Bin"
                          : "1. Outbound Shipment Manifest"
                    }
                    description={
                      stationCode === "packing"
                        ? "Select an open destination carton before scanning garments into it."
                        : stationCode === "warehouse"
                          ? "Select the destination storage bin before scanning finished goods."
                          : "Select the target shipment before scanning manifest garments."
                    }
                  >
                    <div className="space-y-4">
                      {stationCode === "packing" && (
                        <>
                          {openPackages.length === 0 ? (
                            <EmptyState title="No open packages available">
                              <p className="text-xs">
                                Create a new package from the Fulfilment page first.
                              </p>
                            </EmptyState>
                          ) : (
                            <Field label="Destination Carton" htmlFor="log-pkg">
                              <NativeSelect
                                id="log-pkg"
                                value={packageId}
                                onChange={(v) => setSelectedPackageId(v)}
                                options={openPackages.map((p) => ({
                                  value: p.id,
                                  label: `${p.id} (${p.garmentIds.length} items · ${p.status})`,
                                }))}
                              />
                            </Field>
                          )}
                          {currentPkg && (
                            <div className="rounded-md border bg-muted/30 p-3">
                              <KeyValue
                                items={[
                                  {
                                    label: "Package ID",
                                    value: <span className="wt-id font-mono">{currentPkg.id}</span>,
                                  },
                                  {
                                    label: "Status",
                                    value: <StatusBadge status={currentPkg.status} />,
                                  },
                                  {
                                    label: "Current Items",
                                    value: `${currentPkg.garmentIds.length} garments packed`,
                                  },
                                ]}
                              />
                            </div>
                          )}
                        </>
                      )}

                      {stationCode === "warehouse" && (
                        <Field label="Target Storage Bin" htmlFor="log-bin">
                          <NativeSelect
                            id="log-bin"
                            value={selectedBinId}
                            onChange={(v) => setSelectedBinId(v)}
                            options={defaultBins.map((b) => ({
                              value: b.id,
                              label: `${b.id} — ${b.label}`,
                            }))}
                          />
                        </Field>
                      )}

                      {stationCode === "dispatch" && (
                        <>
                          {activeShipments.length === 0 ? (
                            <EmptyState title="No active shipments awaiting dispatch" />
                          ) : (
                            <Field label="Target Shipment Manifest" htmlFor="log-shp">
                              <NativeSelect
                                id="log-shp"
                                value={shipmentId}
                                onChange={(v) => setSelectedShipmentId(v)}
                                options={activeShipments.map((s) => ({
                                  value: s.id,
                                  label: `${s.id} → ${s.destination} (${s.garmentIds.length} planned · ${s.status})`,
                                }))}
                              />
                            </Field>
                          )}
                          {currentShipment && (
                            <div className="rounded-md border bg-muted/30 p-3">
                              <KeyValue
                                items={[
                                  { label: "Destination", value: currentShipment.destination },
                                  { label: "Carrier", value: currentShipment.carrier },
                                  { label: "Planned Date", value: currentShipment.plannedDate },
                                  {
                                    label: "Allocated",
                                    value: `${currentShipment.allocatedGarmentIds.length} / ${currentShipment.garmentIds.length}`,
                                  },
                                ]}
                              />
                            </div>
                          )}
                        </>
                      )}

                      {!isAuthorized && (
                        <ScopeNote>
                          Only {stationCode} department staff or managers can prepare and confirm{" "}
                          {stationCode} operations.
                        </ScopeNote>
                      )}

                      {isAuthorized && (
                        <div className="pt-2">
                          <Button
                            disabled={
                              pending ||
                              (stationCode === "packing" && !packageId) ||
                              (stationCode === "dispatch" && !shipmentId) ||
                              (isCtxForThisStation && activeCtx.status !== "expired")
                            }
                            onClick={() => {
                              if (stationCode === "packing") {
                                void run(
                                  (c) =>
                                    c.prepareActionContext("packing", "pack_garment", {
                                      kind: "pack_garment",
                                      packageId,
                                    }),
                                  `Prepared packing action for package ${packageId}.`,
                                );
                              } else if (stationCode === "warehouse") {
                                void run(
                                  (c) =>
                                    c.prepareActionContext("warehouse", "warehouse_receive", {
                                      kind: "warehouse_receive",
                                      binId: selectedBinId,
                                    }),
                                  `Prepared warehouse receiving action for bin ${selectedBinId}.`,
                                );
                              } else {
                                void run(
                                  (c) =>
                                    c.prepareActionContext("dispatch", "dispatch_garment", {
                                      kind: "dispatch_garment",
                                      shipmentId,
                                    }),
                                  `Prepared dispatch scan action for shipment ${shipmentId}.`,
                                );
                              }
                            }}
                          >
                            <Radio className="size-4 mr-1.5" /> Prepare Action: Scan Garment
                          </Button>
                        </div>
                      )}
                    </div>
                  </Section>

                  <Section
                    title="2. Reader Action & Scan Lifecycle"
                    description={`Present garment RFID card at Station ${stationData.stationName}.`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Lifecycle State:</span>
                        {isCtxForThisStation ? (
                          <StatusBadge
                            status={activeCtx.status}
                            tone={
                              activeCtx.status === "ready"
                                ? "success"
                                : activeCtx.status === "awaiting_ack"
                                  ? "warning"
                                  : activeCtx.status === "confirmed"
                                    ? "success"
                                    : "neutral"
                            }
                          />
                        ) : (
                          <StatusBadge status="idle" tone="neutral" />
                        )}
                      </div>

                      {isCtxForThisStation && activeCtx.status === "awaiting_ack" && (
                        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 space-y-3">
                          <p className="text-sm font-medium text-warning-foreground">
                            Context <span className="wt-id font-mono text-xs">{activeCtx.id}</span>{" "}
                            created. Awaiting reader board acknowledgement.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                void run(
                                  (c) => c.acknowledgeContext(activeCtx.id),
                                  "Reader board acknowledged context.",
                                )
                              }
                            >
                              Simulate Board Acknowledgment
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                void run((c) => c.cancelContext(activeCtx.id), "Context cancelled.")
                              }
                            >
                              Cancel Context
                            </Button>
                          </div>
                        </div>
                      )}

                      {isCtxForThisStation && activeCtx.status === "ready" && (
                        <div className="rounded-lg border border-success/40 bg-success/10 p-4 space-y-3">
                          <p className="text-sm font-medium text-success-foreground">
                            Ready to scan! Present garment RFID card at Station{" "}
                            {stationData.stationName}.
                          </p>
                          <div className="space-y-2">
                            <Field label="Garment Card UID" htmlFor="log-uid">
                              <Input
                                id="log-uid"
                                value={scanUid}
                                onChange={(e) => setScanUid(e.target.value.toUpperCase())}
                                className="font-mono bg-card"
                                placeholder="e.g. 04A7B8C9"
                              />
                            </Field>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button
                                disabled={pending || !scanUid.trim()}
                                onClick={() =>
                                  void run(
                                    async (c) => {
                                      const outcome = await c.resolveRfidScan(scanUid.trim());
                                      setLocalLastOutcome(outcome);
                                      return outcome;
                                    },
                                    (outcome) =>
                                      outcome.resolution === "accepted"
                                        ? `Garment ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName}) confirmed at ${stationData.stationName}!`
                                        : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                  )
                                }
                              >
                                <ScanLine className="size-4 mr-1.5" /> Simulate RFID Scan
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pending}
                                onClick={() =>
                                  void run(
                                    (c) => c.cancelContext(activeCtx.id),
                                    "Context cancelled.",
                                  )
                                }
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!isCtxForThisStation && (
                        <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                          No pending action context armed. Click &ldquo;Prepare Action: Scan
                          Garment&rdquo; above.
                        </div>
                      )}
                    </div>
                  </Section>
                </div>

                {/* Queue / Stage overview */}
                <Section
                  title={
                    stationCode === "packing"
                      ? "Garments Awaiting Packing"
                      : stationCode === "warehouse"
                        ? "Packed Garments Awaiting Warehouse Receipt"
                        : "Shipment Manifest Items"
                  }
                >
                  <DataTable
                    rows={
                      stationCode === "packing"
                        ? fulfilment.awaitingPacking
                        : stationCode === "warehouse"
                          ? fulfilment.packedAwaitingReceipt
                          : fulfilment.inStock
                    }
                    rowKey={(g) => g.id}
                    empty="No garments in this queue."
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
                      { header: "Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                      {
                        header: "Quality",
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
                    ]}
                  />
                </Section>
              </div>
            );
          }}
        </Loadable>
      )}
    </Loadable>
  );
}
