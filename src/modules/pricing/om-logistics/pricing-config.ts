import { OmPricingConfig } from "./types";

export const DEFAULT_OM_CONFIG: OmPricingConfig = {
  gstPercent: 18,
  cnChargeLightSlab: 100,
  airExpressRatePerKg: 135,
  appointmentMinFee: 1000,
  appointmentPerKgFee: 1,
  appointmentThresholdKg: 1000,
  rovShipperRiskPercent: 0.3,
  rovShipperRiskMin: 100,
  rovCarrierRiskPercent: 0.8,
  rovCarrierRiskMin: 300,
  lightSlabMaxKg: 250,
  pickupPin: "700100",
  transporterId: "88AAECO4660K1Z7",
  informationalNotes: [
    "Transit time is about 8–9 days from Kolkata, and 12–14 days for Northeast and Special locations.",
    "Give one day's prior notice before pickup.",
    "An e-way bill is required for every shipment with invoice value above ₹50,000. OM Logistics' transporter ID for it is 88AAECO4660K1Z7.",
    "Payment terms are 7 days from the date of booking.",
  ],
};
