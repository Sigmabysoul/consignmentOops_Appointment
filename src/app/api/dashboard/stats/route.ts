import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeChannelCode } from "@/lib/channel-aliases";

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
        where: {
          AND: [
            ...baseWhere.AND,
            {
              OR: [
                { courierStatus: { in: ["In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched", "SHIPPED", "shipped"] } },
                { status: { in: ["In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched"] } },
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
              status: { notIn: ["Cancelled", "CANCELLED", "Archive", "ARCHIVED", "Delivered", "delivered", "DELIVERED"] },
              courierStatus: { notIn: ["Cancelled", "CANCELLED", "Delivered", "delivered", "DELIVERED"] },
            },
          ],
        },
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

      // Channels breakdown
      db.consignmentOrder.groupBy({
        by: ["channel"],
        where: { AND: baseWhere.AND },
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

    const channelCounts: Record<string, number> = {};
    for (const g of (channelGroups as Array<{ channel: string; _count: { id: number } }>)) {
      if (g.channel) {
        const canonical = normalizeChannelCode(g.channel);
        const key = canonical || g.channel.toUpperCase();
        channelCounts[key] = (channelCounts[key] || 0) + g._count.id;
      }
    }

    const warehouseList = (warehousesRaw as Array<{ warehouseName: string | null }>)
      .map((w) => w.warehouseName?.trim())
      .filter((w): w is string => Boolean(w && w.length > 0))
      .sort();

    return NextResponse.json({
      stats: {
        totalOrders,
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
