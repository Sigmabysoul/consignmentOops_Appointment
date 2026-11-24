import { isVisibleInAppointmentApp, isOnAppointmentDesk, isClosedOrder, type OrderStageFields } from "@/lib/order-filters";
import { canMarkDelivered, canSeeOrder } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toClientOrder } from "@/lib/order-redaction";
import { db } from "@/lib/db";
import { parseDateInput, istDayStart } from "@/lib/date-utils";
import { extractBoxDimensionGroups } from "@/lib/dimension-helper";
import { MAX_POD_BYTES, POD_ACCEPTED_EXTENSIONS, POD_DOC_TYPE, PodRecord, isAcceptedPodFile } from "@/lib/pod";
import { ORDERED_ITEMS } from "@/lib/order-item-order";

export const dynamic = "force-dynamic";

/** A refusal decided on the locked row (the transaction is rolled back). */
class DeliverRefusal extends Error {
  constructor(public httpStatus: number, public payload: Record<string, unknown>) {
    super(String(payload.error || "Refused"));
  }
}

/**
 * Only an open, in-transit order (exactly the Appointment desk's rule) can be marked Delivered.
 * Returns the refusal, or null when the order may be delivered.
 */
function deliverRefusal(order: OrderStageFields & { isDeleted?: boolean | null }): DeliverRefusal | null {
  if (!isVisibleInAppointmentApp(order)) return new DeliverRefusal(404, { error: "Order not found" });
  if (isClosedOrder(order)) {
    return new DeliverRefusal(409, {
      error: `This order is already "${order.status || order.courierStatus}".`,
      code: "ORDER_CLOSED",
    });
  }
  if (!isOnAppointmentDesk(order)) {
    return new DeliverRefusal(409, {
      error: "Only in-transit orders can be marked Delivered. Dispatch happens through the BoxTrace gate in the main consignment app.",
      code: "NOT_IN_TRANSIT",
    });
  }
  return null;
}

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
    // Fast pre-check before reading the upload; re-checked on the locked row below
    const precheck = await db.consignmentOrder.findUnique({ where: { id } });
    if (!precheck || !canSeeOrder(user, precheck.channel)) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!canMarkDelivered(user, precheck.channel)) {
      return NextResponse.json({ error: `Forbidden: needs the 'Mark delivered' permission on ${precheck.channel}` }, { status: 403 });
    }
    const early = deliverRefusal(precheck);
    if (early) return NextResponse.json(early.payload, { status: early.httpStatus });

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
      // At most the end of today in IST (business dates are Asia/Kolkata; servers run in UTC)
      if (parsed.getTime() >= istDayStart(new Date(), 1).getTime()) {
        return NextResponse.json({ error: "Delivery date cannot be in the future." }, { status: 400 });
      }
      deliveryDate = parsed;
    }
    const remarks = String(form.get("remarks") || "").trim();
    const buffer = Buffer.from(await f.arrayBuffer());
    const actor = user.name || user.username;

    const updated = await db.$transaction(async (tx) => {
      // Lock the row and re-read it: two concurrent Mark Delivered calls cannot both pass, and
      // customData written meanwhile by the main app / Delhivery / Shiprocket is kept.
      await tx.$queryRaw`SELECT id FROM "ConsignmentOrder" WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.consignmentOrder.findUnique({ where: { id } });
      if (!existing) throw new DeliverRefusal(404, { error: "Order not found" });
      const refusal = deliverRefusal(existing);
      if (refusal) throw refusal;

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
          // pickupDone is never written here: only the main app's BoxTrace gate sets it
          deliveryDate,
          grnStatus: "Awaiting GRN",
          customData: { ...custom, fulfilmentStatus: "Delivered", pod },
          updatedAt: new Date(),
        },
        include: { client: true, items: ORDERED_ITEMS },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: existing.status || existing.courierStatus || "Pending",
          toStatus: "Delivered",
          userId: user.id,
          userName: actor,
          userRole: null,
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
            userRole: null,
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
      order: { ...toClientOrder(updated), boxDimensionGroups: extractBoxDimensionGroups(updated) },
    });
  } catch (error: any) {
    if (error instanceof DeliverRefusal) {
      return NextResponse.json(error.payload, { status: error.httpStatus });
    }
    console.error("[deliver] failed:", error);
    return NextResponse.json({ error: "Failed to mark delivered" }, { status: 500 });
  }
}
