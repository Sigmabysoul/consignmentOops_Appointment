import { NextRequest, NextResponse } from "next/server";
import { getShippingLabels, mapLabelUrls, type DelhiveryLabelSize } from "@/modules/delhivery";
import { delhiveryErrorResponse, loadDelhiveryOrder, notConfiguredResponse, nowIso, requireLrn, updateDelhivery } from "@/lib/delhivery-orders";

export const dynamic = "force-dynamic";
const SIZES: DelhiveryLabelSize[] = ["sm", "md", "a4", "std"];

/**
 * GET /api/delhivery/orders/:id/labels?size=std
 * Returns the per-box label links. Per the portal, each link's content is a base64 PNG stream;
 * the UI decodes it for printing.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const lr = requireLrn(ctx.order);
  if (lr instanceof NextResponse) return lr;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  const sizeParam = req.nextUrl.searchParams.get("size") as DelhiveryLabelSize | null;
  const size = sizeParam && SIZES.includes(sizeParam) ? sizeParam : "std";
  try {
    const res = await getShippingLabels(lr.lrn, size);
    const urls = mapLabelUrls(res.data);
    if (!urls.length) return NextResponse.json({ error: "Delhivery returned no label links." }, { status: 502 });
    await updateDelhivery(ctx.order.id, (r) => ({ ...r, labels: { size, urls, fetchedAt: nowIso() } }));
    if (req.nextUrl.searchParams.get("images") !== "1") return NextResponse.json({ size, urls, provisional: true });

    // Decode server-side: the browser cannot read the links cross-origin.
    const images: string[] = [];
    const failed: string[] = [];
    for (const url of urls.slice(0, 200)) {
      const img = await fetchLabelImage(url);
      if (img) images.push(img);
      else failed.push(url);
    }
    return NextResponse.json({ size, urls, images, failedCount: failed.length, provisional: true });
  } catch (err) {
    return delhiveryErrorResponse(err, "labels");
  }
}

const BASE64_RE = /^[A-Za-z0-9+/=\s]+$/;

/** A label link's content -> data URI. Handles raw image bytes, a base64 text body, or a data URI. */
async function fetchLabelImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (type.startsWith("image/")) return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
    let text = buf.toString("utf8").trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        const found = JSON.stringify(JSON.parse(text)).match(/(data:image\/[a-z]+;base64,)?[A-Za-z0-9+/]{200,}={0,2}/);
        if (found) text = found[0];
      } catch {}
    }
    text = text.replace(/^"|"$/g, "");
    if (text.startsWith("data:image/")) return text;
    if (BASE64_RE.test(text) && text.length > 100) return `data:image/png;base64,${text.replace(/\s/g, "")}`;
    return null;
  } catch {
    return null;
  }
}
