import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { redactCustomData, toClientOrder } from "../src/lib/order-redaction";

describe("Server-only customData never reaches the browser", () => {
  test("cancelOtp and shippingLabelBarcodes are stripped; the barcode count is kept", () => {
    const original = { cancelOtp: "482913", shippingLabelBarcodes: ["AWB1", "AWB2"], pod: { file: "x" }, fulfilmentStatus: "Packed" };
    const order = { id: "o1", roPoNumber: "RO1", customData: original };
    const safe = toClientOrder(order) as { customData: Record<string, any> };
    assert.strictEqual(safe.customData.cancelOtp, undefined);
    assert.strictEqual(safe.customData.shippingLabelBarcodes, undefined);
    assert.strictEqual(safe.customData.shippingLabelBarcodeCount, 2);
    assert.deepStrictEqual(safe.customData.pod, { file: "x" });
    assert.strictEqual(safe.customData.fulfilmentStatus, "Packed");
    // input is not mutated (the DB row is reused server-side)
    assert.strictEqual(original.cancelOtp, "482913");
    assert.strictEqual(order.customData.shippingLabelBarcodes.length, 2);
    assert.ok(!JSON.stringify(safe).includes("482913"));
  });

  test("Null customData stays null", () => {
    assert.strictEqual(redactCustomData(null), null);
    assert.strictEqual(toClientOrder({ id: "o2", customData: null }).customData, null);
  });

  test("Every order-returning route uses toClientOrder", () => {
    for (const f of ["src/app/api/orders/route.ts", "src/app/api/orders/[id]/route.ts", "src/app/api/orders/[id]/deliver/route.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      assert.ok(src.includes("toClientOrder("), `${f} must redact orders before responding`);
      assert.ok(!/\.\.\.(order|updated),/.test(src.replace(/\.\.\.toClientOrder\(/g, "")), `${f} spreads a raw order`);
    }
  });
});
