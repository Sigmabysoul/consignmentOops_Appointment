/**
 * Read-only view of the Consignment app's (App 1) floor statuses for the Booking Desk.
 *
 * App 1 owns these values; this app only displays them. The logic mirrors
 * `derivePrintingStatus` / `deriveFulfilmentStatus` in consignment/src/lib/order-status-engine.ts
 * using the fields this app receives (no per-item print flags are loaded here, so the
 * label App 1 stores in `customData.printingStatus` on every print is the primary source).
 */

/** Same palette as consignment/src/lib/order-tone.ts (see src/lib/order-tone.ts here). */
export type StatusTone = "slate" | "red" | "amber" | "yellow" | "lime" | "green" | "deepgreen" | "purple" | "orange" | "grey";

export interface ConsignmentStatusView {
  label: string;
  tone: StatusTone;
}

interface StatusSource {
  status?: string | null;
  pickupDone?: boolean | null;
  docsPrinted?: boolean | null;
  boxesPacked?: boolean | null;
  dimensionConfirmed?: boolean | null;
  customData?: any;
}

/** Strips the decorations App 1 adds to its print label ("Docs Printed ✓", "⚠️ 2 Modified"). */
function cleanLabel(raw: string): string {
  return raw.replace(/[✓⚠️️]/g, "").replace(/\s+/g, " ").trim();
}

export function getPrintingStatus(order: StatusSource): ConsignmentStatusView {
  const custom = (order.customData as Record<string, any>) || {};
  const stored = typeof custom.printingStatus === "string" ? cleanLabel(custom.printingStatus) : "";

  if (/modified/i.test(stored)) return { label: stored, tone: "orange" };
  if (/^partial/i.test(stored)) return { label: stored.replace(/^partial docs printed$/i, "Partial Print"), tone: "yellow" };
  if (order.docsPrinted || /^docs printed/i.test(stored)) return { label: "Docs Printed", tone: "lime" };

  const slipPrinted =
    custom.documentPrintStatus?.PACKAGING_SLIP?.isPrinted === true || custom.packagingSlipPrinted === true;
  if (slipPrinted) return { label: "Slip Printed", tone: "yellow" };

  return { label: "Pending Print", tone: "slate" };
}

export function getFulfilmentStatus(order: StatusSource): ConsignmentStatusView {
  const custom = (order.customData as Record<string, any>) || {};
  const s = (order.status || "").toLowerCase();
  const fs = String(custom.fulfilmentStatus || "").trim();

  if (s.includes("error")) return { label: "Pick Up Error", tone: "orange" };
  if (order.pickupDone || s.includes("transit") || s.includes("dispatched") || fs.toUpperCase() === "DISPATCHED") {
    return { label: "Dispatched", tone: "purple" };
  }
  if (order.boxesPacked || s.includes("packed") || fs === "Packed") return { label: "Packed", tone: "green" };
  if (fs === "Packaging in Progress" || s === "packaging in progress" || custom.packagingInProgress) {
    return { label: "Packaging in Progress", tone: "amber" };
  }
  if (fs === "Clear Bag Assigned") return { label: fs, tone: "amber" };
  if (order.dimensionConfirmed || fs === "Box Dimension Approved") return { label: "Box Dimension Approved", tone: "lime" };
  if (fs && fs !== "Box Dimension Pending") return { label: fs, tone: "slate" };
  return { label: "Box Dimension Pending", tone: "slate" };
}

export function getOrderStatus(order: StatusSource): ConsignmentStatusView {
  const label = (order.status || "").trim() || "Pending";
  const s = label.toLowerCase();
  const tone: StatusTone =
    s.includes("cancel") ? "grey"
    : s.includes("grn") || s.includes("error") || s.includes("issue") ? "orange"
    : s.includes("delivered") ? "deepgreen"
    : s.includes("transit") || s.includes("dispatch") || s.includes("shipped") ? "purple"
    : s === "packed" ? "green"
    : s === "draft" ? "slate"
    : s === "new" ? "red"
    : "amber";
  return { label, tone };
}
