import { isVisibleInAppointmentApp } from "@/lib/order-filters";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toClientOrder } from "@/lib/order-redaction";
import { resolveCourierForChannel } from "@/lib/courier-defaults";
import { parseOptionalNumber, roundTo2 } from "@/lib/number-input";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/date-utils";
import { extractBoxDimensionGroups } from "@/lib/dimension-helper";
import {
  getSingleAppointmentNote,
  saveSingleAppointmentNote,
  deleteSingleAppointmentNote,
} from "@/lib/appointment-notes";
import { hasPodOnRecord } from "@/lib/pod";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.isLogisticsAuthorized) {
      return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
    }

    const { id } = await params;

    const [order, personalNoteItem] = await Promise.all([
      db.consignmentOrder.findUnique({
        where: { id },
        include: {
          client: true,
          items: true,
          statusHistory: {
            orderBy: { timestamp: "desc" },
            take: 25,
          },
          auditLogs: {
            orderBy: { timestamp: "desc" },
            take: 25,
          },
        },
      }),
      getSingleAppointmentNote(id),
    ]);

    if (!order || !isVisibleInAppointmentApp(order)) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const boxDimensionGroups = extractBoxDimensionGroups(order);

    return NextResponse.json({
      order: {
        ...toClientOrder(order),
        boxDimensionGroups,
        trackingLink: order.trackingLink || null, // No automatic external URL generation
        personalNote: personalNoteItem?.note || null,
        personalNoteUpdatedAt: personalNoteItem?.updatedAt ? personalNoteItem.updatedAt.toISOString() : null,
        personalNoteUpdatedBy: personalNoteItem?.updatedBy || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load order details" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.isLogisticsAuthorized) {
      return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const existing = await db.consignmentOrder.findUnique({
      where: { id },
    });

    if (!existing || !isVisibleInAppointmentApp(existing)) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Input Validation
    if (body.trackingLink !== undefined && body.trackingLink !== null && String(body.trackingLink).trim() !== "") {
      const trimmedLink = String(body.trackingLink).trim();
      try {
        const parsedUrl = new URL(trimmedLink);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return NextResponse.json(
            { error: "Tracking URL must start with http:// or https://" },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid tracking URL structure. Please enter a valid web URL." },
          { status: 400 }
        );
      }
    }

    if (body.appointmentDate !== undefined && body.appointmentDate !== null && String(body.appointmentDate).trim() !== "") {
      const parsedDate = parseDateInput(body.appointmentDate);
      if (!parsedDate) {
        return NextResponse.json(
          { error: "Invalid appointment date format. Expected valid ISO or YYYY-MM-DD date." },
          { status: 400 }
        );
      }
    }

    if (body.deliveryDate !== undefined && body.deliveryDate !== null && String(body.deliveryDate).trim() !== "") {
      const parsedDate = parseDateInput(body.deliveryDate);
      if (!parsedDate) {
        return NextResponse.json(
          { error: "Invalid delivery date format. Expected valid ISO or YYYY-MM-DD date." },
          { status: 400 }
        );
      }
    }

    if (body.pickupDate !== undefined && body.pickupDate !== null && String(body.pickupDate).trim() !== "") {
      const parsedDate = parseDateInput(body.pickupDate);
      if (!parsedDate) {
        return NextResponse.json(
          { error: "Invalid pickup date format. Expected valid ISO or YYYY-MM-DD date." },
          { status: 400 }
        );
      }
    }

    // Courier policy (Golden Rules 4–6): only the couriers allowed for this channel may be assigned.
    let canonicalCourier: string | null | undefined = undefined;
    const requestedCourier = body.courierPartner ? String(body.courierPartner).trim() : "";
    const courierUnchanged = requestedCourier !== "" && requestedCourier === (existing.courierPartner || "");
    // An unchanged (possibly legacy) courier is re-sent by the details drawer on every save: let it through.
    if (body.courierPartner !== undefined && !courierUnchanged) {
      const resolved = resolveCourierForChannel(existing.channel, body.courierPartner);
      if (!resolved.ok) {
        return NextResponse.json(
          {
            error: `${String(body.courierPartner).trim()} is not an allowed courier for ${existing.channel} orders. Allowed: ${resolved.allowed.join(", ")}.`,
            code: "COURIER_NOT_ALLOWED",
          },
          { status: 400 }
        );
      }
      canonicalCourier = resolved.courier;
    }

    // Numeric fields: reject garbage / negatives instead of writing NaN (which fails the DB write with a 500)
    const NUMERIC_FIELDS = [
      "boxCount", "lengthCm", "widthCm", "heightCm", "weightKg",
      "remainderQty", "remainderLengthCm", "remainderWidthCm", "remainderHeightCm", "remainderWeightKg",
      "invoiceValue",
    ] as const;
    const parsedNumbers: Partial<Record<(typeof NUMERIC_FIELDS)[number], number | null>> = {};
    for (const field of NUMERIC_FIELDS) {
      if (body[field] === undefined) continue;
      const parsed = parseOptionalNumber(body[field]);
      if (!parsed.ok) {
        return NextResponse.json({ error: `${field} must be a number of 0 or more.` }, { status: 400 });
      }
      parsedNumbers[field] = parsed.value;
    }

    // Prepare update data payload - synchronizing with Consignment Operations DB
    const dataToUpdate: Record<string, any> = {};
    const auditEntries: Array<{ field: string; oldVal: string; newVal: string }> = [];

    // 1. Tracking ID / CN (Consignment Note Number)
    if (body.trackingId !== undefined) {
      const trimmed = body.trackingId ? String(body.trackingId).trim() : null;
      if (trimmed !== existing.trackingId) {
        dataToUpdate.trackingId = trimmed;
        auditEntries.push({
          field: "trackingId",
          oldVal: existing.trackingId || "(none)",
          newVal: trimmed || "(none)",
        });

        // Auto-advance courier status from Pending to Tracking Assigned if appropriate
        if (trimmed && (!existing.courierStatus || existing.courierStatus.toLowerCase() === "pending")) {
          dataToUpdate.courierStatus = "Tracking Assigned";
        }
      }
    }

    // 2. Courier Partner
    if (canonicalCourier !== undefined) {
      const trimmed = canonicalCourier;
      if (trimmed !== existing.courierPartner) {
        dataToUpdate.courierPartner = trimmed;
        auditEntries.push({
          field: "courierPartner",
          oldVal: existing.courierPartner || "(none)",
          newVal: trimmed || "(none)",
        });
      }
    }

    // 3. Manual Tracking Link (strictly user-entered, no automatic generation)
    if (body.trackingLink !== undefined) {
      const trimmed = body.trackingLink ? String(body.trackingLink).trim() : null;
      if (trimmed !== existing.trackingLink) {
        dataToUpdate.trackingLink = trimmed;
        auditEntries.push({
          field: "trackingLink",
          oldVal: existing.trackingLink || "(none)",
          newVal: trimmed || "(none)",
        });
      }
    }

    // 4. Appointment ID
    if (body.appointmentId !== undefined) {
      const trimmed = body.appointmentId ? String(body.appointmentId).trim() : null;
      if (trimmed !== existing.appointmentId) {
        dataToUpdate.appointmentId = trimmed;
        auditEntries.push({
          field: "appointmentId",
          oldVal: existing.appointmentId || "(none)",
          newVal: trimmed || "(none)",
        });
      }
    }

    // 5. Appointment Date
    if (body.appointmentDate !== undefined) {
      const parsedDate = parseDateInput(body.appointmentDate);
      const oldDateStr = existing.appointmentDate ? existing.appointmentDate.toISOString() : null;
      const newDateStr = parsedDate ? parsedDate.toISOString() : null;
      if (oldDateStr !== newDateStr) {
        dataToUpdate.appointmentDate = parsedDate;
        auditEntries.push({
          field: "appointmentDate",
          oldVal: oldDateStr || "(none)",
          newVal: newDateStr || "(none)",
        });

        // If appointment date is scheduled and status is pending/tracking assigned, promote to Appointment Scheduled
        if (parsedDate && (!existing.courierStatus || ["pending", "tracking assigned"].includes(existing.courierStatus.toLowerCase()))) {
          dataToUpdate.courierStatus = "Appointment Scheduled";
        }
      }
    }

    // 6. Appointment Slot
    if (body.appointmentSlot !== undefined) {
      const trimmed = body.appointmentSlot ? String(body.appointmentSlot).trim() : null;
      if (trimmed !== existing.appointmentSlot) {
        dataToUpdate.appointmentSlot = trimmed;
        auditEntries.push({
          field: "appointmentSlot",
          oldVal: existing.appointmentSlot || "(none)",
          newVal: trimmed || "(none)",
        });
      }
    }

    // 7. Delivery Date
    if (body.deliveryDate !== undefined) {
      const parsedDate = parseDateInput(body.deliveryDate);
      const oldDateStr = existing.deliveryDate ? existing.deliveryDate.toISOString() : null;
      const newDateStr = parsedDate ? parsedDate.toISOString() : null;
      if (oldDateStr !== newDateStr) {
        dataToUpdate.deliveryDate = parsedDate;
        auditEntries.push({
          field: "deliveryDate",
          oldVal: oldDateStr || "(none)",
          newVal: newDateStr || "(none)",
        });
      }
    }

    // 8. Pickup Date & Pickup Done
    if (body.pickupDate !== undefined) {
      const parsedDate = parseDateInput(body.pickupDate);
      const oldDateStr = existing.pickupDate ? existing.pickupDate.toISOString() : null;
      const newDateStr = parsedDate ? parsedDate.toISOString() : null;
      if (oldDateStr !== newDateStr) {
        dataToUpdate.pickupDate = parsedDate;
        auditEntries.push({
          field: "pickupDate",
          oldVal: oldDateStr || "(none)",
          newVal: newDateStr || "(none)",
        });
      }
    }

    if (body.pickupDone !== undefined) {
      const isDone = Boolean(body.pickupDone);
      if (isDone !== existing.pickupDone) {
        dataToUpdate.pickupDone = isDone;
        if (isDone && !dataToUpdate.pickupDate && !existing.pickupDate) {
          dataToUpdate.pickupDate = new Date();
        }
        auditEntries.push({
          field: "pickupDone",
          oldVal: String(existing.pickupDone),
          newVal: String(isDone),
        });
      }
    }

    // 9. Logistics Remarks / Comment
    if (body.comment !== undefined) {
      const trimmed = body.comment ? String(body.comment).trim() : null;
      if (trimmed !== existing.comment) {
        dataToUpdate.comment = trimmed;
        auditEntries.push({
          field: "comment",
          oldVal: existing.comment || "(none)",
          newVal: trimmed || "(none)",
        });
      }
    }

    // 10. Box Dimensions & Count Updates
    if (parsedNumbers.boxCount !== undefined) {
      const count = parsedNumbers.boxCount === null ? null : Math.trunc(parsedNumbers.boxCount) || null;
      if (count !== existing.boxCount) {
        dataToUpdate.boxCount = count;
        auditEntries.push({ field: "boxCount", oldVal: String(existing.boxCount), newVal: String(count) });
      }
    }
    // 0 means "not set" for dimensions (matches the previous truthiness check); weights keep 2 decimals.
    const asDim = (v: number | null | undefined) => (v ? v : null);
    if (parsedNumbers.lengthCm !== undefined) dataToUpdate.lengthCm = asDim(parsedNumbers.lengthCm);
    if (parsedNumbers.widthCm !== undefined) dataToUpdate.widthCm = asDim(parsedNumbers.widthCm);
    if (parsedNumbers.heightCm !== undefined) dataToUpdate.heightCm = asDim(parsedNumbers.heightCm);
    if (parsedNumbers.weightKg !== undefined) dataToUpdate.weightKg = parsedNumbers.weightKg ? roundTo2(parsedNumbers.weightKg) : null;
    if (parsedNumbers.remainderQty !== undefined) dataToUpdate.remainderQty = parsedNumbers.remainderQty ? Math.trunc(parsedNumbers.remainderQty) : null;
    if (parsedNumbers.remainderLengthCm !== undefined) dataToUpdate.remainderLengthCm = asDim(parsedNumbers.remainderLengthCm);
    if (parsedNumbers.remainderWidthCm !== undefined) dataToUpdate.remainderWidthCm = asDim(parsedNumbers.remainderWidthCm);
    if (parsedNumbers.remainderHeightCm !== undefined) dataToUpdate.remainderHeightCm = asDim(parsedNumbers.remainderHeightCm);
    if (parsedNumbers.remainderWeightKg !== undefined) dataToUpdate.remainderWeightKg = parsedNumbers.remainderWeightKg ? roundTo2(parsedNumbers.remainderWeightKg) : null;
    if (body.boxDimensions !== undefined) dataToUpdate.boxDimensions = body.boxDimensions ? String(body.boxDimensions).trim() : null;

    // 11. Status & Courier Status Synchronization (PAIRED WITH MAIN CONSIGNMENT APP)
    let statusChanged = false;
    let fromStatus = existing.status || existing.courierStatus || "Pending";
    let toStatus = fromStatus;

    // Direct Status Update (e.g. Delivered, GRN Issue, In Transit)
    const targetStatus = body.status !== undefined ? String(body.status).trim() : (body.courierStatus !== undefined ? String(body.courierStatus).trim() : null);

    // GRN Issue is raised only from the main app's GRN desk (after the GRN report is checked);
    // cancellation only in the main app with an Admin OTP.
    if (targetStatus && targetStatus !== existing.status) {
      const t = targetStatus.toLowerCase();
      if (t === "grn issue" || t === "shortage" || t === "damaged") {
        return NextResponse.json(
          { error: "GRN issues are raised in the main consignment app's GRN desk, not here.", code: "GRN_VIA_MAIN_APP" },
          { status: 400 }
        );
      }
      if (t === "cancelled" || t === "canceled") {
        return NextResponse.json(
          { error: "Orders are cancelled only in the main consignment app (Admin OTP).", code: "CANCEL_VIA_MAIN_APP" },
          { status: 400 }
        );
      }
    }
    if (body.grnStatus !== undefined || body.grnReport !== undefined) {
      return NextResponse.json(
        { error: "GRN fields are managed by the main consignment app's GRN desk.", code: "GRN_VIA_MAIN_APP" },
        { status: 400 }
      );
    }

    if (targetStatus && targetStatus !== existing.status) {
      statusChanged = true;
      toStatus = targetStatus;
      dataToUpdate.status = targetStatus;
      dataToUpdate.courierStatus = targetStatus;

      auditEntries.push({
        field: "status",
        oldVal: existing.status || "(none)",
        newVal: targetStatus,
      });

      // Special handling per status
      const sLower = targetStatus.toLowerCase();
      if (sLower === "delivered") {
        // POD is mandatory: Delivered is only reachable with a proof-of-delivery file on record
        // (POST /api/orders/:id/deliver uploads it and marks the order Delivered in one step).
        if (!hasPodOnRecord(existing.customData)) {
          return NextResponse.json(
            {
              error: "Upload the POD (proof of delivery) to mark this order Delivered.",
              code: "POD_REQUIRED",
            },
            { status: 400 }
          );
        }
        dataToUpdate.pickupDone = true;
        if (!dataToUpdate.deliveryDate && !existing.deliveryDate) {
          dataToUpdate.deliveryDate = new Date();
        }
        // The platform's GRN is reconciled in the main consignment app's Delivered tab
        dataToUpdate.grnStatus = body.grnStatus || "Awaiting GRN";
        // Sync customData fulfillment status
        const existingCustom = (existing.customData as any) || {};
        dataToUpdate.customData = { ...existingCustom, fulfilmentStatus: "Delivered" };
      } else if (sLower === "grn issue") {
        dataToUpdate.grnStatus = body.grnStatus || "GRN Issue";
        if (body.grnReport) {
          dataToUpdate.grnReport = String(body.grnReport).trim();
        }
      } else if (sLower === "in transit") {
        dataToUpdate.pickupDone = true;
        if (!dataToUpdate.pickupDate && !existing.pickupDate) {
          dataToUpdate.pickupDate = new Date();
        }
        const existingCustom = (existing.customData as any) || {};
        dataToUpdate.customData = { ...existingCustom, fulfilmentStatus: "Dispatched" };
      }
    }

    if (body.grnStatus !== undefined) {
      const trimmedGrn = body.grnStatus ? String(body.grnStatus).trim() : null;
      if (trimmedGrn !== existing.grnStatus) {
        dataToUpdate.grnStatus = trimmedGrn;
        auditEntries.push({
          field: "grnStatus",
          oldVal: existing.grnStatus || "(none)",
          newVal: trimmedGrn || "(none)",
        });
      }
    }

    if (body.grnReport !== undefined) {
      const trimmedReport = body.grnReport ? String(body.grnReport).trim() : null;
      if (trimmedReport !== existing.grnReport) {
        dataToUpdate.grnReport = trimmedReport;
        auditEntries.push({
          field: "grnReport",
          oldVal: existing.grnReport || "(none)",
          newVal: trimmedReport || "(none)",
        });
      }
    }

    // Declared invoice value (entered in the OM WhatsApp booking window); lives in customData.
    if (parsedNumbers.invoiceValue !== undefined) {
      const baseCustom = (dataToUpdate.customData ?? (existing.customData as any) ?? {}) as Record<string, any>;
      const oldVal = baseCustom.invoiceValue ?? null;
      const newVal = parsedNumbers.invoiceValue === null ? null : roundTo2(parsedNumbers.invoiceValue);
      const changed = oldVal === null ? newVal !== null : newVal === null || Number(oldVal) !== newVal;
      if (changed) {
        const nextCustom = { ...baseCustom };
        if (newVal === null) delete nextCustom.invoiceValue;
        else nextCustom.invoiceValue = newVal;
        dataToUpdate.customData = nextCustom;
        auditEntries.push({
          field: "invoiceValue",
          oldVal: oldVal === null ? "(none)" : String(oldVal),
          newVal: newVal === null ? "(none)" : newVal.toFixed(2),
        });
      }
    }

    const hasPersonalNoteUpdate = body.personalNote !== undefined;

    if (Object.keys(dataToUpdate).length === 0 && !hasPersonalNoteUpdate) {
      return NextResponse.json({ order: toClientOrder(existing), message: "No changes detected" });
    }

    if (Object.keys(dataToUpdate).length > 0) {
      dataToUpdate.updatedAt = new Date();
    }

    // Execute atomic transaction
    const updatedOrder = await db.$transaction(async (tx) => {
      let updated;
      if (Object.keys(dataToUpdate).length > 0) {
        updated = await tx.consignmentOrder.update({
          where: { id },
          data: dataToUpdate,
          include: {
            client: true,
            items: true,
            statusHistory: {
              orderBy: { timestamp: "desc" },
              take: 20,
            },
            auditLogs: {
              orderBy: { timestamp: "desc" },
              take: 20,
            },
          },
        });
      } else {
        updated = await tx.consignmentOrder.findUniqueOrThrow({
          where: { id },
          include: {
            client: true,
            items: true,
            statusHistory: {
              orderBy: { timestamp: "desc" },
              take: 20,
            },
            auditLogs: {
              orderBy: { timestamp: "desc" },
              take: 20,
            },
          },
        });
      }

      // Handle isolated personal notes (safely self-healing)
      let activePersonalNote: any = null;
      if (hasPersonalNoteUpdate) {
        const noteStr = body.personalNote ? String(body.personalNote).trim() : "";
        if (noteStr) {
          activePersonalNote = await saveSingleAppointmentNote(
            id,
            noteStr,
            user.name || user.username,
            tx
          );
        } else {
          await deleteSingleAppointmentNote(id, tx);
        }
      } else {
        activePersonalNote = await getSingleAppointmentNote(id, tx);
      }

      // Record OrderStatusHistory if status changed
      if (statusChanged && toStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            fromStatus: fromStatus,
            toStatus: toStatus,
            userId: user.id,
            userName: user.name || user.username,
            userRole: user.role,
            department: user.department || "Logistics",
            reason: body.remarks || `Status manually changed to "${toStatus}"`,
            metadata: {
              source: "Appointment Desk",
              trackingId: updated.trackingId,
              courierPartner: updated.courierPartner,
              grnStatus: updated.grnStatus,
            },
          },
        });
      }

      // Record AuditLog for each modified field
      for (const entry of auditEntries) {
        await tx.auditLog.create({
          data: {
            orderId: id,
            userId: user.id,
            userName: user.name || user.username,
            userRole: user.role,
            action: "UPDATE",
            fieldChanged: entry.field,
            oldValue: entry.oldVal,
            newValue: entry.newVal,
            metadata: {
              app: "Appointment Management",
              channel: existing.channel,
              roPoNumber: existing.roPoNumber,
            },
          },
        });
      }

      return {
        ...toClientOrder(updated),
        boxDimensionGroups: extractBoxDimensionGroups(updated),
        personalNote: activePersonalNote?.note || null,
        personalNoteUpdatedAt: activePersonalNote?.updatedAt
          ? activePersonalNote.updatedAt.toISOString()
          : null,
        personalNoteUpdatedBy: activePersonalNote?.updatedBy || null,
      };
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: "Order updated successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update order" },
      { status: 500 }
    );
  }
}
