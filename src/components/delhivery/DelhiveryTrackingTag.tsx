"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import { DELHIVERY_TRACK_STATUS_LABELS, type DelhiveryTrackStatus } from "@/modules/delhivery/mappers";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { delhiveryApi, readDelhiveryRecord, useDelhiveryStatus } from "./delhivery-client";

/** Read-only Delhivery status line under an order's status badge (informational, not clickable). */
export function DelhiveryTrackingTag({ order }: { order: AppointmentOrder }) {
  const rec = readDelhiveryRecord(order);
  if (!rec.lrn || rec.cancelled) return null;
  const s = rec.tracking?.status;
  return (
    <div
      className="text-[10px] font-semibold text-red-800 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded w-fit max-w-[180px] truncate"
      title={rec.tracking ? `Checked ${formatDateTimeDisplay(rec.tracking.checkedAt)}` : "Not checked yet"}
    >
      Delhivery: {s ? DELHIVERY_TRACK_STATUS_LABELS[s as DelhiveryTrackStatus] || s : "not checked"}
      {rec.tracking?.location ? ` · ${rec.tracking.location}` : ""}
    </div>
  );
}

/** "Refresh Delhivery tracking" bar; shown only when the page has Delhivery API shipments. */
export function DelhiveryTrackingRefresh({ orders, onRefreshed }: { orders: AppointmentOrder[]; onRefreshed: () => void }) {
  const status = useDelhiveryStatus();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const count = orders.filter((o) => {
    const r = readDelhiveryRecord(o);
    return r.lrn && !r.cancelled;
  }).length;
  if (!count) return null;

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await delhiveryApi<{ checked: number; refreshed: number; failures: unknown[] }>("/track-all", { method: "POST" });
      showToast(`Delhivery tracking refreshed for ${r.refreshed} of ${r.checked} shipment(s)`, r.failures.length ? "error" : "success");
      onRefreshed();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50/50 text-xs">
      <span className="text-red-950 font-semibold">
        {count} Delhivery API shipment(s) on this page
        {!status?.configured && status && <span className="text-amber-700"> · credentials not set yet</span>}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={busy || !status?.configured}
        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh Delhivery tracking
      </button>
    </div>
  );
}
