import { AppointmentOrder } from "./types";
import { ALL_STATES } from "@/modules/pricing/om-logistics/state-zone-mapping";
import { OmDeliveryInput } from "@/modules/pricing/om-logistics/types";
import { extractBoxDimensionGroups } from "./dimension-helper";

/**
 * Intelligent Destination State Auto-Detector from Consignment Order data.
 * Checks deliveredTo address, warehouseAddress, warehouseName, and client data.
 */
export function detectStateFromOrder(order: any): string {
  if (!order) return "West Bengal (Kolkata)";

  const rawDeliveredTo =
    (order.customData as any)?.deliveredTo ||
    (order.customData as any)?.warehouseAddress ||
    order.warehouseAddress ||
    order.client?.address ||
    "";

  const rawWarehouse = order.warehouseName || "";
  const combined = `${rawDeliveredTo} ${rawWarehouse}`.toLowerCase();

  // 1. Kolkata Local vs Rest of West Bengal
  if (
    combined.includes("kolkata") ||
    combined.includes("calcutta") ||
    combined.includes("howrah") ||
    combined.includes("hooghly") ||
    combined.includes("dankuni") ||
    combined.includes("tiljala") ||
    /\b700\d{3}\b/.test(combined) ||
    /\b711\d{3}\b/.test(combined) ||
    /\b712\d{3}\b/.test(combined)
  ) {
    return "West Bengal (Kolkata)";
  }
  if (
    combined.includes("west bengal") ||
    /\bbengal\b/.test(combined) ||
    combined.includes("siliguri") ||
    combined.includes("asansol")
  ) {
    return "West Bengal (Other)";
  }

  // 2. Guwahati vs Rest of Assam
  if (combined.includes("guwahati") || combined.includes("dispur") || combined.includes("kamrup")) {
    return "Assam (Guwahati)";
  }
  if (combined.includes("assam")) {
    return "Assam (Other)";
  }

  // 3. Maharashtra & Major Hubs
  if (
    combined.includes("maharashtra") ||
    combined.includes("mumbai") ||
    combined.includes("bhiwandi") ||
    combined.includes("pune") ||
    combined.includes("nagpur") ||
    combined.includes("thane") ||
    combined.includes("navi mumbai") ||
    /\b4[0-4]\d{4}\b/.test(combined)
  ) {
    return "Maharashtra";
  }

  // 4. Delhi & NCR
  if (combined.includes("delhi") || combined.includes("new delhi") || /\b110\d{3}\b/.test(combined)) {
    return "Delhi";
  }

  // 5. Haryana (Kundli, Gurgaon, etc.)
  if (
    combined.includes("haryana") ||
    combined.includes("gurgaon") ||
    combined.includes("gurugram") ||
    combined.includes("kundli") ||
    combined.includes("faridabad") ||
    combined.includes("panipat") ||
    combined.includes("sonipat") ||
    /\b12[1-5]\d{3}\b/.test(combined) ||
    /\b13\d{4}\b/.test(combined)
  ) {
    return "Haryana";
  }

  // 6. Karnataka (Bangalore, etc.)
  if (
    combined.includes("karnataka") ||
    combined.includes("bangalore") ||
    combined.includes("bengaluru") ||
    combined.includes("hosur") ||
    /\b560\d{3}\b/.test(combined)
  ) {
    return "Karnataka";
  }

  // 7. Telangana (Hyderabad, etc.)
  if (
    combined.includes("telangana") ||
    combined.includes("hyderabad") ||
    combined.includes("secunderabad") ||
    /\b500\d{3}\b/.test(combined)
  ) {
    return "Telangana";
  }

  // 8. Tamil Nadu (Chennai, etc.)
  if (
    combined.includes("tamil nadu") ||
    combined.includes("chennai") ||
    combined.includes("coimbatore") ||
    /\b600\d{3}\b/.test(combined)
  ) {
    return "Tamil Nadu";
  }

  // 9. Gujarat (Ahmedabad, Surat, etc.)
  if (
    combined.includes("gujarat") ||
    combined.includes("ahmedabad") ||
    combined.includes("surat") ||
    combined.includes("vadodara") ||
    /\b380\d{3}\b/.test(combined)
  ) {
    return "Gujarat";
  }

  // 10. Uttar Pradesh (Noida, Ghaziabad, Lucknow, etc.)
  if (
    combined.includes("uttar pradesh") ||
    combined.includes("noida") ||
    combined.includes("greater noida") ||
    combined.includes("ghaziabad") ||
    combined.includes("lucknow") ||
    combined.includes("kanpur") ||
    /\b201\d{3}\b/.test(combined) ||
    /\b226\d{3}\b/.test(combined)
  ) {
    return "Uttar Pradesh";
  }

  // 11. Rajasthan (Jaipur, etc.)
  if (combined.includes("rajasthan") || combined.includes("jaipur")) {
    return "Rajasthan";
  }

  // 12. Punjab (Ludhiana, etc.)
  if (combined.includes("punjab") || combined.includes("ludhiana") || combined.includes("amritsar") || combined.includes("mohali")) {
    return "Punjab";
  }

  // 13. Madhya Pradesh (Indore, Bhopal, etc.)
  if (combined.includes("madhya pradesh") || combined.includes("indore") || combined.includes("bhopal")) {
    return "Madhya Pradesh";
  }

  // 14. Odisha (Bhubaneswar, Cuttack, etc.)
  if (combined.includes("odisha") || combined.includes("orissa") || combined.includes("bhubaneswar")) {
    return "Odisha";
  }

  // 15. Bihar (Patna, etc.)
  if (combined.includes("bihar") || combined.includes("patna")) {
    return "Bihar";
  }

  // 16. Jharkhand (Ranchi, Jamshedpur)
  if (combined.includes("jharkhand") || combined.includes("ranchi") || combined.includes("jamshedpur")) {
    return "Jharkhand";
  }

  // 17. Kerala (Kochi, Trivandrum)
  if (combined.includes("kerala") || combined.includes("kochi") || combined.includes("cochin")) {
    return "Kerala";
  }

  // 18. Andhra Pradesh (Vijayawada, Visakhapatnam)
  if (combined.includes("andhra") || combined.includes("vijayawada") || combined.includes("visakhapatnam")) {
    return "Andhra Pradesh";
  }

  // Direct check against all states
  for (const s of ALL_STATES) {
    if (combined.includes(s.toLowerCase())) {
      return s;
    }
  }

  return "West Bengal (Kolkata)";
}

/**
 * Calculates total shipment weight from order box dimension groups or explicit weight fields.
 */
export function getOrderTotalWeightKg(order: any): number {
  if (!order) return 50;

  // 1. Direct boxDimensionGroups check if already provided on order
  if (Array.isArray(order.boxDimensionGroups) && order.boxDimensionGroups.length > 0) {
    let sum = 0;
    for (const g of order.boxDimensionGroups) {
      const count =
        typeof g.boxCount === "number"
          ? g.boxCount
          : typeof g.count === "number"
          ? g.count
          : 1;
      const wt =
        typeof g.weightKg === "number"
          ? g.weightKg
          : typeof g.weight === "number"
          ? g.weight
          : 0;
      sum += count * wt;
    }
    if (sum > 0) return Number(sum.toFixed(2));
  }

  // 2. Check explicit order weight
  let calculatedWeight = 0;
  if (typeof order.weightKg === "number" && order.weightKg > 0) {
    const boxCount = typeof order.boxCount === "number" && order.boxCount > 0 ? order.boxCount : 1;
    calculatedWeight += order.weightKg * boxCount;
  }

  if (typeof order.remainderWeightKg === "number" && order.remainderWeightKg > 0) {
    calculatedWeight += order.remainderWeightKg;
  }

  if (calculatedWeight > 0) {
    return Number(calculatedWeight.toFixed(2));
  }

  // 2. Compute from dimension groups
  const groups = extractBoxDimensionGroups(order);
  let groupSum = 0;
  for (const g of groups) {
    if (typeof g.weightKg === "number" && g.weightKg > 0) {
      groupSum += g.weightKg * (g.boxCount || 1);
    }
  }

  if (groupSum > 0) {
    return Number(groupSum.toFixed(2));
  }

  // 3. Fallback: estimate roughly based on total boxes (e.g. 15 kg per box) or default
  const totalBoxes = order.boxCount || 1;
  return totalBoxes * 12;
}

/**
 * Extracts total invoice value from order data or items calculation.
 */
export function getOrderInvoiceValue(order: any): number {
  if (!order) return 0;

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

/**
 * Builds ready-to-use initial logistics input for the delivery estimator.
 */
export function getInitialLogisticsInput(order: AppointmentOrder): OmDeliveryInput {
  const state = detectStateFromOrder(order);
  const weightKg = getOrderTotalWeightKg(order);
  const invoiceValue = getOrderInvoiceValue(order);

  return {
    state,
    weightKg: weightKg > 0 ? weightKg : 50,
    mode: "surface",
    odaDistanceKm: 0,
    appointmentDelivery: true, // deliveries are appointment-based by default
    rovCover: invoiceValue > 0 ? "shipper" : "none",
    invoiceValue,
  };
}
