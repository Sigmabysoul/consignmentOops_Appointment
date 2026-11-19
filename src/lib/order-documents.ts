/**
 * Order documents handled in the Logistics WorkHub drawer: tax invoice, courier shipping label
 * and POD. Shared definitions for the API routes and the drawer section.
 *
 * - Tax invoice: stored here as OrderDocument + DocumentBlob (docType "INVOICE"), so both apps
 *   can open it (the main app serves blobs at /api/documents/<id>/file).
 * - Courier shipping label: forwarded to the main consignment app's upload API, which reads the
 *   box AWB barcodes from it for the BoxTrace dual-scan gate (CONSIGNMENT_APP_URL).
 * - POD: uploaded through "Mark Delivered" (POD is mandatory for Delivered), shown here.
 */

export type DocumentSlot = "TAX_INVOICE" | "SHIPPING_LABEL" | "POD";

export interface DocumentSlotConfig {
  slot: DocumentSlot;
  label: string;
  hint: string;
  /** OrderDocument.docType values that fill this slot (first = the one we write). */
  docTypes: string[];
  extensions: string[];
}

export const DOCUMENT_SLOTS: DocumentSlotConfig[] = [
  {
    slot: "TAX_INVOICE",
    label: "Tax invoice",
    hint: "GST tax invoice sent with the consignment.",
    docTypes: ["INVOICE", "TAX_INVOICE", "GST_INVOICE"],
    extensions: ["pdf", "png", "jpg", "jpeg", "webp"],
  },
  {
    slot: "SHIPPING_LABEL",
    label: "Courier shipping label",
    hint: "Carrier label PDF. The main app reads each box's AWB from it for the BoxTrace dual scan.",
    docTypes: ["SHIPPING_LABEL", "LABEL"],
    extensions: ["pdf", "png", "jpg", "jpeg"],
  },
  {
    slot: "POD",
    label: "Proof of delivery (POD)",
    hint: "Uploaded with Mark Delivered. Required before an order can be Delivered.",
    docTypes: ["POD"],
    extensions: ["pdf", "png", "jpg", "jpeg", "webp"],
  },
];

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export function slotConfig(slot: unknown): DocumentSlotConfig | null {
  return DOCUMENT_SLOTS.find((s) => s.slot === slot) || null;
}

/** Which slot a stored document belongs to (null for RO/PO, challans and other types). */
export function slotForDocType(docType: string | null | undefined): DocumentSlot | null {
  const t = String(docType || "").trim().toUpperCase();
  return DOCUMENT_SLOTS.find((s) => s.docTypes.includes(t))?.slot ?? null;
}

export function fileExtension(fileName: string): string {
  return (String(fileName || "").split(".").pop() || "").toLowerCase();
}

export function isAcceptedForSlot(slot: DocumentSlotConfig, fileName: string): boolean {
  return slot.extensions.includes(fileExtension(fileName));
}

export function safeFileName(name: string, fallback = "document"): string {
  const clean = String(name || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return clean || fallback;
}

/** Base URL of the main consignment app (no trailing slash). */
export function consignmentAppUrl(): string {
  return (process.env.CONSIGNMENT_APP_URL || "https://consignmentops.averretail.com").replace(/\/+$/, "");
}

export interface OrderDocumentView {
  id: string;
  slot: DocumentSlot;
  docType: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  uploadedByName: string | null;
  /** Where the browser can open it: this app for stored files, the main app for its vault files. */
  viewUrl: string | null;
}
