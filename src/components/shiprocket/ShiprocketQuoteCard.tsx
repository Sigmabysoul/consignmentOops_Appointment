"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw, Rocket } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type { ShiprocketQuote, ShiprocketServerStatus } from "@/lib/shiprocket-types";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { detectCityFromOrder } from "@/lib/order-logistics-autofill";
import {
  defaultPackages,
  extractPincode,
  orderAddressText,
  packagesReady,
  postJson,
  readShiprocketRecord,
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
  /** Receives the quotes on show (fresh or saved), so the rate cards above can list each carrier. */
  onQuotesChange?: (quotes: ShiprocketQuote[] | null) => void;
}

/**
 * Live Shiprocket Cargo rates (every serviceable surface carrier). Fetched automatically when the
 * card opens and again whenever the pincode, city, state, weight or invoice value change (debounced);
 * "Refresh rates" asks again on demand.
 */
export function ShiprocketQuoteCard({ order, status, weightKg, invoiceValue, stateLabel, onBook, onQuotesChange }: Props) {
  const saved = readShiprocketRecord(order);
  const [pin, setPin] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [quotes, setQuotes] = useState<ShiprocketQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sc = splitStateCity(stateLabel);
    const dest = saved.order?.destination;
    setPin(dest?.pincode || saved.quote?.destinationPin || extractPincode(orderAddressText(order)));
    setCity(dest?.city || detectCityFromOrder(order) || sc.city);
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

  // Auto-fetch: once per distinct request, 600 ms after the inputs settle.
  const requestKey = JSON.stringify([order.id, pin, city.trim(), state.trim(), invoiceValue, packages]);
  const lastAutoKey = useRef<string | null>(null);
  const canFetch = missing.length === 0 && Boolean(status?.configured);
  useEffect(() => {
    if (!canFetch || lastAutoKey.current === requestKey) return;
    const t = setTimeout(() => {
      lastAutoKey.current = requestKey;
      void getRates();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch, requestKey]);

  const shown = quotes ?? saved.quote?.quotes ?? null;
  const booked = saved.shipment?.state === "done";

  useEffect(() => {
    onQuotesChange?.(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  return (
    <section className="ui-card">
      <div className="ui-card-header flex-wrap">
        <span className="ui-card-title">
          <span className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Rocket className="w-3.5 h-3.5 text-violet-600" />
          </span>
          Shiprocket Cargo
          <span className="ui-chip">Live rates</span>
        </span>
        <span className="flex items-center gap-2">
          {status && !status.configured && <span className="text-[11px] font-medium text-amber-700">API credentials not set yet</span>}
          {loading && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-violet-700">
              <RefreshCw className="w-3 h-3 animate-spin" /> Fetching rates…
            </span>
          )}
          {!loading && shown && !quotes && saved.quote && (
            <span className="ui-muted">Saved {formatDateTimeDisplay(saved.quote.at)} · {saved.quote.by}</span>
          )}
        </span>
      </div>

      <div className="ui-card-body space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr_1fr_auto_auto] gap-2 items-end">
          <label className="block">
            <span className="ui-label">Pincode</span>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
              className="ui-input ui-mono font-medium" />
          </label>
          <label className="block">
            <span className="ui-label">City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="ui-input" />
          </label>
          <label className="block">
            <span className="ui-label">State</span>
            <input value={state} onChange={(e) => setState(e.target.value)} className="ui-input" />
          </label>
          <button type="button" onClick={getRates} disabled={loading || !canFetch} title="Ask Shiprocket again"
            className="ui-btn-secondary h-[34px]">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={onBook} disabled={!status?.configured} className="ui-btn-primary h-[34px]">
            {booked ? "View booking" : saved.order?.state === "done" ? "Continue booking" : "Book"}
          </button>
        </div>

        {missing.length > 0 && <p className="text-[11px] text-amber-700">Rates load automatically once these are filled: {missing.join(", ")}.</p>}

        {error && (
          <div className="flex items-start gap-1.5 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {shown && shown.length === 0 && <p className="text-[11px] text-slate-600">No surface carrier is serviceable for this lane.</p>}
        {shown && shown.length > 0 && (
          <p className="ui-muted">
            {shown.length} surface {shown.length === 1 ? "carrier" : "carriers"} enabled on your Shiprocket account for this lane, shown in the rate cards above.
          </p>
        )}
      </div>
    </section>
  );
}
