import { NextRequest, NextResponse } from "next/server";
import { bookLastMileAppointment, buildAppointmentBody, type DelhiveryAppointmentSlot } from "@/modules/delhivery";
import {
  actorName,
  auditDelhivery,
  delhiveryErrorResponse,
  isoDateToDmy,
  loadDelhiveryOrder,
  notConfiguredResponse,
  nowIso,
  requireLrn,
  todayIstIso,
  updateDelhivery,
} from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/delhivery/orders/:id/appointment
 * Body: { date: "YYYY-MM-DD", slot, poNumbers: string[], appointmentId?, poExpiryDate: "YYYY-MM-DD" }
 * Books the last-mile delivery appointment and mirrors date/slot onto the order so the
 * Appointment Desk shows it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id, "courier.book");
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const lr = requireLrn(order);
  if (lr instanceof NextResponse) return lr;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const body = await req.json().catch(() => ({}));
  const date = isoDateToDmy(body.date);
  const poExpiryDate = isoDateToDmy(body.poExpiryDate);
  if (!date || !poExpiryDate) return NextResponse.json({ error: "Pick an appointment date and a PO expiry date." }, { status: 400 });
  if (String(body.date) < todayIstIso()) return NextResponse.json({ error: "Appointment date cannot be in the past." }, { status: 400 });

  try {
    const input = {
      lrn: lr.lrn,
      date,
      slot: String(body.slot || "") as DelhiveryAppointmentSlot,
      poNumbers: Array.isArray(body.poNumbers) ? body.poNumbers.map(String) : [],
      appointmentId: String(body.appointmentId || ""),
      poExpiryDate,
    };
    const sent = buildAppointmentBody(input);
    const res = await bookLastMileAppointment(input);
    const rec = await updateDelhivery(
      order.id,
      (r) => ({
        ...r,
        appointment: {
          date,
          slot: sent.appointment_slot,
          poNumbers: sent.po_number,
          appointmentId: sent.appointment_id,
          poExpiryDate,
          bookedAt: nowIso(),
          bookedBy: actorName(user),
        },
      }),
      (o) => ({
        appointmentDate: new Date(`${body.date}T00:00:00+05:30`),
        appointmentSlot: sent.appointment_slot,
        ...(sent.appointment_id && !o.appointmentId?.trim() ? { appointmentId: sent.appointment_id } : {}),
      })
    );
    await auditDelhivery(user, order, "APPOINTMENT_BOOKED", { lrn: lr.lrn, date, slot: sent.appointment_slot, requestId: res.requestId });
    return NextResponse.json({ delhivery: rec });
  } catch (err) {
    return delhiveryErrorResponse(err, "appointment");
  }
}
