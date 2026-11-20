import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  istDayStart,
  istDayRangeFromInput,
  getIstQuickDateWindows,
  isSameIstDay,
} from "../src/lib/date-utils";
import {
  APP2_COURIER_MILESTONES,
  BOOKING_FILTER_CONDITIONS,
  KANBAN_STAGES,
  evaluateStatusPatch,
  getKanbanStage,
  getMetricConditions,
  hasInTransitMarker,
  isClosedOrder,
  isDeliveredOrder,
  isOnAppointmentDesk,
  isOnBookingDesk,
  isPastDueOrder,
  isVisibleInAppointmentApp,
  type OrderStageFields,
} from "../src/lib/order-filters";
import {
  getCourierSpellings,
  getEffectiveCourierPartner,
  isSameCourier,
  normalizeCourierName,
  resolveCourierForChannel,
} from "../src/lib/courier-defaults";

const iso = (d: Date) => d.toISOString();
const within = (t: string, r: { gte: Date; lt: Date }) => new Date(t) >= r.gte && new Date(t) < r.lt;

describe("IST business-day boundaries (servers run in UTC)", () => {
  it("start of the IST day, including the 00:00–05:30 IST window where the UTC date lags", () => {
    // 23:59 IST on 18 Nov
    assert.equal(iso(istDayStart(new Date("2026-11-18T18:29:00Z"))), "2026-11-17T18:30:00.000Z");
    // 00:00 IST on 19 Nov (UTC still says 18 Nov)
    assert.equal(iso(istDayStart(new Date("2026-11-18T18:30:00Z"))), "2026-11-18T18:30:00.000Z");
    // 01:00 IST on 19 Nov
    assert.equal(iso(istDayStart(new Date("2026-11-18T19:30:00Z"))), "2026-11-18T18:30:00.000Z");
    // 05:29 IST on 19 Nov
    assert.equal(iso(istDayStart(new Date("2026-11-18T23:59:00Z"))), "2026-11-18T18:30:00.000Z");
    assert.equal(iso(istDayStart(new Date("2026-11-18T19:30:00Z"), 1)), "2026-11-19T18:30:00.000Z");
  });

  it("every stored form of 19 Nov lands on 19 Nov IST: date-only 00:00Z, App 1 noon IST (06:30Z), a 01:00 IST timestamp", () => {
    const now = new Date("2026-11-18T20:00:00Z"); // 01:30 IST on 19 Nov
    const w = getIstQuickDateWindows(now);
    const today = { gte: w.todayStart, lt: w.tomorrowStart };
    const yesterday = { gte: w.yesterdayStart, lt: w.todayStart };
    for (const t of ["2026-11-19T00:00:00Z", "2026-11-19T06:30:00Z", "2026-11-18T19:30:00Z", "2026-11-19T18:29:59Z"]) {
      assert.ok(within(t, today), `${t} must be "today" (19 Nov IST)`);
    }
    for (const t of ["2026-11-18T00:00:00Z", "2026-11-18T06:30:00Z", "2026-11-18T18:29:59Z"]) {
      assert.ok(within(t, yesterday), `${t} must be "yesterday" (18 Nov IST)`);
      assert.ok(!within(t, today));
    }
    assert.ok(!within("2026-11-19T18:30:00Z", today), "00:00 IST on 20 Nov is tomorrow");
    assert.ok(within("2026-11-20T00:00:00Z", { gte: w.tomorrowStart, lt: w.dayAfterTomorrowStart }));
  });

  it("YYYY-MM-DD / DD/MM/YYYY / '19 Nov 2026' filter bounds are whole IST days", () => {
    for (const input of ["2026-11-19", "19/11/2026", "19 Nov 2026"]) {
      const r = istDayRangeFromInput(input)!;
      assert.equal(iso(r.start), "2026-11-18T18:30:00.000Z", input);
      assert.equal(iso(r.end), "2026-11-19T18:30:00.000Z", input);
    }
    assert.equal(istDayRangeFromInput(""), null);
    assert.equal(istDayRangeFromInput("garbage"), null);
    assert.ok(isSameIstDay(new Date("2026-11-19T00:00:00Z"), new Date("2026-11-19T06:30:00Z")));
    assert.ok(!isSameIstDay(new Date("2026-11-18T18:29:00Z"), new Date("2026-11-18T18:30:00Z")));
  });

  it("This Week runs Sunday 00:00 IST to next Sunday 00:00 IST, end exclusive", () => {
    const w = getIstQuickDateWindows(new Date("2026-11-18T06:00:00Z")); // Wed 18 Nov
    assert.equal(iso(w.weekStart), "2026-11-14T18:30:00.000Z"); // Sun 15 Nov 00:00 IST
    assert.equal(iso(w.weekEnd), "2026-11-21T18:30:00.000Z"); // Sun 22 Nov 00:00 IST (exclusive)
    const week = { gte: w.weekStart, lt: w.weekEnd };
    assert.ok(within("2026-11-15T00:00:00Z", week), "this Sunday (date-only) is in");
    assert.ok(within("2026-11-21T06:30:00Z", week), "Saturday is in");
    assert.ok(!within("2026-11-22T00:00:00Z", week), "next Sunday (date-only) is out");
    assert.ok(!within("2026-11-22T06:30:00Z", week), "next Sunday (App 1 noon) is out");

    // 02:00 IST on Sunday 22 Nov is already the new week, although UTC still says Saturday
    const sun = getIstQuickDateWindows(new Date("2026-11-21T20:30:00Z"));
    assert.equal(iso(sun.weekStart), "2026-11-21T18:30:00.000Z");
  });

  it("list and stats routes use IST windows with exclusive ends (no setHours / lte weekEnd)", () => {
    const list = fs.readFileSync("src/app/api/orders/route.ts", "utf8");
    const stats = fs.readFileSync("src/app/api/dashboard/stats/route.ts", "utf8");
    for (const src of [list, stats]) {
      assert.ok(!src.includes("setHours("), "no server-local (UTC) day math");
      assert.ok(!/lte:\s*weekEnd/.test(src));
      assert.ok(src.includes("getIstQuickDateWindows("));
    }
    assert.ok(list.includes("istDayRangeFromInput(startDate)") && list.includes("istDayRangeFromInput(endDate)"));
  });

  it("Past Due (rule 9): pickup before today IST and not in transit", () => {
    const todayStart = istDayStart(new Date("2026-11-18T06:00:00Z"));
    const base = { status: "In Progress", courierStatus: "Pending", pickupDone: false };
    assert.equal(isPastDueOrder({ ...base, pickupDate: "2026-11-17T06:30:00Z" }, todayStart), true);
    assert.equal(isPastDueOrder({ ...base, pickupDate: "2026-11-18T00:00:00Z" }, todayStart), false, "today is not past due");
    assert.equal(isPastDueOrder({ ...base, pickupDone: true, pickupDate: "2026-11-10T06:30:00Z" }, todayStart), false);
    assert.equal(isPastDueOrder({ ...base, status: "In Transit", pickupDate: "2026-11-10T06:30:00Z" }, todayStart), false);
    assert.equal(
      isPastDueOrder({ ...base, customData: { fulfilmentStatus: "Dispatched" }, pickupDate: "2026-11-10T06:30:00Z" }, todayStart),
      false
    );
  });

  it("Scheduled Today metric is [today IST, tomorrow IST)", () => {
    const w = getIstQuickDateWindows(new Date("2026-11-18T20:00:00Z"));
    const [cond] = getMetricConditions("scheduled_today", w) as any[];
    assert.deepEqual(cond.appointmentDate, { gte: w.todayStart, lt: w.tomorrowStart });
    assert.equal(getMetricConditions("nope", w), null);
  });
});

describe("PATCH allow-list: In Transit only via BoxTrace, Delivered only via POD, milestones to courierStatus only", () => {
  const transit = { status: "In Transit", courierStatus: "In Transit", pickupDone: true };
  const processing = { status: "In Progress", courierStatus: "Pending", pickupDone: false };
  const refusedWith = (existing: OrderStageFields, body: Record<string, unknown>) => {
    const r = evaluateStatusPatch(existing, body);
    return r.ok ? "OK" : r.code;
  };

  it("refuses In Transit / pickupDone from this app", () => {
    assert.equal(refusedWith(processing, { status: "In Transit" }), "DISPATCH_VIA_BOXTRACE");
    assert.equal(refusedWith(processing, { courierStatus: "In Transit" }), "DISPATCH_VIA_BOXTRACE");
    assert.equal(refusedWith(processing, { courierStatus: "dispatched" }), "DISPATCH_VIA_BOXTRACE");
    assert.equal(refusedWith(processing, { pickupDone: true }), "DISPATCH_VIA_BOXTRACE");
    assert.equal(refusedWith(transit, { pickupDone: false }), "DISPATCH_VIA_BOXTRACE", "un-dispatching is refused too");
    assert.equal(refusedWith(transit, { pickupDone: true }), "OK", "unchanged pickupDone is ignored");
  });

  it("refuses every order-status change; keeps the GRN / cancel / POD codes", () => {
    assert.equal(refusedWith(transit, { status: "Delivered" }), "POD_REQUIRED");
    assert.equal(refusedWith(transit, { courierStatus: "Delivered" }), "POD_REQUIRED");
    assert.equal(refusedWith(transit, { status: "GRN Issue" }), "GRN_VIA_MAIN_APP");
    assert.equal(refusedWith(transit, { courierStatus: "GRN Issue" }), "GRN_VIA_MAIN_APP");
    assert.equal(refusedWith(transit, { grnReport: "x" }), "GRN_VIA_MAIN_APP");
    assert.equal(refusedWith(transit, { status: "Cancelled" }), "CANCEL_VIA_MAIN_APP");
    assert.equal(refusedWith(transit, { status: "Tracking Assigned" }), "STATUS_VIA_MAIN_APP");
    assert.equal(refusedWith(processing, { status: "Pending" }), "STATUS_VIA_MAIN_APP");
    assert.equal(refusedWith(transit, { status: "In Transit" }), "OK", "an unchanged status is ignored");
    assert.equal(refusedWith(transit, { status: "" }), "OK");
  });

  it("accepts the App 2 milestones (canonical spelling) and nothing else", () => {
    assert.deepEqual([...APP2_COURIER_MILESTONES], ["Pending", "Tracking Assigned", "Appointment Scheduled"]);
    assert.deepEqual(evaluateStatusPatch(processing, { courierStatus: "tracking assigned" }), { ok: true, courierStatus: "Tracking Assigned" });
    assert.deepEqual(evaluateStatusPatch(transit, { courierStatus: "Appointment Scheduled" }), { ok: true, courierStatus: "Appointment Scheduled" });
    assert.deepEqual(evaluateStatusPatch({ ...processing, courierStatus: "Tracking Assigned" }, { courierStatus: "Pending" }), { ok: true, courierStatus: "Pending" });
    assert.equal(refusedWith(processing, { courierStatus: "Out for Delivery" }), "INVALID_COURIER_STATUS");
    assert.deepEqual(evaluateStatusPatch(processing, { courierStatus: "PENDING" }), { ok: true }, "unchanged in any case");
  });

  it("never moves an order out of Delivered / GRN Issue / Archive", () => {
    const delivered = { status: "Delivered", courierStatus: "Delivered", pickupDone: true };
    const grn = { status: "GRN Issue", courierStatus: "GRN Issue", grnStatus: "GRN Issue", pickupDone: true };
    const grnAfterDelivery = { status: "GRN Issue", courierStatus: "Delivered", grnStatus: "GRN Issue", pickupDone: true };
    for (const o of [delivered, grn, grnAfterDelivery]) {
      assert.equal(isClosedOrder(o), true);
      const r = evaluateStatusPatch(o, { courierStatus: "Appointment Scheduled" });
      assert.ok(!r.ok && r.code === "ORDER_CLOSED" && r.httpStatus === 409, JSON.stringify(o));
      assert.equal(refusedWith(o, { courierStatus: o.courierStatus }), "OK", "re-sending the same milestone is a no-op");
    }
    assert.equal(refusedWith(grnAfterDelivery, { courierStatus: "Delivered" }), "OK", "no status/courier rewrite of a GRN Issue order");
    assert.equal(refusedWith(grn, { status: "Delivered" }), "POD_REQUIRED");
  });

  it("the route writes milestones to courierStatus only, never status / pickupDone, on a locked row", () => {
    const route = fs.readFileSync("src/app/api/orders/[id]/route.ts", "utf8");
    assert.ok(route.includes("evaluateStatusPatch(existing, body)"));
    assert.ok(/FOR UPDATE/.test(route), "PATCH locks the order row");
    assert.ok(!/dataToUpdate\.status\s*=/.test(route), "PATCH never writes status");
    assert.ok(!/dataToUpdate\.pickupDone\s*=/.test(route), "PATCH never writes pickupDone");
    assert.ok(!/dataToUpdate\.grnStatus\s*=/.test(route), "PATCH never writes grnStatus");
    assert.ok(route.includes("DELIVERY_VIA_MARK_DELIVERED"), "deliveryDate edits need a Delivered order with POD");
    assert.ok(route.includes("isSameIstDay("), "re-saving the same day never rewrites App 1's date");
  });

  it("UI never offers In Transit / Ship and never sends status", () => {
    const kanban = fs.readFileSync("src/components/views/KanbanView.tsx", "utf8");
    const drawer = fs.readFileSync("src/components/drawer/OrderDetailsDrawer.tsx", "utf8");
    const table = fs.readFileSync("src/components/table/OrdersTable.tsx", "utf8");
    assert.ok(!kanban.includes("Ship (Gone)"));
    assert.ok(!/pickupDone:\s*true/.test(kanban + drawer + table));
    assert.ok(!/body:\s*JSON\.stringify\(\{\s*status:/.test(kanban));
    assert.ok(kanban.includes("JSON.stringify({ courierStatus: milestone })"));
    assert.ok(!/status:\s*courierStatus/.test(drawer), "drawer must not send status");
    assert.ok(drawer.includes("APP2_COURIER_MILESTONES") && table.includes("APP2_COURIER_MILESTONES"));
    for (const src of [kanban, drawer, table]) assert.ok(src.includes("MarkDeliveredModal"), "Mark Delivered opens the POD form");
  });
});

describe("Mark Delivered requires an in-transit order (Appointment-desk predicate)", () => {
  it("in-transit markers", () => {
    assert.equal(isOnAppointmentDesk({ status: "In Transit" }), true);
    assert.equal(isOnAppointmentDesk({ status: "Packed", pickupDone: true }), true);
    assert.equal(isOnAppointmentDesk({ status: "Packed", courierStatus: "SHIPPED" }), true);
    assert.equal(isOnAppointmentDesk({ status: "Packed", customData: { fulfilmentStatus: "Dispatched" } }), true);
    assert.equal(isOnAppointmentDesk({ status: "Packed", courierStatus: "Tracking Assigned" }), false);
    assert.equal(isOnAppointmentDesk({ status: "In Progress", docsPrinted: true }), false);
  });

  it("closed orders are not deliverable", () => {
    assert.equal(isOnAppointmentDesk({ status: "Delivered", pickupDone: true }), false);
    assert.equal(isOnAppointmentDesk({ status: "In Transit", courierStatus: "Delivered", pickupDone: true }), false);
    assert.equal(isOnAppointmentDesk({ status: "GRN Issue", courierStatus: "GRN Issue", pickupDone: true }), false);
    assert.equal(isOnAppointmentDesk({ status: "Archive", pickupDone: true }), false);
  });

  it("deliver route: in-transit check + row lock + IST end-of-today cap + key-merge, never pickupDone", () => {
    const src = fs.readFileSync("src/app/api/orders/[id]/deliver/route.ts", "utf8");
    assert.ok(src.includes("isOnAppointmentDesk(order)"));
    assert.ok(src.includes("NOT_IN_TRANSIT"));
    assert.ok(/FOR UPDATE/.test(src));
    assert.ok(src.includes("istDayStart(new Date(), 1)"));
    assert.ok(!src.includes("24 * 60 * 60 * 1000"));
    assert.ok(!/pickupDone:\s*true/.test(src));
    // customData is read from the locked row inside the transaction
    const tx = src.slice(src.indexOf("db.$transaction"));
    assert.ok(tx.indexOf("FOR UPDATE") < tx.indexOf("existing.customData"));
  });
});

describe("Courier names: one normaliser for both apps' spellings", () => {
  it("aliases", () => {
    assert.equal(normalizeCourierName("Delhivery"), "Delhivery One");
    assert.equal(normalizeCourierName(" delhivery one "), "Delhivery One");
    assert.equal(normalizeCourierName("Om Logistics"), "OM Logistics");
    assert.equal(normalizeCourierName("OM LOGISTICS"), "OM Logistics");
    assert.equal(normalizeCourierName("Ekart Logistics"), "Ekart");
    assert.equal(normalizeCourierName("Shiprocket"), "Shiprocket Cargo");
    assert.equal(normalizeCourierName("amazon ats"), "Amazon ATS");
    assert.equal(normalizeCourierName("Local"), "Local");
    assert.equal(normalizeCourierName("Blue Dart"), "Blue Dart");
    assert.equal(normalizeCourierName(""), "");
    assert.ok(isSameCourier("Delhivery", "Delhivery One"));
    assert.ok(!isSameCourier("Delhivery", "OM Logistics"));
    assert.ok(getCourierSpellings("Delhivery One").includes("delhivery"));
  });

  it("list display keeps App 1 couriers (incl. Local) instead of nulling them", () => {
    assert.equal(getEffectiveCourierPartner("SWIGGY", "Om Logistics"), "OM Logistics");
    assert.equal(getEffectiveCourierPartner("BLINKIT_STO", "Delhivery"), "Delhivery One");
    assert.equal(getEffectiveCourierPartner("FLIPKART_MINUTES", "Shiprocket Cargo"), "Shiprocket Cargo");
    assert.equal(getEffectiveCourierPartner("FLIPKART_FBF", "Ekart Logistics"), "Ekart");
    assert.equal(getEffectiveCourierPartner("SWIGGY", "Local"), "Local");
    assert.equal(getEffectiveCourierPartner("AMAZON_VC", null), "Amazon ATS");
  });

  it("server policy accepts aliases, still refuses other channels' couriers", () => {
    assert.deepEqual(resolveCourierForChannel("SWIGGY", "Delhivery"), { ok: true, courier: "Delhivery One" });
    assert.deepEqual(resolveCourierForChannel("FKSB_FLIPKART", "Ekart Logistics"), { ok: true, courier: "Ekart" });
    assert.equal(resolveCourierForChannel("AMAZON_VC", "Delhivery").ok, false);
    assert.equal(resolveCourierForChannel("SWIGGY", "Local").ok, false);
  });

  it("PATCH skips an unchanged courier in any spelling; drawer sends courier only when changed", () => {
    const route = fs.readFileSync("src/app/api/orders/[id]/route.ts", "utf8");
    const drawer = fs.readFileSync("src/components/drawer/OrderDetailsDrawer.tsx", "utf8");
    assert.ok(route.includes("!isSameCourier(body.courierPartner, existing.courierPartner)"));
    assert.ok(drawer.includes("if (!isSameCourier(courierPartner, init.courierPartner)) payload.courierPartner"));
  });
});

describe("Booking and Appointment desks are disjoint; Kanban uses the same partition", () => {
  const statuses = [null, "", "In Progress", "Packed", "In Transit", "IN TRANSIT", "Dispatched", "Delivered", "GRN Issue"];
  const courierStatuses = [null, "", "Pending", "Tracking Assigned", "Appointment Scheduled", "In Transit", "SHIPPED", "Shipped", "Delivered"];
  const all: OrderStageFields[] = [];
  for (const status of statuses)
    for (const courierStatus of courierStatuses)
      for (const pickupDone of [false, true])
        for (const fulfilmentStatus of [undefined, "Packed", "Dispatched"])
          for (const docsPrinted of [false, true])
            all.push({ status, courierStatus, pickupDone, docsPrinted, customData: fulfilmentStatus ? { fulfilmentStatus } : {} });

  it("no order is on both desks", () => {
    for (const o of all) assert.ok(!(isOnBookingDesk(o) && isOnAppointmentDesk(o)), JSON.stringify(o));
  });

  it("a printed order App 1 marked fulfilment Dispatched is on the Appointment desk only", () => {
    const o = { status: "Packed", courierStatus: "Tracking Assigned", pickupDone: false, docsPrinted: true, customData: { fulfilmentStatus: "Dispatched" } };
    assert.equal(isOnBookingDesk(o), false);
    assert.equal(isOnAppointmentDesk(o), true);
    assert.equal(isOnBookingDesk({ ...o, customData: {} }), true);
  });

  it("the Booking Prisma filter excludes fulfilment Dispatched null-safely (missing key keeps the row)", () => {
    const last = BOOKING_FILTER_CONDITIONS[BOOKING_FILTER_CONDITIONS.length - 1] as any;
    assert.equal(last.OR.length, 2);
    assert.deepEqual(last.OR[0].customData.path, ["fulfilmentStatus"]);
    assert.ok(String(last.OR[0].customData.equals).includes("AnyNull"), "key missing / JSON null must keep the row");
    assert.equal(last.OR[1].NOT.customData.equals, "Dispatched");
  });

  it("Kanban stage is a total partition consistent with the desks", () => {
    for (const o of all) {
      const stage = getKanbanStage(o);
      assert.ok((KANBAN_STAGES as readonly string[]).includes(stage));
      if (!isVisibleInAppointmentApp({ ...o, status: o.status ?? null })) continue;
      if (stage === "in_transit") assert.ok(hasInTransitMarker(o), JSON.stringify(o));
      if (stage === "remaining" || stage === "booked") assert.ok(!hasInTransitMarker(o), JSON.stringify(o));
      if (isOnAppointmentDesk(o)) assert.equal(stage, "in_transit", JSON.stringify(o));
      if (isOnBookingDesk(o)) assert.ok(stage === "remaining" || stage === "booked", JSON.stringify(o));
    }
  });

  it("a deliveryDate alone is never Delivered", () => {
    const o = { status: "In Progress", courierStatus: "Pending", pickupDone: false, deliveryDate: "2026-11-17" } as any;
    assert.equal(isDeliveredOrder(o), false);
    assert.equal(getKanbanStage(o), "remaining");
    const list = fs.readFileSync("src/app/api/orders/route.ts", "utf8");
    const kanban = fs.readFileSync("src/components/views/KanbanView.tsx", "utf8");
    assert.ok(!/!!order\.deliveryDate/.test(list));
    assert.ok(!/!!o\.deliveryDate/.test(kanban));
    assert.ok(!/deliveryDate:\s*\{\s*not:\s*null\s*\}/.test(list));
  });
});

describe("Cross-app safety: secrets, seed, hidden orders, metric drill-down", () => {
  it("JWT_SECRET (what the main app reads) wins over AUTH_SECRET", async () => {
    const prev = { j: process.env.JWT_SECRET, a: process.env.AUTH_SECRET };
    process.env.JWT_SECRET = "jwt-secret-used-by-the-consignment-app-000000";
    process.env.AUTH_SECRET = "a-different-auth-secret-0000000000000000000000";
    const { getJwtSecretKey } = await import("../src/lib/jwt-secret");
    assert.equal(new TextDecoder().decode(getJwtSecretKey()), "jwt-secret-used-by-the-consignment-app-000000");
    process.env.JWT_SECRET = prev.j;
    process.env.AUTH_SECRET = prev.a;
  });

  it("seed never deletes shared courier presets nor resets existing users", () => {
    const seed = fs.readFileSync("prisma/seed.ts", "utf8");
    assert.ok(!/courierPreset\.deleteMany/.test(seed));
    assert.ok(!/update:\s*\{\s*passwordHash/.test(seed));
    // 3 users + their dev permission rows: all create-only, existing data is never overwritten
    assert.equal((seed.match(/update:\s*\{\}/g) || []).length, 4);
  });

  it("POD and note routes 404 for orders hidden from this app", () => {
    for (const f of ["src/app/api/orders/[id]/pod/route.ts", "src/app/api/orders/[id]/note/route.ts"]) {
      assert.ok(fs.readFileSync(f, "utf8").includes("isVisibleInAppointmentApp("), f);
    }
  });

  it("metric cards open the list with the same conditions their counts use; filters are ANDed", () => {
    const list = fs.readFileSync("src/app/api/orders/route.ts", "utf8");
    const stats = fs.readFileSync("src/app/api/dashboard/stats/route.ts", "utf8");
    const page = fs.readFileSync("src/app/page.tsx", "utf8");
    assert.ok(list.includes("getMetricConditions(metric, metricWindow)"));
    assert.ok(stats.includes('metricWhere("in_transit")') && stats.includes('metricWhere("scheduled_today")'));
    assert.ok(page.includes('params.set("metric", metricFilter.key)'));
    assert.ok(!/whereConditions\.courierStatus\s*=/.test(list), "status + delivery filters must not overwrite each other");
  });

  it("Kanban is loaded per column with exact counts; view switches reset the page", () => {
    const list = fs.readFileSync("src/app/api/orders/route.ts", "utf8");
    const page = fs.readFileSync("src/app/page.tsx", "utf8");
    assert.ok(list.includes("KANBAN_STAGE_CONDITIONS[stage]"));
    assert.ok(page.includes("onSelectView={selectView}"));
    assert.ok(/const selectView = useCallback\(\(view: ActiveView\) => \{\s*setActiveView\(view\);\s*setPage\(1\);/.test(page));
  });
});
