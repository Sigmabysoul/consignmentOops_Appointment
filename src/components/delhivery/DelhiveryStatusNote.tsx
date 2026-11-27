"use client";

import React from "react";
import { AlertTriangle, KeyRound } from "lucide-react";
import type { DelhiveryServerStatus } from "@/lib/delhivery-types";

/** Explains why Delhivery actions are unavailable (credentials, booking switch, warehouse). */
export function DelhiveryStatusNote({ status, forBooking = false }: { status: DelhiveryServerStatus | null; forBooking?: boolean }) {
  if (!status) return null;
  const problems: string[] = [];
  if (!status.configured) problems.push("Delhivery credentials are not set on the server yet, so API calls are switched off.");
  if (forBooking && status.configured && !status.bookingEnabled) {
    problems.push("Booking is switched off on this server (DELHIVERY_BOOKING_ENABLED is not true).");
  }
  if (forBooking && !status.warehouseConfigured) {
    problems.push("The registered Delhivery pickup warehouse name (DELHIVERY_WAREHOUSE_NAME) is not set.");
  }
  if (!problems.length) return null;
  return (
    <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {problems.map((p) => (
        <div key={p} className="flex items-start gap-1.5">
          {status.configured ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          <span>{p}</span>
        </div>
      ))}
    </div>
  );
}

/** Shown wherever a value came from a provisional (unverified) response mapper. */
export function DelhiveryProvisionalNote({ matched }: { matched?: string[] }) {
  return (
    <p className="text-[11px] leading-snug text-slate-400">
      Read from Delhivery's response using field names that have not been checked against real staging data yet.
      {matched && matched.length === 0 && <b className="font-semibold text-amber-700"> No fields were recognised; check the server log.</b>}
    </p>
  );
}
