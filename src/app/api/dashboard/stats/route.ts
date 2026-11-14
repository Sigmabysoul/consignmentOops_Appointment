import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeChannelCode } from "@/lib/channel-aliases";
import {
  BOOKING_FILTER_CONDITIONS,
  APPOINTMENT_FILTER_CONDITIONS,
} from "@/lib/order-filters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.isLogisticsAuthorized) {
      return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const baseWhere = {
      AND: [
        {
          OR: [{ isDeleted: false }, { isDeleted: null }],
        },
      ],
    };

    // Booking Desk specific query filter:
    // Only orders whose packaging slip is marked printed, not in transit / delivered / cancelled
    const bookingWhere = {
      AND: [
        ...baseWhere.AND,
        ...BOOKING_FILTER_CONDITIONS,
      ],
    };

    // Appointment Desk specific query filter:
    // Only orders that are in transit / dispatched, not delivered / cancelled
    const appointmentWhere = {
      AND: [
        ...baseWhere.AND,
        ...APPOINTMENT_FILTER_CONDITIONS,
      ],
    };

    // Calculate metrics using parallel queries for optimal speed
    const [
      totalOrders,
      trackingMissing,
      inTransit,
      appointmentScheduled,
      scheduledToday,
      delivered,
      grnIssues,
      pending,
      cancelled,
      channelGroups,
      bookingCount,
      bookingGroups,
      appointmentCount,
      appointmentGroups,
      warehousesRaw,
    ] = await Promise.all([
      // Total orders
      db.consignmentOrder.count({
        where: { AND: baseWhere.AND },
      }),

      // Tracking missing (not cancelled, not delivered, missing trackingId)
      db.consignmentOrder.count({
        where: {
          AND: [
            ...baseWhere.AND,
            { OR: [{ trackingId: null }, { trackingId: "" }] },
            {
              OR: [
                { status: null },
                { status: "" },
                {
                  status: {
                    notIn: ["Cancelled", "CANCELLED", "Delivered", "DELIVERED", "Archive", "ARCHIVED"],
                  },
                },
              ],
            },
          ],
        },
      }),

      // In transit (Appointment Desk)
      db.consignmentOrder.count({
        where: appointmentWhere,
      }),

      // Appointment scheduled
      db.consignmentOrder.count({
        where: {
          AND: [
            ...baseWhere.AND,
            {
              OR: [
                { appointmentId: { not: null, notIn: [""] } },
                { appointmentDate: { not: null } },
                { courierStatus: { in: ["Appointment Scheduled", "appointment scheduled"] } },
              ],
            },
          ],
        },
      }),

      // Scheduled today
      db.consignmentOrder.count({
        where: {
          AND: [
            ...baseWhere.AND,
            {
              appointmentDate: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
          ],
        },
      }),

      // Delivered
      db.consignmentOrder.count({
        where: {
          AND: [
            ...baseWhere.AND,
            {
              OR: [
                { courierStatus: { in: ["Delivered", "delivered", "DELIVERED"] } },
                { status: { in: ["Delivered", "delivered", "DELIVERED", "COMPLETED", "Completed"] } },
              ],
            },
          ],
        },
      }),

      // GRN Issues
      db.consignmentOrder.count({
        where: {
          AND: [
            ...baseWhere.AND,
            {
              OR: [
                { grnStatus: { contains: "issue", mode: "insensitive" } },
                { status: { contains: "grn issue", mode: "insensitive" } },
                { courierStatus: { contains: "grn issue", mode: "insensitive" } },
              ],
            },
          ],
        },
      }),

      // Pending
      db.consignmentOrder.count({
        where: {
          AND: [
            ...baseWhere.AND,
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
            {
              OR: [
                { status: null },
                { status: "" },
                {
                  status: {
                    notIn: ["Delivered", "delivered", "DELIVERED", "Cancelled", "CANCELLED", "Archive", "ARCHIVED"],
                  },
                },
              ],
            },
            {
              OR: [
                { courierStatus: null },
                { courierStatus: "" },
                { courierStatus: { notIn: ["Delivered", "delivered", "DELIVERED", "In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched", "Cancelled", "cancelled"] } },
              ],
            },
          ],
        },
      }),

      // Cancelled
      db.consignmentOrder.count({
        where: {
          AND: [
            ...baseWhere.AND,
            {
              OR: [
                { status: { in: ["Cancelled", "cancelled", "CANCELLED", "CANCELED"] } },
                { courierStatus: { in: ["Cancelled", "cancelled", "CANCELLED"] } },
              ],
            },
          ],
        },
      }),

      // Channels breakdown (All Data)
      db.consignmentOrder.groupBy({
        by: ["channel"],
        where: { AND: baseWhere.AND },
        _count: { id: true },
      }),

      // Booking Desk: Total count
      db.consignmentOrder.count({
        where: bookingWhere,
      }),

      // Booking Desk: Channels breakdown
      db.consignmentOrder.groupBy({
        by: ["channel"],
        where: bookingWhere,
        _count: { id: true },
      }),

      // Appointment Desk: Total count (same as inTransit)
      db.consignmentOrder.count({
        where: appointmentWhere,
      }),

      // Appointment Desk: Channels breakdown
      db.consignmentOrder.groupBy({
        by: ["channel"],
        where: appointmentWhere,
        _count: { id: true },
      }),

      // Distinct warehouse names
      db.consignmentOrder.findMany({
        where: {
          AND: [
            ...baseWhere.AND,
            { warehouseName: { not: null } },
          ],
        },
        select: { warehouseName: true },
        distinct: ["warehouseName"],
      }),
    ]);

    // Channel counts for All Data
    const channelCounts: Record<string, number> = {};
    for (const g of (channelGroups as Array<{ channel: string; _count: { id: number } }>)) {
      if (g.channel) {
        const canonical = normalizeChannelCode(g.channel);
        const key = canonical || g.channel.toUpperCase();
        channelCounts[key] = (channelCounts[key] || 0) + g._count.id;
      }
    }

    // Channel counts for Booking Desk
    const bookingChannelCounts: Record<string, number> = {};
    for (const g of (bookingGroups as Array<{ channel: string; _count: { id: number } }>)) {
      if (g.channel) {
        const canonical = normalizeChannelCode(g.channel);
        const key = canonical || g.channel.toUpperCase();
        bookingChannelCounts[key] = (bookingChannelCounts[key] || 0) + g._count.id;
      }
    }

    // Channel counts for Appointment Desk
    const appointmentChannelCounts: Record<string, number> = {};
    for (const g of (appointmentGroups as Array<{ channel: string; _count: { id: number } }>)) {
      if (g.channel) {
        const canonical = normalizeChannelCode(g.channel);
        const key = canonical || g.channel.toUpperCase();
        appointmentChannelCounts[key] = (appointmentChannelCounts[key] || 0) + g._count.id;
      }
    }

    const warehouseList = (warehousesRaw as Array<{ warehouseName: string | null }>)
      .map((w) => w.warehouseName?.trim())
      .filter((w): w is string => Boolean(w && w.length > 0))
      .sort();

    const tabParam = req.nextUrl.searchParams.get("tab")?.toLowerCase()?.trim() || "";
    let activeTotalCount = totalOrders;
    let activeChannelCounts = channelCounts;

    if (tabParam === "booking") {
      activeTotalCount = bookingCount;
      activeChannelCounts = bookingChannelCounts;
    } else if (tabParam === "appointment") {
      activeTotalCount = appointmentCount;
      activeChannelCounts = appointmentChannelCounts;
    }

    return NextResponse.json({
      stats: {
        totalOrders,
        bookingCount,
        appointmentCount,
        bookingChannelCounts,
        appointmentChannelCounts,
        activeTotalCount,
        activeChannelCounts,
        trackingMissing,
        inTransit,
        appointmentScheduled,
        scheduledToday,
        delivered,
        grnIssues,
        pending,
        cancelled,
        channelCounts,
        warehouses: Array.from(new Set(warehouseList)),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load dashboard statistics" },
      { status: 500 }
    );
  }
}
