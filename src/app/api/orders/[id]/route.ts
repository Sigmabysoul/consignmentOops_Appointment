import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/date-utils";
import { resolveTrackingUrl } from "@/lib/tracking-utils";

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

    const [order, courierPresets] = await Promise.all([
      db.consignmentOrder.findUnique({
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
      }),
      db.courierPreset.findMany({
        where: { isActive: true },
        select: { name: true, urlName: true, trackingUrlPattern: true },
      }),
    ]);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const computedTrackingLink =
      order.trackingLink ||
      resolveTrackingUrl(order.courierPartner, order.trackingId, null, courierPresets);

    return NextResponse.json({
      order: {
        ...order,
        trackingLink: computedTrackingLink,
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
    const ALLOWED_SHIPMENT_STATUSES = [
      "Pending",
      "Tracking Assigned",
      "In Transit",
      "Appointment Scheduled",
      "Delivered",
      "GRN Issue",
      "Cancelled",
    ];

    if (body.courierStatus !== undefined && body.courierStatus !== null) {
      const trimmedStatus = String(body.courierStatus).trim();
      const matched = ALLOWED_SHIPMENT_STATUSES.find(
        (s) => s.toLowerCase() === trimmedStatus.toLowerCase()
      );
      if (!matched) {
        return NextResponse.json(
          {
            error: `Invalid shipment status "${trimmedStatus}". Allowed: ${ALLOWED_SHIPMENT_STATUSES.join(
              ", "
            )}`,
          },
          { status: 400 }
        );
      }
    }

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

    // Prepare update data payload — strictly protecting GRN and core fields
    const dataToUpdate: Record<string, any> = {};
    const auditEntries: Array<{ field: string; oldVal: string; newVal: string }> = [];

    // 1. Tracking ID
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

    // 3. Tracking Link
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

        // If appointment date is set and status is pending, suggest Appointment Scheduled
        if (parsedDate && (!existing.courierStatus || existing.courierStatus.toLowerCase() === "pending")) {
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

    // 8. Pickup Date
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

    // 10. Dedicated Logistics / Courier Status
    let courierStatusChanged = false;
    let fromCourierStatus = existing.courierStatus || "Pending";
    let toCourierStatus = existing.courierStatus;

    if (body.courierStatus !== undefined) {
      const raw = body.courierStatus ? String(body.courierStatus).trim() : null;
      const matched = ALLOWED_SHIPMENT_STATUSES.find(
        (s) => s.toLowerCase() === (raw || "").toLowerCase()
      );
      const canonicalStatus = matched || raw;

      if (canonicalStatus && canonicalStatus !== existing.courierStatus) {
        dataToUpdate.courierStatus = canonicalStatus;
        courierStatusChanged = true;
        toCourierStatus = canonicalStatus;
        auditEntries.push({
          field: "courierStatus",
          oldVal: existing.courierStatus || "(none)",
          newVal: canonicalStatus,
        });

        // When courier status is set to Delivered, sync deliveryDate and pickupDone
        if (canonicalStatus.toLowerCase() === "delivered") {
          dataToUpdate.pickupDone = true;
          if (!dataToUpdate.deliveryDate && !existing.deliveryDate) {
            dataToUpdate.deliveryDate = new Date();
          }
        } else if (canonicalStatus.toLowerCase() === "in transit") {
          dataToUpdate.pickupDone = true;
        }
      }
    }

    // Automatic tracking link resolution if courierPartner or trackingId changed
    const targetCourier = dataToUpdate.courierPartner !== undefined ? dataToUpdate.courierPartner : existing.courierPartner;
    const targetTracking = dataToUpdate.trackingId !== undefined ? dataToUpdate.trackingId : existing.trackingId;
    if (targetTracking && targetCourier && !dataToUpdate.trackingLink && !existing.trackingLink) {
      const presets = await db.courierPreset.findMany({ where: { isActive: true } });
      const resolved = resolveTrackingUrl(targetCourier, targetTracking, null, presets);
      if (resolved) {
        dataToUpdate.trackingLink = resolved;
      }
    }

    // ISOLATION GUARANTEE:
    // Strictly protect main Consignment order status and GRN status from being overwritten
    delete dataToUpdate.status;
    delete dataToUpdate.grnStatus;
    delete dataToUpdate.grnReport;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ order: existing, message: "No changes detected" });
    }

    dataToUpdate.updatedAt = new Date();

    // Execute atomic transaction
    const updatedOrder = await db.$transaction(async (tx) => {
      const updated = await tx.consignmentOrder.update({
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

      // Record OrderStatusHistory if shipment status changed
      if (courierStatusChanged && toCourierStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            fromStatus: fromCourierStatus,
            toStatus: toCourierStatus,
            userId: user.id,
            userName: user.name || user.username,
            userRole: user.role,
            department: user.department || "Logistics",
            reason: body.remarks || `Logistics status updated to "${toCourierStatus}"`,
            metadata: {
              source: "Appointment Management Hub",
              trackingId: updated.trackingId,
              courierPartner: updated.courierPartner,
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

      return updated;
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

