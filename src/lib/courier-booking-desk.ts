/**
 * Server-only gate for carrier API bookings (Delhivery manifest, Shiprocket order/shipment):
 * a real, paid LR may only be created for an order that is on the Booking desk — packaging slip
 * printed and not yet in transit / delivered / GRN Issue / cancelled. Uses the exact Prisma
 * conditions of the Booking desk list (BOOKING_FILTER_CONDITIONS), so what an operator can book
 * is what the desk shows.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { APPOINTMENT_APP_VISIBILITY, BOOKING_FILTER_CONDITIONS } from "@/lib/order-filters";

export async function requireBookingDeskOrder(orderId: string, carrierLabel: string): Promise<NextResponse | null> {
  const onDesk = await db.consignmentOrder.findFirst({
    where: { AND: [{ id: orderId }, ...APPOINTMENT_APP_VISIBILITY, ...BOOKING_FILTER_CONDITIONS] },
    select: { id: true },
  });
  if (onDesk) return null;
  return NextResponse.json(
    {
      error: `${carrierLabel} can only be booked for orders on the Booking desk (packaging slip printed, not yet in transit, delivered, GRN Issue or cancelled).`,
      code: "NOT_ON_BOOKING_DESK",
    },
    { status: 409 }
  );
}
