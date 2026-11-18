/**
 * Slab lookup for rate cards whose rows are labelled with whole numbers ("0–250 kg",
 * "251–500 kg", "41–100 km", ...). Read literally (`min <= W <= max`) those labels leave
 * gaps: 250.5 kg or 40.5 km match no row. A row therefore also owns the gap just below its
 * label when that gap is the integer-label gap (at most 1 unit) above the previous row:
 * `prevMax < W <= max`. A real gap (e.g. Northeast has 0–250 then 501–1000, no 251–500 rate)
 * is NOT bridged, so "no rate listed" still fires there. Exact boundaries are unchanged:
 * 250 stays in the 0–250 row, 251 in the 251–500 row.
 */
export interface SlabBounds {
  min: number;
  max: number;
}

export function findSlabIndex<T>(rows: T[], value: number, bounds: (row: T) => SlabBounds): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return -1;
  const order = rows
    .map((row, index) => ({ index, ...bounds(row) }))
    .filter((r) => Number.isFinite(r.min) && Number.isFinite(r.max))
    .sort((a, b) => a.min - b.min || a.max - b.max);

  let prevMax: number | null = null;
  for (const r of order) {
    if (value <= r.max) {
      if (value >= r.min) return r.index;
      // Whole-number labelled slab: "251–500" after "…–250", or a first row "1–350" (owns 0 < W < 1).
      const lower = prevMax ?? (Number.isInteger(r.min) && r.min >= 1 ? r.min - 1 : r.min);
      if (r.min - lower <= 1 && value > lower) return r.index;
    }
    prevMax = prevMax === null ? r.max : Math.max(prevMax, r.max);
  }
  return -1;
}

export function findSlab<T>(rows: T[], value: number, bounds: (row: T) => SlabBounds): T | undefined {
  const i = findSlabIndex(rows, value, bounds);
  return i === -1 ? undefined : rows[i];
}
