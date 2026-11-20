import { NextRequest, NextResponse } from "next/server";
import { canOverride } from "@/lib/permissions";
import {
  DelhiveryError,
  buildManifestForm,
  createManifest,
  getDelhiveryConfig,
  getManifestStatus,
  mapManifestJobId,
  mapManifestStatus,
  type ManifestInput,
} from "@/modules/delhivery";
import {
  DELHIVERY_COURIER_NAME,
  actorName,
  appendStatus,
  auditDelhivery,
  delhiveryErrorResponse,
  loadDelhiveryOrder,
  logUnmapped,
  notConfiguredResponse,
  nowIso,
  readDelhivery,
  updateDelhivery,
} from "@/lib/delhivery-orders";
import type { DelhiveryShipmentRecord } from "@/lib/delhivery-types";
import { requireBookingDeskOrder } from "@/lib/courier-booking-desk";
import {
  DELHIVERY_PENDING_STALE_MINUTES,
  effectiveManifestState,
  otherCarrierRefusal,
  withShippingLabelBarcodes,
} from "@/lib/courier-booking-guards";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Errors raised before anything reached Delhivery: the manifest was certainly not created. */
const NOT_SENT_KINDS = new Set(["invalid_input", "config", "booking_disabled", "auth", "auth_locked"]);

/**
 * POST /api/delhivery/orders/:id/manifest  (multipart/form-data)
 *   payload: JSON { consignee, invoices, boxes, totalWeightKg, description, paymentMode,
 *                   codAmount?, freightMode?, rovInsurance?, fmPickup?, override? }
 *   invoiceFile: 0..10 files (png/jpg/jpeg/pdf/bmp, 20 MB total)
 *
 * Duplicate-LR protection: the order row is locked and a "submitting" claim is written before
 * the call. A second request (double click, second tab) is refused. If the call's outcome is
 * unknown (timeout after sending, or a job still "pending" after DELHIVERY_PENDING_STALE_MINUTES),
 * resubmitting requires `override: true` from an ADMIN.
 * Only orders on the Booking desk can be booked, and never while Shiprocket holds a live booking.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id, "courier.book");
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;
  const offDesk = await requireBookingDeskOrder(order.id, "Delhivery One");
  if (offDesk) return offDesk;
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  let input: ManifestInput;
  let override = false;
  try {
    const form = await req.formData();
    const payload = JSON.parse(String(form.get("payload") || "{}"));
    override = payload.override === true;
    const files = form.getAll("invoiceFile").filter((f): f is File => typeof f === "object" && f !== null && "size" in f && (f as File).size > 0);
    const allowed = /\.(png|jpe?g|pdf|bmp)$/i;
    for (const f of files) {
      if (!allowed.test(f.name)) {
        return NextResponse.json({ error: `"${f.name}" is not a png, jpg, jpeg, pdf or bmp file.` }, { status: 400 });
      }
    }
    const invoiceNumbers = (payload.invoices || []).map((i: any) => String(i.number || "").trim()).filter(Boolean);
    input = {
      orderId: order.roPoNumber,
      description: String(payload.description || ""),
      boxes: payload.boxes || [],
      totalWeightKg: Number(Number(payload.totalWeightKg).toFixed(2)),
      consignee: payload.consignee || {},
      invoices: (payload.invoices || []).map((i: any) => ({
        number: i.number,
        amount: i.amount === "" || i.amount == null ? undefined : Number(i.amount),
        ewaybill: i.ewaybill,
        qrCode: i.qrCode,
      })),
      paymentMode: payload.paymentMode === "cod" ? "cod" : "prepaid",
      codAmount: payload.codAmount ? Number(payload.codAmount) : undefined,
      freightMode: payload.freightMode === "fod" ? "fod" : "fop",
      rovInsurance: Boolean(payload.rovInsurance),
      fmPickup: Boolean(payload.fmPickup),
      docs: files.map((f) => ({ file: f, filename: f.name, invoiceNumbers })),
    };
    // Validate fully before claiming the order (throws DelhiveryError invalid_input).
    buildManifestForm(input, getDelhiveryConfig().warehouseName);
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "payload is not valid JSON" }, { status: 400 });
    return delhiveryErrorResponse(err, "manifest");
  }

  // ---- claim (row lock) ----
  const config = getDelhiveryConfig();
  let refusal: string | null = null;
  await updateDelhivery(order.id, (rec, locked) => {
    // A claim left behind by a crashed request, or a job whose status never resolved: we cannot
    // know whether it reached Delhivery / created an LR.
    const state = effectiveManifestState(rec.manifest);
    const otherCarrier = otherCarrierRefusal("delhivery", locked.customData as any);
    if (rec.lrn && !rec.cancelled) refusal = `This order is already booked with Delhivery (LR ${rec.lrn}).`;
    else if (otherCarrier) refusal = otherCarrier;
    else if (state === "submitting" || state === "pending") refusal = "A Delhivery booking for this order is already in progress.";
    else if (state === "unknown_outcome" && !(override && canOverride(user, order.channel))) {
      refusal =
        rec.manifest?.state === "pending"
          ? `Delhivery has not confirmed the last booking for over ${DELHIVERY_PENDING_STALE_MINUTES} minutes and it may have created an LR. Check the Delhivery One panel first; an admin can then resubmit.`
          : "The last booking attempt timed out and may have created an LR. Check the Delhivery One panel first; an admin can then resubmit.";
    }
    if (refusal) return rec;
    return {
      ...rec,
      env: config.env,
      warehouseName: config.warehouseName,
      manifest: {
        state: "submitting",
        jobId: null,
        submittedAt: nowIso(),
        submittedBy: actorName(user),
        summary: {
          boxes: input.boxes.reduce((s, b) => s + Number(b.boxCount || 0), 0),
          weightKg: input.totalWeightKg,
          consigneePin: String(input.consignee.pin || ""),
          invoiceTotal: Number(input.invoices.reduce((s, i) => s + (i.amount ?? 0), 0).toFixed(2)),
          paymentMode: input.paymentMode ?? "prepaid",
        },
      },
      // A new booking after a cancelled LR starts a fresh shipment record.
      ...(rec.cancelled
        ? { lrn: undefined, awbs: undefined, bookedAt: undefined, appointment: undefined, pickup: undefined, tracking: undefined, labels: undefined, actualFreight: undefined, cancelled: undefined }
        : {}),
      lastError: undefined,
    };
  });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

  // ---- send (never retried) ----
  try {
    const res = await createManifest(input, config);
    const jobId = mapManifestJobId(res.data);
    if (!jobId) logUnmapped("manifest create", [], res.data);
    const rec = await updateDelhivery(order.id, (r) => ({
      ...r,
      manifest: {
        ...r.manifest!,
        // Accepted but no job id we can recognise: treat as unknown rather than "failed".
        state: jobId ? "pending" : "unknown_outcome",
        jobId,
        requestId: res.requestId,
        message: jobId ? null : "Delhivery accepted the request but no job id was recognised in the response.",
      },
    }));
    await auditDelhivery(user, order, "MANIFEST_SUBMITTED", { jobId, requestId: res.requestId, override });
    return NextResponse.json({ delhivery: rec });
  } catch (err) {
    const notSent = err instanceof DelhiveryError && (NOT_SENT_KINDS.has(err.kind) || (err.kind === "rate_limited" && !err.status));
    const rejected = err instanceof DelhiveryError && err.kind === "http" && (err.status ?? 0) < 500;
    const message = err instanceof DelhiveryError ? err.userMessage : String((err as any)?.message || err);
    await updateDelhivery(order.id, (r) => ({
      ...r,
      manifest: {
        ...r.manifest!,
        state: notSent || rejected ? "failed" : "unknown_outcome",
        message,
        requestId: err instanceof DelhiveryError ? err.requestId ?? null : null,
      },
      lastError: { at: nowIso(), action: "manifest", message, requestId: err instanceof DelhiveryError ? err.requestId : null },
    }));
    await auditDelhivery(user, order, "MANIFEST_FAILED", { message, outcome: notSent || rejected ? "failed" : "unknown" });
    return delhiveryErrorResponse(err, "manifest");
  }
}

/**
 * GET /api/delhivery/orders/:id/manifest
 * Polls the manifest job. On success saves LR + AWBs, sets trackingId (if empty) and courier.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await loadDelhiveryOrder(req, id);
  if (ctx instanceof NextResponse) return ctx;
  const { user, order } = ctx;

  const current = readDelhivery(order);
  const jobId = current.manifest?.jobId;
  // Keep polling a job that went stale (unknown_outcome with a job id): a late success still
  // records the LR instead of leaving a paid booking invisible.
  const pollable = current.manifest?.state === "pending" || (current.manifest?.state === "unknown_outcome" && Boolean(jobId));
  if ((current.lrn && !current.cancelled) || !jobId || !pollable) return NextResponse.json({ delhivery: current });
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;

  try {
    const res = await getManifestStatus(jobId);
    const mapped = mapManifestStatus(res.data);
    logUnmapped("manifest status", mapped.matched, res.data);
    const at = nowIso();
    const rec = await updateDelhivery(
      order.id,
      (r): DelhiveryShipmentRecord => {
        const manifest = { ...r.manifest!, lastCheckedAt: at, rawStatus: mapped.rawStatus };
        if (mapped.state === "success" && mapped.lrn) {
          return {
            ...r,
            manifest: { ...manifest, state: "success", message: null },
            lrn: mapped.lrn,
            awbs: mapped.awbs,
            bookedAt: at,
            statusHistory: appendStatus(r, { status: "MANIFESTED", location: null, statusTime: null, at, source: "booking" }),
          };
        }
        if (mapped.state === "failed") {
          return { ...r, manifest: { ...manifest, state: "failed", message: mapped.message || "Delhivery rejected the booking." } };
        }
        // Still unresolved long after submission: stop treating it as "in progress" so an admin
        // can check the Delhivery One panel and resubmit (same handling as a timed-out submit).
        if (r.manifest?.state === "pending" && effectiveManifestState(r.manifest) === "unknown_outcome") {
          return {
            ...r,
            manifest: {
              ...manifest,
              state: "unknown_outcome",
              message: `Delhivery did not confirm this booking within ${DELHIVERY_PENDING_STALE_MINUTES} minutes. Check the Delhivery One panel before booking again.`,
            },
          };
        }
        return { ...r, manifest };
      },
      (o) =>
        mapped.state === "success" && mapped.lrn
          ? { courierPartner: DELHIVERY_COURIER_NAME, ...(o.trackingId?.trim() ? {} : { trackingId: mapped.lrn }) }
          : {},
      // Box AWBs → customData.shippingLabelBarcodes, the list App 1's BoxTrace dispatch gate
      // checks carrier-label scans against (kept de-duplicated; existing entries untouched).
      (custom, next) =>
        mapped.state === "success" && mapped.lrn ? withShippingLabelBarcodes(custom, next.awbs ?? []) : custom
    );
    if (mapped.state === "success") await auditDelhivery(user, order, "BOOKED", { lrn: mapped.lrn, awbs: mapped.awbs.length });
    if (mapped.state === "failed") await auditDelhivery(user, order, "MANIFEST_REJECTED", { message: mapped.message });
    return NextResponse.json({ delhivery: rec, provisional: true, matched: mapped.matched });
  } catch (err) {
    return delhiveryErrorResponse(err, "manifest status");
  }
}
