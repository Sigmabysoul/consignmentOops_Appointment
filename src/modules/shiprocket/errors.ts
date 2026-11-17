export type ShiprocketErrorKind =
  | "config"
  | "auth" // refresh token rejected
  | "rate_limited"
  | "timeout"
  | "network"
  | "http"
  | "invalid_input"
  | "booking_disabled"
  | "unexpected_response";

export class ShiprocketError extends Error {
  readonly kind: ShiprocketErrorKind;
  readonly status?: number;
  readonly body?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: ShiprocketErrorKind,
    message: string,
    extra: { status?: number; body?: unknown; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = "ShiprocketError";
    this.kind = kind;
    this.status = extra.status;
    this.body = extra.body;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }

  /** Message safe to show an operator. */
  get userMessage(): string {
    switch (this.kind) {
      case "rate_limited":
        return "Shiprocket Cargo is busy, try again shortly.";
      case "auth":
        return "Shiprocket Cargo rejected our refresh token. Ask an admin to update SHIPROCKET_REFRESH_TOKEN (it is valid for 1 year).";
      case "config":
        return "Shiprocket Cargo is not configured on the server.";
      case "timeout":
        return "Shiprocket Cargo did not respond in time.";
      case "booking_disabled":
        return "Shiprocket Cargo booking through the API is switched off on this server.";
      default:
        return this.message;
    }
  }
}

export function shiprocketErrorHttpStatus(err: ShiprocketError): number {
  switch (err.kind) {
    case "invalid_input":
      return 400;
    case "rate_limited":
      return 429;
    case "booking_disabled":
      return 403;
    case "timeout":
      return 504;
    case "config":
      return 503;
    default:
      return 502;
  }
}

/**
 * Pulls a readable message out of a Shiprocket error body. 400s are documented as
 * "an error message, or validation errors keyed by field name".
 */
export function extractShiprocketMessage(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body.trim().slice(0, 300) || null;
  if (Array.isArray(body)) {
    const parts = body.map((b) => extractShiprocketMessage(b)).filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  if (typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["message", "detail", "error", "msg", "non_field_errors"]) {
      const v = extractShiprocketMessage(o[k]);
      if (v) return v;
    }
    const fieldErrors = Object.entries(o)
      .map(([k, v]) => {
        const m = extractShiprocketMessage(v);
        return m ? `${k}: ${m}` : null;
      })
      .filter(Boolean);
    return fieldErrors.length ? fieldErrors.slice(0, 5).join("; ") : null;
  }
  return String(body);
}
