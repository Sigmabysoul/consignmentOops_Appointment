"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { readShiprocketRecord, shiprocketApi, useShiprocketStatus } from "./shiprocket-client";

/** Read-only Shiprocket status line under an order's status badge (informational, not clickable). */
export function ShiprocketTrackingTag({ order }: { order: AppointmentOrder }) {
  const rec = readShiprocketRecord(order);
  if (!rec.waybill) return null;
  return (
    <div
      className="text-[10px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded w-fit max-w-[180px] truncate"
      title={rec.tracking ? `Checked ${formatDateTimeDisplay(rec.tracking.checkedAt)}` : "Not checked yet"}
    >
      Shiprocket: {rec.tracking?.status || "not checked"}
      {rec.tracking?.location ? ` · ${rec.tracking.location}` : ""}
    </div>
  );
}

/** "Refresh Shiprocket tracking" bar; shown only when the page has Shiprocket shipments. */
export function ShiprocketTrackingRefresh({ orders, onRefreshed }: { orders: AppointmentOrder[]; onRefreshed: () => void }) {
  const status = useShiprocketStatus();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const count = orders.filter((o) => readShiprocketRecord(o).waybill).length;
  if (!count) return null;

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await shiprocketApi<{ checked: number; refreshed: number; failures: unknown[] }>("/track-all", { method: "POST" });
      showToast(`Shiprocket tracking refreshed for ${r.refreshed} of ${r.checked} shipment(s)`, r.failures.length ? "error" : "success");
      onRefreshed();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs">
      <span className="text-indigo-950 font-semibold">
        {count} Shiprocket Cargo shipment(s) on this page
        {status && !status.configured && <span className="text-amber-700"> · credentials not set yet</span>}
      </span>
      <button type="button" onClick={refresh} disabled={busy || !status?.configured}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh Shiprocket tracking
      </button>
    </div>
  );
}
