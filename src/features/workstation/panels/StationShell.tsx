import { useState } from "react";
import { Loadable } from "@/components/wt/states";
import type { RfidStationCode } from "@/domain/types";
import { useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";
import { ReceivingPanel } from "./ReceivingPanel";
import { IssuePanel } from "./IssuePanel";
import { CuttingPanel } from "./CuttingPanel";
import { RoutinePanel } from "./RoutinePanel";
import { FinishingPanel } from "./FinishingPanel";
import { QAPanel } from "./QAPanel";
import { LogisticsPanel } from "./LogisticsPanel";

export function StationShell() {
  const me = useMe();
  const [stationCode] = useState<RfidStationCode>("finishing");

  const qStation = useWtQuery(["rfid-station", stationCode], (c) =>
    c.getRfidStationData(stationCode),
    { refetchInterval: 3000 },
  );

  return (
    <Loadable query={qStation}>
      {(stData) => {
        return (
          <div className="space-y-6">
            {/* Station Status Bar */}
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Active RFID Station:
                </span>
                <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  Finishing Station (Station 5 / S4)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Operator:</span>
                <span className="font-semibold text-foreground">{me.displayName}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {me.department}
                </span>
              </div>
            </div>

            {/* Feature-owned Panel Switch */}
            {stationCode === "finishing" ? (
              <FinishingPanel stationData={stData} />
            ) : (
              <>
                {stationCode === "fabric_receiving" && <ReceivingPanel stationData={stData} />}
                {stationCode === "fabric_issue" && <IssuePanel stationData={stData} />}
                {stationCode === "cutting" && <CuttingPanel stationData={stData} />}
                {stationCode === "stitching" && <RoutinePanel stationData={stData} />}
                {stationCode === "final_qc" && <QAPanel stationData={stData} />}
                {(stationCode === "packing" ||
                  stationCode === "warehouse" ||
                  stationCode === "dispatch") && <LogisticsPanel stationData={stData} />}
              </>
            )}
          </div>
        );
      }}
    </Loadable>
  );
}
