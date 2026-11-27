"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Truck, XCircle } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type { DelhiveryEstimateResult, DelhiveryServerStatus } from "@/lib/delhivery-types";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { BoxDimensionGroup, mergeGroupsByDimensions } from "@/lib/dimension-helper";
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

  // One entry per box size; weight is sent separately as the consignment total.
  const boxes = mergeGroupsByDimensions((order.boxDimensionGroups || []) as BoxDimensionGroup[])
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
    <section className="ui-card">
      <div className="ui-card-header flex-wrap">
        <span className="ui-card-title">
          <span className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Truck className="w-3.5 h-3.5 text-violet-600" />
          </span>
          Delhivery One
          <span className="ui-chip">Live API quote</span>
        </span>
        {status && <span className="ui-chip">{status.env === "production" ? "Production" : "Staging"}</span>}
      </div>

      <div className="ui-card-body space-y-3 text-xs">
        <DelhiveryStatusNote status={status} />

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="ui-label">Destination pincode</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="e.g. 400093"
              className="ui-input w-32 ui-mono font-medium"
            />
          </div>
          <button type="button" disabled={!canQuote || loading} onClick={getQuote} className="ui-btn-secondary h-[34px]">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {shown ? "Refresh quote" : "Get live quote"}
          </button>
          {status?.configured && missing.length > 0 && (
            <span className="text-[11px] font-medium text-amber-700">Needs: {missing.join(", ")}</span>
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
              <Stat label="Estimate" value={<span className="text-base font-semibold tabular-nums">{rupees(shown.total)}</span>} />
            </div>
            {shown.lines.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {shown.lines.map((l) => (
                  <span key={l.label} className="ui-chip">
                    <span className="capitalize">{l.label}</span>: <b className="font-semibold tabular-nums text-slate-900">{rupees(l.amount)}</b>
                  </span>
                ))}
              </div>
            )}
            {"errors" in shown && shown.errors.length > 0 && (
              <ul className="text-[11px] text-amber-800 list-disc pl-4">
                {shown.errors.map((e) => (
                  <li key={e.call}>
                    {e.call}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {!result && saved.estimate && (
              <p className="ui-muted">Saved quote from {formatDateTimeDisplay(saved.estimate.at)} by {saved.estimate.by}.</p>
            )}
            <DelhiveryProvisionalNote matched={shown.matched} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        <span className="ui-muted">
          {booked ? `Booked: LR ${saved.lrn}` : inProgress ? "Booking in progress…" : "Creates the LR and box AWBs through the API."}
        </span>
        <button type="button" onClick={onBook} disabled={!status?.configured} className="ui-btn-primary">
          {booked || inProgress ? "View Delhivery shipment" : "Book with Delhivery"}
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ui-subtle px-3 py-2">
      <span className="ui-eyebrow block">{label}</span>
      <span className="mt-0.5 block text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
