export type DelhiveryErrorKind =
  | "config"
  | "auth" // wrong credentials / login refused (account may be locked for 10 minutes)
  | "auth_locked" // we refuse to log in again until the lock window passes
  | "rate_limited" // our local guard or Delhivery 429
  | "timeout"
  | "network"
  | "http" // non-2xx from Delhivery
  | "invalid_input"
  | "booking_disabled"
  | "unexpected_response";

export class DelhiveryError extends Error {
  readonly kind: DelhiveryErrorKind;
  readonly status?: number;
  readonly requestId?: string;
  /** Raw response body (already parsed if JSON). Never contains our credentials. */
  readonly body?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: DelhiveryErrorKind,
    message: string,
    extra: { status?: number; requestId?: string; body?: unknown; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = "DelhiveryError";
    this.kind = kind;
    this.status = extra.status;
    this.requestId = extra.requestId;
    this.body = extra.body;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }

  /** Message safe to show an operator. */
  get userMessage(): string {
    switch (this.kind) {
      case "rate_limited":
        return "Delhivery is busy, try again shortly.";
      case "auth":
      case "auth_locked":
        return "Delhivery login failed. Ask an admin to check the Delhivery credentials (the account locks for 10 minutes after a wrong password).";
      case "config":
        return "Delhivery is not configured on the server.";
      case "timeout":
        return "Delhivery did not respond in time.";
      case "booking_disabled":
        return "Delhivery booking through the API is switched off on this server.";
      default:
        return this.message;
    }
  }
}

/** HTTP status a route handler should return for this error. */
export function delhiveryErrorHttpStatus(err: DelhiveryError): number {
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
