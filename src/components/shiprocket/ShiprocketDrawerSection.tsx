"use client";

import React, { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, RefreshCw, Rocket } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type { ShiprocketShipmentRecord } from "@/lib/shiprocket-types";
import { DateInput } from "@/components/ui/DateInput";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { postJson, readShiprocketRecord, shiprocketApi, useShiprocketStatus } from "./shiprocket-client";

/** Order drawer section: renders only when the order has (or had) a Shiprocket Cargo booking. */
export function ShiprocketDrawerSection({ order, onOrderUpdated }: { order: AppointmentOrder; onOrderUpdated: () => void }) {
  const status = useShiprocketStatus();
  const { showToast } = useToast();
  const [rec, setRec] = useState<ShiprocketShipmentRecord>(() => readShiprocketRecord(order));
  const [busy, setBusy] = useState<string | null>(null);
  const [apptDate, setApptDate] = useState("");
  const [apptStart, setApptStart] = useState("10:00");
  const [apptEnd, setApptEnd] = useState("13:00");
  useEffect(() => setRec(readShiprocketRecord(order)), [order]);

  if (!rec.order) return null;
  const booked = rec.shipment?.state === "done";

  const call = async (key: string, fn: () => Promise<{ shiprocket: ShiprocketShipmentRecord }>, ok: string) => {
    setBusy(key);
    try {
      const r = await fn();
      setRec(r.shiprocket);
      showToast(ok, "success");
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ui-card text-xs">
      <div className="ui-card-header">
        <h3 className="ui-card-title">
          <Rocket className="h-4 w-4 text-slate-400" />
          <span>Shiprocket Cargo shipment</span>
        </h3>
        {booked ? (
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={Boolean(busy) || !status?.configured}
              onClick={() => call("details", () => shiprocketApi(`/orders/${order.id}/shipment`), "Shipment details refreshed")}
              className="ui-btn-secondary ui-btn-sm">
              <RefreshCw className={`h-3 w-3 ${busy === "details" ? "animate-spin" : ""}`} /> Details
            </button>
            <button type="button" disabled={Boolean(busy) || !rec.waybill || !status?.configured}
              onClick={() => call("track", () => shiprocketApi(`/orders/${order.id}/track`, { method: "POST" }), "Tracking refreshed")}
              className="ui-btn-secondary ui-btn-sm">
              <RefreshCw className={`h-3 w-3 ${busy === "track" ? "animate-spin" : ""}`} /> Track
            </button>
          </div>
        ) : (
          <span className="ui-chip">Carrier API</span>
        )}
      </div>

      <div className="ui-card-body space-y-4">
        {!booked ? (
          <p className="text-slate-600">
            Shiprocket order {rec.order.orderId ?? "(not created)"} —{" "}
            {rec.shipment?.state === "unknown_outcome"
              ? "the last booking attempt has an unknown result; check the Shiprocket Cargo panel."
              : rec.shipment?.state === "failed"
              ? `booking failed${rec.shipment.message ? `: ${rec.shipment.message}` : "."}`
              : "no carrier booked yet. Continue from Compare Rates on the Booking Desk."}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <div className="min-w-0">
                <dt className="ui-label">Carrier</dt>
                <dd className="truncate text-sm font-medium text-slate-900">{rec.deliveryPartner || rec.shipment?.carrier?.deliveryPartnerName}</dd>
              </div>
              <div className="min-w-0">
                <dt className="ui-label">Waybill</dt>
                <dd className="ui-mono truncate text-sm font-medium text-slate-900">{rec.waybill || "pending"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="ui-label">LR / docket</dt>
                <dd className="ui-mono truncate text-sm font-medium text-slate-900">{rec.lrn || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="ui-label">Pickup</dt>
                <dd className="text-sm font-medium text-slate-900">{rec.scheduledPickupDate ? formatDateDisplay(rec.scheduledPickupDate) : "—"}</dd>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <dt className="ui-label">Status</dt>
                <dd className="text-slate-700">
                  <span className="text-sm font-semibold text-slate-900">{rec.tracking?.status || "not checked"}</span>
                  {rec.tracking?.location ? ` · ${rec.tracking.location}` : ""}
                  {rec.tracking?.edd ? ` · EDD ${formatDateDisplay(rec.tracking.edd)}` : ""}
                  {rec.tracking?.checkedAt ? <span className="text-slate-400"> (checked {formatDateTimeDisplay(rec.tracking.checkedAt)})</span> : null}
                </dd>
              </div>
            </dl>

            {(rec.labelUrl || rec.podUrl) && (
              <div className="flex flex-wrap gap-2">
                {rec.labelUrl && (
                  <a href={rec.labelUrl} target="_blank" rel="noopener noreferrer" className="ui-btn-secondary">
                    <ExternalLink className="h-3 w-3" /> Labels
                  </a>
                )}
                {rec.podUrl && (
                  <a href={rec.podUrl} target="_blank" rel="noopener noreferrer" className="ui-btn-secondary">
                    <ExternalLink className="h-3 w-3" /> Carrier POD
                  </a>
                )}
              </div>
            )}

            {(rec.statusHistory?.length ?? 0) > 0 && (
              <details className="group">
                <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">
                  Tracking history ({rec.statusHistory!.length})
                </summary>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border-l border-slate-200 pl-3">
                  {[...rec.statusHistory!].reverse().map((h, i) => (
                    <li key={i} className="text-[11px] text-slate-600">
                      <span className="text-slate-400">{h.timestamp ? formatDateTimeDisplay(h.timestamp) : "—"}</span> ·{" "}
                      <span className="font-medium text-slate-800">{h.status}</span>
                      {h.location ? ` · ${h.location}` : ""}
                      {h.remarks ? ` — ${h.remarks}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="space-y-2.5 rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Delivery appointment
              </div>
              {rec.appointment && (
                <div className="text-[11px] text-emerald-700">
                  Sent: {formatDateDisplay(rec.appointment.start.slice(0, 10))}, {rec.appointment.start.slice(11, 16)}–{rec.appointment.end.slice(11, 16)} by {rec.appointment.bookedBy}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="ui-label">Date</label>
                  <DateInput value={apptDate} onChange={(e) => setApptDate(e.target.value)} className="ui-input" />
                </div>
                <div>
                  <label className="ui-label">From</label>
                  <input type="time" value={apptStart} onChange={(e) => setApptStart(e.target.value)} aria-label="From" className="ui-input" />
                </div>
                <div>
                  <label className="ui-label">To</label>
                  <input type="time" value={apptEnd} onChange={(e) => setApptEnd(e.target.value)} aria-label="To" className="ui-input" />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" disabled={Boolean(busy) || !apptDate || !status?.configured}
                  onClick={() =>
                    call("appt", () => shiprocketApi(`/orders/${order.id}/appointment`, postJson({ start: `${apptDate}T${apptStart}`, end: `${apptDate}T${apptEnd}` })), "Appointment sent to Shiprocket")
                  }
                  className="ui-btn-primary">
                  {rec.appointment ? "Update appointment" : "Send appointment"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
