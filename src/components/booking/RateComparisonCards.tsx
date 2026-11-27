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
  violet: "bg-violet-50 text-violet-700 border border-violet-200",
  blue: "bg-slate-50 text-slate-600 border border-slate-200",
  indigo: "bg-slate-50 text-slate-600 border border-slate-200",
  solid: "bg-violet-600 text-white border border-violet-600",
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-slate-900">Freight quotes</h4>
          <span className="ui-count">{cards.length}</span>
          <span className="ui-muted">{cards.length === 1 ? "carrier" : "carriers"}</span>
          {lowest && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              Lowest: <span className="font-semibold">{lowest.title}</span>
              <span className="tabular-nums font-semibold">{formatInr(lowest.total as number)}</span>
            </span>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBasis}
            onChange={(e) => setShowBasis(e.target.checked)}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          Show how each charge is worked out
        </label>
      </div>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        {cards.map((k) => {
          const best = lowest?.id === k.id;
          const visibleLines = k.lines.filter((l) => l.applied || showBasis);
          return (
            <div
              key={k.id}
              className={`flex flex-col rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
                best
                  ? "border-emerald-300 ring-1 ring-emerald-200"
                  : k.assigned
                  ? "border-violet-300 ring-1 ring-violet-100"
                  : "border-slate-200"
              }`}
            >
              {/* Header: name, service, tags, total, transit */}
              <div className="px-4 pt-3.5 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate" title={k.title}>
                      {k.title}
                    </div>
                    <div className="ui-muted truncate">{k.subtitle}</div>
                  </div>
                  {best && (
                    <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Lowest
                    </span>
                  )}
                </div>
                {k.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {k.tags.map((t) => (
                      <span key={t.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_STYLE[t.tone]}`}>
                        {t.tone === "indigo" && <Radio className="w-2.5 h-2.5" />}
                        {t.tone === "solid" && <Check className="w-2.5 h-2.5" />}
                        {t.label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className={`text-2xl font-semibold leading-none tracking-tight tabular-nums ${locked ? "text-slate-300" : best ? "text-emerald-700" : "text-slate-900"}`}>
                    {k.pendingLive ? (
                      <span className="text-sm font-medium text-slate-500">Awaiting live rates</span>
                    ) : k.error ? (
                      <span className="text-sm font-medium text-rose-600">Rate unavailable</span>
                    ) : locked ? (
                      <span className="text-sm font-medium">Pick state</span>
                    ) : (
                      formatInr(k.total as number)
                    )}
                  </div>
                  {k.transit && !k.pendingLive && (
                    <span className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {k.transit}
                    </span>
                  )}
                </div>
                {!k.pendingLive && !k.error && (k.zone || (k.costPerKg !== null && !locked)) && (
                  <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-slate-500">
                    <span className="truncate">{k.zone ? `Zone ${k.zone}` : ""}</span>
                    {k.costPerKg !== null && !locked && <span className="whitespace-nowrap tabular-nums">{formatInr(k.costPerKg)}/kg</span>}
                  </div>
                )}
              </div>

              {/* Body: every charge, GST, billed weight */}
              <div className="flex-1 border-t border-slate-100 px-4 py-2.5 text-xs">
                {k.pendingLive ? (
                  <p className="flex items-start gap-1.5 text-slate-600 py-1">
                    <Rocket className="w-3.5 h-3.5 text-violet-600 shrink-0 mt-0.5" />
                    <span>Live rates load automatically from the {k.title} panel below. Each carrier on your account then appears here with its full charge breakdown.</span>
                  </p>
                ) : k.error ? (
                  <p className="flex items-start gap-1.5 text-rose-700 py-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{k.error}</span>
                  </p>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      {visibleLines.map((l) => (
                        <div key={l.label} className="py-0.5" title={l.basis}>
                          <div className="flex justify-between gap-2">
                            <span className={l.applied ? "text-slate-600" : "text-slate-400"}>{l.label}</span>
                            <span className={`tabular-nums whitespace-nowrap ${!l.applied || locked ? "text-slate-300" : "text-slate-800 font-medium"}`}>
                              {l.applied ? formatInr(l.amount) : "—"}
                            </span>
                          </div>
                          {showBasis && l.basis && (
                            <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{l.basis}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-dashed border-slate-200 space-y-0.5">
                      {k.subtotal !== null && (
                        <div className="flex justify-between gap-2 text-slate-600">
                          <span>Subtotal</span>
                          <span className={`tabular-nums ${locked ? "text-slate-300" : ""}`}>{formatInr(k.subtotal)}</span>
                        </div>
                      )}
                      {k.gst !== null && (
                        <div className="flex justify-between gap-2 text-slate-600">
                          <span>GST{k.gstPercent !== null ? ` ${k.gstPercent}%` : ""}</span>
                          <span className={`tabular-nums ${locked ? "text-slate-300" : ""}`}>{formatInr(k.gst)}</span>
                        </div>
                      )}
                    </div>
                    {(k.chargeableWeightKg !== null || k.extra.length > 0) && (
                      <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
                        {k.chargeableWeightKg !== null && (
                          <div>
                            <span className="tabular-nums">{k.chargeableWeightKg.toFixed(2)} kg</span> billed
                            {k.chargeableWeightKg > actualWeightKg && actualWeightKg > 0 && (
                              <span className="text-amber-700"> · above actual {actualWeightKg.toFixed(2)} kg (minimum or volumetric)</span>
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
              <div className="px-4 pb-4 pt-1">
                <button
                  type="button"
                  disabled={k.action.disabled}
                  onClick={k.action.onClick}
                  title={k.action.title}
                  className={`w-full ${
                    k.assigned && !k.action.live
                      ? "ui-btn-secondary border-violet-200 text-violet-700 hover:text-violet-800"
                      : best
                      ? "ui-btn-primary"
                      : "ui-btn-secondary"
                  }`}
                >
                  {k.action.busy ? (
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
