/**
 * Channel-specific Courier Assignment Rules:
 * - Amazon (VC / FBA): "Amazon ATS" by default.
 * - Flipkart FBF & FKSB: Ekart is the default/recommended courier, but NOT auto-selected (waits for user selection).
 * - Only 4 approved couriers in the ecosystem:
 *   1. OM Logistics
 *   2. Delhivery One
 *   3. Ekart
 *   4. Amazon ATS
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
 * Returns default courier name if channel requires automatic assignment.
 * For Amazon orders: returns "Amazon ATS".
 * For Flipkart FBF / FKSB: returns null (waits for operator selection).
 */
export function getDefaultCourierForChannel(channel?: string | null): string | null {
  if (isAmazonChannel(channel)) {
    return "Amazon ATS";
  }
  return null;
}

/**
 * Returns the effective courier partner for display and persistence.
 */
export function getEffectiveCourierPartner(
  channel?: string | null,
  courierPartner?: string | null
): string | null {
  if (courierPartner && courierPartner.trim() !== "") {
    return courierPartner.trim();
  }
  return getDefaultCourierForChannel(channel);
}
