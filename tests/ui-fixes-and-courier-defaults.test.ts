import { describe, test } from "node:test";
import assert from "node:assert";
import {
  isAmazonChannel,
  isFlipkartFbfOrFksb,
  getDefaultCourierForChannel,
  getEffectiveCourierPartner,
  getAllowedCouriersForChannel,
  formatDecimalNumber,
} from "../src/lib/courier-defaults";
import {
  DEFAULT_CARRIER_PRESETS,
  compareShippingCarriers,
} from "../src/modules/pricing/multi-carrier/carrier-comparison-engine";

describe("Courier Partner Rules & Channel Defaults Suite (plan.md)", () => {
  test("Strictly approves only 4 courier partners across ecosystem", () => {
    const allowedNames = ["OM Logistics", "Delhivery One", "Ekart", "Amazon ATS"];
    
    // In DEFAULT_CARRIER_PRESETS (used for comparisons)
    for (const preset of DEFAULT_CARRIER_PRESETS) {
      assert.ok(
        allowedNames.includes(preset.name),
        `Unexpected courier in DEFAULT_CARRIER_PRESETS: ${preset.name}`
      );
    }

    // Verify Blue Dart, V-Trans, Smartr, Kerry Indev, Gati are absent
    const dummyNames = ["Blue Dart", "V-Trans", "Smartr Logistics", "Kerry Indev", "Gati-KWE"];
    for (const dummy of dummyNames) {
      assert.strictEqual(
        DEFAULT_CARRIER_PRESETS.some((p) => p.name.toLowerCase() === dummy.toLowerCase()),
        false,
        `${dummy} must not exist in DEFAULT_CARRIER_PRESETS`
      );
    }
  });

  test("Rule 4: Amazon VC and FBA courier option is strictly and ONLY Amazon ATS", () => {
    // Allowed couriers
    assert.deepStrictEqual(getAllowedCouriersForChannel("AMAZON_VC"), ["Amazon ATS"]);
    assert.deepStrictEqual(getAllowedCouriersForChannel("AMAZON_FBA"), ["Amazon ATS"]);
    assert.deepStrictEqual(getAllowedCouriersForChannel("Amazon"), ["Amazon ATS"]);

    // Defaults and effective
    assert.strictEqual(isAmazonChannel("AMAZON_VC"), true);
    assert.strictEqual(getDefaultCourierForChannel("AMAZON_VC"), "Amazon ATS");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_VC", null), "Amazon ATS");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_VC", ""), "Amazon ATS");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_FBA", null), "Amazon ATS");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_VC", "Amazon ATS"), "Amazon ATS");
  });

  test("Rule 5: Flipkart FBF and FKSB courier option is strictly and ONLY Ekart (not auto-selected)", () => {
    // Allowed couriers
    assert.deepStrictEqual(getAllowedCouriersForChannel("FLIPKART_FBF"), ["Ekart"]);
    assert.deepStrictEqual(getAllowedCouriersForChannel("FKSB_FLIPKART"), ["Ekart"]);

    // Not auto-selected by default (waits for user to select)
    assert.strictEqual(isFlipkartFbfOrFksb("FLIPKART_FBF"), true);
    assert.strictEqual(getDefaultCourierForChannel("FLIPKART_FBF"), null);
    assert.strictEqual(getEffectiveCourierPartner("FLIPKART_FBF", null), null);
    assert.strictEqual(getEffectiveCourierPartner("FLIPKART_FBF", ""), null);

    // When selected:
    assert.strictEqual(getEffectiveCourierPartner("FLIPKART_FBF", "Ekart"), "Ekart");
  });

  test("Rule 6: Swiggy, Blinkit, and Flipkart Minutes allowed couriers are strictly Delhivery One and OM Logistics", () => {
    assert.deepStrictEqual(getAllowedCouriersForChannel("SWIGGY"), ["Delhivery One", "OM Logistics"]);
    assert.deepStrictEqual(getAllowedCouriersForChannel("BLINKIT_STO"), ["Delhivery One", "OM Logistics"]);
    assert.deepStrictEqual(getAllowedCouriersForChannel("FLIPKART_MINUTES"), ["Delhivery One", "OM Logistics"]);

    assert.strictEqual(getDefaultCourierForChannel("SWIGGY"), null);
    assert.strictEqual(getEffectiveCourierPartner("SWIGGY", null), null);
    assert.strictEqual(getEffectiveCourierPartner("SWIGGY", "Delhivery One"), "Delhivery One");
    assert.strictEqual(getEffectiveCourierPartner("BLINKIT_STO", "OM Logistics"), "OM Logistics");
  });

  test("Rule 1 & Comparison: Produces Land Surface carriers only (no Air Express)", () => {
    const comparison = compareShippingCarriers({
      state: "Maharashtra",
      weightKg: 250,
      mode: "surface",
      appointmentDelivery: true,
      odaDistanceKm: 0,
      rovCover: "none",
    });

    const carrierNames = comparison.carriers.map((c) => c.name);
    // OM Logistics (Surface), Delhivery One, Ekart, Amazon ATS
    assert.ok(carrierNames.includes("OM Logistics"));
    assert.strictEqual(carrierNames.includes("OM Logistics (Air Express)"), false, "No Air Express");
    assert.ok(carrierNames.includes("Delhivery One"));
    assert.ok(carrierNames.includes("Ekart"));
    assert.ok(carrierNames.includes("Amazon ATS"));

    // Ensure no dummy couriers in comparison results
    assert.strictEqual(carrierNames.includes("Blue Dart"), false);
    assert.strictEqual(carrierNames.includes("Smartr Logistics"), false);
    assert.strictEqual(carrierNames.includes("V-Trans"), false);
    assert.strictEqual(carrierNames.includes("Kerry Indev"), false);
  });

  test("Rule 7: Strict 2-decimal formatting (.00)", () => {
    assert.strictEqual(formatDecimalNumber(54.18000000000001), "54.18");
    assert.strictEqual(formatDecimalNumber(12), "12.00");
    assert.strictEqual(formatDecimalNumber(12.5), "12.50");
    assert.strictEqual(formatDecimalNumber(null), "");
    assert.strictEqual(formatDecimalNumber(undefined), "");
  });
});
