import { NextRequest, NextResponse } from "next/server";
import { downloadDocument, mapLabelUrls } from "@/modules/delhivery";
import { delhiveryErrorResponse, documentResponse, loadDelhiveryOrder, notConfiguredResponse, readDelhivery } from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";

/** GET /api/delhivery/orders/:id/pod?type=LM_POD|RETURN_DSP_POD — proof of delivery. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const lrn = readDelhivery(ctx.order).lrn;
  if (!lrn) return NextResponse.json({ error: "This order has no Delhivery LR." }, { status: 409 });
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const type = req.nextUrl.searchParams.get("type") === "RETURN_DSP_POD" ? "RETURN_DSP_POD" : "LM_POD";
  try {
    const res = await downloadDocument(lrn, type);
    return documentResponse(res, `POD-${lrn}`, mapLabelUrls);
  } catch (err) {
    return delhiveryErrorResponse(err, "POD download");
  }
}
