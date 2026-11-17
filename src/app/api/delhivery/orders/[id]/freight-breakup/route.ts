import { NextRequest, NextResponse } from "next/server";
import { getFreightBreakup, mapFreightBreakup } from "@/modules/delhivery";
import { delhiveryErrorResponse, loadDelhiveryOrder, logUnmapped, notConfiguredResponse, nowIso, readDelhivery, updateDelhivery } from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";

/** POST /api/delhivery/orders/:id/freight-breakup — fetches actual billed charges for the LR. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const lrn = readDelhivery(ctx.order).lrn;
  if (!lrn) return NextResponse.json({ error: "This order has no Delhivery LR." }, { status: 409 });
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  try {
    const res = await getFreightBreakup([lrn]);
    const mapped = mapFreightBreakup(res.data, [lrn])[lrn];
    logUnmapped("freight breakup", mapped?.matched ?? [], res.data);
    if (!mapped || mapped.total === null) {
      return NextResponse.json({ error: "No billed charges found for this LR yet." }, { status: 404 });
    }
    const rec = await updateDelhivery(ctx.order.id, (r) => ({
      ...r,
      actualFreight: { total: mapped.total, gst: mapped.gst, lines: mapped.lines, fetchedAt: nowIso() },
    }));
    return NextResponse.json({ delhivery: rec, provisional: true, matched: mapped.matched });
  } catch (err) {
    return delhiveryErrorResponse(err, "freight breakup");
  }
}
