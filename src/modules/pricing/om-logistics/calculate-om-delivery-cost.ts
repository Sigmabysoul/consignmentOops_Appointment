import {
  OmDeliveryInput,
  OmDeliveryResult,
  OmEstimateLineItem,
  OmRateRow,
  OdaBand,
  OmPricingConfig,
} from "./types";
import { DEFAULT_OM_RATE_CARD } from "./om-rate-card";
import { getZoneForState } from "./state-zone-mapping";
import { getOdaCharge } from "./oda-matrix";
import { DEFAULT_OM_CONFIG } from "./pricing-config";

export interface PricingOptions {
  customRateCard?: OmRateRow[];
  customStateZoneMap?: Record<string, string>;
  customOdaMatrix?: OdaBand[];
  customConfig?: OmPricingConfig;
}

/**
 * Pure pricing module for OM Logistics Supply Chain Pvt Ltd delivery cost estimation.
 * No UI, no network calls, no framework imports.
 *
 * Implements exact specification from Commercial Ex Kolkata, Surface, Per Kg rate card.
 */
export function calculateOmDeliveryCost(
  input: OmDeliveryInput,
  options?: PricingOptions
): OmDeliveryResult {
  const {
    state,
    weightKg: W,
    mode = "surface",
    odaDistanceKm = 0,
    appointmentDelivery = false,
    rovCover = "none",
    invoiceValue = 0,
  } = input;

  const config = options?.customConfig || DEFAULT_OM_CONFIG;
  const rateCard = options?.customRateCard || DEFAULT_OM_RATE_CARD;

  // 1. Validation: Weight must be positive
  if (typeof W !== "number" || isNaN(W) || W <= 0) {
    return {
      success: false,
      error: "Weight must be greater than 0 kg",
    };
  }

  // 2. Step 1: Zone Lookup
  const zone = getZoneForState(state, options?.customStateZoneMap);
  if (!zone) {
    return {
      success: false,
      error: "Destination not mapped, confirm zone with Om Logistics",
    };
  }

  const lineItems: OmEstimateLineItem[] = [];

  let freight = 0;
  let fuel = 0;
  let cn = 0;
  let appliedRatePerKg: number | undefined;

  // 3. Step 2: Freight, by Mode
  if (mode === "air") {
    appliedRatePerKg = config.airExpressRatePerKg;
    freight = Number((config.airExpressRatePerKg * W).toFixed(2));
    lineItems.push({
      key: "freight",
      label: "Air Express Freight",
      amount: freight,
      note: `₹${config.airExpressRatePerKg}/kg × ${W} kg (all-inclusive)`,
    });
  } else {
    // Surface Mode
    const isLightSlab = W <= config.lightSlabMaxKg;

    // Find matching rate row by zone and weight slab
    const matchingRow = rateCard.find(
      (r) => r.zones.includes(zone) && W >= r.minKg && W <= r.maxKg
    );

    if (!matchingRow) {
      return {
        success: false,
        error: "No rate listed for this zone and weight, confirm with Om Logistics",
      };
    }

    appliedRatePerKg = matchingRow.ratePerKg;
    freight = Number((matchingRow.ratePerKg * W).toFixed(2));

    if (isLightSlab) {
      lineItems.push({
        key: "freight",
        label: "Surface Freight",
        amount: freight,
        note: `₹${matchingRow.ratePerKg.toFixed(2)}/kg × ${W} kg`,
      });

      if (matchingRow.fuelPercent > 0) {
        fuel = Number(((freight * matchingRow.fuelPercent) / 100).toFixed(2));
        lineItems.push({
          key: "fuel",
          label: "DPH / Fuel Surcharge",
          amount: fuel,
          note: `${matchingRow.fuelPercent}% of freight`,
        });
      }

      if (matchingRow.cnCharge > 0) {
        cn = matchingRow.cnCharge;
        lineItems.push({
          key: "cn",
          label: "Consignment Note (CN)",
          amount: cn,
          note: `Docket documentation charge (light slab)`,
        });
      }
    } else {
      // Heavy slab (>250 kg) is all-inclusive: no fuel and no CN charge
      lineItems.push({
        key: "freight",
        label: "Surface Freight (Heavy Slab)",
        amount: freight,
        note: `₹${matchingRow.ratePerKg.toFixed(2)}/kg × ${W} kg (all-inclusive)`,
      });
    }
  }

  // 4. Step 3: ODA (Out of Delivery Area / ESS)
  let oda = 0;
  if (odaDistanceKm > 40) {
    const odaRes = getOdaCharge(W, odaDistanceKm, options?.customOdaMatrix);
    if (odaRes.error) {
      return {
        success: false,
        error: odaRes.error,
      };
    }
    oda = odaRes.amount;
    lineItems.push({
      key: "oda",
      label: "ODA Delivery Surcharge",
      amount: oda,
      note: odaRes.bandNote || `${odaDistanceKm} km`,
    });
  }

  // 5. Step 4: Appointment Delivery
  let appointment = 0;
  if (appointmentDelivery) {
    appointment = Math.max(
      config.appointmentMinFee,
      config.appointmentPerKgFee * W
    );
    lineItems.push({
      key: "appointment",
      label: "Appointment Delivery",
      amount: appointment,
      note:
        W > config.appointmentThresholdKg
          ? `₹${config.appointmentPerKgFee}/kg × ${W} kg`
          : `Flat minimum ₹${config.appointmentMinFee.toLocaleString("en-IN")} up to ${config.appointmentThresholdKg} kg`,
    });
  }

  // 6. Step 5: ROV (Risk of Value)
  let rov = 0;
  const safeInvoice = typeof invoiceValue === "number" && invoiceValue > 0 ? invoiceValue : 0;
  if (rovCover === "shipper") {
    const calculatedRov = (config.rovShipperRiskPercent / 100) * safeInvoice;
    rov = Number(Math.max(config.rovShipperRiskMin, calculatedRov).toFixed(2));
    lineItems.push({
      key: "rov",
      label: "ROV (Shipper's Risk)",
      amount: rov,
      note: `${config.rovShipperRiskPercent}% of ₹${safeInvoice.toLocaleString("en-IN")} (min ₹${config.rovShipperRiskMin})`,
    });
  } else if (rovCover === "carrier") {
    const calculatedRov = (config.rovCarrierRiskPercent / 100) * safeInvoice;
    rov = Number(Math.max(config.rovCarrierRiskMin, calculatedRov).toFixed(2));
    lineItems.push({
      key: "rov",
      label: "ROV (Carrier's Risk / Insurance)",
      amount: rov,
      note: `${config.rovCarrierRiskPercent}% of ₹${safeInvoice.toLocaleString("en-IN")} (min ₹${config.rovCarrierRiskMin})`,
    });
  }

  // 7. Step 6: Totals & GST
  const subtotal = Number(
    (freight + fuel + cn + oda + appointment + rov).toFixed(2)
  );
  const gstAmount = Number(((subtotal * config.gstPercent) / 100).toFixed(2));
  const totalAmount = Number((subtotal + gstAmount).toFixed(2));
  const costPerKg = Number((totalAmount / W).toFixed(2));

  return {
    success: true,
    zone,
    state,
    mode,
    weightKg: W,
    ratePerKg: appliedRatePerKg,
    freight,
    fuel,
    cn,
    oda,
    appointment,
    rov,
    lineItems,
    subtotal,
    gstPercent: config.gstPercent,
    gstAmount,
    totalAmount,
    costPerKg,
    notes: config.informationalNotes,
  };
}
