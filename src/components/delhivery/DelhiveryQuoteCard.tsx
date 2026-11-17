"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Truck, XCircle } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type { DelhiveryEstimateResult, DelhiveryServerStatus } from "@/lib/delhivery-types";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { delhiveryApi, extractPincode, orderAddress, postJson, readDelhiveryRecord, rupees } from "./delhivery-client";
import { DelhiveryProvisionalNote, DelhiveryStatusNote } from "./DelhiveryStatusNote";

interface Props {
  order: AppointmentOrder;
  status: DelhiveryServerStatus | null;
  weightKg: number;
  invoiceValue: number;
  rovCarrierRisk: boolean;
  onBook: () => void;
}

/** Live Delhivery quote (serviceability + TAT + freight estimate), requested on click only. */
export function DelhiveryQuoteCard({ order, status, weightKg, invoiceValue, rovCarrierRisk, onBook }: Props) {
  const saved = readDelhiveryRecord(order);
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<DelhiveryEstimateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPin(saved.estimate?.destinationPin || extractPincode(orderAddress(order)));
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const boxes = (order.boxDimensionGroups || [])
    .filter((g) => g.lengthCm && g.widthCm && g.heightCm && g.boxCount > 0)
    .map((g) => ({ lengthCm: g.lengthCm, widthCm: g.widthCm, heightCm: g.heightCm, boxCount: g.boxCount }));

  const canQuote = Boolean(status?.configured) && /^[1-9]\d{5}$/.test(pin) && weightKg > 0 && invoiceValue > 0 && boxes.length > 0;
  const missing = [
    !/^[1-9]\d{5}$/.test(pin) && "6-digit destination pincode",
    !(weightKg > 0) && "weight",
    !(invoiceValue > 0) && "invoice value",
    !boxes.length && "box dimensions",
  ].filter(Boolean) as string[];

  const getQuote = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await delhiveryApi<DelhiveryEstimateResult>(
        "/estimate",
        postJson({ orderId: order.id, destinationPin: pin, weightKg, invoiceAmount: invoiceValue, boxes, rovInsurance: rovCarrierRisk })
      );
      setResult(r);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const shown = result ?? (saved.estimate ? { ...saved.estimate, errors: [], provisional: true } : null);
  const booked = Boolean(saved.lrn && !saved.cancelled);
  const inProgress = saved.manifest?.state === "pending" || saved.manifest?.state === "submitting";

  return (
    <div className="mx-3.5 sm:mx-4 mb-3.5 p-3 rounded-xl border border-red-200 bg-red-50/40 space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-extrabold text-red-950 flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-red-600" />
          Live Delhivery API quote
        </span>
        {status && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {status.env === "production" ? "Production" : "Staging"}
          </span>
        )}
      </div>

      <DelhiveryStatusNote status={status} />

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">Destination pincode</label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="e.g. 400093"
            className="w-28 text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <button
          type="button"
          disabled={!canQuote || loading}
          onClick={getQuote}
          className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {shown ? "Refresh quote" : "Get live quote"}
        </button>
        {status?.configured && missing.length > 0 && (
          <span className="text-[10px] text-amber-700 font-semibold">Needs: {missing.join(", ")}</span>
        )}
      </div>

      {error && (
        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {shown && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="Serviceable"
              value={
                shown.serviceable === null ? (
                  "Unknown"
                ) : shown.serviceable ? (
                  <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Yes</span>
                ) : (
                  <span className="text-rose-700 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />No</span>
                )
              }
            />
            <Stat label="ODA" value={shown.oda === null ? "Unknown" : shown.oda ? "Yes" : "No"} />
            <Stat
              label="Transit"
              value={<span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" />{shown.tatDays === null ? "Unknown" : `${shown.tatDays} days`}</span>}
            />
            <Stat label="Estimate" value={<span className="text-sm font-black">{rupees(shown.total)}</span>} />
          </div>
          {shown.lines.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {shown.lines.map((l) => (
                <span key={l.label} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-slate-600">
                  <span className="capitalize">{l.label}</span>: <b className="text-slate-900">{rupees(l.amount)}</b>
                </span>
              ))}
            </div>
          )}
          {"errors" in shown && shown.errors.length > 0 && (
            <ul className="text-[10px] text-amber-800 list-disc pl-4">
              {shown.errors.map((e) => (
                <li key={e.call}>
                  {e.call}: {e.message}
                </li>
              ))}
            </ul>
          )}
          {!result && saved.estimate && (
            <p className="text-[10px] text-slate-500">Saved quote from {formatDateTimeDisplay(saved.estimate.at)} by {saved.estimate.by}.</p>
          )}
          <DelhiveryProvisionalNote matched={shown.matched} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-red-100">
        <span className="text-[10px] text-slate-500">
          {booked ? `Booked: LR ${saved.lrn}` : inProgress ? "Booking in progress…" : "Creates the LR and box AWBs through the API."}
        </span>
        <button
          type="button"
          onClick={onBook}
          disabled={!status?.configured}
          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {booked || inProgress ? "View Delhivery shipment" : "Book with Delhivery"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-2 rounded-lg bg-white border border-slate-200">
      <span className="text-[10px] text-slate-400 block font-semibold">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </div>
  );
}
