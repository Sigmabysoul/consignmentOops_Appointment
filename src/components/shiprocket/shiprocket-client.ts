"use client";

import { useEffect, useState } from "react";
import type { AppointmentOrder } from "@/lib/types";
import type { ShiprocketPackage, ShiprocketServerStatus, ShiprocketShipmentRecord } from "@/lib/shiprocket-types";

let statusPromise: Promise<ShiprocketServerStatus | null> | null = null;

/** Server-side Shiprocket setup (cached for the page lifetime). */
export function useShiprocketStatus(): ShiprocketServerStatus | null {
  const [status, setStatus] = useState<ShiprocketServerStatus | null>(null);
  useEffect(() => {
    statusPromise ??= fetch("/api/shiprocket/status")
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

/** fetch wrapper for /api/shiprocket/*: throws with the server's message. */
export async function shiprocketApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/shiprocket${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function readShiprocketRecord(order: AppointmentOrder | null | undefined): ShiprocketShipmentRecord {
  const rec = (order?.customData as any)?.shiprocket;
  return rec && typeof rec === "object" ? rec : {};
}

export function orderAddressText(order: AppointmentOrder): string {
  const c = (order.customData as any) || {};
  return String(c.deliveredTo || c.warehouseAddress || order.client?.address || "");
}

/** Last 6-digit Indian pincode in an address, or "". */
export function extractPincode(address: string): string {
  const all = address.match(/(?<!\d)[1-9]\d{2}\s?\d{3}(?!\d)/g);
  return all ? all[all.length - 1].replace(/\s/g, "") : "";
}

/** "West Bengal (Kolkata)" → { state: "West Bengal", city: "Kolkata" }. */
export function splitStateCity(value: string): { state: string; city: string } {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(value || "");
  return m ? { state: m[1].trim(), city: m[2].trim() } : { state: (value || "").trim(), city: "" };
}

/**
 * Package groups from the order's box dimension groups. Weight per box comes from the group;
 * when a group has none, the total weight is split evenly in integer grams (no float drift).
 */
export function defaultPackages(order: AppointmentOrder, totalWeightKg: number): ShiprocketPackage[] {
  const groups = (order.boxDimensionGroups || []).filter((g) => g.boxCount > 0);
  const boxes = groups.reduce((s, g) => s + g.boxCount, 0);
  const fallbackPerBox = boxes > 0 && totalWeightKg > 0 ? Math.round((totalWeightKg * 1000) / boxes) / 1000 : 0;
  return groups.map((g) => ({
    units: g.boxCount,
    lengthCm: Number(g.lengthCm || 0),
    widthCm: Number(g.widthCm || 0),
    heightCm: Number(g.heightCm || 0),
    weightKg: Number(Number(g.weightKg && g.weightKg > 0 ? g.weightKg : fallbackPerBox).toFixed(2)),
  }));
}

export const packagesReady = (p: ShiprocketPackage[]) =>
  p.length > 0 && p.every((x) => x.units >= 1 && x.lengthCm >= 1 && x.widthCm >= 1 && x.heightCm >= 1 && x.weightKg > 0);

export const rupees = (n: number | null | undefined) =>
  typeof n === "number" ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
