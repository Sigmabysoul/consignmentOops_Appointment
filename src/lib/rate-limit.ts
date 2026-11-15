/**
 * In-Memory Sliding Window Rate Limiter
 * 
 * Protects critical endpoints (e.g. login, tracking scrapers) against brute-force attacks
 * and resource exhaustion without requiring external Redis dependencies.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Periodic garbage collection every 10 minutes to prevent memory leaks
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

export interface RateLimitOptions {
  windowMs: number;     // Window size in milliseconds
  maxRequests: number;  // Maximum allowed attempts within window
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Checks and records an attempt for the specified key.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || record.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      success: true,
      remaining: options.maxRequests - 1,
      retryAfterSeconds: 0,
    };
  }

  if (record.count >= options.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      success: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  record.count += 1;
  return {
    success: true,
    remaining: options.maxRequests - record.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Reports whether a key is currently blocked, without recording an attempt.
 * Use this before doing the protected work, so a blocked caller cannot keep trying.
 */
export function peekRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  if (!record || record.resetAt <= now) {
    return { success: true, remaining: options.maxRequests, retryAfterSeconds: 0 };
  }
  if (record.count >= options.maxRequests) {
    return {
      success: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }
  return { success: true, remaining: options.maxRequests - record.count, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP. Behind a reverse proxy (Traefik/Nginx/Coolify) the proxy APPENDS
 * the real peer address, so the right-most X-Forwarded-For entry is the trustworthy one;
 * the left-most entries are whatever the client chose to send.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Clears the rate limit record for a key (e.g. upon successful authentication).
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

