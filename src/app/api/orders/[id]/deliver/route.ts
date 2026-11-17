import { isVisibleInAppointmentApp } from "@/lib/order-filters";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/date-utils";
import { extractBoxDimensionGroups } from "@/lib/dimension-helper";
import { MAX_POD_BYTES, POD_ACCEPTED_EXTENSIONS, POD_DOC_TYPE, PodRecord, isAcceptedPodFile } from "@/lib/pod";

export const dynamic = "force-dynamic";

const CLOSED_STATUSES = ["delivered", "cancelled", "archive", "archived", "grn issue"];

/**
 * POST multipart { file, deliveryDate?, remarks? } — Mark Delivered with mandatory POD.
 * Stores the POD and moves the order to Delivered in one transaction.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.isLogisticsAuthorized) {
      return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.consignmentOrder.findUnique({ where: { id } });
    if (!existing || !isVisibleInAppointmentApp(existing)) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (CLOSED_STATUSES.includes(String(existing.status || "").toLowerCase())) {
      return NextResponse.json({ error: `This order is already "${existing.status}".` }, { status: 409 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Attach the POD (proof of delivery) file.", code: "POD_REQUIRED" }, { status: 400 });
    }
    const f = file as File;
    const fileName = (f.name || "POD").replace(/[^a-zA-Z0-9._-]/g, "_");
    if (f.size === 0) return NextResponse.json({ error: "The POD file is empty." }, { status: 400 });
    if (f.size > MAX_POD_BYTES) {
      return NextResponse.json({ error: `POD is too large. Maximum size is ${MAX_POD_BYTES / (1024 * 1024)} MB.` }, { status: 413 });
    }
    if (!isAcceptedPodFile(fileName)) {
      return NextResponse.json({ error: `POD must be one of: ${POD_ACCEPTED_EXTENSIONS.join(", ")}` }, { status: 415 });
    }

    const rawDate = form.get("deliveryDate");
    let deliveryDate = new Date();
    if (rawDate && String(rawDate).trim()) {
      const parsed = parseDateInput(String(rawDate));
      if (!parsed) return NextResponse.json({ error: "Invalid delivery date." }, { status: 400 });
      if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Delivery date cannot be in the future." }, { status: 400 });
      }
      deliveryDate = parsed;
    }
    const remarks = String(form.get("remarks") || "").trim();
    const buffer = Buffer.from(await f.arrayBuffer());
    const actor = user.name || user.username;

    const updated = await db.$transaction(async (tx) => {
      const doc = await tx.orderDocument.create({
        data: {
          orderId: id,
          roPoNumber: existing.roPoNumber,
          channel: existing.channel,
          docType: POD_DOC_TYPE,
          fileName,
          fileUrl: "pending",
          fileSize: buffer.length,
          mimeType: f.type || null,
          uploadedById: user.id,
          uploadedByName: actor,
          blob: { create: { data: buffer } },
        },
      });
      // Served by the main app at this path; this app serves it at /api/orders/:id/pod
      await tx.orderDocument.update({ where: { id: doc.id }, data: { fileUrl: `/api/documents/${doc.id}/file` } });

      const custom = (existing.customData as any) || {};
      const pod: PodRecord = {
        documentId: doc.id,
        fileName,
        mimeType: f.type || null,
        uploadedAt: new Date().toISOString(),
        uploadedBy: actor,
        source: "APPOINTMENT_APP",
      };

      const order = await tx.consignmentOrder.update({
        where: { id },
        data: {
          status: "Delivered",
          courierStatus: "Delivered",
          pickupDone: true,
          deliveryDate,
          grnStatus: "Awaiting GRN",
          customData: { ...custom, fulfilmentStatus: "Delivered", pod },
          updatedAt: new Date(),
        },
        include: { client: true, items: true },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: existing.status || existing.courierStatus || "Pending",
          toStatus: "Delivered",
          userId: user.id,
          userName: actor,
          userRole: user.role,
          department: user.department || "Logistics",
          reason: remarks || "Marked Delivered from Appointment Desk with POD",
          metadata: { source: "Appointment Desk", podDocumentId: doc.id, podFileName: fileName },
        },
      });
      for (const entry of [
        { field: "status", oldVal: existing.status || "(none)", newVal: "Delivered" },
        { field: "pod", oldVal: custom.pod?.fileName || "(none)", newVal: fileName },
      ]) {
        await tx.auditLog.create({
          data: {
            orderId: id,
            userId: user.id,
            userName: actor,
            userRole: user.role,
            action: "UPDATE",
            fieldChanged: entry.field,
            oldValue: entry.oldVal,
            newValue: entry.newVal,
            metadata: { app: "Appointment Management", channel: existing.channel, roPoNumber: existing.roPoNumber },
          },
        });
      }
      return order;
    });

    return NextResponse.json({
      success: true,
      order: { ...updated, boxDimensionGroups: extractBoxDimensionGroups(updated) },
    });
  } catch (error: any) {
    console.error("[deliver] failed:", error);
    return NextResponse.json({ error: "Failed to mark delivered" }, { status: 500 });
  }
}
