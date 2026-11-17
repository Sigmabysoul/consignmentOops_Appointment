import { NextRequest, NextResponse } from "next/server";
import { listWarehouses } from "@/modules/shiprocket";
import { notConfiguredResponse, requireLogisticsUser, shiprocketErrorResponse } from "@/lib/shiprocket-orders";

export const dynamic = "force-dynamic";

/** GET /api/shiprocket/warehouses?page=&search= — warehouses saved on the Shiprocket account (admin check of the setup). */
export async function GET(req: NextRequest) {
  const user = await requireLogisticsUser(req);
  if (user instanceof NextResponse) return user;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const notConfigured = notConfiguredResponse();
  if (notConfigured) return notConfigured;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;
  try {
    const res = await listWarehouses(page, search);
    return NextResponse.json(res.data);
  } catch (err: any) {
    // The API answers 404 when the page is past the end.
    if (err?.status === 404) return NextResponse.json({ results: [], count: 0, current_page: page });
    return shiprocketErrorResponse(err, "warehouses");
  }
}
