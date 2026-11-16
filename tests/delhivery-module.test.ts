import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildFreightEstimateBody,
  buildManifestForm,
  createManifest,
  delhiveryRequest,
  DelhiveryError,
  kgToGrams,
  redactDelhiveryPayload,
  setDelhiveryCallLogger,
  type DelhiveryConfig,
} from "../src/modules/delhivery";
import { extractJwtFromLoginResponse, readJwtExpiryMs, __resetDelhiveryAuthState } from "../src/modules/delhivery/auth";
import { resetRateLimit } from "../src/lib/rate-limit";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const makeJwt = (exp: number) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp, sub: "u" })}.c2lnbmF0dXJlc2ln`;

const config: DelhiveryConfig = {
  env: "test",
  baseUrl: "https://ltl.example.test",
  username: "user",
  password: "pw",
  warehouseName: "Aver WH",
  sourcePin: "700100",
  bookingEnabled: false,
  timeouts: { estimateMs: 2000, documentMs: 2000 },
  tokenRefreshAfterMs: 23 * 3600 * 1000,
};

setDelhiveryCallLogger(() => {});

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const realFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];
function mockFetch(handler: Handler) {
  calls = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Delhivery auth helpers", () => {
  test("finds the JWT without knowing the field name, preferring token-like keys", () => {
    const jwt = makeJwt(2_000_000_000);
    assert.equal(extractJwtFromLoginResponse({ data: { jwt } }), jwt);
    assert.equal(extractJwtFromLoginResponse({ message: "ok", token: `Bearer ${jwt}` }), jwt);
    assert.equal(extractJwtFromLoginResponse({ success: true }), null);
    assert.equal(readJwtExpiryMs(jwt), 2_000_000_000_000);
  });
});

describe("Delhivery HTTP client", () => {
  beforeEach(() => {
    __resetDelhiveryAuthState();
    resetRateLimit("delhivery:login");
    resetRateLimit("delhivery:tat");
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("logs in once for concurrent calls and sends Bearer + X-Request-Id", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 86400);
    mockFetch((url) => (url.endsWith("/ums/login") ? json(200, { jwt }) : json(200, { tat: 3 })));
    await Promise.all([1, 2, 3].map(() => delhiveryRequest({ method: "GET", path: "/tat/estimate", sendRequestId: true }, config)));
    assert.equal(calls.filter((c) => c.url.endsWith("/ums/login")).length, 1);
    const api = calls.find((c) => c.url.includes("/tat/estimate"))!;
    const h = api.init.headers as Record<string, string>;
    assert.equal(h.Authorization, `Bearer ${jwt}`);
    assert.match(h["X-Request-Id"], /^[0-9a-f-]{36}$/);
  });

  test("on 401 refreshes the token once and retries once", async () => {
    let apiHits = 0;
    mockFetch((url) => {
      if (url.endsWith("/ums/login")) return json(200, { token: makeJwt(Math.floor(Date.now() / 1000) + 86400) });
      apiHits++;
      return apiHits === 1 ? json(401, { message: "expired" }) : json(200, { ok: 1 });
    });
    const res = await delhiveryRequest({ method: "GET", path: "/x" }, config);
    assert.equal(res.status, 200);
    assert.equal(calls.filter((c) => c.url.endsWith("/ums/login")).length, 2);
  });

  test("a rejected login is not retried and locks further logins", async () => {
    mockFetch(() => json(401, { message: "bad creds" }));
    await assert.rejects(delhiveryRequest({ method: "GET", path: "/x" }, config), (e: DelhiveryError) => e.kind === "auth");
    await assert.rejects(delhiveryRequest({ method: "GET", path: "/x" }, config), (e: DelhiveryError) => e.kind === "auth_locked");
    assert.equal(calls.length, 1);
  });

  test("POST is never retried on 5xx; GET retries once", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 86400);
    mockFetch((url) => (url.endsWith("/ums/login") ? json(200, { jwt }) : json(503, { error: "down" })));
    await assert.rejects(delhiveryRequest({ method: "POST", path: "/manifest", json: {} }, config), (e: DelhiveryError) => e.kind === "http" && e.status === 503);
    assert.equal(calls.filter((c) => c.url.endsWith("/manifest")).length, 1);
    await assert.rejects(delhiveryRequest({ method: "GET", path: "/lrn/track" }, config));
    assert.equal(calls.filter((c) => c.url.endsWith("/lrn/track")).length, 2);
  });

  test("429 surfaces as rate_limited without retry", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 86400);
    mockFetch((url) => (url.endsWith("/ums/login") ? json(200, { jwt }) : json(429, {})));
    await assert.rejects(delhiveryRequest({ method: "GET", path: "/x" }, config), (e: DelhiveryError) => e.kind === "rate_limited" && /busy/.test(e.userMessage));
    assert.equal(calls.filter((c) => c.url.endsWith("/x")).length, 1);
  });
});

describe("Delhivery request builders", () => {
  test("kgToGrams has no float drift", () => {
    assert.equal(kgToGrams(54.18), 54180);
    assert.equal(kgToGrams(0.1 + 0.2), 300);
  });

  test("freight estimate body matches the Postman shape", () => {
    const body = buildFreightEstimateBody(
      {
        boxes: [
          { lengthCm: 40, widthCm: 30, heightCm: 25, boxCount: 6 },
          { lengthCm: 30, widthCm: 20, heightCm: 15, boxCount: 1 },
        ],
        totalWeightKg: 54.18,
        destinationPin: "400093",
        invoiceAmount: 25000,
      },
      "700100"
    );
    assert.deepEqual(body, {
      dimensions: [
        { length_cm: 40, width_cm: 30, height_cm: 25, box_count: 6 },
        { length_cm: 30, width_cm: 20, height_cm: 15, box_count: 1 },
      ],
      weight_g: 54180,
      cheque_payment: false,
      source_pin: "700100",
      consignee_pin: "400093",
      payment_mode: "prepaid",
      inv_amount: 25000,
      freight_mode: "fop",
      rov_insurance: false,
    });
    assert.throws(() => buildFreightEstimateBody({ boxes: [], totalWeightKg: 1, destinationPin: "400093", invoiceAmount: 1 }, "700100"));
    assert.throws(() => buildFreightEstimateBody({ boxes: [{ lengthCm: 1, widthCm: 1, heightCm: 1, boxCount: 1 }], totalWeightKg: 1, destinationPin: "12345", invoiceAmount: 1 }, "700100"));
  });

  const manifestInput = {
    orderId: "PO-1",
    description: "FMCG",
    boxes: [{ lengthCm: 40, widthCm: 30, heightCm: 25, boxCount: 6 }, { lengthCm: 30, widthCm: 20, heightCm: 15, boxCount: 1 }],
    totalWeightKg: 54.18,
    consignee: { name: "Blinkit DS", address: "Plot 1", city: "Mumbai", state: "Maharashtra", pin: "400093", phone: "+91 98765 43210" },
    invoices: [{ number: "INV-1", amount: 25000 }],
  };

  test("manifest form carries totals, normalised phone and box sets", () => {
    const form = buildManifestForm(manifestInput, "Aver WH");
    assert.equal(form.get("pickup_location_name"), "Aver WH");
    assert.equal(form.get("weight"), "54180");
    assert.equal(form.get("rov_insurance"), "False");
    assert.equal(JSON.parse(String(form.get("dropoff_location"))).phone, "9876543210");
    const sd = JSON.parse(String(form.get("shipment_details")));
    assert.equal(sd[0].box_count, 7);
    assert.equal(sd[0].weight, 54180);
    assert.equal(JSON.parse(String(form.get("dimensions"))).length, 2);
  });

  test("manifest requires e-way bill above ₹50,000 and a warehouse name", () => {
    assert.throws(() => buildManifestForm({ ...manifestInput, invoices: [{ number: "I", amount: 60000 }] }, "WH"), /e-way bill/);
    assert.throws(() => buildManifestForm(manifestInput, ""), /warehouse/);
  });

  test("createManifest is refused unless booking is enabled", () => {
    assert.throws(() => createManifest(manifestInput, config), (e: DelhiveryError) => e.kind === "booking_disabled");
  });
});

describe("Delhivery redaction", () => {
  test("removes tokens, passwords and signed URL params", () => {
    const jwt = makeJwt(1);
    const out = redactDelhiveryPayload({
      jwt,
      password: "x",
      nested: { note: `got ${jwt}` },
      url: "https://s3.example/l.png?X-Amz-Signature=abc&X-Amz-Credential=k&id=1",
      lrn: "220012345678",
    });
    assert.equal(out.jwt, "<redacted>");
    assert.equal(out.password, "<redacted>");
    assert.equal(out.nested.note, "got <redacted-jwt>");
    assert.equal(out.url, "https://s3.example/l.png?X-Amz-Signature=<redacted>&X-Amz-Credential=<redacted>&id=1");
    assert.equal(out.lrn, "220012345678");
  });
});
