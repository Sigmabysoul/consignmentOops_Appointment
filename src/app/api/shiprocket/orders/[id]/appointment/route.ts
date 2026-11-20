import { NextRequest, NextResponse } from "next/server";
import { buildAppointmentBody, updateAppointment } from "@/modules/shiprocket";
import {
  actorName,
  auditShiprocket,
  istDate,
  loadShiprocketOrder,
  notConfiguredResponse,
  nowIso,
  readShiprocket,
  shiprocketErrorResponse,
  updateShiprocket,
} from "@/lib/shiprocket-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/shiprocket/orders/:id/appointment
 * Body: { start: "YYYY-MM-DDTHH:MM", end: "YYYY-MM-DDTHH:MM", poExpiryDate?: "YYYY-MM-DD" }
 * Sends the delivery appointment to Shiprocket and mirrors date + slot onto the order.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadShiprocketOrder(req, id, "courier.book");
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const rec0 = readShiprocket(order);
  if (rec0.shipment?.state !== "done" || !rec0.shipment.shipmentId) {
    return NextResponse.json({ error: "Book the Shiprocket shipment before adding an appointment." }, { status: 409 });
  }
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const body = await req.json().catch(() => ({}));
  const input = {
    shipmentId: rec0.shipment.shipmentId,
    start: String(body.start || ""),
    end: String(body.end || ""),
    poNumber: order.roPoNumber,
    poExpiryDate: String(body.poExpiryDate || istDate(order.roExpiryDate) || ""),
  };
  try {
    buildAppointmentBody(input);
    const today = istDate(new Date())!;
    if (input.start.slice(0, 10) < today) return NextResponse.json({ error: "Appointment cannot be in the past." }, { status: 400 });
    await updateAppointment(input);
    const slot = `${input.start.slice(11, 16)}-${input.end.slice(11, 16)}`;
    const rec = await updateShiprocket(
      order.id,
      (r) => ({
        ...r,
        appointment: { start: input.start, end: input.end, poNumber: input.poNumber, poExpiryDate: input.poExpiryDate, bookedAt: nowIso(), bookedBy: actorName(user) },
      }),
      () => ({ appointmentDate: new Date(`${input.start.slice(0, 10)}T00:00:00+05:30`), appointmentSlot: slot })
    );
    await auditShiprocket(user, order, "APPOINTMENT", { start: input.start, end: input.end });
    return NextResponse.json({ shiprocket: rec });
  } catch (err) {
    return shiprocketErrorResponse(err, "appointment");
  }
}
