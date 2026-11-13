/**
 * State to Zone mapping for OM Logistics Delivery Cost Estimator.
 * Single source of truth for state strings across estimator, booking form, and saved bookings.
 */

export const DEFAULT_STATE_ZONE_MAP: Record<string, string> = {
  // East-Kolkata (Local)
  "West Bengal (Kolkata)": "East-Kolkata",

  // East
  "West Bengal (Other)": "East",
  "Odisha": "East",
  "Jharkhand": "East",
  "Bihar": "East",

  // West
  "Maharashtra": "West",
  "Gujarat": "West",
  "Goa": "West",

  // South
  "Tamil Nadu": "South",
  "Karnataka": "South",
  "Kerala": "South",
  "Andhra Pradesh": "South",
  "Telangana": "South",
  "Puducherry": "South",

  // North
  "Delhi": "North",
  "Haryana": "North",
  "Punjab": "North",
  "Uttar Pradesh": "North",
  "Uttarakhand": "North",
  "Himachal Pradesh": "North",
  "Jammu & Kashmir": "North",
  "Chandigarh": "North",
  "Rajasthan": "North",

  // Central
  "Madhya Pradesh": "Central",
  "Chhattisgarh": "Central",

  // Guwahati
  "Assam (Guwahati)": "Guwahati",

  // Northeast
  "Assam (Other)": "Northeast",

  // 7 Sister
  "Meghalaya": "7 Sister",
  "Tripura": "7 Sister",
  "Manipur": "7 Sister",
  "Mizoram": "7 Sister",
  "Nagaland": "7 Sister",
  "Arunachal Pradesh": "7 Sister",

  // Special Zone
  "Sikkim": "Special Zone",
  "Andaman & Nicobar": "Special Zone",
  "Lakshadweep": "Special Zone",
  "Ladakh": "Special Zone",
};

/**
 * Complete list of supported state dropdown choices in alphabetical order,
 * with Kolkata and Guwahati explicitly separated as required.
 */
export const ALL_STATES: string[] = [
  "Andaman & Nicobar",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam (Guwahati)",
  "Assam (Other)",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra & Nagar Haveli and Daman & Diu", // Placed here as an option, but unmapped in default table until configured
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu & Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal (Kolkata)",
  "West Bengal (Other)",
];

/**
 * Resolves the OM Logistics Zone for a given state string.
 * Returns null if the state is not mapped.
 */
export function getZoneForState(
  state: string,
  customMap?: Record<string, string>
): string | null {
  if (!state || typeof state !== "string") return null;
  const cleanState = state.trim();
  const map = customMap || DEFAULT_STATE_ZONE_MAP;

  if (cleanState in map) {
    return map[cleanState];
  }

  // Case-insensitive fallback
  const lower = cleanState.toLowerCase();
  for (const [s, z] of Object.entries(map)) {
    if (s.toLowerCase() === lower) {
      return z;
    }
  }

  return null;
}
