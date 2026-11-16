/**
 * Delhivery B2B token manager.
 *
 * - POST /ums/login returns a JWT valid for 24h. We keep it in server memory and reuse it.
 * - Re-login after ~23h, or once when a call returns 401.
 * - Concurrent callers share one in-flight login (no stampede).
 * - A rejected login is NEVER retried automatically: wrong credentials lock the Delhivery
 *   account for 10 minutes, so we refuse further logins for that window.
 *
 * The app runs as one long-lived Node process (Next standalone in Docker), so memory is
 * enough. State lives on globalThis so Next dev hot reloads don't drop it.
 */
import { DELHIVERY_PATHS, DELHIVERY_RATE_LIMITS, DelhiveryConfig } from "./config";
import { DelhiveryError } from "./errors";
import { checkRateLimit } from "@/lib/rate-limit";

const LOGIN_LOCK_MS = 10 * 60 * 1000;

interface TokenState {
  token: string | null;
  issuedAt: number;
  /** From the JWT exp claim when present. */
  expiresAt: number | null;
  /** Which credentials/base URL the token belongs to. */
  identity: string | null;
  inFlight: Promise<string> | null;
  lockedUntil: number;
}

const globalKey = "__delhiveryTokenState__";
const g = globalThis as unknown as Record<string, TokenState | undefined>;
const state: TokenState =
  g[globalKey] ??
  (g[globalKey] = {
    token: null,
    issuedAt: 0,
    expiresAt: null,
    identity: null,
    inFlight: null,
    lockedUntil: 0,
  });

const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

/**
 * Finds the JWT in the login response without assuming its field name (the portal does not
 * document the response). Prefers keys that look like token fields, then any JWT-shaped string.
 */
export function extractJwtFromLoginResponse(body: unknown): string | null {
  const candidates: { value: string; preferred: boolean }[] = [];
  const visit = (node: unknown, key: string, depth: number) => {
    if (depth > 5 || node == null) return;
    if (typeof node === "string") {
      const v = node.replace(/^Bearer\s+/i, "").trim();
      if (JWT_RE.test(v)) candidates.push({ value: v, preferred: /jwt|token/i.test(key) });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, key, depth + 1));
      return;
    }
    if (typeof node === "object") {
      for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
        visit(child, k, depth + 1);
      }
    }
  };
  visit(body, "", 0);
  return (candidates.find((c) => c.preferred) ?? candidates[0])?.value ?? null;
}

/** Reads the exp claim (seconds) from a JWT, or null. Does not verify the signature. */
export function readJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json?.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function identityOf(config: DelhiveryConfig): string {
  return `${config.baseUrl}|${config.username}`;
}

function tokenIsFresh(config: DelhiveryConfig, now: number): boolean {
  if (!state.token || state.identity !== identityOf(config)) return false;
  if (now - state.issuedAt >= config.tokenRefreshAfterMs) return false;
  // Refresh 10 minutes before a known exp.
  if (state.expiresAt !== null && now >= state.expiresAt - 10 * 60 * 1000) return false;
  return true;
}

async function performLogin(config: DelhiveryConfig): Promise<string> {
  const now = Date.now();
  if (now < state.lockedUntil) {
    throw new DelhiveryError(
      "auth_locked",
      "Delhivery login was rejected recently; not retrying until the 10 minute lock passes.",
      { retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000) }
    );
  }
  const limit = checkRateLimit("delhivery:login", {
    windowMs: DELHIVERY_RATE_LIMITS.windowMs,
    maxRequests: DELHIVERY_RATE_LIMITS.login,
  });
  if (!limit.success) {
    throw new DelhiveryError("rate_limited", "Delhivery login rate limit reached.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  let res: Response;
  try {
    res = await fetch(config.baseUrl + DELHIVERY_PATHS.login, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: config.username, password: config.password }),
      signal: AbortSignal.timeout(config.timeouts.estimateMs),
      cache: "no-store",
    });
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    throw new DelhiveryError(timedOut ? "timeout" : "network", `Delhivery login failed: ${err?.message || err}`);
  }

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }

  if (res.status === 429) {
    throw new DelhiveryError("rate_limited", "Delhivery login rate limited (429).", { status: 429 });
  }
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      // Credentials rejected: Delhivery locks the account. Stop trying.
      state.lockedUntil = Date.now() + LOGIN_LOCK_MS;
      throw new DelhiveryError("auth", `Delhivery login rejected (HTTP ${res.status}).`, {
        status: res.status,
      });
    }
    throw new DelhiveryError("http", `Delhivery login failed (HTTP ${res.status}).`, { status: res.status });
  }

  const token = extractJwtFromLoginResponse(body);
  if (!token) {
    throw new DelhiveryError("unexpected_response", "Delhivery login succeeded but no token was found in the response.");
  }

  state.token = token;
  state.issuedAt = Date.now();
  state.expiresAt = readJwtExpiryMs(token);
  state.identity = identityOf(config);
  return token;
}

/** Returns a valid token, logging in (once, shared) if needed. */
export async function getDelhiveryToken(config: DelhiveryConfig): Promise<string> {
  if (tokenIsFresh(config, Date.now())) return state.token!;
  if (!state.inFlight) {
    state.inFlight = performLogin(config).finally(() => {
      state.inFlight = null;
    });
  }
  return state.inFlight;
}

/** Drops the cached token (after a 401) so the next call logs in again. */
export function invalidateDelhiveryToken(rejectedToken?: string): void {
  if (!rejectedToken || rejectedToken === state.token) {
    state.token = null;
    state.issuedAt = 0;
    state.expiresAt = null;
  }
}

/** Test helper. */
export function __resetDelhiveryAuthState(): void {
  state.token = null;
  state.issuedAt = 0;
  state.expiresAt = null;
  state.identity = null;
  state.inFlight = null;
  state.lockedUntil = 0;
}
