import { canSeeOrder } from "@/lib/permissions";
import {
  isVisibleInAppointmentApp,
  evaluateStatusPatch,
  isClosedOrder,
  DELIVERED_STATUSES,
} from "@/lib/order-filters";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toClientOrder } from "@/lib/order-redaction";
import { resolveCourierForChannel, isSameCourier } from "@/lib/courier-defaults";
import { parseOptionalNumber, roundTo2 } from "@/lib/number-input";
import { db } from "@/lib/db";
import { parseDateInput, isSameIstDay, istDayStart } from "@/lib/date-utils";
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

    if (!order || !isVisibleInAppointmentApp(order) || !canSeeOrder(user, order.channel)) {
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

/** A refusal decided inside the PATCH transaction (rolled back, returned as JSON). */
class PatchRefusal extends Error {
  constructor(public httpStatus: number, public payload: Record<string, unknown>) {
    super(String(payload.error || "Refused"));
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

    // Input Validation (independent of the stored order)
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

    const include = {
      client: true,
      items: true,
      statusHistory: { orderBy: { timestamp: "desc" as const }, take: 20 },
      auditLogs: { orderBy: { timestamp: "desc" as const }, take: 20 },
    };

    // Everything that depends on the stored order runs on a locked, freshly read row, so a
    // concurrent main-app / Delhivery / Shiprocket write is neither overwritten nor raced.
    const outcome = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ConsignmentOrder" WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.consignmentOrder.findUnique({ where: { id } });
      if (!existing || !isVisibleInAppointmentApp(existing) || !canSeeOrder(user, existing.channel)) {
        throw new PatchRefusal(404, { error: "Order not found" });
      }

      // Status rules: In Transit / pickupDone only via BoxTrace, Delivered only via /deliver (POD),
      // GRN Issue / cancel only in the main app; App 2 milestones go to courierStatus only.
      const statusCheck = evaluateStatusPatch(existing, body);
      if (!statusCheck.ok) {
        throw new PatchRefusal(statusCheck.httpStatus, { error: statusCheck.error, code: statusCheck.code });
      }
      const closed = isClosedOrder(existing);

      // Courier policy (Golden Rules 4–6). An unchanged courier in any spelling ("Delhivery" vs
      // "Delhivery One", "Om Logistics" …) is never re-validated or rewritten.
      let canonicalCourier: string | null | undefined = undefined;
      if (body.courierPartner !== undefined && !isSameCourier(body.courierPartner, existing.courierPartner)) {
        const resolved = resolveCourierForChannel(existing.channel, body.courierPartner);
        if (!resolved.ok) {
          throw new PatchRefusal(400, {
            error: `${String(body.courierPartner).trim()} is not an allowed courier for ${existing.channel} orders. Allowed: ${resolved.allowed.join(", ")}.`,
            code: "COURIER_NOT_ALLOWED",
          });
        }
        canonicalCourier = resolved.courier;
      }

      const dataToUpdate: Record<string, any> = {};
      const auditEntries: Array<{ field: string; oldVal: string; newVal: string }> = [];
      const customPatch: Record<string, unknown> = {};
      const customRemove: string[] = [];
      const canAutoAdvance = (from: string[]) =>
        !closed && statusCheck.courierStatus === undefined &&
        (!existing.courierStatus || from.includes(existing.courierStatus.toLowerCase()));

      // 1. Tracking ID / CN (Consignment Note Number)
      if (body.trackingId !== undefined) {
        const trimmed = body.trackingId ? String(body.trackingId).trim() : null;
        if (trimmed !== existing.trackingId) {
          dataToUpdate.trackingId = trimmed;
          auditEntries.push({ field: "trackingId", oldVal: existing.trackingId || "(none)", newVal: trimmed || "(none)" });

          // Auto-advance the shipment milestone from Pending to Tracking Assigned
          if (trimmed && canAutoAdvance(["pending"])) {
            dataToUpdate.courierStatus = "Tracking Assigned";
          }
        }
      }

      // 2. Courier Partner
      if (canonicalCourier !== undefined && canonicalCourier !== existing.courierPartner) {
        dataToUpdate.courierPartner = canonicalCourier;
        auditEntries.push({
          field: "courierPartner",
          oldVal: existing.courierPartner || "(none)",
          newVal: canonicalCourier || "(none)",
        });
      }

      // 3. Manual Tracking Link (strictly user-entered, no automatic generation)
      if (body.trackingLink !== undefined) {
        const trimmed = body.trackingLink ? String(body.trackingLink).trim() : null;
        if (trimmed !== existing.trackingLink) {
          dataToUpdate.trackingLink = trimmed;
          auditEntries.push({ field: "trackingLink", oldVal: existing.trackingLink || "(none)", newVal: trimmed || "(none)" });
        }
      }

      // 4. Appointment ID
      if (body.appointmentId !== undefined) {
        const trimmed = body.appointmentId ? String(body.appointmentId).trim() : null;
        if (trimmed !== existing.appointmentId) {
          dataToUpdate.appointmentId = trimmed;
          auditEntries.push({ field: "appointmentId", oldVal: existing.appointmentId || "(none)", newVal: trimmed || "(none)" });
        }
      }

      // Date-only fields: the same IST calendar day is "unchanged" (App 1 stores noon IST, this
      // app 00:00Z), so re-saving a form never rewrites the main app's value.
      const dateChanged = (oldDate: Date | null, newDate: Date | null) =>
        oldDate === null || newDate === null ? oldDate !== newDate : !isSameIstDay(oldDate, newDate);

      // 5. Appointment Date
      if (body.appointmentDate !== undefined) {
        const parsedDate = parseDateInput(body.appointmentDate);
        if (dateChanged(existing.appointmentDate, parsedDate)) {
          dataToUpdate.appointmentDate = parsedDate;
          auditEntries.push({
            field: "appointmentDate",
            oldVal: existing.appointmentDate ? existing.appointmentDate.toISOString() : "(none)",
            newVal: parsedDate ? parsedDate.toISOString() : "(none)",
          });

          // Promote the milestone to Appointment Scheduled (courierStatus only)
          if (parsedDate && canAutoAdvance(["pending", "tracking assigned"])) {
            dataToUpdate.courierStatus = "Appointment Scheduled";
          }
        }
      }

      // 6. Appointment Slot
      if (body.appointmentSlot !== undefined) {
        const trimmed = body.appointmentSlot ? String(body.appointmentSlot).trim() : null;
        if (trimmed !== existing.appointmentSlot) {
          dataToUpdate.appointmentSlot = trimmed;
          auditEntries.push({ field: "appointmentSlot", oldVal: existing.appointmentSlot || "(none)", newVal: trimmed || "(none)" });
        }
      }

      // 7. Delivery Date — set by Mark Delivered (with POD); here only corrected on a Delivered order with a POD
      if (body.deliveryDate !== undefined) {
        const parsedDate = parseDateInput(body.deliveryDate);
        if (dateChanged(existing.deliveryDate, parsedDate)) {
          const deliveredWithPod =
            DELIVERED_STATUSES.includes(existing.status || "") && hasPodOnRecord(existing.customData);
          if (!deliveredWithPod) {
            throw new PatchRefusal(409, {
              error: "The delivery date is recorded by Mark Delivered (with the POD). It can only be corrected on a Delivered order.",
              code: "DELIVERY_VIA_MARK_DELIVERED",
            });
          }
          if (!parsedDate) {
            throw new PatchRefusal(400, { error: "A Delivered order must keep its delivery date.", code: "DELIVERY_DATE_REQUIRED" });
          }
          if (parsedDate.getTime() >= istDayStart(new Date(), 1).getTime()) {
            throw new PatchRefusal(400, { error: "Delivery date cannot be in the future." });
          }
          dataToUpdate.deliveryDate = parsedDate;
          auditEntries.push({
            field: "deliveryDate",
            oldVal: existing.deliveryDate ? existing.deliveryDate.toISOString() : "(none)",
            newVal: parsedDate.toISOString(),
          });
        }
      }

      // 8. Pickup Date (scheduled pickup). pickupDone itself is never written here (BoxTrace only).
      if (body.pickupDate !== undefined) {
        const parsedDate = parseDateInput(body.pickupDate);
        if (dateChanged(existing.pickupDate, parsedDate)) {
          dataToUpdate.pickupDate = parsedDate;
          auditEntries.push({
            field: "pickupDate",
            oldVal: existing.pickupDate ? existing.pickupDate.toISOString() : "(none)",
            newVal: parsedDate ? parsedDate.toISOString() : "(none)",
          });
        }
      }

      // 9. Logistics Remarks / Comment
      if (body.comment !== undefined) {
        const trimmed = body.comment ? String(body.comment).trim() : null;
        if (trimmed !== existing.comment) {
          dataToUpdate.comment = trimmed;
          auditEntries.push({ field: "comment", oldVal: existing.comment || "(none)", newVal: trimmed || "(none)" });
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

      // 11. Shipment milestone (courierStatus only; the order status stays the main app's)
      const fromMilestone = existing.courierStatus || "Pending";
      if (statusCheck.courierStatus !== undefined) {
        dataToUpdate.courierStatus = statusCheck.courierStatus;
      }
      const milestoneChanged =
        dataToUpdate.courierStatus !== undefined && dataToUpdate.courierStatus !== existing.courierStatus;
      if (milestoneChanged) {
        auditEntries.push({ field: "courierStatus", oldVal: existing.courierStatus || "(none)", newVal: dataToUpdate.courierStatus });
      } else {
        delete dataToUpdate.courierStatus;
      }

      // Declared invoice value (entered in the OM WhatsApp booking window); lives in customData.
      if (parsedNumbers.invoiceValue !== undefined) {
        const currentCustom = (existing.customData as Record<string, any>) || {};
        const oldVal = currentCustom.invoiceValue ?? null;
        const newVal = parsedNumbers.invoiceValue === null ? null : roundTo2(parsedNumbers.invoiceValue);
        const changed = oldVal === null ? newVal !== null : newVal === null || Number(oldVal) !== newVal;
        if (changed) {
          if (newVal === null) customRemove.push("invoiceValue");
          else customPatch.invoiceValue = newVal;
          auditEntries.push({
            field: "invoiceValue",
            oldVal: oldVal === null ? "(none)" : String(oldVal),
            newVal: newVal === null ? "(none)" : newVal.toFixed(2),
          });
        }
      }

      if (Object.keys(customPatch).length > 0 || customRemove.length > 0) {
        // Merge only the keys this request changes into the freshly locked customData
        const merged: Record<string, any> = { ...((existing.customData as Record<string, any>) || {}), ...customPatch };
        for (const key of customRemove) delete merged[key];
        dataToUpdate.customData = merged;
      }

      const hasPersonalNoteUpdate = body.personalNote !== undefined;
      if (Object.keys(dataToUpdate).length === 0 && !hasPersonalNoteUpdate) {
        return { unchanged: true as const, order: existing };
      }

      let updated;
      if (Object.keys(dataToUpdate).length > 0) {
        dataToUpdate.updatedAt = new Date();
        updated = await tx.consignmentOrder.update({ where: { id }, data: dataToUpdate, include });
      } else {
        updated = await tx.consignmentOrder.findUniqueOrThrow({ where: { id }, include });
      }

      // Handle isolated personal notes (safely self-healing)
      let activePersonalNote: any = null;
      if (hasPersonalNoteUpdate) {
        const noteStr = body.personalNote ? String(body.personalNote).trim() : "";
        if (noteStr) {
          activePersonalNote = await saveSingleAppointmentNote(id, noteStr, user.name || user.username, tx);
        } else {
          await deleteSingleAppointmentNote(id, tx);
        }
      } else {
        activePersonalNote = await getSingleAppointmentNote(id, tx);
      }

      // Record the shipment milestone transition (the order status itself never changes here)
      if (milestoneChanged) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            fromStatus: fromMilestone,
            toStatus: dataToUpdate.courierStatus,
            userId: user.id,
            userName: user.name || user.username,
            userRole: null,
            department: user.department || "Logistics",
            reason: body.remarks || `Shipment milestone changed to "${dataToUpdate.courierStatus}"`,
            metadata: {
              source: "Appointment Desk",
              field: "courierStatus",
              orderStatus: existing.status,
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
            userRole: null,
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
        unchanged: false as const,
        order: {
          ...toClientOrder(updated),
          boxDimensionGroups: extractBoxDimensionGroups(updated),
          personalNote: activePersonalNote?.note || null,
          personalNoteUpdatedAt: activePersonalNote?.updatedAt ? activePersonalNote.updatedAt.toISOString() : null,
          personalNoteUpdatedBy: activePersonalNote?.updatedBy || null,
        },
      };
    });

    if (outcome.unchanged) {
      return NextResponse.json({ order: toClientOrder(outcome.order), message: "No changes detected" });
    }
    return NextResponse.json({
      success: true,
      order: outcome.order,
      message: "Order updated successfully",
    });
  } catch (error: any) {
    if (error instanceof PatchRefusal) {
      return NextResponse.json(error.payload, { status: error.httpStatus });
    }
    return NextResponse.json(
      { error: error.message || "Failed to update order" },
      { status: 500 }
    );
  }
}
