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
    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-0.5">
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
    <p className="text-[10px] text-slate-500 leading-snug">
      Read from Delhivery's response using field names that have not been checked against real staging data yet.
      {matched && matched.length === 0 && <b className="text-amber-700"> No fields were recognised; check the server log.</b>}
    </p>
  );
}
