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
    <div className="space-y-3 pt-3 border-t border-slate-200 text-xs">
      <div className="font-bold text-slate-900 flex items-center gap-1.5">
        <Rocket className="w-3.5 h-3.5 text-indigo-600" /> Shiprocket Cargo shipment
      </div>

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
          <div className="grid grid-cols-2 gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div>Carrier: <b>{rec.deliveryPartner || rec.shipment?.carrier?.deliveryPartnerName}</b></div>
            <div>Waybill: <span className="font-mono font-bold">{rec.waybill || "pending"}</span></div>
            <div>LR / docket: <span className="font-mono">{rec.lrn || "—"}</span></div>
            <div>Pickup: {rec.scheduledPickupDate ? formatDateDisplay(rec.scheduledPickupDate) : "—"}</div>
            <div className="col-span-2">
              Status: <b>{rec.tracking?.status || "not checked"}</b>
              {rec.tracking?.location ? ` · ${rec.tracking.location}` : ""}
              {rec.tracking?.edd ? ` · EDD ${formatDateDisplay(rec.tracking.edd)}` : ""}
              {rec.tracking?.checkedAt ? <span className="text-slate-400"> (checked {formatDateTimeDisplay(rec.tracking.checkedAt)})</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {rec.labelUrl && (
              <a href={rec.labelUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Labels
              </a>
            )}
            {rec.podUrl && (
              <a href={rec.podUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Carrier POD
              </a>
            )}
            <button type="button" disabled={Boolean(busy) || !status?.configured}
              onClick={() => call("details", () => shiprocketApi(`/orders/${order.id}/shipment`), "Shipment details refreshed")}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer">
              <RefreshCw className={`w-3 h-3 ${busy === "details" ? "animate-spin" : ""}`} /> Details
            </button>
            <button type="button" disabled={Boolean(busy) || !rec.waybill || !status?.configured}
              onClick={() => call("track", () => shiprocketApi(`/orders/${order.id}/track`, { method: "POST" }), "Tracking refreshed")}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer">
              <RefreshCw className={`w-3 h-3 ${busy === "track" ? "animate-spin" : ""}`} /> Track
            </button>
          </div>

          {(rec.statusHistory?.length ?? 0) > 0 && (
            <details>
              <summary className="font-bold text-slate-600 cursor-pointer select-none">Tracking history ({rec.statusHistory!.length})</summary>
              <ul className="mt-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                {[...rec.statusHistory!].reverse().map((h, i) => (
                  <li key={i} className="text-[11px] text-slate-600">
                    <span className="text-slate-400">{h.timestamp ? formatDateTimeDisplay(h.timestamp) : "—"}</span> · <b>{h.status}</b>
                    {h.location ? ` · ${h.location}` : ""}
                    {h.remarks ? ` — ${h.remarks}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="p-2.5 rounded-xl border border-slate-200 space-y-2">
            <div className="font-bold text-slate-800 flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Delivery appointment</div>
            {rec.appointment && (
              <div className="text-[11px] text-emerald-800">
                Sent: {formatDateDisplay(rec.appointment.start.slice(0, 10))}, {rec.appointment.start.slice(11, 16)}–{rec.appointment.end.slice(11, 16)} by {rec.appointment.bookedBy}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <DateInput value={apptDate} onChange={(e) => setApptDate(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5" />
              <input type="time" value={apptStart} onChange={(e) => setApptStart(e.target.value)} aria-label="From"
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5" />
              <input type="time" value={apptEnd} onChange={(e) => setApptEnd(e.target.value)} aria-label="To"
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5" />
            </div>
            <button type="button" disabled={Boolean(busy) || !apptDate || !status?.configured}
              onClick={() =>
                call("appt", () => shiprocketApi(`/orders/${order.id}/appointment`, postJson({ start: `${apptDate}T${apptStart}`, end: `${apptDate}T${apptEnd}` })), "Appointment sent to Shiprocket")
              }
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold disabled:opacity-40 cursor-pointer">
              {rec.appointment ? "Update appointment" : "Send appointment"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
