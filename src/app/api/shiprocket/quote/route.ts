import { NextRequest, NextResponse } from "next/server";
import { getCharges, getShiprocketConfig, mapCharges, totalWeightKg, validatePackages } from "@/modules/shiprocket";
import {
  actorName,
  loadShiprocketOrder,
  notConfiguredResponse,
  nowIso,
  requireLogisticsUser,
  shiprocketErrorResponse,
  updateShiprocket,
} from "@/lib/shiprocket-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/shiprocket/quote
 * Body: { orderId?, to: { pincode, city, state }, packages: ShiprocketPackage[], invoiceValue }
 * Live rates from every serviceable surface carrier, cheapest first. Snapshotted on the order when orderId is given.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  let ctx: Awaited<ReturnType<typeof loadShiprocketOrder>> | null = null;
  if (body.orderId) {
    ctx = await loadShiprocketOrder(req, String(body.orderId));
    if (ctx instanceof NextResponse) return ctx;
  } else {
    const user = await requireLogisticsUser(req);
    if (user instanceof NextResponse) return user;
  }
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  try {
    const config = getShiprocketConfig();
    const input = {
      packages: validatePackages(body.packages || []),
      invoiceValue: Number(Number(body.invoiceValue).toFixed(2)),
      to: { pincode: String(body.to?.pincode || ""), city: String(body.to?.city || ""), state: String(body.to?.state || "") },
    };
    const res = await getCharges(input, config);
    const quotes = mapCharges(res.data);
    if (ctx && !(ctx instanceof NextResponse)) {
      const { user, order } = ctx;
      await updateShiprocket(order.id, (rec) => ({
        ...rec,
        quote: {
          at: nowIso(),
          by: actorName(user),
          destinationPin: input.to.pincode,
          weightKg: totalWeightKg(input.packages),
          invoiceValue: input.invoiceValue,
          quotes,
        },
      }));
    }
    return NextResponse.json({ quotes });
  } catch (err) {
    return shiprocketErrorResponse(err, "quote");
  }
}
