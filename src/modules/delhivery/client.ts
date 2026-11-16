/**
 * HTTP wrapper for every Delhivery B2B call.
 *
 * - Adds the Bearer token and an X-Request-Id.
 * - 401: refresh the token once and retry once.
 * - 429: no retry; surface "Delhivery is busy".
 * - Network error / 5xx: GET may retry once. POST/PUT/DELETE never auto-retry
 *   (a duplicate POST /manifest means a duplicate LR and a duplicate bill).
 * - Local per-bucket counters keep us under Delhivery's per-IP limits.
 * - Logs endpoint, request id, status and duration only. Never tokens or bodies.
 */
import { randomUUID } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { DELHIVERY_RATE_LIMITS, DelhiveryConfig, DelhiveryRateBucket, getDelhiveryConfig } from "./config";
import { getDelhiveryToken, invalidateDelhiveryToken } from "./auth";
import { DelhiveryError } from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface DelhiveryRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  form?: FormData;
  timeout?: "estimate" | "document";
  rateBucket?: DelhiveryRateBucket;
  /** Endpoints that accept it (TAT, pickup, documents). Harmless elsewhere but we stay explicit. */
  sendRequestId?: boolean;
  /** Return the raw bytes instead of parsing (PDF downloads). */
  binary?: boolean;
}

export interface DelhiveryResponse<T = unknown> {
  status: number;
  requestId: string;
  durationMs: number;
  contentType: string | null;
  data: T;
}

export interface DelhiveryCallLog {
  at: string;
  method: HttpMethod;
  path: string;
  requestId: string;
  status: number | null;
  outcome: "ok" | "error";
  durationMs: number;
  errorKind?: string;
}

type CallLogger = (entry: DelhiveryCallLog) => void;
let callLogger: CallLogger = (entry) => {
  const line = `[delhivery] ${entry.method} ${entry.path} status=${entry.status ?? "-"} ${entry.durationMs}ms id=${entry.requestId}${entry.errorKind ? ` error=${entry.errorKind}` : ""}`;
  if (entry.outcome === "ok") console.info(line);
  else console.warn(line);
};

/** Swap the audit logger (e.g. to persist to the database, or silence in tests). */
export function setDelhiveryCallLogger(logger: CallLogger): void {
  callLogger = logger;
}

function buildUrl(config: DelhiveryConfig, path: string, query?: DelhiveryRequest["query"]): string {
  const url = new URL(config.baseUrl + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function parseBody(res: Response, binary: boolean): Promise<unknown> {
  if (binary) return Buffer.from(await res.arrayBuffer());
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function delhiveryRequest<T = unknown>(
  req: DelhiveryRequest,
  configOverride?: DelhiveryConfig
): Promise<DelhiveryResponse<T>> {
  const config = configOverride ?? getDelhiveryConfig();

  if (req.rateBucket) {
    const limit = checkRateLimit(`delhivery:${req.rateBucket}`, {
      windowMs: DELHIVERY_RATE_LIMITS.windowMs,
      maxRequests: DELHIVERY_RATE_LIMITS[req.rateBucket],
    });
    if (!limit.success) {
      throw new DelhiveryError("rate_limited", `Local Delhivery ${req.rateBucket} limit reached.`, {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
  }

  const url = buildUrl(config, req.path, req.query);
  const timeoutMs = req.timeout === "document" ? config.timeouts.documentMs : config.timeouts.estimateMs;
  const canRetryTransient = req.method === "GET";
  let refreshedAfter401 = false;
  let retriedTransient = false;

  for (;;) {
    const requestId = randomUUID();
    const started = Date.now();
    const token = await getDelhiveryToken(config);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: req.binary ? "*/*" : "application/json",
    };
    if (req.sendRequestId) headers["X-Request-Id"] = requestId;
    let body: BodyInit | undefined;
    if (req.form) {
      body = req.form; // fetch sets the multipart boundary
    } else if (req.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(req.json);
    }

    const log = (status: number | null, outcome: "ok" | "error", errorKind?: string) =>
      callLogger({
        at: new Date(started).toISOString(),
        method: req.method,
        path: req.path,
        requestId,
        status,
        outcome,
        durationMs: Date.now() - started,
        errorKind,
      });

    let res: Response;
    try {
      res = await fetch(url, {
        method: req.method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (err: any) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      log(null, "error", timedOut ? "timeout" : "network");
      if (canRetryTransient && !retriedTransient) {
        retriedTransient = true;
        continue;
      }
      throw new DelhiveryError(
        timedOut ? "timeout" : "network",
        timedOut ? `Delhivery ${req.path} timed out after ${timeoutMs}ms.` : `Delhivery ${req.path} network error: ${err?.message || err}`,
        { requestId }
      );
    }

    const data = await parseBody(res, Boolean(req.binary && res.ok));

    if (res.status === 401 && !refreshedAfter401) {
      log(401, "error", "auth_refresh");
      invalidateDelhiveryToken(token);
      refreshedAfter401 = true;
      continue;
    }
    if (res.status === 429) {
      log(429, "error", "rate_limited");
      throw new DelhiveryError("rate_limited", "Delhivery returned 429.", { status: 429, requestId, body: data });
    }
    if (res.status >= 500 && canRetryTransient && !retriedTransient) {
      log(res.status, "error", "server_retry");
      retriedTransient = true;
      continue;
    }
    if (!res.ok) {
      log(res.status, "error", "http");
      throw new DelhiveryError("http", describeHttpError(req.path, res.status, data), {
        status: res.status,
        requestId,
        body: data,
      });
    }

    log(res.status, "ok");
    return {
      status: res.status,
      requestId,
      durationMs: Date.now() - started,
      contentType: res.headers.get("content-type"),
      data: data as T,
    };
  }
}

/** Pulls a human message out of an error body without assuming one exact shape. */
function describeHttpError(path: string, status: number, body: unknown): string {
  const pick = (o: any): string | null => {
    if (!o || typeof o !== "object") return null;
    for (const k of ["message", "error", "detail", "msg", "errors"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object") {
        const nested = pick(v) ?? (Array.isArray(v) ? v.filter((x) => typeof x === "string").join("; ") : null);
        if (nested) return nested;
      }
    }
    return null;
  };
  const detail = typeof body === "string" ? body.slice(0, 300) : pick(body);
  return `Delhivery ${path} failed (HTTP ${status})${detail ? `: ${detail}` : ""}`;
}
