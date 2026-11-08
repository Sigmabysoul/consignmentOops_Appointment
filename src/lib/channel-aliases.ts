/**
 * Channel Normalization & Alias Matching for Appointment Desk
 * 
 * Ensures robust bi-directional channel matching between Consignment Operations
 * and the Logistics Appointment Desk, accounting for legacy channel formats
 * (e.g., "BLINKIT" -> "BLINKIT_STO", "FLIPKART" -> "FLIPKART_MINUTES", "AMAZON" -> "AMAZON_VC").
 */

export const Channel = {
  SWIGGY: "SWIGGY",
  BLINKIT_STO: "BLINKIT_STO",
  FLIPKART_MINUTES: "FLIPKART_MINUTES",
  FLIPKART_FBF: "FLIPKART_FBF",
  FKSB_FLIPKART: "FKSB_FLIPKART",
  AMAZON_VC: "AMAZON_VC",
  AMAZON_FBA: "AMAZON_FBA",
} as const;

export type Channel = string;

/**
 * Normalizes a channel code string by trimming, uppercasing, and converting spaces/hyphens to underscores.
 * Automatically maps legacy channel codes.
 */
export function normalizeChannelCode(channel?: unknown): string {
  if (!channel || typeof channel !== "string") return "";
  const code = channel.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (code === "BLINKIT") return Channel.BLINKIT_STO;
  if (code === "FLIPKART" || code === "FK_MINUTES") return Channel.FLIPKART_MINUTES;
  if (code === "AMAZON") return Channel.AMAZON_VC;
  return code;
}

/**
 * Returns all alias channel codes associated with a channel family
 */
export function getChannelAliases(channel: unknown): string[] {
  if (!channel || typeof channel !== "string") return [];
  const raw = channel.trim();
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  const norm = upper.replace(/[\s-]+/g, "_");
  const normLower = lower.replace(/[\s-]+/g, "_");
  const withSpaces = norm.replace(/_/g, " ");

  const set = new Set<string>([raw, upper, lower, norm, normLower, withSpaces]);

  if (norm === "BLINKIT_STO" || norm === "BLINKIT") {
    [
      "BLINKIT_STO",
      "BLINKIT STO",
      "BLINKIT-STO",
      "blinkit_sto",
      "blinkit sto",
      "Blinkit STO",
      "BLINKIT",
      "blinkit",
      "Blinkit",
    ].forEach((a) => set.add(a));
  } else if (norm === "FLIPKART_MINUTES" || norm === "FK_MINUTES") {
    [
      "FLIPKART_MINUTES",
      "FLIPKART MINUTES",
      "FLIPKART-MINUTES",
      "FK_MINUTES",
      "Flipkart Minutes",
      "flipkart_minutes",
      "flipkart minutes",
      "fk_minutes",
      "FLIPKART",
      "Flipkart",
      "flipkart",
    ].forEach((a) => set.add(a));
  } else if (norm === "FLIPKART_FBF" || norm === "FK_FBF") {
    [
      "FLIPKART_FBF",
      "FLIPKART FBF",
      "FLIPKART-FBF",
      "FK_FBF",
      "Flipkart FBF",
      "flipkart_fbf",
      "flipkart fbf",
      "fk_fbf",
    ].forEach((a) => set.add(a));
  } else if (norm === "FKSB_FLIPKART" || norm === "FKSB") {
    [
      "FKSB_FLIPKART",
      "FKSB FLIPKART",
      "FKSB-FLIPKART",
      "FKSB",
      "FKSB Flipkart",
      "fksb_flipkart",
      "fksb flipkart",
      "fksb",
    ].forEach((a) => set.add(a));
  } else if (norm === "FLIPKART") {
    [
      "FLIPKART",
      "Flipkart",
      "flipkart",
      "FLIPKART_MINUTES",
    ].forEach((a) => set.add(a));
  } else if (norm === "AMAZON_VC" || norm === "AMAZON_VENDOR_CENTRAL") {
    [
      "AMAZON_VC",
      "AMAZON VC",
      "AMAZON-VC",
      "AMAZON_VENDOR_CENTRAL",
      "Amazon VC",
      "amazon_vc",
      "amazon vc",
      "AMAZON",
      "Amazon",
      "amazon",
    ].forEach((a) => set.add(a));
  } else if (norm === "AMAZON_FBA") {
    [
      "AMAZON_FBA",
      "AMAZON FBA",
      "AMAZON-FBA",
      "Amazon FBA",
      "amazon_fba",
      "amazon fba",
    ].forEach((a) => set.add(a));
  } else if (norm === "AMAZON") {
    [
      "AMAZON",
      "Amazon",
      "amazon",
      "AMAZON_VC",
    ].forEach((a) => set.add(a));
  } else if (norm === "SWIGGY" || norm === "SWIGGY_INSTAMART") {
    [
      "SWIGGY",
      "SWIGGY_INSTAMART",
      "SWIGGY INSTAMART",
      "Swiggy",
      "Swiggy Instamart",
      "swiggy",
      "swiggy_instamart",
    ].forEach((a) => set.add(a));
  }

  return Array.from(set);
}

/**
 * Returns true if two channel codes match directly or via alias family
 */
export function channelsMatch(channelA?: unknown, channelB?: unknown): boolean {
  if (!channelA || !channelB) return false;
  if (typeof channelA !== "string" || typeof channelB !== "string") return false;
  if (channelA === "ALL" || channelB === "ALL") return true;

  const a = channelA.trim().toUpperCase();
  const b = channelB.trim().toUpperCase();
  if (a === b) return true;

  const normA = a.replace(/[\s-]+/g, "_");
  const normB = b.replace(/[\s-]+/g, "_");
  if (normA === normB) return true;

  const aliasesA = getChannelAliases(channelA);
  const aliasesB = getChannelAliases(channelB);
  return (
    aliasesA.some((alias) => aliasesB.includes(alias)) ||
    aliasesA.includes(b) ||
    aliasesB.includes(a)
  );
}
