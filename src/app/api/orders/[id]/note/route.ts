import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/orders/[id]/note — fetch isolated personal note
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.isLogisticsAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const note = await db.appointmentNote.findUnique({
      where: { orderId: id },
    });

    return NextResponse.json({
      orderId: id,
      note: note?.note || "",
      updatedAt: note?.updatedAt || null,
      updatedBy: note?.updatedBy || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch personal note" },
      { status: 500 }
    );
  }
}

// POST /api/orders/[id]/note — save or update isolated personal note
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.isLogisticsAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const noteContent = body.note !== undefined ? String(body.note).trim() : "";

    if (!noteContent) {
      await db.appointmentNote.deleteMany({ where: { orderId: id } });
      return NextResponse.json({
        success: true,
        orderId: id,
        note: "",
        message: "Personal note cleared",
      });
    }

    const saved = await db.appointmentNote.upsert({
      where: { orderId: id },
      create: {
        orderId: id,
        note: noteContent,
        updatedBy: user.name || user.username,
      },
      update: {
        note: noteContent,
        updatedBy: user.name || user.username,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      orderId: id,
      note: saved.note,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
      message: "Personal note saved successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save personal note" },
      { status: 500 }
    );
  }
}

// DELETE /api/orders/[id]/note — clear isolated note
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.isLogisticsAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await db.appointmentNote.deleteMany({ where: { orderId: id } });

    return NextResponse.json({ success: true, message: "Personal note removed" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete note" },
      { status: 500 }
    );
  }
}
