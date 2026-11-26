import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Hammer,
  Radio,
  RotateCcw,
  ScanLine,
  Search,
  UserCheck,
  Wrench,
} from "lucide-react";
import { paths } from "@/app/paths";
import { AppLink } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/wt/DataTable";
import { NativeSelect } from "@/components/wt/forms";
import { fmt, IdLink, PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { EmptyState, Loadable } from "@/components/wt/states";
import { departmentLabels } from "@/domain/labels";
import type { Department, Garment, ReworkCase, ReworkStatus } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { LinkIf } from "@/features/shared/subject";
import { useMe } from "@/features/shared/useMe";

export function ReworkListView() {
  const me = useMe();
  const { run, pending } = useWtAction();
  const qRework = useWtQuery(["rework"], (c) => c.listRework());
  const qGarments = useWtQuery(["garments"], (c) => c.listGarments());

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  // Track physical repair status per row: "pending" (default) or "done"
  const [rowStates, setRowStates] = useState<Record<string, "pending" | "done">>({});

  // Active scan verification dialog state
  const [scanCase, setScanCase] = useState<ReworkCase | null>(null);
  const [scannedTagInput, setScannedTagInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  const isProduction = me.role === "P";
  const isQc = me.role === "Q" || me.username === "qc.demo" || me.department === "quality";

  const stationCode =
    me.department === "stitching"
      ? "stitching"
      : me.department === "finishing"
        ? "finishing"
        : me.department === "cutting"
          ? "cutting"
          : isQc
            ? "final_qc"
            : null;

  const qStation = useWtQuery(
    ["rfid-station", stationCode ?? "stitching"],
    (c) => c.getRfidStationData((stationCode ?? "stitching") as any),
    {
      enabled: !!stationCode && !!scanCase,
      refetchInterval: 1000,
    },
  );

  const lastReworkScanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scanCase) return;
    const outcome = qStation.data?.lastScanOutcome;
    if (!outcome) return;
    if (outcome.at && outcome.at !== lastReworkScanRef.current) {
      lastReworkScanRef.current = outcome.at;
      if (outcome.uid) {
        setScannedTagInput(outcome.uid);
      }
    }
  }, [scanCase, qStation.data?.lastScanOutcome]);

  return (
    <>
      <PageHeader title="Rework & Repairs" />

      <Loadable query={qRework}>
        {(allCases) => (
          <Loadable query={qGarments}>
            {(garmentsList) => {
              const garmentsMap = new Map<string, Garment>(garmentsList.map((g) => [g.id, g]));

              // CRITICAL RULE: For production staff (e.g. cutting.demo), rework must NOT be shown
              // until the assigned department is specifically their department!
              const scopedCases = allCases.filter((r) => {
                if (isProduction) {
                  return r.assignedDepartment === me.department;
                }
                if (isQc) {
                  return (
                    r.status === "repaired" ||
                    r.assignedDepartment === "quality" ||
                    r.assignedDepartment === me.department
                  );
                }
                return true;
              });

              const awaitingAssign = scopedCases.filter(
                (r) => r.status === "awaiting-assignment",
              ).length;
              const assigned = scopedCases.filter((r) => r.status === "assigned").length;
              const repaired = scopedCases.filter((r) => r.status === "repaired").length;
              const closed = scopedCases.filter((r) => r.status === "closed").length;

              const filtered = scopedCases.filter((r) => {
                if (activeTab !== "all" && r.status !== activeTab) return false;
                if (!isProduction && deptFilter !== "all" && r.assignedDepartment !== deptFilter)
                  return false;
                if (search.trim()) {
                  const s = search.toLowerCase();
                  const matchId = r.id.toLowerCase().includes(s);
                  const matchGarment = r.garmentId.toLowerCase().includes(s);
                  const matchDefect = r.defectReason.toLowerCase().includes(s);
                  if (!matchId && !matchGarment && !matchDefect) return false;
                }
                return true;
              });

              return (
                <div className="space-y-6">
                  {/* Metrics */}
                  <div className={`grid grid-cols-2 gap-4 ${isProduction ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
                    {!isProduction && (
                      <div className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs font-medium uppercase tracking-wider">
                            Awaiting Assignment
                          </span>
                          <Clock className="size-4 text-warning" />
                        </div>
                        <p className="mt-2 text-2xl font-bold">{awaitingAssign}</p>
                      </div>
                    )}
                    <div className="rounded-lg border bg-card p-4 shadow-sm">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">
                          Under Repair
                        </span>
                        <Hammer className="size-4 text-primary" />
                      </div>
                      <p className="mt-2 text-2xl font-bold">{assigned}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-4 shadow-sm">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">
                          Awaiting Reinspection
                        </span>
                        <RotateCcw className="size-4 text-accent" />
                      </div>
                      <p className="mt-2 text-2xl font-bold">{repaired}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-4 shadow-sm">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">
                          Closed Cases
                        </span>
                        <CheckCircle2 className="size-4 text-success" />
                      </div>
                      <p className="mt-2 text-2xl font-bold">{closed}</p>
                    </div>
                  </div>

                  {/* Tabs & Controls */}
                  <div className="space-y-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
                        <TabsList className="flex h-auto flex-wrap">
                          <TabsTrigger value="all">All Cases ({scopedCases.length})</TabsTrigger>
                          {!isProduction && (
                            <TabsTrigger value="awaiting-assignment">
                              Awaiting Assignment ({awaitingAssign})
                            </TabsTrigger>
                          )}
                          <TabsTrigger value="assigned">In Repair ({assigned})</TabsTrigger>
                          <TabsTrigger value="repaired">Awaiting QC ({repaired})</TabsTrigger>
                          <TabsTrigger value="closed">Closed ({closed})</TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search garment or defect..."
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              className="h-8 pl-8 text-xs w-[180px] sm:w-[220px]"
                            />
                          </div>

                          {!isProduction && (
                            <div className="w-[130px]">
                              <NativeSelect
                                value={deptFilter}
                                onChange={setDeptFilter}
                                options={[
                                  { value: "all", label: "All Depts" },
                                  { value: "cutting", label: "Cutting" },
                                  { value: "stitching", label: "Stitching" },
                                  { value: "finishing", label: "Finishing" },
                                ]}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <TabsContent value={activeTab} className="mt-3">
                        <DataTable
                          rows={filtered}
                          rowKey={(r) => r.id}
                          empty={
                            isProduction
                              ? `No rework cases currently assigned to ${departmentLabels[me.department]}.`
                              : "No rework cases match the active filter criteria."
                          }
                          columns={[
                            {
                              header: "Case",
                              cell: (r) => <IdLink href={paths.reworkCase(r.id)} id={r.id} />,
                            },
                            {
                              header: "Garment",
                              cell: (r) => (
                                <LinkIf
                                  user={me}
                                  routeKey="garment"
                                  href={paths.garment(r.garmentId)}
                                  id={r.garmentId}
                                />
                              ),
                            },
                            {
                              header: "Defect Reason",
                              cell: (r) => (
                                <span className="font-medium text-destructive">{r.defectReason}</span>
                              ),
                            },
                            {
                              header: "Assigned Department",
                              cell: (r) =>
                                r.assignedDepartment ? (
                                  <span className="text-xs font-medium">
                                    {departmentLabels[r.assignedDepartment]}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">
                                    Pending manager
                                  </span>
                                ),
                            },
                            {
                              header: "Status",
                              cell: (r) => {
                                const isMyDept =
                                  (isProduction && r.assignedDepartment === me.department) ||
                                  (isQc && (r.status === "repaired" || r.assignedDepartment === "quality"));
                                const isUnderRepair =
                                  r.status === "assigned" ||
                                  (isMyDept &&
                                    (r.status === "awaiting-assignment" || r.status === "repaired"));
                                const currentRowState = rowStates[r.id] ?? "pending";

                                return (
                                  <div className="space-y-1.5 min-w-[130px]">
                                    <StatusBadge status={r.status} />

                                    {/* For production staff: interactive Pending / Done buttons */}
                                    {isMyDept && isUnderRepair && (
                                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                        <div className="inline-flex rounded-md border border-input p-0.5 bg-muted/40 text-[11px]">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setRowStates((prev) => ({ ...prev, [r.id]: "pending" }))
                                            }
                                            className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                                              currentRowState === "pending"
                                                ? "bg-warning text-warning-foreground shadow-2xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                            }`}
                                          >
                                            Pending
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setRowStates((prev) => ({ ...prev, [r.id]: "done" }))
                                            }
                                            className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                                              currentRowState === "done"
                                                ? "bg-success text-success-foreground shadow-2xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                            }`}
                                          >
                                            Done
                                          </button>
                                        </div>

                                        {/* Alongside Done: Scan Tag button */}
                                        {currentRowState === "done" && (
                                          <Button
                                            size="sm"
                                            className="h-6 px-2 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs transition-all animate-in fade-in"
                                            onClick={() => {
                                              setScanCase(r);
                                              setScannedTagInput("");
                                              setScanError(null);
                                            }}
                                          >
                                            <ScanLine className="size-3" /> Scan Tag
                                          </Button>
                                        )}
                                      </div>
                                    )}

                                    {r.status === "repaired" && (
                                      <div className="text-[11px] text-success font-semibold flex items-center gap-1 pt-0.5">
                                        <CheckCircle2 className="size-3 text-success shrink-0" />
                                        <span>Done & Resolved</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              },
                            },
                            { header: "Opened", cell: (r) => fmt.date(r.createdAt) },
                            {
                              header: "Action",
                              cell: (r) => (
                                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                  <AppLink href={paths.reworkCase(r.id)}>Manage</AppLink>
                                </Button>
                              ),
                            },
                          ]}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>

                  {/* Scan & Match Product RFID Tag Modal */}
                  <Dialog open={!!scanCase} onOpenChange={(open) => !open && setScanCase(null)}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <ScanLine className="size-5 text-primary" />
                          <span>Scan & Verify Repaired Garment</span>
                        </DialogTitle>
                        <DialogDescription>
                          Scan the RFID card on garment{" "}
                          <span className="font-semibold text-foreground font-mono">
                            {scanCase?.garmentId}
                          </span>{" "}
                          to verify physical repair and save status as Resolved.
                        </DialogDescription>
                      </DialogHeader>

                      {scanCase && (
                        <div className="space-y-4 py-2">
                          {stationCode && (
                            <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-primary font-medium">
                                <Radio className="size-3.5 animate-pulse" />
                                <span>
                                  Hardware Scanner Active (
                                  {stationCode === "final_qc"
                                    ? "Scanner 6"
                                    : stationCode === "finishing"
                                      ? "Scanner 5"
                                      : stationCode === "stitching"
                                        ? "Scanner 4"
                                        : "Scanner 3"}
                                  )
                                </span>
                              </div>
                              <span className="text-muted-foreground text-[10px]">Listening for tag scan...</span>
                            </div>
                          )}

                          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Rework Case:</span>
                              <span className="font-mono font-bold text-foreground">{scanCase.id}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Garment Code:</span>
                              <span className="font-mono font-bold text-primary">{scanCase.garmentId}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Defect to Correct:</span>
                              <span className="font-medium text-destructive">
                                {scanCase.defectReason || "Rework item"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Expected Card UID:</span>
                              <span className="font-mono font-semibold text-foreground">
                                {garmentsMap.get(scanCase.garmentId)?.rfidUid ?? "Assigned garment card"}
                              </span>
                            </div>
                          </div>

                          {scanError && (
                            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                              <AlertCircle className="size-4 shrink-0 mt-0.5" />
                              <span>{scanError}</span>
                            </div>
                          )}

                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                              Garment RFID Tag UID
                            </label>
                            <div className="flex gap-2">
                              <Input
                                autoFocus
                                placeholder="Scan or enter garment tag UID..."
                                value={scannedTagInput}
                                onChange={(e) => {
                                  setScannedTagInput(e.target.value.toUpperCase());
                                  setScanError(null);
                                }}
                                className="font-mono text-xs uppercase"
                              />
                              {garmentsMap.get(scanCase.garmentId)?.rfidUid && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="text-[11px] shrink-0"
                                  onClick={() => {
                                    const expected = garmentsMap.get(scanCase.garmentId)?.rfidUid || "";
                                    setScannedTagInput(expected);
                                    setScanError(null);
                                  }}
                                >
                                  Pre-fill Tag
                                </Button>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Present the garment tag at the reader or enter UID to verify with{" "}
                              {scanCase.garmentId}.
                            </p>
                          </div>
                        </div>
                      )}

                      <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setScanCase(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending || !scannedTagInput.trim()}
                          onClick={async () => {
                            if (!scanCase) return;
                            const inputUid = scannedTagInput.trim().toUpperCase();
                            const expectedUid = garmentsMap
                              .get(scanCase.garmentId)
                              ?.rfidUid?.toUpperCase();

                            // Validate tag match if garment has a registered card UID
                            if (expectedUid && inputUid !== expectedUid) {
                              setScanError(
                                `Tag Mismatch! Scanned tag "${inputUid}" does not match garment ${scanCase.garmentId} (Expected: "${expectedUid}").`,
                              );
                              return;
                            }

                            const success = await run(
                              (c) =>
                                c.completeRework(
                                  scanCase.id,
                                  `Physical repair completed and RFID tag (${inputUid}) verified at ${departmentLabels[me.department] ?? "shop"}.`,
                                ),
                              `Rework ${scanCase.id} for garment ${scanCase.garmentId} verified & resolved!`,
                            );

                            if (success) {
                              setScanCase(null);
                              void qRework.refetch();
                              void qGarments.refetch();
                            }
                          }}
                        >
                          <CheckCircle2 className="size-4 mr-1.5" />
                          Verify Tag & Save Done
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              );
            }}
          </Loadable>
        )}
      </Loadable>
    </>
  );
}
