/**
 * App 2 permission checks. Same model as the consignment app (no roles):
 *   - global permissions on User.globalPermissions
 *   - one ChannelPermission row per platform with `actions`
 * The keys below are a subset of consignment/src/config/permissions.catalog.ts; the test
 * tests/permission-system.test.ts fails if they drift apart.
 *
 * App 2 access = "Logistics app desks" (logistics.desk) on at least one platform. Every list and
 * every order route is scoped to the platforms where the user holds it.
 */
import type { Prisma } from "@prisma/client";
import { channelsMatch, getChannelAliases } from "./channel-aliases";

export const APP2_CHANNEL_ACTIONS = [
  "order.view",
  "order.override",
  "logistics.desk",
  "courier.book",
  "delivery.mark",
  "labels.manage",
  "tracking.manage",
] as const;
export type App2ChannelAction = (typeof APP2_CHANNEL_ACTIONS)[number];

export const APP2_GLOBAL_PERMISSIONS = ["settings.couriers"] as const;
export type App2GlobalPermission = (typeof APP2_GLOBAL_PERMISSIONS)[number];

export interface PermissionHolder {
  globalPermissions?: string[];
  permissions?: { channel: string; actions: string[] }[];
}

function rowFor(user: PermissionHolder | null | undefined, channel: unknown) {
  // "ALL" is not a platform: channelsMatch() would match it to any row.
  if (!user || !channel || typeof channel !== "string" || channel.trim().toUpperCase() === "ALL") return undefined;
  return (user.permissions || []).find((p) => channelsMatch(p.channel, channel));
}

function rowAllows(row: { actions: string[] } | undefined, action: App2ChannelAction): boolean {
  if (!row) return false;
  return row.actions.includes("order.view") && row.actions.includes(action);
}

export function hasGlobal(user: PermissionHolder | null | undefined, perm: App2GlobalPermission): boolean {
  return Boolean(user && (user.globalPermissions || []).includes(perm));
}

/** Action on one platform. Every App 2 action also requires the desk itself. */
export function can(user: PermissionHolder | null | undefined, channel: unknown, action: App2ChannelAction): boolean {
  const row = rowFor(user, channel);
  if (!rowAllows(row, "logistics.desk")) return false;
  return rowAllows(row, action);
}

export function channelsWith(user: PermissionHolder | null | undefined, action: App2ChannelAction = "logistics.desk"): string[] {
  if (!user) return [];
  return (user.permissions || [])
    .filter((row) => rowAllows(row, "logistics.desk") && rowAllows(row, action))
    .map((row) => row.channel);
}

/** May the user open App 2 at all? */
export function canUseLogisticsApp(user: PermissionHolder | null | undefined): boolean {
  return channelsWith(user, "logistics.desk").length > 0;
}

export const canSeeOrder = (user: PermissionHolder | null | undefined, channel: unknown) => can(user, channel, "logistics.desk");
export const canBookCourier = (user: PermissionHolder | null | undefined, channel: unknown) => can(user, channel, "courier.book");
export const canMarkDelivered = (user: PermissionHolder | null | undefined, channel: unknown) => can(user, channel, "delivery.mark");
export const canOverride = (user: PermissionHolder | null | undefined, channel: unknown) => can(user, channel, "order.override");
export const canManageLabels = (user: PermissionHolder | null | undefined, channel: unknown) => can(user, channel, "labels.manage");
export const canManageCouriers = (user: PermissionHolder | null | undefined) => hasGlobal(user, "settings.couriers");

/** Prisma condition limiting orders to the platforms the user may work on in App 2. */
export function channelScopeWhere(user: PermissionHolder | null | undefined): Prisma.ConsignmentOrderWhereInput {
  const codes = Array.from(new Set(channelsWith(user, "logistics.desk").flatMap((c) => getChannelAliases(c))));
  return { channel: { in: codes } };
}

export const FORBIDDEN_PLATFORM = "Forbidden: needs the 'Logistics app desks' permission on this order's platform";

/** Labels used in refusal messages (match the consignment app's catalog labels). */
export const ACTION_LABEL: Record<App2ChannelAction, string> = {
  "order.view": "View orders",
  "order.override": "Override workflow gates",
  "logistics.desk": "Logistics app desks",
  "courier.book": "Book couriers",
  "delivery.mark": "Mark delivered",
  "labels.manage": "Courier shipping labels",
  "tracking.manage": "Courier & tracking",
};
