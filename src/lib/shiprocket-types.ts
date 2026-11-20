/**
 * Shape of `customData.shiprocket` on a ConsignmentOrder, plus API result types.
 * Client-safe (no server code).
 */

export const SHIPROCKET_COURIER_NAME = "Shiprocket Cargo";

/** One package group as Shiprocket wants it: `units` boxes of the same size; weight is per box. */
export interface ShiprocketPackage {
  units: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
}

export interface ShiprocketAddress {
  name: string; // warehouse / facility name
  addressLine1: string;
  addressLine2: string;
  pincode: string;
  city: string;
  state: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  gstin?: string;
}

export interface ShiprocketChargeLine {
  label: string;
  amount: number;
}

/** One serviceable carrier from the rate calculator. */
export interface ShiprocketQuote {
  key: string; // "{delivery_partner}-{mode}" from the response
  deliveryPartner: string;
  transporterName: string | null;
  deliveryPartnerId: number | null;
  modeId: number | null;
  modeName: string | null;
  /** Grand total incl. GST, ₹ (2 decimals); null when the API had no rate ("-"). */
  total: number | null;
  gst: number | null;
  chargeableWeightKg: number | null;
  lines: ShiprocketChargeLine[];
  tatDays: number | null;
  pickupDate: string | null;
  logo: string | null;
}

/** A carrier Shiprocket offers for a created order (auto-selected or from carrier_list). */
export interface ShiprocketCarrierOption {
  deliveryPartnerId: number;
  deliveryPartnerName: string;
  modeId: number;
  modeName: string | null;
  transporterId: string | null;
  tatDays: number | null;
  isOda: boolean | null;
  scheduledPickupDate: string | null;
}

export type ShiprocketCallState = "submitting" | "done" | "failed" | "unknown_outcome";

export interface ShiprocketStatusEntry {
  status: string;
  location: string | null;
  remarks: string | null;
  timestamp: string | null;
}

export interface ShiprocketShipmentRecord {
  quote?: {
    at: string;
    by: string;
    destinationPin: string;
    weightKg: number;
    invoiceValue: number;
    quotes: ShiprocketQuote[];
  };

  /** Step 1: order creation. */
  order?: {
    state: ShiprocketCallState;
    orderId: number | null;
    submittedAt: string;
    submittedBy: string;
    message?: string | null;
    carriers: ShiprocketCarrierOption[];
    destination: ShiprocketAddress;
    packages: ShiprocketPackage[];
    invoice: { value: number; number: string; date: string | null };
  };

  /** Step 2: shipment creation (books the pickup). */
  shipment?: {
    state: ShiprocketCallState;
    shipmentId: number | null;
    submittedAt: string;
    submittedBy: string;
    message?: string | null;
    carrier: ShiprocketCarrierOption | null;
    ewayBillNo: string | null;
  };

  waybill?: string;
  lrn?: string;
  childWaybills?: string[];
  labelUrl?: string | null;
  podUrl?: string | null;
  scheduledPickupDate?: string | null;
  deliveryPartner?: string | null;
  bookedAt?: string;

  tracking?: {
    status: string | null;
    statusDp: string | null;
    location: string | null;
    edd: string | null;
    deliveredAt: string | null;
    checkedAt: string;
  };
  statusHistory?: ShiprocketStatusEntry[];

  appointment?: {
    start: string; // ISO with +05:30
    end: string;
    poNumber: string;
    poExpiryDate: string;
    bookedAt: string;
    bookedBy: string;
  };

  lastError?: { at: string; action: string; message: string };
}

export interface ShiprocketServerStatus {
  configured: boolean;
  bookingEnabled: boolean;
  sender: { pincode: string; city: string; state: string; warehouseName: string };
  missingSenderFields: string[];
  /** Platforms where the user holds "Override workflow gates" (may retry an unknown-outcome booking). */
  overrideChannels: string[];
}
