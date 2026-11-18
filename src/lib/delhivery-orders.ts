import { isVisibleInAppointmentApp } from "@/lib/order-filters";
/**
 * Server-side glue between Delhivery API calls and ConsignmentOrder rows.
 *
 * Everything Delhivery-related is stored under `customData.delhivery` (no schema change: the
 * database is shared with the consignment app). Route handlers in src/app/api/delhivery/ use
 * these helpers; nothing here is imported by client components.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getAllowedCouriersForChannel } from "@/lib/courier-defaults";
import { SessionUser } from "@/lib/types";
import {
  DelhiveryConfigError,
  DelhiveryError,
  delhiveryErrorHttpStatus,
  extractDelhiveryMessage,
  isDelhiveryConfigured,
  redactDelhiveryPayload,
} from "@/modules/delhivery";
import type { DelhiveryShipmentRecord, DelhiveryStatusEntry } from "@/lib/delhivery-types";

export const DELHIVERY_COURIER_NAME = "Delhivery One";

export type OrderRow = NonNullable<Awaited<ReturnType<typeof db.consignmentOrder.findUnique>>>;

export function readDelhivery(order: { customData: unknown }): DelhiveryShipmentRecord {
  const custom = (order.customData as Record<string, any>) || {};
  const rec = custom.delhivery;
  return rec && typeof rec === "object" ? (rec as DelhiveryShipmentRecord) : {};
}

/** Auth + order lookup + quarantine/courier-policy checks shared by every order route. */
export async function loadDelhiveryOrder(
  req: Request,
  id: string
): Promise<{ user: SessionUser; order: OrderRow } | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isLogisticsAuthorized) return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });

  const order = await db.consignmentOrder.findUnique({ where: { id } });
  if (!order || !isVisibleInAppointmentApp(order)) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!getAllowedCouriersForChannel(order.channel).includes(DELHIVERY_COURIER_NAME)) {
    return NextResponse.json(
      { error: `Delhivery is not an allowed courier for ${order.channel} orders.` },
      { status: 422 }
    );
  }
  return { user, order };
}

export async function requireLogisticsUser(req: Request): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isLogisticsAuthorized) return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
  return user;
}

/**
 * Merges `patch` into customData.delhivery inside a row lock, so two requests for the same
 * order cannot overwrite each other's Delhivery fields. Optional `orderFields` updates real
 * columns (trackingId, courierPartner) in the same transaction.
 */
export async function updateDelhivery(
  orderId: string,
  patch: (current: DelhiveryShipmentRecord, order: OrderRow) => DelhiveryShipmentRecord,
  orderFields?: (order: OrderRow, next: DelhiveryShipmentRecord) => Record<string, unknown>,
  /** Other customData keys to change in the same locked write (e.g. shippingLabelBarcodes). */
  customExtra?: (custom: Record<string, any>, next: DelhiveryShipmentRecord) => Record<string, any>
): Promise<DelhiveryShipmentRecord> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ConsignmentOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.consignmentOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Order not found");
    const next = patch(readDelhivery(order), order);
    let custom: Record<string, any> = { ...((order.customData as Record<string, any>) || {}), delhivery: next };
    if (customExtra) custom = { ...customExtra(custom, next), delhivery: next };
    await tx.consignmentOrder.update({
      where: { id: orderId },
      data: { customData: custom, ...(orderFields ? orderFields(order, next) : {}) },
    });
    return next;
  });
}

export async function auditDelhivery(
  user: SessionUser,
  order: OrderRow,
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        orderId: order.id,
        userId: user.id,
        userName: user.name || user.username,
        userRole: user.role,
        action: `DELHIVERY_${action}`,
        orderNumber: order.roPoNumber,
        platformCode: order.channel,
        metadata: { app: "Appointment Management", ...detail } as any,
      },
    });
  } catch (err) {
    console.error("[delhivery] audit log failed:", err);
  }
}

export function appendStatus(rec: DelhiveryShipmentRecord, entry: DelhiveryStatusEntry): DelhiveryStatusEntry[] {
  const history = Array.isArray(rec.statusHistory) ? [...rec.statusHistory] : [];
  const last = history[history.length - 1];
  if (!last || last.status !== entry.status || last.location !== entry.location) history.push(entry);
  return history.slice(-100);
}

/** Converts any thrown error into an operator-safe JSON response. */
export function delhiveryErrorResponse(err: unknown, action: string): NextResponse {
  if (err instanceof DelhiveryConfigError) {
    return NextResponse.json({ error: err.message, kind: "config" }, { status: 503 });
  }
  if (err instanceof DelhiveryError) {
    const fromBody = err.kind === "http" ? extractDelhiveryMessage(err.body) : null;
    return NextResponse.json(
      {
        error: fromBody ? `Delhivery: ${fromBody}` : err.userMessage,
        kind: err.kind,
        requestId: err.requestId ?? null,
        retryAfterSeconds: err.retryAfterSeconds ?? null,
      },
      { status: delhiveryErrorHttpStatus(err) }
    );
  }
  console.error(`[delhivery] ${action} failed:`, err);
  return NextResponse.json({ error: `Delhivery ${action} failed unexpectedly.` }, { status: 500 });
}

/** Short-circuits a route when credentials are missing, before any work is done. */
export function notConfiguredResponse(): NextResponse | null {
  if (isDelhiveryConfigured()) return null;
  return NextResponse.json(
    { error: "Delhivery is not configured yet: DELHIVERY_USERNAME and DELHIVERY_PASSWORD are missing on the server.", kind: "config" },
    { status: 503 }
  );
}

export const nowIso = () => new Date().toISOString();
export const actorName = (u: SessionUser) => u.name || u.username;

/** The active (not cancelled) LR on an order, or a 409 response. */
export function requireLrn(order: OrderRow): { rec: DelhiveryShipmentRecord; lrn: string } | NextResponse {
  const rec = readDelhivery(order);
  if (!rec.lrn) return NextResponse.json({ error: "This order has no Delhivery LR yet." }, { status: 409 });
  if (rec.cancelled) return NextResponse.json({ error: `LR ${rec.lrn} was cancelled.` }, { status: 409 });
  return { rec, lrn: rec.lrn };
}

/** "2026-11-17" -> "17/11/2026" (the format Delhivery's appointment API wants). */
export function isoDateToDmy(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Today in India as YYYY-MM-DD. */
export function todayIstIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Sends a document from Delhivery to the browser. The response type of the document endpoints
 * is undocumented: it may be file bytes, or JSON carrying a link. Bytes are streamed with the
 * upstream content type; JSON links are returned as { urls }.
 */
export function documentResponse(
  res: { data: unknown; contentType: string | null },
  filename: string,
  mapUrls: (body: unknown) => string[]
): NextResponse {
  const type = (res.contentType || "").toLowerCase();
  if (Buffer.isBuffer(res.data) && !type.includes("json") && !type.startsWith("text/")) {
    return new NextResponse(new Uint8Array(res.data), {
      headers: {
        "Content-Type": res.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  let body: unknown = res.data;
  if (Buffer.isBuffer(body)) {
    const text = body.toString("utf8");
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  const urls = mapUrls(body);
  if (!urls.length) {
    return NextResponse.json(
      { error: "Delhivery returned no file or link for this document.", detail: extractDelhiveryMessage(body) },
      { status: 502 }
    );
  }
  return NextResponse.json({ urls });
}

/**
 * The response mappers are provisional. When one recognises nothing, log the redacted raw
 * body once per call so the real field names can be read off the server log.
 */
export function logUnmapped(action: string, matched: string[], body: unknown): void {
  if (matched.length) return;
  let text: string;
  try {
    text = JSON.stringify(redactDelhiveryPayload(body));
  } catch {
    text = String(body);
  }
  console.warn(`[delhivery] ${action}: no known fields in response (mapper needs updating): ${text.slice(0, 2000)}`);
}
