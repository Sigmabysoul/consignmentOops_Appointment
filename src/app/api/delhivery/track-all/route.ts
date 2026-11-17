import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DelhiveryError, mapTrack, trackLr } from "@/modules/delhivery";
import { appendStatus, notConfiguredResponse, nowIso, readDelhivery, requireLogisticsUser, updateDelhivery } from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";
const MAX_PER_RUN = 100; // tracking limit is 500 / 5 min / IP; leave room for manual refreshes

/**
 * POST /api/delhivery/track-all — refreshes every active Delhivery LR (not delivered,
 * not cancelled). Meant for a "Refresh all" button or a scheduled job (every ~2 hours).
 */
export async function POST(req: NextRequest) {
  const user = await requireLogisticsUser(req);
  if (user instanceof NextResponse) return user;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const candidates = await db.$queryRaw<{ id: string; customData: unknown }[]>`
    SELECT id, "customData" FROM "ConsignmentOrder"
    WHERE "customData"->'delhivery'->>'lrn' IS NOT NULL
      AND "customData"->'delhivery'->'cancelled' IS NULL
      AND COALESCE("isDeleted", false) = false
      AND COALESCE(status, '') NOT IN ('Cancelled', 'Delivered')
    ORDER BY "updatedAt" ASC
    LIMIT 500`;
  const active = candidates
    .map((o) => ({ id: o.id, rec: readDelhivery(o) }))
    .filter(({ rec }) => rec.lrn && !rec.cancelled && !["DELIVERED", "RETURN_DELIVERED", "LOST"].includes(rec.tracking?.status || ""))
    .slice(0, MAX_PER_RUN);

  let refreshed = 0;
  const failures: { orderId: string; error: string }[] = [];
  for (const { id, rec } of active) {
    try {
      const t = mapTrack((await trackLr(rec.lrn!)).data);
      const at = nowIso();
      await updateDelhivery(id, (r) => ({
        ...r,
        tracking: { status: t.rawStatus, location: t.location, statusTime: t.statusTime, checkedAt: at },
        statusHistory: t.rawStatus ? appendStatus(r, { status: t.rawStatus, location: t.location, statusTime: t.statusTime, at, source: "poll" }) : r.statusHistory,
      }));
      refreshed++;
    } catch (err) {
      const message = err instanceof DelhiveryError ? err.userMessage : String((err as any)?.message || err);
      failures.push({ orderId: id, error: message });
      if (err instanceof DelhiveryError && ["rate_limited", "auth", "auth_locked", "config"].includes(err.kind)) break;
    }
  }
  return NextResponse.json({ checked: active.length, refreshed, failures });
}
