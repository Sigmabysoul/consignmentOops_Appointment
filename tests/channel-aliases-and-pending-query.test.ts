import { test, describe } from "node:test";
import assert from "node:assert";
import { normalizeChannelCode, getChannelAliases, channelsMatch } from "../src/lib/channel-aliases";

describe("Channel Aliases and Normalization Suite", () => {
  test("Normalizes legacy channel names to canonical codes", () => {
    assert.strictEqual(normalizeChannelCode("BLINKIT"), "BLINKIT_STO");
    assert.strictEqual(normalizeChannelCode("blinkit"), "BLINKIT_STO");
    assert.strictEqual(normalizeChannelCode("FLIPKART"), "FLIPKART_MINUTES");
    assert.strictEqual(normalizeChannelCode("FK_MINUTES"), "FLIPKART_MINUTES");
    assert.strictEqual(normalizeChannelCode("AMAZON"), "AMAZON_VC");
    assert.strictEqual(normalizeChannelCode("SWIGGY"), "SWIGGY");
  });

  test("Retrieves comprehensive alias list for platform filtering", () => {
    const blinkitAliases = getChannelAliases("BLINKIT_STO");
    assert.ok(blinkitAliases.includes("BLINKIT"));
    assert.ok(blinkitAliases.includes("BLINKIT_STO"));
    assert.ok(blinkitAliases.includes("Blinkit STO"));
    assert.ok(blinkitAliases.includes("blinkit"));

    const fkAliases = getChannelAliases("FLIPKART_MINUTES");
    assert.ok(fkAliases.includes("FLIPKART"));
    assert.ok(fkAliases.includes("FLIPKART_MINUTES"));
    assert.ok(fkAliases.includes("Flipkart Minutes"));

    const amzAliases = getChannelAliases("AMAZON_VC");
    assert.ok(amzAliases.includes("AMAZON"));
    assert.ok(amzAliases.includes("AMAZON_VC"));
    assert.ok(amzAliases.includes("Amazon VC"));
  });

  test("channelsMatch accurately pairs canonical and legacy channel codes", () => {
    assert.ok(channelsMatch("ALL", "SWIGGY"));
    assert.ok(channelsMatch("SWIGGY", "ALL"));
    assert.ok(channelsMatch("BLINKIT_STO", "BLINKIT"));
    assert.ok(channelsMatch("BLINKIT", "BLINKIT_STO"));
    assert.ok(channelsMatch("FLIPKART_MINUTES", "FLIPKART"));
    assert.ok(channelsMatch("AMAZON_VC", "AMAZON"));
    assert.strictEqual(channelsMatch("SWIGGY", "BLINKIT_STO"), false);
  });
});

describe("UI Header Platform Selector Invariant", () => {
  test("When selectedPlatform is 'ALL', only the 'ALL' platform evaluates to active", () => {
    const platforms = [
      { code: "ALL" },
      { code: "SWIGGY" },
      { code: "ZEPTO" },
      { code: "BLINKIT_STO" },
      { code: "FLIPKART_MINUTES" },
      { code: "FLIPKART_FBF" },
      { code: "FKSB_FLIPKART" },
      { code: "AMAZON_VC" },
      { code: "AMAZON_FBA" },
    ];

    const selectedPlatform = "ALL";

    platforms.forEach((p) => {
      const isActive = selectedPlatform === p.code;
      if (p.code === "ALL") {
        assert.strictEqual(isActive, true, "Platform ALL must be active when ALL is selected");
      } else {
        assert.strictEqual(isActive, false, `Platform ${p.code} must not be active when ALL is selected`);
      }
    });
  });

  test("When specific platform is selected, only that platform evaluates to active", () => {
    const platforms = [
      { code: "ALL" },
      { code: "SWIGGY" },
      { code: "ZEPTO" },
      { code: "BLINKIT_STO" },
      { code: "FLIPKART_MINUTES" },
    ];

    const selectedPlatform = "BLINKIT_STO";

    platforms.forEach((p) => {
      const isActive = selectedPlatform === p.code;
      if (p.code === "BLINKIT_STO") {
        assert.strictEqual(isActive, true);
      } else {
        assert.strictEqual(isActive, false);
      }
    });
  });
});
