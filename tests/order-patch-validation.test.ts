import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { resolveCourierForChannel } from "../src/lib/courier-defaults";
import { parseOptionalNumber, roundTo2 } from "../src/lib/number-input";

describe("PATCH /api/orders/[id] validation", () => {
  test("Courier policy is enforced server-side per channel", () => {
    assert.deepStrictEqual(resolveCourierForChannel("AMAZON_VC", "Amazon ATS"), { ok: true, courier: "Amazon ATS" });
    assert.strictEqual(resolveCourierForChannel("AMAZON_FBA", "Delhivery One").ok, false);
    assert.strictEqual(resolveCourierForChannel("FLIPKART_FBF", "OM Logistics").ok, false);
    assert.deepStrictEqual(resolveCourierForChannel("FKSB_FLIPKART", "ekart"), { ok: true, courier: "Ekart" });
    assert.deepStrictEqual(resolveCourierForChannel("BLINKIT_STO", " om logistics "), { ok: true, courier: "OM Logistics" });
    assert.strictEqual(resolveCourierForChannel("SWIGGY", "Ekart").ok, false);
    assert.strictEqual(resolveCourierForChannel("SWIGGY", "Blue Dart").ok, false);
    assert.deepStrictEqual(resolveCourierForChannel("SWIGGY", ""), { ok: true, courier: null });
  });

  test("Numeric inputs: garbage and negatives are rejected, blanks clear, commas allowed", () => {
    assert.deepStrictEqual(parseOptionalNumber("77,662.50"), { ok: true, value: 77662.5 });
    assert.deepStrictEqual(parseOptionalNumber(13.25), { ok: true, value: 13.25 });
    assert.deepStrictEqual(parseOptionalNumber(""), { ok: true, value: null });
    assert.deepStrictEqual(parseOptionalNumber(null), { ok: true, value: null });
    assert.strictEqual(parseOptionalNumber("abc").ok, false);
    assert.strictEqual(parseOptionalNumber(-5).ok, false);
    assert.strictEqual(parseOptionalNumber("-5").ok, false);
    assert.strictEqual(parseOptionalNumber(NaN).ok, false);
    assert.strictEqual(parseOptionalNumber({}).ok, false);
    assert.strictEqual(roundTo2(54.18000000000001), 54.18);
  });

  test("OM WhatsApp booking sends invoiceValue as a top-level field the PATCH route saves", () => {
    const modal = fs.readFileSync("src/components/booking/OmWhatsAppBookingModal.tsx", "utf8");
    const route = fs.readFileSync("src/app/api/orders/[id]/route.ts", "utf8");
    assert.ok(/invoiceValue:\s*trimmedValue/.test(modal));
    assert.ok(!/customData:\s*{\s*\.\.\.\(\(order\.customData/.test(modal), "modal must not post a customData copy");
    assert.ok(route.includes("parsedNumbers.invoiceValue"));
    assert.ok(route.includes("resolveCourierForChannel("));
  });
});
