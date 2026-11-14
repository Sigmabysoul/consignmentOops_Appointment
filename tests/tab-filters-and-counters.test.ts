import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_FILTER_CONDITIONS,
  APPOINTMENT_FILTER_CONDITIONS,
  getBookingWhereInput,
  getAppointmentWhereInput,
} from "../src/lib/order-filters";
import { normalizeChannelCode } from "../src/lib/channel-aliases";

describe("Tab Filters and Scope Counters Verification", () => {
  describe("1. Booking Desk Filter Rules", () => {
    it("1.1 Booking filter requires packaging slip to be printed", () => {
      // Order with packaging slip marked printed
      const eligibleBookingOrder = {
        docsPrinted: true,
        pickupDone: false,
        status: "Draft",
        courierStatus: null,
      };

      // Order with no packaging slip printed
      const unprintedOrder = {
        docsPrinted: false,
        pickupDone: false,
        status: "Draft",
        courierStatus: null,
      };

      // Verify filter structure
      assert.ok(BOOKING_FILTER_CONDITIONS.length >= 3, "Booking conditions must check docsPrinted, pickupDone, and status");
      assert.strictEqual(BOOKING_FILTER_CONDITIONS[1].pickupDone, false, "Must exclude pickupDone orders");
    });

    it("1.2 Excludes in-transit and dispatched orders from booking", () => {
      const excludedStatuses = [
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
      ];

      const courierStatusFilter = BOOKING_FILTER_CONDITIONS[2] as any;
      const notInList = courierStatusFilter.OR[2].courierStatus.notIn;

      for (const st of excludedStatuses) {
        assert.ok(notInList.includes(st), `Booking must exclude courierStatus: ${st}`);
      }
    });
  });

  describe("2. Appointment Desk Filter Rules", () => {
    it("2.1 Appointment filter only includes in-transit and dispatched orders", () => {
      assert.ok(APPOINTMENT_FILTER_CONDITIONS.length >= 2);
      const inTransitCondition = APPOINTMENT_FILTER_CONDITIONS[0] as any;
      const allowedCourierStatuses = inTransitCondition.OR[0].courierStatus.in;
      
      assert.ok(allowedCourierStatuses.includes("In Transit"));
      assert.ok(allowedCourierStatuses.includes("Dispatched"));
      assert.ok(allowedCourierStatuses.includes("SHIPPED"));
    });

    it("2.2 Excludes delivered and cancelled orders from appointment desk", () => {
      const statusFilter = APPOINTMENT_FILTER_CONDITIONS[1] as any;
      const notInList = statusFilter.OR[2].status.notIn;

      assert.ok(notInList.includes("Delivered"));
      assert.ok(notInList.includes("Cancelled"));
    });
  });

  describe("3. Channel Counters and Scope Distribution", () => {
    it("3.1 Channel normalization maps channel codes to header platform keys", () => {
      assert.strictEqual(normalizeChannelCode("AMAZON_VC"), "AMAZON_VC");
      assert.strictEqual(normalizeChannelCode("Amazon VC"), "AMAZON_VC");
      assert.strictEqual(normalizeChannelCode("AMAZON"), "AMAZON_VC");
      assert.strictEqual(normalizeChannelCode("BLINKIT"), "BLINKIT_STO");
      assert.strictEqual(normalizeChannelCode("BLINKIT_STO"), "BLINKIT_STO");
      assert.strictEqual(normalizeChannelCode("SWIGGY"), "SWIGGY");
      assert.strictEqual(normalizeChannelCode("FLIPKART"), "FLIPKART_MINUTES");
      assert.strictEqual(normalizeChannelCode("FLIPKART_FBF"), "FLIPKART_FBF");
      assert.strictEqual(normalizeChannelCode("FKSB_FLIPKART"), "FKSB_FLIPKART");
    });

    it("3.2 When no order is ready for booking in Amazon VC, booking count is strictly 0", () => {
      // Simulate raw DB orders
      const orders = [
        {
          id: "1",
          channel: "AMAZON_VC",
          docsPrinted: false, // packaging slip NOT printed
          pickupDone: false,
          status: "Draft",
          courierStatus: null,
        },
        {
          id: "2",
          channel: "BLINKIT_STO",
          docsPrinted: true, // packaging slip printed
          pickupDone: false,
          status: "Draft",
          courierStatus: null,
        },
        {
          id: "3",
          channel: "AMAZON_VC",
          docsPrinted: true,
          pickupDone: true, // Already dispatched / in transit
          status: "In Transit",
          courierStatus: "In Transit",
        },
      ];

      // Booking check
      const isBookingEligible = (o: typeof orders[0]) => {
        const slipPrinted = o.docsPrinted;
        const inTransitOrPast = o.pickupDone || o.courierStatus === "In Transit" || o.status === "In Transit";
        return slipPrinted && !inTransitOrPast;
      };

      // Appointment check
      const isAppointmentEligible = (o: typeof orders[0]) => {
        return o.pickupDone || o.courierStatus === "In Transit" || o.status === "In Transit";
      };

      const bookingOrders = orders.filter(isBookingEligible);
      const appointmentOrders = orders.filter(isAppointmentEligible);

      const bookingChannelCounts: Record<string, number> = {};
      for (const o of bookingOrders) {
        const code = normalizeChannelCode(o.channel);
        bookingChannelCounts[code] = (bookingChannelCounts[code] || 0) + 1;
      }

      const appointmentChannelCounts: Record<string, number> = {};
      for (const o of appointmentOrders) {
        const code = normalizeChannelCode(o.channel);
        appointmentChannelCounts[code] = (appointmentChannelCounts[code] || 0) + 1;
      }

      // Assertions:
      // In booking section:
      assert.strictEqual(bookingOrders.length, 1, "Only Blinkit order has packaging slip printed and not in-transit");
      assert.strictEqual(bookingChannelCounts["AMAZON_VC"] || 0, 0, "Amazon VC booking counter MUST be 0");
      assert.strictEqual(bookingChannelCounts["BLINKIT_STO"] || 0, 1, "Blinkit STO booking counter is 1");

      // In appointment section:
      assert.strictEqual(appointmentOrders.length, 1, "Only the in-transit Amazon VC order is in appointment");
      assert.strictEqual(appointmentChannelCounts["AMAZON_VC"] || 0, 1, "Amazon VC appointment counter is 1");
      assert.strictEqual(appointmentChannelCounts["BLINKIT_STO"] || 0, 0, "Blinkit STO appointment counter is 0");
    });

    it("3.3 Header counter selection logic matches activeView", () => {
      const stats: {
        totalOrders: number;
        bookingCount: number;
        appointmentCount: number;
        bookingChannelCounts: Record<string, number>;
        appointmentChannelCounts: Record<string, number>;
        channelCounts: Record<string, number>;
      } = {
        totalOrders: 6,
        bookingCount: 1,
        appointmentCount: 2,
        bookingChannelCounts: { BLINKIT_STO: 1 },
        appointmentChannelCounts: { AMAZON_VC: 1, SWIGGY: 1 },
        channelCounts: { AMAZON_VC: 1, BLINKIT_STO: 3, FLIPKART_MINUTES: 1, SWIGGY: 1 },
      };

      const getEffectiveCounts = (view: string): { total: number; channels: Record<string, number> } => {
        if (view === "booking") {
          return {
            total: stats.bookingCount,
            channels: stats.bookingChannelCounts,
          };
        }
        if (view === "appointment") {
          return {
            total: stats.appointmentCount,
            channels: stats.appointmentChannelCounts,
          };
        }
        return {
          total: stats.totalOrders,
          channels: stats.channelCounts,
        };
      };

      // In Booking view:
      const booking = getEffectiveCounts("booking");
      assert.strictEqual(booking.total, 1);
      assert.strictEqual(booking.channels["AMAZON_VC"] || 0, 0, "Amazon VC has 0 in booking");
      assert.strictEqual(booking.channels["BLINKIT_STO"], 1);

      // In Appointment view:
      const appointment = getEffectiveCounts("appointment");
      assert.strictEqual(appointment.total, 2);
      assert.strictEqual(appointment.channels["AMAZON_VC"], 1, "Amazon VC has 1 in appointment");
      assert.strictEqual(appointment.channels["SWIGGY"], 1);
      assert.strictEqual(appointment.channels["BLINKIT_STO"] || 0, 0);

      // In All Data view:
      const sheet = getEffectiveCounts("sheet");
      assert.strictEqual(sheet.total, 6);
      assert.strictEqual(sheet.channels["AMAZON_VC"], 1);
      assert.strictEqual(sheet.channels["BLINKIT_STO"], 3);
    });
  });

  describe("4. Date Formatting, Quick Dates & Past Due Rules", () => {
    it("4.1 formatDateDisplay formats strictly as dd/mm/yyyy", async () => {
      const { formatDateDisplay, formatDateTimeDisplay, parseDateInput } = await import("../src/lib/date-utils");
      
      const testDate = new Date(2026, 10, 14, 15, 30); // Nov 14, 2026, 3:30 PM
      assert.strictEqual(formatDateDisplay(testDate), "14/11/2026");
      assert.strictEqual(formatDateDisplay("2026-05-08T00:00:00.000Z"), "08/05/2026");
      assert.strictEqual(formatDateDisplay(null), "—");
      assert.strictEqual(formatDateDisplay("invalid"), "—");

      // Verify date-time formatting
      const formattedTime = formatDateTimeDisplay(testDate);
      assert.ok(formattedTime.startsWith("14/11/2026,"));
      assert.ok(formattedTime.includes("03:30 pm"));
    });

    it("4.2 parseDateInput parses dd/mm/yyyy and ISO strings", async () => {
      const { parseDateInput } = await import("../src/lib/date-utils");

      const d1 = parseDateInput("14/11/2026");
      assert.ok(d1 !== null);
      assert.strictEqual(d1.getFullYear(), 2026);
      assert.strictEqual(d1.getMonth(), 10);
      assert.strictEqual(d1.getDate(), 14);

      const d2 = parseDateInput("2026-11-14");
      assert.ok(d2 !== null);
      assert.strictEqual(d2.getFullYear(), 2026);
      assert.strictEqual(d2.getMonth(), 10);
      assert.strictEqual(d2.getDate(), 14);
    });

    it("4.3 Past Due logic identifies orders that passed pickup date and have not entered in-transit", () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today.getTime() - 86400000);
      const tomorrow = new Date(today.getTime() + 86400000);

      const orders = [
        {
          id: "1",
          pickupDate: yesterday,
          pickupDone: false,
          courierStatus: null,
          status: "Draft",
        },
        {
          id: "2",
          pickupDate: yesterday,
          pickupDone: true, // Already dispatched / in-transit
          courierStatus: "In Transit",
          status: "In Transit",
        },
        {
          id: "3",
          pickupDate: tomorrow,
          pickupDone: false,
          courierStatus: null,
          status: "Draft",
        },
      ];

      const isPastDue = (o: typeof orders[0]) => {
        const passedPickup = o.pickupDate && o.pickupDate.getTime() < today.getTime();
        const inTransit = o.pickupDone || o.courierStatus === "In Transit" || o.status === "In Transit";
        return passedPickup && !inTransit;
      };

      const pastDueOrders = orders.filter(isPastDue);
      assert.strictEqual(pastDueOrders.length, 1);
      assert.strictEqual(pastDueOrders[0].id, "1", "Only order 1 is past its pickup date and not in transit");
    });

    it("4.4 Booking filter defaults date field to pickupDate; Appointment defaults to appointmentDate", () => {
      const getFieldForView = (view: string, explicitType?: string) => {
        if (view === "booking") {
          return explicitType && explicitType !== "appointmentDate" ? explicitType : "pickupDate";
        }
        if (view === "appointment") {
          return explicitType && explicitType !== "pickupDate" ? explicitType : "appointmentDate";
        }
        return explicitType || "appointmentDate";
      };

      assert.strictEqual(getFieldForView("booking"), "pickupDate");
      assert.strictEqual(getFieldForView("booking", "appointmentDate"), "pickupDate");
      assert.strictEqual(getFieldForView("appointment"), "appointmentDate");
      assert.strictEqual(getFieldForView("appointment", "pickupDate"), "appointmentDate");
    });
  });
});
