import { NextRequest, NextResponse } from "next/server";
import { mapTrack, trackLr } from "@/modules/delhivery";
import {
  appendStatus,
  delhiveryErrorResponse,
  loadDelhiveryOrder,
  logUnmapped,
  notConfiguredResponse,
  nowIso,
  requireLrn,
  updateDelhivery,
} from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/delhivery/orders/:id/track — refreshes the latest status.
 * Delhivery returns only the latest status, so each change is appended to our own history.
 * Order status fields are NOT changed automatically: "Mark Delivered" stays a deliberate action.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const lr = requireLrn(ctx.order);
  if (lr instanceof NextResponse) return lr;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  try {
    const res = await trackLr(lr.lrn);
    const t = mapTrack(res.data);
    logUnmapped("track", t.matched, res.data);
    const at = nowIso();
    const rec = await updateDelhivery(ctx.order.id, (r) => ({
      ...r,
      tracking: { status: t.rawStatus, location: t.location, statusTime: t.statusTime, checkedAt: at },
      statusHistory: t.rawStatus
        ? appendStatus(r, { status: t.rawStatus, location: t.location, statusTime: t.statusTime, at, source: "manual" })
        : r.statusHistory,
    }));
    return NextResponse.json({ delhivery: rec, provisional: true, matched: t.matched });
  } catch (err) {
    return delhiveryErrorResponse(err, "tracking");
  }
}
