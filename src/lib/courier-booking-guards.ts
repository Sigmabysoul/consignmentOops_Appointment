/**
 * Pure rules shared by the Delhivery and Shiprocket booking routes (no DB, no network), so they
 * can be unit tested and both carriers apply exactly the same checks inside their row locks.
 */
import type { DelhiveryShipmentRecord } from "@/lib/delhivery-types";
import type { ShiprocketShipmentRecord } from "@/lib/shiprocket-types";

type CustomData = Record<string, any> | null | undefined;

const asObject = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});

/** Manifest states in which a Delhivery LR may exist or is being created. */
const DELHIVERY_LIVE_MANIFEST_STATES = new Set(["submitting", "pending", "unknown_outcome"]);
/** Shipment states in which a Shiprocket pickup/LR may exist or is being created. */
const SHIPROCKET_LIVE_SHIPMENT_STATES = new Set(["done", "submitting", "unknown_outcome"]);

/**
 * A Delhivery booking that blocks booking another carrier: an LR that is not cancelled, or a
 * manifest that is being submitted / polled / has an unknown outcome (it may have created an LR).
 */
export function activeDelhiveryBooking(customData: CustomData): string | null {
  const rec = asObject(asObject(customData).delhivery) as DelhiveryShipmentRecord;
  if (rec.cancelled) return null;
  if (rec.lrn) return `Delhivery One (LR ${rec.lrn})`;
  const state = rec.manifest?.state;
  if (state && DELHIVERY_LIVE_MANIFEST_STATES.has(state)) {
    return state === "unknown_outcome"
      ? "Delhivery One (last booking attempt has an unknown outcome)"
      : "Delhivery One (booking in progress)";
  }
  return null;
}

/** A Shiprocket shipment that blocks booking another carrier (booked, being booked, or unknown outcome). */
export function activeShiprocketBooking(customData: CustomData): string | null {
  const rec = asObject(asObject(customData).shiprocket) as ShiprocketShipmentRecord;
  const state = rec.shipment?.state;
  if (!state || !SHIPROCKET_LIVE_SHIPMENT_STATES.has(state)) return null;
  // A shipment Shiprocket itself reports as cancelled no longer holds the order.
  if (state === "done" && /^cancel/i.test(String(rec.tracking?.status || "").trim())) return null;
  if (state === "done") return `Shiprocket Cargo (waybill ${rec.waybill || rec.lrn || "pending"})`;
  return state === "unknown_outcome"
    ? "Shiprocket Cargo (last booking attempt has an unknown outcome)"
    : "Shiprocket Cargo (booking in progress)";
}

/** Refusal message when booking `carrier` would double-book an order already live with the other API carrier. */
export function otherCarrierRefusal(carrier: "delhivery" | "shiprocket", customData: CustomData): string | null {
  const other = carrier === "delhivery" ? activeShiprocketBooking(customData) : activeDelhiveryBooking(customData);
  if (!other) return null;
  return `This order is already booked with ${other}. Cancel that booking before booking ${
    carrier === "delhivery" ? "Delhivery One" : "Shiprocket Cargo"
  }.`;
}

/**
 * Merges carrier box AWBs into customData.shippingLabelBarcodes — the string[] App 1's BoxTrace
 * dispatch gate checks scans against. Existing entries are kept in order; new ones are appended,
 * trimmed and de-duplicated (exact match). Returns the same array reference when nothing changes.
 */
export function mergeShippingLabelBarcodes(existing: unknown, incoming: Array<string | null | undefined>): string[] {
  const base: string[] = Array.isArray(existing) ? existing.filter((x): x is string => typeof x === "string") : [];
  const seen = new Set(base.map((b) => b.trim()));
  const out = [...base];
  for (const raw of incoming) {
    const code = String(raw ?? "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out.length === base.length && Array.isArray(existing) ? (existing as string[]) : out;
}

/** customData with `codes` merged into shippingLabelBarcodes (never mutates the input). */
export function withShippingLabelBarcodes(customData: CustomData, codes: Array<string | null | undefined>): Record<string, any> {
  const custom = { ...asObject(customData) };
  const merged = mergeShippingLabelBarcodes(custom.shippingLabelBarcodes, codes);
  if (merged.length > 0 || Array.isArray(custom.shippingLabelBarcodes)) custom.shippingLabelBarcodes = merged;
  return custom;
}

/** customData with `codes` removed from shippingLabelBarcodes (cancelled LR: its AWBs must not pass BoxTrace). */
export function withoutShippingLabelBarcodes(customData: CustomData, codes: Array<string | null | undefined>): Record<string, any> {
  const custom = { ...asObject(customData) };
  if (!Array.isArray(custom.shippingLabelBarcodes)) return custom;
  const drop = new Set(codes.map((c) => String(c ?? "").trim()).filter(Boolean));
  custom.shippingLabelBarcodes = (custom.shippingLabelBarcodes as unknown[]).filter(
    (b) => !(typeof b === "string" && drop.has(b.trim()))
  );
  return custom;
}

/** Minutes after which a Delhivery manifest still "pending" is treated as an unknown outcome. */
export const DELHIVERY_PENDING_STALE_MINUTES = 30;

/**
 * Effective manifest state: a "submitting" claim older than 2 minutes (crashed request) or a
 * "pending" job not resolved within DELHIVERY_PENDING_STALE_MINUTES (poll mapper never
 * recognised the reply) becomes "unknown_outcome" — an admin can then check the Delhivery One
 * panel and resubmit, instead of the order being stuck forever.
 */
export function effectiveManifestState(
  manifest: { state?: string; submittedAt?: string } | null | undefined,
  now: number = Date.now()
): string | undefined {
  const state = manifest?.state;
  const at = manifest?.submittedAt ? Date.parse(manifest.submittedAt) : NaN;
  if (!Number.isFinite(at)) return state;
  if (state === "submitting" && now - at > 2 * 60 * 1000) return "unknown_outcome";
  if (state === "pending" && now - at > DELHIVERY_PENDING_STALE_MINUTES * 60 * 1000) return "unknown_outcome";
  return state;
}
