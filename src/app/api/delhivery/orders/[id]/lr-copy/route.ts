import { NextRequest, NextResponse } from "next/server";
import { getLrCopy, mapLabelUrls } from "@/modules/delhivery";
import { delhiveryErrorResponse, documentResponse, loadDelhiveryOrder, notConfiguredResponse, requireLrn } from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";
const COPY_TYPES = ["SHIPPER COPY", "ORIGIN ACCOUNTS COPY", "REGULATORY COPY", "LM POD", "RECIPIENT COPY"];

/** GET /api/delhivery/orders/:id/lr-copy?types=SHIPPER COPY,RECIPIENT COPY — streams the PDF. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const lr = requireLrn(ctx.order);
  if (lr instanceof NextResponse) return lr;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const types = (req.nextUrl.searchParams.get("types") || "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => COPY_TYPES.includes(t));
  try {
    const res = await getLrCopy(lr.lrn, types.length ? types : undefined);
    return documentResponse(res, `LR-${lr.lrn}.pdf`, mapLabelUrls);
  } catch (err) {
    return delhiveryErrorResponse(err, "LR copy");
  }
}
