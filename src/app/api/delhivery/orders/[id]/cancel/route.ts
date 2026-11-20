import { NextRequest, NextResponse } from "next/server";
import { canOverride } from "@/lib/permissions";
import { cancelLr } from "@/modules/delhivery";
import {
  DELHIVERY_COURIER_NAME,
  actorName,
  auditDelhivery,
  delhiveryErrorResponse,
  loadDelhiveryOrder,
  notConfiguredResponse,
  nowIso,
  requireLrn,
  updateDelhivery,
} from "@/lib/delhivery-orders";
import { withoutShippingLabelBarcodes } from "@/lib/courier-booking-guards";

export const dynamic = "force-dynamic";

/**
 * POST /api/delhivery/orders/:id/cancel  Body: { confirmLrn, reason }
 * Cancels the LR with Delhivery. ADMIN only, and the LR number must be re-typed.
 * Delhivery allows this only while Manifested / In Transit / Pending / Open / Scheduled.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id, "courier.book");
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  if (!canOverride(user, order.channel)) return NextResponse.json({ error: "Cancelling a Delhivery LR needs the 'Override workflow gates' permission on this platform." }, { status: 403 });
  const lr = requireLrn(order);
  if (lr instanceof NextResponse) return lr;

  const body = await req.json().catch(() => ({}));
  if (String(body.confirmLrn || "").trim() !== lr.lrn) {
    return NextResponse.json({ error: "Type the LR number exactly to confirm cancellation." }, { status: 400 });
  }
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return NextResponse.json({ error: "Give a reason for cancelling." }, { status: 400 });
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  try {
    const res = await cancelLr(lr.lrn);
    const rec = await updateDelhivery(
      order.id,
      (r) => ({ ...r, cancelled: { at: nowIso(), by: actorName(user), reason } }),
      (o) => ({
        ...(o.trackingId === lr.lrn ? { trackingId: null } : {}),
        ...(o.courierPartner === DELHIVERY_COURIER_NAME ? { courierPartner: null } : {}),
      }),
      // The cancelled LR's box AWBs must no longer pass App 1's BoxTrace dispatch scan.
      (custom, next) => withoutShippingLabelBarcodes(custom, next.awbs ?? [])
    );
    await auditDelhivery(user, order, "LR_CANCELLED", { lrn: lr.lrn, reason, requestId: res.requestId });
    return NextResponse.json({ delhivery: rec });
  } catch (err) {
    return delhiveryErrorResponse(err, "LR cancel");
  }
}
