/**
 * Proof of Delivery (POD) — shared, client-safe helpers.
 *
 * Logistics must attach a POD when marking an order Delivered. The file is stored as an
 * OrderDocument (docType "POD") with its bytes in DocumentBlob, because this app and the main
 * consignment app run in separate containers with no shared disk; the main app shows it on the
 * GRN Issue tab so the platform manager can judge whether the carrier was at fault.
 * `customData.pod` keeps the same shape the main app reads (see consignment/src/modules/grn).
 */
export const POD_DOC_TYPE = "POD";
export const MAX_POD_BYTES = 15 * 1024 * 1024;
export const POD_ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"] as const;

export interface PodRecord {
  documentId: string;
  fileName: string;
  mimeType: string | null;
  uploadedAt: string;
  uploadedBy: string;
  source: "APPOINTMENT_APP" | "CONSIGNMENT_APP";
}

export function getPodRecord(customData: unknown): PodRecord | null {
  const pod = (customData as any)?.pod;
  return pod && typeof pod === "object" && pod.documentId ? (pod as PodRecord) : null;
}

export function hasPodOnRecord(customData: unknown): boolean {
  return getPodRecord(customData) !== null;
}

export function isAcceptedPodFile(fileName: string): boolean {
  const lower = (fileName || "").toLowerCase();
  return POD_ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function podFileUrl(orderId: string): string {
  return `/api/orders/${orderId}/pod`;
}
