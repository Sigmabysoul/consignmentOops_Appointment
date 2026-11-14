import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractBoxDimensionGroups } from "@/lib/dimension-helper";
import { getChannelAliases } from "@/lib/channel-aliases";
import { getAppointmentNotesMap } from "@/lib/appointment-notes";
import { getEffectiveCourierPartner } from "@/lib/courier-defaults";
import {
  BOOKING_FILTER_CONDITIONS,
  APPOINTMENT_FILTER_CONDITIONS,
} from "@/lib/order-filters";
import { parseDateInput } from "@/lib/date-utils";

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
    const warehouse = searchParams.get("warehouse")?.trim();
    const quickDate = searchParams.get("quickDate")?.trim();
    const statusFilter = searchParams.get("courierStatus")?.trim();
    const deliveryFilter = searchParams.get("deliveryStatus")?.trim();
    const dateType = (searchParams.get("dateType") || "appointmentDate").trim();
    const startDate = searchParams.get("startDate")?.trim();
    const endDate = searchParams.get("endDate")?.trim();
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortDir = (searchParams.get("sortDir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    const whereConditions: any = {
      AND: [
        {
          OR: [{ isDeleted: false }, { isDeleted: null }],
        },
      ],
    };

    // Tab filter conditions
    if (tab === "booking") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push(...BOOKING_FILTER_CONDITIONS);
    } else if (tab === "appointment") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push(...APPOINTMENT_FILTER_CONDITIONS);
    } else if (tab === "pending") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push(
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
            { status: { notIn: ["Delivered", "delivered", "DELIVERED", "Cancelled", "CANCELLED", "Archive", "ARCHIVED"] } },
          ],
        },
        {
          OR: [
            { courierStatus: null },
            { courierStatus: "" },
            { courierStatus: { notIn: ["Delivered", "delivered", "DELIVERED", "In Transit", "in transit", "IN TRANSIT", "Dispatched", "dispatched", "Cancelled", "cancelled"] } },
          ],
        }
      );
    } else if (tab === "tracking_missing" || tab === "missing_tracking") {
      whereConditions.AND = whereConditions.AND || [];
      whereConditions.AND.push({
        OR: [{ trackingId: null }, { trackingId: "" }],
        AND: [
          {
            OR: [
              { status: null },
              { status: "" },
              { status: { notIn: ["Cancelled", "CANCELLED", "Delivered", "DELIVERED", "Archive", "ARCHIVED"] } },
            ],
          },
        ],
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

    // Channel filter (with multi-alias and legacy platform support)
    if (channel && channel !== "ALL") {
      const aliases = getChannelAliases(channel);
      whereConditions.channel = { in: aliases, mode: "insensitive" };
    }

    // Courier filter
    if (courier && courier !== "ALL") {
      whereConditions.courierPartner = { equals: courier, mode: "insensitive" };
    }

    // Warehouse filter
    if (warehouse && warehouse !== "ALL") {
      whereConditions.warehouseName = { contains: warehouse, mode: "insensitive" };
    }

    // Specific Status filter
    if (statusFilter && statusFilter !== "ALL") {
      if (statusFilter.toLowerCase() === "pending") {
        whereConditions.AND = whereConditions.AND || [];
        whereConditions.AND.push({
          OR: [
            { courierStatus: null },
            { courierStatus: "" },
            { courierStatus: { in: ["Pending", "pending", "PENDING"] } },
            { status: null },
            { status: "" },
            { status: { in: ["Draft", "draft", "DRAFT", "Pending", "pending", "New", "new"] } },
          ],
        });
      } else {
        whereConditions.courierStatus = { equals: statusFilter, mode: "insensitive" };
      }
    }

    // Delivery Status filter
    if (deliveryFilter && deliveryFilter !== "ALL") {
      const df = deliveryFilter.toUpperCase();
      if (df === "DELIVERED") {
        whereConditions.AND = whereConditions.AND || [];
        whereConditions.AND.push({
          OR: [
            { courierStatus: { in: ["Delivered", "delivered", "DELIVERED"] } },
            { deliveryDate: { not: null } },
          ],
        });
      } else if (df === "IN_TRANSIT" || df === "IN TRANSIT") {
        whereConditions.courierStatus = { in: ["In Transit", "in transit", "IN TRANSIT"] };
      } else if (df === "PENDING") {
        whereConditions.AND = whereConditions.AND || [];
        whereConditions.AND.push({
          NOT: {
            OR: [
              { courierStatus: { in: ["Delivered", "delivered", "DELIVERED"] } },
              { deliveryDate: { not: null } },
            ],
          },
        });
      }
    }

    // In booking section all the filter will be based on pickup date, and in appointment section on appointment date
    const effectiveDateType =
      tab === "booking"
        ? (dateType === "pickupDate" || !dateType || dateType === "appointmentDate" ? "pickupDate" : dateType)
        : tab === "appointment"
        ? (dateType === "appointmentDate" || !dateType || dateType === "pickupDate" ? "appointmentDate" : dateType)
        : (dateType || "appointmentDate");

    // Quick Date presets (Yesterday, Today's All, Tomorrow's All, This Week, Past Due / Overdue)
    if (quickDate && quickDate !== "all") {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

      whereConditions.AND = whereConditions.AND || [];

      if (tab === "booking") {
        // In booking section all filters are based on pickup date
        if (quickDate === "yesterday") {
          whereConditions.AND.push({ pickupDate: { gte: yesterdayStart, lte: yesterdayEnd } });
        } else if (quickDate === "today") {
          whereConditions.AND.push({ pickupDate: { gte: todayStart, lte: todayEnd } });
        } else if (quickDate === "tomorrow") {
          whereConditions.AND.push({ pickupDate: { gte: tomorrowStart, lte: tomorrowEnd } });
        } else if (quickDate === "this_week") {
          whereConditions.AND.push({ pickupDate: { gte: weekStart, lte: weekEnd } });
        } else if (quickDate === "overdue") {
          // Past due: order has passed its pickup date but haven't gotten in in-transit state
          whereConditions.AND.push(
            { pickupDate: { lt: todayStart } },
            { pickupDone: false },
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
            }
          );
        }
      } else if (tab === "appointment") {
        // In appointment section all filters are based on appointment date
        if (quickDate === "yesterday") {
          whereConditions.AND.push({ appointmentDate: { gte: yesterdayStart, lte: yesterdayEnd } });
        } else if (quickDate === "today") {
          whereConditions.AND.push({ appointmentDate: { gte: todayStart, lte: todayEnd } });
        } else if (quickDate === "tomorrow") {
          whereConditions.AND.push({ appointmentDate: { gte: tomorrowStart, lte: tomorrowEnd } });
        } else if (quickDate === "this_week") {
          whereConditions.AND.push({ appointmentDate: { gte: weekStart, lte: weekEnd } });
        } else if (quickDate === "overdue") {
          whereConditions.AND.push(
            { appointmentDate: { lt: todayStart } },
            {
              OR: [
                { status: null },
                { status: "" },
                { status: { notIn: ["Delivered", "delivered", "DELIVERED", "Cancelled", "CANCELLED", "Archive", "ARCHIVED"] } },
              ],
            },
            {
              OR: [
                { courierStatus: null },
                { courierStatus: "" },
                { courierStatus: { notIn: ["Delivered", "delivered", "DELIVERED", "Cancelled", "CANCELLED"] } },
              ],
            }
          );
        }
      } else {
        // General / Kanban / All Data views
        if (quickDate === "yesterday") {
          whereConditions.AND.push({
            OR: [
              { appointmentDate: { gte: yesterdayStart, lte: yesterdayEnd } },
              { pickupDate: { gte: yesterdayStart, lte: yesterdayEnd } },
              { deliveryDate: { gte: yesterdayStart, lte: yesterdayEnd } },
              { orderDate: { gte: yesterdayStart, lte: yesterdayEnd } },
            ],
          });
        } else if (quickDate === "today") {
          whereConditions.AND.push({
            OR: [
              { appointmentDate: { gte: todayStart, lte: todayEnd } },
              { pickupDate: { gte: todayStart, lte: todayEnd } },
              { deliveryDate: { gte: todayStart, lte: todayEnd } },
              { orderDate: { gte: todayStart, lte: todayEnd } },
            ],
          });
        } else if (quickDate === "tomorrow") {
          whereConditions.AND.push({
            OR: [
              { appointmentDate: { gte: tomorrowStart, lte: tomorrowEnd } },
              { pickupDate: { gte: tomorrowStart, lte: tomorrowEnd } },
              { deliveryDate: { gte: tomorrowStart, lte: tomorrowEnd } },
              { orderDate: { gte: tomorrowStart, lte: tomorrowEnd } },
            ],
          });
        } else if (quickDate === "this_week") {
          whereConditions.AND.push({
            OR: [
              { appointmentDate: { gte: weekStart, lte: weekEnd } },
              { pickupDate: { gte: weekStart, lte: weekEnd } },
              { deliveryDate: { gte: weekStart, lte: weekEnd } },
              { orderDate: { gte: weekStart, lte: weekEnd } },
            ],
          });
        } else if (quickDate === "overdue") {
          // Past due: order has passed its pickup date but haven't gotten in in-transit state
          whereConditions.AND.push(
            { pickupDate: { lt: todayStart } },
            { pickupDone: false },
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
            }
          );
        }
      }
    }

    // Date range filter
    if (startDate || endDate) {
      const validDateFields = ["pickupDate", "appointmentDate", "deliveryDate", "orderDate", "createdAt"];
      const targetDateField = validDateFields.includes(effectiveDateType)
        ? effectiveDateType
        : (tab === "booking" ? "pickupDate" : "appointmentDate");
      const dateRange: { gte?: Date; lte?: Date } = {};

      if (startDate) {
        const start = parseDateInput(startDate);
        if (start) {
          start.setHours(0, 0, 0, 0);
          dateRange.gte = start;
        }
      }
      if (endDate) {
        const end = parseDateInput(endDate);
        if (end) {
          end.setHours(23, 59, 59, 999);
          dateRange.lte = end;
        }
      }

      if (dateRange.gte || dateRange.lte) {
        whereConditions.AND = whereConditions.AND || [];
        whereConditions.AND.push({ [targetDateField]: dateRange });
      }
    }

    // Text Search
    if (search) {
      whereConditions.AND.push({
        OR: [
          { id: { equals: search } },
          { roPoNumber: { contains: search, mode: "insensitive" } },
          { trackingId: { contains: search, mode: "insensitive" } },
          { appointmentId: { contains: search, mode: "insensitive" } },
          { invoiceNo: { contains: search, mode: "insensitive" } },
          { warehouseName: { contains: search, mode: "insensitive" } },
          { itemName: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    // Sorting definition: include all sortable columns
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "roPoNumber",
      "orderDate",
      "appointmentDate",
      "deliveryDate",
      "pickupDate",
      "channel",
      "courierPartner",
      "warehouseName",
      "trackingId",
      "appointmentId",
      "invoiceNo",
      "boxCount",
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
              address: true,
            },
          },
          items: {
            select: {
              id: true,
              itemName: true,
              totalQty: true,
              boxCount: true,
              lengthCm: true,
              widthCm: true,
              heightCm: true,
              weightKg: true,
              remainderQty: true,
              remainderLengthCm: true,
              remainderWidthCm: true,
              remainderHeightCm: true,
              remainderWeightKg: true,
              boxDimensions: true,
            },
          },
          auditLogs: {
            orderBy: { timestamp: "desc" },
            take: 1,
            select: { userName: true, timestamp: true },
          },
          statusHistory: {
            orderBy: { timestamp: "desc" },
            take: 1,
            select: { userName: true, timestamp: true },
          },
        },
      }),
      db.courierPreset.findMany({
        where: { isActive: true },
        select: { name: true, urlName: true, trackingUrlPattern: true },
      }),
    ]);

    // Fetch personal internal notes isolated to Appointment application (safe self-healing)
    const orderIds = orders.map((o) => o.id);
    const notesMap = await getAppointmentNotesMap(orderIds);

    // Enrich orders with boxDimensionGroups, audit info, and isolated personal notes
    const enrichedOrders = orders.map((order) => {
      const boxDimensionGroups = extractBoxDimensionGroups(order);

      const latestUser =
        order.auditLogs?.[0]?.userName || order.statusHistory?.[0]?.userName || null;

      const isDelivered =
        (order.status || "").toLowerCase() === "delivered" ||
        (order.courierStatus || "").toLowerCase() === "delivered" ||
        !!order.deliveryDate;
      const isInTransit =
        (order.status || "").toLowerCase() === "in transit" ||
        (order.courierStatus || "").toLowerCase() === "in transit";
      const isGrnIssue =
        (order.status || "").toLowerCase().includes("issue") ||
        (order.grnStatus || "").toLowerCase().includes("issue") ||
        (order.courierStatus || "").toLowerCase().includes("issue");

      const computedDeliveryStatus = isGrnIssue
        ? "GRN Issue"
        : isDelivered
        ? "Delivered"
        : isInTransit
        ? "In Transit"
        : "Pending";

      const noteItem = notesMap.get(order.id);
      const effectiveCourier = getEffectiveCourierPartner(order.channel, order.courierPartner);

      return {
        ...order,
        courierPartner: effectiveCourier,
        boxDimensionGroups,
        trackingLink: order.trackingLink || null, // No automatic external URL generation
        lastUpdatedBy: latestUser,
        deliveryStatus: computedDeliveryStatus,
        personalNote: noteItem?.note || null,
        personalNoteUpdatedAt: noteItem?.updatedAt ? noteItem.updatedAt.toISOString() : null,
        personalNoteUpdatedBy: noteItem?.updatedBy || null,
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
