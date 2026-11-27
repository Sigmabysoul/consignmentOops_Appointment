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
      className="w-fit max-w-[180px] truncate rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
      title={rec.tracking ? `Checked ${formatDateTimeDisplay(rec.tracking.checkedAt)}` : "Not checked yet"}
    >
      <span className="font-semibold text-slate-800">Shiprocket:</span> {rec.tracking?.status || "not checked"}
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
    <div className="ui-card flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span className="font-medium text-slate-700">
        {count} Shiprocket Cargo shipment(s) on this page
        {status && !status.configured && <span className="text-amber-700"> · credentials not set yet</span>}
      </span>
      <button type="button" onClick={refresh} disabled={busy || !status?.configured}
        className="ui-btn-secondary">
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh Shiprocket tracking
      </button>
    </div>
  );
}
