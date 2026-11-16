/**
 * Strips secrets from Delhivery payloads before they are logged or saved as fixtures.
 * Redacts by key (token/password/authorization/...) and by value (anything JWT-shaped).
 */
const SECRET_KEY_RE = /pass(word)?|token|jwt|secret|authori[sz]ation|api[_-]?key|session|cookie/i;
const JWT_VALUE_RE = /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
/** Signed URLs (S3 labels/POD links) carry credentials in the query string. */
const SIGNED_QUERY_RE = /([?&](?:X-Amz-[A-Za-z-]+|Signature|AWSAccessKeyId|Expires|token)=)[^&"\s]+/gi;

export function redactDelhiveryPayload<T>(value: T): T {
  const walk = (node: unknown, key: string): unknown => {
    if (typeof node === "string") {
      if (key && SECRET_KEY_RE.test(key)) return node ? "<redacted>" : node;
      return node.replace(JWT_VALUE_RE, "<redacted-jwt>").replace(SIGNED_QUERY_RE, "$1<redacted>");
    }
    if (Array.isArray(node)) return node.map((child) => walk(child, key));
    if (node && typeof node === "object") {
      if (Buffer.isBuffer(node)) return `<binary ${node.length} bytes>`;
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
        out[k] = SECRET_KEY_RE.test(k) && child != null && typeof child !== "object" && child !== "" ? "<redacted>" : walk(child, k);
      }
      return out;
    }
    return node;
  };
  return walk(value, "") as T;
}
