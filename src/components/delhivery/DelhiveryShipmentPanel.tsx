"use client";

import React, { useEffect, useState } from "react";
import { channelsMatch } from "@/lib/channel-aliases";
import { Ban, CalendarCheck, Check, Copy, FileText, Printer, RefreshCw, Truck, Wallet } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import { DELHIVERY_SLOT_OPTIONS, type DelhiveryServerStatus, type DelhiveryShipmentRecord } from "@/lib/delhivery-types";
import { DELHIVERY_TRACK_STATUS_LABELS, type DelhiveryTrackStatus } from "@/modules/delhivery/mappers";
import { DateInput } from "@/components/ui/DateInput";
import { formatDateDisplay, formatDateInputValue, formatDateTimeDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { delhiveryApi, openDelhiveryDocument, postJson, rupees } from "./delhivery-client";
import { DelhiveryProvisionalNote, DelhiveryStatusNote } from "./DelhiveryStatusNote";

interface Props {
  order: AppointmentOrder;
  record: DelhiveryShipmentRecord;
  status: DelhiveryServerStatus | null;
  onRecordChange: (rec: DelhiveryShipmentRecord) => void;
  onOrderUpdated: () => void;
}

type LabelSize = "std" | "sm" | "md" | "a4";
/** Physical sheet per label size (Delhivery portal): std 3x2 in, sm 4x2 in, md 4x2.5 in, A4. */
const LABEL_PAGE: Record<LabelSize, { w: string; h: string; name: string }> = {
  std: { w: "3in", h: "2in", name: "3 × 2 in" },
  sm: { w: "4in", h: "2in", name: "4 × 2 in" },
  md: { w: "4in", h: "2.5in", name: "4 × 2.5 in" },
  a4: { w: "210mm", h: "297mm", name: "A4" },
};

/** DD/MM/YYYY (as sent to Delhivery) -> display format. */
const dmyDisplay = (dmy: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
  return m ? formatDateDisplay(`${m[3]}-${m[2]}-${m[1]}`) : dmy;
};

const statusLabel = (s: string | null | undefined) =>
  s ? DELHIVERY_TRACK_STATUS_LABELS[s as DelhiveryTrackStatus] || s.replace(/_/g, " ") : "Not checked yet";

function nextWorkingDayIso(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000); // IST calendar date
  d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); // skip Sunday
  return d.toISOString().slice(0, 10);
}

/** Everything that happens after a Delhivery LR exists. Used in the booking modal and the order drawer. */
export function DelhiveryShipmentPanel({ order, record, status, onRecordChange, onOrderUpdated }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAwbs, setShowAwbs] = useState(false);

  const [apptDate, setApptDate] = useState("");
  const [apptSlot, setApptSlot] = useState<string>(DELHIVERY_SLOT_OPTIONS[1]);
  const [apptPo, setApptPo] = useState("");
  const [apptId, setApptId] = useState("");
  const [poExpiry, setPoExpiry] = useState("");

  const [pickupDate, setPickupDate] = useState(nextWorkingDayIso());
  const [pickupTime, setPickupTime] = useState("11:00");
  const [pickupCount, setPickupCount] = useState("");

  const [labelSize, setLabelSize] = useState<LabelSize>("std");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelLrn, setCancelLrn] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    setApptDate(formatDateInputValue(order.appointmentDate) || "");
    setApptPo(order.roPoNumber);
    setApptId(order.appointmentId || "");
    setPoExpiry(formatDateInputValue(order.roExpiryDate) || "");
    setPickupCount(String(record.manifest?.summary.boxes || order.boxCount || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const disabled = !status?.configured;
  const lrn = record.lrn!;

  const run = async (key: string, fn: () => Promise<{ delhivery?: DelhiveryShipmentRecord } | void>, success?: string) => {
    setBusy(key);
    try {
      const out = await fn();
      if (out && out.delhivery) onRecordChange(out.delhivery);
      if (success) showToast(success, "success");
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Delhivery request failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const copyLrn = async () => {
    try {
      await navigator.clipboard.writeText(lrn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const printLabels = () =>
    run("labels", async () => {
      const tab = window.open("", "_blank");
      try {
        const res = await delhiveryApi<{ images: string[]; failedCount: number }>(`/orders/${order.id}/labels?size=${labelSize}&images=1`);
        if (!res.images.length) throw new Error("Delhivery's label links could not be turned into images.");
        if (!tab) throw new Error("Allow pop-ups to print labels.");
        const page = LABEL_PAGE[labelSize];
        tab.document.write(`<!doctype html><html><head><title>Labels ${lrn}</title><style>
          @page { size: ${page.w} ${page.h}; margin: 0mm; }
          html, body { margin: 0; padding: 0; }
          .label { width: ${page.w}; height: ${page.h}; page-break-after: always; break-after: page; overflow: hidden; }
          .label:last-child { page-break-after: auto; break-after: auto; }
          .label img { width: ${page.w}; height: ${page.h}; object-fit: contain; display: block; }
        </style></head><body>${res.images.map((src) => `<div class="label"><img src="${src}"></div>`).join("")}
        <script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
        tab.document.close();
        if (res.failedCount) showToast(`${res.failedCount} label(s) could not be read`, "error");
      } catch (err) {
        tab?.close();
        throw err;
      }
    });

  // Retrying an unknown-outcome booking / cancelling an LR needs "Override workflow gates" on this platform.
  const canOverrideHere = Boolean(status?.overrideChannels?.some((c) => channelsMatch(c, order.channel)));
  const est = record.estimate;
  const act = record.actualFreight;
  // A pickup request that timed out may or may not exist at Delhivery: an admin who checked the
  // Delhivery One panel gets the form back (the retry is sent with override).
  const pickupUnknown = Boolean(record.pickup && !record.pickup.cancelledAt && record.pickup.state === "unknown_outcome");
  const pickupActive = record.pickup && !record.pickup.cancelledAt && !(pickupUnknown && canOverrideHere);

  const box = "rounded-lg bg-slate-50 p-3 space-y-2.5";
  const h = "text-xs font-semibold text-slate-900 flex items-center gap-1.5";
  const icon = "w-3.5 h-3.5 text-slate-400";
  const input = "ui-input";
  const label = "ui-label";

  return (
    <div className="space-y-3 text-xs">
      <DelhiveryStatusNote status={status} />

      {/* LR summary */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="min-w-0 space-y-0.5">
          <div className="ui-eyebrow">Delhivery LR</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-mono text-base font-semibold text-slate-900">{lrn}</span>
            <button type="button" onClick={copyLrn} className="ui-icon-btn h-7 w-7" title="Copy LR">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {record.cancelled && <span className="ui-chip border-rose-200 bg-rose-50 text-rose-700">Cancelled</span>}
          </div>
          <div className="ui-muted">
            {record.awbs?.length ?? 0} AWB(s) · booked {formatDateTimeDisplay(record.bookedAt)} by {record.manifest?.submittedBy || "—"}
            {record.env && ` · ${record.env === "production" ? "Production" : "Staging"}`}
          </div>
        </div>
        {!!record.awbs?.length && (
          <button type="button" onClick={() => setShowAwbs(!showAwbs)} className="ui-btn-ghost ui-btn-sm">
            {showAwbs ? "Hide AWBs" : "Show AWBs"}
          </button>
        )}
        {showAwbs && (
          <div className="flex w-full flex-wrap gap-1.5">
            {record.awbs!.map((a) => (
              <span key={a} className="ui-mono rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                {a}
              </span>
            ))}
          </div>
        )}
      </div>

      {record.cancelled ? (
        <p className="text-slate-600">
          Cancelled {formatDateTimeDisplay(record.cancelled.at)} by {record.cancelled.by}: {record.cancelled.reason}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Tracking */}
          <div className={box}>
            <div className="flex items-center justify-between">
              <span className={h}>
                <RefreshCw className={icon} /> Tracking
              </span>
              <button
                type="button"
                disabled={disabled || busy === "track"}
                onClick={() => run("track", () => delhiveryApi(`/orders/${order.id}/track`, { method: "POST" }))}
                className="ui-btn-secondary ui-btn-sm"
              >
                <RefreshCw className={`h-3 w-3 ${busy === "track" ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            {/* Read-only status text (never a button). */}
            <div className="text-sm font-semibold text-slate-900">{statusLabel(record.tracking?.status)}</div>
            {record.tracking && (
              <div className="ui-muted">
                {record.tracking.location && <>{record.tracking.location} · </>}checked {formatDateTimeDisplay(record.tracking.checkedAt)}
              </div>
            )}
            {!!record.statusHistory?.length && (
              <ol className="max-h-32 space-y-1 overflow-y-auto border-l border-slate-200 pl-3">
                {[...record.statusHistory].reverse().map((s, i) => (
                  <li key={i} className="text-[11px] text-slate-600">
                    <span className="font-medium text-slate-800">{statusLabel(s.status)}</span>
                    {s.location && <> · {s.location}</>} <span className="text-slate-400">· {formatDateTimeDisplay(s.at)}</span>
                  </li>
                ))}
              </ol>
            )}
            {record.tracking && <DelhiveryProvisionalNote />}
          </div>

          {/* Appointment */}
          <div className={box}>
            <span className={h}>
              <CalendarCheck className={icon} /> Delivery appointment
            </span>
            {record.appointment ? (
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-900">
                  {dmyDisplay(record.appointment.date)} · {record.appointment.slot}
                </div>
                <div className="ui-muted">
                  PO {record.appointment.poNumbers.join(", ")}
                  {record.appointment.appointmentId && <> · Appt ID {record.appointment.appointmentId}</>} · booked by {record.appointment.bookedBy}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>Date</label>
                  <DateInput className={input} value={apptDate} onChange={(e) => setApptDate(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Slot</label>
                  <select className="ui-select" value={apptSlot} onChange={(e) => setApptSlot(e.target.value)}>
                    {DELHIVERY_SLOT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>PO number(s)</label>
                  <input className={input} value={apptPo} onChange={(e) => setApptPo(e.target.value)} placeholder="comma separated, max 5" />
                </div>
                <div>
                  <label className={label}>PO expiry</label>
                  <DateInput className={input} value={poExpiry} onChange={(e) => setPoExpiry(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={label}>Appointment ID (from the platform)</label>
                  <input className={input} value={apptId} onChange={(e) => setApptId(e.target.value)} />
                </div>
                <div className="col-span-2 flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={disabled || !apptDate || !poExpiry || busy === "appt"}
                    onClick={() =>
                      run(
                        "appt",
                        () =>
                          delhiveryApi(
                            `/orders/${order.id}/appointment`,
                            postJson({
                              date: apptDate,
                              slot: apptSlot,
                              poNumbers: apptPo.split(",").map((p) => p.trim()).filter(Boolean),
                              appointmentId: apptId,
                              poExpiryDate: poExpiry,
                            })
                          ),
                        "Appointment booked with Delhivery"
                      )
                    }
                    className="ui-btn-primary"
                  >
                    Book appointment
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pickup */}
          <div className={box}>
            <span className={h}>
              <Truck className={icon} /> Pickup request
            </span>
            {pickupActive ? (
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    {formatDateDisplay(record.pickup!.date)} from {record.pickup!.startTime.slice(0, 5)} · {record.pickup!.expectedPackageCount} box(es)
                  </div>
                  <div className="ui-muted">
                    {record.pickup!.id ? `Pickup ID ${record.pickup!.id}` : "Pickup ID not recognised"} · by {record.pickup!.requestedBy}
                  </div>
                  {record.pickup!.state === "submitting" && (
                    <div className="text-[11px] font-medium text-amber-700">Being sent to Delhivery…</div>
                  )}
                  {pickupUnknown && (
                    <div className="text-[11px] font-medium text-amber-700">
                      The request timed out and may not have reached Delhivery. Check the Delhivery One panel; an admin can retry.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={disabled || busy === "pickup-cancel" || !record.pickup!.id}
                  onClick={() => run("pickup-cancel", () => delhiveryApi(`/orders/${order.id}/pickup`, { method: "DELETE" }), "Pickup request cancelled")}
                  className="ui-btn-danger ui-btn-sm shrink-0"
                >
                  Cancel pickup
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 items-end gap-2">
                <div>
                  <label className={label}>Date</label>
                  <DateInput className={input} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
                </div>
                <div>
                  <label className={label}>From</label>
                  <input type="time" className={input} value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Boxes</label>
                  <input className={`${input} ui-mono`} inputMode="numeric" value={pickupCount} onChange={(e) => setPickupCount(e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="col-span-3 flex items-center justify-between gap-2 pt-1">
                  <p className="ui-muted">Delhivery needs one day&apos;s notice for pickups.</p>
                  <button
                    type="button"
                    disabled={disabled || !pickupDate || !pickupCount || busy === "pickup"}
                    onClick={() =>
                      run(
                        "pickup",
                        () =>
                          delhiveryApi(
                            `/orders/${order.id}/pickup`,
                            postJson({ date: pickupDate, time: pickupTime, expectedPackageCount: parseInt(pickupCount, 10), override: pickupUnknown })
                          ),
                        "Pickup requested"
                      )
                    }
                    className="ui-btn-primary shrink-0"
                  >
                    {pickupUnknown ? "I've checked: request pickup again" : "Request pickup"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className={box}>
            <span className={h}>
              <FileText className={icon} /> Documents
            </span>
            <div className="flex items-center gap-2">
              <select className="ui-select w-auto" value={labelSize} onChange={(e) => setLabelSize(e.target.value as LabelSize)}>
                {(Object.keys(LABEL_PAGE) as LabelSize[]).map((s) => (
                  <option key={s} value={s}>
                    {LABEL_PAGE[s].name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={disabled || busy === "labels"} onClick={printLabels} className="ui-btn-primary">
                <Printer className="h-3.5 w-3.5" /> Print box labels
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || busy === "lr"}
                onClick={() => run("lr", () => openDelhiveryDocument(`/orders/${order.id}/lr-copy`))}
                className="ui-btn-secondary"
              >
                LR copy (PDF)
              </button>
              <button
                type="button"
                disabled={disabled || busy === "pod"}
                onClick={() => run("pod", () => openDelhiveryDocument(`/orders/${order.id}/pod`))}
                className="ui-btn-secondary"
              >
                Proof of delivery
              </button>
            </div>
          </div>

          {/* Freight: estimate vs actual */}
          <div className={`${box} md:col-span-2`}>
            <div className="flex items-center justify-between">
              <span className={h}>
                <Wallet className={icon} /> Freight: estimated vs billed
              </span>
              <button
                type="button"
                disabled={disabled || busy === "freight"}
                onClick={() => run("freight", () => delhiveryApi(`/orders/${order.id}/freight-breakup`, { method: "POST" }))}
                className="ui-btn-secondary ui-btn-sm"
              >
                <RefreshCw className={`h-3 w-3 ${busy === "freight" ? "animate-spin" : ""}`} /> Fetch billed charges
              </button>
            </div>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="ui-label">Estimate</dt>
                <dd className="ui-mono text-sm font-semibold text-slate-900">{rupees(est?.total)}</dd>
              </div>
              <div>
                <dt className="ui-label">Billed</dt>
                <dd className="ui-mono text-sm font-semibold text-slate-900">{rupees(act?.total)}</dd>
              </div>
              <div>
                <dt className="ui-label">Difference</dt>
                <dd
                  className={`ui-mono text-sm font-semibold ${
                    est?.total != null && act?.total != null && act.total > est.total ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {est?.total != null && act?.total != null ? rupees(Number((act.total - est.total).toFixed(2))) : "—"}
                </dd>
              </div>
            </dl>
            {act && <p className="ui-muted">Billed charges fetched {formatDateTimeDisplay(act.fetchedAt)}.</p>}
          </div>
        </div>
      )}

      {/* Admin-only LR cancellation with typed confirmation */}
      {canOverrideHere && !record.cancelled && (
        <div className="border-t border-slate-100 pt-3">
          {!cancelOpen ? (
            <button type="button" onClick={() => setCancelOpen(true)} className="ui-btn-danger">
              <Ban className="h-3.5 w-3.5" /> Cancel this LR with Delhivery…
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
              <p className="font-medium text-rose-900">
                Cancelling is allowed only before delivery (Manifested, In Transit, Pending, Open, Scheduled). Type the LR number to confirm.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input className={`${input} ui-mono`} placeholder={lrn} value={cancelLrn} onChange={(e) => setCancelLrn(e.target.value.trim())} />
                <input className={input} placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCancelOpen(false)} className="ui-btn-secondary">
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={disabled || cancelLrn !== lrn || cancelReason.trim().length < 3 || busy === "cancel"}
                  onClick={() =>
                    run("cancel", () => delhiveryApi(`/orders/${order.id}/cancel`, postJson({ confirmLrn: cancelLrn, reason: cancelReason })), "LR cancelled").then(
                      () => setCancelOpen(false)
                    )
                  }
                  className="ui-btn bg-rose-600 text-white shadow-sm hover:bg-rose-700"
                >
                  Cancel LR
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
