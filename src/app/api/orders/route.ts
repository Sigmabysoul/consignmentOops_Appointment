import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveTrackingUrl } from "@/lib/tracking-utils";

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

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "25", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const tab = (searchParams.get("tab") || "all").toLowerCase().trim();
    const channel = searchParams.get("channel")?.trim();
    const courier = searchParams.get("courier")?.trim();
    const statusFilter = searchParams.get("courierStatus")?.trim();
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortDir = (searchParams.get("sortDir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    const whereConditions: any = {
      isDeleted: { not: true },
    };

    // Tab filter conditions
    if (tab === "pending") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
        OR: [
          { courierStatus: { in: ["Pending", "pending", "PENDING"] } },
          { courierStatus: null },
          { status: { in: ["Pending", "pending", "Scheduled", "InProgress", "In Progress", "New"] } },
        ],
        NOT: {
          OR: [
            { courierStatus: { in: ["Delivered", "delivered", "In Transit", "in transit"] } },
            { status: { in: ["Delivered", "delivered", "In Transit", "Cancelled"] } },
          ],
        },
      });
    } else if (tab === "tracking_missing" || tab === "missing_tracking") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
        OR: [{ trackingId: null }, { trackingId: "" }],
        status: {
          notIn: ["Draft", "DRAFT", "Cancelled", "CANCELLED", "Delivered", "DELIVERED", "Archive", "ARCHIVED"],
        },
      });
    } else if (tab === "in_transit") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
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
      });
    } else if (tab === "appointments" || tab === "appointment_scheduled") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
        OR: [
          { appointmentId: { not: null, notIn: [""] } },
          { appointmentDate: { not: null } },
          { courierStatus: { in: ["Appointment Scheduled", "appointment scheduled"] } },
        ],
      });
    } else if (tab === "delivered") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
        OR: [
          { courierStatus: { in: ["Delivered", "delivered", "DELIVERED"] } },
          { status: { in: ["Delivered", "delivered", "DELIVERED", "COMPLETED", "Completed"] } },
        ],
      });
    } else if (tab === "grn_issues" || tab === "grn_issue") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
        OR: [
          { grnStatus: { contains: "issue", mode: "insensitive" } },
          { status: { contains: "grn issue", mode: "insensitive" } },
          { courierStatus: { contains: "grn issue", mode: "insensitive" } },
        ],
      });
    } else if (tab === "cancelled") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
        OR: [
          { status: { in: ["Cancelled", "cancelled", "CANCELLED", "CANCELED"] } },
          { courierStatus: { in: ["Cancelled", "cancelled", "CANCELLED"] } },
        ],
      });
    }

    // Channel filter
    if (channel && channel !== "ALL") {
      whereConditions.channel = { equals: channel, mode: "insensitive" };
    }

    // Courier filter
    if (courier && courier !== "ALL") {
      whereConditions.courierPartner = { equals: courier, mode: "insensitive" };
    }

    // Specific Status filter
    if (statusFilter && statusFilter !== "ALL") {
      whereConditions.courierStatus = { equals: statusFilter, mode: "insensitive" };
    }

    // Text Search
    if (search) {
      whereConditions.OR = [
        { roPoNumber: { contains: search, mode: "insensitive" } },
        { trackingId: { contains: search, mode: "insensitive" } },
        { appointmentId: { contains: search, mode: "insensitive" } },
        { invoiceNo: { contains: search, mode: "insensitive" } },
        { warehouseName: { contains: search, mode: "insensitive" } },
        { itemName: { contains: search, mode: "insensitive" } },
      ];
    }

    // Sorting definition
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "roPoNumber",
      "orderDate",
      "appointmentDate",
      "deliveryDate",
      "pickupDate",
      "channel",
      "courierStatus",
      "status",
    ];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    // Query DB in parallel for count and rows
    const [total, orders, courierPresets] = await Promise.all([
      db.consignmentOrder.count({ where: whereConditions }),
      db.consignmentOrder.findMany({
        where: whereConditions,
        orderBy: { [orderField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              code: true,
              city: true,
            },
          },
          items: {
            select: {
              id: true,
              itemName: true,
              totalQty: true,
              boxCount: true,
            },
          },
        },
      }),
      db.courierPreset.findMany({
        where: { isActive: true },
        select: { name: true, urlName: true, trackingUrlPattern: true },
      }),
    ]);

    // Enrich orders with generated trackingLink if missing
    const enrichedOrders = orders.map((order) => {
      const computedLink =
        order.trackingLink ||
        resolveTrackingUrl(order.courierPartner, order.trackingId, null, courierPresets);

      return {
        ...order,
        trackingLink: computedLink,
      };
    });

    return NextResponse.json({
      orders: enrichedOrders,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
