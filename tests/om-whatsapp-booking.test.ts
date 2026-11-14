import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWhatsAppPhone,
  formatBoxDetailsForWhatsApp,
  resolveDeliveryAddress,
  formatPickupDateForWhatsApp,
  buildOmWhatsAppDraft,
  getWhatsAppWebUrl,
  DEFAULT_OM_WHATSAPP_CONFIG,
  OmWhatsAppConfig,
} from "../src/lib/om-whatsapp-booking";
import {
  getDefaultShippingPresets,
  UnifiedShippingPresets,
} from "../src/lib/shipping-presets-storage";
import { AppointmentOrder } from "../src/lib/types";

describe("OM Logistics WhatsApp Pickup Booking Automation", () => {
  const sampleOrder: AppointmentOrder = {
    id: "ord-test-01",
    roPoNumber: "PO-BLINKIT-9988",
    channel: "BLINKIT",
    status: "CONFIRMED",
    pickupDate: "2026-11-11T10:00:00.000Z",
    warehouseName: "BLINK COMMERCE PRIVATE LIMITED",
    boxCount: 18,
    customData: {
      packagingSlipPrinted: true,
      warehouseAddress:
        "Khasra no 1479 Gulab khera, Kurauni Bijnaur Road ,Near Banthra Thana, Kanpur Road Lucknow -227101 Lucknow 227101",
      boxDimensionGroups: [
        { boxCount: 11, lengthCm: 27, widthCm: 28, heightCm: 30, weightKg: 30.36 },
        { boxCount: 1, lengthCm: 41, widthCm: 34, heightCm: 41, weightKg: 6.86 },
        { boxCount: 1, lengthCm: 69, widthCm: 40, heightCm: 51, weightKg: 14.5 },
        { boxCount: 2, lengthCm: 56, widthCm: 32, heightCm: 38, weightKg: 27.0 },
        { boxCount: 3, lengthCm: 40, widthCm: 32, heightCm: 45, weightKg: 52.1 },
      ],
      invoiceValue: 77662.0,
    },
  } as any as AppointmentOrder;

  it("1. Normalizes phone numbers to WhatsApp international standard (91XXXXXXXXXX)", () => {
    // 10 digits test number
    assert.equal(normalizeWhatsAppPhone("9477070699"), "919477070699");

    // With leading 0
    assert.equal(normalizeWhatsAppPhone("09477070699"), "919477070699");

    // With spaces, hyphens, and +91
    assert.equal(normalizeWhatsAppPhone("+91 94770-70699"), "919477070699");

    // Fallback when empty or null
    assert.equal(normalizeWhatsAppPhone(null), "919477070699");
    assert.equal(normalizeWhatsAppPhone(""), "919477070699");
  });

  it("2. Formats pickup date to DD.MM.YYYY matching OM WhatsApp template format", () => {
    assert.equal(formatPickupDateForWhatsApp("2026-11-11T00:00:00.000Z"), "11.11.2026");
    assert.equal(formatPickupDateForWhatsApp(new Date(2026, 10, 11)), "11.11.2026");
  });

  it("3. Resolves full delivery warehouse address from order data", () => {
    const address = resolveDeliveryAddress(sampleOrder);
    assert.match(address, /BLINK COMMERCE PRIVATE LIMITED/);
    assert.match(address, /Lucknow -227101/);
  });

  it("4. Extracts and formats box details breakdown matching user sample format", () => {
    const { boxLines, totalBoxes } = formatBoxDetailsForWhatsApp(sampleOrder);
    assert.equal(totalBoxes, 18);

    assert.ok(boxLines.includes("11 BOX (27X28X30____30.36 KG )"));
    assert.ok(boxLines.includes("1 BOX (41X34X41____6.86 KG )"));
    assert.ok(boxLines.includes("1 BOX (69X40X51____14.50 KG )"));
    assert.ok(boxLines.includes("2 BOX (56X32X38____27.00 KG )"));
    assert.ok(boxLines.includes("3 BOX (40X32X45____52.10 KG )"));
  });

  it("5. Builds exact WhatsApp draft message with all user-specified fields", () => {
    const draft = buildOmWhatsAppDraft(sampleOrder, DEFAULT_OM_WHATSAPP_CONFIG, 77662.0);

    // Exact Header Date
    assert.ok(draft.includes("*NEW SHIPMENT - 11.11.2026*"));

    // Kolkata Pickup Address
    assert.ok(
      draft.includes("Pickup Pin Code: 39/1, Ground Floor, West Chowbhaga, Tiljala, Kolkata - 700100")
    );

    // Delivery Warehouse
    assert.ok(
      draft.includes(
        "Delivery Pin Code:::BLINK COMMERCE PRIVATE LIMITED Khasra no 1479 Gulab khera, Kurauni Bijnaur Road ,Near Banthra Thana, Kanpur Road Lucknow -227101 Lucknow 227101"
      )
    );

    // Total Boxes & details
    assert.ok(draft.includes("_*Box Details: 18  Boxes*_"));
    assert.ok(draft.includes("11 BOX (27X28X30____30.36 KG )"));

    // Fixed Contact Note
    assert.ok(draft.includes("_*Note:*_"));
    assert.ok(
      draft.includes(
        "For any pickup related queries or address guidance, contact on: 8240545843 or 6289853185"
      )
    );

    // User-entered Value
    assert.ok(draft.includes("Value - 77662.00"));
  });

  it("6. Constructs direct WhatsApp Web URL properly URI-encoded", () => {
    const draft = buildOmWhatsAppDraft(sampleOrder, DEFAULT_OM_WHATSAPP_CONFIG, "77662");
    const webUrl = getWhatsAppWebUrl("9477070699", draft);

    assert.ok(webUrl.startsWith("https://web.whatsapp.com/send?phone=919477070699&text="));
    // Verify encoded text can be decoded back to exact message
    const urlObj = new URL(webUrl);
    const decodedText = urlObj.searchParams.get("text");
    assert.equal(decodedText, draft);
    assert.equal(urlObj.searchParams.get("phone"), "919477070699");
  });

  it("7. Shipping presets defaults contain active omWhatsAppConfig", () => {
    const defaults: UnifiedShippingPresets = getDefaultShippingPresets();
    assert.ok(defaults.omWhatsAppConfig, "defaults should include omWhatsAppConfig");
    assert.equal(defaults.omWhatsAppConfig.phoneNumber, "9477070699");
    assert.equal(
      defaults.omWhatsAppConfig.pickupAddress,
      "39/1, Ground Floor, West Chowbhaga, Tiljala, Kolkata - 700100"
    );
    assert.ok(defaults.omWhatsAppConfig.draftTemplate.includes("{{pickupDate}}"));
    assert.ok(defaults.omWhatsAppConfig.draftTemplate.includes("{{orderValue}}"));
  });

  it("8. Supports custom templates modified by the operator in presets", () => {
    const customConfig: OmWhatsAppConfig = {
      phoneNumber: "9876543210",
      pickupAddress: "Kolkata Central Hub",
      contactNote: "Call Manager at 9999999999",
      draftTemplate: "PICKUP REQUEST: {{totalBoxes}} boxes on {{pickupDate}} at {{pickupAddress}} -> Value ₹{{orderValue}}",
    };

    const draft = buildOmWhatsAppDraft(sampleOrder, customConfig, "125000");
    assert.equal(
      draft,
      "PICKUP REQUEST: 18 boxes on 11.11.2026 at Kolkata Central Hub -> Value ₹125000.00"
    );
  });
});
