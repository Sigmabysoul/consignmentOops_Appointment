import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isVisibleInAppointmentApp } from "@/lib/order-filters";
import {
  DOCUMENT_SLOTS,
  MAX_DOCUMENT_BYTES,
  OrderDocumentView,
  consignmentAppUrl,
  isAcceptedForSlot,
  safeFileName,
  slotConfig,
  slotForDocType,
} from "@/lib/order-documents";

export const dynamic = "force-dynamic";

async function loadVisibleOrder(id: string) {
  const order = await db.consignmentOrder.findUnique({
    where: { id },
    select: {
      id: true,
      roPoNumber: true,
      channel: true,
      status: true,
      courierStatus: true,
      isDeleted: true,
      isArchived: true,
      customData: true,
    },
  });
  return order && isVisibleInAppointmentApp(order) ? order : null;
}

function toView(orderId: string, doc: { id: string; docType: string; fileName: string; fileUrl: string; fileSize: number | null; createdAt: Date; uploadedByName: string | null; blob: { documentId: string } | null }): OrderDocumentView | null {
  const slot = slotForDocType(doc.docType);
  if (!slot) return null;
  let viewUrl: string | null = null;
  if (doc.blob) viewUrl = `/api/orders/${orderId}/documents/${doc.id}`;
  else if (/^https?:\/\//i.test(doc.fileUrl)) viewUrl = doc.fileUrl;
  else if (doc.fileUrl.startsWith("/")) viewUrl = `${consignmentAppUrl()}${doc.fileUrl}`; // main app vault file
  return {
    id: doc.id,
    slot,
    docType: doc.docType,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    uploadedAt: doc.createdAt.toISOString(),
    uploadedByName: doc.uploadedByName,
    viewUrl,
  };
}

/** GET — the order's tax invoice, shipping label and POD documents (newest first). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.isLogisticsAuthorized) return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });

    const { id } = await params;
    const order = await loadVisibleOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const docTypes = DOCUMENT_SLOTS.flatMap((s) => s.docTypes);
    const docs = await db.orderDocument.findMany({
      where: { orderId: id, docType: { in: docTypes } },
      select: {
        id: true,
        docType: true,
        fileName: true,
        fileUrl: true,
        fileSize: true,
        createdAt: true,
        uploadedByName: true,
        blob: { select: { documentId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const custom = (order.customData as any) || {};
    const barcodes = custom.shippingLabelBarcodes;
    return NextResponse.json({
      documents: docs.map((d) => toView(id, d)).filter(Boolean),
      // Only the count: the AWBs themselves are scan targets and never reach the browser
      shippingLabelBarcodeCount: Array.isArray(barcodes) ? barcodes.length : 0,
    });
  } catch (error: any) {
    console.error("[documents] list failed:", error);
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }
}

/**
 * POST multipart { file, slot } — upload a tax invoice (stored here) or a courier shipping label
 * (forwarded to the main app, which extracts the box AWBs for BoxTrace). POD goes through
 * Mark Delivered, never through this route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.isLogisticsAuthorized) return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });

    const { id } = await params;
    const order = await loadVisibleOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const form = await req.formData();
    const slot = slotConfig(String(form.get("slot") || ""));
    if (!slot) return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
    if (slot.slot === "POD") {
      return NextResponse.json(
        { error: "Upload the POD with Mark Delivered: it records the delivery and the proof together.", code: "POD_VIA_MARK_DELIVERED" },
        { status: 400 }
      );
    }

    const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Attach a file." }, { status: 400 });
    const f = file as File;
    const fileName = safeFileName(f.name, slot.slot === "TAX_INVOICE" ? "invoice.pdf" : "label.pdf");
    if (f.size === 0) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
    if (f.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: `File is too large. Maximum size is ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.` }, { status: 413 });
    }
    if (!isAcceptedForSlot(slot, fileName)) {
      return NextResponse.json({ error: `${slot.label} must be one of: ${slot.extensions.join(", ")}` }, { status: 415 });
    }
    const actor = user.name || user.username;

    if (slot.slot === "TAX_INVOICE") {
      const buffer = Buffer.from(await f.arrayBuffer());
      const docId = crypto.randomUUID();
      const doc = await db.$transaction(async (tx) => {
        const created = await tx.orderDocument.create({
          data: {
            id: docId,
            orderId: id,
            roPoNumber: order.roPoNumber,
            channel: order.channel,
            docType: slot.docTypes[0],
            fileName,
            // The main app serves blobs at this path; this app at /api/orders/:id/documents/:docId
            fileUrl: `/api/documents/${docId}/file`,
            fileSize: buffer.length,
            mimeType: f.type || null,
            uploadedById: user.id,
            uploadedByName: actor,
            blob: { create: { data: buffer } },
          },
          select: { id: true, docType: true, fileName: true, fileUrl: true, fileSize: true, createdAt: true, uploadedByName: true, blob: { select: { documentId: true } } },
        });
        await tx.auditLog.create({
          data: {
            orderId: id,
            userId: user.id,
            userName: actor,
            userRole: user.role,
            action: "UPDATE",
            fieldChanged: "taxInvoice",
            oldValue: "(none)",
            newValue: fileName,
            metadata: { app: "Appointment Management", channel: order.channel, roPoNumber: order.roPoNumber },
          },
        });
        return created;
      });
      return NextResponse.json({ success: true, document: toView(id, doc) });
    }

    // Courier shipping label → main consignment app (same extraction + permission checks as there)
    const token =
      req.cookies.get("appointment_session")?.value ||
      req.cookies.get("consignment_session")?.value ||
      (req.headers.get("authorization")?.startsWith("Bearer ") ? req.headers.get("authorization")!.slice(7) : "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const forward = new FormData();
    forward.append("file", new File([await f.arrayBuffer()], fileName, { type: f.type || "application/pdf" }));
    forward.append("docType", "SHIPPING_LABEL");
    forward.append("orderId", id);
    forward.append("channel", order.channel);
    forward.append("roPoNumber", order.roPoNumber);

    let upstream: Response;
    try {
      upstream = await fetch(`${consignmentAppUrl()}/api/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: forward,
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      console.error("[documents] main app unreachable:", err);
      return NextResponse.json(
        { error: "The main consignment app could not be reached, so the label was not saved. Try again, or upload it in the main app.", code: "MAIN_APP_UNREACHABLE" },
        { status: 502 }
      );
    }
    const data: any = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error || `The main app refused the label (HTTP ${upstream.status}).` },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }
    const extracted = Array.isArray(data?.extractedBarcodes) ? data.extractedBarcodes.length : 0;
    return NextResponse.json({
      success: true,
      // AWB values stay server-side (scan targets); the desk only needs to know how many were read
      extractedBarcodeCount: extracted,
    });
  } catch (error: any) {
    console.error("[documents] upload failed:", error);
    return NextResponse.json({ error: "Failed to upload the document" }, { status: 500 });
  }
}
