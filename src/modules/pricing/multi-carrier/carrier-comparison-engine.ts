import {
  OmDeliveryInput,
  OmDeliveryResult,
  calculateOmDeliveryCost,
  PricingOptions,
} from "../om-logistics";
import { getAllowedCouriersForChannel } from "@/lib/courier-defaults";

export interface CarrierRatePreset {
  id: string;
  name: string;
  slug: string;
  serviceType: string; // e.g. "Surface Commercial", "Air Express", "Express Cargo"
  baseRatePerKg: number;
  minChargeableWeightKg: number;
  minFreightAmount: number;
  docketCharge: number;
  fuelSurchargePercent: number;
  appointmentFee: number;
  gstPercent: number;
  estimatedTransitDays: string;
  isActive: boolean;
  isCustomCarrier?: boolean;
  note?: string;
}

export const DEFAULT_CARRIER_PRESETS: CarrierRatePreset[] = [
  {
    id: "carrier-delhivery-surface",
    name: "Delhivery One",
    slug: "delhivery-courier",
    serviceType: "Surface Heavy Freight",
    baseRatePerKg: 8.5,
    minChargeableWeightKg: 20,
    minFreightAmount: 250,
    docketCharge: 80,
    fuelSurchargePercent: 15,
    appointmentFee: 800,
    gstPercent: 18,
    estimatedTransitDays: "4–6 Days",
    isActive: true,
    note: "Pan-India Surface Cargo network with appointment delivery",
  },
  {
    id: "carrier-ekart-surface",
    name: "Ekart",
    slug: "ekart-logistics",
    serviceType: "Ekart B2B Surface",
    baseRatePerKg: 8.0,
    minChargeableWeightKg: 20,
    minFreightAmount: 250,
    docketCharge: 75,
    fuelSurchargePercent: 15,
    appointmentFee: 750,
    gstPercent: 18,
    estimatedTransitDays: "3–5 Days",
    isActive: true,
    note: "Flipkart official logistics network (Recommended for Flipkart FBF & FKSB)",
  },
  {
    id: "carrier-amazon-ats",
    name: "Amazon ATS",
    slug: "amazon-ats",
    serviceType: "Amazon Freight Surface",
    baseRatePerKg: 8.0,
    minChargeableWeightKg: 20,
    minFreightAmount: 250,
    docketCharge: 70,
    fuelSurchargePercent: 14,
    appointmentFee: 700,
    gstPercent: 18,
    estimatedTransitDays: "3–4 Days",
    isActive: true,
    note: "Amazon Transportation Services (Default carrier for Amazon VC & FBA)",
  },
];

export interface CarrierComparisonItem {
  id: string;
  name: string;
  slug: string;
  serviceType: string;
  isOmLogistics: boolean;
  isAirExpress: boolean;
  estimatedTotal: number;
  costPerKg: number;
  subtotal: number;
  gstAmount: number;
  breakdown: {
    freight: number;
    fuel: number;
    cnOrDocket: number;
    oda: number;
    appointment: number;
    rov: number;
    subtotal: number;
    gst: number;
  };
  estimatedTransitDays: string;
  isLowestCost: boolean;
  isFastest: boolean;
  isRecommended: boolean;
  error?: string;
  notes: string[];
  rawEstimate?: OmDeliveryResult;
}

export interface MultiCarrierComparisonResponse {
  input: OmDeliveryInput;
  carriers: CarrierComparisonItem[];
  lowestCostCarrierName: string | null;
  lowestCostAmount: number | null;
  omSurfaceTotal: number | null;
}

/**
 * Calculates and compares shipping costs across OM Logistics and active courier partners.
 * Per plan:
 * 1. All shipments are done by land (no air travel).
 * 2. Amazon VC & FBA: Only Amazon ATS.
 * 3. Flipkart FBF & FKSB: Only Ekart.
 * 4. Rest (Swiggy, Blinkit, Flipkart Minutes, etc.): Only Delhivery One and OM Logistics.
 */
export function compareShippingCarriers(
  input: OmDeliveryInput,
  options?: PricingOptions & { carrierPresets?: CarrierRatePreset[]; channel?: string }
): MultiCarrierComparisonResponse {
  const W = Number(input.weightKg.toFixed(2));
  let carriersList: CarrierComparisonItem[] = [];

  // Allowed couriers for this channel (if channel is specified)
  const allowedCouriers = options?.channel ? getAllowedCouriersForChannel(options.channel) : null;

  // 1. Calculate OM Logistics (Land Surface) - only if allowed or unconstrained
  if (!allowedCouriers || allowedCouriers.includes("OM Logistics")) {
    const omSurfaceRes = calculateOmDeliveryCost(
      { ...input, mode: "surface" },
      options
    );

    if (omSurfaceRes.success) {
      const freight = omSurfaceRes.lineItems.find((l) => l.key === "freight")?.amount || 0;
      const fuel = omSurfaceRes.lineItems.find((l) => l.key === "fuel")?.amount || 0;
      const cn = omSurfaceRes.lineItems.find((l) => l.key === "cn")?.amount || 0;
      const oda = omSurfaceRes.lineItems.find((l) => l.key === "oda")?.amount || 0;
      const appointment = omSurfaceRes.lineItems.find((l) => l.key === "appointment")?.amount || 0;
      const rov = omSurfaceRes.lineItems.find((l) => l.key === "rov")?.amount || 0;

      const isSpecialOrNE = ["Northeast", "7 Sister", "Special Zone"].includes(omSurfaceRes.zone);

      carriersList.push({
        id: "om-surface",
        name: "OM Logistics",
        slug: "om-logistics",
        serviceType: "Surface Heavy Cargo (Land)",
        isOmLogistics: true,
        isAirExpress: false,
        estimatedTotal: Number(omSurfaceRes.totalAmount.toFixed(2)),
        costPerKg: Number(omSurfaceRes.costPerKg.toFixed(2)),
        subtotal: Number(omSurfaceRes.subtotal.toFixed(2)),
        gstAmount: Number(omSurfaceRes.gstAmount.toFixed(2)),
        breakdown: {
          freight: Number(freight.toFixed(2)),
          fuel: Number(fuel.toFixed(2)),
          cnOrDocket: Number(cn.toFixed(2)),
          oda: Number(oda.toFixed(2)),
          appointment: Number(appointment.toFixed(2)),
          rov: Number(rov.toFixed(2)),
          subtotal: Number(omSurfaceRes.subtotal.toFixed(2)),
          gst: Number(omSurfaceRes.gstAmount.toFixed(2)),
        },
        estimatedTransitDays: isSpecialOrNE ? "12–14 Days" : "8–9 Days",
        isLowestCost: false,
        isFastest: false,
        isRecommended: true,
        notes: omSurfaceRes.notes,
        rawEstimate: omSurfaceRes,
      });
    } else {
      carriersList.push({
        id: "om-surface",
        name: "OM Logistics",
        slug: "om-logistics",
        serviceType: "Surface Heavy Cargo (Land)",
        isOmLogistics: true,
        isAirExpress: false,
        estimatedTotal: 0,
        costPerKg: 0,
        subtotal: 0,
        gstAmount: 0,
        breakdown: {
          freight: 0,
          fuel: 0,
          cnOrDocket: 0,
          oda: 0,
          appointment: 0,
          rov: 0,
          subtotal: 0,
          gst: 0,
        },
        estimatedTransitDays: "8–9 Days",
        isLowestCost: false,
        isFastest: false,
        isRecommended: false,
        error: omSurfaceRes.error,
        notes: [],
      });
    }
  }

  // (OM Air Express removed: All shipments are done by land per Rule 1)

  // 2. Calculate Configured Partner Carriers (Delhivery One, Ekart, Amazon ATS)
  const presets = options?.carrierPresets || DEFAULT_CARRIER_PRESETS;
  for (const preset of presets) {
    if (!preset.isActive) continue;

    // Filter by channel if channel specified
    if (allowedCouriers && !allowedCouriers.includes(preset.name)) {
      continue;
    }

    // Weight rules (strict 2 decimal points)
    const chargeableW = Math.max(W, preset.minChargeableWeightKg);
    const rawFreight = chargeableW * preset.baseRatePerKg;
    const freight = Number(Math.max(preset.minFreightAmount, rawFreight).toFixed(2));
    const fuel = Number(((freight * preset.fuelSurchargePercent) / 100).toFixed(2));
    const docket = Number(preset.docketCharge.toFixed(2));
    const appt = input.appointmentDelivery ? Number(preset.appointmentFee.toFixed(2)) : 0;
    const oda = input.odaDistanceKm && input.odaDistanceKm > 40 ? Number(Math.round(input.odaDistanceKm * 8.5).toFixed(2)) : 0;

    // Optional ROV
    let rov = 0;
    if (input.rovCover === "shipper") {
      rov = Math.max(100, Number(((0.003) * (input.invoiceValue || 0)).toFixed(2)));
    } else if (input.rovCover === "carrier") {
      rov = Math.max(300, Number(((0.008) * (input.invoiceValue || 0)).toFixed(2)));
    }

    const subtotal = Number((freight + fuel + docket + appt + oda + rov).toFixed(2));
    const gst = Number(((subtotal * preset.gstPercent) / 100).toFixed(2));
    const total = Number((subtotal + gst).toFixed(2));
    const costPerKg = W > 0 ? Number((total / W).toFixed(2)) : 0;

    carriersList.push({
      id: preset.id,
      name: preset.name,
      slug: preset.slug,
      serviceType: preset.serviceType,
      isOmLogistics: false,
      isAirExpress: false,
      estimatedTotal: total,
      costPerKg,
      subtotal,
      gstAmount: gst,
      breakdown: {
        freight,
        fuel,
        cnOrDocket: docket,
        oda,
        appointment: appt,
        rov,
        subtotal,
        gst,
      },
      estimatedTransitDays: preset.estimatedTransitDays,
      isLowestCost: false,
      isFastest: false,
      isRecommended: false,
      notes: [
        `Base Rate: ₹${preset.baseRatePerKg.toFixed(2)}/kg (min ${preset.minChargeableWeightKg} kg)`,
        `Fuel surcharge: ${preset.fuelSurchargePercent}%`,
        `Docket charge: ₹${preset.docketCharge}`,
      ],
    });
  }

  // 3. Identify Lowest Cost (among surface options without error)
  const validSurface = carriersList.filter(
    (c) => !c.error && c.estimatedTotal > 0
  );
  let lowestCostCarrierName: string | null = null;
  let lowestCostAmount: number | null = null;

  if (validSurface.length > 0) {
    const sorted = [...validSurface].sort((a, b) => a.estimatedTotal - b.estimatedTotal);
    sorted[0].isLowestCost = true;
    lowestCostCarrierName = sorted[0].name;
    lowestCostAmount = sorted[0].estimatedTotal;
  }

  const omSurface = carriersList.find((c) => c.id === "om-surface");

  return {
    input,
    carriers: carriersList,
    lowestCostCarrierName,
    lowestCostAmount,
    omSurfaceTotal: omSurface?.estimatedTotal || null,
  };
}
