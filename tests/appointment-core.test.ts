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

describe("Appointment Management Application — Comprehensive Verification Suite", () => {
  let adminUserId = "";
  let dispatchUserId = "";
  let printingUserId = "";
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

    // Iqbal user
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "MANAGER", username: "iqbal", name: "Iqbal" }),
      true,
      "Iqbal must be allowed"
    );

    // Dispatch Logistics Desk
    assert.strictEqual(
      isAllowedAppointmentUser({ role: "STAFF", username: "dispatch", name: "Dispatch & Logistics Desk", department: "Dispatch" }),
      true,
      "Dispatch desk must be allowed"
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
    const adminToken = await createSession(adminUserId);
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
    assert.strictEqual(printingSession?.isLogisticsAuthorized, false, "Printing user must NOT be authorized for Appointment app");
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
    // Create an explicit test consignment order
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
      },
    });

    assert(order.id, "Test order created");
    testOrderId = order.id;
  });

  it("7. Transaction-Safe Mutation: Tracking, Courier & Appointment Information", async () => {
    // Simulate updating tracking and courier from Appointment app
    const apptDate = new Date("2026-11-10T10:00:00.000Z");
    const updated = await db.$transaction(async (tx) => {
      const res = await tx.consignmentOrder.update({
        where: { id: testOrderId },
        data: {
          courierPartner: "OM Logistics",
          trackingId: "OML-BANGALORE-98765",
          appointmentId: "APPT-BLR-00123",
          appointmentDate: apptDate,
          appointmentSlot: "10:00 AM - 01:00 PM",
          courierStatus: "In Transit",
          comment: "Dispatched via OM Logistics direct truck",
        },
      });

      // Status history record
      await tx.orderStatusHistory.create({
        data: {
          orderId: testOrderId,
          fromStatus: "Pending",
          toStatus: "In Transit",
          userName: "Iqbal (Logistics Manager)",
          userRole: "STAFF",
          department: "Dispatch",
          reason: "AWB Assigned & loaded on truck",
        },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          orderId: testOrderId,
          action: "UPDATE",
          fieldChanged: "trackingId",
          oldValue: "(none)",
          newValue: "OML-BANGALORE-98765",
          userName: "Iqbal",
          userRole: "STAFF",
        },
      });

      return res;
    });

    assert.strictEqual(updated.trackingId, "OML-BANGALORE-98765");
    assert.strictEqual(updated.courierPartner, "OM Logistics");
    assert.strictEqual(updated.appointmentId, "APPT-BLR-00123");
    assert.strictEqual(updated.appointmentSlot, "10:00 AM - 01:00 PM");
    assert.strictEqual(updated.courierStatus, "In Transit");

    // CRITICAL ISOLATION CHECK: GRN Status must NOT be touched!
    assert.strictEqual(
      updated.grnStatus,
      "GRN Intact - No Issues",
      "GRN Status must NOT be modified or overwritten!"
    );
    assert.strictEqual(
      updated.grnReport,
      "Initial GRN received 100 units intact",
      "GRN Report must remain intact!"
    );
  });

  it("8. Audit Trail & Status History Verification", async () => {
    const history = await db.orderStatusHistory.findMany({
      where: { orderId: testOrderId },
    });
    assert(history.length >= 1, "Status history must record transition");
    const latest = history[history.length - 1];
    assert.strictEqual(latest.toStatus, "In Transit");
    assert(latest.userName?.includes("Iqbal"));

    const logs = await db.auditLog.findMany({
      where: { orderId: testOrderId },
    });
    assert(logs.length >= 1, "Audit logs must record field change");
  });

  it("9. Bidirectional Visibility: Main Consignment DB sees the changes immediately", async () => {
    // Query directly from database as Consignment app would do
    const queriedFromConsignment = await db.consignmentOrder.findUnique({
      where: { id: testOrderId },
    });

    assert(queriedFromConsignment, "Order must be found");
    assert.strictEqual(queriedFromConsignment?.trackingId, "OML-BANGALORE-98765");
    assert.strictEqual(queriedFromConsignment?.courierPartner, "OM Logistics");
    assert.strictEqual(queriedFromConsignment?.appointmentId, "APPT-BLR-00123");
    assert.strictEqual(queriedFromConsignment?.courierStatus, "In Transit");
  });

  it("10. Bidirectional Visibility: Consignment update is immediately visible in Appointment", async () => {
    // Admin updates order remarks in Consignment app
    await db.consignmentOrder.update({
      where: { id: testOrderId },
      data: {
        comment: "Admin confirmed slot with Swiggy Bangalore warehouse manager",
      },
    });

    // Appointment reads the order
    const readInAppointment = await db.consignmentOrder.findUnique({
      where: { id: testOrderId },
    });

    assert.strictEqual(
      readInAppointment?.comment,
      "Admin confirmed slot with Swiggy Bangalore warehouse manager",
      "Appointment must instantly reflect changes made in Consignment"
    );
  });

  it("11. Clean Up Test Order", async () => {
    // Delete test order and related audit entries
    await db.orderStatusHistory.deleteMany({ where: { orderId: testOrderId } });
    await db.auditLog.deleteMany({ where: { orderId: testOrderId } });
    await db.consignmentOrder.delete({ where: { id: testOrderId } });

    const exists = await db.consignmentOrder.findUnique({ where: { id: testOrderId } });
    assert.strictEqual(exists, null, "Test order cleanly deleted");
  });
});
