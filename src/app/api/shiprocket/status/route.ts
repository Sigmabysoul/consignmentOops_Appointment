import { channelsWith } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireLogisticsUser } from "@/lib/shiprocket-orders";
import { isShiprocketConfigured, missingSenderFields, readShiprocketSender } from "@/modules/shiprocket";
import type { ShiprocketServerStatus } from "@/lib/shiprocket-types";

export const dynamic = "force-dynamic";

/** What the UI needs to know about the Shiprocket setup. Never returns secrets. */
export async function GET(req: NextRequest) {
  const user = await requireLogisticsUser(req);
  if (user instanceof NextResponse) return user;
  const sender = readShiprocketSender();
  const status: ShiprocketServerStatus = {
    configured: isShiprocketConfigured(),
    bookingEnabled: process.env.SHIPROCKET_BOOKING_ENABLED === "true",
    sender: { pincode: sender.pincode, city: sender.city, state: sender.state, warehouseName: sender.warehouseName },
    missingSenderFields: missingSenderFields(sender),
    overrideChannels: channelsWith(user, "order.override"),
  };
  return NextResponse.json(status);
}
