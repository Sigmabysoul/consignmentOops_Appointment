/**
 * One function per Shiprocket Cargo endpoint, plus pure body builders that validate input
 * against the documented mandatory fields. Responses are returned raw; mappers.ts types them.
 * Land only: mode_name is always "surface".
 */
import { SHIPROCKET_PATHS, ShiprocketConfig, ShiprocketSender, getShiprocketConfig } from "./config";
import { shiprocketRequest, ShiprocketResponse } from "./client";
import { ShiprocketError } from "./errors";
import type { ShiprocketAddress, ShiprocketPackage } from "@/lib/shiprocket-types";

const PIN_RE = /^[1-9]\d{5}$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shiprocket requires an e-way bill above this invoice value (₹). */
export const EWAY_BILL_THRESHOLD = 50_000;

function invalid(message: string): never {
  throw new ShiprocketError("invalid_input", message);
}

const money = (n: number) => Number(Number(n).toFixed(2));

export function assertPincode(pin: string, label = "pincode"): string {
  const p = String(pin ?? "").trim();
  if (!PIN_RE.test(p)) invalid(`Invalid ${label} "${pin}": must be a 6 digit Indian pincode.`);
  return p;
}

function required(value: string | undefined | null, label: string): string {
  const v = String(value ?? "").trim();
  if (!v) invalid(`${label} is required.`);
  return v;
}

function phone(value: string, label: string): string {
  const digits = String(value || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!PHONE_RE.test(digits)) invalid(`${label} must be a 10 digit mobile number.`);
  return digits;
}

function email(value: string, label: string): string {
  const v = String(value || "").trim();
  if (!EMAIL_RE.test(v)) invalid(`${label} must be a valid email address.`);
  return v;
}

export function validatePackages(packages: ShiprocketPackage[]): ShiprocketPackage[] {
  if (!Array.isArray(packages) || packages.length === 0) invalid("At least one package group is required.");
  return packages.map((p, i) => {
    const n = i + 1;
    const units = Number(p.units);
    if (!Number.isInteger(units) || units < 1) invalid(`Package group ${n}: box count must be a whole number ≥ 1.`);
    const dims = [p.lengthCm, p.widthCm, p.heightCm].map(Number);
    if (dims.some((d) => !(d >= 1))) invalid(`Package group ${n}: length, width and height must each be at least 1 cm.`);
    const w = Number(p.weightKg);
    if (!(w > 0)) invalid(`Package group ${n}: weight per box must be greater than 0 kg.`);
    return { units, lengthCm: money(dims[0]), widthCm: money(dims[1]), heightCm: money(dims[2]), weightKg: money(w) };
  });
}

export const totalUnits = (pk: ShiprocketPackage[]) => pk.reduce((s, p) => s + p.units, 0);
/** Total actual weight in kg, 2 decimals, summed in integer grams (no float drift). */
export const totalWeightKg = (pk: ShiprocketPackage[]) =>
  pk.reduce((g, p) => g + Math.round(p.weightKg * 1000) * p.units, 0) / 1000;

// ---------- rate calculator ----------

export interface ChargesInput {
  packages: ShiprocketPackage[];
  invoiceValue: number;
  to: { pincode: string; city: string; state: string };
}

export function buildChargesBody(input: ChargesInput, sender: ShiprocketSender) {
  const packages = validatePackages(input.packages);
  if (!(input.invoiceValue > 0)) invalid("Invoice value must be greater than 0.");
  return {
    packaging_unit_details: packages.map((p) => ({
      units: p.units,
      length: p.lengthCm,
      height: p.heightCm,
      width: p.widthCm,
      weight: p.weightKg,
      unit: "cm",
    })),
    invoice_value: money(input.invoiceValue),
    from_pincode: assertPincode(sender.pincode, "sender pincode"),
    from_city: required(sender.city, "Sender city"),
    from_state: required(sender.state, "Sender state"),
    to_pincode: assertPincode(input.to.pincode, "destination pincode"),
    to_city: required(input.to.city, "Destination city"),
    to_state: required(input.to.state, "Destination state"),
    quantity: totalUnits(packages),
    is_cod: false,
  };
}

export function getCharges(input: ChargesInput, config: ShiprocketConfig = getShiprocketConfig()): Promise<ShiprocketResponse> {
  return shiprocketRequest(
    { method: "POST", path: SHIPROCKET_PATHS.charges, json: buildChargesBody(input, config.sender), rateBucket: "charges" },
    config
  );
}

// ---------- step 1: order creation ----------

export interface OrderCreationInput {
  clientOrderId: string;
  packages: ShiprocketPackage[];
  invoice: { value: number; number: string; date: string | null };
  destination: ShiprocketAddress;
  pickupDate?: string | null; // YYYY-MM-DD
  poNumber?: string | null;
  poExpiryDate?: string | null; // YYYY-MM-DD
}

export function buildOrderCreationBody(input: OrderCreationInput, config: ShiprocketConfig) {
  const packages = validatePackages(input.packages);
  const s = config.sender;
  const d = input.destination;
  if (!(input.invoice.value > 0)) invalid("Invoice value must be greater than 0.");
  if (input.invoice.date && !DATE_RE.test(input.invoice.date)) invalid("Invoice date must be YYYY-MM-DD.");
  if (input.pickupDate && !DATE_RE.test(input.pickupDate)) invalid("Pickup date must be YYYY-MM-DD.");
  return {
    client_id: config.clientId,
    client_order_id: required(input.clientOrderId, "RO/PO number"),
    no_of_packages: totalUnits(packages),
    approx_weight: money(totalWeightKg(packages)),
    invoice_value: money(input.invoice.value),
    ...(input.invoice.number ? { invoice_number: input.invoice.number.trim() } : {}),
    ...(input.invoice.date ? { invoice_date: input.invoice.date } : {}),
    ...(input.pickupDate ? { pickup_date_time: `${input.pickupDate} 10:00:00` } : {}),
    is_insured: false,
    is_to_pay: false,
    is_cod: false,
    mode_name: "surface", // land only — never air
    source_warehouse_name: required(s.warehouseName, "Sender warehouse name (SHIPROCKET_SENDER_WAREHOUSE_NAME)"),
    source_address_line1: required(s.addressLine1, "Sender address (SHIPROCKET_SENDER_ADDRESS_LINE1)"),
    ...(s.addressLine2 ? { source_address_line2: s.addressLine2 } : {}),
    source_pincode: assertPincode(s.pincode, "sender pincode"),
    source_city: required(s.city, "Sender city"),
    source_state: required(s.state, "Sender state"),
    sender_contact_person_name: required(s.contactName, "Sender contact name (SHIPROCKET_SENDER_CONTACT_NAME)"),
    sender_contact_person_email: email(s.contactEmail, "Sender contact email (SHIPROCKET_SENDER_CONTACT_EMAIL)"),
    sender_contact_person_contact_no: phone(s.contactPhone, "Sender contact phone (SHIPROCKET_SENDER_CONTACT_PHONE)"),
    ...(d.name?.trim() ? { destination_warehouse_name: d.name.trim() } : {}),
    destination_address_line1: required(d.addressLine1, "Destination address"),
    ...(d.addressLine2?.trim() ? { destination_address_line2: d.addressLine2.trim() } : {}),
    destination_pincode: assertPincode(d.pincode, "destination pincode"),
    destination_city: required(d.city, "Destination city"),
    destination_state: required(d.state, "Destination state"),
    recipient_contact_person_name: required(d.contactName, "Recipient contact name"),
    recipient_contact_person_email: email(d.contactEmail, "Recipient contact email"),
    recipient_contact_person_contact_no: phone(d.contactPhone, "Recipient contact phone"),
    ...(d.gstin?.trim() ? { recipient_GST: d.gstin.trim().toUpperCase() } : {}),
    packaging_unit_details: packages.map((p) => ({
      units: p.units,
      weight: p.weightKg,
      length: p.lengthCm,
      height: p.heightCm,
      width: p.widthCm,
    })),
    ...(input.poNumber ? { po_no: input.poNumber } : {}),
    ...(input.poExpiryDate && DATE_RE.test(input.poExpiryDate) ? { po_expiry_date: input.poExpiryDate } : {}),
    is_appointment_taken: false,
    source: "API",
    shipment_type: "forward",
  };
}

export function createOrder(input: OrderCreationInput, config: ShiprocketConfig = getShiprocketConfig()): Promise<ShiprocketResponse> {
  if (!config.bookingEnabled) throw new ShiprocketError("booking_disabled", "Shiprocket booking is disabled.");
  return shiprocketRequest({ method: "POST", path: SHIPROCKET_PATHS.orderCreation, json: buildOrderCreationBody(input, config) }, config);
}

// ---------- step 2: shipment creation ----------

export interface ShipmentCreationInput {
  orderId: number;
  modeId: number;
  deliveryPartnerId: number;
  invoice: { value: number; number: string; date: string | null };
  ewayBillNo?: string | null;
  recipientGstin?: string | null;
  remarks: string;
}

export function buildShipmentBody(input: ShipmentCreationInput, config: ShiprocketConfig) {
  if (!Number.isInteger(input.orderId) || input.orderId <= 0) invalid("Shiprocket order id is missing.");
  if (!Number.isInteger(input.modeId) || !Number.isInteger(input.deliveryPartnerId)) invalid("Choose a carrier first.");
  if (!(input.invoice.value > 0)) invalid("Invoice value must be greater than 0.");
  const eway = String(input.ewayBillNo || "").replace(/\s/g, "");
  if (input.invoice.value > EWAY_BILL_THRESHOLD && !/^\d{12}$/.test(eway)) {
    invalid(`An e-way bill (12 digits) is required for invoice value above ₹${EWAY_BILL_THRESHOLD.toLocaleString("en-IN")}.`);
  }
  if (eway && !/^\d{12}$/.test(eway)) invalid("E-way bill number must be 12 digits.");
  return {
    client_id: config.clientId,
    order_id: input.orderId,
    remarks: required(input.remarks, "Remarks"),
    mode_id: input.modeId,
    delivery_partner_id: input.deliveryPartnerId,
    invoice_value: money(input.invoice.value),
    ...(input.invoice.number ? { invoice_number: input.invoice.number.trim() } : {}),
    ...(input.invoice.date ? { invoice_date: input.invoice.date } : {}),
    ...(eway ? { eway_bill_no: eway } : {}),
    ...(input.recipientGstin?.trim() ? { recipient_GST: input.recipientGstin.trim().toUpperCase() } : {}),
    source: "API",
  };
}

export function createShipment(input: ShipmentCreationInput, config: ShiprocketConfig = getShiprocketConfig()): Promise<ShiprocketResponse> {
  if (!config.bookingEnabled) throw new ShiprocketError("booking_disabled", "Shiprocket booking is disabled.");
  return shiprocketRequest({ method: "POST", path: SHIPROCKET_PATHS.shipmentCreation, json: buildShipmentBody(input, config) }, config);
}

// ---------- lookups ----------

export const getShipment = (shipmentId: number, config: ShiprocketConfig = getShiprocketConfig()) =>
  shiprocketRequest({ method: "GET", path: SHIPROCKET_PATHS.getShipment(shipmentId) }, config);

export const getOrderDetails = (orderId: number, config: ShiprocketConfig = getShiprocketConfig()) =>
  shiprocketRequest({ method: "GET", path: SHIPROCKET_PATHS.getOrder(orderId) }, config);

export function trackWaybill(waybill: string, config: ShiprocketConfig = getShiprocketConfig()): Promise<ShiprocketResponse> {
  const w = String(waybill || "").trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(w)) invalid("Invalid waybill number.");
  return shiprocketRequest({ method: "GET", path: SHIPROCKET_PATHS.track(w), rateBucket: "tracking" }, config);
}

export const listWarehouses = (page = 1, search?: string, config: ShiprocketConfig = getShiprocketConfig()) =>
  shiprocketRequest(
    { method: "GET", path: SHIPROCKET_PATHS.warehouses, query: { client_id: config.clientId, page, page_size: 50, search } },
    config
  );

// ---------- delivery appointment ----------

export interface AppointmentInput {
  shipmentId: number;
  /** "YYYY-MM-DDTHH:MM" local India time */
  start: string;
  end: string;
  poNumber: string;
  poExpiryDate: string; // YYYY-MM-DD
  supportingDocs?: string[];
}

const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function buildAppointmentBody(input: AppointmentInput) {
  if (!LOCAL_DT_RE.test(input.start) || !LOCAL_DT_RE.test(input.end)) invalid("Appointment start and end must be date + time.");
  if (input.end <= input.start) invalid("Appointment end must be after the start.");
  if (!DATE_RE.test(input.poExpiryDate)) invalid("PO expiry date is required.");
  const start = `${input.start}:00+05:30`;
  const end = `${input.end}:00+05:30`;
  return {
    is_appointment_taken: true,
    appointment_date: start,
    appointment_end_date: end,
    new_appointment_date: start,
    new_appointment_end_date: end,
    supporting_docs: input.supportingDocs ?? [],
    po_no: required(input.poNumber, "PO number"),
    po_expiry_date: input.poExpiryDate,
    channel_name: "API",
    is_green_channel: false,
  };
}

export function updateAppointment(input: AppointmentInput, config: ShiprocketConfig = getShiprocketConfig()): Promise<ShiprocketResponse> {
  return shiprocketRequest(
    { method: "PUT", path: SHIPROCKET_PATHS.appointment(input.shipmentId), json: buildAppointmentBody(input) },
    config
  );
}
