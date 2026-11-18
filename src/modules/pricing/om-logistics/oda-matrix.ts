import { OdaBand } from "./types";
import { findSlab, findSlabIndex } from "./slab-match";

export interface OdaDistanceBandDef {
  minKm: number;
  maxKm: number;
  label: string;
}

export const ODA_DISTANCE_BANDS: OdaDistanceBandDef[] = [
  { minKm: 41, maxKm: 100, label: "41–100 km" },
  { minKm: 101, maxKm: 160, label: "101–160 km" },
  { minKm: 161, maxKm: 220, label: "161–220 km" },
  { minKm: 221, maxKm: 280, label: "221–280 km" },
  { minKm: 281, maxKm: 350, label: "281–350 km" },
];

export const DEFAULT_ODA_MATRIX: OdaBand[] = [
  { minKg: 1, maxKg: 350, rates: [1380, 2530, 3220, 4025, 5175] },
  { minKg: 351, maxKg: 750, rates: [2300, 3450, 4600, 5750, 6900] },
  { minKg: 751, maxKg: 2000, rates: [3450, 4600, 5750, 6900, 8050] },
  { minKg: 2001, maxKg: 3500, rates: [4600, 5750, 6900, 8050, 9200] },
  { minKg: 3501, maxKg: 5000, rates: [5750, 6900, 8050, 9200, 10350] },
];

/**
 * Calculates ODA charge based on weight and distance.
 * Returns { amount, bandNote } or { error } if out of matrix range.
 */
export function getOdaCharge(
  weightKg: number,
  distanceKm?: number,
  customMatrix?: OdaBand[]
): {
  amount: number;
  bandNote?: string;
  error?: string;
} {
  const km = typeof distanceKm === "number" ? distanceKm : 0;
  if (!km || km <= 40) {
    return { amount: 0 };
  }

  // Check bounds (the weight rows decide the weight range: 0.5 kg belongs to the 1–350 kg row)
  if (km > 350 || !(weightKg > 0)) {
    return {
      amount: 0,
      error: "ODA outside matrix, request a quote",
    };
  }

  // Find distance column index
  // Bands are whole-number labelled (41–100, 101–160, …): 40.5 km → 41–100, 100.5 km → 101–160.
  // ODA starts above 40 km, so the first band owns 40 < km <= 100.
  const colIdx = findSlabIndex(ODA_DISTANCE_BANDS, km, (b) => ({ min: b.minKm, max: b.maxKm }));
  if (colIdx === -1) {
    return {
      amount: 0,
      error: "ODA outside matrix, request a quote",
    };
  }

  const matrix = customMatrix || DEFAULT_ODA_MATRIX;
  // Weight rows are whole-number labelled too: 350.5 kg → 351–750 kg, 0.5 kg → 1–350 kg.
  const row = findSlab(matrix, weightKg, (r) => ({ min: r.minKg, max: r.maxKg }));
  if (!row || typeof row.rates[colIdx] !== "number") {
    return {
      amount: 0,
      error: "ODA outside matrix, request a quote",
    };
  }

  const rate = row.rates[colIdx];
  const distBand = ODA_DISTANCE_BANDS[colIdx].label;
  return {
    amount: rate,
    bandNote: `${km} km (${distBand}, ${row.minKg}–${row.maxKg} kg)`,
  };
}
