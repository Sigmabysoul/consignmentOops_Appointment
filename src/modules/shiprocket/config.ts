/**
 * Shiprocket Cargo (B2B) configuration. Server-side only.
 *
 * API: https://api-cargo.shiprocket.in (OpenAPI spec in api_docs/shiprocket_cargo_openapi.json).
 * Auth: a long-lived REFRESH token (1 year) is exchanged for a 1-day ACCESS token.
 * All shipments are land/surface (mode_name "surface"); air is never requested.
 */
export const SHIPROCKET_DEFAULT_BASE_URL = "https://api-cargo.shiprocket.in";

export const SHIPROCKET_PATHS = {
  tokenRefresh: "/api/token/refresh/",
  orderCreation: "/api/external/order_creation/",
  shipmentCreation: "/api/order_shipment_association/",
  getOrder: (orderId: number | string) => `/api/external/get_order/${encodeURIComponent(String(orderId))}/`,
  charges: "/api/shipment/charges/",
  track: (waybills: string) => `/api/shipment/track/${encodeURIComponent(waybills)}/`,
  warehouses: "/api/warehouses/",
  warehouse: (id: number | string) => `/api/warehouses/${encodeURIComponent(String(id))}/`,
  appointment: (shipmentId: number | string) => `/api/external/add_appointment/${encodeURIComponent(String(shipmentId))}/`,
  getShipment: (shipmentId: number | string) => `/api/external/get_shipment/${encodeURIComponent(String(shipmentId))}`,
} as const;

/** Shiprocket's own limits for logged-in users are 200/min; we stay well under. */
export const SHIPROCKET_RATE_LIMITS = {
  windowMs: 60 * 1000,
  charges: 150,
  tracking: 150,
  default: 120,
} as const;
export type ShiprocketRateBucket = Exclude<keyof typeof SHIPROCKET_RATE_LIMITS, "windowMs">;

/** Our pickup point (sender). Every field is mandatory for order creation. */
export interface ShiprocketSender {
  warehouseName: string;
  addressLine1: string;
  addressLine2: string;
  pincode: string;
  city: string;
  state: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export interface ShiprocketConfig {
  baseUrl: string;
  refreshToken: string;
  clientId: number;
  /** Order/shipment creation is refused unless this is true. */
  bookingEnabled: boolean;
  sender: ShiprocketSender;
  timeouts: { defaultMs: number };
  /** Refresh the access token this long after it was issued (it lives 1 day). */
  tokenRefreshAfterMs: number;
}

export class ShiprocketConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiprocketConfigError";
  }
}

export function readShiprocketSender(): ShiprocketSender {
  const e = process.env;
  return {
    warehouseName: (e.SHIPROCKET_SENDER_WAREHOUSE_NAME || "").trim(),
    addressLine1: (e.SHIPROCKET_SENDER_ADDRESS_LINE1 || "").trim(),
    addressLine2: (e.SHIPROCKET_SENDER_ADDRESS_LINE2 || "").trim(),
    pincode: (e.SHIPROCKET_SENDER_PINCODE || "700100").trim(),
    city: (e.SHIPROCKET_SENDER_CITY || "Kolkata").trim(),
    state: (e.SHIPROCKET_SENDER_STATE || "West Bengal").trim(),
    contactName: (e.SHIPROCKET_SENDER_CONTACT_NAME || "").trim(),
    contactEmail: (e.SHIPROCKET_SENDER_CONTACT_EMAIL || "").trim(),
    contactPhone: (e.SHIPROCKET_SENDER_CONTACT_PHONE || "").trim(),
  };
}

/** Sender fields still missing (order creation needs all of them). */
export function missingSenderFields(s: ShiprocketSender): string[] {
  const labels: Record<keyof ShiprocketSender, string> = {
    warehouseName: "SHIPROCKET_SENDER_WAREHOUSE_NAME",
    addressLine1: "SHIPROCKET_SENDER_ADDRESS_LINE1",
    addressLine2: "",
    pincode: "SHIPROCKET_SENDER_PINCODE",
    city: "SHIPROCKET_SENDER_CITY",
    state: "SHIPROCKET_SENDER_STATE",
    contactName: "SHIPROCKET_SENDER_CONTACT_NAME",
    contactEmail: "SHIPROCKET_SENDER_CONTACT_EMAIL",
    contactPhone: "SHIPROCKET_SENDER_CONTACT_PHONE",
  };
  return (Object.keys(labels) as (keyof ShiprocketSender)[]).filter((k) => labels[k] && !s[k]).map((k) => labels[k]);
}

export function isShiprocketConfigured(): boolean {
  return Boolean(process.env.SHIPROCKET_REFRESH_TOKEN?.trim() && Number(process.env.SHIPROCKET_CLIENT_ID) > 0);
}

export function getShiprocketConfig(): ShiprocketConfig {
  const refreshToken = process.env.SHIPROCKET_REFRESH_TOKEN?.trim() || "";
  const clientId = Number(process.env.SHIPROCKET_CLIENT_ID);
  if (!refreshToken || !(clientId > 0)) {
    throw new ShiprocketConfigError(
      "Shiprocket Cargo is not configured: set SHIPROCKET_REFRESH_TOKEN and SHIPROCKET_CLIENT_ID on the server."
    );
  }
  return {
    baseUrl: (process.env.SHIPROCKET_BASE_URL?.trim() || SHIPROCKET_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    refreshToken,
    clientId,
    bookingEnabled: process.env.SHIPROCKET_BOOKING_ENABLED === "true",
    sender: readShiprocketSender(),
    timeouts: { defaultMs: 15_000 },
    tokenRefreshAfterMs: 20 * 60 * 60 * 1000,
  };
}
