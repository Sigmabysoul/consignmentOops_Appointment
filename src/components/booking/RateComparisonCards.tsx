"use client";

import React, { useState } from "react";
import { Check, ArrowRight, Radio, Clock, Rocket, AlertCircle } from "lucide-react";
import type { CarrierComparisonItem } from "@/modules/pricing/multi-carrier/carrier-comparison-engine";
import type { ShiprocketQuote } from "@/lib/shiprocket-types";
import { formatDateDisplay } from "@/lib/date-utils";
import { shiprocketLineBasis } from "@/lib/shiprocket-charge-basis";

export const formatInr = (n: number) =>
  `₹${Number(n.toFixed(2)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const money = (n: number) => Number(n.toFixed(2));

interface CardLine {
  label: string;
  amount: number;
  applied: boolean;
  basis?: string;
}

/** One carrier card, whether priced by our rate card or by a live API quote. */
interface RateCard {
  id: string;
  title: string;
  subtitle: string;
  tags: { label: string; tone: "violet" | "blue" | "indigo" | "solid" }[];
  /** null = no price to show (live quote not fetched yet, or the API had no rate). */
  total: number | null;
  subtotal: number | null;
  gst: number | null;
  gstPercent: number | null;
  lines: CardLine[];
  transit: string | null;
  zone: string | null;
  chargeableWeightKg: number | null;
  costPerKg: number | null;
  extra: string[];
  error: string | null;
  /** Placeholder for a live-API carrier whose rates are not fetched yet. */
  pendingLive: boolean;
  assigned: boolean;
  action: { label: string; title: string; onClick: () => void; disabled: boolean; busy: boolean; live: boolean };
}

interface RateComparisonCardsProps {
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
  /** Live quotes for an aggregator carrier (liveQuoteOnly), by carrier name. Each quote becomes a card. */
  liveQuotes?: Record<
    string,
    { quotes: ShiprocketQuote[]; onBook: () => void; bookDisabled: boolean; /** Explains ROV lines. */ invoiceValue?: number } | undefined
  >;
}

const TAG_STYLE: Record<RateCard["tags"][number]["tone"], string> = {
  violet: "bg-violet-50 text-violet-800 border border-violet-200",
  blue: "bg-blue-50 text-blue-800 border border-blue-200",
  indigo: "bg-indigo-50 text-indigo-800 border border-indigo-200",
  solid: "bg-violet-600 text-white",
};

/**
 * One order's freight quote as carrier cards: each card shows its total and transit up top, then
 * every charge line, GST and billed weight, and ends with its Assign (or Book) button. Carriers
 * priced by a live API (Shiprocket) get one card per serviceable carrier once rates are fetched.
 * The lowest total across all cards is highlighted.
 */
export function RateComparisonCards({
  carriers,
  assignedCourier,
  locked,
  actualWeightKg,
  assigningName,
  onAssign,
  carrierTags = {},
  liveQuotes = {},
}: RateComparisonCardsProps) {
  const [showBasis, setShowBasis] = useState(false);
  const isAssignedName = (name: string) => (assignedCourier || "").trim().toLowerCase() === name.toLowerCase();

  const cards: RateCard[] = carriers.flatMap((c): RateCard[] => {
    const assigned = isAssignedName(c.name);
    const tags: RateCard["tags"] = [];
    if (assigned) tags.push({ label: "Assigned", tone: "solid" });
    if (c.isOmLogistics) tags.push({ label: "Primary", tone: "violet" });
    if (carrierTags[c.name]) tags.push({ label: carrierTags[c.name], tone: "blue" });

    const assignAction = {
      label: assigned ? "Assigned" : "Assign",
      title: c.isOmLogistics ? "Assign OM Logistics and draft the WhatsApp pickup booking" : `Assign ${c.name} to this order`,
      onClick: () => onAssign(c),
      disabled: Boolean(c.error) || locked || assigningName === c.name,
      busy: assigningName === c.name,
      live: false,
    };

    if (c.liveQuoteOnly) {
      const live = liveQuotes[c.name];
      tags.push({ label: "Live API", tone: "indigo" });
      if (!live || live.quotes.length === 0) {
        return [
          {
            id: c.id,
            title: c.name,
            subtitle: c.serviceType,
            tags,
            total: null,
            subtotal: null,
            gst: null,
            gstPercent: null,
            lines: [],
            transit: null,
            zone: null,
            chargeableWeightKg: null,
            costPerKg: null,
            extra: [],
            error: c.error || null,
            pendingLive: true,
            assigned,
            action: assignAction,
          },
        ];
      }
      return live.quotes.map((q) => {
        const gst = q.gst ?? null;
        const subtotal = q.subtotal ?? (q.total !== null && gst !== null ? money(q.total - gst) : null);
        const kg = q.chargeableWeightKg ?? null;
        return {
          id: `${c.id}:${q.key}`,
          title: q.transporterName || q.deliveryPartner,
          subtitle: `via ${c.name}${q.modeName ? ` · ${q.modeName}` : ""}`,
          tags,
          total: q.total,
          subtotal,
          gst,
          gstPercent: subtotal && gst !== null && subtotal > 0 ? Math.round((gst / subtotal) * 100) : null,
          lines: q.lines.map((l) => ({
            label: l.label,
            amount: l.amount,
            applied: true,
            basis: shiprocketLineBasis(l.label, l.amount, q, live.invoiceValue),
          })),
          transit: q.tatDays !== null ? `${q.tatDays} ${q.tatDays === 1 ? "Day" : "Days"}` : null,
          zone: q.zone ?? null,
          chargeableWeightKg: kg,
          costPerKg: q.total !== null && kg ? money(q.total / kg) : null,
          extra: q.pickupDate ? [`Earliest pickup ${formatDateDisplay(q.pickupDate)}`] : [],
          error: q.total === null ? "No rate returned for this carrier" : null,
          pendingLive: false,
          assigned,
          action: {
            label: "Book",
            title: `Book this shipment through ${c.name}`,
            onClick: live.onBook,
            disabled: live.bookDisabled || locked,
            busy: false,
            live: true,
          },
        };
      });
    }

    return [
      {
        id: c.id,
        title: c.name,
        subtitle: c.serviceType,
        tags,
        total: c.error ? null : c.estimatedTotal,
        subtotal: c.error ? null : c.subtotal,
        gst: c.error ? null : c.gstAmount,
        gstPercent: c.gstPercent,
        lines: (c.chargeLines || []).map((l) => ({ label: l.label, amount: l.amount, applied: l.applied, basis: l.basis })),
        transit: c.estimatedTransitDays || null,
        zone: c.zone || null,
        chargeableWeightKg: c.error ? null : c.chargeableWeightKg,
        costPerKg: c.error ? null : c.costPerKg,
        extra: [],
        error: c.error || null,
        pendingLive: false,
        assigned,
        action: assignAction,
      },
    ];
  });

  const priced = cards.filter((k) => k.total !== null && !k.error);
  const lowest = locked || priced.length === 0 ? null : priced.reduce((a, b) => ((b.total as number) < (a.total as number) ? b : a));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
          Freight quotes · {cards.length} {cards.length === 1 ? "carrier" : "carriers"}
          {lowest && (
            <span className="ml-2 normal-case tracking-normal font-bold text-emerald-700">
              Lowest: {lowest.title} {formatInr(lowest.total as number)}
            </span>
          )}
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBasis}
            onChange={(e) => setShowBasis(e.target.checked)}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          Show how each charge is worked out
        </label>
      </div>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {cards.map((k) => {
          const best = lowest?.id === k.id;
          const visibleLines = k.lines.filter((l) => l.applied || showBasis);
          return (
            <div
              key={k.id}
              className={`flex flex-col rounded-xl border bg-white overflow-hidden ${
                best ? "border-emerald-400 ring-1 ring-emerald-400" : k.assigned ? "border-violet-400" : "border-slate-200"
              }`}
            >
              {/* Header: name, tags, total, transit */}
              <div className={`px-3 pt-3 pb-2.5 ${best ? "bg-emerald-50" : k.assigned ? "bg-violet-50/60" : "bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm truncate" title={k.title}>
                      {k.title}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-500 truncate">{k.subtitle}</div>
                  </div>
                  {best && (
                    <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                      Lowest
                    </span>
                  )}
                </div>
                {k.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {k.tags.map((t) => (
                      <span key={t.label} className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${TAG_STYLE[t.tone]}`}>
                        {t.tone === "indigo" && <Radio className="w-2.5 h-2.5" />}
                        {t.label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className={`font-black text-lg leading-none ${locked ? "text-slate-300" : best ? "text-emerald-900" : "text-slate-900"}`}>
                    {k.pendingLive ? (
                      <span className="text-xs font-bold text-indigo-700">Live rates not fetched</span>
                    ) : k.error ? (
                      <span className="text-xs font-bold text-rose-600">Rate unavailable</span>
                    ) : locked ? (
                      <span className="text-xs font-bold">Pick state</span>
                    ) : (
                      formatInr(k.total as number)
                    )}
                  </div>
                  {k.transit && !k.pendingLive && (
                    <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      {k.transit}
                    </span>
                  )}
                </div>
                {!k.pendingLive && !k.error && (k.zone || (k.costPerKg !== null && !locked)) && (
                  <div className="mt-1 text-[10px] text-slate-500 flex justify-between gap-2">
                    <span className="truncate">{k.zone ? `Zone ${k.zone}` : ""}</span>
                    {k.costPerKg !== null && !locked && <span className="whitespace-nowrap">{formatInr(k.costPerKg)}/kg</span>}
                  </div>
                )}
              </div>

              {/* Body: every charge, GST, billed weight */}
              <div className="flex-1 px-3 py-2 text-xs">
                {k.pendingLive ? (
                  <p className="flex items-start gap-1.5 text-slate-600 py-1">
                    <Rocket className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>Click <strong>Get live rates</strong> in the {k.title} panel below. Each serviceable carrier then appears here with its full charge breakdown.</span>
                  </p>
                ) : k.error ? (
                  <p className="flex items-start gap-1.5 text-rose-700 py-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{k.error}</span>
                  </p>
                ) : (
                  <>
                    <div className="divide-y divide-slate-100">
                      {visibleLines.map((l) => (
                        <div key={l.label} className="py-1" title={l.basis}>
                          <div className="flex justify-between gap-2">
                            <span className={l.applied ? "text-slate-700" : "text-slate-400"}>{l.label}</span>
                            <span className={`font-mono whitespace-nowrap ${!l.applied || locked ? "text-slate-300" : "text-slate-800 font-semibold"}`}>
                              {l.applied ? formatInr(l.amount) : "—"}
                            </span>
                          </div>
                          {showBasis && l.basis && (
                            <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{l.basis}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200 space-y-0.5">
                      {k.subtotal !== null && (
                        <div className="flex justify-between gap-2 text-slate-600">
                          <span>Subtotal</span>
                          <span className={`font-mono ${locked ? "text-slate-300" : ""}`}>{formatInr(k.subtotal)}</span>
                        </div>
                      )}
                      {k.gst !== null && (
                        <div className="flex justify-between gap-2 text-slate-600">
                          <span>GST{k.gstPercent !== null ? ` ${k.gstPercent}%` : ""}</span>
                          <span className={`font-mono ${locked ? "text-slate-300" : ""}`}>{formatInr(k.gst)}</span>
                        </div>
                      )}
                    </div>
                    {(k.chargeableWeightKg !== null || k.extra.length > 0) && (
                      <div className="mt-1.5 text-[10px] text-slate-500 space-y-0.5">
                        {k.chargeableWeightKg !== null && (
                          <div>
                            {k.chargeableWeightKg.toFixed(2)} kg billed
                            {k.chargeableWeightKg > actualWeightKg && actualWeightKg > 0 && (
                              <span className="text-amber-700"> · minimum (actual {actualWeightKg.toFixed(2)} kg)</span>
                            )}
                          </div>
                        )}
                        {k.extra.map((e) => (
                          <div key={e}>{e}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer: Assign / Book */}
              <div className="px-3 pb-3">
                <button
                  type="button"
                  disabled={k.action.disabled}
                  onClick={k.action.onClick}
                  title={k.action.title}
                  className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    k.assigned && !k.action.live
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : k.action.live
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "bg-violet-600 hover:bg-violet-700 text-white"
                  }`}
                >
                  {k.action.busy ? (
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : k.assigned && !k.action.live ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Assigned
                    </>
                  ) : (
                    <>
                      {k.action.label} <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
