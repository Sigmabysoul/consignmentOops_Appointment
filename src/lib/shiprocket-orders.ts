/**
 * Server-side glue between Shiprocket Cargo calls and ConsignmentOrder rows.
 * Everything Shiprocket-related lives under `customData.shiprocket` (shared DB, no schema change).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getAllowedCouriersForChannel } from "@/lib/courier-defaults";
import { isVisibleInAppointmentApp } from "@/lib/order-filters";
import { ACTION_LABEL, can, canSeeOrder, type App2ChannelAction } from "@/lib/permissions";
import { SessionUser } from "@/lib/types";
import {
  ShiprocketConfigError,
  ShiprocketError,
  extractShiprocketMessage,
  isShiprocketConfigured,
  shiprocketErrorHttpStatus,
} from "@/modules/shiprocket";
import { SHIPROCKET_COURIER_NAME, type ShiprocketShipmentRecord, type ShiprocketStatusEntry } from "@/lib/shiprocket-types";

export type OrderRow = NonNullable<Awaited<ReturnType<typeof db.consignmentOrder.findUnique>>>;

export function readShiprocket(order: { customData: unknown }): ShiprocketShipmentRecord {
  const rec = (order.customData as Record<string, any>)?.shiprocket;
  return rec && typeof rec === "object" ? (rec as ShiprocketShipmentRecord) : {};
}

export async function requireLogisticsUser(req: Request): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isLogisticsAuthorized) return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
  return user;
}

/** Auth + order lookup + visibility + courier-policy checks shared by every order route. */
export async function loadShiprocketOrder(
  req: Request,
  id: string,
  /** Extra permission the route needs on the order's platform (booking routes: "courier.book"). */
  action: App2ChannelAction = "logistics.desk"
): Promise<{ user: SessionUser; order: OrderRow } | NextResponse> {
  const user = await requireLogisticsUser(req);
  if (user instanceof NextResponse) return user;
  const order = await db.consignmentOrder.findUnique({ where: { id } });
  if (!order || !isVisibleInAppointmentApp(order) || !canSeeOrder(user, order.channel)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!can(user, order.channel, action)) {
    return NextResponse.json({ error: `Forbidden: needs the '${ACTION_LABEL[action]}' permission on ${order.channel}` }, { status: 403 });
  }
  if (!getAllowedCouriersForChannel(order.channel).includes(SHIPROCKET_COURIER_NAME)) {
    return NextResponse.json({ error: `Shiprocket Cargo is not an allowed courier for ${order.channel} orders.` }, { status: 422 });
  }
  return { user, order };
}

/** Row-locked merge into customData.shiprocket; optional real-column updates in the same transaction. */
export async function updateShiprocket(
  orderId: string,
  patch: (current: ShiprocketShipmentRecord, order: OrderRow) => ShiprocketShipmentRecord,
  orderFields?: (order: OrderRow, next: ShiprocketShipmentRecord) => Record<string, unknown>,
  /** Other customData keys to change in the same locked write (e.g. shippingLabelBarcodes). */
  customExtra?: (custom: Record<string, any>, next: ShiprocketShipmentRecord) => Record<string, any>
): Promise<ShiprocketShipmentRecord> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ConsignmentOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.consignmentOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Order not found");
    const next = patch(readShiprocket(order), order);
    let custom: Record<string, any> = { ...((order.customData as Record<string, any>) || {}), shiprocket: next };
    if (customExtra) custom = { ...customExtra(custom, next), shiprocket: next };
    await tx.consignmentOrder.update({
      where: { id: orderId },
      data: {
        customData: custom as any,
        ...(orderFields ? orderFields(order, next) : {}),
      },
    });
    return next;
  });
}

export async function auditShiprocket(user: SessionUser, order: OrderRow, action: string, detail: Record<string, unknown>) {
  try {
    await db.auditLog.create({
      data: {
        orderId: order.id,
        userId: user.id,
        userName: user.name || user.username,
        userRole: null,
        action: `SHIPROCKET_${action}`,
        orderNumber: order.roPoNumber,
        platformCode: order.channel,
        metadata: { app: "Appointment Management", ...detail } as any,
      },
    });
  } catch (err) {
    console.error("[shiprocket] audit log failed:", err);
  }
}

export function shiprocketErrorResponse(err: unknown, action: string): NextResponse {
  if (err instanceof ShiprocketConfigError) return NextResponse.json({ error: err.message, kind: "config" }, { status: 503 });
  if (err instanceof ShiprocketError) {
    const fromBody = err.kind === "http" ? extractShiprocketMessage(err.body) : null;
    return NextResponse.json(
      { error: fromBody ? `Shiprocket: ${fromBody}` : err.userMessage, kind: err.kind, retryAfterSeconds: err.retryAfterSeconds ?? null },
      { status: shiprocketErrorHttpStatus(err) }
    );
  }
  console.error(`[shiprocket] ${action} failed:`, err);
  return NextResponse.json({ error: `Shiprocket ${action} failed unexpectedly.` }, { status: 500 });
}

export function notConfiguredResponse(): NextResponse | null {
  if (isShiprocketConfigured()) return null;
  return NextResponse.json(
    { error: "Shiprocket Cargo is not configured yet: SHIPROCKET_REFRESH_TOKEN and SHIPROCKET_CLIENT_ID are missing on the server.", kind: "config" },
    { status: 503 }
  );
}

/** Merges new tracking events into our history (dedupe on status+timestamp), newest last, capped. */
export function mergeHistory(current: ShiprocketStatusEntry[] | undefined, incoming: ShiprocketStatusEntry[]): ShiprocketStatusEntry[] {
  const seen = new Set((current || []).map((h) => `${h.status}|${h.timestamp}`));
  const merged = [...(current || [])];
  for (const h of incoming) {
    const k = `${h.status}|${h.timestamp}`;
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(h);
    }
  }
  return merged.slice(-150);
}

export const nowIso = () => new Date().toISOString();
export const actorName = (u: SessionUser) => u.name || u.username;

/** Order dates → YYYY-MM-DD in India time, or null. */
export function istDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** A claim left by a crashed request: we cannot know whether it reached Shiprocket. */
export function isStaleClaim(state: string | undefined, submittedAt: string | undefined): boolean {
  return state === "submitting" && Boolean(submittedAt) && Date.now() - Date.parse(submittedAt!) > 2 * 60 * 1000;
}
