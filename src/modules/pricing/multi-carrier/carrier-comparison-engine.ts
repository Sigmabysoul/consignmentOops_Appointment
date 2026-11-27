import {
  OmDeliveryInput,
  OmDeliveryResult,
  calculateOmDeliveryCost,
  PricingOptions,
} from "../om-logistics";
import { getAllowedCouriersForChannel } from "@/lib/courier-defaults";
import { DEFAULT_STATE_ZONE_MAP } from "../om-logistics/state-zone-mapping";

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
  /** No fixed rate card: prices come only from the carrier's live API (e.g. Shiprocket Cargo). */
  liveQuoteOnly?: boolean;
  note?: string;
  /**
   * Per-kg freight by destination zone (zone names from the state → zone map, same as OM).
   * When set, it replaces baseRatePerKg; a zone missing here means "not priced" (no silent default).
   */
  zoneRatesPerKg?: Record<string, number>;
  /** Transit time by destination zone; falls back to estimatedTransitDays. */
  zoneTransitDays?: Record<string, string>;
  /** cm³ per chargeable kg (Delhivery B2B: 4500 = 6 kg per cubic foot). Unset = actual weight only. */
  volumetricDivisor?: number;
  /** ODA = max(odaMinCharge, odaPerKg × chargeable kg). Unset = the generic ₹8.50/km estimate. */
  odaMinCharge?: number;
  odaPerKg?: number;
}

/**
 * Delhivery One B2B surface (LTL / part-truck-load) rate card, ex Kolkata.
 *
 * Built from how Delhivery invoices B2B surface freight: zone per-kg rate on the chargeable
 * weight (higher of actual and volumetric at 6 kg per CFT, i.e. L×B×H cm ÷ 4500), 20 kg minimum,
 * ₹300 minimum freight, fuel surcharge as % of freight, docket (LR) charge, appointment fee per LR,
 * ODA at the higher of ₹550 or ₹3/kg, GST 18%.
 *
 * Delhivery does not publish B2B rates; every account has its own contract sheet. The per-kg
 * numbers below are market-typical for an SME account shipping ex Kolkata. Replace them with the
 * figures on your Delhivery rate sheet (Admin → Rate Presets, or edit here) for exact quotes.
 */
export const DELHIVERY_RATE_CARD: Pick<
  CarrierRatePreset,
  | "baseRatePerKg"
  | "minChargeableWeightKg"
  | "minFreightAmount"
  | "docketCharge"
  | "fuelSurchargePercent"
  | "appointmentFee"
  | "gstPercent"
  | "estimatedTransitDays"
  | "zoneRatesPerKg"
  | "zoneTransitDays"
  | "volumetricDivisor"
  | "odaMinCharge"
  | "odaPerKg"
> = {
  baseRatePerKg: 0,
  minChargeableWeightKg: 20,
  minFreightAmount: 300,
  docketCharge: 100,
  fuelSurchargePercent: 15,
  appointmentFee: 500,
  gstPercent: 18,
  estimatedTransitDays: "4–6 Days",
  zoneRatesPerKg: {
    "East-Kolkata": 7.0,
    East: 8.5,
    Central: 10.0,
    North: 10.5,
    West: 10.5,
    South: 11.0,
    Guwahati: 12.0,
    Northeast: 14.0,
    "7 Sister": 16.0,
    "Special Zone": 18.0,
  },
  zoneTransitDays: {
    "East-Kolkata": "1–2 Days",
    East: "2–4 Days",
    Central: "4–5 Days",
    North: "4–6 Days",
    West: "5–6 Days",
    South: "5–7 Days",
    Guwahati: "4–6 Days",
    Northeast: "6–8 Days",
    "7 Sister": "7–10 Days",
    "Special Zone": "8–12 Days",
  },
  volumetricDivisor: 4500,
  odaMinCharge: 550,
  odaPerKg: 3,
};

export const DEFAULT_CARRIER_PRESETS: CarrierRatePreset[] = [
  {
    id: "carrier-delhivery-surface",
    name: "Delhivery One",
    slug: "delhivery-courier",
    serviceType: "Surface LTL · rate-card estimate",
    ...DELHIVERY_RATE_CARD,
    isActive: true,
    note: "Delhivery B2B surface rate card (zone × kg, volumetric 6 kg/CFT); estimate until the live API is connected",
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
  {
    id: "carrier-shiprocket-cargo",
    name: "Shiprocket Cargo",
    slug: "shiprocket-cargo",
    serviceType: "Shiprocket Cargo B2B",
    baseRatePerKg: 0,
    minChargeableWeightKg: 0,
    minFreightAmount: 0,
    docketCharge: 0,
    fuelSurchargePercent: 0,
    appointmentFee: 0,
    gstPercent: 18,
    estimatedTransitDays: "Live quote",
    isActive: true,
    liveQuoteOnly: true,
    note: "Aggregator: compares several surface carriers live through the Shiprocket Cargo API",
  },
];

/** One row of the itemised cost breakdown shown in the Booking Desk rate dropdown. */
export interface CarrierChargeLine {
  key: "freight" | "fuel" | "cn" | "oda" | "appointment" | "rov";
  label: string;
  /** How the amount was worked out, or why the charge is not applied. */
  basis: string;
  amount: number;
  applied: boolean;
}

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
  /** Every charge this carrier levies, applied or not, in invoice order. */
  chargeLines: CarrierChargeLine[];
  gstPercent: number;
  /** Weight the freight is billed on (carrier minimums can raise it above the actual weight). */
  chargeableWeightKg: number;
  /** OM Logistics zone, when known. */
  zone?: string;
  estimatedTransitDays: string;
  isLowestCost: boolean;
  isFastest: boolean;
  isRecommended: boolean;
  /** Price comes only from the live API card shown under this carrier. */
  liveQuoteOnly?: boolean;
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

const inr = (n: number) =>
  `₹${Number(n.toFixed(2)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Itemised OM Logistics charges: the applied line items from the rate card,
 * plus the charges OM offers that this shipment does not attract.
 */
export function buildOmChargeLines(est: OmDeliveryResult, input: OmDeliveryInput): CarrierChargeLine[] {
  if (!est.success) return [];
  const applied = new Map(est.lineItems.map((l) => [l.key, l]));
  const isHeavy = est.lineItems.some((l) => l.key === "freight" && /heavy/i.test(l.label));
  const line = (
    key: CarrierChargeLine["key"],
    label: string,
    notAppliedBasis: string
  ): CarrierChargeLine => {
    const hit = applied.get(key);
    return hit
      ? { key, label: hit.label, basis: hit.note, amount: Number(hit.amount.toFixed(2)), applied: true }
      : { key, label, basis: notAppliedBasis, amount: 0, applied: false };
  };
  return [
    line("freight", "Surface Freight", "—"),
    line("fuel", "DPH / Fuel Surcharge", isHeavy ? "Included in heavy-slab rate (above 250 kg)" : "Not charged in this zone"),
    line("cn", "Consignment Note (CN)", isHeavy ? "Included in heavy-slab rate (above 250 kg)" : "Not charged in this zone"),
    line("oda", "ODA Delivery Surcharge", "Only when the drop is more than 40 km outside the delivery area"),
    line("appointment", "Appointment Delivery", input.appointmentDelivery ? "—" : "Appointment delivery not selected"),
    line("rov", "ROV (Risk of Value)", "No ROV cover selected"),
  ];
}

/** Itemised charges for a rate-card partner (Delhivery One zone card, Ekart, Amazon ATS). `preset.baseRatePerKg` is the rate actually used. */
export function buildPresetChargeLines(
  preset: CarrierRatePreset,
  input: OmDeliveryInput,
  amounts: { chargeableW: number; freight: number; fuel: number; docket: number; appt: number; oda: number; rov: number; volumetricKg?: number }
): CarrierChargeLine[] {
  const { chargeableW, freight, fuel, docket, appt, oda, rov } = amounts;
  const volumetricKg = amounts.volumetricKg || 0;
  const actualKg = Number(input.weightKg.toFixed(2));
  const rawFreight = Number((chargeableW * preset.baseRatePerKg).toFixed(2));
  const freightBasis =
    freight > rawFreight
      ? `Minimum freight ${inr(preset.minFreightAmount)} (₹${preset.baseRatePerKg.toFixed(2)}/kg × ${chargeableW.toFixed(2)} kg = ${inr(rawFreight)})`
      : `₹${preset.baseRatePerKg.toFixed(2)}/kg × ${chargeableW.toFixed(2)} kg` +
        (chargeableW > actualKg
          ? volumetricKg >= chargeableW
            ? ` (volumetric weight, ${input.volumeCbm?.toFixed(3)} CBM ÷ ${preset.volumetricDivisor} cm³/kg)`
            : ` (minimum ${preset.minChargeableWeightKg} kg billed)`
          : "");
  const inv = input.invoiceValue || 0;
  return [
    { key: "freight", label: "Surface Freight", basis: freightBasis, amount: freight, applied: true },
    { key: "fuel", label: "Fuel Surcharge", basis: `${preset.fuelSurchargePercent}% of freight`, amount: fuel, applied: fuel > 0 },
    { key: "cn", label: "Docket (LR) Charge", basis: "Fixed, per docket / LR", amount: docket, applied: docket > 0 },
    {
      key: "oda",
      label: "ODA Delivery Surcharge",
      basis:
        oda <= 0
          ? "Only when the drop is more than 40 km outside the delivery area"
          : preset.odaMinCharge !== undefined || preset.odaPerKg !== undefined
          ? `Higher of ${inr(preset.odaMinCharge || 0)} or ₹${(preset.odaPerKg || 0).toFixed(2)}/kg × ${chargeableW.toFixed(2)} kg`
          : `₹8.50/km × ${input.odaDistanceKm} km (estimate)`,
      amount: oda,
      applied: oda > 0,
    },
    {
      key: "appointment",
      label: "Appointment Delivery",
      basis: appt > 0 ? "Fixed fee per LR (appointment slot at the warehouse)" : "Appointment delivery not selected",
      amount: appt,
      applied: appt > 0,
    },
    {
      key: "rov",
      label: "ROV (Risk of Value)",
      basis:
        input.rovCover === "shipper"
          ? `0.3% of ${inr(inv)} (min ₹100)`
          : input.rovCover === "carrier"
          ? `0.8% of ${inr(inv)} (min ₹300)`
          : "No ROV cover selected",
      amount: rov,
      applied: rov > 0,
    },
  ];
}

/**
 * Calculates and compares shipping costs across OM Logistics and active courier partners.
 * Per plan:
 * 1. All shipments are done by land (no air travel).
 * 2. Amazon VC & FBA: Only Amazon ATS.
 * 3. Flipkart FBF & FKSB: Only Ekart.
 * 4. Rest (Swiggy, Blinkit, Flipkart Minutes, etc.): Delhivery One, OM Logistics and Shiprocket Cargo.
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
        chargeLines: buildOmChargeLines(omSurfaceRes, input),
        gstPercent: omSurfaceRes.gstPercent,
        chargeableWeightKg: Number(omSurfaceRes.weightKg.toFixed(2)),
        zone: omSurfaceRes.zone,
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
        chargeLines: [],
        gstPercent: 18,
        chargeableWeightKg: W,
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

    if (preset.liveQuoteOnly) {
      const zero = { freight: 0, fuel: 0, cnOrDocket: 0, oda: 0, appointment: 0, rov: 0, subtotal: 0, gst: 0 };
      carriersList.push({
        id: preset.id,
        name: preset.name,
        slug: preset.slug,
        serviceType: preset.serviceType,
        isOmLogistics: false,
        isAirExpress: false,
        estimatedTotal: 0,
        costPerKg: 0,
        subtotal: 0,
        gstAmount: 0,
        breakdown: zero,
        chargeLines: [],
        gstPercent: preset.gstPercent,
        chargeableWeightKg: W,
        estimatedTransitDays: preset.estimatedTransitDays,
        isLowestCost: false,
        isFastest: false,
        isRecommended: false,
        liveQuoteOnly: true,
        notes: [preset.note || "Live rates only"],
      });
      continue;
    }

    // Zone rate card (Delhivery) or a flat per-kg rate (Ekart, Amazon ATS).
    const zoneMap = options?.customStateZoneMap || DEFAULT_STATE_ZONE_MAP;
    const zone = preset.zoneRatesPerKg ? zoneMap[input.state] : undefined;
    const ratePerKg = preset.zoneRatesPerKg ? (zone ? preset.zoneRatesPerKg[zone] : undefined) : preset.baseRatePerKg;
    if (preset.zoneRatesPerKg && !(typeof ratePerKg === "number" && ratePerKg > 0)) {
      const zero = { freight: 0, fuel: 0, cnOrDocket: 0, oda: 0, appointment: 0, rov: 0, subtotal: 0, gst: 0 };
      carriersList.push({
        id: preset.id,
        name: preset.name,
        slug: preset.slug,
        serviceType: preset.serviceType,
        isOmLogistics: false,
        isAirExpress: false,
        estimatedTotal: 0,
        costPerKg: 0,
        subtotal: 0,
        gstAmount: 0,
        breakdown: zero,
        chargeLines: [],
        gstPercent: preset.gstPercent,
        chargeableWeightKg: W,
        zone,
        estimatedTransitDays: preset.estimatedTransitDays,
        isLowestCost: false,
        isFastest: false,
        isRecommended: false,
        error: input.state ? `No ${preset.name} rate for ${zone ? `zone ${zone}` : input.state}` : "Pick the destination state",
        notes: [],
      });
      continue;
    }
    const effectivePreset = { ...preset, baseRatePerKg: ratePerKg as number };

    // Chargeable weight = max(actual, volumetric, carrier minimum), strict 2 decimals.
    const volumetricKg =
      preset.volumetricDivisor && input.volumeCbm && input.volumeCbm > 0
        ? Number(((input.volumeCbm * 1_000_000) / preset.volumetricDivisor).toFixed(2))
        : 0;
    const chargeableW = Number(Math.max(W, volumetricKg, preset.minChargeableWeightKg).toFixed(2));
    const rawFreight = chargeableW * effectivePreset.baseRatePerKg;
    const freight = Number(Math.max(preset.minFreightAmount, rawFreight).toFixed(2));
    const fuel = Number(((freight * preset.fuelSurchargePercent) / 100).toFixed(2));
    const docket = Number(preset.docketCharge.toFixed(2));
    const appt = input.appointmentDelivery ? Number(preset.appointmentFee.toFixed(2)) : 0;
    const isOda = Boolean(input.odaDistanceKm && input.odaDistanceKm > 40);
    const oda = !isOda
      ? 0
      : preset.odaMinCharge !== undefined || preset.odaPerKg !== undefined
      ? Number(Math.max(preset.odaMinCharge || 0, (preset.odaPerKg || 0) * chargeableW).toFixed(2))
      : Number(Math.round((input.odaDistanceKm as number) * 8.5).toFixed(2));

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
      chargeLines: buildPresetChargeLines(effectivePreset, input, { chargeableW, freight, fuel, docket, appt, oda, rov, volumetricKg }),
      gstPercent: preset.gstPercent,
      chargeableWeightKg: Number(chargeableW.toFixed(2)),
      ...(zone ? { zone } : {}),
      estimatedTransitDays: (zone && preset.zoneTransitDays?.[zone]) || preset.estimatedTransitDays,
      isLowestCost: false,
      isFastest: false,
      isRecommended: false,
      notes: [
        `Base Rate: ₹${effectivePreset.baseRatePerKg.toFixed(2)}/kg (min ${preset.minChargeableWeightKg} kg)`,
        `Fuel surcharge: ${preset.fuelSurchargePercent}%`,
        `Docket charge: ₹${preset.docketCharge}`,
      ],
    });
  }

  // 3. Identify Lowest Cost (among surface options without error)
  const validSurface = carriersList.filter(
    (c) => !c.error && !c.liveQuoteOnly && c.estimatedTotal > 0
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
