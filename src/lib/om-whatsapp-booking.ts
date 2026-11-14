import { AppointmentOrder } from "@/lib/types";
import { extractBoxDimensionGroups } from "@/lib/dimension-helper";

export interface OmWhatsAppConfig {
  phoneNumber: string;
  pickupAddress: string;
  contactNote: string;
  draftTemplate: string;
}

export const DEFAULT_OM_WHATSAPP_CONFIG: OmWhatsAppConfig = {
  phoneNumber: "9477070699",
  pickupAddress: "39/1, Ground Floor, West Chowbhaga, Tiljala, Kolkata - 700100",
  contactNote: "For any pickup related queries or address guidance, contact on: 8240545843 or 6289853185",
  draftTemplate: `*NEW SHIPMENT - {{pickupDate}}*

Pickup Pin Code: {{pickupAddress}}

Delivery Pin Code:::{{deliveryAddress}}

_*Box Details: {{totalBoxes}}  Boxes*_
{{boxDetails}}
_*Note:*_
{{contactNote}}
Value - {{orderValue}}`,
};

/**
 * Normalizes phone number to WhatsApp international standard digits (e.g. 919477070699)
 */
export function normalizeWhatsAppPhone(phone?: string | null): string {
  if (!phone) return "919477070699";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  return digits || "919477070699";
}

/**
 * Formats order box dimensions into the OM WhatsApp template specification:
 * e.g.:
 * 11 BOX (27X28X30____30.36 KG )
 * 1 BOX ( 41X34X41____6.86 KG )
 */
export function formatBoxDetailsForWhatsApp(order: AppointmentOrder): {
  boxLines: string;
  totalBoxes: number;
} {
  const groups = extractBoxDimensionGroups(order);
  const totalBoxes = groups.reduce((acc, g) => acc + (g.boxCount || 0), 0) || order.boxCount || 1;

  if (groups.length === 0) {
    const l = order.lengthCm || 0;
    const w = order.widthCm || 0;
    const h = order.heightCm || 0;
    const wt = order.weightKg !== null && order.weightKg !== undefined ? Number(order.weightKg).toFixed(2) : "0.00";
    return {
      boxLines: `${totalBoxes} BOX (${l}X${w}X${h}____${wt} KG )`,
      totalBoxes,
    };
  }

  const lines = groups.map((g) => {
    const l = g.lengthCm ?? 0;
    const w = g.widthCm ?? 0;
    const h = g.heightCm ?? 0;
    const wt = g.weightKg !== null && g.weightKg !== undefined ? Number(g.weightKg).toFixed(2) : "0.00";
    return `${g.boxCount} BOX (${l}X${w}X${h}____${wt} KG )`;
  });

  return {
    boxLines: lines.join("\n"),
    totalBoxes,
  };
}

/**
 * Resolves the destination warehouse address string from order fields
 */
export function resolveDeliveryAddress(order: AppointmentOrder): string {
  const custom = (order.customData as any) || {};
  const warehouse = order.warehouseName?.trim() || "";
  const address = (custom.warehouseAddress || custom.deliveredTo || order.client?.address || "").trim();

  if (warehouse && address) {
    if (address.toLowerCase().includes(warehouse.toLowerCase())) {
      return address;
    }
    return `${warehouse} ${address}`;
  }
  return warehouse || address || "Warehouse Address";
}

/**
 * Formats date into DD.MM.YYYY matching OM WhatsApp template format
 */
export function formatPickupDateForWhatsApp(dateVal?: string | Date | null): string {
  if (!dateVal) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const y = now.getFullYear();
    return `${d}.${m}.${y}`;
  }
  const dObj = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  if (isNaN(dObj.getTime())) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const y = now.getFullYear();
    return `${d}.${m}.${y}`;
  }
  const day = String(dObj.getDate()).padStart(2, "0");
  const month = String(dObj.getMonth() + 1).padStart(2, "0");
  const year = dObj.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Generates the drafted WhatsApp message from order data and configuration
 */
export function buildOmWhatsAppDraft(
  order: AppointmentOrder,
  config: OmWhatsAppConfig = DEFAULT_OM_WHATSAPP_CONFIG,
  declaredValue?: string | number
): string {
  const template = config.draftTemplate || DEFAULT_OM_WHATSAPP_CONFIG.draftTemplate;
  const pickupDate = formatPickupDateForWhatsApp(order.pickupDate);
  const pickupAddress = config.pickupAddress || DEFAULT_OM_WHATSAPP_CONFIG.pickupAddress;
  const deliveryAddress = resolveDeliveryAddress(order);
  const { boxLines, totalBoxes } = formatBoxDetailsForWhatsApp(order);
  const contactNote = config.contactNote || DEFAULT_OM_WHATSAPP_CONFIG.contactNote;

  let valStr = "";
  if (declaredValue !== undefined && declaredValue !== null && String(declaredValue).trim() !== "") {
    const num = Number(declaredValue);
    valStr = isNaN(num) ? String(declaredValue).trim() : num.toFixed(2);
  } else {
    const customVal = (order.customData as any)?.invoiceValue || (order.customData as any)?.declaredValue;
    if (customVal) {
      const num = Number(customVal);
      valStr = isNaN(num) ? String(customVal) : num.toFixed(2);
    } else {
      valStr = "0.00";
    }
  }

  return template
    .replace(/\{\{pickupDate\}\}/g, pickupDate)
    .replace(/\{\{pickupAddress\}\}/g, pickupAddress)
    .replace(/\{\{deliveryAddress\}\}/g, deliveryAddress)
    .replace(/\{\{totalBoxes\}\}/g, String(totalBoxes))
    .replace(/\{\{boxDetails\}\}/g, boxLines)
    .replace(/\{\{contactNote\}\}/g, contactNote)
    .replace(/\{\{orderValue\}\}/g, valStr);
}

/**
 * Builds direct WhatsApp Web URL pre-filled with the message
 */
export function getWhatsAppWebUrl(phone: string, text: string): string {
  const normPhone = normalizeWhatsAppPhone(phone);
  return `https://web.whatsapp.com/send?phone=${normPhone}&text=${encodeURIComponent(text)}`;
}

/**
 * Builds universal wa.me link as mobile/universal fallback
 */
export function getWhatsAppUniversalUrl(phone: string, text: string): string {
  const normPhone = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${normPhone}?text=${encodeURIComponent(text)}`;
}
