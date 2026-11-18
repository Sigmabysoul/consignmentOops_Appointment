/** Rounds to 2 decimals (Golden Rule 7: no floating-point noise in weights or money). */
export function roundTo2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Parses an optional numeric API field.
 * null / "" → { ok: true, value: null }; a finite number ≥ 0 (or numeric string) → its value;
 * anything else (NaN, negatives, "abc", objects) → { ok: false }.
 */
export function parseOptionalNumber(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "string") {
    const t = raw.replace(/,/g, "").trim();
    if (t === "") return { ok: true, value: null };
    if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false };
    return { ok: true, value: Number(t) };
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return { ok: true, value: raw };
  return { ok: false };
}
