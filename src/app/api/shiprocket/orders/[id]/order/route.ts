import { NextRequest, NextResponse } from "next/server";
import { ShiprocketError, createOrder, getShiprocketConfig, mapOrderCreation, buildOrderCreationBody, validatePackages, type OrderCreationInput } from "@/modules/shiprocket";
import {
  actorName,
  auditShiprocket,
  isStaleClaim,
  istDate,
  loadShiprocketOrder,
  notConfiguredResponse,
  nowIso,
  shiprocketErrorResponse,
  updateShiprocket,
} from "@/lib/shiprocket-orders";
import type { ShiprocketAddress } from "@/lib/shiprocket-types";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Errors raised before anything reached Shiprocket: the order was certainly not created. */
const NOT_SENT = new Set(["invalid_input", "config", "booking_disabled", "auth"]);

/**
 * POST /api/shiprocket/orders/:id/order — step 1 (order creation).
 * Body: { destination: ShiprocketAddress, packages, invoice: { value, number, date }, pickupDate?, override? }
 * Returns the carriers Shiprocket offers for the lane; step 2 books one of them.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadShiprocketOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const body = await req.json().catch(() => ({}));
  let input: OrderCreationInput;
  try {
    const config = getShiprocketConfig();
    const d = body.destination || {};
    const destination: ShiprocketAddress = {
      name: String(d.name || order.warehouseName || ""),
      addressLine1: String(d.addressLine1 || ""),
      addressLine2: String(d.addressLine2 || ""),
      pincode: String(d.pincode || ""),
      city: String(d.city || ""),
      state: String(d.state || ""),
      contactName: String(d.contactName || ""),
      contactEmail: String(d.contactEmail || ""),
      contactPhone: String(d.contactPhone || ""),
      gstin: d.gstin ? String(d.gstin) : undefined,
    };
    input = {
      clientOrderId: order.roPoNumber,
      packages: validatePackages(body.packages || []),
      invoice: {
        value: Number(Number(body.invoice?.value).toFixed(2)),
        number: String(body.invoice?.number || order.invoiceNo || ""),
        date: body.invoice?.date ? String(body.invoice.date) : null,
      },
      destination,
      pickupDate: body.pickupDate ? String(body.pickupDate) : istDate(order.pickupDate),
      poNumber: order.roPoNumber,
      poExpiryDate: istDate(order.roExpiryDate),
    };
    buildOrderCreationBody(input, config); // validate before claiming
    if (!config.bookingEnabled) throw new ShiprocketError("booking_disabled", "Shiprocket booking is disabled.");
  } catch (err) {
    return shiprocketErrorResponse(err, "order creation");
  }

  const override = body.override === true && user.role === "ADMIN";
  let refusal: string | null = null;
  await updateShiprocket(order.id, (rec) => {
    const state = isStaleClaim(rec.order?.state, rec.order?.submittedAt) ? "unknown_outcome" : rec.order?.state;
    if (rec.shipment?.state === "done") refusal = `Already booked with Shiprocket (waybill ${rec.waybill || "pending"}).`;
    else if (state === "submitting") refusal = "A Shiprocket order for this consignment is already being created.";
    else if (state === "done" && !override) refusal = `Shiprocket order ${rec.order?.orderId} already exists — book a carrier for it instead.`;
    else if (state === "unknown_outcome" && !override)
      refusal = "The last Shiprocket order attempt timed out and may have been created. Check the Shiprocket Cargo panel; an admin can then retry.";
    if (refusal) return rec;
    return {
      ...rec,
      order: {
        state: "submitting",
        orderId: null,
        submittedAt: nowIso(),
        submittedBy: actorName(user),
        carriers: [],
        destination: input.destination,
        packages: input.packages,
        invoice: input.invoice,
      },
      shipment: undefined,
      lastError: undefined,
    };
  });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

  try {
    const res = await createOrder(input);
    const mapped = mapOrderCreation(res.data);
    const rec = await updateShiprocket(order.id, (r) => ({
      ...r,
      order: {
        ...r.order!,
        state: mapped.orderId ? "done" : "unknown_outcome",
        orderId: mapped.orderId,
        carriers: mapped.carriers,
        // Shiprocket may create the order yet assign no carrier (no auto-assign rule, wallet balance,
        // serviceability) and explain why in `message`.
        message: mapped.orderId
          ? mapped.carriers.length
            ? null
            : mapped.message || "No surface carrier is serviceable for this lane."
          : "Shiprocket replied without an order id.",
      },
    }));
    await auditShiprocket(user, order, "ORDER_CREATED", { orderId: mapped.orderId, carriers: mapped.carriers.length, override });
    return NextResponse.json({ shiprocket: rec });
  } catch (err) {
    const notSent = err instanceof ShiprocketError && (NOT_SENT.has(err.kind) || (err.kind === "rate_limited" && !err.status));
    const rejected = err instanceof ShiprocketError && err.kind === "http" && (err.status ?? 0) < 500;
    const message = err instanceof ShiprocketError ? err.userMessage : String((err as any)?.message || err);
    await updateShiprocket(order.id, (r) => ({
      ...r,
      order: { ...r.order!, state: notSent || rejected ? "failed" : "unknown_outcome", message },
      lastError: { at: nowIso(), action: "order creation", message },
    }));
    await auditShiprocket(user, order, "ORDER_FAILED", { message });
    return shiprocketErrorResponse(err, "order creation");
  }
}
