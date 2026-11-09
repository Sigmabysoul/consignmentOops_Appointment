import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/date-utils";
import { extractBoxDimensionGroups } from "@/lib/dimension-helper";
import {
  getSingleAppointmentNote,
  saveSingleAppointmentNote,
  deleteSingleAppointmentNote,
} from "@/lib/appointment-notes";

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

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const boxDimensionGroups = extractBoxDimensionGroups(order);

    return NextResponse.json({
      order: {
        ...order,
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

    if (!existing) {
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
    if (body.courierPartner !== undefined) {
      const trimmed = body.courierPartner ? String(body.courierPartner).trim() : null;
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
    if (body.boxCount !== undefined) {
      const count = body.boxCount ? parseInt(String(body.boxCount), 10) : null;
      if (count !== existing.boxCount) {
        dataToUpdate.boxCount = count;
        auditEntries.push({ field: "boxCount", oldVal: String(existing.boxCount), newVal: String(count) });
      }
    }
    if (body.lengthCm !== undefined) dataToUpdate.lengthCm = body.lengthCm ? parseFloat(String(body.lengthCm)) : null;
    if (body.widthCm !== undefined) dataToUpdate.widthCm = body.widthCm ? parseFloat(String(body.widthCm)) : null;
    if (body.heightCm !== undefined) dataToUpdate.heightCm = body.heightCm ? parseFloat(String(body.heightCm)) : null;
    if (body.weightKg !== undefined) dataToUpdate.weightKg = body.weightKg ? parseFloat(String(body.weightKg)) : null;
    if (body.remainderQty !== undefined) dataToUpdate.remainderQty = body.remainderQty ? parseInt(String(body.remainderQty), 10) : null;
    if (body.remainderLengthCm !== undefined) dataToUpdate.remainderLengthCm = body.remainderLengthCm ? parseFloat(String(body.remainderLengthCm)) : null;
    if (body.remainderWidthCm !== undefined) dataToUpdate.remainderWidthCm = body.remainderWidthCm ? parseFloat(String(body.remainderWidthCm)) : null;
    if (body.remainderHeightCm !== undefined) dataToUpdate.remainderHeightCm = body.remainderHeightCm ? parseFloat(String(body.remainderHeightCm)) : null;
    if (body.remainderWeightKg !== undefined) dataToUpdate.remainderWeightKg = body.remainderWeightKg ? parseFloat(String(body.remainderWeightKg)) : null;
    if (body.boxDimensions !== undefined) dataToUpdate.boxDimensions = body.boxDimensions ? String(body.boxDimensions).trim() : null;

    // 11. Status & Courier Status Synchronization (PAIRED WITH MAIN CONSIGNMENT APP)
    let statusChanged = false;
    let fromStatus = existing.status || existing.courierStatus || "Pending";
    let toStatus = fromStatus;

    // Direct Status Update (e.g. Delivered, GRN Issue, In Transit)
    const targetStatus = body.status !== undefined ? String(body.status).trim() : (body.courierStatus !== undefined ? String(body.courierStatus).trim() : null);

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
        dataToUpdate.pickupDone = true;
        if (!dataToUpdate.deliveryDate && !existing.deliveryDate) {
          dataToUpdate.deliveryDate = new Date();
        }
        dataToUpdate.grnStatus = body.grnStatus || existing.grnStatus || "Completed";
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

    const hasPersonalNoteUpdate = body.personalNote !== undefined;

    if (Object.keys(dataToUpdate).length === 0 && !hasPersonalNoteUpdate) {
      return NextResponse.json({ order: existing, message: "No changes detected" });
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
        ...updated,
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
