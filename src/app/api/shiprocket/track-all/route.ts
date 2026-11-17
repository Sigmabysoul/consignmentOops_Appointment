import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SHIPROCKET_TERMINAL_STATUSES, ShiprocketError, mapTrack, trackWaybill } from "@/modules/shiprocket";
import { mergeHistory, notConfiguredResponse, nowIso, readShiprocket, requireLogisticsUser, updateShiprocket } from "@/lib/shiprocket-orders";

export const dynamic = "force-dynamic";
const MAX_PER_RUN = 100;

/** POST /api/shiprocket/track-all — refreshes every active Shiprocket waybill (not delivered / cancelled). */
export async function POST(req: NextRequest) {
  const user = await requireLogisticsUser(req);
  if (user instanceof NextResponse) return user;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const rows = await db.$queryRaw<{ id: string; customData: unknown }[]>`
    SELECT id, "customData" FROM "ConsignmentOrder"
    WHERE "customData"->'shiprocket'->>'waybill' IS NOT NULL
      AND COALESCE("isDeleted", false) = false
      AND COALESCE("isArchived", false) = false
      AND COALESCE(status, '') NOT IN ('Cancelled', 'Delivered', 'Archive')
    ORDER BY "updatedAt" ASC
    LIMIT 500`;
  const active = rows
    .map((o) => ({ id: o.id, rec: readShiprocket(o) }))
    .filter(({ rec }) => rec.waybill && !SHIPROCKET_TERMINAL_STATUSES.includes(rec.tracking?.status || ""))
    .slice(0, MAX_PER_RUN);

  let refreshed = 0;
  const failures: { orderId: string; error: string }[] = [];
  for (const { id, rec } of active) {
    try {
      const t = mapTrack((await trackWaybill(rec.waybill!)).data);
      await updateShiprocket(id, (r) => ({
        ...r,
        tracking: { status: t.status, statusDp: t.statusDp, location: t.location, edd: t.edd, deliveredAt: t.deliveredAt, checkedAt: nowIso() },
        statusHistory: mergeHistory(r.statusHistory, t.history),
      }));
      refreshed++;
    } catch (err) {
      failures.push({ orderId: id, error: err instanceof ShiprocketError ? err.userMessage : String((err as any)?.message || err) });
      if (err instanceof ShiprocketError && ["rate_limited", "auth", "config"].includes(err.kind)) break;
    }
  }
  return NextResponse.json({ checked: active.length, refreshed, failures });
}
