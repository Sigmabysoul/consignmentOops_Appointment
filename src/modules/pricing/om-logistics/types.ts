/**
 * Pure TypeScript types for OM Logistics Supply Chain Pvt Ltd Delivery Cost Estimator.
 * Commercial Ex Kolkata, Surface, Per Kg rate card (revised 1 Aug 2026).
 */

export interface OmRateRow {
  id: string;
  zones: string[];
  minKg: number;
  maxKg: number;
  ratePerKg: number;
  fuelPercent: number;
  cnCharge: number;
  note?: string;
}

export interface OdaBand {
  minKg: number;
  maxKg: number;
  rates: number[]; // rates for [41-100km, 101-160km, 161-220km, 221-280km, 281-350km]
}

export interface OmPricingConfig {
  gstPercent: number; // 18
  cnChargeLightSlab: number; // 100
  airExpressRatePerKg: number; // 135
  appointmentMinFee: number; // 1000
  appointmentPerKgFee: number; // 1
  appointmentThresholdKg: number; // 1000 (max(1000, 1 * W))
  rovShipperRiskPercent: number; // 0.3
  rovShipperRiskMin: number; // 100
  rovCarrierRiskPercent: number; // 0.8
  rovCarrierRiskMin: number; // 300
  lightSlabMaxKg: number; // 250
  pickupPin: string; // "700100"
  transporterId: string; // "88AAECO4660K1Z7"
  informationalNotes: string[];
}

export type RovCoverType = "none" | "shipper" | "carrier";
export type DeliveryMode = "surface" | "air";

export interface OmDeliveryInput {
  state: string;
  weightKg: number;
  mode?: DeliveryMode;
  odaDistanceKm?: number;
  appointmentDelivery?: boolean;
  rovCover?: RovCoverType;
  invoiceValue?: number;
}

export interface OmEstimateLineItem {
  key: "freight" | "fuel" | "cn" | "oda" | "appointment" | "rov";
  label: string;
  amount: number;
  note: string;
}

export interface OmDeliveryEstimate {
  success: true;
  zone: string;
  state: string;
  mode: DeliveryMode;
  weightKg: number;
  ratePerKg?: number;
  freight: number;
  fuel: number;
  cn: number;
  oda: number;
  appointment: number;
  rov: number;
  lineItems: OmEstimateLineItem[];
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  costPerKg: number;
  notes: string[];
}

export interface OmDeliveryError {
  success: false;
  error: string;
}

export type OmDeliveryResult = OmDeliveryEstimate | OmDeliveryError;
