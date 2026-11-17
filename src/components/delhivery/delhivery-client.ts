"use client";

import { useEffect, useState } from "react";
import type { AppointmentOrder } from "@/lib/types";
import type { DelhiveryServerStatus, DelhiveryShipmentRecord } from "@/lib/delhivery-types";

export const DELHIVERY_NAME = "Delhivery One";

let statusPromise: Promise<DelhiveryServerStatus | null> | null = null;

/** Server-side Delhivery setup (cached for the page lifetime). */
export function useDelhiveryStatus(): DelhiveryServerStatus | null {
  const [status, setStatus] = useState<DelhiveryServerStatus | null>(null);
  useEffect(() => {
    statusPromise ??= fetch("/api/delhivery/status")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    let alive = true;
    statusPromise.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export class DelhiveryApiError extends Error {
  constructor(message: string, readonly kind?: string, readonly status?: number) {
    super(message);
  }
}

/** fetch wrapper for /api/delhivery/*: throws DelhiveryApiError with the server's message. */
export async function delhiveryApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/delhivery${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DelhiveryApiError(data.error || `Request failed (${res.status})`, data.kind, res.status);
  return data as T;
}

export const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function readDelhiveryRecord(order: AppointmentOrder | null | undefined): DelhiveryShipmentRecord {
  const rec = (order?.customData as any)?.delhivery;
  return rec && typeof rec === "object" ? rec : {};
}

export function orderAddress(order: AppointmentOrder): string {
  const c = (order.customData as any) || {};
  return String(c.deliveredTo || c.warehouseAddress || order.client?.address || "");
}

/** Last 6-digit Indian pincode in an address, or "". */
export function extractPincode(address: string): string {
  const all = address.match(/(?<!\d)[1-9]\d{2}\s?\d{3}(?!\d)/g);
  return all ? all[all.length - 1].replace(/\s/g, "") : "";
}

export const rupees = (n: number | null | undefined) =>
  typeof n === "number" ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

/** Opens a document route: a PDF/image streams into a new tab, a JSON link list opens the first link. */
export async function openDelhiveryDocument(path: string): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`/api/delhivery${path}`);
    const type = res.headers.get("content-type") || "";
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new DelhiveryApiError(data.error || `Request failed (${res.status})`);
    }
    if (type.includes("json")) {
      const { urls } = await res.json();
      if (tab) tab.location.href = urls[0];
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
  } catch (err) {
    tab?.close();
    throw err;
  }
}
