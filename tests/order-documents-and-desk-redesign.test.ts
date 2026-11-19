/**
 * Order documents (tax invoice / courier shipping label / POD) in the drawer, and the redesigned
 * compare-rates sheet and desk cards (pure, no DB).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DOCUMENT_SLOTS, isAcceptedForSlot, slotConfig, slotForDocType, safeFileName } from "../src/lib/order-documents";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("Order document slots", () => {
  it("maps stored doc types to drawer slots", () => {
    assert.equal(slotForDocType("INVOICE"), "TAX_INVOICE");
    assert.equal(slotForDocType("tax_invoice"), "TAX_INVOICE");
    assert.equal(slotForDocType("SHIPPING_LABEL"), "SHIPPING_LABEL");
    assert.equal(slotForDocType("LABEL"), "SHIPPING_LABEL");
    assert.equal(slotForDocType("POD"), "POD");
    assert.equal(slotForDocType("RO_PO"), null);
  });
  it("checks file types per slot and sanitises names", () => {
    assert.equal(isAcceptedForSlot(slotConfig("SHIPPING_LABEL")!, "label.pdf"), true);
    assert.equal(isAcceptedForSlot(slotConfig("SHIPPING_LABEL")!, "label.exe"), false);
    assert.equal(safeFileName("../../etc/passwd"), ".._.._etc_passwd");
    assert.equal(DOCUMENT_SLOTS.length, 3);
  });
});

describe("Documents API", () => {
  const list = read("src/app/api/orders/[id]/documents/route.ts");
  const file = read("src/app/api/orders/[id]/documents/[docId]/route.ts");
  it("both routes hide orders the app may not show", () => {
    assert.ok(list.includes("isVisibleInAppointmentApp("));
    assert.ok(file.includes("isVisibleInAppointmentApp("));
    assert.ok(file.includes("doc.orderId !== id"), "a document is only served for its own order");
  });
  it("POD is never uploaded here (Mark Delivered owns it)", () => {
    assert.ok(list.includes("POD_VIA_MARK_DELIVERED"));
  });
  it("shipping labels go to the main app and their AWBs never reach the browser", () => {
    assert.ok(list.includes("`${consignmentAppUrl()}/api/documents`"));
    assert.ok(list.includes('forward.append("docType", "SHIPPING_LABEL")'));
    assert.ok(list.includes("extractedBarcodeCount"));
    assert.ok(!/extractedBarcodes:\s*data/.test(list), "raw barcodes are not passed back");
    assert.ok(list.includes("shippingLabelBarcodeCount"));
  });
});

describe("Redesigned booking UI", () => {
  it("compare rates is a sheet: charges as rows, carriers as columns", () => {
    const modal = read("src/components/booking/BookingDetailModal.tsx");
    const sheet = read("src/components/booking/RateComparisonSheet.tsx");
    assert.ok(modal.includes("<RateComparisonSheet"));
    assert.ok(sheet.includes("chargeKeys.map((key)") && sheet.includes("carriers.map((c)"));
    assert.ok(sheet.includes("Total payable") && sheet.includes("Assign carrier"));
  });
  it("booking and appointment desks render one card per order", () => {
    assert.ok(read("src/components/booking/BookingView.tsx").includes("<article"));
    assert.ok(read("src/components/appointment/AppointmentView.tsx").includes("<article"));
  });
  it("the drawer has a Documents tab", () => {
    const drawer = read("src/components/drawer/OrderDetailsDrawer.tsx");
    assert.ok(drawer.includes('setActiveTab("documents")') && drawer.includes("<OrderDocumentsSection"));
  });
});
