import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Radio,
  ScanLine,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt, PageHeader } from "@/components/wt/layout";
import { StatusBadge, type Tone } from "@/components/wt/StatusBadge";
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

function defaultStationForUser(user: StaffUser): RfidStationCode {
  if (user.username === "receiving.demo") return "fabric_receiving";
  if (user.username === "rawstore.demo") return "fabric_issue";

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
    <Loadable query={qStation}>
      {(stData) => {
        const lastOutcome = stData.lastScanOutcome;

        return (
          <div className="space-y-6">
            {/* Station Operator Bar */}
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Active RFID Station:
                </span>
                {activeStations.length > 1 ? (
                  <select
                    value={effectiveStation}
                    onChange={(e) => setStationCode(e.target.value as RfidStationCode)}
                    className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {activeStations.map((code) => (
                      <option key={code} value={code}>
                        {rfidStationLabels[code]} ({code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary">
                    {rfidStationLabels[effectiveStation]} ({effectiveStation})
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Operator:</span>
                <span className="font-semibold text-foreground">{me.displayName}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">
                  {me.department}
                </span>
              </div>
            </div>

            {/* Station Status Banner */}
            <section
              aria-label="Active Station Context"
              className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-xs"
            >
              <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="wt-eyebrow">
                      {activeStations.length > 1
                        ? `Station #${rfidStationCodes.indexOf(effectiveStation) + 1} of 9`
                        : "Assigned Workstation"}
                    </p>
                    <span className="text-xs font-mono text-muted-foreground">
                      code: {effectiveStation}
                    </span>
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
                  {stData.bridgeConnected && (
                    <div className="flex items-center gap-2">
                      <StatusBadge status="Hardware RFID: Connected" tone="success" />
                    </div>
                  )}
                  {stData.lastConfirmedSubjectId && (
                    <div className="flex items-center gap-1.5 rounded-md bg-accent/60 px-2.5 py-1 text-xs">
                      <span className="text-muted-foreground">Latest Subject:</span>
                      <span className="wt-id font-bold text-accent-foreground">
                        {stData.lastConfirmedSubjectId}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Durable Scan Feedback */}
              {lastOutcome && (
                <div
                  className={`mt-4 rounded-lg border p-3 text-xs flex items-start gap-2.5 ${
                    lastOutcome.resolution === "accepted"
                      ? "border-success/40 bg-success-soft text-foreground"
                      : "border-destructive/40 bg-danger-soft text-foreground"
                  }`}
                >
                  {lastOutcome.resolution === "accepted" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success mt-0.5" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">
                      {lastOutcome.resolution === "accepted"
                        ? `Scan confirmed (${lastOutcome.uid}): ${
                            lastOutcome.garmentCode ?? lastOutcome.subjectId
                          }${lastOutcome.productName ? ` · ${lastOutcome.productName}` : ""}`
                        : `Scan rejected (${lastOutcome.uid}): ${
                            lastOutcome.rejectReason ?? lastOutcome.resolution
                          }`}
                    </p>
                    <p className="text-[11px] text-foreground/80 font-medium">
                      Timestamp: {fmt.dateTime(lastOutcome.at)}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Feature-owned Panel Switch */}
            {effectiveStation === "fabric_receiving" && <ReceivingPanel stationData={stData} />}
            {effectiveStation === "fabric_issue" && <IssuePanel stationData={stData} />}
            {effectiveStation === "cutting" && <CuttingPanel stationData={stData} />}
            {effectiveStation === "stitching" && <StitchingPanel stationData={stData} />}
            {effectiveStation === "finishing" && <FinishingPanel stationData={stData} />}
            {effectiveStation === "final_qc" && <QAPanel stationData={stData} />}
            {(effectiveStation === "packing" ||
              effectiveStation === "warehouse" ||
              effectiveStation === "dispatch") && <LogisticsPanel stationData={stData} />}
          </div>
        );
      }}
    </Loadable>
  );
}
