import { channelsWith } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireLogisticsUser } from "@/lib/delhivery-orders";
import { DelhiveryServerStatus } from "@/lib/delhivery-types";

export const dynamic = "force-dynamic";

/** What the UI needs to know about the Delhivery setup. Never returns credentials. */
export async function GET(req: NextRequest) {
  const user = await requireLogisticsUser(req);
  if (user instanceof NextResponse) return user;

  const envRaw = (process.env.DELHIVERY_ENV || "test").trim().toLowerCase();
  const status: DelhiveryServerStatus = {
    configured: Boolean(process.env.DELHIVERY_USERNAME?.trim() && process.env.DELHIVERY_PASSWORD),
    env: envRaw === "production" || envRaw === "prod" ? "production" : "test",
    bookingEnabled: process.env.DELHIVERY_BOOKING_ENABLED === "true",
    warehouseConfigured: Boolean(process.env.DELHIVERY_WAREHOUSE_NAME?.trim()),
    sourcePin: (process.env.DELHIVERY_SOURCE_PIN || "700100").trim(),
    overrideChannels: channelsWith(user, "order.override"),
  };
  return NextResponse.json(status);
}
