import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import {
  isAllowedAppointmentUser,
  verifyPassword,
  createSession,
  verifySessionToken,
} from "../src/lib/auth";
import { resolveTrackingUrl } from "../src/lib/tracking-utils";
import { NextRequest } from "next/server";
import { PATCH, GET as getOrderById } from "../src/app/api/orders/[id]/route";
import { POST as saveNote, GET as getNote, DELETE as deleteNote } from "../src/app/api/orders/[id]/note/route";
import { GET as getOrders } from "../src/app/api/orders/route";

describe("Appointment Management Application — Comprehensive Verification Suite", () => {
  let adminUserId = "";
  let dispatchUserId = "";
  let printingUserId = "";
  let adminToken = "";
  let testOrderId = "";

  it("1. Database Connection & Schema Alignment", async () => {
    const orderCount = await db.consignmentOrder.count();
    assert(typeof orderCount === "number", "Order count must be a number");
    const couriers = await db.courierPreset.findMany({ where: { isActive: true } });
    assert(couriers.length > 0, "Active courier presets must be seeded");
  });

  it("2. RBAC Policy Function Verification", () => {
    // Admin user
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "ADMIN", username: "admin" }),
      true,
      "Admin must be allowed"
    );

    // Iqbal user by username
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "MANAGER", username: "iqbal", name: "Iqbal" }),
      true,
      "Iqbal must be allowed"
    );

    // Iqbal user by name
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "STAFF", username: "iqbal_logistics", name: "Mohammad Iqbal" }),
      true,
      "Iqbal by name must be allowed"
    );

    // Dispatch Logistics Desk
    assert.strictEqual(
      isAllowedAppointmentUser({
        role: "STAFF",
        username: "dispatch",
        name: "Dispatch & Logistics Desk",
        department: "Dispatch",
      }),
      true,
      "Dispatch desk must be allowed"
    );

    // Other dispatcher user (NOT Iqbal and NOT dispatch) — MUST BE STRICTLY DENIED
    assert.strictEqual(
      isAllowedAppointmentUser({
        role: "STAFF",
        username: "dispatcher-user-01",
        name: "Logistics Dispatcher",
        department: "Dispatch",
      }),
      false,
      "General dispatch staff accounts must be strictly denied"
    );

    // Printing operator — MUST BE DENIED
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "STAFF", username: "printing", department: "Printing" }),
      false,
      "Printing staff must be strictly denied"
    );

    // Manir (Swiggy fulfillment) — MUST BE DENIED
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "STAFF", username: "manir", department: "Swiggy Fulfillment" }),
      false,
      "Non-logistics staff must be strictly denied"
    );

    // Team Leader (TL) without logistics — MUST BE DENIED
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "TL", username: "tl_chopper", department: "Chopper" }),
      false,
      "TL must be denied"
    );
  });

  it("3. User Authentication against Shared Database Credentials", async () => {
    // Admin user
    const adminUser = await db.user.findUnique({ where: { username: "admin" } });
    assert(adminUser, "Admin user must exist in shared DB");
    adminUserId = adminUser.id;

    // Check password verify
    const adminValid = await verifyPassword("admin123", adminUser.passwordHash);
    const adminInvalid = await verifyPassword("wrongpassword", adminUser.passwordHash);
    assert.strictEqual(adminValid, true, "admin123 should be valid for admin");
    assert.strictEqual(adminInvalid, false, "wrongpassword should be rejected");

    // Logistics Dispatch user (Iqbal/Dispatch desk)
    const dispatchUser = await db.user.findUnique({ where: { username: "dispatch" } });
    assert(dispatchUser, "Dispatch user must exist in shared DB");
    dispatchUserId = dispatchUser.id;
    const dispatchValid = await verifyPassword("dispatch123", dispatchUser.passwordHash);
    assert.strictEqual(dispatchValid, true, "dispatch123 should be valid for dispatch");

    // Printing user
    const printingUser = await db.user.findUnique({ where: { username: "printing" } });
    assert(printingUser, "Printing user must exist in shared DB");
    printingUserId = printingUser.id;
  });

  it("4. Session Creation & Token Verification with RBAC Authority", async () => {
    // Admin session token
    adminToken = await createSession(adminUserId);
    const adminSession = await verifySessionToken(adminToken);
    assert(adminSession, "Admin session should verify");
    assert.strictEqual(adminSession?.role, "ADMIN");
    assert.strictEqual(adminSession?.isLogisticsAuthorized, true);

    // Dispatch session token (Logistics Manager / Iqbal)
    const dispatchToken = await createSession(dispatchUserId);
    const dispatchSession = await verifySessionToken(dispatchToken);
    assert(dispatchSession, "Dispatch session should verify");
    assert.strictEqual(dispatchSession?.isLogisticsAuthorized, true);

    // Printing session token (Unauthorized Employee)
    const printingToken = await createSession(printingUserId);
    const printingSession = await verifySessionToken(printingToken);
    assert(printingSession, "Printing user exists");
    assert.strictEqual(
      printingSession?.isLogisticsAuthorized,
      false,
      "Printing user must NOT be authorized for Appointment app"
    );
  });

  it("5. Tracking Link Resolver Logic", async () => {
    const couriers = await db.courierPreset.findMany({ where: { isActive: true } });

    // OM Logistics
    const omUrl = resolveTrackingUrl("OM Logistics", "12345678", null, couriers);
    assert(omUrl?.includes("om-logistics/12345678"), "OM Logistics tracking URL must be correct");

    // Delhivery One
    const delUrl = resolveTrackingUrl("Delhivery One", "DEL998877", null, couriers);
    assert(delUrl?.includes("delhivery-courier/DEL998877"), "Delhivery tracking URL must be correct");

    // Custom tracking link override
    const custom = resolveTrackingUrl("Blue Dart", "BD123", "https://customcarrier.com/track/BD123", couriers);
    assert.strictEqual(custom, "https://customcarrier.com/track/BD123", "Custom link must take priority");
  });

  it("6. Order Creation & Baseline Isolation Verification", async () => {
    const order = await db.consignmentOrder.create({
      data: {
        roPoNumber: `TEST-APPT-${Date.now()}`,
        channel: "SWIGGY",
        warehouseName: "Swiggy Hub Bangalore FC-01",
        status: "In Progress",
        courierStatus: "Pending",
        grnStatus: "GRN Intact - No Issues",
        grnReport: "Initial GRN received 100 units intact",
        comment: "Initial consignment note",
        appointmentDate: new Date("2026-11-15T10:00:00.000Z"),
      },
    });

    assert(order.id, "Test order created");
    testOrderId = order.id;
  });

  it("7. Server-Side Input Validation: PATCH /api/orders/[id] rejects invalid inputs with HTTP 400", async () => {
    // A: Invalid shipment status
    const reqInvalidStatus = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ courierStatus: "BogusUnknownStatus" }),
    });
    const resStatus = await PATCH(reqInvalidStatus, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(resStatus.status, 400, "Should return 400 for invalid shipment status");
    const jsonStatus = await resStatus.json();
    assert(jsonStatus.error?.includes("Invalid shipment status"), "Error must explain invalid status");

    // B: Invalid tracking URL (malicious protocol)
    const reqInvalidUrl = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ trackingLink: "javascript:alert(1)" }),
    });
    const resUrl = await PATCH(reqInvalidUrl, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(resUrl.status, 400, "Should return 400 for unsafe tracking URL");

    // C: Invalid date format
    const reqInvalidDate = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ appointmentDate: "this-is-not-a-valid-date" }),
    });
    const resDate = await PATCH(reqInvalidDate, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(resDate.status, 400, "Should return 400 for invalid date format");
  });

  it("8. Transaction-Safe Mutation & Critical Status Isolation (No Status Overwrite)", async () => {
    // Iqbal / Dispatch updates courierStatus to "Delivered" via PATCH route
    const reqUpdate = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        courierPartner: "OM Logistics",
        trackingId: "OML-BANGALORE-98765",
        appointmentId: "APPT-BLR-00123",
        appointmentDate: "2026-11-10T10:00:00.000Z",
        appointmentSlot: "10:00 AM - 01:00 PM",
        courierStatus: "Delivered",
        comment: "Consignment handed over to hub",
        remarks: "Delivered to Swiggy Bangalore gate",
      }),
    });

    const res = await PATCH(reqUpdate, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(res.status, 200, "Update must succeed");
    const json = await res.json();
    assert.strictEqual(json.success, true);

    // Verify in database
    const saved = await db.consignmentOrder.findUnique({ where: { id: testOrderId } });
    assert(saved, "Order must exist");
    assert.strictEqual(saved?.trackingId, "OML-BANGALORE-98765");
    assert.strictEqual(saved?.courierPartner, "OM Logistics");
    assert.strictEqual(saved?.appointmentId, "APPT-BLR-00123");
    assert.strictEqual(saved?.appointmentSlot, "10:00 AM - 01:00 PM");
    assert.strictEqual(saved?.courierStatus, "Delivered");
    assert.strictEqual(saved?.pickupDone, true, "pickupDone must be true when Delivered");
    assert(saved?.deliveryDate, "deliveryDate should be set when Delivered");

    // CRITICAL REQUIREMENT 5 VERIFICATION:
    // Main Consignment order status MUST NOT be overwritten to "Delivered"!
    assert.strictEqual(
      saved?.status,
      "In Progress",
      "Main consignment status must NOT be overwritten by logistics shipment update!"
    );

    // GRN status MUST NOT be touched!
    assert.strictEqual(
      saved?.grnStatus,
      "GRN Intact - No Issues",
      "GRN Status must NOT be overwritten!"
    );
    assert.strictEqual(
      saved?.grnReport,
      "Initial GRN received 100 units intact",
      "GRN Report must remain intact!"
    );
  });

  it("9. Audit Trail & Status History Verification", async () => {
    const history = await db.orderStatusHistory.findMany({
      where: { orderId: testOrderId },
    });
    assert(history.length >= 1, "Status history must record transition");
    const latest = history[history.length - 1];
    assert.strictEqual(latest.toStatus, "Delivered");

    const logs = await db.auditLog.findMany({
      where: { orderId: testOrderId },
    });
    assert(logs.length >= 1, "Audit logs must record field changes");
  });

  it("10. Server-Side GET /api/orders: Date Range & Delivery Status Filters & lastUpdatedBy", async () => {
    // A: Query with matching date range
    const reqDateMatch = new NextRequest(
      `http://localhost:3001/api/orders?dateType=appointmentDate&startDate=2026-11-09&endDate=2026-11-11`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const resDateMatch = await getOrders(reqDateMatch);
    assert.strictEqual(resDateMatch.status, 200);
    const jsonDateMatch = await resDateMatch.json();
    assert(
      jsonDateMatch.orders.some((o: any) => o.id === testOrderId),
      "Test order must be included within matching date range"
    );

    // B: Query with non-matching date range
    const reqDateMiss = new NextRequest(
      `http://localhost:3001/api/orders?dateType=appointmentDate&startDate=2025-01-01&endDate=2025-01-02`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const resDateMiss = await getOrders(reqDateMiss);
    const jsonDateMiss = await resDateMiss.json();
    assert(
      !jsonDateMiss.orders.some((o: any) => o.id === testOrderId),
      "Test order must not be included outside date range"
    );

    // C: Query with deliveryStatus=DELIVERED
    const reqDelivered = new NextRequest(
      `http://localhost:3001/api/orders?deliveryStatus=DELIVERED`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const resDelivered = await getOrders(reqDelivered);
    const jsonDelivered = await resDelivered.json();
    assert(
      jsonDelivered.orders.some((o: any) => o.id === testOrderId),
      "Test order must match deliveryStatus=DELIVERED"
    );

    // D: Verify lastUpdatedBy is populated
    const foundOrder = jsonDateMatch.orders.find((o: any) => o.id === testOrderId);
    assert(foundOrder, "Found test order");
    assert(foundOrder.lastUpdatedBy, "lastUpdatedBy must be populated on order");
    assert.strictEqual(foundOrder.deliveryStatus, "Delivered");
  });

  it("11. Bidirectional Visibility: Consignment update is immediately visible in Appointment", async () => {
    // Admin updates order remarks in Consignment app
    await db.consignmentOrder.update({
      where: { id: testOrderId },
      data: {
        comment: "Admin confirmed slot with Swiggy Bangalore warehouse manager",
      },
    });

    // Appointment reads the order via GET endpoint
    const req = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await getOrderById(req, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(res.status, 200);
    const json = await res.json();

    assert.strictEqual(
      json.order.comment,
      "Admin confirmed slot with Swiggy Bangalore warehouse manager",
      "Appointment must instantly reflect changes made in Consignment"
    );
  });

  it("12. Isolated Personal Notes: Stored exclusively in AppointmentNote table, never leaking to Consignment", async () => {
    const personalNoteText = "Internal reminder: Called security guard Ramesh at gate 2, permit code 998877";

    // 1. Save personal note via dedicated POST /api/orders/[id]/note
    const reqNote = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}/note`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ note: personalNoteText }),
    });
    const resNote = await saveNote(reqNote, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(resNote.status, 200, "Saving personal note must succeed");
    const jsonNote = await resNote.json();
    assert.strictEqual(jsonNote.note, personalNoteText);

    // 2. Verify stored in dedicated AppointmentNote table
    const dbNote = await db.appointmentNote.findUnique({ where: { orderId: testOrderId } });
    assert(dbNote, "Personal note must exist in AppointmentNote table");
    assert.strictEqual(dbNote?.note, personalNoteText);

    // 3. ISOLATION CHECK: Verify ConsignmentOrder.comment was NOT overwritten by personal note!
    const consignmentOrder = await db.consignmentOrder.findUnique({ where: { id: testOrderId } });
    assert.strictEqual(
      consignmentOrder?.comment,
      "Admin confirmed slot with Swiggy Bangalore warehouse manager",
      "ConsignmentOrder comment MUST NOT be overwritten by internal Appointment note!"
    );

    // 4. Read back via GET /api/orders/[id]
    const reqGet = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resGet = await getOrderById(reqGet, { params: Promise.resolve({ id: testOrderId }) });
    const jsonGet = await resGet.json();
    assert.strictEqual(
      jsonGet.order.personalNote,
      personalNoteText,
      "GET /api/orders/[id] must return isolated personalNote"
    );

    // 5. Read back via GET /api/orders (table list view enrichment)
    const reqList = new NextRequest(`http://localhost:3001/api/orders?search=${testOrderId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resList = await getOrders(reqList);
    const jsonList = await resList.json();
    const orderInList = jsonList.orders.find((o: any) => o.id === testOrderId);
    assert(orderInList, "Order must be in list");
    assert.strictEqual(
      orderInList.personalNote,
      personalNoteText,
      "GET /api/orders must enrich orders with isolated personalNote"
    );

    // 6. Update personal note via PATCH /api/orders/[id]
    const updatedNoteText = "Updated reminder: Gate 2 approved, unloading at Dock 4";
    const reqPatch = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ personalNote: updatedNoteText }),
    });
    const resPatch = await PATCH(reqPatch, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(resPatch.status, 200);
    const jsonPatch = await resPatch.json();
    assert.strictEqual(jsonPatch.order.personalNote, updatedNoteText);

    // 7. Clear personal note via DELETE /api/orders/[id]/note
    const reqDelete = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}/note`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resDelete = await deleteNote(reqDelete, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(resDelete.status, 200);
    const deletedDbNote = await db.appointmentNote.findUnique({ where: { orderId: testOrderId } });
    assert.strictEqual(deletedDbNote, null, "AppointmentNote must be cleared");
  });

  it("13. Warehouse & Platform Channel Filtering", async () => {
    // A: Warehouse exact/contains matching
    const reqWarehouseMatch = new NextRequest(
      `http://localhost:3001/api/orders?warehouse=Bangalore`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const resMatch = await getOrders(reqWarehouseMatch);
    assert.strictEqual(resMatch.status, 200);
    const jsonMatch = await resMatch.json();
    assert(
      jsonMatch.orders.some((o: any) => o.id === testOrderId),
      "Warehouse filter must match warehouseName containing Bangalore"
    );

    // B: Warehouse non-matching
    const reqWarehouseMiss = new NextRequest(
      `http://localhost:3001/api/orders?warehouse=KolkataNonExistentFC`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const resMiss = await getOrders(reqWarehouseMiss);
    const jsonMiss = await resMiss.json();
    assert(
      !jsonMiss.orders.some((o: any) => o.id === testOrderId),
      "Warehouse filter must exclude non-matching orders"
    );

    // C: Channel/Platform filter
    const reqChannel = new NextRequest(`http://localhost:3001/api/orders?channel=SWIGGY`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resChannel = await getOrders(reqChannel);
    const jsonChannel = await resChannel.json();
    assert(
      jsonChannel.orders.some((o: any) => o.id === testOrderId),
      "Channel filter must match SWIGGY"
    );
  });

  it("14. Quick Dates Presets (Today's All, Tomorrow's All) & Server-Side Sorting by Courier, Warehouse, Box Count", async () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orderAlpha = await db.consignmentOrder.create({
      data: {
        roPoNumber: `TEST-SORT-A-${Date.now()}`,
        channel: "SWIGGY",
        warehouseName: "AAA-Bangalore-Depot",
        courierPartner: "AAA Logistics Express",
        boxCount: 5,
        status: "In Progress",
        courierStatus: "In Transit",
        pickupDate: today,
        appointmentDate: today,
      },
    });

    const orderOmega = await db.consignmentOrder.create({
      data: {
        roPoNumber: `TEST-SORT-Z-${Date.now()}`,
        channel: "SWIGGY",
        warehouseName: "ZZZ-Bangalore-Depot",
        courierPartner: "ZZZ Logistics Express",
        boxCount: 99,
        status: "In Progress",
        courierStatus: "In Transit",
        pickupDate: tomorrow,
        appointmentDate: tomorrow,
      },
    });

    try {
      // 1. Sort by courierPartner asc
      const reqSortCourierAsc = new NextRequest(
        `http://localhost:3001/api/orders?sortBy=courierPartner&sortDir=asc&search=TEST-SORT-`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const resCourierAsc = await getOrders(reqSortCourierAsc);
      assert.strictEqual(resCourierAsc.status, 200);
      const jsonCourierAsc = await resCourierAsc.json();
      assert.strictEqual(jsonCourierAsc.orders[0].id, orderAlpha.id);
      assert.strictEqual(jsonCourierAsc.orders[1].id, orderOmega.id);

      // 2. Sort by courierPartner desc
      const reqSortCourierDesc = new NextRequest(
        `http://localhost:3001/api/orders?sortBy=courierPartner&sortDir=desc&search=TEST-SORT-`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const resCourierDesc = await getOrders(reqSortCourierDesc);
      const jsonCourierDesc = await resCourierDesc.json();
      assert.strictEqual(jsonCourierDesc.orders[0].id, orderOmega.id);
      assert.strictEqual(jsonCourierDesc.orders[1].id, orderAlpha.id);

      // 3. Sort by warehouseName asc
      const reqSortWhAsc = new NextRequest(
        `http://localhost:3001/api/orders?sortBy=warehouseName&sortDir=asc&search=TEST-SORT-`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const resWhAsc = await getOrders(reqSortWhAsc);
      const jsonWhAsc = await resWhAsc.json();
      assert.strictEqual(jsonWhAsc.orders[0].id, orderAlpha.id);
      assert.strictEqual(jsonWhAsc.orders[1].id, orderOmega.id);

      // 4. Sort by boxCount desc
      const reqSortBoxDesc = new NextRequest(
        `http://localhost:3001/api/orders?sortBy=boxCount&sortDir=desc&search=TEST-SORT-`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const resBoxDesc = await getOrders(reqSortBoxDesc);
      const jsonBoxDesc = await resBoxDesc.json();
      assert.strictEqual(jsonBoxDesc.orders[0].id, orderOmega.id);
      assert.strictEqual(jsonBoxDesc.orders[1].id, orderAlpha.id);

      // 5. Quick Date: "today" must match orderAlpha and NOT orderOmega
      const reqQuickToday = new NextRequest(
        `http://localhost:3001/api/orders?quickDate=today&search=TEST-SORT-`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const resQuickToday = await getOrders(reqQuickToday);
      const jsonQuickToday = await resQuickToday.json();
      assert(
        jsonQuickToday.orders.some((o: any) => o.id === orderAlpha.id),
        "quickDate=today must include order scheduled/picked up today"
      );
      assert(
        !jsonQuickToday.orders.some((o: any) => o.id === orderOmega.id),
        "quickDate=today must NOT include order scheduled tomorrow"
      );

      // 6. Quick Date: "tomorrow" must match orderOmega and NOT orderAlpha
      const reqQuickTomorrow = new NextRequest(
        `http://localhost:3001/api/orders?quickDate=tomorrow&search=TEST-SORT-`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const resQuickTomorrow = await getOrders(reqQuickTomorrow);
      const jsonQuickTomorrow = await resQuickTomorrow.json();
      assert(
        jsonQuickTomorrow.orders.some((o: any) => o.id === orderOmega.id),
        "quickDate=tomorrow must include order scheduled/picked up tomorrow"
      );
      assert(
        !jsonQuickTomorrow.orders.some((o: any) => o.id === orderAlpha.id),
        "quickDate=tomorrow must NOT include order scheduled today"
      );
    } finally {
      await db.consignmentOrder.deleteMany({
        where: { id: { in: [orderAlpha.id, orderOmega.id] } },
      });
    }
  });

  it("15. Isolated Personal Notes: Multi-line Unicode, Emoji & Zero Contamination of Consignment Data", async () => {
    const emojiNote = "⚡ URGENT REMINDER:\n- Driver Ramesh (📞 +91-9876543210)\n- Reserved Dock #4 🚛\n- Special QC seal required! 🔒";

    // Save emoji note
    const reqNote = new NextRequest(`http://localhost:3001/api/orders/${testOrderId}/note`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ note: emojiNote }),
    });
    const resNote = await saveNote(reqNote, { params: Promise.resolve({ id: testOrderId }) });
    assert.strictEqual(resNote.status, 200);

    // Read back via table list
    const reqList = new NextRequest(`http://localhost:3001/api/orders?search=${testOrderId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resList = await getOrders(reqList);
    const jsonList = await resList.json();
    const found = jsonList.orders.find((o: any) => o.id === testOrderId);
    assert.strictEqual(found?.personalNote, emojiNote, "Personal note must preserve Unicode and emoji");

    // Verify ConsignmentOrder.comment is still isolated and untouched
    const orderInDb = await db.consignmentOrder.findUnique({ where: { id: testOrderId } });
    assert.strictEqual(
      orderInDb?.comment,
      "Admin confirmed slot with Swiggy Bangalore warehouse manager",
      "Consignment comment must be completely untouched by unicode/emoji note"
    );

    // Clean up note
    await db.appointmentNote.deleteMany({ where: { orderId: testOrderId } });
  });

  it("16. Clean Up Test Order & Personal Notes", async () => {
    // Delete test order and related audit entries
    await db.appointmentNote.deleteMany({ where: { orderId: testOrderId } });
    await db.orderStatusHistory.deleteMany({ where: { orderId: testOrderId } });
    await db.auditLog.deleteMany({ where: { orderId: testOrderId } });
    await db.consignmentOrder.delete({ where: { id: testOrderId } });

    const exists = await db.consignmentOrder.findUnique({ where: { id: testOrderId } });
    assert.strictEqual(exists, null, "Test order cleanly deleted");
  });
});
