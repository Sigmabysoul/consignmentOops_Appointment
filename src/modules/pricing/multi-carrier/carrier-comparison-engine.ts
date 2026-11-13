import {
  OmDeliveryInput,
  OmDeliveryResult,
  calculateOmDeliveryCost,
  PricingOptions,
} from "../om-logistics";

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
    id: "carrier-bluedart-apex",
    name: "Blue Dart",
    slug: "blue-dart-tracking",
    serviceType: "Apex Premium Surface",
    baseRatePerKg: 12.0,
    minChargeableWeightKg: 10,
    minFreightAmount: 350,
    docketCharge: 120,
    fuelSurchargePercent: 25,
    appointmentFee: 1200,
    gstPercent: 18,
    estimatedTransitDays: "3–5 Days",
    isActive: true,
    note: "Express priority transit with dedicated appointment slots",
  },
  {
    id: "carrier-vtrans-surface",
    name: "V-Trans",
    slug: "v-trans",
    serviceType: "FTL/LTL Surface Freight",
    baseRatePerKg: 7.5,
    minChargeableWeightKg: 50,
    minFreightAmount: 500,
    docketCharge: 100,
    fuelSurchargePercent: 18,
    appointmentFee: 1000,
    gstPercent: 18,
    estimatedTransitDays: "7–9 Days",
    isActive: true,
    note: "Economical industrial logistics for medium to heavy consignments",
  },
  {
    id: "carrier-smartr-cargo",
    name: "Smartr Logistics",
    slug: "smartr-logistics",
    serviceType: "Wheels Cargo Surface",
    baseRatePerKg: 9.0,
    minChargeableWeightKg: 25,
    minFreightAmount: 300,
    docketCharge: 90,
    fuelSurchargePercent: 16,
    appointmentFee: 900,
    gstPercent: 18,
    estimatedTransitDays: "5–7 Days",
    isActive: true,
    note: "Specialized retail and e-commerce appointment fulfillment",
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
 * Calculates and compares shipping costs across OM Logistics and other active courier partners.
 */
export function compareShippingCarriers(
  input: OmDeliveryInput,
  options?: PricingOptions & { carrierPresets?: CarrierRatePreset[] }
): MultiCarrierComparisonResponse {
  const W = input.weightKg;
  const carriersList: CarrierComparisonItem[] = [];

  // 1. Calculate OM Logistics (Surface)
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
      serviceType: "Surface Per-Kg Rate Card",
      isOmLogistics: true,
      isAirExpress: false,
      estimatedTotal: omSurfaceRes.totalAmount,
      costPerKg: omSurfaceRes.costPerKg,
      subtotal: omSurfaceRes.subtotal,
      gstAmount: omSurfaceRes.gstAmount,
      breakdown: {
        freight,
        fuel,
        cnOrDocket: cn,
        oda,
        appointment,
        rov,
        subtotal: omSurfaceRes.subtotal,
        gst: omSurfaceRes.gstAmount,
      },
      estimatedTransitDays: isSpecialOrNE ? "12–14 Days" : "8–9 Days",
      isLowestCost: false, // will evaluate below
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
      serviceType: "Surface Per-Kg Rate Card",
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

  // 2. Calculate OM Logistics (Air Express)
  const omAirRes = calculateOmDeliveryCost(
    { ...input, mode: "air" },
    options
  );

  if (omAirRes.success) {
    const freight = omAirRes.lineItems.find((l) => l.key === "freight")?.amount || 0;
    const oda = omAirRes.lineItems.find((l) => l.key === "oda")?.amount || 0;
    const appointment = omAirRes.lineItems.find((l) => l.key === "appointment")?.amount || 0;
    const rov = omAirRes.lineItems.find((l) => l.key === "rov")?.amount || 0;

    carriersList.push({
      id: "om-air",
      name: "OM Logistics (Air Express)",
      slug: "om-logistics",
      serviceType: "Air Express Priority",
      isOmLogistics: true,
      isAirExpress: true,
      estimatedTotal: omAirRes.totalAmount,
      costPerKg: omAirRes.costPerKg,
      subtotal: omAirRes.subtotal,
      gstAmount: omAirRes.gstAmount,
      breakdown: {
        freight,
        fuel: 0,
        cnOrDocket: 0,
        oda,
        appointment,
        rov,
        subtotal: omAirRes.subtotal,
        gst: omAirRes.gstAmount,
      },
      estimatedTransitDays: "2–3 Days",
      isLowestCost: false,
      isFastest: true,
      isRecommended: false,
      notes: ["Air Express: ₹135/kg all-inclusive across all zones"],
      rawEstimate: omAirRes,
    });
  }

  // 3. Calculate Configured Partner Carriers
  const presets = options?.carrierPresets || DEFAULT_CARRIER_PRESETS;
  for (const preset of presets) {
    if (!preset.isActive) continue;

    // Weight rules
    const chargeableW = Math.max(W, preset.minChargeableWeightKg);
    const rawFreight = chargeableW * preset.baseRatePerKg;
    const freight = Number(Math.max(preset.minFreightAmount, rawFreight).toFixed(2));
    const fuel = Number(((freight * preset.fuelSurchargePercent) / 100).toFixed(2));
    const docket = preset.docketCharge;
    const appt = input.appointmentDelivery ? preset.appointmentFee : 0;
    const oda = input.odaDistanceKm && input.odaDistanceKm > 40 ? Math.round(input.odaDistanceKm * 8.5) : 0;

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

  // 4. Identify Lowest Cost (among surface options without error)
  const validSurface = carriersList.filter(
    (c) => !c.error && !c.isAirExpress && c.estimatedTotal > 0
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
