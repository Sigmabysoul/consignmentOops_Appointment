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

  const box = "p-3 rounded-xl border border-slate-200 bg-white space-y-2";
  const h = "font-extrabold text-[11px] uppercase tracking-wide text-slate-900 flex items-center gap-1.5";
  const input = "w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-red-400";
  const btn = "px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

  return (
    <div className="space-y-3 text-xs">
      <DelhiveryStatusNote status={status} />

      {/* LR summary */}
      <div className="p-3 rounded-xl border border-red-200 bg-red-50/50 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-red-600" />
            <span className="text-slate-500 font-semibold">Delhivery LR</span>
            <span className="font-mono font-black text-sm text-slate-900">{lrn}</span>
            <button type="button" onClick={copyLrn} className="p-1 rounded hover:bg-white cursor-pointer" title="Copy LR">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {record.cancelled && <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">Cancelled</span>}
          </div>
          <div className="text-[11px] text-slate-500">
            {record.awbs?.length ?? 0} AWB(s) · booked {formatDateTimeDisplay(record.bookedAt)} by {record.manifest?.submittedBy || "—"}
            {record.env && ` · ${record.env === "production" ? "Production" : "Staging"}`}
          </div>
        </div>
        {!!record.awbs?.length && (
          <button type="button" onClick={() => setShowAwbs(!showAwbs)} className="text-red-700 font-bold cursor-pointer">
            {showAwbs ? "Hide AWBs" : "Show AWBs"}
          </button>
        )}
        {showAwbs && (
          <div className="w-full flex flex-wrap gap-1.5">
            {record.awbs!.map((a) => (
              <span key={a} className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-[11px]">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Tracking */}
          <div className={box}>
            <div className="flex items-center justify-between">
              <span className={h}>
                <RefreshCw className="w-3.5 h-3.5 text-red-600" /> Tracking
              </span>
              <button
                type="button"
                disabled={disabled || busy === "track"}
                onClick={() => run("track", () => delhiveryApi(`/orders/${order.id}/track`, { method: "POST" }))}
                className={`${btn} bg-slate-100 hover:bg-slate-200`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy === "track" ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            {/* Read-only status badge (never a button). */}
            <div className="font-black text-sm text-slate-900">{statusLabel(record.tracking?.status)}</div>
            {record.tracking && (
              <div className="text-[11px] text-slate-500">
                {record.tracking.location && <>{record.tracking.location} · </>}checked {formatDateTimeDisplay(record.tracking.checkedAt)}
              </div>
            )}
            {!!record.statusHistory?.length && (
              <ol className="border-l-2 border-slate-200 pl-3 space-y-1 max-h-32 overflow-y-auto">
                {[...record.statusHistory].reverse().map((s, i) => (
                  <li key={i} className="text-[11px]">
                    <b>{statusLabel(s.status)}</b>
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
              <CalendarCheck className="w-3.5 h-3.5 text-red-600" /> Delivery appointment
            </span>
            {record.appointment ? (
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">
                  {dmyDisplay(record.appointment.date)} · {record.appointment.slot}
                </div>
                <div className="text-[11px] text-slate-500">
                  PO {record.appointment.poNumbers.join(", ")}
                  {record.appointment.appointmentId && <> · Appt ID {record.appointment.appointmentId}</>} · booked by {record.appointment.bookedBy}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold mb-1">Date</label>
                  <DateInput className={input} value={apptDate} onChange={(e) => setApptDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">Slot</label>
                  <select className={input} value={apptSlot} onChange={(e) => setApptSlot(e.target.value)}>
                    {DELHIVERY_SLOT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">PO number(s)</label>
                  <input className={input} value={apptPo} onChange={(e) => setApptPo(e.target.value)} placeholder="comma separated, max 5" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">PO expiry</label>
                  <DateInput className={input} value={poExpiry} onChange={(e) => setPoExpiry(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold mb-1">Appointment ID (from the platform)</label>
                  <input className={input} value={apptId} onChange={(e) => setApptId(e.target.value)} />
                </div>
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
                  className={`${btn} col-span-2 justify-center bg-red-600 hover:bg-red-700 text-white`}
                >
                  Book appointment
                </button>
              </div>
            )}
          </div>

          {/* Pickup */}
          <div className={box}>
            <span className={h}>
              <Truck className="w-3.5 h-3.5 text-red-600" /> Pickup request
            </span>
            {pickupActive ? (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold">
                    {formatDateDisplay(record.pickup!.date)} from {record.pickup!.startTime.slice(0, 5)} · {record.pickup!.expectedPackageCount} box(es)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {record.pickup!.id ? `Pickup ID ${record.pickup!.id}` : "Pickup ID not recognised"} · by {record.pickup!.requestedBy}
                  </div>
                  {record.pickup!.state === "submitting" && (
                    <div className="text-[11px] font-semibold text-amber-700">Being sent to Delhivery…</div>
                  )}
                  {pickupUnknown && (
                    <div className="text-[11px] font-semibold text-amber-700">
                      The request timed out and may not have reached Delhivery. Check the Delhivery One panel; an admin can retry.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={disabled || busy === "pickup-cancel" || !record.pickup!.id}
                  onClick={() => run("pickup-cancel", () => delhiveryApi(`/orders/${order.id}/pickup`, { method: "DELETE" }), "Pickup request cancelled")}
                  className={`${btn} bg-slate-100 hover:bg-slate-200 text-rose-700`}
                >
                  Cancel pickup
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-bold mb-1">Date</label>
                  <DateInput className={input} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">From</label>
                  <input type="time" className={input} value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">Boxes</label>
                  <input className={input} inputMode="numeric" value={pickupCount} onChange={(e) => setPickupCount(e.target.value.replace(/\D/g, ""))} />
                </div>
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
                  className={`${btn} col-span-3 justify-center bg-red-600 hover:bg-red-700 text-white`}
                >
                  {pickupUnknown ? "I've checked: request pickup again" : "Request pickup"}
                </button>
                <p className="col-span-3 text-[10px] text-slate-500">Delhivery needs one day's notice for pickups.</p>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className={box}>
            <span className={h}>
              <FileText className="w-3.5 h-3.5 text-red-600" /> Documents
            </span>
            <div className="flex items-center gap-2">
              <select className={`${input} w-auto`} value={labelSize} onChange={(e) => setLabelSize(e.target.value as LabelSize)}>
                {(Object.keys(LABEL_PAGE) as LabelSize[]).map((s) => (
                  <option key={s} value={s}>
                    {LABEL_PAGE[s].name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={disabled || busy === "labels"} onClick={printLabels} className={`${btn} bg-slate-900 hover:bg-slate-800 text-white`}>
                <Printer className="w-3.5 h-3.5" /> Print box labels
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || busy === "lr"}
                onClick={() => run("lr", () => openDelhiveryDocument(`/orders/${order.id}/lr-copy`))}
                className={`${btn} bg-slate-100 hover:bg-slate-200`}
              >
                LR copy (PDF)
              </button>
              <button
                type="button"
                disabled={disabled || busy === "pod"}
                onClick={() => run("pod", () => openDelhiveryDocument(`/orders/${order.id}/pod`))}
                className={`${btn} bg-slate-100 hover:bg-slate-200`}
              >
                Proof of delivery
              </button>
            </div>
          </div>

          {/* Freight: estimate vs actual */}
          <div className={`${box} md:col-span-2`}>
            <div className="flex items-center justify-between">
              <span className={h}>
                <Wallet className="w-3.5 h-3.5 text-red-600" /> Freight: estimated vs billed
              </span>
              <button
                type="button"
                disabled={disabled || busy === "freight"}
                onClick={() => run("freight", () => delhiveryApi(`/orders/${order.id}/freight-breakup`, { method: "POST" }))}
                className={`${btn} bg-slate-100 hover:bg-slate-200`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy === "freight" ? "animate-spin" : ""}`} /> Fetch billed charges
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">Estimate</span>
                <b>{rupees(est?.total)}</b>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">Billed</span>
                <b>{rupees(act?.total)}</b>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">Difference</span>
                <b className={est?.total != null && act?.total != null && act.total > est.total ? "text-rose-700" : "text-emerald-700"}>
                  {est?.total != null && act?.total != null ? rupees(Number((act.total - est.total).toFixed(2))) : "—"}
                </b>
              </div>
            </div>
            {act && <p className="text-[10px] text-slate-500">Billed charges fetched {formatDateTimeDisplay(act.fetchedAt)}.</p>}
          </div>
        </div>
      )}

      {/* Admin-only LR cancellation with typed confirmation */}
      {canOverrideHere && !record.cancelled && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2">
          {!cancelOpen ? (
            <button type="button" onClick={() => setCancelOpen(true)} className={`${btn} text-rose-700 hover:bg-rose-100`}>
              <Ban className="w-3.5 h-3.5" /> Cancel this LR with Delhivery…
            </button>
          ) : (
            <>
              <p className="text-rose-900 font-semibold">
                Cancelling is allowed only before delivery (Manifested, In Transit, Pending, Open, Scheduled). Type the LR number to confirm.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={`${input} font-mono`} placeholder={lrn} value={cancelLrn} onChange={(e) => setCancelLrn(e.target.value.trim())} />
                <input className={input} placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={disabled || cancelLrn !== lrn || cancelReason.trim().length < 3 || busy === "cancel"}
                  onClick={() =>
                    run("cancel", () => delhiveryApi(`/orders/${order.id}/cancel`, postJson({ confirmLrn: cancelLrn, reason: cancelReason })), "LR cancelled").then(
                      () => setCancelOpen(false)
                    )
                  }
                  className={`${btn} bg-rose-600 hover:bg-rose-700 text-white`}
                >
                  Cancel LR
                </button>
                <button type="button" onClick={() => setCancelOpen(false)} className={`${btn} bg-white border border-slate-200`}>
                  Keep it
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
