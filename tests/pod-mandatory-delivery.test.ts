import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { createSession } from "../src/lib/auth";
import { PATCH } from "../src/app/api/orders/[id]/route";
import { POST as deliverRoute } from "../src/app/api/orders/[id]/deliver/route";
import { GET as podRoute } from "../src/app/api/orders/[id]/pod/route";
import { getPodRecord, hasPodOnRecord, isAcceptedPodFile } from "../src/lib/pod";

const RO = `TEST-POD-${Date.now()}`;

describe("Mark Delivered requires a POD", () => {
  let token = "";
  let orderId = "";
  const ctx = () => ({ params: Promise.resolve({ id: orderId }) });
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const deliverReq = (file?: File, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    if (file) fd.append("file", file);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return new NextRequest(`http://localhost:3001/api/orders/${orderId}/deliver`, { method: "POST", body: fd, headers: auth() });
  };

  before(async () => {
    const admin = await db.user.findFirst({ where: { role: "ADMIN", isActive: true } });
    assert(admin, "an active admin user must exist in the shared DB");
    token = await createSession(admin.id);
    const order = await db.consignmentOrder.create({
      data: { roPoNumber: RO, channel: "SWIGGY", status: "In Transit", courierStatus: "In Transit", pickupDone: true },
    });
    orderId = order.id;
  });

  after(async () => {
    await db.orderDocument.deleteMany({ where: { roPoNumber: RO } });
    await db.consignmentOrder.deleteMany({ where: { roPoNumber: RO } });
  });

  it("1. pure helpers", () => {
    assert.equal(isAcceptedPodFile("pod.PDF"), true);
    assert.equal(isAcceptedPodFile("photo.jpeg"), true);
    assert.equal(isAcceptedPodFile("pod.html"), false);
    assert.equal(hasPodOnRecord({}), false);
    assert.equal(hasPodOnRecord({ pod: { documentId: "x" } }), true);
  });

  it("2. PATCH to Delivered without a POD is refused", async () => {
    for (const body of [{ status: "Delivered" }, { courierStatus: "Delivered" }]) {
      const res = await PATCH(
        new NextRequest(`http://localhost:3001/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...auth() },
          body: JSON.stringify(body),
        }),
        ctx()
      );
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, "POD_REQUIRED");
    }
    const ord = await db.consignmentOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(ord.status, "In Transit");
  });

  it("3. deliver without file / with a disallowed file type is refused", async () => {
    assert.equal((await deliverRoute(deliverReq(), ctx())).status, 400);
    const html = new File(["<script>alert(1)</script>"], "pod.html", { type: "text/html" });
    assert.equal((await deliverRoute(deliverReq(html), ctx())).status, 415);
  });

  it("4. deliver with POD → Delivered, POD stored and served", async () => {
    const file = new File(["%PDF-1.4 signed pod"], "signed pod.pdf", { type: "application/pdf" });
    const res = await deliverRoute(deliverReq(file, { deliveryDate: "2026-11-16", remarks: "1 carton tape torn" }), ctx());
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));

    const ord = await db.consignmentOrder.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(ord.status, "Delivered");
    assert.equal(ord.courierStatus, "Delivered");
    assert.equal(ord.grnStatus, "Awaiting GRN");
    const pod = getPodRecord(ord.customData);
    assert(pod);
    assert.equal(pod.fileName, "signed_pod.pdf");
    assert.equal(pod.source, "APPOINTMENT_APP");

    const doc = await db.orderDocument.findUniqueOrThrow({ where: { id: pod.documentId }, include: { blob: true } });
    assert.equal(doc.docType, "POD");
    assert.equal(doc.fileUrl, `/api/documents/${doc.id}/file`);
    assert.equal(Buffer.from(doc.blob!.data).toString(), "%PDF-1.4 signed pod");

    const hist = await db.orderStatusHistory.findFirst({ where: { orderId, toStatus: "Delivered" } });
    assert.equal(hist?.reason, "1 carton tape torn");

    const served = await podRoute(new NextRequest(`http://localhost:3001/api/orders/${orderId}/pod`, { headers: auth() }), ctx());
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "application/pdf");
  });

  it("5. an already delivered order cannot be delivered again", async () => {
    const file = new File(["%PDF-1.4"], "pod2.pdf", { type: "application/pdf" });
    assert.equal((await deliverRoute(deliverReq(file), ctx())).status, 409);
  });
});
