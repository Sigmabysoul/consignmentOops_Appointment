import { NextRequest, NextResponse } from "next/server";
import {
  DelhiveryError,
  assertPincode,
  estimateFreight,
  getExpectedTat,
  getPincodeServiceability,
  getDelhiveryConfig,
  kgToGrams,
  mapFreight,
  mapServiceability,
  mapTat,
  type FreightEstimateBox,
} from "@/modules/delhivery";
import {
  actorName,
  delhiveryErrorResponse,
  loadDelhiveryOrder,
  logUnmapped,
  notConfiguredResponse,
  nowIso,
  requireLogisticsUser,
  updateDelhivery,
} from "@/lib/delhivery-orders";
import { DelhiveryEstimateResult } from "@/lib/delhivery-types";

export const dynamic = "force-dynamic";

/**
 * POST /api/delhivery/estimate
 * Body: { destinationPin, weightKg, invoiceAmount, boxes: [{lengthCm,widthCm,heightCm,boxCount}],
 *         rovInsurance?, orderId? }
 * Runs serviceability, TAT and freight estimate in parallel. A failure in one does not hide
 * the others. When orderId is given the result is snapshotted on the order.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  let orderCtx: Awaited<ReturnType<typeof loadDelhiveryOrder>> | null = null;
  if (body.orderId) {
    orderCtx = await loadDelhiveryOrder(req, String(body.orderId));
    if (orderCtx instanceof NextResponse) return orderCtx;
  } else {
    const user = await requireLogisticsUser(req);
    if (user instanceof NextResponse) return user;
  }

  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  try {
    const config = getDelhiveryConfig();
    const destinationPin = assertPincode(String(body.destinationPin ?? ""), "destination pincode");
    const weightKg = Number(Number(body.weightKg).toFixed(2));
    const invoiceAmount = Number(Number(body.invoiceAmount).toFixed(2));
    const boxes: FreightEstimateBox[] = Array.isArray(body.boxes)
      ? body.boxes.map((b: any) => ({
          lengthCm: Number(b.lengthCm),
          widthCm: Number(b.widthCm),
          heightCm: Number(b.heightCm),
          boxCount: Number(b.boxCount),
        }))
      : [];

    const [svc, tat, freight] = await Promise.allSettled([
      getPincodeServiceability(destinationPin, weightKg > 0 ? kgToGrams(weightKg) : undefined, config),
      getExpectedTat(config.sourcePin, destinationPin, config),
      estimateFreight(
        { boxes, totalWeightKg: weightKg, destinationPin, invoiceAmount, rovInsurance: Boolean(body.rovInsurance) },
        config
      ),
    ]);

    // Bad input is the caller's problem, not a partial result.
    for (const r of [svc, tat, freight]) {
      if (r.status === "rejected" && r.reason instanceof DelhiveryError && r.reason.kind === "invalid_input") throw r.reason;
    }

    if (svc.status === "fulfilled") logUnmapped("serviceability", mapServiceability(svc.value.data).matched, svc.value.data);
    if (tat.status === "fulfilled") logUnmapped("tat", mapTat(tat.value.data).matched, tat.value.data);
    if (freight.status === "fulfilled") logUnmapped("freight estimate", mapFreight(freight.value.data).matched, freight.value.data);

    const errors: DelhiveryEstimateResult["errors"] = [];
    const failMsg = (reason: unknown) => (reason instanceof DelhiveryError ? reason.userMessage : String((reason as any)?.message || reason));
    const s = svc.status === "fulfilled" ? mapServiceability(svc.value.data) : (errors.push({ call: "serviceability", message: failMsg(svc.reason) }), null);
    const t = tat.status === "fulfilled" ? mapTat(tat.value.data) : (errors.push({ call: "tat", message: failMsg(tat.reason) }), null);
    const f = freight.status === "fulfilled" ? mapFreight(freight.value.data) : (errors.push({ call: "freight", message: failMsg(freight.reason) }), null);

    if (errors.length === 3) {
      // Everything failed: surface the first real error (auth, config, busy...).
      throw (svc as PromiseRejectedResult).reason;
    }

    const result: DelhiveryEstimateResult = {
      serviceable: s?.serviceable ?? null,
      oda: s?.oda ?? null,
      tatDays: t?.days ?? null,
      total: f?.total ?? null,
      gst: f?.gst ?? null,
      lines: f?.lines ?? [],
      matched: [...(s?.matched ?? []), ...(t?.matched ?? []), ...(f?.matched ?? [])],
      errors,
      provisional: true,
    };

    if (orderCtx && !(orderCtx instanceof NextResponse)) {
      const { user, order } = orderCtx;
      await updateDelhivery(order.id, (rec) => ({
        ...rec,
        estimate: {
          at: nowIso(),
          by: actorName(user),
          destinationPin,
          weightKg,
          invoiceAmount,
          serviceable: result.serviceable,
          oda: result.oda,
          tatDays: result.tatDays,
          total: result.total,
          gst: result.gst,
          lines: result.lines,
          matched: result.matched,
        },
      }));
    }

    return NextResponse.json(result);
  } catch (err) {
    return delhiveryErrorResponse(err, "estimate");
  }
}
