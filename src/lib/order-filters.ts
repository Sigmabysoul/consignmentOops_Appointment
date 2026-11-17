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

/**
 * Filter conditions for the Booking Desk:
 * Rule 3: Only show orders when packaging slip is marked printed by printing team
 * Rule 2: In-transit orders move to appointment desk, so exclude in-transit / dispatched / delivered / cancelled
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
  {
    pickupDone: false,
  },
  {
    OR: [
      { courierStatus: null },
      { courierStatus: "" },
      {
        courierStatus: {
          notIn: [
            "In Transit",
            "in transit",
            "IN TRANSIT",
            "Dispatched",
            "dispatched",
            "SHIPPED",
            "shipped",
            "Delivered",
            "delivered",
            "DELIVERED",
            "Cancelled",
            "cancelled",
          ],
        },
      },
    ],
  },
  {
    OR: [
      { status: null },
      { status: "" },
      {
        status: {
          notIn: [
            "In Transit",
            "in transit",
            "IN TRANSIT",
            "Dispatched",
            "dispatched",
            "Delivered",
            "delivered",
            "DELIVERED",
            "Cancelled",
            "CANCELLED",
            "Archive",
            "ARCHIVED",
          ],
        },
      },
    ],
  },
];

/**
 * Filter conditions for the Appointment Desk:
 * Rule 2: Only orders that have been in transit / dispatched / shipped
 * Exclude delivered and cancelled orders
 */
export const APPOINTMENT_FILTER_CONDITIONS: Prisma.ConsignmentOrderWhereInput[] = [
  {
    OR: [
      {
        courierStatus: {
          in: [
            "In Transit",
            "in transit",
            "IN TRANSIT",
            "Dispatched",
            "dispatched",
            "SHIPPED",
            "shipped",
          ],
        },
      },
      {
        status: {
          in: [
            "In Transit",
            "in transit",
            "IN TRANSIT",
            "Dispatched",
            "dispatched",
          ],
        },
      },
      { pickupDone: true },
      {
        customData: {
          path: ["fulfilmentStatus"],
          equals: "Dispatched",
        },
      },
    ],
  },
  {
    OR: [
      { status: null },
      { status: "" },
      {
        status: {
          notIn: [
            "Cancelled",
            "CANCELLED",
            "Archive",
            "ARCHIVED",
            "Delivered",
            "delivered",
            "DELIVERED",
          ],
        },
      },
    ],
  },
  {
    OR: [
      { courierStatus: null },
      { courierStatus: "" },
      {
        courierStatus: {
          notIn: [
            "Cancelled",
            "CANCELLED",
            "Delivered",
            "delivered",
            "DELIVERED",
          ],
        },
      },
    ],
  },
];

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
