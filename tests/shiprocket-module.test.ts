import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildAppointmentBody,
  buildChargesBody,
  buildOrderCreationBody,
  buildShipmentBody,
  mapCharges,
  mapOrderCreation,
  mapShipment,
  mapTrack,
  totalWeightKg,
  ShiprocketError,
  type ShiprocketConfig,
} from "../src/modules/shiprocket";
import { getAllowedCouriersForChannel } from "../src/lib/courier-defaults";
import { compareShippingCarriers } from "../src/modules/pricing/multi-carrier/carrier-comparison-engine";

const config: ShiprocketConfig = {
  baseUrl: "https://api-cargo.shiprocket.in",
  refreshToken: "x",
  clientId: 6488,
  bookingEnabled: true,
  sender: {
    warehouseName: "Kolkata Main",
    addressLine1: "39/1 West Chowbhaga",
    addressLine2: "",
    pincode: "700100",
    city: "Kolkata",
    state: "West Bengal",
    contactName: "Dispatch Desk",
    contactEmail: "dispatch@example.com",
    contactPhone: "9000000001",
  },
  timeouts: { defaultMs: 1000 },
  tokenRefreshAfterMs: 1000,
};
const packages = [
  { units: 6, lengthCm: 40, widthCm: 30, heightCm: 25, weightKg: 12.35 },
  { units: 1, lengthCm: 30, widthCm: 20, heightCm: 15, weightKg: 8.24 },
];
const destination = {
  name: "Blinkit Dankuni",
  addressLine1: "Mouza Dankuni",
  addressLine2: "",
  pincode: "712311",
  city: "Hooghly",
  state: "West Bengal",
  contactName: "Receiving Desk",
  contactEmail: "dock@example.com",
  contactPhone: "+91 90000 00002",
};
const fixture = (n: string) => JSON.parse(fs.readFileSync(`tests/fixtures/shiprocket/${n}.json`, "utf8"));
const rejects = (fn: () => unknown, re: RegExp) =>
  assert.throws(fn, (e: any) => e instanceof ShiprocketError && e.kind === "invalid_input" && re.test(e.message));

describe("Shiprocket Cargo module", () => {
  it("1. courier policy: Shiprocket Cargo only for quick-commerce channels; comparison shows it as live-only", () => {
    for (const c of ["SWIGGY", "BLINKIT_STO", "FLIPKART_MINUTES"]) assert.ok(getAllowedCouriersForChannel(c).includes("Shiprocket Cargo"), c);
    for (const c of ["AMAZON_VC", "AMAZON_FBA", "FLIPKART_FBF", "FKSB_FLIPKART"]) assert.ok(!getAllowedCouriersForChannel(c).includes("Shiprocket Cargo"), c);
    const cmp = compareShippingCarriers({ state: "West Bengal (Kolkata)", weightKg: 82.34, mode: "surface", invoiceValue: 10000 } as any, { channel: "BLINKIT_STO" });
    const sr = cmp.carriers.find((c) => c.name === "Shiprocket Cargo");
    assert.ok(sr?.liveQuoteOnly);
    assert.notEqual(cmp.lowestCostCarrierName, "Shiprocket Cargo", "a live-only carrier is never 'lowest cost' at ₹0");
    assert.ok(!compareShippingCarriers({ state: "X", weightKg: 10, mode: "surface" } as any, { channel: "AMAZON_VC" }).carriers.some((c) => c.name === "Shiprocket Cargo"));
  });

  it("2. totals in integer grams (no float drift) and charges body", () => {
    assert.equal(totalWeightKg(packages), 82.34); // 6×12.35 + 8.24
    const b = buildChargesBody({ packages, invoiceValue: 25000.456, to: { pincode: "712311", city: "Hooghly", state: "West Bengal" } }, config.sender);
    assert.equal(b.quantity, 7);
    assert.equal(b.invoice_value, 25000.46);
    assert.equal(b.from_pincode, "700100");
    assert.equal(b.packaging_unit_details[0].unit, "cm");
    assert.equal(b.is_cod, false);
    rejects(() => buildChargesBody({ packages: [], invoiceValue: 1, to: { pincode: "712311", city: "a", state: "b" } }, config.sender), /package/i);
    rejects(() => buildChargesBody({ packages, invoiceValue: 1, to: { pincode: "012311", city: "a", state: "b" } }, config.sender), /pincode/);
  });

  it("3. order creation body: surface only, sender from config, phone normalised, validation", () => {
    const b = buildOrderCreationBody(
      { clientOrderId: "8525210002722", packages, invoice: { value: 60000, number: "INV-1", date: "2026-11-17" }, destination, pickupDate: "2026-11-18", poNumber: "8525210002722", poExpiryDate: "2026-12-03" },
      config
    );
    assert.equal(b.mode_name, "surface");
    assert.equal(b.client_id, 6488);
    assert.equal(b.no_of_packages, 7);
    assert.equal(b.approx_weight, 82.34);
    assert.equal(b.recipient_contact_person_contact_no, "9000000002");
    assert.equal(b.pickup_date_time, "2026-11-18 10:00:00");
    assert.equal(b.po_expiry_date, "2026-12-03");
    rejects(() => buildOrderCreationBody({ clientOrderId: "X", packages, invoice: { value: 1, number: "", date: null }, destination: { ...destination, contactEmail: "nope" } }, config), /email/i);
    rejects(
      () => buildOrderCreationBody({ clientOrderId: "X", packages, invoice: { value: 1, number: "", date: null }, destination }, { ...config, sender: { ...config.sender, warehouseName: "" } }),
      /SHIPROCKET_SENDER_WAREHOUSE_NAME/
    );
  });

  it("4. shipment body: e-way bill required above ₹50,000", () => {
    const base = { orderId: 209880, modeId: 16, deliveryPartnerId: 11, invoice: { value: 60000, number: "INV-1", date: null }, remarks: "RO 1" };
    rejects(() => buildShipmentBody(base, config), /e-way bill/i);
    assert.equal(buildShipmentBody({ ...base, ewayBillNo: "3610 0917 6397" }, config).eway_bill_no, "361009176397");
    assert.equal(buildShipmentBody({ ...base, invoice: { ...base.invoice, value: 40000 } }, config).eway_bill_no, undefined);
  });

  it("5. appointment body uses IST offsets and validates the window", () => {
    const b = buildAppointmentBody({ shipmentId: 1, start: "2026-11-20T10:00", end: "2026-11-20T13:00", poNumber: "PO1", poExpiryDate: "2026-12-03" });
    assert.equal(b.appointment_date, "2026-11-20T10:00:00+05:30");
    assert.equal(b.new_appointment_end_date, "2026-11-20T13:00:00+05:30");
    assert.equal(b.is_appointment_taken, true);
    rejects(() => buildAppointmentBody({ shipmentId: 1, start: "2026-11-20T13:00", end: "2026-11-20T10:00", poNumber: "PO1", poExpiryDate: "2026-12-03" }), /after/);
  });

  it("6. mapOrderCreation: auto-assigned, carrier list, and created-without-carrier (documented examples)", () => {
    const f = fixture("order_creation");
    const a = mapOrderCreation(f.assigned);
    assert.equal(a.orderId, 209880);
    assert.deepEqual([a.carriers[0].deliveryPartnerId, a.carriers[0].modeId, a.carriers[0].tatDays], [11, 16, 3]);
    assert.equal(a.carriers[0].scheduledPickupDate, "2024-01-16");
    const m = mapOrderCreation(f.multi_carrier);
    assert.ok(m.carriers.length >= 1);
    const none = mapOrderCreation(f.no_auto_assignment_rule);
    assert.equal(none.orderId, 209986);
    assert.equal(none.carriers.length, 0);
    assert.match(none.message || "", /Auto assigment not set/);
    // Air is never offered even if the API returns it
    assert.equal(mapOrderCreation({ order_id: 1, carrier_list: [{ mode_id: 2, mode_name: "Air", delivery_partner_id: 3 }] }).carriers.length, 0);
  });

  it("7. mapCharges: cheapest first, '-' rates kept as null, air dropped, empty body = none", () => {
    const q = mapCharges({
      success: "true",
      "rb_advantage-surface": { id: 17, mode_id: 23, mode_name: "surface", delivery_partner: "RB Advantage", transporter_name: "Delhivery Enterprise", rates: 516, tat: 6, pickup_date: "2024-01-16", working: { freight: 218.4, fsc: 43.68, awb_charges: 100, rov: 75, gst: 78.67439999999999, grand_total: 516, chargeable_weight: 24 } },
      "cheap-surface": { id: 5, mode_id: 9, mode_name: "surface", delivery_partner: "Cheap Co", rates: 402.5, tat: 8, working: {} },
      "none-surface": { id: 6, mode_id: 10, mode_name: "surface", delivery_partner: "No Rate", rates: "-", working: {} },
      "fast-air": { id: 7, mode_id: 11, mode_name: "air", delivery_partner: "Air Co", rates: 100 },
    });
    assert.deepEqual(q.map((x) => x.deliveryPartner), ["Cheap Co", "RB Advantage", "No Rate"]);
    assert.equal(q[1].gst, 78.67);
    assert.deepEqual(q[1].lines.map((l) => l.label), ["Freight", "Fuel surcharge", "Docket / AWB", "Risk of value (ROV)"]);
    assert.equal(q[2].total, null);
    assert.deepEqual(mapCharges(null), []);
  });

  it("8. mapShipment (sync) and mapTrack", () => {
    const s = mapShipment({ id: 213423, waybill_no: "20894511870046", lrn: "251463224", child_waybill_nos: ["20894511870050"], label_url: "https://x/label", delivery_partner: { name: "Delhivery Enterprise" }, scheduled_pickup_date: "2024-01-16" });
    assert.deepEqual([s.shipmentId, s.waybill, s.lrn, s.deliveryPartner, s.childWaybills.length], [213423, "20894511870046", "251463224", "Delhivery Enterprise", 1]);
    const t = mapTrack({
      status: "Delivered",
      edd_date: "Estimated Delivery Date not found",
      add: "2025-04-02T13:06:20+05:30",
      status_history: [
        { status: "Created", location: "New Delhi", timestamp: "2025-03-25T13:08:50" },
        { status: "Delivered", location: "Chennai", timestamp: "2025-04-02T13:06:20" },
      ],
    });
    assert.equal(t.status, "Delivered");
    assert.equal(t.edd, null, "placeholder text is not a date");
    assert.equal(t.location, "Chennai");
    assert.equal(t.history.length, 2);
  });
});
