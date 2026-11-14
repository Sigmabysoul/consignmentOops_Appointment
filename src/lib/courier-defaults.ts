/**
 * Channel-specific Courier Assignment Rules per plan.md:
 * 1. All shipments are done by land (no air travel).
 * 2. Amazon VC & FBA: Courier option is strictly ONLY "Amazon ATS".
 * 3. Flipkart FBF & FKSB: Courier option is strictly ONLY "Ekart".
 * 4. The rest (Swiggy, Blinkit, Flipkart Minutes, etc.): Courier options are strictly ONLY "Delhivery One" and "OM Logistics".
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
 * - Rest (Swiggy, Blinkit, Flipkart Minutes, etc.): ["Delhivery One", "OM Logistics"]
 */
export function getAllowedCouriersForChannel(channel?: string | null): string[] {
  if (isAmazonChannel(channel)) {
    return ["Amazon ATS"];
  }
  if (isFlipkartFbfOrFksb(channel)) {
    return ["Ekart"];
  }
  // Rest: Swiggy, Blinkit, Flipkart Minutes, etc.
  return ["Delhivery One", "OM Logistics"];
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
 * Returns the effective courier partner for display and persistence.
 */
export function getEffectiveCourierPartner(
  channel?: string | null,
  courierPartner?: string | null
): string | null {
  if (courierPartner && courierPartner.trim() !== "") {
    // If the assigned courier is not allowed for this channel, enforce channel rules
    const allowed = getAllowedCouriersForChannel(channel);
    if (allowed.includes(courierPartner.trim())) {
      return courierPartner.trim();
    }
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
