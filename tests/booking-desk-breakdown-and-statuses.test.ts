import { describe, test } from "node:test";
import assert from "node:assert";
import { compareShippingCarriers } from "../src/modules/pricing/multi-carrier/carrier-comparison-engine";
import { getFulfilmentStatus, getOrderStatus, getPrintingStatus } from "../src/lib/consignment-statuses";

const sum = (ns: number[]) => Number(ns.reduce((a, b) => a + b, 0).toFixed(2));

describe("Booking Desk cost breakdown", () => {
  test("OM light slab: applied lines add up to the subtotal; unused charges are listed but not applied", () => {
    const res = compareShippingCarriers(
      { state: "Uttar Pradesh", weightKg: 158.81, mode: "surface", appointmentDelivery: true, odaDistanceKm: 0, rovCover: "none" },
      { channel: "BLINKIT_STO" }
    );
    const om = res.carriers.find((c) => c.isOmLogistics)!;
    assert.deepStrictEqual(om.chargeLines.map((l) => l.key), ["freight", "fuel", "cn", "oda", "appointment", "rov"]);
    const applied = om.chargeLines.filter((l) => l.applied);
    assert.deepStrictEqual(applied.map((l) => l.key), ["freight", "fuel", "cn", "appointment"]);
    assert.strictEqual(sum(applied.map((l) => l.amount)), om.subtotal);
    assert.strictEqual(Number((om.subtotal + om.gstAmount).toFixed(2)), om.estimatedTotal);
    assert.strictEqual(om.gstPercent, 18);
    assert.ok(om.zone);
    const oda = om.chargeLines.find((l) => l.key === "oda")!;
    assert.strictEqual(oda.applied, false);
    assert.strictEqual(oda.amount, 0);
  });

  test("OM heavy slab: fuel and CN shown as included in the rate", () => {
    const res = compareShippingCarriers({ state: "Maharashtra", weightKg: 400, mode: "surface", appointmentDelivery: false });
    const om = res.carriers.find((c) => c.isOmLogistics)!;
    const fuel = om.chargeLines.find((l) => l.key === "fuel")!;
    assert.strictEqual(fuel.applied, false);
    assert.match(fuel.basis, /heavy-slab/);
    assert.match(om.chargeLines.find((l) => l.key === "appointment")!.basis, /not selected/);
  });

  test("Partner rate card: every line has 2-decimal amounts and applied lines add up to the subtotal", () => {
    const res = compareShippingCarriers(
      { state: "Karnataka", weightKg: 12.5, mode: "surface", appointmentDelivery: true, odaDistanceKm: 60, rovCover: "shipper", invoiceValue: 80000 },
      { channel: "SWIGGY" }
    );
    const dl = res.carriers.find((c) => c.name === "Delhivery One")!;
    for (const l of dl.chargeLines) assert.strictEqual(l.amount, Number(l.amount.toFixed(2)));
    assert.strictEqual(sum(dl.chargeLines.filter((l) => l.applied).map((l) => l.amount)), dl.subtotal);
    // 12.5 kg is under the 20 kg minimum, so 20 kg is billed
    assert.strictEqual(dl.chargeableWeightKg, 20);
    assert.ok(dl.chargeLines.find((l) => l.key === "oda")!.applied);
    assert.ok(dl.chargeLines.find((l) => l.key === "rov")!.applied);
  });

  test("Live-quote carriers carry no rate-card breakdown", () => {
    const res = compareShippingCarriers({ state: "Karnataka", weightKg: 50, mode: "surface" }, { channel: "SWIGGY" });
    const sr = res.carriers.find((c) => c.liveQuoteOnly)!;
    assert.deepStrictEqual(sr.chargeLines, []);
  });
});

describe("Booking Desk statuses column (mirrors the Consignment app)", () => {
  test("Printing status prefers the label App 1 stores, without its decorations", () => {
    assert.strictEqual(getPrintingStatus({ customData: { printingStatus: "Docs Printed ✓" } }).label, "Docs Printed");
    assert.strictEqual(getPrintingStatus({ customData: { printingStatus: "Partial (2/5)" } }).label, "Partial (2/5)");
    assert.strictEqual(getPrintingStatus({ customData: { printingStatus: "⚠️ 1 Modified" } }).label, "1 Modified");
    assert.strictEqual(getPrintingStatus({ docsPrinted: true }).label, "Docs Printed");
    assert.strictEqual(
      getPrintingStatus({ customData: { documentPrintStatus: { PACKAGING_SLIP: { isPrinted: true } } } }).label,
      "Slip Printed"
    );
    assert.strictEqual(getPrintingStatus({}).label, "Pending Print");
  });

  test("Fulfilment status follows App 1's precedence", () => {
    assert.strictEqual(getFulfilmentStatus({ pickupDone: true, customData: { fulfilmentStatus: "Packed" } }).label, "Dispatched");
    assert.strictEqual(getFulfilmentStatus({ boxesPacked: true }).label, "Packed");
    assert.strictEqual(getFulfilmentStatus({ customData: { fulfilmentStatus: "Packaging in Progress" } }).label, "Packaging in Progress");
    assert.strictEqual(getFulfilmentStatus({ customData: { fulfilmentStatus: "Clear Bag Assigned" } }).label, "Clear Bag Assigned");
    assert.strictEqual(getFulfilmentStatus({ dimensionConfirmed: true }).label, "Box Dimension Approved");
    assert.strictEqual(getFulfilmentStatus({}).label, "Box Dimension Pending");
  });

  test("Order status shows the raw order status", () => {
    assert.strictEqual(getOrderStatus({ status: "In Progress" }).label, "In Progress");
    assert.strictEqual(getOrderStatus({ status: null }).label, "Pending");
  });
});
