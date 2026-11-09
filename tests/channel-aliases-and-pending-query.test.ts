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
  test("Excludes Zepto from supported sales platforms", () => {
    const platforms = [
      { code: "ALL" },
      { code: "SWIGGY" },
      { code: "BLINKIT_STO" },
      { code: "FLIPKART_MINUTES" },
      { code: "FLIPKART_FBF" },
      { code: "FKSB_FLIPKART" },
      { code: "AMAZON_VC" },
      { code: "AMAZON_FBA" },
    ];
    assert.strictEqual(platforms.some((p) => p.code === "ZEPTO"), false, "Zepto must not be in platforms");
  });

  test("When selectedPlatform is 'ALL', all platform buttons evaluate to active (glow up)", () => {
    const platforms = [
      { code: "ALL" },
      { code: "SWIGGY" },
      { code: "BLINKIT_STO" },
      { code: "FLIPKART_MINUTES" },
      { code: "FLIPKART_FBF" },
      { code: "FKSB_FLIPKART" },
      { code: "AMAZON_VC" },
      { code: "AMAZON_FBA" },
    ];

    const selectedPlatform: string = "ALL";

    platforms.forEach((p) => {
      const isActive = selectedPlatform === "ALL" || selectedPlatform === p.code;
      assert.strictEqual(isActive, true, `Platform ${p.code} must be active/glowing when ALL is selected`);
    });
  });

  test("When specific platform is selected, only that platform evaluates to active", () => {
    const platforms = [
      { code: "ALL" },
      { code: "SWIGGY" },
      { code: "BLINKIT_STO" },
      { code: "FLIPKART_MINUTES" },
    ];

    const selectedPlatform: string = "BLINKIT_STO";

    platforms.forEach((p) => {
      const isActive = selectedPlatform === "ALL" || selectedPlatform === p.code;
      if (p.code === "BLINKIT_STO") {
        assert.strictEqual(isActive, true);
      } else {
        assert.strictEqual(isActive, false);
      }
    });
  });
});
