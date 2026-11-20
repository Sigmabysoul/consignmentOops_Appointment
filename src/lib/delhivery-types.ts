/**
 * Shape of `customData.delhivery` on a ConsignmentOrder, plus API payload types.
 * Safe to import from client components (no server code here).
 */

export interface DelhiveryChargeLine {
  label: string;
  amount: number;
}

export interface DelhiveryStatusEntry {
  status: string;
  location: string | null;
  /** Time Delhivery reported, if any (raw string). */
  statusTime: string | null;
  /** When we recorded it (ISO). */
  at: string;
  source: "poll" | "manual" | "booking";
}

/**
 * Manifest lifecycle:
 * - submitting: claimed by a request, call in flight
 * - pending: Delhivery accepted, job id saved, waiting for LR
 * - success: LR + AWBs received
 * - failed: Delhivery rejected it, or we never sent it; safe to submit again
 * - unknown_outcome: the call timed out / network dropped after sending. Delhivery MAY have
 *   created an LR. Resubmitting needs an explicit override after checking the Delhivery panel.
 */
export type DelhiveryManifestState = "submitting" | "pending" | "success" | "failed" | "unknown_outcome";

export interface DelhiveryShipmentRecord {
  env?: "test" | "production";
  warehouseName?: string;

  estimate?: {
    at: string;
    by: string;
    destinationPin: string;
    weightKg: number;
    invoiceAmount: number;
    serviceable: boolean | null;
    oda: boolean | null;
    tatDays: number | null;
    total: number | null;
    gst: number | null;
    lines: DelhiveryChargeLine[];
    /** Response paths the provisional mapper matched; empty = nothing recognised. */
    matched: string[];
  };

  manifest?: {
    state: DelhiveryManifestState;
    jobId: string | null;
    submittedAt: string;
    submittedBy: string;
    lastCheckedAt?: string;
    rawStatus?: string | null;
    message?: string | null;
    requestId?: string | null;
    summary: {
      boxes: number;
      weightKg: number;
      consigneePin: string;
      invoiceTotal: number;
      paymentMode: "prepaid" | "cod";
    };
  };

  lrn?: string;
  awbs?: string[];
  bookedAt?: string;

  appointment?: {
    date: string; // DD/MM/YYYY as sent
    slot: string;
    poNumbers: string[];
    appointmentId: string;
    poExpiryDate: string;
    bookedAt: string;
    bookedBy: string;
  };

  pickup?: {
    id: string | null;
    date: string; // YYYY-MM-DD as sent
    startTime: string; // HH:MM:SS
    expectedPackageCount: number;
    requestedAt: string;
    requestedBy: string;
    /** submitting = claim written before the call; requested = Delhivery answered;
     *  unknown_outcome = timed out after sending. Absent on records from before the claim. */
    state?: "submitting" | "requested" | "unknown_outcome";
    cancelledAt?: string;
    cancelledBy?: string;
  };

  tracking?: {
    status: string | null;
    location: string | null;
    statusTime: string | null;
    checkedAt: string;
  };
  statusHistory?: DelhiveryStatusEntry[];

  labels?: { size: string; urls: string[]; fetchedAt: string };

  actualFreight?: {
    total: number | null;
    gst: number | null;
    lines: DelhiveryChargeLine[];
    fetchedAt: string;
  };

  cancelled?: { at: string; by: string; reason: string };

  lastError?: { at: string; action: string; message: string; requestId?: string | null };
}

export interface DelhiveryServerStatus {
  configured: boolean;
  env: "test" | "production";
  bookingEnabled: boolean;
  warehouseConfigured: boolean;
  sourcePin: string;
  /** Whether the current user may cancel LRs. */
  /** Platforms where the user holds "Override workflow gates" (may retry an unknown-outcome booking). */
  overrideChannels: string[];
}

export interface DelhiveryEstimateResult {
  serviceable: boolean | null;
  oda: boolean | null;
  tatDays: number | null;
  total: number | null;
  gst: number | null;
  lines: DelhiveryChargeLine[];
  matched: string[];
  /** Per-call failures (the other calls may still have succeeded). */
  errors: { call: "serviceability" | "tat" | "freight"; message: string }[];
  /** True until the mappers have been verified against real staging responses. */
  provisional: boolean;
}

export const DELHIVERY_SLOT_OPTIONS = [
  "07:00 AM-10:00 AM",
  "09:00 AM-12:00 PM",
  "12:00 PM-03:00 PM",
  "03:00 PM-06:00 PM",
  "06:00 PM-09:00 PM",
  "09:00 PM-11:59 PM",
  "09:00 AM-06:00 PM",
  "12:00 AM-07:00 AM",
] as const;
