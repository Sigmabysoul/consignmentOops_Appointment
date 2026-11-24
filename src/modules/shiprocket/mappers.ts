/**
 * Typed views of Shiprocket Cargo responses, written from the documented response schemas
 * (api_docs/shiprocket_cargo_openapi.json). Defensive: unknown / missing fields map to null.
 */
import type {
  ShiprocketCarrierOption,
  ShiprocketChargeLine,
  ShiprocketQuote,
  ShiprocketStatusEntry,
} from "@/lib/shiprocket-types";

const obj = (v: unknown): Record<string, any> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as any) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && Number.isInteger(n) ? n : null;
};
const money = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Number(n.toFixed(2));
};
/** "Estimated Delivery Date not found" style placeholders → null. */
const dateish = (v: unknown): string | null => {
  const s = str(v);
  return s && /\d{4}-\d{2}-\d{2}/.test(s) ? s : null;
};

const CHARGE_LABELS: Record<string, string> = {
  freight: "Freight",
  fsc: "Fuel surcharge",
  awb_charges: "Docket / AWB",
  rov: "Risk of value (ROV)",
  oda: "ODA",
  opa: "OPA",
  fm_charges: "First-mile",
  lm_charges: "Last-mile",
  handling_charges: "Handling",
  green_tax: "Green tax",
  holiday_charges: "Holiday",
  appointment_delivery_charges: "Appointment delivery",
  pickup_appointment_charges: "Pickup appointment",
  time_bound_pickup_charges: "Time-bound pickup",
  time_bound_delivery_charges: "Time-bound delivery",
  to_pay_charges: "To-pay",
  rts: "RTS",
  fpl: "FPL",
  min_waybill_charges: "Minimum waybill",
};

/** POST /api/shipment/charges/ → serviceable carriers, cheapest first. Empty body = none. */
export function mapCharges(body: unknown): ShiprocketQuote[] {
  const root = obj(body);
  if (!root) return [];
  const quotes: ShiprocketQuote[] = [];
  for (const [key, value] of Object.entries(root)) {
    const c = obj(value);
    if (!c || key === "success") continue;
    const w = obj(c.working) || {};
    const lines: ShiprocketChargeLine[] = Object.entries(CHARGE_LABELS)
      .map(([k, label]) => ({ label, amount: money(w[k]) ?? 0 }))
      .filter((l) => l.amount !== 0);
    const total = money(c.rates) ?? money(w.grand_total);
    const mode = str(c.mode_name);
    if (mode && mode.toLowerCase() !== "surface") continue; // land only — never offer air
    quotes.push({
      key,
      deliveryPartner: str(c.delivery_partner) || str(c.common_name) || key,
      transporterName: str(c.transporter_name),
      deliveryPartnerId: int(c.id),
      modeId: int(c.mode_id),
      modeName: mode,
      total,
      gst: money(w.gst),
      subtotal: money(w.total),
      ratePerKg: money(w.rate),
      zone: [str(w.sender_zone), str(w.recipient_zone)].filter(Boolean).join(" → ") || null,
      chargeableWeightKg: num(w.chargeable_weight),
      lines,
      tatDays: int(c.tat),
      pickupDate: dateish(c.pickup_date),
      logo: str(c.logo),
    });
  }
  return quotes.sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
}

function carrierFrom(c: Record<string, any>, fallbackPickup: string | null): ShiprocketCarrierOption | null {
  const deliveryPartnerId = int(c.delivery_partner_id);
  const modeId = int(c.mode_id);
  if (deliveryPartnerId === null || modeId === null) return null;
  const modeName = str(c.mode_name) ?? str(c.mode);
  if (modeName && modeName.toLowerCase() !== "surface") return null; // land only
  return {
    deliveryPartnerId,
    deliveryPartnerName: str(c.delivery_partner_name) || `Carrier ${deliveryPartnerId}`,
    modeId,
    modeName,
    transporterId: str(c.transportar_id),
    tatDays: int(c.tat_days),
    isOda: typeof c.is_oda === "boolean" ? c.is_oda : null,
    scheduledPickupDate: dateish(c.scheduled_pickup_date) ?? fallbackPickup,
  };
}

/** POST /api/external/order_creation/ → order id + carrier choices (auto-selected or carrier_list). */
export function mapOrderCreation(body: unknown): { orderId: number | null; carriers: ShiprocketCarrierOption[]; message: string | null } {
  const b = obj(body) || {};
  const pickup = dateish(b.scheduled_pickup_date);
  const carriers: ShiprocketCarrierOption[] = [];
  if (Array.isArray(b.carrier_list)) {
    for (const c of b.carrier_list) {
      const o = obj(c) && carrierFrom(c, pickup);
      if (o) carriers.push(o);
    }
  } else {
    const auto = carrierFrom(b, pickup);
    if (auto) carriers.push(auto);
  }
  return { orderId: int(b.order_id), carriers, message: str(b.message) };
}

export interface MappedShipment {
  shipmentId: number | null;
  waybill: string | null;
  lrn: string | null;
  childWaybills: string[];
  labelUrl: string | null;
  podUrl: string | null;
  status: string | null;
  statusDp: string | null;
  scheduledPickupDate: string | null;
  deliveryPartner: string | null;
  edd: string | null;
  deliveredAt: string | null;
  apiError: string | null;
}

/** Shipment creation (sync or async) and GET get_shipment share these fields. */
export function mapShipment(body: unknown): MappedShipment {
  const b = obj(body) || {};
  const dp = obj(b.delivery_partner) || obj(obj(b.mode)?.delivery_partner);
  return {
    shipmentId: int(b.id),
    waybill: str(b.waybill_no),
    lrn: str(b.lrn),
    childWaybills: Array.isArray(b.child_waybill_nos) ? b.child_waybill_nos.map(str).filter(Boolean) as string[] : [],
    labelUrl: str(b.label_url),
    podUrl: str(b.pod_url),
    status: str(b.status),
    statusDp: str(b.status_dp),
    scheduledPickupDate: dateish(b.scheduled_pickup_date) ?? dateish(b.pickup_for_date),
    deliveryPartner: str(dp?.name),
    edd: dateish(b.edd),
    deliveredAt: dateish(b.add),
    apiError: str(b.api_error),
  };
}

/** GET /api/shipment/track/{waybill}/ */
export function mapTrack(body: unknown): {
  status: string | null;
  statusDp: string | null;
  location: string | null;
  edd: string | null;
  deliveredAt: string | null;
  history: ShiprocketStatusEntry[];
} {
  const root = Array.isArray(body) ? obj(body[0]) : obj(body);
  const b = root || {};
  const history: ShiprocketStatusEntry[] = Array.isArray(b.status_history)
    ? b.status_history
        .map((h: unknown) => obj(h))
        .filter(Boolean)
        .map((h: any) => ({
          status: str(h.status) || "",
          location: str(h.location),
          remarks: str(h.remarks) ?? str(h.reason),
          timestamp: str(h.timestamp) ?? str(h.added_at),
        }))
        .filter((h: ShiprocketStatusEntry) => h.status)
    : [];
  const latest = history[history.length - 1];
  return {
    status: str(b.status),
    statusDp: str(b.status_dp),
    location: latest?.location ?? null,
    edd: dateish(b.edd) ?? dateish(b.edd_date),
    deliveredAt: dateish(b.add) ?? dateish(b.add_date),
    history,
  };
}

/** Terminal tracking states (no more polling). From the API's documented status list. */
export const SHIPROCKET_TERMINAL_STATUSES = [
  "Delivered",
  "RTO Delivered",
  "RTO Locked",
  "Cancelled",
  "Lost",
  "Damaged",
  "Disposed Off",
  "Destroyed",
];
