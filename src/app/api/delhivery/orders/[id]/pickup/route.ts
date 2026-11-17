import { NextRequest, NextResponse } from "next/server";
import { cancelPickupRequest, createPickupRequest, mapPickupId } from "@/modules/delhivery";
import {
  actorName,
  auditDelhivery,
  delhiveryErrorResponse,
  loadDelhiveryOrder,
  logUnmapped,
  notConfiguredResponse,
  nowIso,
  readDelhivery,
  requireLrn,
  todayIstIso,
  updateDelhivery,
} from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST /api/delhivery/orders/:id/pickup  Body: { date: "YYYY-MM-DD", time: "HH:MM", expectedPackageCount } */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const lr = requireLrn(order);
  if (lr instanceof NextResponse) return lr;
  if (lr.rec.pickup && !lr.rec.pickup.cancelledAt) {
    return NextResponse.json({ error: "A pickup request already exists for this order. Cancel it first to change it." }, { status: 409 });
  }
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const body = await req.json().catch(() => ({}));
  const date = String(body.date || "");
  const time = String(body.time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayIstIso()) {
    return NextResponse.json({ error: "Pick a pickup date from today onwards." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ error: "Pickup time must be HH:MM." }, { status: 400 });

  try {
    const expectedPackageCount = Number(body.expectedPackageCount);
    const res = await createPickupRequest({ pickupDate: date, startTime: `${time}:00`, expectedPackageCount });
    const pickupId = mapPickupId(res.data);
    if (!pickupId) logUnmapped("pickup request", [], res.data);
    const rec = await updateDelhivery(order.id, (r) => ({
      ...r,
      pickup: { id: pickupId, date, startTime: `${time}:00`, expectedPackageCount, requestedAt: nowIso(), requestedBy: actorName(user) },
    }));
    await auditDelhivery(user, order, "PICKUP_REQUESTED", { pickupId, date, time, expectedPackageCount, requestId: res.requestId });
    return NextResponse.json({ delhivery: rec, provisional: true });
  } catch (err) {
    return delhiveryErrorResponse(err, "pickup request");
  }
}

/** DELETE /api/delhivery/orders/:id/pickup */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const pickup = readDelhivery(order).pickup;
  if (!pickup || pickup.cancelledAt) return NextResponse.json({ error: "No active pickup request." }, { status: 409 });
  if (!pickup.id) {
    return NextResponse.json(
      { error: "The pickup id was not recognised in Delhivery's response. Cancel it from the Delhivery One panel." },
      { status: 409 }
    );
  }
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  try {
    await cancelPickupRequest(pickup.id);
    const rec = await updateDelhivery(order.id, (r) => ({
      ...r,
      pickup: { ...r.pickup!, cancelledAt: nowIso(), cancelledBy: actorName(user) },
    }));
    await auditDelhivery(user, order, "PICKUP_CANCELLED", { pickupId: pickup.id });
    return NextResponse.json({ delhivery: rec });
  } catch (err) {
    return delhiveryErrorResponse(err, "pickup cancel");
  }
}
