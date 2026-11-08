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
      isDeleted: { not: true },
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
        where: baseWhere,
      }),

      // Tracking missing (not cancelled, not delivered, missing trackingId)
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          OR: [{ trackingId: null }, { trackingId: "" }],
          AND: [
            {
              status: {
                notIn: ["Cancelled", "CANCELLED", "Delivered", "DELIVERED", "Archive", "ARCHIVED"],
              },
            },
          ],
        },
      }),

      // In transit
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          OR: [
            { courierStatus: { in: ["In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched", "SHIPPED"] } },
            { status: { in: ["In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched"] } },
            {
              AND: [
                { pickupDone: true },
                {
                  NOT: {
                    courierStatus: { in: ["Delivered", "delivered", "DELIVERED"] },
                  },
                },
              ],
            },
          ],
        },
      }),

      // Appointment scheduled
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          OR: [
            { appointmentId: { not: null, notIn: [""] } },
            { appointmentDate: { not: null } },
            { courierStatus: { in: ["Appointment Scheduled", "appointment scheduled"] } },
          ],
        },
      }),

      // Scheduled today
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          appointmentDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      }),

      // Delivered
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          OR: [
            { courierStatus: { in: ["Delivered", "delivered", "DELIVERED"] } },
            { status: { in: ["Delivered", "delivered", "DELIVERED", "COMPLETED", "Completed"] } },
          ],
        },
      }),

      // GRN Issues
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          OR: [
            { grnStatus: { contains: "issue", mode: "insensitive" } },
            { status: { contains: "grn issue", mode: "insensitive" } },
            { courierStatus: { contains: "grn issue", mode: "insensitive" } },
          ],
        },
      }),

      // Pending
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          AND: [
            {
              OR: [
                { courierStatus: null },
                { courierStatus: "" },
                { courierStatus: { in: ["Pending", "pending", "PENDING"] } },
                { status: { in: ["Draft", "draft", "DRAFT", "Pending", "pending", "Scheduled", "InProgress", "In Progress", "New", "new"] } },
              ],
            },
            {
              status: {
                notIn: ["Delivered", "delivered", "DELIVERED", "Cancelled", "CANCELLED", "Archive", "ARCHIVED"],
              },
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
          ...baseWhere,
          OR: [
            { status: { in: ["Cancelled", "cancelled", "CANCELLED", "CANCELED"] } },
            { courierStatus: { in: ["Cancelled", "cancelled", "CANCELLED"] } },
          ],
        },
      }),

      // Channels breakdown
      db.consignmentOrder.groupBy({
        by: ["channel"],
        where: baseWhere,
        _count: { id: true },
      }),

      // Distinct warehouse names
      db.consignmentOrder.findMany({
        where: { ...baseWhere, warehouseName: { not: null } },
        select: { warehouseName: true },
        distinct: ["warehouseName"],
      }),
    ]);

    const channelCounts: Record<string, number> = {};
    for (const g of (channelGroups as Array<{ channel: string; _count: { id: number } }>)) {
      if (g.channel) {
        const canonical = normalizeChannelCode(g.channel);
        if (canonical) {
          channelCounts[canonical] = (channelCounts[canonical] || 0) + g._count.id;
        }
        channelCounts[g.channel.toUpperCase()] = (channelCounts[g.channel.toUpperCase()] || 0) + g._count.id;
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
