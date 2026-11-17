/**
 * Shiprocket Cargo access-token manager.
 *
 * POST /api/token/refresh/ { refresh } -> { access }. The access token lives 1 day; we keep it
 * in memory (globalThis, survives dev hot reloads), refresh after ~20h or once after a 401,
 * and share one in-flight refresh between concurrent callers. A rejected refresh token is not
 * retried for a minute so a broken config cannot hammer the API.
 */
import { SHIPROCKET_PATHS, ShiprocketConfig } from "./config";
import { ShiprocketError } from "./errors";

const REJECT_COOLDOWN_MS = 60 * 1000;

interface TokenState {
  token: string | null;
  issuedAt: number;
  identity: string | null;
  inFlight: Promise<string> | null;
  rejectedUntil: number;
}

const key = "__shiprocketTokenState__";
const g = globalThis as unknown as Record<string, TokenState | undefined>;
const state: TokenState =
  g[key] ?? (g[key] = { token: null, issuedAt: 0, identity: null, inFlight: null, rejectedUntil: 0 });

const identityOf = (c: ShiprocketConfig) => `${c.baseUrl}|${c.clientId}|${c.refreshToken.slice(-8)}`;

async function refresh(config: ShiprocketConfig): Promise<string> {
  const now = Date.now();
  if (now < state.rejectedUntil) {
    throw new ShiprocketError("auth", "Shiprocket refresh token was rejected moments ago.", {
      retryAfterSeconds: Math.ceil((state.rejectedUntil - now) / 1000),
    });
  }
  let res: Response;
  try {
    res = await fetch(config.baseUrl + SHIPROCKET_PATHS.tokenRefresh, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh: config.refreshToken }),
      signal: AbortSignal.timeout(config.timeouts.defaultMs),
      cache: "no-store",
    });
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    throw new ShiprocketError(timedOut ? "timeout" : "network", `Shiprocket token refresh failed: ${err?.message || err}`);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (res.status === 429) throw new ShiprocketError("rate_limited", "Shiprocket token refresh rate limited.", { status: 429 });
  if (res.status === 401 || res.status === 400) {
    state.rejectedUntil = Date.now() + REJECT_COOLDOWN_MS;
    throw new ShiprocketError("auth", `Shiprocket refresh token rejected (HTTP ${res.status}).`, { status: res.status });
  }
  if (!res.ok) throw new ShiprocketError("http", `Shiprocket token refresh failed (HTTP ${res.status}).`, { status: res.status });
  const access = typeof body?.access === "string" ? body.access.trim() : "";
  if (!access) throw new ShiprocketError("unexpected_response", "Shiprocket token refresh returned no access token.");
  state.token = access;
  state.issuedAt = Date.now();
  state.identity = identityOf(config);
  return access;
}

export async function getShiprocketToken(config: ShiprocketConfig): Promise<string> {
  const fresh =
    state.token && state.identity === identityOf(config) && Date.now() - state.issuedAt < config.tokenRefreshAfterMs;
  if (fresh) return state.token!;
  if (!state.inFlight) {
    state.inFlight = refresh(config).finally(() => {
      state.inFlight = null;
    });
  }
  return state.inFlight;
}

export function invalidateShiprocketToken(rejected?: string): void {
  if (!rejected || rejected === state.token) {
    state.token = null;
    state.issuedAt = 0;
  }
}

/** Test helper. */
export function __resetShiprocketAuthState(): void {
  state.token = null;
  state.issuedAt = 0;
  state.identity = null;
  state.inFlight = null;
  state.rejectedUntil = 0;
}
