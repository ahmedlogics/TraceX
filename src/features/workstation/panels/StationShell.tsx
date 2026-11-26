import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Radio,
  ScanLine,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt, PageHeader } from "@/components/wt/layout";
import { Loadable } from "@/components/wt/states";
import { rfidStationCodes, rfidStationLabels, stationDepartment } from "@/domain/labels";
import type { RfidStationCode, ScanOutcome, StaffUser } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { can } from "@/domain/permissions";
import { useMe } from "@/features/shared/useMe";
import { ReceivingPanel } from "./ReceivingPanel";
import { IssuePanel } from "./IssuePanel";
import { CuttingPanel } from "./CuttingPanel";
import { StitchingPanel } from "./StitchingPanel";
import { FinishingPanel } from "./FinishingPanel";
import { QAPanel } from "./QAPanel";
import { LogisticsPanel } from "./LogisticsPanel";
import { DispatchPanel } from "./DispatchPanel";
import { WarehousePanel } from "./WarehousePanel";
import { PackingPanel } from "./PackingPanel";

function defaultStationForUser(user: StaffUser): RfidStationCode {
  if (user.username === "receiving.demo") return "fabric_receiving";
  if (user.username === "rawstore.demo") return "fabric_issue";
  if (user.username === "dispatch.demo") return "dispatch";
  if (user.username === "packing.demo") return "packing";

  switch (user.department) {
    case "receiving":
      return "fabric_receiving";
    case "raw-store":
      return "fabric_issue";
    case "cutting":
      return "cutting";
    case "stitching":
      return "stitching";
    case "finishing":
      return "finishing";
    case "quality":
      return "final_qc";
    case "packing":
      return "packing";
    case "warehouse":
      return "warehouse";
    case "dispatch":
      return "dispatch";
    default:
      return "fabric_receiving";
  }
}

export function StationShell() {
  const me = useMe();
  const availableStations = rfidStationCodes.filter((code) => can.operateStation(me, code));
  const activeStations =
    availableStations.length > 0 ? availableStations : [defaultStationForUser(me)];

  const [stationCode, setStationCode] = useState<RfidStationCode>(() => {
    const def = defaultStationForUser(me);
    return activeStations.includes(def) ? def : activeStations[0]!;
  });

  const effectiveStation = activeStations.includes(stationCode) ? stationCode : activeStations[0]!;

  const qStation = useWtQuery(["rfid-station", effectiveStation], (c) =>
    c.getRfidStationData(effectiveStation),
    { refetchInterval: 3000 },
  );

  return (
    <div className="space-y-6">
      {activeStations.length > 1 && effectiveStation !== "fabric_issue" && (
        <PageHeader
          title="Workstation"
          actions={
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Station:
              </span>
              <select
                value={effectiveStation}
                onChange={(e) => setStationCode(e.target.value as RfidStationCode)}
                className="h-8 rounded-lg border border-[#CDBBA8] bg-[#FFFDFC] px-3 text-xs font-semibold text-[#2B170E] shadow-2xs focus:outline-none focus:border-[#C79C70] focus:ring-1 focus:ring-[#D8B68F]"
              >
                {activeStations.map((code) => (
                  <option key={code} value={code}>
                    {rfidStationLabels[code]} ({code})
                  </option>
                ))}
              </select>
            </div>
          }
        />
      )}

      <Loadable query={qStation}>
        {(stData) => {
          const lastOutcome = stData.lastScanOutcome;

          return (
            <div className="space-y-6">
              {/* Station Status Banner (Dedicated panels for Stations 2, 3, 6, 7, 9 handle their own layout) */}
              {effectiveStation !== "fabric_issue" &&
                effectiveStation !== "cutting" &&
                effectiveStation !== "final_qc" &&
                effectiveStation !== "packing" &&
                effectiveStation !== "dispatch" && (
                  <section
                    aria-label="Active Station Context"
                    className="relative overflow-hidden rounded-xl border border-[#CDBBA8] bg-[#FFFDFC] p-5 shadow-2xs"
                  >
                    {/* Aesthetic stitching backdrop blend for stitching workstation */}
                    {effectiveStation === "stitching" && (
                      <div
                        className="pointer-events-none absolute right-0 top-0 bottom-0 flex items-center justify-end select-none overflow-hidden pr-1"
                        style={{
                          maskImage:
                            "linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.2) 85%, transparent 100%)",
                          WebkitMaskImage:
                            "linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.2) 85%, transparent 100%)",
                        }}
                      >
                        <img
                          src="/images/stitching/vintage-sewing-aesthetic.jpg"
                          alt="Vintage stitching machine"
                          aria-hidden="true"
                          className="h-full w-auto max-w-[260px] object-contain object-right opacity-90 brightness-105 contrast-105"
                        />
                      </div>
                    )}

                    {/* Aesthetic warehouse backdrop blend for warehouse workstation */}
                    {effectiveStation === "warehouse" && (
                      <div
                        className="pointer-events-none absolute right-0 top-0 bottom-0 flex items-center justify-end select-none overflow-hidden pr-1"
                        style={{
                          maskImage:
                            "linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.2) 85%, transparent 100%)",
                          WebkitMaskImage:
                            "linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.2) 85%, transparent 100%)",
                        }}
                      >
                        <img
                          src="/images/warehouse/aesthetic-warehouse.jpg"
                          alt="Artisanal warehouse shelves"
                          aria-hidden="true"
                          className="h-full w-auto max-w-[280px] object-cover object-right opacity-80 brightness-105 contrast-100"
                        />
                      </div>
                    )}

                    <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="wt-eyebrow">
                            {activeStations.length > 1
                              ? `Station #${rfidStationCodes.indexOf(effectiveStation) + 1} of 9`
                              : `Station #${rfidStationCodes.indexOf(effectiveStation) + 1} of 9`}
                          </p>
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                          {stData.stationName}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Assigned department:{" "}
                          <span className="font-medium text-foreground">
                            {stationDepartment[effectiveStation]}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-col items-start gap-2 md:items-end">
                        {stData.lastConfirmedSubjectId && (
                          <div className="flex items-center gap-1.5 rounded-lg border border-[#CDBBA8] bg-[#E2C8A8]/60 px-2.5 py-1 text-xs text-[#2B170E]">
                            <span className="text-[#6E5748]">Latest Subject:</span>
                            <span className="wt-id font-bold text-[#2B170E]">
                              {stData.lastConfirmedSubjectId}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Durable Scan Feedback handled contextually by individual station panels */}
                  </section>
                )}

              {/* Feature-owned Panel Switch */}
              {effectiveStation === "fabric_receiving" && <ReceivingPanel stationData={stData} />}
              {effectiveStation === "fabric_issue" && (
                <IssuePanel
                  stationData={stData}
                  headerActions={
                    activeStations.length > 1 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Station:
                        </span>
                        <select
                          value={effectiveStation}
                          onChange={(e) => setStationCode(e.target.value as RfidStationCode)}
                          className="h-8 rounded-lg border border-input bg-background px-3 text-xs font-semibold shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {activeStations.map((code) => (
                            <option key={code} value={code}>
                              {rfidStationLabels[code]} ({code})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : undefined
                  }
                />
              )}
              {effectiveStation === "cutting" && <CuttingPanel stationData={stData} />}
              {effectiveStation === "stitching" && <StitchingPanel stationData={stData} />}
              {effectiveStation === "finishing" && <FinishingPanel stationData={stData} />}
              {effectiveStation === "final_qc" && <QAPanel stationData={stData} />}
              {effectiveStation === "dispatch" && <DispatchPanel stationData={stData} />}
              {effectiveStation === "packing" && <PackingPanel stationData={stData} />}
              {effectiveStation === "warehouse" && <WarehousePanel stationData={stData} />}
            </div>
          );
        }}
      </Loadable>
    </div>
  );
}
