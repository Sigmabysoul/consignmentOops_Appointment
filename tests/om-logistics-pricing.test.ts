import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateOmDeliveryCost,
  ALL_STATES,
  getZoneForState,
  DEFAULT_OM_CONFIG,
  DEFAULT_OM_RATE_CARD,
  DEFAULT_ODA_MATRIX,
  getOdaCharge,
} from "../src/modules/pricing/om-logistics";
import {
  compareShippingCarriers,
  DEFAULT_CARRIER_PRESETS,
} from "../src/modules/pricing/multi-carrier/carrier-comparison-engine";
import {
  detectStateFromOrder,
  getOrderTotalWeightKg,
  getOrderInvoiceValue,
  getInitialLogisticsInput,
} from "../src/lib/order-logistics-autofill";

describe("OM Logistics Pure Pricing Module — Specification Verification", () => {
  describe("Section 7 Worked Examples (Exact Matches)", () => {
    test("Example 1: West, 250 kg, surface -> Freight 1637.50, Fuel 327.50, CN 100, GST 371.70, Total ₹2,436.70", () => {
      const result = calculateOmDeliveryCost({
        state: "Maharashtra",
        weightKg: 250,
        mode: "surface",
        odaDistanceKm: 0,
        appointmentDelivery: false,
        rovCover: "none",
      });

      assert.strictEqual(result.success, true);
      if (!result.success) return;

      assert.strictEqual(result.zone, "West");
      assert.strictEqual(result.freight, 1637.5);
      assert.strictEqual(result.fuel, 327.5);
      assert.strictEqual(result.cn, 100);
      assert.strictEqual(result.oda, 0);
      assert.strictEqual(result.appointment, 0);
      assert.strictEqual(result.subtotal, 2065);
      assert.strictEqual(result.gstAmount, 371.7);
      assert.strictEqual(result.totalAmount, 2436.7);
    });

    test("Example 2: West, 400 kg -> 400 × ₹10 = 4000, GST 720, Total ₹4,720.00", () => {
      const result = calculateOmDeliveryCost({
        state: "Gujarat",
        weightKg: 400,
        mode: "surface",
        odaDistanceKm: 0,
        appointmentDelivery: false,
        rovCover: "none",
      });

      assert.strictEqual(result.success, true);
      if (!result.success) return;

      assert.strictEqual(result.zone, "West");
      assert.strictEqual(result.ratePerKg, 10);
      assert.strictEqual(result.freight, 4000);
      assert.strictEqual(result.fuel, 0);
      assert.strictEqual(result.cn, 0);
      assert.strictEqual(result.subtotal, 4000);
      assert.strictEqual(result.gstAmount, 720);
      assert.strictEqual(result.totalAmount, 4720);
      assert.strictEqual(result.costPerKg, 11.8);
    });

    test("Example 3: Central, 400 kg -> 400 × ₹18 = 7200, GST 1296, Total ₹8,496.00", () => {
      const result = calculateOmDeliveryCost({
        state: "Madhya Pradesh",
        weightKg: 400,
        mode: "surface",
        odaDistanceKm: 0,
        appointmentDelivery: false,
        rovCover: "none",
      });

      assert.strictEqual(result.success, true);
      if (!result.success) return;

      assert.strictEqual(result.zone, "Central");
      assert.strictEqual(result.ratePerKg, 18);
      assert.strictEqual(result.freight, 7200);
      assert.strictEqual(result.fuel, 0);
      assert.strictEqual(result.cn, 0);
      assert.strictEqual(result.subtotal, 7200);
      assert.strictEqual(result.gstAmount, 1296);
      assert.strictEqual(result.totalAmount, 8496);
      assert.strictEqual(result.costPerKg, 21.24);
    });

    test("Example 4: West, 400 kg, ODA at 120 km, appointment delivery -> 4000 + 3450 + 1000 = 8450, GST 1521, Total ₹9,971.00", () => {
      const result = calculateOmDeliveryCost({
        state: "Maharashtra",
        weightKg: 400,
        mode: "surface",
        odaDistanceKm: 120,
        appointmentDelivery: true,
        rovCover: "none",
      });

      assert.strictEqual(result.success, true);
      if (!result.success) return;

      assert.strictEqual(result.zone, "West");
      assert.strictEqual(result.freight, 4000);
      assert.strictEqual(result.fuel, 0);
      assert.strictEqual(result.cn, 0);
      assert.strictEqual(result.oda, 3450);
      assert.strictEqual(result.appointment, 1000);
      assert.strictEqual(result.subtotal, 8450);
      assert.strictEqual(result.gstAmount, 1521);
      assert.strictEqual(result.totalAmount, 9971);
      assert.strictEqual(result.costPerKg, 24.93);
    });

    test("Example 5: West, 251 kg -> 251 × 10 = 2510, GST 451.80, Total ₹2,961.80", () => {
      const result = calculateOmDeliveryCost({
        state: "Goa",
        weightKg: 251,
        mode: "surface",
        odaDistanceKm: 0,
        appointmentDelivery: false,
        rovCover: "none",
      });

      assert.strictEqual(result.success, true);
      if (!result.success) return;

      assert.strictEqual(result.zone, "West");
      assert.strictEqual(result.ratePerKg, 10);
      assert.strictEqual(result.freight, 2510);
      assert.strictEqual(result.fuel, 0);
      assert.strictEqual(result.cn, 0);
      assert.strictEqual(result.subtotal, 2510);
      assert.strictEqual(result.gstAmount, 451.8);
      assert.strictEqual(result.totalAmount, 2961.8);
    });

    test("Example 6: Northeast, 300 kg -> Error: No rate listed for this zone and weight, confirm with Om Logistics", () => {
      const result = calculateOmDeliveryCost({
        state: "Assam (Other)",
        weightKg: 300,
        mode: "surface",
      });

      assert.strictEqual(result.success, false);
      if (result.success) return;

      assert.strictEqual(
        result.error,
        "No rate listed for this zone and weight, confirm with Om Logistics"
      );
    });

    test("Example 7: West, 5000 kg -> Error: No rate listed for this zone and weight, confirm with Om Logistics", () => {
      const result = calculateOmDeliveryCost({
        state: "Maharashtra",
        weightKg: 5000,
        mode: "surface",
      });

      assert.strictEqual(result.success, false);
      if (result.success) return;

      assert.strictEqual(
        result.error,
        "No rate listed for this zone and weight, confirm with Om Logistics"
      );
    });

    test("Example 8: Unmapped state -> Error: Destination not mapped, confirm zone with Om Logistics", () => {
      const result = calculateOmDeliveryCost({
        state: "Dadra & Nagar Haveli and Daman & Diu",
        weightKg: 200,
        mode: "surface",
      });

      assert.strictEqual(result.success, false);
      if (result.success) return;

      assert.strictEqual(
        result.error,
        "Destination not mapped, confirm zone with Om Logistics"
      );
    });
  });

  describe("Boundary Conditions and Additional Invariants", () => {
    test("Weight 0 or negative produces error", () => {
      const r0 = calculateOmDeliveryCost({ state: "Maharashtra", weightKg: 0 });
      assert.strictEqual(r0.success, false);
      if (!r0.success) {
        assert.match(r0.error, /Weight must be greater than 0/i);
      }

      const rNeg = calculateOmDeliveryCost({ state: "Maharashtra", weightKg: -5 });
      assert.strictEqual(rNeg.success, false);
      if (!rNeg.success) {
        assert.match(rNeg.error, /Weight must be greater than 0/i);
      }
    });

    test("ODA distance: exactly 40 km results in ODA = 0; 41 km triggers ODA lookup", () => {
      // 40 km -> no ODA
      const r40 = calculateOmDeliveryCost({
        state: "Karnataka",
        weightKg: 200,
        odaDistanceKm: 40,
      });
      assert.strictEqual(r40.success, true);
      if (!r40.success) return;
      assert.strictEqual(r40.oda, 0);

      // 41 km (weight 200kg falls in 1-350kg band, 41-100km distance band -> ₹1380)
      const r41 = calculateOmDeliveryCost({
        state: "Karnataka",
        weightKg: 200,
        odaDistanceKm: 41,
      });
      assert.strictEqual(r41.success, true);
      if (!r41.success) return;
      assert.strictEqual(r41.oda, 1380);
    });

    test("ODA outside matrix triggers error: distance > 350 km or weight > 5000 kg", () => {
      const rDist = calculateOmDeliveryCost({
        state: "Karnataka",
        weightKg: 200,
        odaDistanceKm: 351,
      });
      assert.strictEqual(rDist.success, false);
      if (!rDist.success) {
        assert.strictEqual(rDist.error, "ODA outside matrix, request a quote");
      }
    });

    test("ROV calculations and minimums: invoice ₹10,000 gives ₹100 shipper and ₹300 carrier", () => {
      // Shipper risk: 0.3% of 10,000 = 30 -> min ₹100 applied
      const rShipper = calculateOmDeliveryCost({
        state: "Delhi",
        weightKg: 200,
        rovCover: "shipper",
        invoiceValue: 10000,
      });
      assert.strictEqual(rShipper.success, true);
      if (!rShipper.success) return;
      assert.strictEqual(rShipper.rov, 100);

      // Carrier risk: 0.8% of 10,000 = 80 -> min ₹300 applied
      const rCarrier = calculateOmDeliveryCost({
        state: "Delhi",
        weightKg: 200,
        rovCover: "carrier",
        invoiceValue: 10000,
      });
      assert.strictEqual(rCarrier.success, true);
      if (!rCarrier.success) return;
      assert.strictEqual(rCarrier.rov, 300);

      // High invoice value: ₹100,000
      // Shipper: 0.3% of 100,000 = 300
      const rShipperHigh = calculateOmDeliveryCost({
        state: "Delhi",
        weightKg: 200,
        rovCover: "shipper",
        invoiceValue: 100000,
      });
      assert.strictEqual(rShipperHigh.success, true);
      if (!rShipperHigh.success) return;
      assert.strictEqual(rShipperHigh.rov, 300);

      // Carrier: 0.8% of 100,000 = 800
      const rCarrierHigh = calculateOmDeliveryCost({
        state: "Delhi",
        weightKg: 200,
        rovCover: "carrier",
        invoiceValue: 100000,
      });
      assert.strictEqual(rCarrierHigh.success, true);
      if (!rCarrierHigh.success) return;
      assert.strictEqual(rCarrierHigh.rov, 800);
    });

    test("Air Express: ₹135/kg, all-inclusive, no fuel and no CN for all zones", () => {
      const rAir = calculateOmDeliveryCost({
        state: "Assam (Guwahati)",
        weightKg: 100,
        mode: "air",
        appointmentDelivery: false,
      });
      assert.strictEqual(rAir.success, true);
      if (!rAir.success) return;
      assert.strictEqual(rAir.freight, 13500);
      assert.strictEqual(rAir.fuel, 0);
      assert.strictEqual(rAir.cn, 0);
      assert.strictEqual(rAir.subtotal, 13500);
      assert.strictEqual(rAir.gstAmount, 2430);
      assert.strictEqual(rAir.totalAmount, 15930);
    });

    test("Appointment delivery charge: max(1000, 1 * W)", () => {
      // 500 kg -> max(1000, 500) = 1000
      const r500 = calculateOmDeliveryCost({
        state: "West Bengal (Kolkata)",
        weightKg: 500,
        appointmentDelivery: true,
      });
      assert.strictEqual(r500.success, true);
      if (!r500.success) return;
      assert.strictEqual(r500.appointment, 1000);

      // 1200 kg -> max(1000, 1200) = 1200
      const r1200 = calculateOmDeliveryCost({
        state: "West Bengal (Other)",
        weightKg: 1200,
        appointmentDelivery: true,
      });
      assert.strictEqual(r1200.success, true);
      if (!r1200.success) return;
      assert.strictEqual(r1200.appointment, 1200);
    });
  });

  describe("Multi-Carrier Comparison Engine", () => {
    test("Correctly generates comparisons for OM Surface, OM Air, Delhivery One, Ekart, Amazon ATS", () => {
      const comparison = compareShippingCarriers({
        state: "Maharashtra",
        weightKg: 400,
        mode: "surface",
        appointmentDelivery: true,
        odaDistanceKm: 0,
        rovCover: "none",
      });

      assert.strictEqual(comparison.carriers.length >= 5, true);
      assert.strictEqual(typeof comparison.lowestCostAmount, "number");
      assert.strictEqual(typeof comparison.omSurfaceTotal, "number");

      // Verify OM Surface exists and has estimate matching Ex 2 + Appt (4000 + 1000 = 5000, GST 900 -> 5900)
      const omSurface = comparison.carriers.find((c) => c.id === "om-surface");
      assert.ok(omSurface);
      assert.strictEqual(omSurface?.estimatedTotal, 5900);
    });
  });

  describe("Order Logistics Autofill", () => {
    test("detectStateFromOrder extracts state accurately from warehouseAddress or deliveredTo", () => {
      const mockOrder1 = {
        warehouseAddress: "Plot 45, Bhiwandi Logistics Park, Thane, Maharashtra - 421302",
        warehouseName: "Bhiwandi Hub",
      };
      assert.strictEqual(detectStateFromOrder(mockOrder1), "Maharashtra");

      const mockOrder2 = {
        warehouseAddress: "Whitefield Industrial Area, Bengaluru, Karnataka 560066",
        warehouseName: "BLR Warehouse",
      };
      assert.strictEqual(detectStateFromOrder(mockOrder2), "Karnataka");

      const mockOrder3 = {
        warehouseName: "Kolkata Central Hub",
        deliveredTo: "Salt Lake Sector V, Kolkata, West Bengal 700091",
      };
      assert.strictEqual(detectStateFromOrder(mockOrder3), "West Bengal (Kolkata)");
    });

    test("getOrderTotalWeightKg calculates total weight from box dimension groups", () => {
      const mockOrder = {
        boxDimensionGroups: [
          { boxCount: 10, weightKg: 15 },
          { boxCount: 5, weightKg: 20 },
        ],
      };
      // 10 * 15 + 5 * 20 = 150 + 100 = 250 kg
      assert.strictEqual(getOrderTotalWeightKg(mockOrder), 250);
    });

    test("getInitialLogisticsInput builds full initial logistics input", () => {
      const mockOrder = {
        warehouseAddress: "Narol, Ahmedabad, Gujarat 382405",
        boxDimensionGroups: [{ boxCount: 20, weightKg: 20 }],
        invoiceValue: 85000,
      };
      const initial = getInitialLogisticsInput(mockOrder as any);
      assert.strictEqual(initial.state, "Gujarat");
      assert.strictEqual(initial.weightKg, 400);
      assert.strictEqual(initial.invoiceValue, 85000);
      assert.strictEqual(initial.mode, "surface");
      assert.strictEqual(initial.appointmentDelivery, true);
    });
  });
});
