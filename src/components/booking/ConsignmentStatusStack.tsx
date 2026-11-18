"use client";

import React from "react";
import { AppointmentOrder } from "@/lib/types";
import {
  ConsignmentStatusView,
  StatusTone,
  getFulfilmentStatus,
  getOrderStatus,
  getPrintingStatus,
} from "@/lib/consignment-statuses";

const TONE_CLASS: Record<StatusTone, string> = {
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  blue: "bg-sky-50 text-sky-800 border-sky-200",
  red: "bg-rose-50 text-rose-800 border-rose-200",
  violet: "bg-violet-50 text-violet-800 border-violet-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

const DOT_CLASS: Record<StatusTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-sky-500",
  red: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-400",
};

function Row({ label, view }: { label: string; view: ConsignmentStatusView }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {/* Read-only badge: status values are owned by the Consignment app and never mutated from here. */}
      <span
        className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold select-none ${TONE_CLASS[view.tone]}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[view.tone]}`} />
        <span className="truncate">{view.label}</span>
      </span>
    </div>
  );
}

/** Order, printing and fulfilment statuses from the Consignment app, stacked in one cell. */
export function ConsignmentStatusStack({ order }: { order: AppointmentOrder }) {
  return (
    <div className="flex min-w-[150px] max-w-[190px] flex-col gap-2" title="Statuses from the Consignment app (read-only)">
      <Row label="Order" view={getOrderStatus(order)} />
      <Row label="Printing" view={getPrintingStatus(order)} />
      <Row label="Fulfilment" view={getFulfilmentStatus(order)} />
    </div>
  );
}
