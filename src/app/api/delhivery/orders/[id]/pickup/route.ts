import { NextRequest, NextResponse } from "next/server";
import { canOverride } from "@/lib/permissions";
import { DelhiveryError, cancelPickupRequest, createPickupRequest, mapPickupId } from "@/modules/delhivery";
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

/** Errors raised before anything reached Delhivery: the pickup was certainly not requested. */
const NOT_SENT_KINDS = new Set(["invalid_input", "config", "booking_disabled", "auth", "auth_locked"]);

/**
 * POST /api/delhivery/orders/:id/pickup  Body: { date: "YYYY-MM-DD", time: "HH:MM", expectedPackageCount, override? }
 *
 * Double-submit protection (like the manifest route): a "submitting" claim is written under the
 * row lock before the call, so a double click or a second tab is refused. A call whose outcome
 * is unknown (timeout after sending) needs `override: true` from an ADMIN to be retried.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id, "courier.book");
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const lr = requireLrn(order);
  if (lr instanceof NextResponse) return lr;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const body = await req.json().catch(() => ({}));
  const date = String(body.date || "");
  const time = String(body.time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayIstIso()) {
    return NextResponse.json({ error: "Pick a pickup date from today onwards." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ error: "Pickup time must be HH:MM." }, { status: 400 });
  const expectedPackageCount = Number(body.expectedPackageCount);
  if (!Number.isInteger(expectedPackageCount) || expectedPackageCount < 1) {
    return NextResponse.json({ error: "Expected package count must be a whole number of at least 1." }, { status: 400 });
  }
  const override = body.override === true && canOverride(user, order.channel);

  // ---- claim (row lock) ----
  let refusal: string | null = null;
  const claimedAt = nowIso();
  await updateDelhivery(order.id, (r) => {
    const p = r.pickup;
    const live = p && !p.cancelledAt;
    const state =
      p?.state === "submitting" && Date.now() - Date.parse(p.requestedAt) > 2 * 60 * 1000 ? "unknown_outcome" : p?.state;
    if (live && state === "submitting") refusal = "A pickup request for this order is already being sent.";
    else if (live && state === "unknown_outcome" && !override)
      refusal = "The last pickup request timed out and may have been created. Check the Delhivery One panel; an admin can then retry.";
    else if (live && state !== "unknown_outcome")
      refusal = "A pickup request already exists for this order. Cancel it first to change it.";
    if (refusal) return r;
    return {
      ...r,
      pickup: { id: null, date, startTime: `${time}:00`, expectedPackageCount, requestedAt: claimedAt, requestedBy: actorName(user), state: "submitting" },
    };
  });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

  try {
    const res = await createPickupRequest({ pickupDate: date, startTime: `${time}:00`, expectedPackageCount });
    const pickupId = mapPickupId(res.data);
    if (!pickupId) logUnmapped("pickup request", [], res.data);
    const rec = await updateDelhivery(order.id, (r) => ({
      ...r,
      pickup: { id: pickupId, date, startTime: `${time}:00`, expectedPackageCount, requestedAt: claimedAt, requestedBy: actorName(user), state: "requested" },
    }));
    await auditDelhivery(user, order, "PICKUP_REQUESTED", { pickupId, date, time, expectedPackageCount, requestId: res.requestId, override });
    return NextResponse.json({ delhivery: rec, provisional: true });
  } catch (err) {
    const notSent = err instanceof DelhiveryError && (NOT_SENT_KINDS.has(err.kind) || (err.kind === "rate_limited" && !err.status));
    const rejected = err instanceof DelhiveryError && err.kind === "http" && (err.status ?? 0) < 500;
    const message = err instanceof DelhiveryError ? err.userMessage : String((err as any)?.message || err);
    await updateDelhivery(order.id, (r) => ({
      ...r,
      // Certainly not created → release the claim; otherwise keep it as an unknown outcome.
      pickup: notSent || rejected ? undefined : { ...r.pickup!, state: "unknown_outcome" },
      lastError: { at: nowIso(), action: "pickup request", message, requestId: err instanceof DelhiveryError ? err.requestId : null },
    }));
    return delhiveryErrorResponse(err, "pickup request");
  }
}

/** DELETE /api/delhivery/orders/:id/pickup */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id, "courier.book");
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
