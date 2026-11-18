/**
 * customData keys that must never leave the server. Mirrors SERVER_ONLY_CUSTOM_DATA_KEYS in
 * consignment/src/lib/order-status-engine.ts (both apps read the same database):
 * - cancelOtp: the admin-issued single-use cancellation code.
 * - shippingLabelBarcodes: the expected courier AWBs that BoxTrace dispatch scans are checked
 *   against (operators must physically scan the label, so they must not be able to read them).
 */
export const SERVER_ONLY_CUSTOM_DATA_KEYS = ["cancelOtp", "shippingLabelBarcodes"] as const;

/** Returns a copy of customData without server-only secrets (never mutates the input). */
export function redactCustomData(customData: unknown): Record<string, any> | null {
  if (customData === null || customData === undefined) return null;
  if (typeof customData !== "object" || Array.isArray(customData)) return customData as any;
  const copy: Record<string, any> = { ...(customData as Record<string, any>) };
  for (const key of SERVER_ONLY_CUSTOM_DATA_KEYS) delete copy[key];
  const barcodes = (customData as any).shippingLabelBarcodes;
  if (Array.isArray(barcodes)) copy.shippingLabelBarcodeCount = barcodes.length;
  return copy;
}

/** Shallow copy of an order that is safe to send to the browser. */
export function toClientOrder<T extends { customData?: unknown }>(order: T): T {
  if (!order || !("customData" in order)) return order;
  return { ...order, customData: redactCustomData(order.customData) };
}
