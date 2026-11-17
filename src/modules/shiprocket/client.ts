/**
 * HTTP wrapper for Shiprocket Cargo calls.
 * - Bearer access token; on 401 refresh once and retry once.
 * - 429: no retry. GET may retry once on network error / 5xx.
 * - POST/PUT never auto-retry: a duplicate order_creation / shipment association means a
 *   duplicate booking and bill.
 * - Logs method, path, status and duration only (never tokens or bodies).
 */
import { checkRateLimit } from "@/lib/rate-limit";
import { SHIPROCKET_RATE_LIMITS, ShiprocketConfig, ShiprocketRateBucket, getShiprocketConfig } from "./config";
import { getShiprocketToken, invalidateShiprocketToken } from "./auth";
import { ShiprocketError, extractShiprocketMessage } from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT";

export interface ShiprocketRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  rateBucket?: ShiprocketRateBucket;
}

export interface ShiprocketResponse<T = unknown> {
  status: number;
  durationMs: number;
  data: T;
}

let logger = (line: string, ok: boolean) => (ok ? console.info(line) : console.warn(line));
export function setShiprocketLogger(fn: (line: string, ok: boolean) => void): void {
  logger = fn;
}

export async function shiprocketRequest<T = unknown>(
  req: ShiprocketRequest,
  configOverride?: ShiprocketConfig
): Promise<ShiprocketResponse<T>> {
  const config = configOverride ?? getShiprocketConfig();
  const bucket = req.rateBucket ?? "default";
  const limit = checkRateLimit(`shiprocket:${bucket}`, {
    windowMs: SHIPROCKET_RATE_LIMITS.windowMs,
    maxRequests: SHIPROCKET_RATE_LIMITS[bucket],
  });
  if (!limit.success) {
    throw new ShiprocketError("rate_limited", `Local Shiprocket ${bucket} limit reached.`, {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const url = new URL(config.baseUrl + req.path);
  for (const [k, v] of Object.entries(req.query || {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

  const canRetry = req.method === "GET";
  let refreshed = false;
  let retried = false;
  for (;;) {
    const started = Date.now();
    const token = await getShiprocketToken(config);
    const log = (status: number | null, ok: boolean, note = "") =>
      logger(`[shiprocket] ${req.method} ${req.path} status=${status ?? "-"} ${Date.now() - started}ms${note ? ` ${note}` : ""}`, ok);

    let res: Response;
    try {
      res = await fetch(url, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(req.json !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: req.json !== undefined ? JSON.stringify(req.json) : undefined,
        signal: AbortSignal.timeout(config.timeouts.defaultMs),
        cache: "no-store",
      });
    } catch (err: any) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      log(null, false, timedOut ? "timeout" : "network");
      if (canRetry && !retried) {
        retried = true;
        continue;
      }
      throw new ShiprocketError(timedOut ? "timeout" : "network", `Shiprocket ${req.path}: ${timedOut ? "timed out" : err?.message || err}`);
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (res.status === 401 && !refreshed) {
      log(401, false, "refresh");
      invalidateShiprocketToken(token);
      refreshed = true;
      continue;
    }
    if (res.status === 429) {
      log(429, false);
      throw new ShiprocketError("rate_limited", "Shiprocket returned 429.", { status: 429, body: data });
    }
    if (res.status >= 500 && canRetry && !retried) {
      log(res.status, false, "retry");
      retried = true;
      continue;
    }
    if (!res.ok) {
      log(res.status, false);
      const detail = extractShiprocketMessage(data);
      throw new ShiprocketError("http", `Shiprocket ${req.path} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`, {
        status: res.status,
        body: data,
      });
    }
    log(res.status, true);
    return { status: res.status, durationMs: Date.now() - started, data: data as T };
  }
}
