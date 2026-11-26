import { useState, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Layers,
  Leaf,
  Percent,
  Radio,
  Scissors,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MaterialLot, ProductionOrder } from "@/domain/types";
import {
  optimizeFabricAllocation,
  type OptimizationResult,
  type FabricRecommendation,
} from "@/domain/fabric-optimizer";

interface FabricAllocationAdvisorProps {
  order: ProductionOrder;
  availableLots: MaterialLot[];
  onSelectRecommendedLot: (lot: MaterialLot) => void;
  selectedLotId?: string | undefined;
}

export function FabricAllocationAdvisor({
  order,
  availableLots,
  onSelectRecommendedLot,
  selectedLotId,
}: FabricAllocationAdvisorProps) {
  const [showAllRolls, setShowAllRolls] = useState(false);

  const optimization: OptimizationResult = useMemo(() => {
    return optimizeFabricAllocation({
      order,
      availableLots,
      consumptionPerPiece: 2.0,
      pricePerMeter: 3.5,
    });
  }, [order, availableLots]);

  const best = optimization.bestRecommendation;

  return (
    <div className="rounded-2xl border-2 border-purple-500/30 bg-gradient-to-br from-card via-card to-purple-500/5 p-4 sm:p-5 shadow-xs space-y-4">
      {/* Advisor Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
            <Sparkles className="size-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                AI Smart Fabric Allocation &amp; Scrap-Minimizer
              </span>
              <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                Decision Support
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analyzing warehouse rolls for {order.id} ({order.plannedQty} pcs · {optimization.requiredMeters}m required)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md border bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-foreground font-semibold">
            🎯 Target: {optimization.requiredMeters}m
          </span>
          {optimization.detectedColor && (
            <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary capitalize">
              Color: {optimization.detectedColor}
            </span>
          )}
        </div>
      </div>

      {/* Case 1: Best Recommendation Found */}
      {best ? (
        <div className="rounded-xl border border-purple-500/40 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-600 text-white px-2.5 py-0.5 text-xs font-bold shadow-xs">
                  <Sparkles className="size-3" /> AI Recommended Pick
                </span>
                <span className="font-mono font-bold text-foreground text-sm">
                  Lot #{best.lot.id}
                </span>
                {best.lot.rfidUid && (
                  <span className="font-mono text-xs text-muted-foreground">
                    (RFID: {best.lot.rfidUid})
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-foreground">
                {best.lot.material}
              </p>
            </div>

            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-xs gap-1.5 h-8 px-4 shrink-0"
              onClick={() => onSelectRecommendedLot(best.lot)}
            >
              <Check className="size-3.5" />
              Pre-fill Recommended Roll
            </Button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="rounded-lg border bg-background/90 p-2.5 shadow-2xs">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Roll Balance
              </span>
              <span className="font-bold text-sm text-foreground">
                {best.balanceMeters} m
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Cuts {optimization.requiredMeters}m
              </span>
            </div>

            <div className="rounded-lg border bg-background/90 p-2.5 shadow-2xs">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Expected Scrap
              </span>
              <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                {best.scrapPercentage}% ({best.remnantMeters}m)
              </span>
              <span className="text-[10px] text-emerald-600/80 block">
                Minimal end-of-roll offcut
              </span>
            </div>

            <div className="rounded-lg border bg-background/90 p-2.5 shadow-2xs">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Fabric Efficiency
              </span>
              <span className="font-bold text-sm text-purple-700 dark:text-purple-300">
                {best.yieldPercentage}% Yield
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Single-batch cut
              </span>
            </div>

            <div className="rounded-lg border bg-background/90 p-2.5 shadow-2xs">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Est. Savings vs Avg
              </span>
              <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                +{optimization.estimatedFabricSavedMeters}m (${optimization.estimatedCostSavedDollars})
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Fabric cost preserved
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Case 2: No Compatible Roll Found */
        <div className="rounded-xl border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="size-4 text-amber-600" />
            No Single Roll Matches Required Fabric &amp; Color
          </div>
          <p className="text-xs text-muted-foreground">
            All warehouse rolls either mismatch the requested product color ({optimization.detectedColor ?? "unspecified"}), weave, or have a balance below {optimization.requiredMeters}m. Review the candidate breakdown below.
          </p>
        </div>
      )}

      {/* Expandable Breakdown of All Evaluated Rolls */}
      <div className="space-y-2 pt-1 border-t border-border/60">
        <button
          type="button"
          onClick={() => setShowAllRolls((v) => !v)}
          className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1"
        >
          <span>
            Evaluated Warehouse Rolls ({optimization.totalEvaluatedLots} total · {optimization.recommendations.length} compatible)
          </span>
          <span className="flex items-center gap-1 text-primary">
            {showAllRolls ? "Hide Details" : "Inspect Why Other Rolls Were Ranked / Disqualified"}
            {showAllRolls ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </span>
        </button>

        {showAllRolls && (
          <div className="space-y-2 pt-2">
            {/* Compatible Rolls */}
            {optimization.recommendations.map((rec) => {
              const isSelected = selectedLotId === rec.lot.id || selectedLotId === rec.lot.rfidUid;
              return (
                <div
                  key={rec.lot.id}
                  className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border text-xs transition-colors ${
                    rec.isRecommended
                      ? "border-purple-500/50 bg-purple-500/5"
                      : "border-border/80 bg-card hover:bg-muted/30"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground font-mono">
                        #{rec.rank} Lot {rec.lot.id}
                      </span>
                      {rec.isRecommended && (
                        <span className="rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 text-[10px] font-bold">
                          AI Top Pick
                        </span>
                      )}
                      <span className="text-muted-foreground">·</span>
                      <span className="text-foreground">{rec.lot.material}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Balance: <strong className="text-foreground font-mono">{rec.balanceMeters}m</strong> · Remnant after cut: <strong className="font-mono">{rec.remnantMeters}m</strong> · Scrap: <strong className="font-mono">{rec.scrapPercentage}%</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                      {rec.yieldPercentage}% Yield
                    </span>
                    <Button
                      size="sm"
                      variant={rec.isRecommended ? "default" : "outline"}
                      className="h-7 text-xs px-2.5 font-semibold"
                      onClick={() => onSelectRecommendedLot(rec.lot)}
                    >
                      {isSelected ? "Selected" : "Select Roll"}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Incompatible / Disqualified Rolls */}
            {optimization.incompatibleLots.map((rec) => (
              <div
                key={rec.lot.id}
                className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/20 text-xs opacity-75"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground font-semibold">
                      Lot {rec.lot.id}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{rec.lot.material}</span>
                  </div>
                  <p className="text-[11px] text-destructive flex items-center gap-1 font-medium">
                    <XCircle className="size-3" /> {rec.compatibilityReason}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  Balance: {rec.balanceMeters}m
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
