/**
 * One function per Delhivery B2B endpoint. Request shapes follow the Developer Portal pages
 * and the staging Postman collection in api_docs/.
 *
 * Responses are returned RAW (`unknown`). The portal does not document response bodies, so
 * mapping to app types happens only in mappers.ts, built from captured staging fixtures.
 */
import { DELHIVERY_PATHS, DelhiveryConfig, DelhiveryLabelSize, getDelhiveryConfig } from "./config";
import { delhiveryRequest, DelhiveryResponse } from "./client";
import { DelhiveryError } from "./errors";

// ---------- validation helpers ----------

const PIN_RE = /^[1-9]\d{5}$/;
const PHONE_RE = /^\d{10}$/;

function invalid(message: string): never {
  throw new DelhiveryError("invalid_input", message);
}

export function assertPincode(pin: string, label = "pincode"): string {
  const p = String(pin ?? "").trim();
  if (!PIN_RE.test(p)) invalid(`Invalid ${label} "${pin}": must be a 6 digit Indian pincode.`);
  return p;
}

function assertPositiveInt(n: number, label: string): number {
  if (!Number.isInteger(n) || n <= 0) invalid(`${label} must be a positive whole number (got ${n}).`);
  return n;
}

function assertPositive(n: number, label: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) invalid(`${label} must be greater than 0 (got ${n}).`);
  return n;
}

/** kg -> integer grams with no float noise (54.18 kg -> 54180). */
export function kgToGrams(kg: number): number {
  return Math.round(Number(kg.toFixed(3)) * 1000);
}

// ---------- read-only lookups ----------

/** GET /pincode-service/{pin}?weight= (weight in grams, optional). */
export function getPincodeServiceability(
  pin: string,
  weightG?: number,
  config: DelhiveryConfig = getDelhiveryConfig()
): Promise<DelhiveryResponse> {
  const p = assertPincode(pin);
  return delhiveryRequest(
    {
      method: "GET",
      path: DELHIVERY_PATHS.serviceability(p),
      query: weightG ? { weight: Math.round(weightG) } : undefined,
      rateBucket: "serviceability",
    },
    config
  );
}

/** GET /tat/estimate?origin_pin&destination_pin&mot=S&pdt=B2B. Surface only (no air). */
export function getExpectedTat(
  originPin: string,
  destinationPin: string,
  config: DelhiveryConfig = getDelhiveryConfig()
): Promise<DelhiveryResponse> {
  return delhiveryRequest(
    {
      method: "GET",
      path: DELHIVERY_PATHS.tat,
      query: {
        origin_pin: assertPincode(originPin, "origin pincode"),
        destination_pin: assertPincode(destinationPin, "destination pincode"),
        mot: "S",
        pdt: "B2B",
      },
      rateBucket: "tat",
      sendRequestId: true,
    },
    config
  );
}

export interface FreightEstimateBox {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  boxCount: number;
}

export interface FreightEstimateInput {
  boxes: FreightEstimateBox[];
  totalWeightKg: number;
  destinationPin: string;
  sourcePin?: string;
  invoiceAmount: number;
  paymentMode?: "prepaid" | "cod";
  codAmount?: number;
  freightMode?: "fop" | "fod";
  /** true = carrier risk, false = owner risk */
  rovInsurance?: boolean;
}

export function buildFreightEstimateBody(input: FreightEstimateInput, sourcePin: string) {
  if (!input.boxes?.length) invalid("At least one box set is required.");
  const paymentMode = input.paymentMode ?? "prepaid";
  if (paymentMode === "cod") assertPositive(input.codAmount ?? 0, "COD amount");
  return {
    dimensions: input.boxes.map((b, i) => ({
      length_cm: Number(assertPositive(b.lengthCm, `Box set ${i + 1} length`).toFixed(2)),
      width_cm: Number(assertPositive(b.widthCm, `Box set ${i + 1} width`).toFixed(2)),
      height_cm: Number(assertPositive(b.heightCm, `Box set ${i + 1} height`).toFixed(2)),
      box_count: assertPositiveInt(b.boxCount, `Box set ${i + 1} count`),
    })),
    weight_g: kgToGrams(assertPositive(input.totalWeightKg, "Total weight")),
    cheque_payment: false,
    source_pin: assertPincode(input.sourcePin ?? sourcePin, "source pincode"),
    consignee_pin: assertPincode(input.destinationPin, "destination pincode"),
    payment_mode: paymentMode,
    ...(paymentMode === "cod" ? { cod_amount: Number(input.codAmount!.toFixed(2)) } : {}),
    inv_amount: Number(assertPositive(input.invoiceAmount, "Invoice amount").toFixed(2)),
    freight_mode: input.freightMode ?? "fop",
    rov_insurance: input.rovInsurance ?? false,
  };
}

/** POST /freight/estimate */
export function estimateFreight(
  input: FreightEstimateInput,
  config: DelhiveryConfig = getDelhiveryConfig()
): Promise<DelhiveryResponse> {
  return delhiveryRequest(
    {
      method: "POST",
      path: DELHIVERY_PATHS.freightEstimate,
      json: buildFreightEstimateBody(input, config.sourcePin),
      rateBucket: "freightEstimate",
    },
    config
  );
}

// ---------- booking (manifest) ----------

export interface ManifestConsignee {
  name: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  phone: string;
  email?: string;
}

export interface ManifestInvoice {
  number?: string;
  amount?: number;
  ewaybill?: string;
  qrCode?: string;
}

export interface ManifestBillingAddress {
  name: string;
  company: string;
  consignor: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  phone: string;
  panNumber?: string;
  gstNumber?: string;
}

export interface ManifestDocFile {
  file: Blob;
  filename: string;
  /** Invoice numbers this file covers. */
  invoiceNumbers: string[];
}

export interface ManifestInput {
  orderId: string;
  description: string;
  boxes: FreightEstimateBox[];
  totalWeightKg: number;
  consignee: ManifestConsignee;
  invoices: ManifestInvoice[];
  paymentMode?: "prepaid" | "cod";
  codAmount?: number;
  freightMode?: "fop" | "fod";
  rovInsurance?: boolean;
  fmPickup?: boolean;
  billingAddress?: ManifestBillingAddress;
  docs?: ManifestDocFile[];
  /** Pre-assigned LR number, if Delhivery gave you a series. */
  lrn?: string;
  pickupLocationName?: string;
}

/** Python-style booleans, exactly as the staging Postman collection sends them for form scalars. */
const pyBool = (b: boolean) => (b ? "True" : "False");

export function buildManifestForm(input: ManifestInput, warehouseName: string): FormData {
  const pickupLocation = input.pickupLocationName ?? warehouseName;
  if (!pickupLocation) invalid("Registered Delhivery warehouse name is missing (DELHIVERY_WAREHOUSE_NAME).");
  if (!input.orderId?.trim()) invalid("Order id is required.");
  if (!input.boxes?.length) invalid("At least one box set is required.");

  const c = input.consignee;
  for (const [k, v] of Object.entries({ name: c.name, address: c.address, city: c.city, state: c.state })) {
    if (!String(v ?? "").trim()) invalid(`Consignee ${k} is required.`);
  }
  const phone = String(c.phone ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!PHONE_RE.test(phone)) invalid(`Consignee phone "${c.phone}" must be 10 digits.`);

  if (!input.invoices?.length) invalid("At least one invoice is required.");
  input.invoices.forEach((inv, i) => {
    const hasNumAmt = Boolean(inv.number?.trim()) && typeof inv.amount === "number" && inv.amount > 0;
    if (!hasNumAmt && !inv.qrCode?.trim()) invalid(`Invoice ${i + 1}: give an invoice number and amount, or the invoice QR code.`);
  });
  const invoiceTotal = input.invoices.reduce((s, inv) => s + (inv.amount ?? 0), 0);
  if (invoiceTotal > 50_000 && input.invoices.some((inv) => !inv.ewaybill?.trim())) {
    invalid("Invoice value is above ₹50,000: an e-way bill number is required on every invoice.");
  }

  const paymentMode = input.paymentMode ?? "prepaid";
  if (paymentMode === "cod") assertPositive(input.codAmount ?? 0, "COD amount");
  if (input.billingAddress && !input.billingAddress.panNumber && !input.billingAddress.gstNumber) {
    invalid("Billing address needs either a PAN or a GST number.");
  }

  const totalBoxes = input.boxes.reduce((s, b) => s + assertPositiveInt(b.boxCount, "Box count"), 0);
  const weightG = kgToGrams(assertPositive(input.totalWeightKg, "Total weight"));

  const form = new FormData();
  form.set("lrn", input.lrn ?? "");
  form.set("pickup_location_name", pickupLocation);
  form.set("payment_mode", paymentMode);
  if (paymentMode === "cod") form.set("cod_amount", String(Number(input.codAmount!.toFixed(2))));
  form.set("weight", String(weightG));
  form.set(
    "dropoff_location",
    JSON.stringify({
      consignee_name: c.name.trim(),
      address: c.address.trim(),
      city: c.city.trim(),
      state: c.state.trim(),
      zip: assertPincode(c.pin, "consignee pincode"),
      phone,
      email: c.email?.trim() ?? "",
    })
  );
  form.set("rov_insurance", pyBool(input.rovInsurance ?? false));
  form.set(
    "invoices",
    JSON.stringify(
      input.invoices.map((inv) => ({
        ewaybill: inv.ewaybill?.trim() ?? "",
        inv_num: inv.number?.trim() ?? "",
        inv_amt: typeof inv.amount === "number" ? Number(inv.amount.toFixed(2)) : "",
        inv_qr_code: inv.qrCode?.trim() ?? "",
      }))
    )
  );
  form.set(
    "shipment_details",
    JSON.stringify([
      {
        order_id: input.orderId.trim(),
        box_count: totalBoxes,
        description: input.description.trim() || "Retail goods",
        weight: weightG,
        waybills: [],
        master: false,
      },
    ])
  );
  form.set(
    "dimensions",
    JSON.stringify(
      input.boxes.map((b) => ({
        box_count: b.boxCount,
        length: Number(b.lengthCm.toFixed(2)),
        width: Number(b.widthCm.toFixed(2)),
        height: Number(b.heightCm.toFixed(2)),
      }))
    )
  );
  form.set("freight_mode", input.freightMode ?? "fop");
  form.set("fm_pickup", pyBool(input.fmPickup ?? false));
  if (input.billingAddress) {
    const b = input.billingAddress;
    form.set(
      "billing_address",
      JSON.stringify({
        name: b.name,
        company: b.company,
        consignor: b.consignor,
        address: b.address,
        city: b.city,
        state: b.state,
        pin: assertPincode(b.pin, "billing pincode"),
        phone: b.phone,
        ...(b.panNumber ? { pan_number: b.panNumber } : {}),
        ...(b.gstNumber ? { gst_number: b.gstNumber } : {}),
      })
    );
  }
  if (input.docs?.length) {
    if (input.docs.length > 10) invalid("At most 10 invoice files can be attached.");
    const totalBytes = input.docs.reduce((s, d) => s + d.file.size, 0);
    if (totalBytes > 20 * 1024 * 1024) invalid("Invoice files must total 20 MB or less.");
    form.set(
      "doc_data",
      JSON.stringify(input.docs.map((d) => ({ doc_type: "INVOICE_COPY", doc_meta: { invoice_num: d.invoiceNumbers } })))
    );
    for (const d of input.docs) form.append("doc_file", d.file, d.filename);
  }
  return form;
}

/**
 * POST /manifest. Asynchronous: the response carries a job id; poll getManifestStatus.
 * NEVER retried automatically. Refused unless DELHIVERY_BOOKING_ENABLED=true.
 * Callers must check the order has no job id / LR yet and hold a per-order lock.
 */
export function createManifest(
  input: ManifestInput,
  config: DelhiveryConfig = getDelhiveryConfig()
): Promise<DelhiveryResponse> {
  if (!config.bookingEnabled) {
    throw new DelhiveryError("booking_disabled", "DELHIVERY_BOOKING_ENABLED is not true; manifest refused.");
  }
  return delhiveryRequest(
    { method: "POST", path: DELHIVERY_PATHS.manifest, form: buildManifestForm(input, config.warehouseName), timeout: "document" },
    config
  );
}

/** GET /manifest?job_id= */
export function getManifestStatus(jobId: string, config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!jobId?.trim()) invalid("Manifest job id is required.");
  return delhiveryRequest({ method: "GET", path: DELHIVERY_PATHS.manifest, query: { job_id: jobId.trim() }, timeout: "document" }, config);
}

// ---------- after booking ----------

/** GET /lrn/track?lrnum= (latest status only). */
export function trackLr(lrn: string, allWaybills = false, config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!lrn?.trim()) invalid("LR number is required.");
  return delhiveryRequest(
    { method: "GET", path: DELHIVERY_PATHS.track, query: { lrnum: lrn.trim(), all_wbns: allWaybills || undefined }, rateBucket: "tracking" },
    config
  );
}

/** GET /label/get_urls/{size}/{lrn} — links whose content is a base64 PNG stream per box. */
export function getShippingLabels(lrn: string, size: DelhiveryLabelSize = "std", config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!lrn?.trim()) invalid("LR number is required.");
  return delhiveryRequest({ method: "GET", path: DELHIVERY_PATHS.label(size, lrn.trim()), timeout: "document" }, config);
}

/** GET /lr_copy/print/{lrn} — PDF bytes. */
export function getLrCopy(lrn: string, copyTypes?: string[], config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!lrn?.trim()) invalid("LR number is required.");
  return delhiveryRequest<Buffer | unknown>(
    {
      method: "GET",
      path: DELHIVERY_PATHS.lrCopy(lrn.trim()),
      query: copyTypes?.length ? { lr_copy_type: copyTypes.join(",") } : undefined,
      timeout: "document",
      sendRequestId: true,
      binary: true,
    },
    config
  );
}

export interface PickupRequestInput {
  pickupDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  expectedPackageCount: number;
  warehouseName?: string;
}

/** POST /pickup_requests */
export function createPickupRequest(input: PickupRequestInput, config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.pickupDate)) invalid("Pickup date must be YYYY-MM-DD.");
  if (!/^\d{2}:\d{2}:\d{2}$/.test(input.startTime)) invalid("Pickup start time must be HH:MM:SS.");
  const wh = input.warehouseName ?? config.warehouseName;
  if (!wh) invalid("Registered Delhivery warehouse name is missing (DELHIVERY_WAREHOUSE_NAME).");
  return delhiveryRequest(
    {
      method: "POST",
      path: DELHIVERY_PATHS.pickupRequests,
      json: {
        client_warehouse: wh,
        pickup_date: input.pickupDate,
        start_time: input.startTime,
        expected_package_count: assertPositiveInt(input.expectedPackageCount, "Expected package count"),
      },
      sendRequestId: true,
    },
    config
  );
}

export function cancelPickupRequest(pickupId: string, config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!pickupId?.trim()) invalid("Pickup request id is required.");
  return delhiveryRequest({ method: "DELETE", path: DELHIVERY_PATHS.pickupCancel(pickupId.trim()), sendRequestId: true }, config);
}

export interface AppointmentInput {
  lrn: string;
  date: string; // DD/MM/YYYY
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  poNumbers: string[]; // max 5, ["NotApplicable"] if none
  appointmentId: string;
}

/** POST /appointments/lm — allowed after manifest, before out-for-delivery. */
export function bookLastMileAppointment(input: AppointmentInput, config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!input.lrn?.trim()) invalid("LR number is required.");
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(input.date)) invalid("Appointment date must be DD/MM/YYYY.");
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) invalid("Appointment times must be HH:MM.");
  const po = input.poNumbers.filter((p) => p.trim()).slice(0, 5);
  return delhiveryRequest(
    {
      method: "POST",
      path: DELHIVERY_PATHS.appointment,
      json: {
        lrn: input.lrn.trim(),
        date: input.date,
        start_time: input.startTime,
        end_time: input.endTime,
        po_number: po.length ? po : ["NotApplicable"],
        appointment_id: input.appointmentId.trim(),
      },
    },
    config
  );
}

/** DELETE /lrn/cancel/{lrn}. UI must confirm (OTP) before calling. */
export function cancelLr(lrn: string, config: DelhiveryConfig = getDelhiveryConfig()) {
  if (!lrn?.trim()) invalid("LR number is required.");
  return delhiveryRequest({ method: "DELETE", path: DELHIVERY_PATHS.lrCancel(lrn.trim()) }, config);
}

/** GET /lrn/freight-breakup?lrns=a,b (max 25) — actual billed charges. */
export function getFreightBreakup(lrns: string[], config: DelhiveryConfig = getDelhiveryConfig()) {
  const list = lrns.map((l) => l.trim()).filter(Boolean);
  if (!list.length || list.length > 25) invalid("Give between 1 and 25 LR numbers.");
  return delhiveryRequest({ method: "GET", path: DELHIVERY_PATHS.freightBreakup, query: { lrns: list.join(",") } }, config);
}

/** GET /document/download?lrn&doc_type=LM_POD&version=latest */
export function downloadDocument(
  lrn: string,
  docType: "LM_POD" | "RETURN_DSP_POD" = "LM_POD",
  config: DelhiveryConfig = getDelhiveryConfig()
) {
  if (!lrn?.trim()) invalid("LR number is required.");
  return delhiveryRequest(
    {
      method: "GET",
      path: DELHIVERY_PATHS.documentDownload,
      query: { lrn: lrn.trim(), doc_type: docType, version: "latest" },
      timeout: "document",
      sendRequestId: true,
    },
    config
  );
}
