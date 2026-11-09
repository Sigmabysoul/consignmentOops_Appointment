import { test, describe } from "node:test";
import assert from "node:assert";
import {
  ensureAppointmentNoteTable,
  getAppointmentNotesMap,
  getSingleAppointmentNote,
  saveSingleAppointmentNote,
  deleteSingleAppointmentNote,
} from "../src/lib/appointment-notes";
import { db } from "../src/lib/db";

describe("Logistics WorkHub — Notes Resilience and Self-Healing", () => {
  test("ensureAppointmentNoteTable runs idempotently without error", async () => {
    await assert.doesNotReject(async () => {
      await ensureAppointmentNoteTable(db);
    });
  });

  test("getAppointmentNotesMap safely returns empty Map for empty orderIds", async () => {
    const map = await getAppointmentNotesMap([], db);
    assert.strictEqual(map.size, 0);
  });

  test("saveSingleAppointmentNote, getSingleAppointmentNote, and deleteSingleAppointmentNote cycle", async () => {
    const testOrderId = `test-order-${Date.now()}`;
    const testNote = "Urgent: Deliver before 5 PM";
    const author = "System Administrator";

    // Save note
    const saved = await saveSingleAppointmentNote(testOrderId, testNote, author, db);
    assert.ok(saved, "Note should be saved");
    assert.strictEqual(saved?.note, testNote);
    assert.strictEqual(saved?.updatedBy, author);

    // Retrieve note
    const retrieved = await getSingleAppointmentNote(testOrderId, db);
    assert.ok(retrieved, "Note should be retrieved");
    assert.strictEqual(retrieved?.note, testNote);

    // Retrieve via batch map
    const notesMap = await getAppointmentNotesMap([testOrderId], db);
    assert.ok(notesMap.has(testOrderId));
    assert.strictEqual(notesMap.get(testOrderId)?.note, testNote);

    // Delete note
    await deleteSingleAppointmentNote(testOrderId, db);
    const afterDelete = await getSingleAppointmentNote(testOrderId, db);
    assert.strictEqual(afterDelete, null, "Note should be deleted");
  });

  test("getAppointmentNotesMap handles simulated table drop or non-existing table gracefully", async () => {
    // Drop table temporarily to simulate fresh / unmigrated deployment
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "AppointmentNote";`);

    // Should self-heal automatically and NOT throw
    const result = await getAppointmentNotesMap(["random-id-123"], db);
    assert.ok(result instanceof Map);
    assert.strictEqual(result.size, 0);

    // Table should now be recreated
    await assert.doesNotReject(async () => {
      await saveSingleAppointmentNote("self-heal-check", "Verified", "admin", db);
      await deleteSingleAppointmentNote("self-heal-check", db);
    });
  });
});
