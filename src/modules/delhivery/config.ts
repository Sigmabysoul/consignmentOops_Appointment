/**
 * Delhivery One B2B (LTL) configuration.
 *
 * Product: Delhivery LTL client API (ltl-clients-api*.delhivery.com), JWT login.
 * This is NOT the B2C Express API (track.delhivery.com / static token).
 *
 * Server-side only. Never import this from a client component.
 */

export type DelhiveryEnv = "test" | "production";

export const DELHIVERY_DEFAULT_BASE_URLS: Record<DelhiveryEnv, string> = {
  test: "https://ltl-clients-api-dev.delhivery.com",
  production: "https://ltl-clients-api.delhivery.com",
};

/** API paths (B2B LTL). Kept separate from the base URL. */
export const DELHIVERY_PATHS = {
  login: "/ums/login",
  serviceability: (pin: string) => `/pincode-service/${encodeURIComponent(pin)}`,
  tat: "/tat/estimate",
  freightEstimate: "/freight/estimate",
  manifest: "/manifest",
  appointment: "/appointments/lm",
  pickupRequests: "/pickup_requests",
  pickupCancel: (id: string) => `/pickup_requests/${encodeURIComponent(id)}`,
  track: "/lrn/track",
  label: (size: DelhiveryLabelSize, lrn: string) =>
    `/label/get_urls/${size}/${encodeURIComponent(lrn)}`,
  lrCopy: (lrn: string) => `/lr_copy/print/${encodeURIComponent(lrn)}`,
  lrCancel: (lrn: string) => `/lrn/cancel/${encodeURIComponent(lrn)}`,
  freightBreakup: "/lrn/freight-breakup",
  documentDownload: "/document/download",
} as const;

export type DelhiveryLabelSize = "sm" | "md" | "a4" | "std";

/**
 * Per-IP limits Delhivery enforces over a 5 minute window. We stop at ~90% so a spike
 * returns a friendly message instead of tripping Delhivery's own limiter.
 */
export const DELHIVERY_RATE_LIMITS = {
  windowMs: 5 * 60 * 1000,
  login: 90,
  serviceability: 450,
  tat: 270,
  freightEstimate: 90,
  tracking: 450,
} as const;

export type DelhiveryRateBucket = Exclude<keyof typeof DELHIVERY_RATE_LIMITS, "windowMs">;

export interface DelhiveryConfig {
  env: DelhiveryEnv;
  baseUrl: string;
  username: string;
  password: string;
  warehouseName: string;
  sourcePin: string;
  /** Booking (manifest) calls are refused unless this is true. */
  bookingEnabled: boolean;
  timeouts: { estimateMs: number; documentMs: number };
  /** Re-login this long after the token was issued (token lives 24h). */
  tokenRefreshAfterMs: number;
}

export class DelhiveryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelhiveryConfigError";
  }
}

function readEnv(): DelhiveryEnv {
  const raw = (process.env.DELHIVERY_ENV || "test").trim().toLowerCase();
  return raw === "production" || raw === "prod" ? "production" : "test";
}

/** Reports whether credentials are present, without throwing. */
export function isDelhiveryConfigured(): boolean {
  return Boolean(process.env.DELHIVERY_USERNAME?.trim() && process.env.DELHIVERY_PASSWORD);
}

export function getDelhiveryConfig(): DelhiveryConfig {
  const env = readEnv();
  const username = process.env.DELHIVERY_USERNAME?.trim() || "";
  const password = process.env.DELHIVERY_PASSWORD || "";
  if (!username || !password) {
    throw new DelhiveryConfigError(
      "Delhivery is not configured: set DELHIVERY_USERNAME and DELHIVERY_PASSWORD on the server."
    );
  }
  const baseUrlOverride =
    env === "production" ? process.env.DELHIVERY_BASE_URL_PROD : process.env.DELHIVERY_BASE_URL_TEST;

  return {
    env,
    baseUrl: (baseUrlOverride?.trim() || DELHIVERY_DEFAULT_BASE_URLS[env]).replace(/\/+$/, ""),
    username,
    password,
    warehouseName: process.env.DELHIVERY_WAREHOUSE_NAME || "",
    sourcePin: (process.env.DELHIVERY_SOURCE_PIN || "700100").trim(),
    bookingEnabled: process.env.DELHIVERY_BOOKING_ENABLED === "true",
    timeouts: { estimateMs: 10_000, documentMs: 30_000 },
    tokenRefreshAfterMs: 23 * 60 * 60 * 1000,
  };
}
