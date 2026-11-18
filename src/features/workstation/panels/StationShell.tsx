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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt, PageHeader } from "@/components/wt/layout";
import { StatusBadge, type Tone } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { rfidStationCodes, rfidStationLabels, stationDepartment } from "@/domain/labels";
import type { RfidStationCode, ScanOutcome } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";
import { UserName } from "@/features/shared/directory";
import { useMe } from "@/features/shared/useMe";
import { ReceivingPanel } from "./ReceivingPanel";
import { IssuePanel } from "./IssuePanel";
import { CuttingPanel } from "./CuttingPanel";
import { RoutinePanel } from "./RoutinePanel";
import { QAPanel } from "./QAPanel";
import { LogisticsPanel } from "./LogisticsPanel";

function defaultStationForDept(dept: string): RfidStationCode {
  switch (dept) {
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
  const [stationCode, setStationCode] = useState<RfidStationCode>(() =>
    defaultStationForDept(me.department),
  );

  const qStation = useWtQuery(["rfid-station", stationCode], (c) =>
    c.getRfidStationData(stationCode),
  );

  return (
    <Loadable query={qStation}>
      {(stData) => {
        const lastOutcome = stData.lastScanOutcome;

        return (
          <div className="space-y-6">
            {/* Station Selector Bar */}
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Active RFID Station:
                </span>
                <select
                  value={stationCode}
                  onChange={(e) => setStationCode(e.target.value as RfidStationCode)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {rfidStationCodes.map((code) => (
                    <option key={code} value={code}>
                      {rfidStationLabels[code]} ({code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Operator:</span>
                <span className="font-semibold">{me.displayName}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {me.department}
                </span>
              </div>
            </div>

            {/* Station Status Banner */}
            <section
              aria-label="Station header"
              className="rounded-lg border-2 border-primary/30 bg-card p-5 space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="wt-eyebrow">
                      Station #{rfidStationCodes.indexOf(stationCode) + 1} of 9
                    </p>
                    <span className="text-xs font-mono text-muted-foreground">
                      code: {stationCode}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {stData.stationName}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Assigned department:{" "}
                    <span className="font-medium text-foreground">
                      {stationDepartment[stationCode]}
                    </span>
                  </p>
                </div>

                <div className="flex flex-col items-start gap-2 md:items-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Hardware Bridge:</span>
                    <StatusBadge
                      status={stData.bridgeConnected ? "Connected" : "Disconnected (Simulated)"}
                      tone={stData.bridgeConnected ? "success" : "neutral"}
                    />
                  </div>
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
                  className={`rounded-lg border p-3 text-xs flex items-start gap-2.5 ${
                    lastOutcome.resolution === "accepted"
                      ? "border-success/40 bg-success-soft text-success-foreground"
                      : "border-destructive/40 bg-danger-soft text-destructive-foreground"
                  }`}
                >
                  {lastOutcome.resolution === "accepted" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success mt-0.5" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {lastOutcome.resolution === "accepted"
                        ? `Scan confirmed (${lastOutcome.uid}): ${
                            lastOutcome.garmentCode ?? lastOutcome.subjectId
                          }${lastOutcome.productName ? ` · ${lastOutcome.productName}` : ""}`
                        : `Scan rejected (${lastOutcome.uid}): ${
                            lastOutcome.rejectReason ?? lastOutcome.resolution
                          }`}
                    </p>
                    <p className="text-[11px] opacity-80">
                      Timestamp: {fmt.dateTime(lastOutcome.at)}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Feature-owned Panel Switch */}
            {stationCode === "fabric_receiving" && <ReceivingPanel stationData={stData} />}
            {stationCode === "fabric_issue" && <IssuePanel stationData={stData} />}
            {stationCode === "cutting" && <CuttingPanel stationData={stData} />}
            {(stationCode === "stitching" || stationCode === "finishing") && (
              <RoutinePanel stationData={stData} />
            )}
            {stationCode === "final_qc" && <QAPanel stationData={stData} />}
            {(stationCode === "packing" ||
              stationCode === "warehouse" ||
              stationCode === "dispatch") && <LogisticsPanel stationData={stData} />}
          </div>
        );
      }}
    </Loadable>
  );
}
