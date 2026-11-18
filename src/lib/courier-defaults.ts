/**
 * Channel-specific Courier Assignment Rules per plan.md:
 * 1. All shipments are done by land (no air travel).
 * 2. Amazon VC & FBA: Courier option is strictly ONLY "Amazon ATS".
 * 3. Flipkart FBF & FKSB: Courier option is strictly ONLY "Ekart".
 * 4. The rest (Swiggy, Blinkit, Flipkart Minutes, etc.): Courier options are strictly ONLY "Delhivery One",
 *    "OM Logistics" and "Shiprocket Cargo".
 * 5. Strict 2-decimal formatting (.00) for weights and numbers.
 */

export function isAmazonChannel(channel?: string | null): boolean {
  if (!channel) return false;
  const c = channel.toUpperCase().trim();
  return c.includes("AMAZON");
}

export function isFlipkartFbfOrFksb(channel?: string | null): boolean {
  if (!channel) return false;
  const c = channel.toUpperCase().trim();
  return (
    c === "FLIPKART_FBF" ||
    c === "FKSB_FLIPKART" ||
    c.includes("FBF") ||
    c.includes("FKSB")
  );
}

/**
 * Returns allowed courier partner names for a specific sales channel:
 * - Amazon (VC / FBA): ["Amazon ATS"]
 * - Flipkart FBF / FKSB: ["Ekart"]
 * - Rest (Swiggy, Blinkit, Flipkart Minutes, etc.): ["Delhivery One", "OM Logistics", "Shiprocket Cargo"]
 */
export function getAllowedCouriersForChannel(channel?: string | null): string[] {
  if (isAmazonChannel(channel)) {
    return ["Amazon ATS"];
  }
  if (isFlipkartFbfOrFksb(channel)) {
    return ["Ekart"];
  }
  // Rest: Swiggy, Blinkit, Flipkart Minutes, etc.
  return ["Delhivery One", "OM Logistics", "Shiprocket Cargo"];
}

/**
 * Returns default courier name if channel requires automatic assignment.
 * For Amazon orders: returns "Amazon ATS".
 * For others: returns null (waits for operator selection).
 */
export function getDefaultCourierForChannel(channel?: string | null): string | null {
  if (isAmazonChannel(channel)) {
    return "Amazon ATS";
  }
  return null;
}

/**
 * Spellings the main consignment app (and older data) uses for the same couriers, keyed by a
 * lower-case, space-collapsed form. Unknown names (e.g. "Local") are returned trimmed, unchanged.
 */
const COURIER_ALIASES: Record<string, string> = {
  "delhivery": "Delhivery One",
  "delhivery one": "Delhivery One",
  "delhivery b2b": "Delhivery One",
  "om": "OM Logistics",
  "om logistics": "OM Logistics",
  "om logistic": "OM Logistics",
  "omlogistics": "OM Logistics",
  "ekart": "Ekart",
  "ekart logistics": "Ekart",
  "e-kart": "Ekart",
  "amazon ats": "Amazon ATS",
  "amazon": "Amazon ATS",
  "ats": "Amazon ATS",
  "shiprocket": "Shiprocket Cargo",
  "shiprocket cargo": "Shiprocket Cargo",
  "local": "Local",
};

/** Canonical courier name (case/alias-insensitive); "" for empty input. */
export function normalizeCourierName(name?: string | null): string {
  const trimmed = name ? String(name).trim() : "";
  if (!trimmed) return "";
  const key = trimmed.toLowerCase().replace(/[\s_]+/g, " ");
  return COURIER_ALIASES[key] || trimmed;
}

/** Every known spelling of the same courier (for case-insensitive DB filters). */
export function getCourierSpellings(name?: string | null): string[] {
  const canonical = normalizeCourierName(name);
  if (!canonical) return [];
  const spellings = Object.keys(COURIER_ALIASES).filter((k) => COURIER_ALIASES[k] === canonical);
  return Array.from(new Set([canonical, String(name).trim(), ...spellings]));
}

/** True when two stored/requested courier names mean the same courier. */
export function isSameCourier(a?: string | null, b?: string | null): boolean {
  return normalizeCourierName(a).toLowerCase() === normalizeCourierName(b).toLowerCase();
}

/**
 * Returns the effective courier partner for display.
 * Empty → the channel default (Amazon ATS for Amazon); an allowed courier in any spelling → its
 * canonical name; anything else (e.g. "Local" set in the main app) → shown as stored, never hidden.
 */
export function getEffectiveCourierPartner(
  channel?: string | null,
  courierPartner?: string | null
): string | null {
  if (courierPartner && courierPartner.trim() !== "") {
    const normalized = normalizeCourierName(courierPartner);
    const allowed = getAllowedCouriersForChannel(channel);
    return allowed.includes(normalized) ? normalized : courierPartner.trim();
  }
  return getDefaultCourierForChannel(channel);
}

/**
 * Utility to format decimal values to exactly 2 decimal places (.00), preventing floating point artifacts.
 */
export function formatDecimalNumber(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return "";
  }
  return Number(val).toFixed(decimals);
}

/**
 * Server-side courier policy check (Golden Rules 4–6).
 * Empty → { ok: true, courier: null } (clears the courier); an allowed name in any case →
 * its canonical spelling; anything else → { ok: false } with the allowed list.
 */
export function resolveCourierForChannel(
  channel: string | null | undefined,
  requested: unknown
): { ok: true; courier: string | null } | { ok: false; allowed: string[] } {
  const name = normalizeCourierName(requested ? String(requested) : "");
  if (!name) return { ok: true, courier: null };
  const allowed = getAllowedCouriersForChannel(channel);
  const match = allowed.find((c) => c.toLowerCase() === name.toLowerCase());
  return match ? { ok: true, courier: match } : { ok: false, allowed };
}
