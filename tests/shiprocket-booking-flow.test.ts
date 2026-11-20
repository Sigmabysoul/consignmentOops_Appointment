/**
 * End-to-end Shiprocket Cargo flow against the real database with the Shiprocket API simulated
 * (global fetch is replaced; no network calls leave the machine).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { createSession } from "../src/lib/auth";

process.env.SHIPROCKET_REFRESH_TOKEN = "test-refresh-token";
process.env.SHIPROCKET_CLIENT_ID = "6488";
process.env.SHIPROCKET_BOOKING_ENABLED = "true";
process.env.SHIPROCKET_SENDER_WAREHOUSE_NAME = "Kolkata Main";
process.env.SHIPROCKET_SENDER_ADDRESS_LINE1 = "39/1 West Chowbhaga";
process.env.SHIPROCKET_SENDER_CONTACT_NAME = "Dispatch";
process.env.SHIPROCKET_SENDER_CONTACT_EMAIL = "dispatch@example.com";
process.env.SHIPROCKET_SENDER_CONTACT_PHONE = "9000000001";

const RO = `TESTSR${Date.now().toString().slice(-8)}`;
const calls: { method: string; path: string; body: any }[] = [];
let shipmentMode: "ok" | "timeout" = "ok";
const realFetch = globalThis.fetch;
const orderFixture = JSON.parse(fs.readFileSync("tests/fixtures/shiprocket/order_creation.json", "utf8"));

function fakeShiprocket(url: string, init: RequestInit = {}): Response {
  const path = new URL(url).pathname;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  calls.push({ method: init.method || "GET", path, body });
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  if (path === "/api/token/refresh/") return json(200, { access: "access-1" });
  if ((init.headers as any)?.Authorization !== "Bearer access-1") return json(401, { detail: "bad token" });
  if (path === "/api/shipment/charges/")
    return json(201, { success: "true", "dl-surface": { id: 11, mode_id: 16, mode_name: "surface", delivery_partner: "Delhivery", rates: 1834.5, tat: 4, working: { freight: 1400, gst: 279.84, grand_total: 1834.5 } } });
  if (path === "/api/external/order_creation/") return json(201, orderFixture.assigned);
  if (path === "/api/order_shipment_association/") {
    if (shipmentMode === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    return json(201, { id: 213423, waybill_no: "20894511870046", lrn: "251463224", child_waybill_nos: ["20894511870050"], label_url: "https://labels.example/1.pdf", delivery_partner: { name: "Delhivery Enterprise" }, scheduled_pickup_date: "2026-11-18" });
  }
  if (path.startsWith("/api/shipment/track/"))
    return json(200, { status: "In Transit", edd: "2026-11-22T00:00:00+05:30", status_history: [{ status: "Picked Up", location: "Kolkata", timestamp: "2026-11-18T12:00:00" }] });
  if (path.startsWith("/api/external/add_appointment/")) return json(200, { id: 213423, is_appointment_taken: true });
  return json(404, { detail: "unknown path" });
}

describe("Shiprocket Cargo booking flow (simulated API)", () => {
  let token = "";
  let staffToken = "";
  let orderId = "";
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const ctx = () => ({ params: Promise.resolve({ id: orderId }) });
  const post = (url: string, body: unknown, t = token) =>
    new NextRequest(`http://localhost:3001${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...auth(t) }, body: JSON.stringify(body) });

  const packages = [{ units: 2, lengthCm: 40, widthCm: 30, heightCm: 25, weightKg: 12.5 }];
  const destination = { name: "Swiggy DS", addressLine1: "Plot 4", pincode: "560037", city: "Bengaluru", state: "Karnataka", contactName: "Dock", contactEmail: "dock@example.com", contactPhone: "9000000002" };

  before(async () => {
    globalThis.fetch = (async (url: any, init?: any) => {
      const u = String(url);
      if (u.startsWith("https://api-cargo.shiprocket.in")) return fakeShiprocket(u, init);
      return realFetch(url, init);
    }) as typeof fetch;
    const admin = await db.user.findFirst({ where: { globalPermissions: { has: "users.manage" }, isActive: true } });
    assert(admin);
    token = await createSession(admin.id);
    // A logistics user who may book couriers on SWIGGY but does NOT hold "Override workflow gates".
    const staff = await db.user.upsert({
      where: { username: "sr-test-desk-user" },
      update: { isActive: true, globalPermissions: [] },
      create: { username: "sr-test-desk-user", name: "Shiprocket Desk Tester", passwordHash: "x", isActive: true, globalPermissions: [] },
    });
    await db.channelPermission.deleteMany({ where: { userId: staff.id } });
    await db.channelPermission.create({
      data: { userId: staff.id, channel: "SWIGGY", actions: ["order.view", "logistics.desk", "courier.book"], allowedFields: [] },
    });
    staffToken = await createSession(staff.id);
    orderId = (await db.consignmentOrder.create({ data: { roPoNumber: RO, channel: "SWIGGY", status: "In Progress", docsPrinted: true } })).id;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.consignmentOrder.deleteMany({ where: { roPoNumber: RO } });
  });

  it("1. quote is fetched and snapshotted on the order", async () => {
    const { POST } = await import("../src/app/api/shiprocket/quote/route");
    const res = await POST(post("/api/shiprocket/quote", { orderId, to: { pincode: "560037", city: "Bengaluru", state: "Karnataka" }, packages, invoiceValue: 12000 }));
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.quotes[0].total, 1834.5);
    const o = await db.consignmentOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal((o.customData as any).shiprocket.quote.weightKg, 25);
  });

  it("2. step 1 creates the order once; a second click is refused", async () => {
    const { POST } = await import("../src/app/api/shiprocket/orders/[id]/order/route");
    const res = await POST(post(`/api/shiprocket/orders/${orderId}/order`, { destination, packages, invoice: { value: 12000, number: "INV-9" } }), ctx());
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.shiprocket.order.orderId, 209880);
    assert.equal(body.shiprocket.order.carriers[0].deliveryPartnerId, 11);
    const sent = calls.find((c) => c.path === "/api/external/order_creation/")!.body;
    assert.equal(sent.mode_name, "surface");
    assert.equal(sent.client_order_id, RO);
    const again = await POST(post(`/api/shiprocket/orders/${orderId}/order`, { destination, packages, invoice: { value: 12000 } }), ctx());
    assert.equal(again.status, 409);
    assert.equal(calls.filter((c) => c.path === "/api/external/order_creation/").length, 1, "never sent twice");
  });

  it("3. a timed-out booking becomes unknown_outcome and blocks a blind retry", async () => {
    const { POST } = await import("../src/app/api/shiprocket/orders/[id]/shipment/route");
    shipmentMode = "timeout";
    const res = await POST(post(`/api/shiprocket/orders/${orderId}/shipment`, { deliveryPartnerId: 11, modeId: 16 }), ctx());
    assert.equal(res.status, 504);
    let o = await db.consignmentOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal((o.customData as any).shiprocket.shipment.state, "unknown_outcome");
    shipmentMode = "ok";
    if (staffToken) {
      const blind = await POST(post(`/api/shiprocket/orders/${orderId}/shipment`, { deliveryPartnerId: 11, modeId: 16, override: true }, staffToken), ctx());
      assert.equal(blind.status, 409, "override without 'Override workflow gates' is ignored");
    }
    const plain = await POST(post(`/api/shiprocket/orders/${orderId}/shipment`, { deliveryPartnerId: 11, modeId: 16 }), ctx());
    assert.equal(plain.status, 409);
  });

  it("4. admin override books; waybill, label, courier and trackingId are saved", async () => {
    const { POST } = await import("../src/app/api/shiprocket/orders/[id]/shipment/route");
    const res = await POST(post(`/api/shiprocket/orders/${orderId}/shipment`, { deliveryPartnerId: 11, modeId: 16, override: true }), ctx());
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.shiprocket.waybill, "20894511870046");
    const o = await db.consignmentOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(o.courierPartner, "Shiprocket Cargo");
    assert.equal(o.trackingId, "251463224", "LR / docket copied to the CN field");
    assert.equal((o.customData as any).shiprocket.labelUrl, "https://labels.example/1.pdf");
    const twice = await POST(post(`/api/shiprocket/orders/${orderId}/shipment`, { deliveryPartnerId: 11, modeId: 16 }), ctx());
    assert.equal(twice.status, 409);
  });

  it("5. tracking stores status + history; order status is not changed", async () => {
    const { POST } = await import("../src/app/api/shiprocket/orders/[id]/track/route");
    const res = await POST(new NextRequest(`http://localhost:3001/x`, { method: "POST", headers: auth() }), ctx());
    assert.equal(res.status, 200);
    const o = await db.consignmentOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal((o.customData as any).shiprocket.tracking.status, "In Transit");
    assert.equal((o.customData as any).shiprocket.statusHistory.length, 1);
    assert.equal(o.status, "In Progress");
  });

  it("6. appointment is sent with IST offsets and mirrored onto the order", async () => {
    const { POST } = await import("../src/app/api/shiprocket/orders/[id]/appointment/route");
    const d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const res = await POST(post(`/api/shiprocket/orders/${orderId}/appointment`, { start: `${d}T10:00`, end: `${d}T13:00`, poExpiryDate: "2099-01-01" }), ctx());
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const sent = calls.filter((c) => c.path.startsWith("/api/external/add_appointment/")).pop()!.body;
    assert.equal(sent.appointment_date, `${d}T10:00:00+05:30`);
    const o = await db.consignmentOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(o.appointmentSlot, "10:00-13:00");
  });

  it("7. Amazon orders cannot use Shiprocket", async () => {
    const amazon = await db.consignmentOrder.create({ data: { roPoNumber: `${RO}A`, channel: "AMAZON_VC", status: "In Progress" } });
    try {
      const { POST } = await import("../src/app/api/shiprocket/orders/[id]/order/route");
      const res = await POST(post(`/api/shiprocket/orders/${amazon.id}/order`, { destination, packages, invoice: { value: 1 } }), { params: Promise.resolve({ id: amazon.id }) });
      assert.equal(res.status, 422);
    } finally {
      await db.consignmentOrder.delete({ where: { id: amazon.id } });
    }
  });
});
