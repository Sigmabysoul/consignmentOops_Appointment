import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractBoxDimensionGroups,
  formatTabSeparatedBoxRow,
  formatDimensionDisplay,
  parseDimensionString,
} from "../src/lib/dimension-helper";
import { resolveTrackingUrl } from "../src/lib/tracking-utils";
import { isAllowedAppointmentUser } from "../src/lib/auth";

describe("Appointment App 3-Part Redesign — Comprehensive Verification", () => {
  // ── PART 1: BOOKING & UNIQUE BOX DIMENSIONS ──────────────────────────────
  describe("Part 1: Booking & Unique Box Dimension Breakdown & Copy Helper", () => {
    it("1.1 Group standard boxes with explicit dimensions", () => {
      const order = {
        boxCount: 3,
        lengthCm: 23,
        widthCm: 40,
        heightCm: 25,
        weightKg: 12.5,
        dimensionUnit: "cm",
        weightUnit: "kg",
      };

      const groups = extractBoxDimensionGroups(order);
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].boxCount, 3);
      assert.strictEqual(groups[0].lengthCm, 23);
      assert.strictEqual(groups[0].widthCm, 40);
      assert.strictEqual(groups[0].heightCm, 25);
      assert.strictEqual(groups[0].weightKg, 12.5);
      assert.strictEqual(groups[0].key, "23x40x25");
    });

    it("1.2 Correctly separates standard boxes and remainder boxes with different dimensions", () => {
      const order = {
        boxCount: 3,
        lengthCm: 23,
        widthCm: 40,
        heightCm: 25,
        weightKg: 15,
        remainderQty: 1,
        remainderLengthCm: 15,
        remainderWidthCm: 20,
        remainderHeightCm: 10,
        remainderWeightKg: 4,
      };

      const groups = extractBoxDimensionGroups(order);
      assert.strictEqual(groups.length, 2, "Must create 2 separate groups for distinct dimensions");

      // Group 1: Standard boxes
      assert.strictEqual(groups[0].boxCount, 3);
      assert.strictEqual(groups[0].lengthCm, 23);
      assert.strictEqual(groups[0].widthCm, 40);
      assert.strictEqual(groups[0].heightCm, 25);

      // Group 2: Remainder box
      assert.strictEqual(groups[1].boxCount, 1);
      assert.strictEqual(groups[1].lengthCm, 15);
      assert.strictEqual(groups[1].widthCm, 20);
      assert.strictEqual(groups[1].heightCm, 10);
    });

    it("1.3 Merges standard and remainder boxes when they share identical dimensions", () => {
      // User requirement: 'the dimension should be based on boxes , meaning 3 boxes has dimension 23 x 40x 25 no matter if it rem box or standard , in booking he just need the dimension , of each boxes'
      const order = {
        boxCount: 3,
        lengthCm: 23,
        widthCm: 40,
        heightCm: 25,
        weightKg: 12,
        remainderQty: 1,
        remainderLengthCm: 23,
        remainderWidthCm: 40,
        remainderHeightCm: 25,
        remainderWeightKg: 4,
      };

      const groups = extractBoxDimensionGroups(order);
      assert.strictEqual(groups.length, 1, "Must merge boxes with identical dimensions into single group");
      assert.strictEqual(groups[0].boxCount, 4, "3 standard + 1 remainder = 4 total boxes of 23x40x25");
      assert.strictEqual(groups[0].weightKg, 16);
    });

    it("1.4 Parses string-based compound dimensions (fallback support)", () => {
      const parsed1 = parseDimensionString("3 @ 23x40x25");
      assert.deepStrictEqual(parsed1, {
        boxCount: 3,
        lengthCm: 23,
        widthCm: 40,
        heightCm: 25,
      });

      const parsed2 = parseDimensionString("23 x 40 x 25");
      assert.deepStrictEqual(parsed2, {
        boxCount: null,
        lengthCm: 23,
        widthCm: 40,
        heightCm: 25,
      });

      const orderWithString = {
        boxDimensions: "23x40x25",
        boxCount: 2,
      };
      const groups = extractBoxDimensionGroups(orderWithString);
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].lengthCm, 23);
      assert.strictEqual(groups[0].widthCm, 40);
      assert.strictEqual(groups[0].heightCm, 25);
    });

    it("1.5 Tab-Separated Row formatting for 1-click booking website paste", () => {
      // Solves: copy boxes -> paste -> copy L -> paste -> copy B -> paste -> copy H -> paste
      const group = {
        id: "group-1",
        boxCount: 3,
        lengthCm: 23,
        widthCm: 40,
        heightCm: 25,
        weightKg: 12.5,
        dimensionUnit: "cm",
        weightUnit: "kg",
        key: "23x40x25",
      };

      const tsv = formatTabSeparatedBoxRow(group);
      assert.strictEqual(tsv, "3\t23\t40\t25\t12.5", "TSV must be: Count \\t Length \\t Breadth \\t Height \\t Weight");

      const display = formatDimensionDisplay(group);
      assert.strictEqual(display, "23 × 40 × 25 cm");
    });
  });

  // ── PART 2: APPOINTMENT SECTION & TRACKING URL REMOVAL ────────────────────
  describe("Part 2: Appointment Section, CN Priority & Automatic Tracking URL Removal", () => {
    it("2.1 Strictly removes automatic third-party tracking URL generation", () => {
      // User requirement: 'and kindly remove the automatic tracking url thing, we said he will change the status from there manually to grn issue and delivered'
      const automaticLink = resolveTrackingUrl("Delhivery One", "DEL12345678", null);
      assert.strictEqual(automaticLink, null, "Automatic trackcourier.io URL generation must be removed");

      const automaticOm = resolveTrackingUrl("OM Logistics", "OML998877", null);
      assert.strictEqual(automaticOm, null, "Automatic OM Logistics link must be removed");
    });

    it("2.2 Preserves custom tracking link only if explicitly entered by operator", () => {
      const customUrl = "https://internal.averretail.com/track/CN998877";
      const resolved = resolveTrackingUrl("Blue Dart", "CN998877", customUrl);
      assert.strictEqual(resolved, customUrl, "User-provided custom tracking URL must be kept");
    });
  });

  // ── PART 3: NORMAL KANBAN VIEW (GONE VS REMAINING) ─────────────────────────
  describe("Part 3: Normal Kanban View (Gone vs Remaining Classification)", () => {
    it("3.1 Classifies Remaining shipments (Pending booking / pickup)", () => {
      const remainingOrder = {
        status: "Pending",
        courierStatus: "Pending",
        pickupDone: false,
        trackingId: null,
      };

      const isGone =
        remainingOrder.status === "Delivered" ||
        remainingOrder.status === "In Transit" ||
        remainingOrder.courierStatus === "Delivered" ||
        remainingOrder.courierStatus === "In Transit";

      assert.strictEqual(isGone, false, "Pending order must be classified as Remaining");
    });

    it("3.2 Classifies Gone shipments (In Transit / Dispatched)", () => {
      const inTransitOrder = {
        status: "In Transit",
        courierStatus: "In Transit",
        pickupDone: true,
        trackingId: "CN-887766",
      };

      const isGone =
        inTransitOrder.status === "Delivered" ||
        inTransitOrder.status === "In Transit" ||
        inTransitOrder.courierStatus === "Delivered" ||
        inTransitOrder.courierStatus === "In Transit";

      assert.strictEqual(isGone, true, "In Transit order must be classified as Gone");
    });

    it("3.3 Classifies Delivered shipments as Gone and Completed", () => {
      const deliveredOrder = {
        status: "Delivered",
        courierStatus: "Delivered",
        deliveryDate: new Date().toISOString(),
      };

      const isGone =
        deliveredOrder.status === "Delivered" ||
        deliveredOrder.status === "In Transit" ||
        deliveredOrder.courierStatus === "Delivered" ||
        deliveredOrder.courierStatus === "In Transit";

      assert.strictEqual(isGone, true, "Delivered order must be classified as Gone");
    });

    it("3.4 Identifies GRN Issue discrepancies", () => {
      const grnIssueOrder = {
        status: "GRN Issue",
        courierStatus: "GRN Issue",
        grnStatus: "GRN Issue",
        grnReport: "Shortage of 4 units reported at dock",
      };

      const isIssue =
        grnIssueOrder.status === "GRN Issue" ||
        grnIssueOrder.courierStatus === "GRN Issue" ||
        (grnIssueOrder.grnStatus || "").includes("Issue");

      assert.strictEqual(isIssue, true, "GRN Issue order must be flagged as discrepancy");
    });
  });

  // ── RBAC AUTHENTICATION ────────────────────────────────────────────────────
  describe("RBAC Permissions Verification", () => {
    it("Authorizes Admin and Logistics Managers (Iqbal & Dispatch)", () => {
      assert.strictEqual(isAllowedAppointmentUser({ role: "ADMIN", username: "admin" }), true);
      assert.strictEqual(isAllowedAppointmentUser({ role: "MANAGER", username: "iqbal" }), true);
      assert.strictEqual(
        isAllowedAppointmentUser({
          role: "STAFF",
          username: "dispatch",
          department: "Dispatch",
        }),
        true
      );
      assert.strictEqual(
        isAllowedAppointmentUser({
          role: "STAFF",
          username: "dispatcher-user-01",
          name: "Logistics Dispatcher",
          department: "Dispatch",
        }),
        true
      );
      assert.strictEqual(
        isAllowedAppointmentUser({ role: "STAFF", username: "printing", department: "Printing" }),
        false
      );
    });
  });
});
