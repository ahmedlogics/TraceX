import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Package as PkgIcon,
  Radio,
  ScanLine,
  Truck,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, NativeSelect, ScopeNote } from "@/components/wt/forms";
import { IdLink, KeyValue, Section } from "@/components/wt/layout";
import { HoldBadge, StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import type { RfidStationData } from "@/lib/data/client";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { paths } from "@/app/paths";
import { useMe } from "@/features/shared/useMe";

const defaultBins = ["BIN-A1", "BIN-A2", "BIN-B1", "BIN-B2", "BIN-BULK-1"];

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

  const activeCtx = stationData.activeContext;
  const isCtxForThisStation = activeCtx && activeCtx.stationCode === stationCode;

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
                <div className="grid gap-6 lg:grid-cols-2">
                  <Section
                    title={
                      stationCode === "packing"
                        ? "Package Destination"
                        : stationCode === "warehouse"
                          ? "Warehouse Location Bin"
                          : "Shipment Manifest"
                    }
                    description={
                      stationCode === "packing"
                        ? "Select an open destination package before scanning garments into it."
                        : stationCode === "warehouse"
                          ? "Select the destination storage bin before scanning finished goods."
                          : "Select the approved shipment before scanning manifest garments."
                    }
                  >
                    <div className="space-y-4">
                      {stationCode === "packing" && (
                        <>
                          {openPackages.length === 0 ? (
                            <EmptyState title="No open packages available" />
                          ) : (
                            <Field label="Destination Package" htmlFor="log-pkg">
                              <NativeSelect
                                id="log-pkg"
                                value={packageId}
                                onChange={(v) => setSelectedPackageId(v)}
                                options={openPackages.map((p) => ({
                                  value: p.id,
                                  label: `${p.id} (${p.garmentIds.length} garments · ${p.status})`,
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
                                    value: <span className="wt-id">{currentPkg.id}</span>,
                                  },
                                  {
                                    label: "Status",
                                    value: <StatusBadge status={currentPkg.status} />,
                                  },
                                  {
                                    label: "Current Garment Count",
                                    value: currentPkg.garmentIds.length,
                                  },
                                ]}
                              />
                            </div>
                          )}
                        </>
                      )}

                      {stationCode === "warehouse" && (
                        <Field label="Warehouse Bin Location" htmlFor="log-bin">
                          <NativeSelect
                            id="log-bin"
                            value={selectedBinId}
                            onChange={(v) => setSelectedBinId(v)}
                            options={defaultBins.map((b) => ({ value: b, label: b }))}
                          />
                        </Field>
                      )}

                      {stationCode === "dispatch" && (
                        <>
                          {activeShipments.length === 0 ? (
                            <EmptyState title="No planned shipments awaiting dispatch" />
                          ) : (
                            <Field label="Target Shipment" htmlFor="log-shp">
                              <NativeSelect
                                id="log-shp"
                                value={shipmentId}
                                onChange={(v) => setSelectedShipmentId(v)}
                                options={activeShipments.map((s) => ({
                                  value: s.id,
                                  label: `${s.id} &rarr; ${s.destination} (${s.garmentIds.length} planned · ${s.status})`,
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
                                    label: "Allocated Garments",
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
                          Only {stationCode} staff or managers can prepare and confirm {stationCode}{" "}
                          operations.
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
                            <Radio className="size-4" /> Prepare: Scan Garment
                          </Button>
                        </div>
                      )}
                    </div>
                  </Section>

                  <Section
                    title="Reader Action & Scan Lifecycle"
                    description={`Present garment RFID card at Station ${stationData.stationName}.`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Lifecycle state:</span>
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
                        <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 space-y-3">
                          <p className="text-sm font-medium text-warning-foreground">
                            Context <span className="wt-id">{activeCtx.id}</span> created. Awaiting
                            reader board acknowledgement.
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
                              Cancel context
                            </Button>
                          </div>
                        </div>
                      )}

                      {isCtxForThisStation && activeCtx.status === "ready" && (
                        <div className="rounded-lg border border-success/40 bg-success-soft p-4 space-y-3">
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
                                    (c) => c.resolveRfidScan(scanUid.trim()),
                                    (outcome) =>
                                      outcome.resolution === "accepted"
                                        ? `Garment ${outcome.garmentCode ?? outcome.subjectId} (${outcome.productName}) confirmed at ${stationData.stationName}!`
                                        : `Scan rejected: ${outcome.rejectReason ?? outcome.resolution}`,
                                  )
                                }
                              >
                                <ScanLine className="size-4" /> Simulate RFID Scan
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
                        <p className="text-sm text-muted-foreground">
                          No pending action context. Click &ldquo;Prepare: Scan Garment&rdquo;
                          above.
                        </p>
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
                      { header: "Stage", cell: (g) => <StatusBadge status={g.stage} /> },
                      {
                        header: "Quality",
                        cell: (g) => (
                          <div className="flex items-center gap-1">
                            <StatusBadge status={g.disposition} />
                            {g.hold && <HoldBadge />}
                          </div>
                        ),
                      },
                      { header: "Package", cell: (g) => g.packageId ?? "—" },
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
