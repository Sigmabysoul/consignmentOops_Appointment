export interface BoxDimensionGroup {
  id: string;
  boxCount: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  dimensionUnit: string;
  weightUnit: string;
  isRemainder?: boolean;
  label?: string;
  key: string; // unique dimension key e.g. "23x40x25"
}

/**
 * Parses numeric dimension string like "23 x 40 x 25", "23x40x25", "23*40*25"
 */
export function parseDimensionString(dimStr?: string | null): {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  boxCount: number | null;
} | null {
  if (!dimStr || !dimStr.trim()) return null;
  const s = dimStr.trim();

  // Match: "3 @ 23x40x25" or "3 x 23 x 40 x 25"
  const multiMatch = s.match(/^(\d+)\s*[@xX*]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)/);
  if (multiMatch) {
    return {
      boxCount: parseInt(multiMatch[1], 10),
      lengthCm: parseFloat(multiMatch[2]),
      widthCm: parseFloat(multiMatch[3]),
      heightCm: parseFloat(multiMatch[4]),
    };
  }

  // Match: "23 x 40 x 25" or "23x40x25"
  const standardMatch = s.match(/(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)/);
  if (standardMatch) {
    return {
      boxCount: null,
      lengthCm: parseFloat(standardMatch[1]),
      widthCm: parseFloat(standardMatch[2]),
      heightCm: parseFloat(standardMatch[3]),
    };
  }

  return null;
}

/**
 * Extract unified box dimension groups from an order.
 * In logistics booking, the carrier does not care whether a box is "standard" or "remainder".
 * They simply need:
 * - Group 1: 3 boxes @ 23 x 40 x 25 cm (wt: 12 kg)
 * - Group 2: 1 box @ 15 x 20 x 10 cm (wt: 4 kg)
 *
 * If standard and remainder have identical dimensions, they are combined automatically into 4 boxes.
 */
export function extractBoxDimensionGroups(order: any): BoxDimensionGroup[] {
  if (!order) return [];

  const groups: BoxDimensionGroup[] = [];

  const dimUnit = order.dimensionUnit || "cm";
  const wtUnit = order.weightUnit || "kg";

  // 0. Explicit Box Dimension Groups (e.g. from customData or direct property)
  const explicitGroups = order.boxDimensionGroups || order.customData?.boxDimensionGroups;
  if (Array.isArray(explicitGroups) && explicitGroups.length > 0) {
    for (let i = 0; i < explicitGroups.length; i++) {
      const eg = explicitGroups[i];
      const l = eg.lengthCm !== undefined && eg.lengthCm !== null ? Number(eg.lengthCm) : null;
      const w = eg.widthCm !== undefined && eg.widthCm !== null ? Number(eg.widthCm) : null;
      const h = eg.heightCm !== undefined && eg.heightCm !== null ? Number(eg.heightCm) : null;
      const cnt = Number(eg.boxCount) || 1;
      const wt = eg.weightKg !== null && eg.weightKg !== undefined ? Number(Number(eg.weightKg).toFixed(2)) : null;
      groups.push({
        id: `explicit-${i}`,
        boxCount: cnt,
        lengthCm: l,
        widthCm: w,
        heightCm: h,
        weightKg: wt,
        dimensionUnit: eg.dimensionUnit || dimUnit,
        weightUnit: eg.weightUnit || wtUnit,
        isRemainder: Boolean(eg.isRemainder),
        label: `${cnt} Box${cnt > 1 ? "es" : ""}`,
        key: `${l ?? "?"}x${w ?? "?"}x${h ?? "?"}`,
      });
    }
  }

  // 1. Standard Box Group (if explicit dimensions exist and not already loaded from explicitGroups)
  if (groups.length === 0) {
    const stdCount = typeof order.boxCount === "number" && order.boxCount > 0 ? order.boxCount : 0;
    const stdL = typeof order.lengthCm === "number" ? order.lengthCm : null;
    const stdW = typeof order.widthCm === "number" ? order.widthCm : null;
    const stdH = typeof order.heightCm === "number" ? order.heightCm : null;
    const stdWt = typeof order.weightKg === "number" ? Number(order.weightKg.toFixed(2)) : null;

    const hasExplicitStdDims = stdL !== null || stdW !== null || stdH !== null;

    if (hasExplicitStdDims) {
      const key = `${stdL ?? "?"}x${stdW ?? "?"}x${stdH ?? "?"}`;
      groups.push({
        id: "standard",
        boxCount: stdCount || 1,
        lengthCm: stdL,
        widthCm: stdW,
        heightCm: stdH,
        weightKg: stdWt,
        dimensionUnit: dimUnit,
        weightUnit: wtUnit,
        isRemainder: false,
        label: `${stdCount || 1} Box${stdCount > 1 ? "es" : ""}`,
        key,
      });
    }

    // 2. Remainder Box Group (if explicit dimensions exist)
    const remCount = typeof order.remainderQty === "number" && order.remainderQty > 0 ? order.remainderQty : 0;
    const remL = typeof order.remainderLengthCm === "number" ? order.remainderLengthCm : null;
    const remW = typeof order.remainderWidthCm === "number" ? order.remainderWidthCm : null;
    const remH = typeof order.remainderHeightCm === "number" ? order.remainderHeightCm : null;
    const remWt = typeof order.remainderWeightKg === "number" ? Number(order.remainderWeightKg.toFixed(2)) : null;

    const hasExplicitRemDims = remL !== null || remW !== null || remH !== null;

    if (hasExplicitRemDims) {
      const key = `${remL ?? "?"}x${remW ?? "?"}x${remH ?? "?"}`;
      groups.push({
        id: "remainder",
        boxCount: remCount || 1,
        lengthCm: remL,
        widthCm: remW,
        heightCm: remH,
        weightKg: remWt,
        dimensionUnit: dimUnit,
        weightUnit: wtUnit,
        isRemainder: true,
        label: `${remCount || 1} Remainder Box${remCount > 1 ? "es" : ""}`,
        key,
      });
    }
  }

  // 3. Fallback: Parse `boxDimensions` text if no explicit dimensions were found
  if (groups.length === 0 && order.boxDimensions) {
    const parsed = parseDimensionString(order.boxDimensions);
    if (parsed) {
      const bCount = parsed.boxCount || order.boxCount || 1;
      groups.push({
        id: "parsed-dim",
        boxCount: bCount,
        lengthCm: parsed.lengthCm,
        widthCm: parsed.widthCm,
        heightCm: parsed.heightCm,
        weightKg: order.weightKg || null,
        dimensionUnit: dimUnit,
        weightUnit: wtUnit,
        isRemainder: false,
        label: `${bCount} Box${bCount > 1 ? "es" : ""}`,
        key: `${parsed.lengthCm}x${parsed.widthCm}x${parsed.heightCm}`,
      });
    }
  }

  // 4. Fallback 2: Check items if order level had no box details
  if (groups.length === 0 && Array.isArray(order.items) && order.items.length > 0) {
    order.items.forEach((item: any, idx: number) => {
      if (item.lengthCm || item.widthCm || item.heightCm || item.boxCount || item.boxDimensions) {
        let itL = item.lengthCm ?? null;
        let itW = item.widthCm ?? null;
        let itH = item.heightCm ?? null;
        let itCount = item.boxCount ?? 1;

        if ((!itL || !itW || !itH) && item.boxDimensions) {
          const p = parseDimensionString(item.boxDimensions);
          if (p) {
            itL = p.lengthCm;
            itW = p.widthCm;
            itH = p.heightCm;
            if (p.boxCount) itCount = p.boxCount;
          }
        }

        groups.push({
          id: `item-${item.id || idx}`,
          boxCount: itCount,
          lengthCm: itL,
          widthCm: itW,
          heightCm: itH,
          weightKg: item.weightKg || null,
          dimensionUnit: item.dimensionUnit || dimUnit,
          weightUnit: item.weightUnit || wtUnit,
          isRemainder: false,
          label: `${itCount} Box${itCount > 1 ? "es" : ""} (${item.itemName || "Item"})`,
          key: `${itL ?? "?"}x${itW ?? "?"}x${itH ?? "?"}`,
        });
      }
    });
  }

  // 5. Final Fallback: If only boxCount exists without dimensions
  if (groups.length === 0 && order.boxCount && order.boxCount > 0) {
    groups.push({
      id: "generic-box",
      boxCount: order.boxCount,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      weightKg: order.weightKg || null,
      dimensionUnit: dimUnit,
      weightUnit: wtUnit,
      isRemainder: false,
      label: `${order.boxCount} Box${order.boxCount > 1 ? "es" : ""}`,
      key: "?x?x?",
    });
  }

  // If two groups share identical non-null dimensions, unify their counts!
  const unifiedMap = new Map<string, BoxDimensionGroup>();
  for (const g of groups) {
    if (g.lengthCm !== null && g.widthCm !== null && g.heightCm !== null) {
      const dimKey = `${g.lengthCm}x${g.widthCm}x${g.heightCm}`;
      if (unifiedMap.has(dimKey)) {
        const existing = unifiedMap.get(dimKey)!;
        existing.boxCount += g.boxCount;
        if (g.weightKg !== null) {
          existing.weightKg = Number(((existing.weightKg || 0) + g.weightKg).toFixed(2));
        }
        existing.label = `${existing.boxCount} Boxes (${dimKey} ${g.dimensionUnit})`;
      } else {
        unifiedMap.set(dimKey, { ...g, key: dimKey });
      }
    } else {
      unifiedMap.set(`${g.id}-${Math.random()}`, g);
    }
  }

  return Array.from(unifiedMap.values());
}

/**
 * Returns a TSV (tab-separated) string for 1-click clipboard paste into booking websites.
 * Format: Count \t Length \t Breadth \t Height \t Weight
 */
export function formatTabSeparatedBoxRow(group: BoxDimensionGroup): string {
  const count = group.boxCount || 1;
  const l = group.lengthCm ?? "";
  const w = group.widthCm ?? "";
  const h = group.heightCm ?? "";
  const wt = group.weightKg !== null && group.weightKg !== undefined ? Number(Number(group.weightKg).toFixed(2)).toFixed(2) : "";
  return `${count}\t${l}\t${w}\t${h}\t${wt}`;
}

/**
 * Formatted string: "23 x 40 x 25 cm"
 */
export function formatDimensionDisplay(group: BoxDimensionGroup): string {
  if (group.lengthCm === null && group.widthCm === null && group.heightCm === null) {
    return "Dimensions Pending";
  }
  return `${group.lengthCm ?? 0} × ${group.widthCm ?? 0} × ${group.heightCm ?? 0} ${group.dimensionUnit}`;
}
