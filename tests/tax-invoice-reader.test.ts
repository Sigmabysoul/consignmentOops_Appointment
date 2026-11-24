import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { invoicePoMismatch, readTaxInvoiceText } from "../src/lib/tax-invoice-reader";
import { getInitialLogisticsInput, getOrderInvoiceSource, getOrderInvoiceValue } from "../src/lib/order-logistics-autofill";

// `pdftotext -layout` of a real invoice: pdfs/Tax Invoice_TBC 26-27 1125_25_09_26.pdf
const text = fs.readFileSync(new URL("./fixtures/invoices/tbc-26-27-1125.txt", import.meta.url), "utf8");

describe("Tax invoice reader", () => {
  it("reads the bottom-line total, invoice no. (wrapped over two lines), PO and e-way bill", () => {
    assert.deepEqual(readTaxInvoiceText(text), {
      invoiceValue: 392108,
      invoiceNumber: "TBC/26-27/1125",
      poNumber: "48287510072011",
      ewayBillNumber: "891745245447",
    });
  });

  it("takes 'Total :' and never 'Sub Total :' or the tax-summary TOTAL", () => {
    const t = "Sub Total : ₹ 1,00,000.00\nTOTAL 84,745.76   15,254.24\nTotal : ₹ 1,18,000.00";
    assert.equal(readTaxInvoiceText(t).invoiceValue, 118000);
    assert.equal(readTaxInvoiceText("no totals here").invoiceValue, null);
  });

  it("flags an invoice for a different PO, accepts this order's PO", () => {
    const r = readTaxInvoiceText(text);
    assert.equal(invoicePoMismatch(r, "48287510072011"), false);
    assert.equal(invoicePoMismatch(r, "48287510096969"), true);
    assert.equal(invoicePoMismatch({ ...r, poNumber: null }, "anything"), false);
  });

  it("the value read from the invoice wins over every other source and feeds the quote form", () => {
    const order: any = {
      id: "o1", roPoNumber: "48287510072011", channel: "BLINKIT_STO",
      customData: { invoiceValue: 5, invoice: { value: 392108, number: "TBC/26-27/1125", fileName: "inv.pdf" } },
    };
    assert.equal(getOrderInvoiceValue(order), 392108);
    assert.deepEqual(getOrderInvoiceSource(order), { number: "TBC/26-27/1125", fileName: "inv.pdf" });
    const input = getInitialLogisticsInput(order);
    assert.equal(input.invoiceValue, 392108);
    assert.equal(input.rovCover, "shipper");
    assert.equal(getOrderInvoiceSource({ customData: {} }), null);
  });
});
