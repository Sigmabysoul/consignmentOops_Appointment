"use client";

import React, { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type { DelhiveryShipmentRecord } from "@/lib/delhivery-types";
import { readDelhiveryRecord, useDelhiveryStatus } from "./delhivery-client";
import { DelhiveryShipmentPanel } from "./DelhiveryShipmentPanel";

/** Order drawer section: renders only when the order has (or had) a Delhivery API booking. */
export function DelhiveryDrawerSection({ order, onOrderUpdated }: { order: AppointmentOrder; onOrderUpdated: () => void }) {
  const status = useDelhiveryStatus();
  const [record, setRecord] = useState<DelhiveryShipmentRecord>(() => readDelhiveryRecord(order));
  useEffect(() => setRecord(readDelhiveryRecord(order)), [order]);

  const state = record.manifest?.state;
  if (!record.lrn && !state) return null;

  return (
    <div className="space-y-3 pt-3 border-t border-slate-200">
      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
        <Truck className="w-3.5 h-3.5 text-red-600" />
        <span>Delhivery One shipment</span>
      </div>
      {record.lrn ? (
        <DelhiveryShipmentPanel order={order} record={record} status={status} onRecordChange={setRecord} onOrderUpdated={onOrderUpdated} />
      ) : (
        <p className="text-xs text-slate-600">
          {state === "pending" || state === "submitting"
            ? "Booking sent to Delhivery; waiting for the LR. Open the booking from the Booking Desk to check its status."
            : state === "unknown_outcome"
            ? "The last booking attempt has an unknown result. Check the Delhivery One panel before booking again."
            : `Last booking attempt failed${record.manifest?.message ? `: ${record.manifest.message}` : "."}`}
        </p>
      )}
    </div>
  );
}
