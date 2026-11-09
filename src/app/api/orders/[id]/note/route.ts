import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getSingleAppointmentNote,
  saveSingleAppointmentNote,
  deleteSingleAppointmentNote,
} from "@/lib/appointment-notes";

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
    const note = await getSingleAppointmentNote(id);

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
      await deleteSingleAppointmentNote(id);
      return NextResponse.json({
        success: true,
        orderId: id,
        note: "",
        message: "Personal note cleared",
      });
    }

    const saved = await saveSingleAppointmentNote(
      id,
      noteContent,
      user.name || user.username
    );

    return NextResponse.json({
      success: true,
      orderId: id,
      note: saved?.note || noteContent,
      updatedAt: saved?.updatedAt || new Date(),
      updatedBy: saved?.updatedBy || (user.name || user.username),
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
    await deleteSingleAppointmentNote(id);

    return NextResponse.json({ success: true, message: "Personal note removed" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete note" },
      { status: 500 }
    );
  }
}
