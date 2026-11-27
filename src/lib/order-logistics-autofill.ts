import { AppointmentOrder } from "./types";
import { ALL_STATES } from "@/modules/pricing/om-logistics/state-zone-mapping";
import { OmDeliveryInput } from "@/modules/pricing/om-logistics/types";
import { summarizeCartons, weightToKgFactor } from "./dimension-helper";

/**
 * Indian PIN code prefix → destination state label (labels match ALL_STATES).
 * Longest prefix wins (5 → 4 → 3 → 2 digits). Sources: India Post PIN zone/circle table.
 * Kolkata metro (700/711/712) and Guwahati (781) are split out because OM Logistics prices them
 * as separate zones.
 */
const PIN_PREFIX_STATE: Record<string, string> = {
  // 4/5-digit overrides
  "6050": "Puducherry",
  "6051": "Puducherry",
  "6825": "Lakshadweep",
  "39621": "Dadra & Nagar Haveli and Daman & Diu",
  "39622": "Dadra & Nagar Haveli and Daman & Diu",
  "39623": "Dadra & Nagar Haveli and Daman & Diu",
  "39624": "Dadra & Nagar Haveli and Daman & Diu",
  // 3-digit overrides
  "160": "Chandigarh",
  "194": "Ladakh",
  "246": "Uttarakhand",
  "248": "Uttarakhand",
  "249": "Uttarakhand",
  "262": "Uttarakhand",
  "263": "Uttarakhand",
  "403": "Goa",
  "700": "West Bengal (Kolkata)",
  "711": "West Bengal (Kolkata)",
  "712": "West Bengal (Kolkata)",
  "737": "Sikkim",
  "744": "Andaman & Nicobar",
  "781": "Assam (Guwahati)",
  "790": "Arunachal Pradesh",
  "791": "Arunachal Pradesh",
  "792": "Arunachal Pradesh",
  "793": "Meghalaya",
  "794": "Meghalaya",
  "795": "Manipur",
  "796": "Mizoram",
  "797": "Nagaland",
  "798": "Nagaland",
  "799": "Tripura",
  "814": "Jharkhand",
  "815": "Jharkhand",
  "816": "Jharkhand",
  "822": "Jharkhand",
  "825": "Jharkhand",
  "826": "Jharkhand",
  "827": "Jharkhand",
  "828": "Jharkhand",
  "829": "Jharkhand",
  "831": "Jharkhand",
  "832": "Jharkhand",
  "833": "Jharkhand",
  "834": "Jharkhand",
  "835": "Jharkhand",
  // 2-digit circles
  "11": "Delhi",
  "12": "Haryana",
  "13": "Haryana",
  "14": "Punjab",
  "15": "Punjab",
  "17": "Himachal Pradesh",
  "18": "Jammu & Kashmir",
  "19": "Jammu & Kashmir",
  "20": "Uttar Pradesh",
  "21": "Uttar Pradesh",
  "22": "Uttar Pradesh",
  "23": "Uttar Pradesh",
  "24": "Uttar Pradesh",
  "25": "Uttar Pradesh",
  "26": "Uttar Pradesh",
  "27": "Uttar Pradesh",
  "28": "Uttar Pradesh",
  "30": "Rajasthan",
  "31": "Rajasthan",
  "32": "Rajasthan",
  "33": "Rajasthan",
  "34": "Rajasthan",
  "36": "Gujarat",
  "37": "Gujarat",
  "38": "Gujarat",
  "39": "Gujarat",
  "40": "Maharashtra",
  "41": "Maharashtra",
  "42": "Maharashtra",
  "43": "Maharashtra",
  "44": "Maharashtra",
  "45": "Madhya Pradesh",
  "46": "Madhya Pradesh",
  "47": "Madhya Pradesh",
  "48": "Madhya Pradesh",
  "49": "Chhattisgarh",
  "50": "Telangana",
  "51": "Andhra Pradesh",
  "52": "Andhra Pradesh",
  "53": "Andhra Pradesh",
  "56": "Karnataka",
  "57": "Karnataka",
  "58": "Karnataka",
  "59": "Karnataka",
  "60": "Tamil Nadu",
  "61": "Tamil Nadu",
  "62": "Tamil Nadu",
  "63": "Tamil Nadu",
  "64": "Tamil Nadu",
  "67": "Kerala",
  "68": "Kerala",
  "69": "Kerala",
  "70": "West Bengal (Other)",
  "71": "West Bengal (Other)",
  "72": "West Bengal (Other)",
  "73": "West Bengal (Other)",
  "74": "West Bengal (Other)",
  "75": "Odisha",
  "76": "Odisha",
  "77": "Odisha",
  "78": "Assam (Other)",
  "80": "Bihar",
  "81": "Bihar",
  "82": "Bihar",
  "83": "Jharkhand",
  "84": "Bihar",
  "85": "Bihar",
};

/** State label for a 6-digit Indian PIN code, or null when the prefix is not a known circle. */
export function stateFromPincode(pin: string | null | undefined): string | null {
  const p = String(pin ?? "").replace(/\s/g, "");
  if (!/^[1-9]\d{5}$/.test(p)) return null;
  for (const len of [5, 4, 3, 2]) {
    const hit = PIN_PREFIX_STATE[p.slice(0, len)];
    if (hit) return hit;
  }
  return null;
}

/** Last 6-digit PIN code in a text ("… Kolkata 700 091" → "700091"), or "". */
export function findPincode(text: string | null | undefined): string {
  const all = String(text ?? "").match(/(?<!\d)[1-9]\d{2}\s?\d{3}(?!\d)/g);
  return all ? all[all.length - 1].replace(/\s/g, "") : "";
}

/**
 * Keyword → state rules, checked in order with WORD BOUNDARIES so "Delhivery Indore FC" never
 * matches Delhi (it matches Indore → Madhya Pradesh). City-specific rules come before
 * state-name rules, so "Kolkata, West Bengal" resolves to the Kolkata zone.
 */
const KEYWORD_RULES: Array<[RegExp, string]> = [
  [/\b(kolkata|calcutta|howrah|hooghly|hugli|dankuni|tiljala|salt\s*lake|new\s*town)\b/, "West Bengal (Kolkata)"],
  [/\b(west\s*bengal|bengal|siliguri|asansol|durgapur|kharagpur)\b/, "West Bengal (Other)"],
  [/\b(guwahati|gauhati|dispur|kamrup)\b/, "Assam (Guwahati)"],
  [/\bassam\b/, "Assam (Other)"],
  [/\b(maharashtra|mumbai|bombay|bhiwandi|pune|nagpur|thane|navi\s*mumbai|nashik|aurangabad)\b/, "Maharashtra"],
  [/\b(new\s+)?delhi\b/, "Delhi"],
  [/\b(haryana|gurgaon|gurugram|kundli|faridabad|panipat|sonipat|sonepat|bahadurgarh|rewari|manesar)\b/, "Haryana"],
  [/\b(karnataka|bangalore|bengaluru|mysore|mysuru|hubli|hosur)\b/, "Karnataka"],
  [/\b(telangana|hyderabad|secunderabad)\b/, "Telangana"],
  [/\b(tamil\s*nadu|chennai|madras|coimbatore|madurai)\b/, "Tamil Nadu"],
  [/\b(gujarat|ahmedabad|surat|vadodara|baroda|rajkot)\b/, "Gujarat"],
  [/\b(uttar\s*pradesh|noida|greater\s*noida|ghaziabad|lucknow|kanpur|agra|varanasi|meerut)\b/, "Uttar Pradesh"],
  [/\b(uttarakhand|dehradun|haridwar|rudrapur|haldwani)\b/, "Uttarakhand"],
  [/\b(rajasthan|jaipur|jodhpur|udaipur)\b/, "Rajasthan"],
  [/\b(punjab|ludhiana|amritsar|mohali|jalandhar)\b/, "Punjab"],
  [/\bchandigarh\b/, "Chandigarh"],
  [/\b(madhya\s*pradesh|indore|bhopal|gwalior|jabalpur)\b/, "Madhya Pradesh"],
  [/\b(chhattisgarh|raipur|bilaspur)\b/, "Chhattisgarh"],
  [/\b(odisha|orissa|bhubaneswar|cuttack)\b/, "Odisha"],
  [/\b(jharkhand|ranchi|jamshedpur|dhanbad)\b/, "Jharkhand"],
  [/\b(bihar|patna)\b/, "Bihar"],
  [/\b(kerala|kochi|cochin|trivandrum|thiruvananthapuram|kozhikode)\b/, "Kerala"],
  [/\b(andhra\s*pradesh|andhra|vijayawada|visakhapatnam|vizag|guntur)\b/, "Andhra Pradesh"],
  [/\b(goa|panaji|verna)\b/, "Goa"],
  [/\b(puducherry|pondicherry)\b/, "Puducherry"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Destination state (OM zone label from ALL_STATES) detected from the order's delivery address
 * and warehouse name. Returns null when nothing matches — the operator must then pick the state
 * (no silent default: a wrong zone means a wrong quote).
 *
 * Order: PIN code in the delivery address → keywords (word-boundary) in address + warehouse
 * name → exact state names → PIN code in the warehouse name.
 */
export function detectStateFromOrder(order: any): string | null {
  if (!order) return null;

  const rawDeliveredTo =
    (order.customData as any)?.deliveredTo ||
    (order.customData as any)?.warehouseAddress ||
    order.warehouseAddress ||
    order.client?.address ||
    "";
  const rawWarehouse = order.warehouseName || "";

  const addressPinState = stateFromPincode(findPincode(rawDeliveredTo));
  if (addressPinState) return addressPinState;

  const combined = `${rawDeliveredTo} ${rawWarehouse}`.toLowerCase();
  for (const [re, label] of KEYWORD_RULES) {
    if (re.test(combined)) return label;
  }
  for (const s of ALL_STATES) {
    const plain = s.replace(/\s*\(.*\)\s*$/, "").toLowerCase();
    if (new RegExp(`\\b${escapeRe(plain)}\\b`).test(combined)) {
      // "Assam (Guwahati)" / "West Bengal (Kolkata)" style labels need the city: use the "Other" label.
      const other = ALL_STATES.find((x) => x.toLowerCase() === `${plain} (other)`);
      return /\(/.test(s) ? other ?? s : s;
    }
  }

  return stateFromPincode(findPincode(rawWarehouse));
}

/**
 * Delivery cities seen on platform warehouse addresses (Blinkit / Swiggy / Flipkart / Amazon
 * feeders and FCs), as [canonical name, aliases]. Canonical names are what carriers expect.
 */
const CITY_NAMES: Array<[string, string[]]> = [
  ["Kolkata", ["kolkata", "calcutta"]],
  ["Howrah", ["howrah"]],
  ["Siliguri", ["siliguri"]],
  ["Durgapur", ["durgapur"]],
  ["Asansol", ["asansol"]],
  ["Guwahati", ["guwahati", "gauhati"]],
  ["Mumbai", ["mumbai", "bombay"]],
  ["Navi Mumbai", ["navi mumbai"]],
  ["Thane", ["thane"]],
  ["Bhiwandi", ["bhiwandi"]],
  ["Pune", ["pune"]],
  ["Nagpur", ["nagpur"]],
  ["Nashik", ["nashik"]],
  ["New Delhi", ["new delhi"]],
  ["Delhi", ["delhi"]],
  ["Gurugram", ["gurugram", "gurgaon"]],
  ["Faridabad", ["faridabad"]],
  ["Sonipat", ["sonipat", "sonepat", "kundli"]],
  ["Bahadurgarh", ["bahadurgarh"]],
  ["Manesar", ["manesar"]],
  ["Noida", ["noida", "greater noida"]],
  ["Ghaziabad", ["ghaziabad"]],
  ["Lucknow", ["lucknow"]],
  ["Kanpur", ["kanpur"]],
  ["Agra", ["agra"]],
  ["Varanasi", ["varanasi"]],
  ["Meerut", ["meerut"]],
  ["Dehradun", ["dehradun"]],
  ["Jaipur", ["jaipur"]],
  ["Jodhpur", ["jodhpur"]],
  ["Udaipur", ["udaipur"]],
  ["Ludhiana", ["ludhiana"]],
  ["Amritsar", ["amritsar"]],
  ["Mohali", ["mohali"]],
  ["Jalandhar", ["jalandhar"]],
  ["Chandigarh", ["chandigarh"]],
  ["Bengaluru", ["bengaluru", "bangalore"]],
  ["Mysuru", ["mysuru", "mysore"]],
  ["Hosur", ["hosur"]],
  ["Hyderabad", ["hyderabad", "secunderabad"]],
  ["Chennai", ["chennai", "madras"]],
  ["Coimbatore", ["coimbatore"]],
  ["Madurai", ["madurai"]],
  ["Kochi", ["kochi", "cochin"]],
  ["Thiruvananthapuram", ["thiruvananthapuram", "trivandrum"]],
  ["Kozhikode", ["kozhikode", "calicut"]],
  ["Vijayawada", ["vijayawada"]],
  ["Visakhapatnam", ["visakhapatnam", "vizag"]],
  ["Ahmedabad", ["ahmedabad"]],
  ["Surat", ["surat"]],
  ["Vadodara", ["vadodara", "baroda"]],
  ["Rajkot", ["rajkot"]],
  ["Indore", ["indore"]],
  ["Bhopal", ["bhopal"]],
  ["Raipur", ["raipur"]],
  ["Bhubaneswar", ["bhubaneswar"]],
  ["Cuttack", ["cuttack"]],
  ["Ranchi", ["ranchi"]],
  ["Jamshedpur", ["jamshedpur"]],
  ["Patna", ["patna"]],
  ["Goa", ["panaji", "verna"]],
];

const STATE_WORDS = new Set(
  ALL_STATES.map((s) => s.replace(/\s*\(.*\)\s*$/, "").toLowerCase()).concat(["india", "pin", "pincode"])
);

/**
 * Destination city for carrier forms, read from the delivery address, then the warehouse name.
 * A known city name wins (the LAST one in the address: addresses run street → city → state → PIN);
 * otherwise the comma part just before "State PIN". "" when nothing fits — the operator types it.
 */
export function detectCityFromOrder(order: any): string {
  if (!order) return "";
  const address = String(
    (order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.warehouseAddress || order.client?.address || ""
  );
  const lastKnownCity = (text: string): string => {
    const t = text.toLowerCase();
    let best = { at: -1, len: 0, name: "" };
    for (const [name, aliases] of CITY_NAMES) {
      for (const a of aliases) {
        const re = new RegExp(`\\b${escapeRe(a)}\\b`, "g");
        for (const m of t.matchAll(re)) {
          const end = (m.index ?? -1) + a.length;
          // The match ending last wins; ending at the same spot, the longer alias wins ("new delhi" over "delhi").
          if (end > best.at || (end === best.at && a.length > best.len)) best = { at: end, len: a.length, name };
        }
      }
    }
    return best.name;
  };

  const known = lastKnownCity(address);
  if (known) return known;

  // "…, Faridabad, Haryana 121006": the comma part before the one holding the PIN code.
  const pin = findPincode(address);
  if (pin) {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    const pinIdx = parts.findIndex((p) => p.replace(/\s/g, "").includes(pin));
    for (let i = pinIdx; i >= Math.max(0, pinIdx - 2); i--) {
      let text = parts[i].replace(/(?<!\d)[1-9]\d{2}\s?\d{3}(?!\d)/g, " ").toLowerCase();
      for (const w of STATE_WORDS) text = text.replace(new RegExp(`\\b${escapeRe(w)}\\b`, "g"), " ");
      const candidate = text.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
      if (candidate.length >= 3 && candidate.split(" ").length <= 3) {
        return candidate.replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
  }

  return lastKnownCity(String(order.warehouseName || ""));
}

/**
 * Total shipment weight (kg, exact 2 dp).
 * App 1 stores weightKg as the ORDER TOTAL (full boxes + remainder carton), so the total is the
 * sum of the carton groups built by extractBoxDimensionGroups — which equals order.weightKg for
 * order-level data and Σ item weights for multi-item orders. Never weightKg × boxCount.
 * Returns 0 when the order carries no weight at all (the estimator then needs operator input).
 */
export function getOrderTotalWeightKg(order: any): number {
  if (!order) return 0;
  const summary = summarizeCartons(order);
  if (summary.totalWeightKg !== null && summary.totalWeightKg > 0) return summary.totalWeightKg;
  const direct = typeof order.weightKg === "number" && order.weightKg > 0 ? order.weightKg * weightToKgFactor(order.weightUnit) : 0;
  return direct > 0 ? Number(direct.toFixed(2)) : 0;
}

/**
 * Extracts total invoice value from order data or items calculation.
 */
export function getOrderInvoiceValue(order: any): number {
  if (!order) return 0;

  // Read from the uploaded tax invoice (documents route) — the source of truth when present.
  const fromInvoice = (order.customData as any)?.invoice?.value;
  if (typeof fromInvoice === "number" && fromInvoice > 0) return Number(fromInvoice.toFixed(2));

  // Check explicit invoice amount if present on order or in customData
  const rawVal =
    order.invoiceValue ??
    order.invoiceAmount ??
    order.totalAmount ??
    (order.customData as any)?.invoiceValue ??
    (order.customData as any)?.invoiceAmount ??
    (order.customData as any)?.totalAmount;

  if (typeof rawVal === "number" && rawVal > 0) {
    return rawVal;
  }
  if (typeof rawVal === "string" && !isNaN(parseFloat(rawVal))) {
    return parseFloat(rawVal);
  }

  // Compute from line items if present
  if (Array.isArray(order.items) && order.items.length > 0) {
    let sum = 0;
    for (const it of order.items) {
      const qty = it.totalQty || 1;
      const rate = it.unitCost || it.mrp || 0;
      sum += qty * rate;
    }
    if (sum > 0) return Math.round(sum);
  }

  return 0;
}

/** The uploaded tax invoice the invoice value was read from, if any. */
export function getOrderInvoiceSource(order: any): { number: string | null; fileName: string | null } | null {
  const inv = (order?.customData as any)?.invoice;
  if (!inv || typeof inv.value !== "number" || !(inv.value > 0)) return null;
  return { number: typeof inv.number === "string" ? inv.number : null, fileName: typeof inv.fileName === "string" ? inv.fileName : null };
}

/**
 * Builds ready-to-use initial logistics input for the delivery estimator.
 */
export function getInitialLogisticsInput(order: AppointmentOrder): OmDeliveryInput {
  // "" = not detected: the booking UI requires the operator to choose the state.
  const state = detectStateFromOrder(order) ?? "";
  const weightKg = getOrderTotalWeightKg(order);
  const invoiceValue = getOrderInvoiceValue(order);

  return {
    state,
    // 0 = unknown: the operator must enter the weight (no invented default that prices a fake load).
    weightKg: weightKg > 0 ? weightKg : 0,
    mode: "surface",
    odaDistanceKm: 0,
    appointmentDelivery: true, // deliveries are appointment-based by default
    rovCover: "shipper", // owner's (shipper) risk is the default; carrier risk or none only by choice
    invoiceValue,
  };
}
