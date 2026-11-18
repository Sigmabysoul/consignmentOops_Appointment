import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toClientOrder } from "@/lib/order-redaction";
import { db } from "@/lib/db";
import { extractBoxDimensionGroups } from "@/lib/dimension-helper";
import { getChannelAliases } from "@/lib/channel-aliases";
import { getAppointmentNotesMap } from "@/lib/appointment-notes";
import { getEffectiveCourierPartner, getCourierSpellings } from "@/lib/courier-defaults";
import {
  BOOKING_FILTER_CONDITIONS,
  APPOINTMENT_FILTER_CONDITIONS,
  APPOINTMENT_APP_VISIBILITY,
  DELIVERED_STATUSES,
  KANBAN_STAGES,
  KANBAN_STAGE_CONDITIONS,
  getMetricConditions,
  getPastDueConditions,
  getKanbanStage,
  hasInTransitMarker,
  isDeliveredOrder,
  isGrnIssueOrder,
} from "@/lib/order-filters";
import { getIstQuickDateWindows, istDayRangeFromInput } from "@/lib/date-utils";

/** Kanban loads each column separately (no 100-row page cap); each column shows at most this many cards. */
const KANBAN_COLUMN_LIMIT = 200;

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
    const metric = searchParams.get("metric")?.trim() || "";
    const dateType = (searchParams.get("dateType") || "appointmentDate").trim();
    const startDate = searchParams.get("startDate")?.trim();
    const endDate = searchParams.get("endDate")?.trim();
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortDir = (searchParams.get("sortDir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    // Drafts, New, cancelled and archived orders never reach the Appointment app
    const whereConditions: any = {
      AND: [...APPOINTMENT_APP_VISIBILITY] as any[],
    };

    const quickWindows = getIstQuickDateWindows();
    const metricWindow = { todayStart: quickWindows.todayStart, tomorrowStart: quickWindows.tomorrowStart };

    // Tab filter conditions. The metric-style tabs use exactly the dashboard card's conditions.
    const TAB_METRIC_ALIASES: Record<string, string> = {
      pending: "pending",
      tracking_missing: "tracking_missing",
      missing_tracking: "tracking_missing",
      in_transit: "in_transit",
      appointments: "appointment_scheduled",
      appointment_scheduled: "appointment_scheduled",
      delivered: "delivered",
      grn_issues: "grn_issues",
      grn_issue: "grn_issues",
      cancelled: "cancelled",
    };
    if (tab === "booking") {
      whereConditions.AND.push(...BOOKING_FILTER_CONDITIONS);
    } else if (tab === "appointment") {
      whereConditions.AND.push(...APPOINTMENT_FILTER_CONDITIONS);
    } else if (TAB_METRIC_ALIASES[tab]) {
      whereConditions.AND.push(...(getMetricConditions(TAB_METRIC_ALIASES[tab], metricWindow) || []));
    }

    // Dashboard metric card drill-down: the list uses the very conditions its count uses
    if (metric) {
      const metricConditions = getMetricConditions(metric, metricWindow);
      if (metricConditions) whereConditions.AND.push(...metricConditions);
    }

    // Channel filter (with multi-alias and legacy platform support)
    if (channel && channel !== "ALL") {
      const aliases = getChannelAliases(channel);
      whereConditions.channel = { in: aliases, mode: "insensitive" };
    }

    // Courier filter (any stored spelling: "Delhivery" / "Delhivery One", "Om Logistics" / "OM Logistics" …)
    if (courier && courier !== "ALL") {
      whereConditions.courierPartner = { in: getCourierSpellings(courier), mode: "insensitive" };
    }

    // Warehouse filter
    if (warehouse && warehouse !== "ALL") {
      whereConditions.warehouseName = { contains: warehouse, mode: "insensitive" };
    }

    // Specific shipment-status filter (ANDed, so it combines with the delivery-state filter)
    if (statusFilter && statusFilter !== "ALL") {
      if (statusFilter.toLowerCase() === "pending") {
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
        whereConditions.AND.push({ courierStatus: { equals: statusFilter, mode: "insensitive" } });
      }
    }

    // Delivery-state filter. Delivered comes from the status written with the POD, never deliveryDate alone.
    if (deliveryFilter && deliveryFilter !== "ALL") {
      const df = deliveryFilter.toUpperCase();
      if (df === "DELIVERED") {
        whereConditions.AND.push(...(getMetricConditions("delivered", metricWindow) || []));
      } else if (df === "IN_TRANSIT" || df === "IN TRANSIT") {
        whereConditions.AND.push(...APPOINTMENT_FILTER_CONDITIONS);
      } else if (df === "PENDING") {
        whereConditions.AND.push(
          { OR: [{ status: null }, { status: { notIn: DELIVERED_STATUSES } }] },
          { OR: [{ courierStatus: null }, { courierStatus: { notIn: DELIVERED_STATUSES } }] }
        );
      }
    }

    // In booking section all the filter will be based on pickup date, and in appointment section on appointment date
    const effectiveDateType =
      tab === "booking"
        ? (dateType === "pickupDate" || !dateType || dateType === "appointmentDate" ? "pickupDate" : dateType)
        : tab === "appointment"
        ? (dateType === "appointmentDate" || !dateType || dateType === "pickupDate" ? "appointmentDate" : dateType)
        : (dateType || "appointmentDate");

    // Quick Date presets on IST business days (Yesterday, Today, Tomorrow, This Week, Past Due).
    // Every window is [start, end) — "This Week" ends before next Sunday 00:00 IST.
    if (quickDate && quickDate !== "all") {
      const w = quickWindows;
      const range =
        quickDate === "yesterday"
          ? { gte: w.yesterdayStart, lt: w.todayStart }
          : quickDate === "today"
          ? { gte: w.todayStart, lt: w.tomorrowStart }
          : quickDate === "tomorrow"
          ? { gte: w.tomorrowStart, lt: w.dayAfterTomorrowStart }
          : quickDate === "this_week"
          ? { gte: w.weekStart, lt: w.weekEnd }
          : null;

      if (tab === "booking") {
        // In booking section all filters are based on pickup date
        if (range) whereConditions.AND.push({ pickupDate: range });
        // Past due: pickup date before today (IST) and not yet in transit
        else if (quickDate === "overdue") whereConditions.AND.push(...getPastDueConditions(w.todayStart));
      } else if (tab === "appointment") {
        // In appointment section all filters are based on appointment date
        if (range) whereConditions.AND.push({ appointmentDate: range });
        else if (quickDate === "overdue") {
          whereConditions.AND.push(
            { appointmentDate: { lt: w.todayStart } },
            { OR: [{ status: null }, { status: "" }, { status: { notIn: ["Delivered", "delivered", "DELIVERED", "Cancelled", "CANCELLED", "Archive", "ARCHIVED"] } }] },
            { OR: [{ courierStatus: null }, { courierStatus: "" }, { courierStatus: { notIn: ["Delivered", "delivered", "DELIVERED", "Cancelled", "CANCELLED"] } }] }
          );
        }
      } else {
        // General / Kanban / All Data views
        if (range) {
          whereConditions.AND.push({
            OR: [
              { appointmentDate: range },
              { pickupDate: range },
              { deliveryDate: range },
              { orderDate: range },
            ],
          });
        } else if (quickDate === "overdue") {
          whereConditions.AND.push(...getPastDueConditions(w.todayStart));
        }
      }
    }

    // Date range filter: YYYY-MM-DD bounds are whole IST days (end inclusive of that day)
    if (startDate || endDate) {
      const validDateFields = ["pickupDate", "appointmentDate", "deliveryDate", "orderDate", "createdAt"];
      const targetDateField = validDateFields.includes(effectiveDateType)
        ? effectiveDateType
        : (tab === "booking" ? "pickupDate" : "appointmentDate");
      const dateRange: { gte?: Date; lt?: Date } = {};

      const startDay = istDayRangeFromInput(startDate);
      if (startDay) dateRange.gte = startDay.start;
      const endDay = istDayRangeFromInput(endDate);
      if (endDay) dateRange.lt = endDay.end;

      if (dateRange.gte || dateRange.lt) {
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

    const orderInclude = {
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
        orderBy: { timestamp: "desc" as const },
        take: 1,
        select: { userName: true, timestamp: true },
      },
      statusHistory: {
        orderBy: { timestamp: "desc" as const },
        take: 1,
        select: { userName: true, timestamp: true },
      },
    };

    let total: number;
    let orders: Awaited<ReturnType<typeof fetchPage>>;
    let kanban: { counts: Record<string, number>; columnLimit: number } | null = null;
    function fetchPage(where: any, skip: number, take: number) {
      return db.consignmentOrder.findMany({
        where,
        orderBy: { [orderField]: sortDir },
        skip,
        take,
        include: orderInclude,
      });
    }

    if (tab === "kanban") {
      // Kanban: one count + one capped query per column, using the same stage partition the board
      // renders (getKanbanStage), so counts are exact and no column is starved by a page cap.
      const perStage = await Promise.all(
        KANBAN_STAGES.map(async (stage) => {
          const where = { AND: [whereConditions, KANBAN_STAGE_CONDITIONS[stage]] };
          const [count, rows] = await Promise.all([
            db.consignmentOrder.count({ where }),
            fetchPage(where, 0, KANBAN_COLUMN_LIMIT),
          ]);
          return { stage, count, rows };
        })
      );
      const counts: Record<string, number> = {};
      for (const p of perStage) counts[p.stage] = p.count;
      kanban = { counts, columnLimit: KANBAN_COLUMN_LIMIT };
      total = perStage.reduce((sum, p) => sum + p.count, 0);
      orders = perStage.flatMap((p) => p.rows);
    } else {
      // Query DB in parallel for count and rows
      [total, orders] = await Promise.all([
        db.consignmentOrder.count({ where: whereConditions }),
        fetchPage(whereConditions, (page - 1) * pageSize, pageSize),
      ]);
    }

    // Fetch personal internal notes isolated to Appointment application (safe self-healing)
    const orderIds = orders.map((o) => o.id);
    const notesMap = await getAppointmentNotesMap(orderIds);

    // Enrich orders with boxDimensionGroups, audit info, and isolated personal notes
    const enrichedOrders = orders.map((order) => {
      const boxDimensionGroups = extractBoxDimensionGroups(order);

      const latestUser =
        order.auditLogs?.[0]?.userName || order.statusHistory?.[0]?.userName || null;

      // Same classifier as the desks / Kanban; a deliveryDate alone never means Delivered
      const isDelivered = isDeliveredOrder(order);
      const isInTransit = hasInTransitMarker(order);
      const isGrnIssue = isGrnIssueOrder(order);

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
        ...toClientOrder(order),
        courierPartner: effectiveCourier,
        boxDimensionGroups,
        trackingLink: order.trackingLink || null, // No automatic external URL generation
        lastUpdatedBy: latestUser,
        deliveryStatus: computedDeliveryStatus,
        kanbanStage: getKanbanStage(order),
        personalNote: noteItem?.note || null,
        personalNoteUpdatedAt: noteItem?.updatedAt ? noteItem.updatedAt.toISOString() : null,
        personalNoteUpdatedBy: noteItem?.updatedBy || null,
      };
    });

    return NextResponse.json({
      orders: enrichedOrders,
      pagination: kanban
        ? { page: 1, pageSize: orders.length, total, totalPages: 1 }
        : {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
      ...(kanban ? { kanban } : {}),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
