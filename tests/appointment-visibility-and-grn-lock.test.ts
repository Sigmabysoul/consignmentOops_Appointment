import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { createSession } from "../src/lib/auth";
import { GET as listOrders } from "../src/app/api/orders/route";
import { GET as getOrder, PATCH } from "../src/app/api/orders/[id]/route";
import { isVisibleInAppointmentApp } from "../src/lib/order-filters";

const S = Date.now().toString().slice(-7);
const ROS = {
  draft: `TESTVIS-DRAFT-${S}`,
  fresh: `TESTVIS-NEW-${S}`,
  cancelled: `TESTVIS-CXL-${S}`,
  archived: `TESTVIS-ARC-${S}`,
  processing: `TESTVIS-PROC-${S}`,
  transit: `TESTVIS-TRN-${S}`,
};

describe("Appointment app shows only orders from In Processing onward; GRN / cancel are main-app only", () => {
  let token = "";
  const ids: Record<string, string> = {};
  const auth = () => ({ Authorization: `Bearer ${token}` });

  before(async () => {
    const admin = await db.user.findFirst({ where: { role: "ADMIN", isActive: true } });
    assert(admin);
    token = await createSession(admin.id);
    const rows: [keyof typeof ROS, any][] = [
      ["draft", { status: "Draft" }],
      ["fresh", { status: "New" }],
      ["cancelled", { status: "Cancelled", docsPrinted: true }],
      ["archived", { status: "Archive", isArchived: true, pickupDone: true }],
      ["processing", { status: "In Progress", docsPrinted: true }],
      ["transit", { status: "In Transit", courierStatus: "In Transit", pickupDone: true }],
    ];
    for (const [k, data] of rows) {
      ids[k] = (await db.consignmentOrder.create({ data: { roPoNumber: ROS[k], channel: "SWIGGY", ...data } })).id;
    }
  });

  after(async () => {
    await db.consignmentOrder.deleteMany({ where: { roPoNumber: { in: Object.values(ROS) } } });
  });

  it("1. list (All Data, Kanban source) excludes Draft, New, Cancelled, Archived", async () => {
    const res = await listOrders(new NextRequest(`http://localhost:3001/api/orders?tab=all&search=TESTVIS-&pageSize=100`, { headers: auth() }));
    const body = await res.json();
    const ros = new Set((body.orders || []).map((o: any) => o.roPoNumber));
    assert.ok(ros.has(ROS.processing), "In Processing order must show");
    assert.ok(ros.has(ROS.transit), "In Transit order must show");
    for (const k of ["draft", "fresh", "cancelled", "archived"] as const) assert.ok(!ros.has(ROS[k]), `${k} must be hidden`);

    const cxl = await listOrders(new NextRequest(`http://localhost:3001/api/orders?tab=cancelled&search=TESTVIS-`, { headers: auth() }));
    assert.equal(((await cxl.json()).orders || []).length, 0);
  });

  it("2. hidden orders cannot be opened or edited by id", async () => {
    for (const k of ["draft", "cancelled"] as const) {
      const res = await getOrder(new NextRequest(`http://localhost:3001/api/orders/${ids[k]}`, { headers: auth() }), { params: Promise.resolve({ id: ids[k] }) });
      assert.equal(res.status, 404, k);
    }
    assert.equal(isVisibleInAppointmentApp({ status: "In Progress" }), true);
    assert.equal(isVisibleInAppointmentApp({ status: "New" }), false);
    assert.equal(isVisibleInAppointmentApp({ status: "In Transit", courierStatus: "Cancelled" }), false);
  });

  it("3. GRN Issue, grn fields and Cancelled are refused", async () => {
    const patch = (body: unknown) =>
      PATCH(
        new NextRequest(`http://localhost:3001/api/orders/${ids.transit}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...auth() },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: ids.transit }) }
      );
    for (const body of [{ status: "GRN Issue" }, { courierStatus: "GRN Issue" }, { grnReport: "x" }, { status: "Cancelled" }]) {
      const res = await patch(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    const o = await db.consignmentOrder.findUniqueOrThrow({ where: { id: ids.transit } });
    assert.equal(o.status, "In Transit");
  });
});
