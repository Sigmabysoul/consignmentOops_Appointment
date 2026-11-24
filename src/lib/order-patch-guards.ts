import { istDayStart } from "@/lib/date-utils";
import { roundTo2 } from "@/lib/number-input";

/** Box / carton fields App 2 can technically write. The main app owns them. */
export const DIMENSION_FIELDS = [
  "boxCount",
  "lengthCm",
  "widthCm",
  "heightCm",
  "weightKg",
  "remainderQty",
  "remainderLengthCm",
  "remainderWidthCm",
  "remainderHeightCm",
  "remainderWeightKg",
] as const;
export type DimensionField = (typeof DIMENSION_FIELDS)[number];

type LockableOrder = {
  dimensionConfirmed?: boolean | null;
  docsPrinted?: boolean | null;
  pickupDone?: boolean | null;
  boxesPacked?: boolean | null;
  boxDimensions?: string | null;
  customData?: unknown;
} & Partial<Record<DimensionField, number | null>>;

/**
 * Box count, dimensions and weights are locked once the main app confirmed them or printed the
 * packaging slip: the slips, the packer gate and BoxTrace all count boxes from these values, so a
 * change from the logistics desk would leave printed cartons that no longer match the order.
 */
export function isDimensionLocked(order: LockableOrder): boolean {
  const custom = (order.customData as Record<string, any>) || {};
  const slipPrinted = Boolean(custom?.documentPrintStatus?.PACKAGING_SLIP?.isPrinted);
  return Boolean(order.dimensionConfirmed || order.docsPrinted || order.pickupDone || order.boxesPacked || slipPrinted);
}

function sameNumber(field: DimensionField, current: number | null | undefined, next: number | null): boolean {
  const a = current ?? null;
  // Mirrors how the PATCH route stores the value (0 = not set, counts truncated, weights 2 decimals).
  let b: number | null = next;
  if (b !== null) {
    if (field === "boxCount" || field === "remainderQty") b = Math.trunc(b) || null;
    else if (field === "weightKg" || field === "remainderWeightKg") b = b ? roundTo2(b) : null;
    else b = b || null;
  }
  if (a === null || b === null) return a === b;
  return Math.abs(Number(a) - b) < 0.005;
}

/**
 * Returns the refusal message when the request would change a locked box field, or null.
 * Re-sending the stored values is not a change.
 */
export function dimensionPatchRefusal(
  existing: LockableOrder,
  parsedNumbers: Partial<Record<string, number | null>>,
  boxDimensions: unknown,
  canOverride: boolean
): string | null {
  if (canOverride || !isDimensionLocked(existing)) return null;
  const changed: string[] = [];
  for (const field of DIMENSION_FIELDS) {
    if (parsedNumbers[field] === undefined) continue;
    if (!sameNumber(field, existing[field], parsedNumbers[field] ?? null)) changed.push(field);
  }
  if (boxDimensions !== undefined) {
    const next = boxDimensions ? String(boxDimensions).trim() : null;
    if (next !== (existing.boxDimensions ?? null)) changed.push("boxDimensions");
  }
  if (changed.length === 0) return null;
  return `Box count, dimensions and weight are locked (confirmed / packaging slip printed in the main consignment app). Change them there. Refused: ${changed.join(", ")}.`;
}

/** Warning (not a refusal) when the delivery appointment falls after the RO/PO expiry day. */
export function appointmentAfterExpiryWarning(
  appointmentDate: Date | null | undefined,
  roExpiryDate: Date | null | undefined
): string | null {
  if (!appointmentDate || !roExpiryDate) return null;
  if (istDayStart(appointmentDate).getTime() <= istDayStart(roExpiryDate).getTime()) return null;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
  return `Appointment ${fmt(appointmentDate)} is after the RO expiry (${fmt(roExpiryDate)}). The platform may refuse the delivery: check the RO is extended.`;
}
