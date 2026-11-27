import { describe, test } from "node:test";
import assert from "node:assert";
import { compareShippingCarriers, DELHIVERY_RATE_CARD } from "../src/modules/pricing/multi-carrier/carrier-comparison-engine";
import { summarizeCartons, formatCbm } from "../src/lib/dimension-helper";
import { detectCityFromOrder } from "../src/lib/order-logistics-autofill";

const delhivery = (r: ReturnType<typeof compareShippingCarriers>) => r.carriers.find((c) => c.name === "Delhivery One")!;

describe("Delhivery One rate card (no API)", () => {
  test("Kolkata zone, actual weight above minimum: zone rate × kg + fuel + docket + appointment, GST 18%", () => {
    const res = compareShippingCarriers(
      { state: "West Bengal (Kolkata)", weightKg: 175.29, mode: "surface", appointmentDelivery: true, rovCover: "none" },
      { channel: "BLINKIT_STO" }
    );
    const d = delhivery(res);
    assert.strictEqual(d.zone, "East-Kolkata");
    assert.strictEqual(d.breakdown.freight, Number((175.29 * 7).toFixed(2)));
    assert.strictEqual(d.breakdown.fuel, Number((d.breakdown.freight * 0.15).toFixed(2)));
    assert.strictEqual(d.breakdown.cnOrDocket, 100);
    assert.strictEqual(d.breakdown.appointment, 500);
    const sub = Number((d.breakdown.freight + d.breakdown.fuel + 100 + 500).toFixed(2));
    assert.strictEqual(d.subtotal, sub);
    assert.strictEqual(d.estimatedTotal, Number((sub + Number((sub * 0.18).toFixed(2))).toFixed(2)));
    assert.strictEqual(d.estimatedTransitDays, DELHIVERY_RATE_CARD.zoneTransitDays!["East-Kolkata"]);
  });

  test("volumetric weight (6 kg/CFT = ÷4500) is billed when it beats actual weight", () => {
    // 0.9 m³ → 200 kg volumetric vs 50 kg actual.
    const d = delhivery(compareShippingCarriers({ state: "Maharashtra", weightKg: 50, mode: "surface", volumeCbm: 0.9 }, { channel: "SWIGGY" }));
    assert.strictEqual(d.chargeableWeightKg, 200);
    assert.strictEqual(d.breakdown.freight, Number((200 * 10.5).toFixed(2)));
  });

  test("minimum 20 kg and ₹300 minimum freight", () => {
    const d = delhivery(compareShippingCarriers({ state: "West Bengal (Kolkata)", weightKg: 5, mode: "surface" }, { channel: "SWIGGY" }));
    assert.strictEqual(d.chargeableWeightKg, 20);
    assert.strictEqual(d.breakdown.freight, 300); // 20 × ₹7 = ₹140 < ₹300 minimum
  });

  test("ODA = higher of ₹550 or ₹3/kg", () => {
    const small = delhivery(compareShippingCarriers({ state: "Karnataka", weightKg: 100, mode: "surface", odaDistanceKm: 60 }, { channel: "SWIGGY" }));
    assert.strictEqual(small.breakdown.oda, 550);
    const big = delhivery(compareShippingCarriers({ state: "Karnataka", weightKg: 400, mode: "surface", odaDistanceKm: 60 }, { channel: "SWIGGY" }));
    assert.strictEqual(big.breakdown.oda, 1200);
  });

  test("unknown state → no price, never a silent default", () => {
    const d = delhivery(compareShippingCarriers({ state: "", weightKg: 100, mode: "surface" }, { channel: "SWIGGY" }));
    assert.ok(d.error);
    assert.ok(!d.isLowestCost);
  });
});

describe("Total CBM", () => {
  test("Σ boxes × L × W × H in m³, 3 dp", () => {
    const s = summarizeCartons([
      { id: "a", boxCount: 2, lengthCm: 64, widthCm: 24, heightCm: 29, weightKg: 10.18, dimensionUnit: "cm", weightUnit: "kg", key: "64x24x29" },
      { id: "b", boxCount: 1, lengthCm: 40, widthCm: 30, heightCm: 25, weightKg: 5, dimensionUnit: "cm", weightUnit: "kg", key: "40x30x25" },
    ]);
    assert.strictEqual(s.totalCbm, Number(((2 * 64 * 24 * 29 + 40 * 30 * 25) / 1e6).toFixed(3)));
    assert.strictEqual(formatCbm(s.totalCbm), "0.119 CBM");
    assert.strictEqual(summarizeCartons([]).totalCbm, null);
  });
});

describe("City from address", () => {
  test("known city: last one in the address wins", () => {
    const order = {
      customData: { deliveredTo: "BLINK COMMERCE PVT LTD, Mouza Dankuni, Dist. Hooghly PIN 712311 Kolkata 712311" },
      warehouseName: "BCPL - Kolkata K6 Feeder",
    };
    assert.strictEqual(detectCityFromOrder(order), "Kolkata");
  });
  test("known city by alias", () => {
    assert.strictEqual(detectCityFromOrder({ customData: { deliveredTo: "20/3, Mathura Road, Faridabad, Haryana 121006" } }), "Faridabad");
    assert.strictEqual(detectCityFromOrder({ customData: { deliveredTo: "Plot 4, Whitefield, Bangalore 560066" } }), "Bengaluru");
    assert.strictEqual(detectCityFromOrder({ customData: { deliveredTo: "Okhla Phase 2, New Delhi 110020" } }), "New Delhi");
  });
  test("unknown city: comma part before 'State PIN'", () => {
    assert.strictEqual(detectCityFromOrder({ customData: { deliveredTo: "Unit 7, NH 48, Kheda, Gujarat 387411" } }), "Kheda");
  });
  test("falls back to the warehouse name, else empty", () => {
    assert.strictEqual(detectCityFromOrder({ customData: {}, warehouseName: "BCPL - Mumbai M12 - Feeder" }), "Mumbai");
    assert.strictEqual(detectCityFromOrder({ customData: {}, warehouseName: "Demo Darkstore" }), "");
  });
});
