import { db } from "./db";

let isTableVerified = false;

/**
 * Ensures the isolated AppointmentNote table exists in the PostgreSQL database.
 * If missing, it creates the table on the fly without requiring manual migrations.
 */
export async function ensureAppointmentNoteTable(client: any = db): Promise<void> {
  if (isTableVerified) return;
  try {
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AppointmentNote" (
        "orderId" TEXT NOT NULL,
        "note" TEXT NOT NULL,
        "updatedBy" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AppointmentNote_pkey" PRIMARY KEY ("orderId")
      );
    `);
    isTableVerified = true;
  } catch (err: any) {
    console.warn("[AppointmentNotes] ensureTable warning:", err?.message || err);
  }
}

/**
 * Fetches private internal notes for a list of order IDs.
 * Never throws — if table doesn't exist or query fails, self-heals or returns empty map.
 */
export async function getAppointmentNotesMap(
  orderIds: string[],
  client: any = db
): Promise<Map<string, { orderId: string; note: string; updatedAt?: Date; updatedBy?: string | null }>> {
  if (!orderIds || orderIds.length === 0) return new Map();

  try {
    const notes = await client.appointmentNote.findMany({
      where: { orderId: { in: orderIds } },
    });
    isTableVerified = true;
    return new Map(notes.map((n: any) => [n.orderId, n]));
  } catch (err: any) {
    const isMissingTable =
      err?.code === "P2021" ||
      err?.message?.includes("AppointmentNote") ||
      err?.message?.includes("does not exist");

    if (isMissingTable) {
      isTableVerified = false;
      await ensureAppointmentNoteTable(client);
      try {
        const retryNotes = await client.appointmentNote.findMany({
          where: { orderId: { in: orderIds } },
        });
        return new Map(retryNotes.map((n: any) => [n.orderId, n]));
      } catch (retryErr) {
        console.warn("[AppointmentNotes] Retry failed after table creation:", retryErr);
        return new Map();
      }
    }

    console.warn("[AppointmentNotes] Failed to fetch notes:", err?.message || err);
    return new Map();
  }
}

/**
 * Fetches a single private internal note for an order.
 * Never throws — returns null if not found or table is missing.
 */
export async function getSingleAppointmentNote(
  orderId: string,
  client: any = db
): Promise<{ orderId: string; note: string; updatedAt?: Date; updatedBy?: string | null } | null> {
  if (!orderId) return null;

  try {
    return await client.appointmentNote.findUnique({
      where: { orderId },
    });
  } catch (err: any) {
    const isMissingTable =
      err?.code === "P2021" ||
      err?.message?.includes("AppointmentNote") ||
      err?.message?.includes("does not exist");

    if (isMissingTable) {
      isTableVerified = false;
      await ensureAppointmentNoteTable(client);
      try {
        return await client.appointmentNote.findUnique({
          where: { orderId },
        });
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Saves or updates a private internal note for an order.
 * Automatically self-heals the table if it hasn't been created yet.
 */
export async function saveSingleAppointmentNote(
  orderId: string,
  noteText: string,
  updatedBy?: string | null,
  client: any = db
): Promise<{ orderId: string; note: string; updatedAt?: Date; updatedBy?: string | null } | null> {
  if (!orderId) return null;
  const cleanNote = (noteText || "").trim();

  const execute = async () => {
    if (!cleanNote) {
      await client.appointmentNote.deleteMany({ where: { orderId } });
      return null;
    }
    return await client.appointmentNote.upsert({
      where: { orderId },
      create: {
        orderId,
        note: cleanNote,
        updatedBy: updatedBy || null,
      },
      update: {
        note: cleanNote,
        updatedBy: updatedBy || null,
        updatedAt: new Date(),
      },
    });
  };

  try {
    return await execute();
  } catch (err: any) {
    const isMissingTable =
      err?.code === "P2021" ||
      err?.message?.includes("AppointmentNote") ||
      err?.message?.includes("does not exist");

    if (isMissingTable) {
      isTableVerified = false;
      await ensureAppointmentNoteTable(client);
      return await execute();
    }
    throw err;
  }
}

/**
 * Deletes a private internal note for an order.
 */
export async function deleteSingleAppointmentNote(
  orderId: string,
  client: any = db
): Promise<void> {
  if (!orderId) return;

  try {
    await client.appointmentNote.deleteMany({ where: { orderId } });
  } catch (err: any) {
    const isMissingTable =
      err?.code === "P2021" ||
      err?.message?.includes("AppointmentNote") ||
      err?.message?.includes("does not exist");

    if (isMissingTable) {
      isTableVerified = false;
      await ensureAppointmentNoteTable(client);
      try {
        await client.appointmentNote.deleteMany({ where: { orderId } });
      } catch {}
    }
  }
}
