"use client";

import React, { useState } from "react";
import { Check, ArrowRight, Radio } from "lucide-react";
import type { CarrierComparisonItem, CarrierChargeLine } from "@/modules/pricing/multi-carrier/carrier-comparison-engine";

const CHARGE_ORDER: CarrierChargeLine["key"][] = ["freight", "fuel", "cn", "oda", "appointment", "rov"];
const FALLBACK_LABELS: Record<CarrierChargeLine["key"], string> = {
  freight: "Freight",
  fuel: "Fuel surcharge",
  cn: "Docket / CN charge",
  oda: "ODA (out of delivery area)",
  appointment: "Appointment delivery",
  rov: "ROV (risk of value)",
};

export const formatInr = (n: number) =>
  `₹${Number(n.toFixed(2)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface RateComparisonSheetProps {
  carriers: CarrierComparisonItem[];
  /** courierPartner currently on the order. */
  assignedCourier?: string | null;
  /** Locks totals and Assign while the destination state is unknown. */
  locked: boolean;
  actualWeightKg: number;
  assigningName: string | null;
  onAssign: (carrier: CarrierComparisonItem) => void;
  /** Short tag shown under a carrier name (e.g. "Ekart only"), by carrier name. */
  carrierTags?: Record<string, string>;
}

/**
 * One order's freight quote as a sheet: charges are rows, carriers are columns. The lowest total
 * is highlighted; each column ends with its Assign button. Carriers priced only by their live API
 * (Delhivery, Shiprocket) say so here; their live quote panels sit under the sheet.
 */
export function RateComparisonSheet({
  carriers,
  assignedCourier,
  locked,
  actualWeightKg,
  assigningName,
  onAssign,
  carrierTags = {},
}: RateComparisonSheetProps) {
  const [showBasis, setShowBasis] = useState(false);

  const chargeKeys = CHARGE_ORDER.filter((k) => carriers.some((c) => c.chargeLines?.some((l) => l.key === k)));
  const labelFor = (key: CarrierChargeLine["key"]) =>
    carriers.flatMap((c) => c.chargeLines || []).find((l) => l.key === key)?.label || FALLBACK_LABELS[key];
  const isPriced = (c: CarrierComparisonItem) => !c.liveQuoteOnly && !c.error;
  const isAssigned = (c: CarrierComparisonItem) => (assignedCourier || "").trim().toLowerCase() === c.name.toLowerCase();

  const headCell = "px-3 py-2.5 text-left align-bottom border-b-2 border-slate-300 border-l border-slate-200 min-w-[150px]";
  const labelCell = "sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-slate-700 whitespace-nowrap border-r border-slate-300";
  const valueCell = "px-3 py-2 text-right font-mono whitespace-nowrap border-l border-slate-200";

  const messageCell = (c: CarrierComparisonItem) =>
    c.liveQuoteOnly || c.error ? (
      <span className="text-slate-300">—</span>
    ) : null;
  // (carriers priced by their live API show "Live quote ↓" once, in the Total row)

  return (
    <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-300">
        <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Freight quote sheet</span>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={showBasis} onChange={(e) => setShowBasis(e.target.checked)} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
          Show how each charge is worked out
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-900">
              <th className="sticky left-0 z-20 bg-slate-100 px-3 py-2.5 text-left align-bottom border-b-2 border-slate-300 border-r border-slate-300 min-w-[170px] font-bold">
                Charge
              </th>
              {carriers.map((c) => (
                <th
                  key={c.id}
                  className={`${headCell} ${isAssigned(c) ? "bg-violet-100" : ""}`}
                  title={c.notes?.length ? c.notes.join("\n") : undefined}
                >
                  <div className="font-extrabold text-slate-900">{c.name}</div>
                  <div className="text-[10px] font-semibold text-slate-500">{c.serviceType}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {isAssigned(c) && (
                      <span className="text-[9px] font-extrabold bg-violet-600 text-white px-1.5 py-0.5 rounded-full">Assigned</span>
                    )}
                    {c.isOmLogistics && (
                      <span className="text-[9px] font-extrabold bg-violet-50 text-violet-800 border border-violet-200 px-1.5 py-0.5 rounded-full">Primary</span>
                    )}
                    {carrierTags[c.name] && (
                      <span className="text-[9px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded-full">{carrierTags[c.name]}</span>
                    )}
                    {c.liveQuoteOnly && (
                      <span className="text-[9px] font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Radio className="w-2.5 h-2.5" /> Live API
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {chargeKeys.map((key) => (
              <tr key={key} className="hover:bg-slate-50/70">
                <td className={labelCell}>{labelFor(key)}</td>
                {carriers.map((c) => {
                  const line = c.chargeLines?.find((l) => l.key === key);
                  const msg = messageCell(c);
                  return (
                    <td key={c.id} className={`${valueCell} ${isAssigned(c) ? "bg-violet-50/40" : ""}`} title={line?.basis}>
                      {msg ?? (!line ? (
                        <span className="text-slate-300 font-sans">n/a</span>
                      ) : line.applied ? (
                        <span className={locked ? "text-slate-300" : "text-slate-800 font-semibold"}>{formatInr(line.amount)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      ))}
                      {showBasis && line && !msg && (
                        <div className="text-[10px] font-sans text-slate-400 whitespace-normal text-right max-w-[220px] ml-auto leading-tight mt-0.5">{line.basis}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          <tbody className="border-t-2 border-slate-300">
            <tr className="bg-slate-50/70">
              <td className={`${labelCell} bg-slate-50`}>Subtotal (before GST)</td>
              {carriers.map((c) => (
                <td key={c.id} className={valueCell}>
                  {messageCell(c) ?? <span className={locked ? "text-slate-300" : "text-slate-800 font-semibold"}>{formatInr(c.subtotal)}</span>}
                </td>
              ))}
            </tr>
            <tr className="bg-slate-50/70">
              <td className={`${labelCell} bg-slate-50`}>GST</td>
              {carriers.map((c) => (
                <td key={c.id} className={valueCell}>
                  {messageCell(c) ?? (
                    <span className={locked ? "text-slate-300" : "text-slate-700"}>
                      <span className="font-sans text-[10px] text-slate-400 mr-1">{c.gstPercent}%</span>
                      {formatInr(c.gstAmount)}
                    </span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className={`${labelCell} font-extrabold text-slate-900`}>Total payable</td>
              {carriers.map((c) => {
                const best = c.isLowestCost && isPriced(c) && !locked;
                return (
                  <td
                    key={c.id}
                    className={`${valueCell} text-sm ${best ? "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-400" : ""}`}
                    title={c.error || undefined}
                  >
                    {c.liveQuoteOnly ? (
                      <span className="text-indigo-700 font-sans text-xs font-semibold">Live quote ↓</span>
                    ) : c.error ? (
                      <span className="text-rose-600 font-sans text-xs font-bold">Rate unavailable</span>
                    ) : locked ? (
                      <span className="text-slate-300 font-sans text-xs">Pick state</span>
                    ) : (
                      <span className="font-black">
                        {formatInr(c.estimatedTotal)}
                        {best && <span className="block font-sans text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">Lowest</span>}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className={`${labelCell} text-slate-500`}>Cost per kg</td>
              {carriers.map((c) => (
                <td key={c.id} className={`${valueCell} text-slate-500`}>
                  {isPriced(c) && !locked ? formatInr(c.costPerKg) : <span className="text-slate-300">—</span>}
                </td>
              ))}
            </tr>
          </tbody>

          <tbody className="border-t border-slate-200 text-slate-500">
            <tr>
              <td className={`${labelCell} text-slate-500 font-medium`}>Billed weight</td>
              {carriers.map((c) => (
                <td key={c.id} className={valueCell}>
                  {isPriced(c) ? (
                    <>
                      {c.chargeableWeightKg.toFixed(2)} kg
                      {c.chargeableWeightKg > actualWeightKg && actualWeightKg > 0 && (
                        <span className="block font-sans text-[10px] text-amber-700">min. billed (actual {actualWeightKg.toFixed(2)})</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className={`${labelCell} text-slate-500 font-medium`}>Zone</td>
              {carriers.map((c) => (
                <td key={c.id} className={`${valueCell} font-sans`}>{c.zone || <span className="text-slate-300">—</span>}</td>
              ))}
            </tr>
            <tr>
              <td className={`${labelCell} text-slate-500 font-medium`}>Transit</td>
              {carriers.map((c) => (
                <td key={c.id} className={`${valueCell} font-sans`}>{c.estimatedTransitDays || "—"}</td>
              ))}
            </tr>
          </tbody>

          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-300">
              <td className={`${labelCell} bg-slate-50 text-slate-500 font-medium`}>Assign carrier</td>
              {carriers.map((c) => {
                const assigned = isAssigned(c);
                const busy = assigningName === c.name;
                return (
                  <td key={c.id} className="px-3 py-2.5 border-l border-slate-200 text-right">
                    <button
                      type="button"
                      disabled={Boolean(c.error) || locked || busy}
                      onClick={() => onAssign(c)}
                      title={c.isOmLogistics ? "Assign OM Logistics and draft the WhatsApp pickup booking" : `Assign ${c.name} to this order`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        assigned ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-violet-600 hover:bg-violet-700 text-white"
                      }`}
                    >
                      {busy ? (
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : assigned ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Assigned
                        </>
                      ) : (
                        <>
                          Assign <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {carriers.some((c) => c.error) && (
        <div className="px-3 py-2 border-t border-slate-200 bg-amber-50/60 space-y-0.5">
          {carriers
            .filter((c) => c.error)
            .map((c) => (
              <p key={c.id} className="text-[11px] text-amber-900">
                <span className="font-bold">{c.name}:</span> {c.error}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
