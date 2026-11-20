"use client";

import React, { useEffect, useMemo, useState } from "react";
import { channelsMatch } from "@/lib/channel-aliases";
import { AlertCircle, CheckCircle2, ExternalLink, Plus, Rocket, Trash2, X } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type {
  ShiprocketAddress,
  ShiprocketCarrierOption,
  ShiprocketPackage,
  ShiprocketServerStatus,
  ShiprocketShipmentRecord,
} from "@/lib/shiprocket-types";
import { DateInput } from "@/components/ui/DateInput";
import { formatDateDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import {
  defaultPackages,
  extractPincode,
  orderAddressText,
  packagesReady,
  postJson,
  readShiprocketRecord,
  rupees,
  shiprocketApi,
  splitStateCity,
} from "./shiprocket-client";

const EWAY_THRESHOLD = 50_000;

interface Props {
  order: AppointmentOrder;
  isOpen: boolean;
  status: ShiprocketServerStatus | null;
  defaultWeightKg: number;
  defaultInvoiceValue: number;
  defaultStateLabel: string;
  onClose: () => void;
  onOrderUpdated: () => void;
}

const input =
  "w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400";

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] font-bold text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** Shiprocket Cargo booking: step 1 creates the order, step 2 books one of the offered carriers. */
export function ShiprocketBookingModal({ order, isOpen, status, defaultWeightKg, defaultInvoiceValue, defaultStateLabel, onClose, onOrderUpdated }: Props) {
  const { showToast } = useToast();
  const canOverrideHere = Boolean(status?.overrideChannels?.some((c) => channelsMatch(c, order.channel)));
  const [record, setRecord] = useState<ShiprocketShipmentRecord>(() => readShiprocketRecord(order));
  const [dest, setDest] = useState<ShiprocketAddress>({} as ShiprocketAddress);
  const [packages, setPackages] = useState<ShiprocketPackage[]>([]);
  const [invoiceValue, setInvoiceValue] = useState(0);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [carrierKey, setCarrierKey] = useState("");
  const [ewayBill, setEwayBill] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const rec = readShiprocketRecord(order);
    setRecord(rec);
    const sc = splitStateCity(defaultStateLabel);
    const address = orderAddressText(order);
    setDest(
      rec.order?.destination ?? {
        name: order.warehouseName || "",
        addressLine1: address.slice(0, 200),
        addressLine2: "",
        pincode: rec.quote?.destinationPin || extractPincode(address),
        city: sc.city,
        state: sc.state,
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        gstin: "",
      }
    );
    setPackages(rec.order?.packages ?? defaultPackages(order, defaultWeightKg));
    setInvoiceValue(rec.order?.invoice.value ?? defaultInvoiceValue);
    setInvoiceNumber(rec.order?.invoice.number ?? order.invoiceNo ?? "");
    setInvoiceDate(rec.order?.invoice.date ?? "");
    setPickupDate(order.pickupDate ? formatDateInputValue(order.pickupDate) : "");
    const first = rec.order?.carriers?.[0];
    setCarrierKey(first ? `${first.deliveryPartnerId}:${first.modeId}` : "");
    setEwayBill(rec.shipment?.ewayBillNo ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order.id]);

  const quotePrice = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const q of record.quote?.quotes ?? []) map.set(`${q.deliveryPartnerId}:${q.modeId}`, q.total);
    return map;
  }, [record.quote]);

  if (!isOpen) return null;

  const orderState = record.order?.state;
  const shipmentState = record.shipment?.state;
  const booked = shipmentState === "done";
  const step: 1 | 2 | 3 = booked ? 3 : orderState === "done" && record.order?.orderId ? 2 : 1;
  const needsEway = invoiceValue > EWAY_THRESHOLD || (record.order?.invoice.value ?? 0) > EWAY_THRESHOLD;
  const setD = (k: keyof ShiprocketAddress, v: string) => setDest((d) => ({ ...d, [k]: v }));
  const disabledReason = !status?.configured
    ? "Shiprocket Cargo credentials are not set on the server."
    : !status.bookingEnabled
    ? "Booking through the API is switched off (SHIPROCKET_BOOKING_ENABLED)."
    : status.missingSenderFields.length
    ? `Sender details missing on the server: ${status.missingSenderFields.join(", ")}`
    : null;

  const run = async (fn: () => Promise<{ shiprocket: ShiprocketShipmentRecord }>, success: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      setRecord(r.shiprocket);
      showToast(success, "success");
      onOrderUpdated();
      const first = r.shiprocket.order?.carriers?.[0];
      if (first && !carrierKey) setCarrierKey(`${first.deliveryPartnerId}:${first.modeId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createOrder = (override = false) =>
    run(
      () =>
        shiprocketApi(`/orders/${order.id}/order`, postJson({
          destination: dest,
          packages,
          invoice: { value: Number(invoiceValue.toFixed(2)), number: invoiceNumber, date: invoiceDate || null },
          pickupDate: pickupDate || null,
          override,
        })),
      "Shiprocket order created — choose a carrier"
    );

  const chosen: ShiprocketCarrierOption | undefined = record.order?.carriers.find((c) => `${c.deliveryPartnerId}:${c.modeId}` === carrierKey);
  const bookShipment = (override = false) =>
    chosen &&
    run(
      () =>
        shiprocketApi(`/orders/${order.id}/shipment`, postJson({
          deliveryPartnerId: chosen.deliveryPartnerId,
          modeId: chosen.modeId,
          ewayBillNo: ewayBill || null,
          remarks: `RO ${order.roPoNumber}`,
          override,
        })),
      `Booked with ${chosen.deliveryPartnerName}`
    );

  const refreshDetails = () => run(() => shiprocketApi(`/orders/${order.id}/shipment`), "Shipment details refreshed");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-indigo-200 z-10 text-slate-800">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center"><Rocket className="w-4 h-4 text-indigo-600" /></div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Book with Shiprocket Cargo</h3>
              <p className="text-[11px] text-slate-500">
                <span className="font-mono font-bold">{order.roPoNumber}</span> · land / surface only · step {step} of 3
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {disabledReason && step < 3 && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{disabledReason}</span>
            </div>
          )}

          {step === 1 && (
            <>
              <section className="space-y-2">
                <h4 className="font-extrabold text-slate-900">Deliver to</h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  <Field label="Warehouse / facility name"><input className={input} value={dest.name || ""} onChange={(e) => setD("name", e.target.value)} /></Field>
                  <Field label="Recipient GSTIN"><input className={input} value={dest.gstin || ""} onChange={(e) => setD("gstin", e.target.value.toUpperCase())} /></Field>
                  <div className="sm:col-span-2"><Field label="Address line 1" required><input className={input} value={dest.addressLine1 || ""} onChange={(e) => setD("addressLine1", e.target.value)} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Address line 2"><input className={input} value={dest.addressLine2 || ""} onChange={(e) => setD("addressLine2", e.target.value)} /></Field></div>
                  <Field label="Pincode" required><input className={input} inputMode="numeric" value={dest.pincode || ""} onChange={(e) => setD("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} /></Field>
                  <Field label="City" required><input className={input} value={dest.city || ""} onChange={(e) => setD("city", e.target.value)} /></Field>
                  <Field label="State" required><input className={input} value={dest.state || ""} onChange={(e) => setD("state", e.target.value)} /></Field>
                  <Field label="Recipient contact name" required><input className={input} value={dest.contactName || ""} onChange={(e) => setD("contactName", e.target.value)} /></Field>
                  <Field label="Recipient phone" required><input className={input} inputMode="tel" value={dest.contactPhone || ""} onChange={(e) => setD("contactPhone", e.target.value)} /></Field>
                  <Field label="Recipient email" required><input className={input} type="email" value={dest.contactEmail || ""} onChange={(e) => setD("contactEmail", e.target.value)} /></Field>
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-900">Boxes</h4>
                  <button type="button" onClick={() => setPackages((p) => [...p, { units: 1, lengthCm: 0, widthCm: 0, heightCm: 0, weightKg: 0 }])}
                    className="text-[11px] font-bold text-indigo-700 flex items-center gap-1 cursor-pointer"><Plus className="w-3 h-3" /> Add size</button>
                </div>
                <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto] gap-1.5 text-[10px] font-bold text-slate-500">
                  <span>Boxes</span><span>L (cm)</span><span>W (cm)</span><span>H (cm)</span><span>Kg / box</span><span />
                </div>
                {packages.map((p, i) => (
                  <div key={i} className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto] gap-1.5">
                    {(["units", "lengthCm", "widthCm", "heightCm", "weightKg"] as const).map((k) => (
                      <input key={k} type="number" min={k === "units" ? 1 : 0} step={k === "units" ? 1 : 0.01} className={input} value={p[k] || ""}
                        onChange={(e) => setPackages((all) => all.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))} />
                    ))}
                    <button type="button" onClick={() => setPackages((all) => all.filter((_, j) => j !== i))} aria-label="Remove box size"
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {!packagesReady(packages) && <p className="text-[11px] text-amber-700">Every row needs a box count, all three dimensions and a weight.</p>}
              </section>

              <section className="grid sm:grid-cols-2 gap-2">
                <Field label="Invoice value (₹)" required>
                  <input className={input} type="number" min={0} step={0.01} value={invoiceValue || ""} onChange={(e) => setInvoiceValue(Number(e.target.value))} />
                </Field>
                <Field label="Invoice number"><input className={input} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></Field>
                <Field label="Invoice date"><DateInput className={input} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></Field>
                <Field label="Pickup date"><DateInput className={input} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} /></Field>
              </section>
              {invoiceValue > EWAY_THRESHOLD && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Invoice is above ₹50,000: you will need the e-way bill number (Part-A, using the transporter ID Shiprocket returns) in the next step.
                </p>
              )}

              {orderState === "unknown_outcome" && (
                <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2">
                  The last attempt timed out and may have created an order on Shiprocket. Check the Shiprocket Cargo panel first.
                  {canOverrideHere ? " You can retry anyway (you hold 'Override workflow gates' here)." : " Someone with 'Override workflow gates' on this platform can retry."}
                </p>
              )}
              {orderState === "failed" && record.order?.message && (
                <p className="text-[11px] text-rose-700">Last attempt failed: {record.order.message}</p>
              )}

              <div className="flex justify-end gap-2">
                {orderState === "unknown_outcome" && canOverrideHere && (
                  <button type="button" disabled={busy || Boolean(disabledReason)} onClick={() => createOrder(true)}
                    className="px-3 py-2 rounded-lg border border-rose-300 text-rose-700 font-bold disabled:opacity-40 cursor-pointer">Retry anyway (admin)</button>
                )}
                <button type="button" disabled={busy || Boolean(disabledReason) || !packagesReady(packages) || orderState === "unknown_outcome"} onClick={() => createOrder(false)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  {busy ? "Creating…" : "Step 1: Create Shiprocket order"}
                </button>
              </div>
            </>
          )}

          {step === 2 && record.order && (
            <>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                Shiprocket order <span className="font-mono font-bold">{record.order.orderId}</span> created
                {" "}· {record.order.packages.reduce((s, p) => s + p.units, 0)} box(es) to {record.order.destination.city} {record.order.destination.pincode}
                {" "}· invoice {rupees(record.order.invoice.value)}
              </div>
              {record.order.carriers.length === 0 ? (
                <p className="text-rose-700">{record.order.message || "Shiprocket offered no surface carrier for this lane."}</p>
              ) : (
                <section className="space-y-1.5" role="radiogroup" aria-label="Carrier">
                  <h4 className="font-extrabold text-slate-900">Choose the carrier</h4>
                  {record.order.carriers.map((c) => {
                    const key = `${c.deliveryPartnerId}:${c.modeId}`;
                    const price = quotePrice.get(key);
                    return (
                      <label key={key} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer ${carrierKey === key ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <span className="flex items-center gap-2">
                          <input type="radio" name="sr-carrier" checked={carrierKey === key} onChange={() => setCarrierKey(key)} />
                          <span>
                            <span className="font-bold text-slate-900">{c.deliveryPartnerName}</span>
                            <span className="block text-[11px] text-slate-500">
                              {c.tatDays !== null ? `${c.tatDays} days` : "TAT n/a"}
                              {c.scheduledPickupDate ? ` · pickup ${formatDateDisplay(c.scheduledPickupDate)}` : ""}
                              {c.isOda ? " · ODA" : ""}
                              {c.transporterId ? ` · transporter ${c.transporterId}` : ""}
                            </span>
                          </span>
                        </span>
                        <span className="font-black text-slate-900">{price !== undefined ? rupees(price) : ""}</span>
                      </label>
                    );
                  })}
                </section>
              )}
              <Field label={`E-way bill number${needsEway ? " (required)" : ""}`} required={needsEway}>
                <input className={input} inputMode="numeric" value={ewayBill} onChange={(e) => setEwayBill(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder={chosen?.transporterId ? `Generate Part-A with transporter ID ${chosen.transporterId}` : "12 digits"} />
              </Field>
              {shipmentState === "unknown_outcome" && (
                <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2">
                  The last booking timed out and may have gone through. Check the Shiprocket Cargo panel first.
                </p>
              )}
              {shipmentState === "failed" && record.shipment?.message && <p className="text-[11px] text-rose-700">Last attempt failed: {record.shipment.message}</p>}
              <div className="flex justify-end gap-2">
                {shipmentState === "unknown_outcome" && canOverrideHere && (
                  <button type="button" disabled={busy || !chosen} onClick={() => bookShipment(true)}
                    className="px-3 py-2 rounded-lg border border-rose-300 text-rose-700 font-bold disabled:opacity-40 cursor-pointer">Retry anyway (admin)</button>
                )}
                <button type="button" disabled={busy || !chosen || Boolean(disabledReason) || (needsEway && ewayBill.length !== 12) || shipmentState === "unknown_outcome"}
                  onClick={() => bookShipment(false)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  {busy ? "Booking…" : "Step 2: Book shipment"}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold"><CheckCircle2 className="w-4 h-4" /> Booked with {record.deliveryPartner || record.shipment?.carrier?.deliveryPartnerName}</div>
              <div className="grid sm:grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>Waybill: <span className="font-mono font-bold">{record.waybill || "pending"}</span></div>
                <div>LR / docket: <span className="font-mono font-bold">{record.lrn || "—"}</span></div>
                <div>Shipment ID: <span className="font-mono">{record.shipment?.shipmentId}</span></div>
                <div>Pickup: {record.scheduledPickupDate ? formatDateDisplay(record.scheduledPickupDate) : "—"}</div>
                {record.childWaybills?.length ? <div className="sm:col-span-2">Box waybills: <span className="font-mono">{record.childWaybills.join(", ")}</span></div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {record.labelUrl && (
                  <a href={record.labelUrl} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Shipping labels</a>
                )}
                <button type="button" onClick={refreshDetails} disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 font-bold disabled:opacity-40 cursor-pointer">
                  {record.waybill ? "Refresh details" : "Fetch waybill & label"}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">Tracking, POD link and delivery appointment are in the order's details drawer.</p>
            </section>
          )}

          {error && (
            <div className="flex items-start gap-1.5 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
