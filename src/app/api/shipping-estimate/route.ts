import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { calculateOmDeliveryCost } from "@/modules/pricing/om-logistics";
import { compareShippingCarriers } from "@/modules/pricing/multi-carrier/carrier-comparison-engine";
import { getActiveShippingPresets } from "@/lib/shipping-presets-storage";
import { OmDeliveryInput } from "@/modules/pricing/om-logistics/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const rawWeight = typeof body.weightKg === "number" ? body.weightKg : parseFloat(body.weightKg) || 0;
    const input: OmDeliveryInput = {
      state: body.state,
      weightKg: Number(rawWeight.toFixed(2)),
      mode: "surface", // Rule 1: No air travel, all shipments done by land
      odaDistanceKm: typeof body.odaDistanceKm === "number" ? body.odaDistanceKm : parseFloat(body.odaDistanceKm) || 0,
      appointmentDelivery: Boolean(body.appointmentDelivery),
      rovCover: body.rovCover || "none",
      invoiceValue: typeof body.invoiceValue === "number" ? body.invoiceValue : parseFloat(body.invoiceValue) || 0,
    };

    // Load active presets from database/storage
    const presets = await getActiveShippingPresets();

    const options = {
      customRateCard: presets.omRateCard,
      customStateZoneMap: presets.stateZoneMap,
      customOdaMatrix: presets.odaMatrix,
      customConfig: presets.omConfig,
      carrierPresets: presets.carrierPresets,
      channel: body.channel || undefined,
    };

    // 1. Calculate OM Logistics Estimate
    const omResult = calculateOmDeliveryCost(input, options);

    // 2. Calculate Multi-Carrier Comparison
    const comparison = compareShippingCarriers(input, options);

    return NextResponse.json({
      success: true,
      input,
      omResult,
      comparison,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to calculate delivery estimate" },
      { status: 500 }
    );
  }
}
