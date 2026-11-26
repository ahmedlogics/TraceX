import { describe, expect, it } from "vitest";
import {
  areColorsCompatible,
  areWeavesCompatible,
  extractColor,
  extractWeave,
  optimizeFabricAllocation,
} from "@/domain/fabric-optimizer";
import type { MaterialLot } from "@/domain/types";

describe("AI Smart Fabric Allocation & Scrap-Minimization Recommender", () => {
  describe("Semantic Attribute Extraction", () => {
    it("extracts colors correctly from product and lot descriptions", () => {
      expect(extractColor("Classic polo shirt - Blue, L")).toBe("blue");
      expect(extractColor("Cotton poplin, white, 140 cm")).toBe("white");
      expect(extractColor("Heavyweight Denim Jacket - Charcoal Black")).toBe("charcoal black");
      expect(extractColor("Light blue oxford fabric")).toBe("light blue");
      expect(extractColor("Plain garment with no color specified")).toBeUndefined();
    });

    it("extracts weave types correctly", () => {
      expect(extractWeave("Classic poplin shirt - white")).toBe("poplin");
      expect(extractWeave("Cotton oxford, light blue, 145 cm")).toBe("oxford");
      expect(extractWeave("Men's Pique Polo Shirt")).toBe("pique");
      expect(extractWeave("Raw Linen Camp Collar")).toBe("linen");
    });

    it("evaluates semantic color compatibility correctly", () => {
      expect(areColorsCompatible("blue", "light blue")).toBe(true);
      expect(areColorsCompatible("blue", "navy")).toBe(true);
      expect(areColorsCompatible("blue", "black")).toBe(false);
      expect(areColorsCompatible("white", "black")).toBe(false);
      expect(areColorsCompatible("olive", "green")).toBe(false);
      expect(areColorsCompatible(undefined, "blue")).toBe(true);
    });

    it("evaluates weave compatibility with generic cotton fallback", () => {
      expect(areWeavesCompatible("poplin", "poplin")).toBe(true);
      expect(areWeavesCompatible("poplin", "cotton")).toBe(true);
      expect(areWeavesCompatible("pique", "polo")).toBe(true);
      expect(areWeavesCompatible("denim", "silk")).toBe(false);
    });
  });

  describe("Two-Stage Fabric Optimization Algorithm", () => {
    const mockLots: MaterialLot[] = [
      {
        id: "LOT-BLACK-90",
        material: "Cotton Poplin, Black, 140cm",
        supplierRef: "SUP-01",
        receivedQty: 90,
        balanceQty: 90, // Perfect length match (0% scrap), BUT wrong color!
        unit: "m",
        receivedAt: "2026-11-20T10:00:00Z",
        receivedBy: "u-1",
        status: "accepted",
        rfidUid: "TAG-BLACK-90",
      },
      {
        id: "LOT-BLUE-120",
        material: "Cotton Oxford, Light Blue, 145cm",
        supplierRef: "SUP-02",
        receivedQty: 120,
        balanceQty: 120, // 30m scrap waste (75% yield)
        unit: "m",
        receivedAt: "2026-11-21T10:00:00Z",
        receivedBy: "u-1",
        status: "accepted",
        rfidUid: "TAG-BLUE-120",
      },
      {
        id: "LOT-BLUE-92",
        material: "Cotton Oxford, Light Blue, 145cm",
        supplierRef: "SUP-03",
        receivedQty: 95,
        balanceQty: 92.5, // Optimal! Only 2.5m scrap waste (97.3% yield)
        unit: "m",
        receivedAt: "2026-11-22T10:00:00Z",
        receivedBy: "u-1",
        status: "accepted",
        rfidUid: "TAG-BLUE-92",
      },
      {
        id: "LOT-BLUE-SHORT-50",
        material: "Cotton Oxford, Blue, 145cm",
        supplierRef: "SUP-04",
        receivedQty: 50,
        balanceQty: 50, // Insufficient fabric (50m < 90m)
        unit: "m",
        receivedAt: "2026-11-23T10:00:00Z",
        receivedBy: "u-1",
        status: "accepted",
        rfidUid: "TAG-BLUE-50",
      },
      {
        id: "LOT-BLUE-QUARANTINE",
        material: "Cotton Oxford, Blue, 145cm",
        supplierRef: "SUP-05",
        receivedQty: 92,
        balanceQty: 92,
        unit: "m",
        receivedAt: "2026-11-24T10:00:00Z",
        receivedBy: "u-1",
        status: "quarantine", // QA Not Accepted!
        rfidUid: "TAG-BLUE-QC",
      },
    ];

    it("strictly disqualifies black roll for blue shirt even if length is perfect", () => {
      const order = {
        id: "PO-BLUE-POLO-45",
        product: "Men's Oxford Shirt - Light Blue",
        styleCode: "WT-SH-100",
        plannedQty: 45, // 45 pcs * 2.0m = 90.0m
      };

      const result = optimizeFabricAllocation({
        order,
        availableLots: mockLots,
      });

      expect(result.requiredMeters).toBe(90.0);
      expect(result.detectedColor).toBe("light blue");

      // Black roll must be in incompatible list with Color Mismatch
      const blackEval = result.incompatibleLots.find((r) => r.lot.id === "LOT-BLACK-90");
      expect(blackEval).toBeDefined();
      expect(blackEval!.isCompatible).toBe(false);
      expect(blackEval!.compatibilityReason).toContain("Color Mismatch");

      // Unaccepted QA roll must be disqualified
      const qcEval = result.incompatibleLots.find((r) => r.lot.id === "LOT-BLUE-QUARANTINE");
      expect(qcEval).toBeDefined();
      expect(qcEval!.compatibilityReason).toContain("Must be QA accepted");

      // Short roll must be disqualified
      const shortEval = result.incompatibleLots.find((r) => r.lot.id === "LOT-BLUE-SHORT-50");
      expect(shortEval).toBeDefined();
      expect(shortEval!.compatibilityReason).toContain("Insufficient Fabric");
    });

    it("ranks LOT-BLUE-92 as #1 optimal pick over LOT-BLUE-120 due to minimal scrap", () => {
      const order = {
        id: "PO-BLUE-POLO-45",
        product: "Men's Oxford Shirt - Light Blue",
        styleCode: "WT-SH-100",
        plannedQty: 45, // 90m required
      };

      const result = optimizeFabricAllocation({
        order,
        availableLots: mockLots,
        pricePerMeter: 3.5,
      });

      expect(result.bestRecommendation).toBeDefined();
      expect(result.bestRecommendation?.lot.id).toBe("LOT-BLUE-92");
      expect(result.bestRecommendation?.isRecommended).toBe(true);
      expect(result.bestRecommendation?.yieldPercentage).toBe(97.3);
      expect(result.bestRecommendation?.scrapPercentage).toBe(2.7);
      expect(result.bestRecommendation?.remnantMeters).toBe(2.5);

      // Verify second place candidate
      const secondPick = result.recommendations[1];
      expect(secondPick.lot.id).toBe("LOT-BLUE-120");
      expect(secondPick.remnantMeters).toBe(30.0);
      expect(secondPick.yieldPercentage).toBe(75.0);
      expect(secondPick.scrapPercentage).toBe(25.0);

      // Verify savings calculation vs other available roll
      expect(result.estimatedFabricSavedMeters).toBe(27.5); // 30m - 2.5m = 27.5m saved!
      expect(result.estimatedCostSavedDollars).toBeCloseTo(96.25); // 27.5m * $3.50 = $96.25
    });
  });
});
