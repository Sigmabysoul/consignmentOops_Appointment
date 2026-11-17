import { NextRequest, NextResponse } from "next/server";
import { mapTrack, trackWaybill } from "@/modules/shiprocket";
import {
  loadShiprocketOrder,
  mergeHistory,
  notConfiguredResponse,
  nowIso,
  readShiprocket,
  shiprocketErrorResponse,
  updateShiprocket,
} from "@/lib/shiprocket-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/shiprocket/orders/:id/track — refreshes status + history by waybill.
 * Order status is NOT changed: Delivered stays a deliberate action with a POD.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadShiprocketOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const rec0 = readShiprocket(ctx.order);
  if (!rec0.waybill) return NextResponse.json({ error: "This order has no Shiprocket waybill yet." }, { status: 409 });
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;
  try {
    const t = mapTrack((await trackWaybill(rec0.waybill)).data);
    const rec = await updateShiprocket(ctx.order.id, (r) => ({
      ...r,
      tracking: { status: t.status, statusDp: t.statusDp, location: t.location, edd: t.edd, deliveredAt: t.deliveredAt, checkedAt: nowIso() },
      statusHistory: mergeHistory(r.statusHistory, t.history),
    }));
    return NextResponse.json({ shiprocket: rec });
  } catch (err) {
    return shiprocketErrorResponse(err, "tracking");
  }
}
