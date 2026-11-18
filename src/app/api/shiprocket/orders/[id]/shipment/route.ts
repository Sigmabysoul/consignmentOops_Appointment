import { NextRequest, NextResponse } from "next/server";
import {
  ShiprocketError,
  buildShipmentBody,
  createShipment,
  getShipment,
  getShiprocketConfig,
  mapShipment,
  type MappedShipment,
} from "@/modules/shiprocket";
import {
  actorName,
  auditShiprocket,
  isStaleClaim,
  loadShiprocketOrder,
  notConfiguredResponse,
  nowIso,
  readShiprocket,
  shiprocketErrorResponse,
  updateShiprocket,
  type OrderRow,
} from "@/lib/shiprocket-orders";
import { SHIPROCKET_COURIER_NAME, type ShiprocketShipmentRecord } from "@/lib/shiprocket-types";
import { requireBookingDeskOrder } from "@/lib/courier-booking-desk";
import { otherCarrierRefusal, withShippingLabelBarcodes } from "@/lib/courier-booking-guards";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const NOT_SENT = new Set(["invalid_input", "config", "booking_disabled", "auth"]);

/** Saves waybill / LRN / label / POD and mirrors the docket onto the order's trackingId (if empty). */
function applyShipment(r: ShiprocketShipmentRecord, m: MappedShipment): ShiprocketShipmentRecord {
  return {
    ...r,
    waybill: m.waybill ?? r.waybill,
    lrn: m.lrn ?? r.lrn,
    childWaybills: m.childWaybills.length ? m.childWaybills : r.childWaybills,
    labelUrl: m.labelUrl ?? r.labelUrl ?? null,
    podUrl: m.podUrl ?? r.podUrl ?? null,
    scheduledPickupDate: m.scheduledPickupDate ?? r.scheduledPickupDate ?? null,
    deliveryPartner: m.deliveryPartner ?? r.deliveryPartner ?? r.shipment?.carrier?.deliveryPartnerName ?? null,
    bookedAt: r.bookedAt ?? (m.waybill ? nowIso() : undefined),
    ...(m.status
      ? { tracking: { status: m.status, statusDp: m.statusDp, location: r.tracking?.location ?? null, edd: m.edd, deliveredAt: m.deliveredAt, checkedAt: nowIso() } }
      : {}),
  };
}

/** Box (child) waybills → customData.shippingLabelBarcodes for App 1's BoxTrace dispatch gate. */
const boxAwbsToLabelList = (custom: Record<string, any>, next: ShiprocketShipmentRecord) =>
  next.shipment?.state === "done" && next.childWaybills?.length ? withShippingLabelBarcodes(custom, next.childWaybills) : custom;

const orderFieldsFor = (o: OrderRow, next: ShiprocketShipmentRecord) => {
  const docket = next.lrn || next.waybill;
  return {
    courierPartner: SHIPROCKET_COURIER_NAME,
    ...(docket && !o.trackingId?.trim() ? { trackingId: docket } : {}),
  };
};

/**
 * POST /api/shiprocket/orders/:id/shipment — step 2 (books the chosen carrier).
 * Body: { deliveryPartnerId, modeId, ewayBillNo?, remarks?, override? }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadShiprocketOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const offDesk = await requireBookingDeskOrder(order.id, "Shiprocket Cargo");
  if (offDesk) return offDesk;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const body = await req.json().catch(() => ({}));
  const current = readShiprocket(order);
  if (current.order?.state !== "done" || !current.order.orderId) {
    return NextResponse.json({ error: "Create the Shiprocket order first (step 1)." }, { status: 409 });
  }
  const carrier = current.order.carriers.find(
    (c) => c.deliveryPartnerId === Number(body.deliveryPartnerId) && c.modeId === Number(body.modeId)
  );
  if (!carrier) return NextResponse.json({ error: "Choose one of the carriers Shiprocket offered for this order." }, { status: 400 });

  const input = {
    orderId: current.order.orderId,
    modeId: carrier.modeId,
    deliveryPartnerId: carrier.deliveryPartnerId,
    invoice: current.order.invoice,
    ewayBillNo: body.ewayBillNo ? String(body.ewayBillNo) : null,
    recipientGstin: current.order.destination.gstin ?? null,
    remarks: String(body.remarks || `RO ${order.roPoNumber}`).slice(0, 200),
  };
  try {
    const config = getShiprocketConfig();
    buildShipmentBody(input, config);
    if (!config.bookingEnabled) throw new ShiprocketError("booking_disabled", "Shiprocket booking is disabled.");
  } catch (err) {
    return shiprocketErrorResponse(err, "shipment creation");
  }

  const override = body.override === true && user.role === "ADMIN";
  let refusal: string | null = null;
  await updateShiprocket(order.id, (rec, locked) => {
    const state = isStaleClaim(rec.shipment?.state, rec.shipment?.submittedAt) ? "unknown_outcome" : rec.shipment?.state;
    const otherCarrier = otherCarrierRefusal("shiprocket", locked.customData as any);
    // Step 1 may have been re-run (admin override) between our read and this lock: book only the
    // Shiprocket order we validated the carrier against.
    const sameOrder =
      rec.order?.state === "done" &&
      rec.order.orderId === input.orderId &&
      rec.order.carriers.some((c) => c.deliveryPartnerId === carrier.deliveryPartnerId && c.modeId === carrier.modeId);
    if (state === "done") refusal = `Already booked (shipment ${rec.shipment?.shipmentId}, waybill ${rec.waybill || "pending"}).`;
    else if (otherCarrier) refusal = otherCarrier;
    else if (!sameOrder) refusal = "The Shiprocket order changed while booking. Reload and choose the carrier again.";
    else if (state === "submitting") refusal = "This shipment is already being booked.";
    else if (state === "unknown_outcome" && !override)
      refusal = "The last booking attempt timed out and may have gone through. Check the Shiprocket Cargo panel; an admin can then retry.";
    if (refusal) return rec;
    return {
      ...rec,
      shipment: { state: "submitting", shipmentId: null, submittedAt: nowIso(), submittedBy: actorName(user), carrier, ewayBillNo: input.ewayBillNo },
      lastError: undefined,
    };
  });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

  try {
    const res = await createShipment(input);
    const m = mapShipment(res.data);
    const rec = await updateShiprocket(
      order.id,
      (r) =>
        applyShipment(
          { ...r, shipment: { ...r.shipment!, state: m.shipmentId ? "done" : "unknown_outcome", shipmentId: m.shipmentId, message: m.apiError } },
          m
        ),
      orderFieldsFor,
      boxAwbsToLabelList
    );
    await auditShiprocket(user, order, "BOOKED", { shipmentId: m.shipmentId, waybill: m.waybill, carrier: carrier.deliveryPartnerName, override });
    return NextResponse.json({ shiprocket: rec });
  } catch (err) {
    const notSent = err instanceof ShiprocketError && (NOT_SENT.has(err.kind) || (err.kind === "rate_limited" && !err.status));
    const rejected = err instanceof ShiprocketError && err.kind === "http" && (err.status ?? 0) < 500;
    const message = err instanceof ShiprocketError ? err.userMessage : String((err as any)?.message || err);
    await updateShiprocket(order.id, (r) => ({
      ...r,
      shipment: { ...r.shipment!, state: notSent || rejected ? "failed" : "unknown_outcome", message },
      lastError: { at: nowIso(), action: "shipment creation", message },
    }));
    await auditShiprocket(user, order, "BOOKING_FAILED", { message });
    return shiprocketErrorResponse(err, "shipment creation");
  }
}

/** GET — refresh shipment details (async mode: waybill + label arrive later; also POD link and status). */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadShiprocketOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const current = readShiprocket(ctx.order);
  if (current.shipment?.state !== "done" || !current.shipment.shipmentId) return NextResponse.json({ shiprocket: current });
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;
  try {
    const m = mapShipment((await getShipment(current.shipment.shipmentId)).data);
    const rec = await updateShiprocket(ctx.order.id, (r) => applyShipment(r, m), orderFieldsFor, boxAwbsToLabelList);
    return NextResponse.json({ shiprocket: rec });
  } catch (err) {
    return shiprocketErrorResponse(err, "shipment details");
  }
}
