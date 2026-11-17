/**
 * Tests for the PROVISIONAL Delhivery response mappers.
 *
 * The response bodies below are SYNTHETIC (Delhivery does not document responses and no staging
 * fixtures exist yet). They check the mappers' safety rules: find likely fields, never invent a
 * value, and return null / [] when nothing matches. Replace with real fixtures from
 * tests/fixtures/delhivery/ after `npm run delhivery:discover`.
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildAppointmentBody,
  DelhiveryError,
  extractDelhiveryMessage,
  mapFreight,
  mapFreightBreakup,
  mapLabelUrls,
  mapManifestJobId,
  mapManifestStatus,
  mapPickupId,
  mapServiceability,
  mapTat,
  mapTrack,
} from "../src/modules/delhivery";

describe("mappers never guess", () => {
  test("empty / unrelated bodies map to nulls", () => {
    for (const body of [null, {}, "ok", { foo: { bar: 1 } }]) {
      assert.equal(mapServiceability(body).serviceable, null);
      assert.equal(mapTat(body).days, null);
      assert.equal(mapFreight(body).total, null);
      assert.equal(mapManifestJobId(body), null);
      assert.equal(mapManifestStatus(body).lrn, null);
      assert.equal(mapTrack(body).status, null);
      assert.deepEqual(mapLabelUrls(body), []);
    }
  });
});

describe("serviceability / TAT", () => {
  test("finds nested flags and days", () => {
    const s = mapServiceability({ data: { serviceable: "true", is_oda: false } });
    assert.equal(s.serviceable, true);
    assert.equal(s.oda, false);
    assert.deepEqual(s.matched, ["data.serviceable", "data.is_oda"]);
    assert.equal(mapTat({ data: { tat: "4" } }).days, 4);
    assert.equal(mapTat({ data: { tat: 4000 } }).days, null, "implausible TAT is rejected");
  });
});

describe("freight", () => {
  test("total and charge lines are 2-decimal", () => {
    const f = mapFreight({ data: { total: 1234.567, gst: 188.3, price_breakup: { base_freight: 900.1, fuel: 0, docket_charge: 100 } } });
    assert.equal(f.total, 1234.57);
    assert.equal(f.gst, 188.3);
    assert.deepEqual(f.lines, [
      { label: "base freight", amount: 900.1 },
      { label: "docket charge", amount: 100 },
    ]);
  });
  test("prefers 'total' over a generic 'amount'", () => {
    assert.equal(mapFreight({ amount: 5, nested: { total: 50 } }).total, 50);
  });
  test("breakup is scoped per LR", () => {
    const body = { data: [{ lrn: "111", total: 10 }, { lrn: "222", total: 20 }] };
    const out = mapFreightBreakup(body, ["111", "222"]);
    assert.equal(out["111"].total, 10);
    assert.equal(out["222"].total, 20);
  });
});

describe("manifest", () => {
  test("job id", () => {
    assert.equal(mapManifestJobId({ data: { job_id: "abc-123" } }), "abc-123");
  });
  test("success needs an LR; AWBs collected and de-duplicated", () => {
    const m = mapManifestStatus({ status: "Complete", data: { lrn: "220012345", waybills: ["AWB000001", "AWB000002", "AWB000001"] } });
    assert.equal(m.state, "success");
    assert.equal(m.lrn, "220012345");
    assert.deepEqual(m.awbs, ["AWB000001", "AWB000002"]);
  });
  test("'complete' without an LR is not treated as booked", () => {
    assert.equal(mapManifestStatus({ status: "Complete" }).state, "unknown");
  });
  test("pending and failed", () => {
    assert.equal(mapManifestStatus({ status: "Processing" }).state, "pending");
    const f = mapManifestStatus({ status: "Failed", error: "Invalid pickup location" });
    assert.equal(f.state, "failed");
    assert.equal(f.message, "Invalid pickup location");
  });
});

describe("tracking", () => {
  test("recognises documented statuses anywhere in the body", () => {
    const t = mapTrack({ data: [{ wbn: "x", current: { scan: "picked up", location: "Kolkata" } }, { status: "LEFT_ORIGIN" }] });
    assert.equal(t.status, "LEFT_ORIGIN");
    assert.equal(t.location, "Kolkata");
  });
  test("normalises spacing/case", () => {
    assert.equal(mapTrack({ status: "out-for-delivery" }).status, null);
    assert.equal(mapTrack({ status: "reach destination" }).status, "REACH_DESTINATION");
  });
});

describe("labels / pickup / errors", () => {
  test("label URLs in order, de-duplicated", () => {
    assert.deepEqual(mapLabelUrls({ data: ["https://a/1", "https://a/2", "https://a/1", "not a url"] }), ["https://a/1", "https://a/2"]);
  });
  test("pickup id prefers specific keys over generic id", () => {
    assert.equal(mapPickupId({ id: 9, data: { pickup_id: "PUR77" } }), "PUR77");
  });
  test("error message extraction", () => {
    assert.equal(extractDelhiveryMessage({ errors: ["a", "b"] }), "a; b");
    assert.equal(extractDelhiveryMessage({ x: 1 }), null);
  });
});

describe("appointment body (portal v2 format)", () => {
  const base = {
    lrn: " 220192589 ",
    date: "23/07/2026",
    slot: "12:00 PM-03:00 PM" as const,
    poNumbers: ["2273410057461", " "],
    appointmentId: "",
    poExpiryDate: "25/07/2026",
  };
  test("matches the portal example shape", () => {
    assert.deepEqual(buildAppointmentBody(base), {
      lrn: "220192589",
      date: "23/07/2026",
      appointment_slot: "12:00 PM-03:00 PM",
      po_number: ["2273410057461"],
      appointment_id: "",
      po_expiry_date: "25/07/2026",
    });
  });
  test("no PO -> NotApplicable", () => {
    assert.deepEqual(buildAppointmentBody({ ...base, poNumbers: [] }).po_number, ["NotApplicable"]);
  });
  test("rejects bad slot, expiry before date, >5 POs", () => {
    const bad = (over: object) => assert.throws(() => buildAppointmentBody({ ...base, ...over } as any), DelhiveryError);
    bad({ slot: "10:00 AM-11:00 AM" });
    bad({ poExpiryDate: "22/07/2026" });
    bad({ poNumbers: ["1", "2", "3", "4", "5", "6"] });
    bad({ date: "2026-07-23" });
  });
});
