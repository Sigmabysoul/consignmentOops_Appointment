import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

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
    ] = await Promise.all([
      // Total orders
      db.consignmentOrder.count({
        where: baseWhere,
      }),

      // Tracking missing (not cancelled, not draft, not delivered, missing trackingId)
      db.consignmentOrder.count({
        where: {
          ...baseWhere,
          OR: [{ trackingId: null }, { trackingId: "" }],
          AND: [
            {
              status: {
                notIn: ["Draft", "DRAFT", "Cancelled", "CANCELLED", "Delivered", "DELIVERED", "Archive", "ARCHIVED"],
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
          OR: [
            { courierStatus: { in: ["Pending", "pending", "PENDING"] } },
            { courierStatus: null },
            { status: { in: ["Pending", "pending", "Scheduled", "InProgress", "In Progress", "New"] } },
          ],
          AND: [
            {
              NOT: {
                OR: [
                  { courierStatus: { in: ["Delivered", "delivered", "In Transit", "in transit"] } },
                  { status: { in: ["Delivered", "delivered", "In Transit", "Cancelled"] } },
                ],
              },
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
    ]);

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
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load dashboard statistics" },
      { status: 500 }
    );
  }
}
