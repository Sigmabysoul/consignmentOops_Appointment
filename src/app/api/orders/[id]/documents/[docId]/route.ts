import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isVisibleInAppointmentApp } from "@/lib/order-filters";
import { fileExtension, safeFileName, slotForDocType } from "@/lib/order-documents";

export const dynamic = "force-dynamic";

const INLINE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** GET — opens a stored tax invoice / label / POD of a visible order (type from the extension). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.isLogisticsAuthorized) return new NextResponse("Forbidden", { status: 403 });

  const { id, docId } = await params;
  const order = await db.consignmentOrder.findUnique({
    where: { id },
    select: { status: true, courierStatus: true, isDeleted: true, isArchived: true, customData: true },
  });
  if (!order || !isVisibleInAppointmentApp(order)) return new NextResponse("Not Found", { status: 404 });

  const doc = await db.orderDocument.findUnique({
    where: { id: docId },
    select: { orderId: true, docType: true, fileName: true, blob: { select: { data: true } } },
  });
  // Only this order's invoice / label / POD documents are served here
  if (!doc || doc.orderId !== id || !doc.blob || !slotForDocType(doc.docType)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const type = INLINE_TYPES[fileExtension(doc.fileName)];
  return new NextResponse(new Uint8Array(doc.blob.data), {
    headers: {
      "Content-Type": type || "application/octet-stream",
      "Content-Disposition": `${type ? "inline" : "attachment"}; filename="${safeFileName(doc.fileName)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
