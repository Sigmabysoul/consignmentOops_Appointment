/**
 * Single source for the session-signing secret (edge-runtime safe; shared by middleware and auth).
 * JWT_SECRET (what the consignment app reads), falling back to AUTH_SECRET. Must equal the
 * consignment app's JWT_SECRET for its consignment_session cookie to be accepted here.
 *
 * Production: a secret must be set, >= 32 chars and not one of the secrets published in this
 * repository; otherwise this throws (fail closed). Development: dev-only fallback.
 */
const DEV_ONLY_FALLBACK_SECRET = "dev-only-appointment-secret-not-for-production-use";

const KNOWN_PUBLIC_SECRETS = new Set([
  DEV_ONLY_FALLBACK_SECRET,
  "consignment-appointment-secret-key-32-chars-minimum",
  "consignment-operations-secret-key-32-chars-minimum",
  "consignment_super_secret_jwt_key_2026_production_safe_token",
]);

let cached: Uint8Array | null = null;

export function getJwtSecretKey(): Uint8Array {
  if (cached) return cached;
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 32 || secret.includes("CHANGE_ME") || KNOWN_PUBLIC_SECRETS.has(secret)) {
      throw new Error(
        "CRITICAL SECURITY ERROR: JWT_SECRET (or AUTH_SECRET) must be set to a strong (32+ char), non-published value in production."
      );
    }
  }
  cached = new TextEncoder().encode(secret || DEV_ONLY_FALLBACK_SECRET);
  return cached;
}
