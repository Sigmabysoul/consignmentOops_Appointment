import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPodRecord } from "@/lib/pod";
import { isVisibleInAppointmentApp } from "@/lib/order-filters";

export const dynamic = "force-dynamic";

const INLINE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** GET — opens the order's POD (type taken from the file extension, never the uploaded MIME). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.isLogisticsAuthorized) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const order = await db.consignmentOrder.findUnique({
    where: { id },
    select: { customData: true, status: true, courierStatus: true, isDeleted: true, isArchived: true },
  });
  // Same visibility rule as every other route: hidden (draft / cancelled / archived / deleted) → 404
  if (!order || !isVisibleInAppointmentApp(order)) return new NextResponse("Not Found", { status: 404 });
  const pod = getPodRecord(order.customData);
  if (!pod) return new NextResponse("No POD on file", { status: 404 });

  const doc = await db.orderDocument.findUnique({
    where: { id: pod.documentId },
    select: { orderId: true, fileName: true, blob: { select: { data: true } } },
  });
  if (!doc || doc.orderId !== id || !doc.blob) return new NextResponse("Not Found", { status: 404 });

  const ext = (doc.fileName.split(".").pop() || "").toLowerCase();
  const type = INLINE_TYPES[ext];
  return new NextResponse(new Uint8Array(doc.blob.data), {
    headers: {
      "Content-Type": type || "application/octet-stream",
      "Content-Disposition": `${type ? "inline" : "attachment"}; filename="${doc.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
