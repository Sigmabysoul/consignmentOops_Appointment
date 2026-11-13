import { OdaBand } from "./types";

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

  // Check bounds
  if (km > 350 || weightKg > 5000 || weightKg < 1) {
    return {
      amount: 0,
      error: "ODA outside matrix, request a quote",
    };
  }

  // Find distance column index
  const colIdx = ODA_DISTANCE_BANDS.findIndex(
    (b) => km >= b.minKm && km <= b.maxKm
  );
  if (colIdx === -1) {
    return {
      amount: 0,
      error: "ODA outside matrix, request a quote",
    };
  }

  const matrix = customMatrix || DEFAULT_ODA_MATRIX;
  const row = matrix.find(
    (r) => weightKg >= r.minKg && weightKg <= r.maxKg
  );
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
