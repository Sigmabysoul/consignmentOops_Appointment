import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getActiveShippingPresets,
  saveShippingPresets,
  resetShippingPresets,
} from "@/lib/shipping-presets-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const presets = await getActiveShippingPresets();
    return NextResponse.json({
      success: true,
      presets,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load shipping presets" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const updated = await saveShippingPresets(
      body.presets || body,
      user.name || user.username || "Operator"
    );

    return NextResponse.json({
      success: true,
      message: "Shipping presets and rate cards updated successfully",
      presets: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save shipping presets" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const defaults = await resetShippingPresets(
      user.name || user.username || "Operator"
    );

    return NextResponse.json({
      success: true,
      message: "Restored OM Logistics August 2026 default rate cards and configs",
      presets: defaults,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to reset shipping presets" },
      { status: 500 }
    );
  }
}
