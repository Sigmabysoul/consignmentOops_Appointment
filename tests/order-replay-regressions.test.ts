/**
 * App 2 regressions found by replaying a real Blinkit order (RO 49990010003838) end to end.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readTaxInvoiceText, looksLikeTaxInvoice } from "../src/lib/tax-invoice-reader";
import { dimensionPatchRefusal, appointmentAfterExpiryWarning, isDimensionLocked } from "../src/lib/order-patch-guards";

// `pdftotext -layout` of the real invoice: "Invoice Details:" block with a bare "No: TBC/25-26/499"
const invoice499 = fs.readFileSync(new URL("./fixtures/invoices/tbc-25-26-499.txt", import.meta.url), "utf8");

describe("Order replay regressions (App 2)", () => {
  it("reads the invoice number from an 'Invoice Details: No:' block, not the PO number", () => {
    assert.deepEqual(readTaxInvoiceText(invoice499), {
      invoiceValue: 323306,
      invoiceNumber: "TBC/25-26/499",
      poNumber: "49990010003838",
      ewayBillNumber: "881663653688",
    });
    assert.equal(looksLikeTaxInvoice(invoice499), true);
  });

  it("does not take a GRN or an e-way bill for a tax invoice", () => {
    const grn = "                GRN Report\nBLINK COMMERCE PRIVATE LIMITED\nR.O. Number : 49990010013894\nTotal Quantity in R.O.: 1084\n";
    const eway = "         e-Way Bill\n1- E-way Bill Details\n  Document Details : Tax invoice-TBC/25-26/499-26/03/2026\n";
    assert.equal(looksLikeTaxInvoice(grn), false);
    assert.equal(looksLikeTaxInvoice(eway), false);
  });

  const packed = {
    dimensionConfirmed: true,
    docsPrinted: true,
    boxCount: 85,
    weightKg: 265.25,
    lengthCm: 46,
    boxDimensions: null,
    customData: { documentPrintStatus: { PACKAGING_SLIP: { isPrinted: true } } },
  };

  it("refuses box count / weight changes on a confirmed, slip-printed order", () => {
    assert.equal(isDimensionLocked(packed), true);
    assert.match(dimensionPatchRefusal(packed, { boxCount: 3 }, undefined, false) || "", /locked.*boxCount/);
    assert.match(dimensionPatchRefusal(packed, { weightKg: 54.18000000000001 }, undefined, false) || "", /weightKg/);
    assert.match(dimensionPatchRefusal(packed, {}, "3 BOX (40X30X25)", false) || "", /boxDimensions/);
  });

  it("allows re-sending the stored values, an override, and edits before the lock", () => {
    assert.equal(dimensionPatchRefusal(packed, { boxCount: 85, weightKg: 265.25, lengthCm: 46 }, undefined, false), null);
    assert.equal(dimensionPatchRefusal(packed, { boxCount: 3 }, undefined, true), null, "order.override");
    const open = { dimensionConfirmed: false, docsPrinted: false, boxCount: 2, customData: {} };
    assert.equal(isDimensionLocked(open), false);
    assert.equal(dimensionPatchRefusal(open, { boxCount: 3 }, undefined, false), null);
  });

  it("warns when the appointment is after the RO expiry day (IST), not on the expiry day", () => {
    const expiry = new Date("2026-04-16T06:30:00.000Z"); // 16 Apr 2026, 12:00 IST
    assert.match(appointmentAfterExpiryWarning(new Date("2026-04-18T00:00:00.000Z"), expiry) || "", /18 Apr 2026.*16 Apr 2026/);
    assert.equal(appointmentAfterExpiryWarning(new Date("2026-04-16T00:00:00.000Z"), expiry), null);
    assert.equal(appointmentAfterExpiryWarning(new Date("2026-04-18T00:00:00.000Z"), null), null);
  });
});
