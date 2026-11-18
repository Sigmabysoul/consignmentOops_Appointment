import { Prisma } from "@prisma/client";

/**
 * Universal base condition for active (non-deleted) consignment orders
 */
export const BASE_ORDER_WHERE: Prisma.ConsignmentOrderWhereInput = {
  OR: [{ isDeleted: false }, { isDeleted: null }],
};

/**
 * Orders that never reach the Appointment app: drafts, not-yet-processing (New / Pending),
 * cancelled and archived. An order appears only once the main app moves it to In Processing,
 * and stays through In Transit, Delivered and GRN Issue.
 */
export const HIDDEN_FROM_APPOINTMENT_STATUSES = [
  "Draft", "draft", "DRAFT", "Pending Approval",
  "New", "new", "NEW", "Pending", "pending", "PENDING",
  "Cancelled", "cancelled", "CANCELLED", "Canceled", "CANCELED",
  "Archive", "archive", "ARCHIVE", "Archived", "archived", "ARCHIVED", "Rejected",
];

/** Applied to every Appointment-app order query (lists, Kanban, dashboard counts). */
export const APPOINTMENT_APP_VISIBILITY: Prisma.ConsignmentOrderWhereInput[] = [
  { OR: [{ isDeleted: false }, { isDeleted: null }] },
  { OR: [{ isArchived: false }, { isArchived: null }] },
  { status: { notIn: HIDDEN_FROM_APPOINTMENT_STATUSES } }, // also excludes a null status
  {
    OR: [
      { courierStatus: null },
      { courierStatus: { notIn: ["Cancelled", "cancelled", "CANCELLED", "Canceled"] } },
    ],
  },
];

/** Same rule for a single loaded order (detail, edit, deliver, POD). */
export function isVisibleInAppointmentApp(order: {
  status?: string | null;
  courierStatus?: string | null;
  isDeleted?: boolean | null;
  isArchived?: boolean | null;
} | null | undefined): boolean {
  if (!order || order.isDeleted || order.isArchived) return false;
  if (!order.status || HIDDEN_FROM_APPOINTMENT_STATUSES.includes(order.status)) return false;
  if (["cancelled", "canceled"].includes(String(order.courierStatus || "").toLowerCase())) return false;
  return true;
}

/*
 * Shared status lists. The Prisma conditions below and the pure predicates further down use the
 * SAME arrays with the SAME exact-match semantics, so a list row and a loaded order can never be
 * classified differently, and the Booking and Appointment desks stay disjoint by construction.
 */
export const IN_TRANSIT_COURIER_STATUSES = [
  "In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched", "SHIPPED", "shipped",
];
export const IN_TRANSIT_ORDER_STATUSES = ["In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched"];
export const DELIVERED_STATUSES = ["Delivered", "delivered", "DELIVERED"];
export const GRN_ISSUE_STATUSES = ["GRN Issue", "GRN ISSUE", "grn issue"];
const BOOKING_EXCLUDED_COURIER_STATUSES = [
  ...IN_TRANSIT_COURIER_STATUSES, ...DELIVERED_STATUSES, "Cancelled", "cancelled", ...GRN_ISSUE_STATUSES,
];
const BOOKING_EXCLUDED_ORDER_STATUSES = [
  ...IN_TRANSIT_ORDER_STATUSES, ...DELIVERED_STATUSES, "Cancelled", "CANCELLED", "Archive", "ARCHIVED",
  ...GRN_ISSUE_STATUSES,
];
const APPOINTMENT_CLOSED_ORDER_STATUSES = [
  "Cancelled", "CANCELLED", "Archive", "ARCHIVED", ...DELIVERED_STATUSES, ...GRN_ISSUE_STATUSES,
];
const APPOINTMENT_CLOSED_COURIER_STATUSES = ["Cancelled", "CANCELLED", ...DELIVERED_STATUSES, ...GRN_ISSUE_STATUSES];

/**
 * customData.fulfilmentStatus is not "Dispatched". A bare JSON-path NOT drops rows that lack the
 * key (SQL NULL), so the "key missing / JSON null" case is matched explicitly.
 */
const FULFILMENT_NOT_DISPATCHED: Prisma.ConsignmentOrderWhereInput = {
  OR: [
    { customData: { path: ["fulfilmentStatus"], equals: Prisma.AnyNull } },
    { NOT: { customData: { path: ["fulfilmentStatus"], equals: "Dispatched" } } },
  ],
};

/** Any App 1 dispatch marker (BoxTrace / courier milestone / pickupDone / fulfilment Dispatched). */
export const IN_TRANSIT_MARKER_CONDITION: Prisma.ConsignmentOrderWhereInput = {
  OR: [
    { courierStatus: { in: IN_TRANSIT_COURIER_STATUSES } },
    { status: { in: IN_TRANSIT_ORDER_STATUSES } },
    { pickupDone: true },
    { customData: { path: ["fulfilmentStatus"], equals: "Dispatched" } },
  ],
};

/** Exact negation of IN_TRANSIT_MARKER_CONDITION plus delivered / cancelled / GRN exclusions. */
const NOT_DISPATCHED_CONDITIONS: Prisma.ConsignmentOrderWhereInput[] = [
  { pickupDone: false },
  {
    OR: [
      { courierStatus: null },
      { courierStatus: "" },
      { courierStatus: { notIn: BOOKING_EXCLUDED_COURIER_STATUSES } },
    ],
  },
  {
    OR: [
      { status: null },
      { status: "" },
      { status: { notIn: BOOKING_EXCLUDED_ORDER_STATUSES } },
    ],
  },
  FULFILMENT_NOT_DISPATCHED,
];

/**
 * Filter conditions for the Booking Desk:
 * Rule 3: Only show orders when packaging slip is marked printed by printing team
 * Rule 2: In-transit orders move to appointment desk, so exclude in-transit / dispatched
 *         (incl. customData.fulfilmentStatus "Dispatched") / delivered / cancelled
 */
export const BOOKING_FILTER_CONDITIONS: Prisma.ConsignmentOrderWhereInput[] = [
  // Packaging slip printed condition
  {
    OR: [
      { docsPrinted: true },
      {
        customData: {
          path: ["documentPrintStatus", "PACKAGING_SLIP", "isPrinted"],
          equals: true,
        },
      },
      {
        customData: {
          path: ["packagingSlipPrinted"],
          equals: true,
        },
      },
      {
        documents: {
          some: {
            docType: "PACKAGING_SLIP",
          },
        },
      },
    ],
  },
  // Exclude in-transit / dispatched / delivered / cancelled
  ...NOT_DISPATCHED_CONDITIONS,
];

/**
 * Filter conditions for the Appointment Desk:
 * Rule 2: Only orders that have been in transit / dispatched / shipped
 * Exclude delivered, GRN Issue and cancelled orders
 */
export const APPOINTMENT_FILTER_CONDITIONS: Prisma.ConsignmentOrderWhereInput[] = [
  IN_TRANSIT_MARKER_CONDITION,
  {
    OR: [
      { status: null },
      { status: "" },
      { status: { notIn: APPOINTMENT_CLOSED_ORDER_STATUSES } },
    ],
  },
  {
    OR: [
      { courierStatus: null },
      { courierStatus: "" },
      { courierStatus: { notIn: APPOINTMENT_CLOSED_COURIER_STATUSES } },
    ],
  },
];

/* ───────────────────────── Pure predicates (same rules, one loaded order) ───────────────────────── */

export interface OrderStageFields {
  status?: string | null;
  courierStatus?: string | null;
  pickupDone?: boolean | null;
  docsPrinted?: boolean | null;
  customData?: unknown;
  documents?: Array<{ docType?: string | null }> | null;
  trackingId?: string | null;
  appointmentDate?: string | Date | null;
  pickupDate?: string | Date | null;
  grnStatus?: string | null;
  isArchived?: boolean | null;
}

const inList = (list: readonly string[], v: unknown) => typeof v === "string" && list.includes(v);
const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const fulfilmentOf = (o: OrderStageFields) => (o.customData as Record<string, unknown> | null | undefined)?.fulfilmentStatus;

/** Mirrors IN_TRANSIT_MARKER_CONDITION. */
export function hasInTransitMarker(o: OrderStageFields): boolean {
  return (
    inList(IN_TRANSIT_COURIER_STATUSES, o.courierStatus) ||
    inList(IN_TRANSIT_ORDER_STATUSES, o.status) ||
    o.pickupDone === true ||
    fulfilmentOf(o) === "Dispatched"
  );
}

/** Mirrors APPOINTMENT_FILTER_CONDITIONS: the order is in transit and still open on the Appointment desk. */
export function isOnAppointmentDesk(o: OrderStageFields): boolean {
  return (
    hasInTransitMarker(o) &&
    !inList(APPOINTMENT_CLOSED_ORDER_STATUSES, o.status) &&
    !inList(APPOINTMENT_CLOSED_COURIER_STATUSES, o.courierStatus)
  );
}

/** Mirrors the printed branch of BOOKING_FILTER_CONDITIONS (documents only when loaded). */
export function isPackagingSlipPrinted(o: OrderStageFields): boolean {
  const custom = (o.customData as Record<string, any> | null | undefined) || {};
  return (
    o.docsPrinted === true ||
    custom.documentPrintStatus?.PACKAGING_SLIP?.isPrinted === true ||
    custom.packagingSlipPrinted === true ||
    !!o.documents?.some((d) => d?.docType === "PACKAGING_SLIP")
  );
}

/** Mirrors NOT_DISPATCHED_CONDITIONS. */
function isNotDispatched(o: OrderStageFields): boolean {
  return (
    !o.pickupDone &&
    !inList(BOOKING_EXCLUDED_COURIER_STATUSES, o.courierStatus) &&
    !inList(BOOKING_EXCLUDED_ORDER_STATUSES, o.status) &&
    fulfilmentOf(o) !== "Dispatched"
  );
}

/** Mirrors BOOKING_FILTER_CONDITIONS. Never true together with isOnAppointmentDesk. */
export function isOnBookingDesk(o: OrderStageFields): boolean {
  return isPackagingSlipPrinted(o) && isNotDispatched(o);
}

export function isGrnIssueOrder(o: OrderStageFields): boolean {
  return lc(o.grnStatus).includes("issue") || lc(o.status).includes("grn issue") || lc(o.courierStatus).includes("grn issue");
}

/** Delivered comes only from the status / courier milestone written with the POD (never deliveryDate alone). */
export function isDeliveredOrder(o: OrderStageFields): boolean {
  return inList(DELIVERED_STATUSES, o.status) || inList(DELIVERED_STATUSES, o.courierStatus);
}

/** Delivered / GRN Issue / archived / cancelled: App 2 must not move it to any other stage. */
export function isClosedOrder(o: OrderStageFields): boolean {
  return (
    !!o.isArchived ||
    isDeliveredOrder(o) ||
    isGrnIssueOrder(o) ||
    ["archive", "archived", "cancelled", "canceled", "delivered"].includes(lc(o.status)) ||
    ["cancelled", "canceled", "delivered"].includes(lc(o.courierStatus))
  );
}

/** Past Due (Golden Rule 9): pickup date before today (IST) and not yet in transit / closed. */
export function isPastDueOrder(o: OrderStageFields, todayStartIst: Date): boolean {
  if (!o.pickupDate) return false;
  const pickup = new Date(o.pickupDate as any);
  return !isNaN(pickup.getTime()) && pickup.getTime() < todayStartIst.getTime() && isNotDispatched(o);
}

/* ───────────────────────── Kanban stages (one partition, server counts + client columns) ───────────────────────── */

export const KANBAN_STAGES = ["remaining", "booked", "in_transit", "delivered", "grn_issue"] as const;
export type KanbanStage = (typeof KANBAN_STAGES)[number];
const BOOKED_COURIER_MILESTONES = ["Tracking Assigned", "Appointment Scheduled"];

function isBookedOrder(o: OrderStageFields): boolean {
  return (
    !!(o.trackingId && o.trackingId !== "") ||
    (o.appointmentDate !== null && o.appointmentDate !== undefined) ||
    BOOKED_COURIER_MILESTONES.some((m) => m.toLowerCase() === String(o.courierStatus ?? "").toLowerCase())
  );
}

/** GRN Issue → Delivered → In Transit (same marker as the Appointment desk) → Booked → Remaining. */
export function getKanbanStage(o: OrderStageFields): KanbanStage {
  if (isGrnIssueOrder(o)) return "grn_issue";
  if (isDeliveredOrder(o)) return "delivered";
  if (hasInTransitMarker(o)) return "in_transit";
  if (isBookedOrder(o)) return "booked";
  return "remaining";
}

const GRN_ISSUE_CONDITION: Prisma.ConsignmentOrderWhereInput = {
  OR: [
    { grnStatus: { contains: "issue", mode: "insensitive" } },
    { status: { contains: "grn issue", mode: "insensitive" } },
    { courierStatus: { contains: "grn issue", mode: "insensitive" } },
  ],
};
// Null-safe negations (a NOT on a NULL column is NULL in SQL and would silently drop the row)
const NOT_GRN_ISSUE: Prisma.ConsignmentOrderWhereInput = {
  AND: [
    { OR: [{ grnStatus: null }, { NOT: { grnStatus: { contains: "issue", mode: "insensitive" } } }] },
    { OR: [{ status: null }, { NOT: { status: { contains: "grn issue", mode: "insensitive" } } }] },
    { OR: [{ courierStatus: null }, { NOT: { courierStatus: { contains: "grn issue", mode: "insensitive" } } }] },
  ],
};
const DELIVERED_CONDITION: Prisma.ConsignmentOrderWhereInput = {
  OR: [{ status: { in: DELIVERED_STATUSES } }, { courierStatus: { in: DELIVERED_STATUSES } }],
};
const NOT_DELIVERED: Prisma.ConsignmentOrderWhereInput = {
  AND: [
    { OR: [{ status: null }, { status: { notIn: DELIVERED_STATUSES } }] },
    { OR: [{ courierStatus: null }, { courierStatus: { notIn: DELIVERED_STATUSES } }] },
  ],
};
const NOT_IN_TRANSIT_MARKER: Prisma.ConsignmentOrderWhereInput = {
  AND: [
    { pickupDone: false },
    { OR: [{ courierStatus: null }, { courierStatus: { notIn: IN_TRANSIT_COURIER_STATUSES } }] },
    { OR: [{ status: null }, { status: { notIn: IN_TRANSIT_ORDER_STATUSES } }] },
    FULFILMENT_NOT_DISPATCHED,
  ],
};
const BOOKED_CONDITION: Prisma.ConsignmentOrderWhereInput = {
  OR: [
    { AND: [{ trackingId: { not: null } }, { NOT: { trackingId: "" } }] },
    { appointmentDate: { not: null } },
    { courierStatus: { in: BOOKED_COURIER_MILESTONES, mode: "insensitive" } },
  ],
};
const NOT_BOOKED: Prisma.ConsignmentOrderWhereInput = {
  AND: [
    { OR: [{ trackingId: null }, { trackingId: "" }] },
    { appointmentDate: null },
    { OR: [{ courierStatus: null }, { NOT: { courierStatus: { in: BOOKED_COURIER_MILESTONES, mode: "insensitive" } } }] },
  ],
};

/** Prisma twin of getKanbanStage: the five conditions partition every visible order. */
export const KANBAN_STAGE_CONDITIONS: Record<KanbanStage, Prisma.ConsignmentOrderWhereInput> = {
  grn_issue: GRN_ISSUE_CONDITION,
  delivered: { AND: [NOT_GRN_ISSUE, DELIVERED_CONDITION] },
  in_transit: { AND: [NOT_GRN_ISSUE, NOT_DELIVERED, IN_TRANSIT_MARKER_CONDITION] },
  booked: { AND: [NOT_GRN_ISSUE, NOT_DELIVERED, NOT_IN_TRANSIT_MARKER, BOOKED_CONDITION] },
  remaining: { AND: [NOT_GRN_ISSUE, NOT_DELIVERED, NOT_IN_TRANSIT_MARKER, NOT_BOOKED] },
};

/* ───────────────────────── Metric cards: one definition for the count and the list ───────────────────────── */

export const METRIC_KEYS = [
  "tracking_missing", "in_transit", "scheduled_today", "appointment_scheduled",
  "delivered", "grn_issues", "pending", "cancelled",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Conditions behind each dashboard metric; `null` for an unknown key. `todayStart`/`tomorrowStart` are IST. */
export function getMetricConditions(
  metric: string | null | undefined,
  window: { todayStart: Date; tomorrowStart: Date }
): Prisma.ConsignmentOrderWhereInput[] | null {
  switch (metric) {
    case "tracking_missing":
      return [
        { OR: [{ trackingId: null }, { trackingId: "" }] },
        { OR: [{ status: null }, { status: "" }, { status: { notIn: APPOINTMENT_CLOSED_ORDER_STATUSES } }] },
      ];
    case "in_transit":
      return [...APPOINTMENT_FILTER_CONDITIONS];
    case "scheduled_today":
      return [{ appointmentDate: { gte: window.todayStart, lt: window.tomorrowStart } }];
    case "appointment_scheduled":
      return [
        {
          OR: [
            { appointmentId: { not: null, notIn: [""] } },
            { appointmentDate: { not: null } },
            { courierStatus: { in: ["Appointment Scheduled", "appointment scheduled"] } },
          ],
        },
      ];
    case "delivered":
      return [DELIVERED_CONDITION];
    case "grn_issues":
      return [GRN_ISSUE_CONDITION];
    case "pending":
      return [
        {
          OR: [
            { courierStatus: null },
            { courierStatus: "" },
            { courierStatus: { in: ["Pending", "pending", "PENDING"] } },
            { status: null },
            { status: "" },
            { status: { in: ["Draft", "draft", "DRAFT", "Pending", "pending", "Scheduled", "InProgress", "In Progress", "New", "new"] } },
          ],
        },
        ...NOT_DISPATCHED_CONDITIONS,
      ];
    case "cancelled":
      return [
        {
          OR: [
            { status: { in: ["Cancelled", "cancelled", "CANCELLED", "CANCELED"] } },
            { courierStatus: { in: ["Cancelled", "cancelled", "CANCELLED"] } },
          ],
        },
      ];
    default:
      return null;
  }
}

/** Past Due (Golden Rule 9) as Prisma conditions; mirrors isPastDueOrder. */
export function getPastDueConditions(todayStartIst: Date): Prisma.ConsignmentOrderWhereInput[] {
  return [{ pickupDate: { lt: todayStartIst } }, ...NOT_DISPATCHED_CONDITIONS];
}

/* ───────────────────────── PATCH /api/orders/[id] status rules ───────────────────────── */

/**
 * The only shipment milestones this app writes, and only to courierStatus (never to status).
 * In Transit / pickupDone come only from the main app's BoxTrace dual-scan gate; Delivered only
 * from POST /api/orders/[id]/deliver with a POD; GRN Issue only from the main app's GRN desk;
 * cancellation only from the main app with an Admin OTP.
 */
export const APP2_COURIER_MILESTONES = ["Pending", "Tracking Assigned", "Appointment Scheduled"] as const;

export type StatusPatchResult =
  | { ok: true; courierStatus?: string }
  | { ok: false; httpStatus: number; code: string; error: string };

function refusalForTarget(target: string): StatusPatchResult | null {
  const t = target.toLowerCase();
  if (t === "grn issue" || t === "shortage" || t === "damaged") {
    return { ok: false, httpStatus: 400, code: "GRN_VIA_MAIN_APP", error: "GRN issues are raised in the main consignment app's GRN desk, not here." };
  }
  if (t === "cancelled" || t === "canceled") {
    return { ok: false, httpStatus: 400, code: "CANCEL_VIA_MAIN_APP", error: "Orders are cancelled only in the main consignment app (Admin OTP)." };
  }
  if (t === "delivered") {
    return { ok: false, httpStatus: 400, code: "POD_REQUIRED", error: "Use Mark Delivered and upload the POD (proof of delivery) to mark this order Delivered." };
  }
  if (t === "in transit" || t === "dispatched" || t === "shipped") {
    return { ok: false, httpStatus: 400, code: "DISPATCH_VIA_BOXTRACE", error: "In Transit is set only by the BoxTrace dual-scan dispatch gate in the main consignment app." };
  }
  return null;
}

/** Validates the status-related fields of a PATCH body against the loaded order. Pure. */
export function evaluateStatusPatch(
  existing: OrderStageFields,
  body: Record<string, unknown>
): StatusPatchResult {
  if (body.grnStatus !== undefined || body.grnReport !== undefined) {
    return { ok: false, httpStatus: 400, code: "GRN_VIA_MAIN_APP", error: "GRN fields are managed by the main consignment app's GRN desk." };
  }
  if (body.pickupDone !== undefined && body.pickupDone !== null && Boolean(body.pickupDone) !== Boolean(existing.pickupDone)) {
    return { ok: false, httpStatus: 400, code: "DISPATCH_VIA_BOXTRACE", error: "Pickup / In Transit is recorded only by the BoxTrace dual-scan dispatch gate in the main consignment app." };
  }

  // The order status belongs to the main app: an unchanged / empty value is ignored, any change refused.
  if (body.status !== undefined && body.status !== null) {
    const target = String(body.status).trim();
    if (target && lc(target) !== lc(existing.status)) {
      return (
        refusalForTarget(target) || {
          ok: false, httpStatus: 400, code: "STATUS_VIA_MAIN_APP",
          error: "The order status is managed by the main consignment app. Update the shipment milestone instead.",
        }
      );
    }
  }

  if (body.courierStatus !== undefined) {
    const target = body.courierStatus === null ? "" : String(body.courierStatus).trim();
    if (lc(target) === lc(existing.courierStatus)) return { ok: true };
    const refused = refusalForTarget(target);
    if (refused) return refused;
    if (isClosedOrder(existing)) {
      return {
        ok: false, httpStatus: 409, code: "ORDER_CLOSED",
        error: `This order is already "${existing.status || existing.courierStatus}"; its shipment milestone can no longer change here.`,
      };
    }
    const milestone = APP2_COURIER_MILESTONES.find((m) => m.toLowerCase() === target.toLowerCase());
    if (!milestone) {
      return {
        ok: false, httpStatus: 400, code: "INVALID_COURIER_STATUS",
        error: `Shipment status must be one of: ${APP2_COURIER_MILESTONES.join(", ")}.`,
      };
    }
    return { ok: true, courierStatus: milestone };
  }
  return { ok: true };
}

/**
 * Helper to build complete WHERE clause for booking orders
 */
export function getBookingWhereInput(additionalWhere?: Prisma.ConsignmentOrderWhereInput): Prisma.ConsignmentOrderWhereInput {
  return {
    AND: [
      BASE_ORDER_WHERE,
      ...BOOKING_FILTER_CONDITIONS,
      ...(additionalWhere ? [additionalWhere] : []),
    ],
  };
}

/**
 * Helper to build complete WHERE clause for appointment (in-transit) orders
 */
export function getAppointmentWhereInput(additionalWhere?: Prisma.ConsignmentOrderWhereInput): Prisma.ConsignmentOrderWhereInput {
  return {
    AND: [
      BASE_ORDER_WHERE,
      ...APPOINTMENT_FILTER_CONDITIONS,
      ...(additionalWhere ? [additionalWhere] : []),
    ],
  };
}
