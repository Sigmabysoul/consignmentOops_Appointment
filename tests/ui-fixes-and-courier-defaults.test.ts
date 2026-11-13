import { describe, test } from "node:test";
import assert from "node:assert";
import {
  isAmazonChannel,
  isFlipkartFbfOrFksb,
  getDefaultCourierForChannel,
  getEffectiveCourierPartner,
} from "../src/lib/courier-defaults";
import {
  DEFAULT_CARRIER_PRESETS,
  compareShippingCarriers,
} from "../src/modules/pricing/multi-carrier/carrier-comparison-engine";

describe("Courier Partner Rules & Channel Defaults Suite", () => {
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

  test("Amazon orders automatically default to Amazon ATS when courier is unset", () => {
    // Amazon VC
    assert.strictEqual(isAmazonChannel("AMAZON_VC"), true);
    assert.strictEqual(getDefaultCourierForChannel("AMAZON_VC"), "Amazon ATS");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_VC", null), "Amazon ATS");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_VC", ""), "Amazon ATS");

    // Amazon FBA
    assert.strictEqual(isAmazonChannel("AMAZON_FBA"), true);
    assert.strictEqual(getDefaultCourierForChannel("AMAZON_FBA"), "Amazon ATS");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_FBA", null), "Amazon ATS");

    // Generic Amazon channel string
    assert.strictEqual(isAmazonChannel("amazon"), true);
    assert.strictEqual(getEffectiveCourierPartner("Amazon Seller", undefined), "Amazon ATS");

    // If operator has explicitly assigned another courier (e.g. Delhivery One), honor it
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_VC", "Delhivery One"), "Delhivery One");
    assert.strictEqual(getEffectiveCourierPartner("AMAZON_VC", "OM Logistics"), "OM Logistics");
  });

  test("Flipkart FBF and FKSB recommend Ekart, but DO NOT auto-select by default", () => {
    // Flipkart FBF
    assert.strictEqual(isFlipkartFbfOrFksb("FLIPKART_FBF"), true);
    assert.strictEqual(getDefaultCourierForChannel("FLIPKART_FBF"), null);
    assert.strictEqual(getEffectiveCourierPartner("FLIPKART_FBF", null), null);
    assert.strictEqual(getEffectiveCourierPartner("FLIPKART_FBF", ""), null);

    // FKSB Flipkart
    assert.strictEqual(isFlipkartFbfOrFksb("FKSB_FLIPKART"), true);
    assert.strictEqual(getDefaultCourierForChannel("FKSB_FLIPKART"), null);
    assert.strictEqual(getEffectiveCourierPartner("FKSB_FLIPKART", null), null);

    // When operator explicitly selects Ekart or another courier
    assert.strictEqual(getEffectiveCourierPartner("FLIPKART_FBF", "Ekart"), "Ekart");
    assert.strictEqual(getEffectiveCourierPartner("FKSB_FLIPKART", "Delhivery One"), "Delhivery One");
  });

  test("Other channels (Swiggy, Blinkit STO, Flipkart Minutes) have no auto-selected courier", () => {
    assert.strictEqual(isAmazonChannel("SWIGGY"), false);
    assert.strictEqual(isFlipkartFbfOrFksb("SWIGGY"), false);
    assert.strictEqual(getDefaultCourierForChannel("SWIGGY"), null);
    assert.strictEqual(getEffectiveCourierPartner("SWIGGY", null), null);

    assert.strictEqual(isAmazonChannel("BLINKIT_STO"), false);
    assert.strictEqual(isFlipkartFbfOrFksb("BLINKIT_STO"), false);
    assert.strictEqual(getDefaultCourierForChannel("BLINKIT_STO"), null);

    assert.strictEqual(isFlipkartFbfOrFksb("FLIPKART_MINUTES"), false);
  });

  test("Multi-Carrier Comparison produces only the 4 approved carriers", () => {
    const comparison = compareShippingCarriers({
      state: "Maharashtra",
      weightKg: 250,
      mode: "surface",
      appointmentDelivery: true,
      odaDistanceKm: 0,
      rovCover: "none",
    });

    const carrierNames = comparison.carriers.map((c) => c.name);
    // OM Logistics (Surface & Air), Delhivery One, Ekart, Amazon ATS
    assert.ok(carrierNames.includes("OM Logistics"));
    assert.ok(carrierNames.includes("OM Logistics (Air Express)"));
    assert.ok(carrierNames.includes("Delhivery One"));
    assert.ok(carrierNames.includes("Ekart"));
    assert.ok(carrierNames.includes("Amazon ATS"));

    // Ensure no dummy couriers in comparison results
    assert.strictEqual(carrierNames.includes("Blue Dart"), false);
    assert.strictEqual(carrierNames.includes("Smartr Logistics"), false);
    assert.strictEqual(carrierNames.includes("V-Trans"), false);
    assert.strictEqual(carrierNames.includes("Kerry Indev"), false);
  });
});
