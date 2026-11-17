"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock, RefreshCw, Rocket } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type { ShiprocketQuote, ShiprocketServerStatus } from "@/lib/shiprocket-types";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";
import {
  defaultPackages,
  extractPincode,
  orderAddressText,
  packagesReady,
  postJson,
  readShiprocketRecord,
  rupees,
  shiprocketApi,
  splitStateCity,
} from "./shiprocket-client";

interface Props {
  order: AppointmentOrder;
  status: ShiprocketServerStatus | null;
  weightKg: number;
  invoiceValue: number;
  /** OM zone selection from the comparison form, e.g. "West Bengal (Kolkata)". */
  stateLabel: string;
  onBook: () => void;
}

/** Live Shiprocket Cargo rates (every serviceable surface carrier), requested on click only. */
export function ShiprocketQuoteCard({ order, status, weightKg, invoiceValue, stateLabel, onBook }: Props) {
  const saved = readShiprocketRecord(order);
  const [pin, setPin] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [quotes, setQuotes] = useState<ShiprocketQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    const sc = splitStateCity(stateLabel);
    const dest = saved.order?.destination;
    setPin(dest?.pincode || saved.quote?.destinationPin || extractPincode(orderAddressText(order)));
    setCity(dest?.city || sc.city);
    setState(dest?.state || sc.state);
    setQuotes(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, stateLabel]);

  const packages = useMemo(() => defaultPackages(order, weightKg), [order, weightKg]);
  const missing = [
    !/^[1-9]\d{5}$/.test(pin) && "6-digit pincode",
    !city.trim() && "city",
    !state.trim() && "state",
    !(invoiceValue > 0) && "invoice value",
    !packagesReady(packages) && "box dimensions & weight",
  ].filter(Boolean) as string[];

  const getRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await shiprocketApi<{ quotes: ShiprocketQuote[] }>(
        "/quote",
        postJson({ orderId: order.id, to: { pincode: pin, city, state }, packages, invoiceValue })
      );
      setQuotes(r.quotes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const shown = quotes ?? saved.quote?.quotes ?? null;
  const booked = saved.shipment?.state === "done";

  return (
    <div className="mx-3.5 sm:mx-4 mb-3.5 p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-extrabold text-indigo-950 flex items-center gap-1.5">
          <Rocket className="w-3.5 h-3.5 text-indigo-600" />
          Live Shiprocket Cargo rates
        </span>
        {!status?.configured && status && <span className="text-[10px] font-bold text-amber-700">API credentials not set yet</span>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-0.5">
          <span className="text-[10px] font-bold text-slate-600">Destination pincode</span>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] font-bold text-slate-600">City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] font-bold text-slate-600">State</span>
          <input value={state} onChange={(e) => setState(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={getRates} disabled={loading || missing.length > 0 || !status?.configured}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {shown ? "Refresh rates" : "Get live rates"}
        </button>
        <button type="button" onClick={onBook} disabled={!status?.configured}
          className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-800 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          {booked ? "View Shiprocket booking" : saved.order?.state === "done" ? "Continue booking" : "Book with Shiprocket"}
        </button>
        {missing.length > 0 && <span className="text-[11px] text-slate-500">Needs: {missing.join(", ")}</span>}
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {shown && (
        shown.length === 0 ? (
          <div className="text-slate-600">No surface carrier is serviceable for this lane.</div>
        ) : (
          <div className="space-y-1">
            {!quotes && saved.quote && (
              <div className="text-[10px] text-slate-500">Saved quote from {formatDateTimeDisplay(saved.quote.at)} by {saved.quote.by}</div>
            )}
            {shown.map((q, i) => (
              <div key={q.key} className="rounded-lg border border-slate-200 bg-white">
                <button type="button" onClick={() => setOpenKey(openKey === q.key ? null : q.key)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left cursor-pointer">
                  <span className="font-bold text-slate-800 truncate">
                    {q.transporterName || q.deliveryPartner}
                    {i === 0 && q.total !== null && <span className="ml-1.5 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 rounded-full">Cheapest</span>}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    {q.tatDays !== null && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{q.tatDays} days</span>
                    )}
                    <span className="font-black text-slate-900">{q.total !== null ? rupees(q.total) : "No rate"}</span>
                  </span>
                </button>
                {openKey === q.key && (
                  <div className="px-2.5 pb-2 text-[11px] text-slate-600 space-y-0.5 border-t border-slate-100 pt-1.5">
                    {q.lines.map((l) => (
                      <div key={l.label} className="flex justify-between"><span>{l.label}</span><span>{rupees(l.amount)}</span></div>
                    ))}
                    {q.gst !== null && <div className="flex justify-between"><span>GST</span><span>{rupees(q.gst)}</span></div>}
                    {q.chargeableWeightKg !== null && <div>Chargeable weight: {q.chargeableWeightKg.toFixed(2)} kg</div>}
                    {q.pickupDate && <div>Earliest pickup: {formatDateDisplay(q.pickupDate)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
