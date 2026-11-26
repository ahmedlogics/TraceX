import type { MaterialLot, ProductionOrder } from "./types";

export interface FabricRecommendation {
  lot: MaterialLot;
  rank: number;
  isRecommended: boolean;
  isCompatible: boolean;
  compatibilityReason: string;
  hasSufficientFabric: boolean;
  requiredMeters: number;
  balanceMeters: number;
  remnantMeters: number;
  yieldPercentage: number;
  scrapPercentage: number;
  colorMatch: boolean;
  materialMatch: boolean;
  detectedOrderColor?: string;
  detectedLotColor?: string;
  detectedOrderMaterial?: string;
  detectedLotMaterial?: string;
  score: number;
}

export interface OptimizationResult {
  orderId: string;
  orderProduct: string;
  plannedQty: number;
  requiredMeters: number;
  consumptionPerPiece: number;
  detectedColor?: string;
  detectedMaterial?: string;
  bestRecommendation: FabricRecommendation | null;
  recommendations: FabricRecommendation[];
  incompatibleLots: FabricRecommendation[];
  totalEvaluatedLots: number;
  estimatedFabricSavedMeters: number;
  estimatedCostSavedDollars: number;
}

const COMMON_COLORS = [
  "light blue",
  "sky blue",
  "navy blue",
  "dark green",
  "charcoal black",
  "charcoal",
  "white",
  "black",
  "navy",
  "blue",
  "indigo",
  "grey",
  "gray",
  "olive",
  "green",
  "khaki",
  "beige",
  "tan",
  "cream",
  "red",
  "maroon",
  "yellow",
  "pink",
  "brown",
];

const COMMON_WEAVES = [
  "poplin",
  "oxford",
  "twill",
  "linen",
  "pique",
  "polo",
  "jersey",
  "denim",
  "chambray",
  "flannel",
  "silk",
  "wool",
  "cotton",
  "polyester",
  "fleece",
];

export function extractColor(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const c of COMMON_COLORS) {
    const regex = new RegExp(`\\b${c}\\b`, "i");
    if (regex.test(lower)) {
      return c;
    }
  }
  return undefined;
}

export function extractWeave(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const w of COMMON_WEAVES) {
    const regex = new RegExp(`\\b${w}\\b`, "i");
    if (regex.test(lower)) {
      return w;
    }
  }
  return undefined;
}

/**
 * Checks if two colors are semantically compatible (e.g. "navy" matches "blue", "light blue" matches "blue").
 */
export function areColorsCompatible(orderColor?: string, lotColor?: string): boolean {
  if (!orderColor || !lotColor) return true; // If one is unspecified, do not hard-reject
  if (orderColor === lotColor) return true;

  const blueFamily = ["blue", "light blue", "sky blue", "navy blue", "navy", "indigo"];
  if (blueFamily.includes(orderColor) && blueFamily.includes(lotColor)) return true;

  const greyFamily = ["grey", "gray", "charcoal"];
  if (greyFamily.includes(orderColor) && greyFamily.includes(lotColor)) return true;

  const neutralFamily = ["beige", "tan", "cream", "khaki"];
  if (neutralFamily.includes(orderColor) && neutralFamily.includes(lotColor)) return true;

  return false;
}

/**
 * Checks if two weave/material terms are semantically compatible.
 */
export function areWeavesCompatible(orderWeave?: string, lotWeave?: string): boolean {
  if (!orderWeave || !lotWeave) return true;
  if (orderWeave === lotWeave) return true;

  // Cotton is generic base for poplin/oxford/twill
  if (orderWeave === "cotton" || lotWeave === "cotton") return true;
  if ((orderWeave === "polo" || orderWeave === "pique") && (lotWeave === "polo" || lotWeave === "pique" || lotWeave === "cotton")) return true;

  return false;
}

export function calculateOrderRequiredMeters(
  order: Pick<ProductionOrder, "plannedQty">,
  consumptionPerPiece = 2.0
): number {
  return Math.round(order.plannedQty * consumptionPerPiece * 10) / 10;
}

/**
 * Two-stage optimization engine:
 * Stage 1: Semantic compatibility filtering (Color & Weave Hard Filter)
 * Stage 2: 1D Remnant Minimization Knapsack Heuristic
 */
export function optimizeFabricAllocation({
  order,
  availableLots,
  consumptionPerPiece = 2.0,
  pricePerMeter = 3.5, // Standard cotton/poplin average price ($/m)
}: {
  order: Pick<ProductionOrder, "id" | "product" | "plannedQty" | "styleCode">;
  availableLots: MaterialLot[];
  consumptionPerPiece?: number;
  pricePerMeter?: number;
}): OptimizationResult {
  const requiredMeters = calculateOrderRequiredMeters(order, consumptionPerPiece);
  const detectedOrderColor = extractColor(order.product);
  const detectedOrderMaterial = extractWeave(order.product);

  const evaluated: FabricRecommendation[] = availableLots.map((lot) => {
    const lotDesc = lot.material || "";
    const detectedLotColor = extractColor(lotDesc);
    const detectedLotMaterial = extractWeave(lotDesc);

    const colorMatch = areColorsCompatible(detectedOrderColor, detectedLotColor);
    const materialMatch = areWeavesCompatible(detectedOrderMaterial, detectedLotMaterial);
    const isQualityAccepted = lot.status === "accepted";
    const balanceMeters = Number(lot.balanceQty) || 0;
    const hasSufficientFabric = balanceMeters >= requiredMeters;

    let isCompatible = true;
    let compatibilityReason = "Qualified candidate";

    if (!isQualityAccepted) {
      isCompatible = false;
      compatibilityReason = `Lot status is '${lot.status}' (Must be QA accepted)`;
    } else if (!colorMatch) {
      isCompatible = false;
      compatibilityReason = `Color Mismatch: Roll is ${detectedLotColor ?? "unspecified"}, order requires ${detectedOrderColor ?? "unspecified"}`;
    } else if (!materialMatch) {
      isCompatible = false;
      compatibilityReason = `Weave Mismatch: Roll is ${detectedLotMaterial ?? "unspecified"}, order requires ${detectedOrderMaterial ?? "unspecified"}`;
    } else if (!hasSufficientFabric) {
      isCompatible = false;
      compatibilityReason = `Insufficient Fabric: Roll balance (${balanceMeters}m) < Required (${requiredMeters}m)`;
    }

    // Remnant & scrap calculation
    const remnantMeters = hasSufficientFabric
      ? Math.round((balanceMeters - requiredMeters) * 10) / 10
      : Math.round((balanceMeters - requiredMeters) * 10) / 10; // negative shortfall

    const yieldPercentage = balanceMeters > 0 && hasSufficientFabric
      ? Math.min(100, Math.round((requiredMeters / balanceMeters) * 1000) / 10)
      : 0;

    const scrapPercentage = hasSufficientFabric
      ? Math.max(0, Math.round((100 - yieldPercentage) * 10) / 10)
      : 100;

    // Heuristic Score (Higher is better, maximum 1000):
    // 1. Direct penalty for scrap percentage
    // 2. Bonus for near-zero remnant (< 3m)
    // 3. Bonus for large reusable roll (> 25m) vs awkward dead remnant (4m - 15m)
    let score = 0;
    if (isCompatible && hasSufficientFabric) {
      score += 500;
      score += yieldPercentage * 4; // up to 400 pts

      if (remnantMeters <= 3.0) {
        score += 100; // Optimal clean end-of-roll cut
      } else if (remnantMeters >= 25.0) {
        score += 50; // Remaining roll is large enough for a future full production batch
      } else {
        score -= 50; // Penalty for dead remnant zone (4m-15m)
      }
    }

    return {
      lot,
      rank: 0,
      isRecommended: false,
      isCompatible,
      compatibilityReason,
      hasSufficientFabric,
      requiredMeters,
      balanceMeters,
      remnantMeters,
      yieldPercentage,
      scrapPercentage,
      colorMatch,
      materialMatch,
      detectedOrderColor,
      detectedLotColor,
      detectedOrderMaterial,
      detectedLotMaterial,
      score,
    };
  });

  const compatibleLots = evaluated
    .filter((r) => r.isCompatible && r.hasSufficientFabric)
    .sort((a, b) => b.score - a.score || a.remnantMeters - b.remnantMeters);

  const incompatibleLots = evaluated.filter((r) => !r.isCompatible || !r.hasSufficientFabric);

  // Assign ranks
  compatibleLots.forEach((r, idx) => {
    r.rank = idx + 1;
    r.isRecommended = idx === 0;
  });

  const bestRecommendation = compatibleLots[0] ?? null;

  // Estimate savings vs average compatible candidate roll
  let estimatedFabricSavedMeters = 0;
  let estimatedCostSavedDollars = 0;

  if (bestRecommendation && compatibleLots.length > 1) {
    const otherRollsRemnants = compatibleLots.slice(1).map((r) => r.remnantMeters);
    const avgOtherRemnant =
      otherRollsRemnants.reduce((sum, val) => sum + val, 0) / otherRollsRemnants.length;
    estimatedFabricSavedMeters = Math.max(
      0,
      Math.round((avgOtherRemnant - bestRecommendation.remnantMeters) * 10) / 10
    );
    estimatedCostSavedDollars =
      Math.round(estimatedFabricSavedMeters * pricePerMeter * 100) / 100;
  }

  return {
    orderId: order.id,
    orderProduct: order.product,
    plannedQty: order.plannedQty,
    requiredMeters,
    consumptionPerPiece,
    detectedColor: detectedOrderColor,
    detectedMaterial: detectedOrderMaterial,
    bestRecommendation,
    recommendations: compatibleLots,
    incompatibleLots,
    totalEvaluatedLots: evaluated.length,
    estimatedFabricSavedMeters,
    estimatedCostSavedDollars,
  };
}
