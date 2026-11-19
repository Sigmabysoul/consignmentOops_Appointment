/**
 * Shareable URL state for the Logistics WorkHub page (src/app/page.tsx).
 *
 * The address bar carries the desk, platform, quick date filter and the open order drawer, so a
 * reload keeps the screen and the link can be sent to a colleague:
 *   /?view=appointment&channel=BLINKIT_STO&date=today&order=<orderId>
 *
 * Pure helpers only (no React, no window) so they can be unit tested.
 */
import type { ActiveView, QuickDatePreset } from "@/lib/types";

export const URL_VIEWS: readonly ActiveView[] = ["booking", "appointment", "kanban", "sheet", "timeline", "analytics"];
export const URL_DATES: readonly QuickDatePreset[] = ["all", "yesterday", "today", "tomorrow", "this_week", "overdue"];

export interface UrlViewState {
  view?: ActiveView;
  /** Platform code or "ALL"; access is checked by the server for every list. */
  channel?: string;
  date?: QuickDatePreset;
  /** Order whose details drawer is open. */
  order?: string;
}

const CHANNEL_RE = /^(?:ALL|[A-Z][A-Z0-9_]{1,40})$/;
const ORDER_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function parseUrlViewState(search: string | URLSearchParams | null | undefined): UrlViewState {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ""));
  const state: UrlViewState = {};
  const view = (params.get("view") || "").trim().toLowerCase();
  if ((URL_VIEWS as readonly string[]).includes(view)) state.view = view as ActiveView;
  const channel = (params.get("channel") || "").trim().toUpperCase();
  if (CHANNEL_RE.test(channel)) state.channel = channel;
  const date = (params.get("date") || "").trim().toLowerCase();
  if ((URL_DATES as readonly string[]).includes(date)) state.date = date as QuickDatePreset;
  const order = (params.get("order") || "").trim();
  if (ORDER_RE.test(order)) state.order = order;
  return state;
}

/** Query string for a screen; unrelated params are kept, defaults (booking / ALL / all) left out. */
export function buildUrlViewSearch(state: UrlViewState, currentSearch = ""): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of ["view", "channel", "date", "order"]) params.delete(key);
  if (state.view && state.view !== "booking") params.set("view", state.view);
  if (state.channel && state.channel !== "ALL") params.set("channel", state.channel);
  if (state.date && state.date !== "all") params.set("date", state.date);
  if (state.order) params.set("order", state.order);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Desk / platform changes add a history entry; date filter and drawer changes only replace it. */
export function isNavigationChange(prev: UrlViewState, next: UrlViewState): boolean {
  return (prev.view || "booking") !== (next.view || "booking") || (prev.channel || "ALL") !== (next.channel || "ALL");
}
