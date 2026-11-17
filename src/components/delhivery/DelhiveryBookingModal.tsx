"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileUp, Plus, Trash2, Truck, X } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import type { DelhiveryServerStatus, DelhiveryShipmentRecord } from "@/lib/delhivery-types";
import { ALL_STATES } from "@/modules/pricing/om-logistics";
import { useToast } from "@/components/ui/Toast";
import { delhiveryApi, extractPincode, orderAddress, readDelhiveryRecord, rupees } from "./delhivery-client";
import { DelhiveryStatusNote } from "./DelhiveryStatusNote";
import { DelhiveryShipmentPanel } from "./DelhiveryShipmentPanel";

interface Props {
  order: AppointmentOrder;
  isOpen: boolean;
  status: DelhiveryServerStatus | null;
  defaultWeightKg: number;
  defaultInvoiceValue: number;
  defaultState: string;
  rovCarrierRisk: boolean;
  onClose: () => void;
  onOrderUpdated: () => void;
}

interface BoxRow {
  boxCount: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}
interface InvoiceRow {
  number: string;
  amount: string;
  ewaybill: string;
}

const POLL_MS = 6000;
const POLL_FOR_MS = 2.5 * 60 * 1000;
/** "West Bengal (Kolkata)" -> "West Bengal" */
const plainState = (s: string) => s.replace(/\s*\(.*\)\s*$/, "").trim();

/**
 * Delhivery booking (manifest) form. After submitting it polls the manifest job until the LR
 * and AWBs arrive, then shows the shipment panel (appointment, pickup, labels...).
 */
export function DelhiveryBookingModal({
  order,
  isOpen,
  status,
  defaultWeightKg,
  defaultInvoiceValue,
  defaultState,
  rovCarrierRisk,
  onClose,
  onOrderUpdated,
}: Props) {
  const { showToast } = useToast();
  const [record, setRecord] = useState<DelhiveryShipmentRecord>(() => readDelhiveryRecord(order));

  const address = orderAddress(order);
  const [consignee, setConsignee] = useState({ name: "", address: "", city: "", state: "", pin: "", phone: "", email: "" });
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [weightKg, setWeightKg] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState<"prepaid" | "cod">("prepaid");
  const [codAmount, setCodAmount] = useState("");
  const [rov, setRov] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRecord(readDelhiveryRecord(order));
    setConsignee({
      name: order.client?.name || order.warehouseName || "",
      address,
      city: order.client?.city || "",
      state: plainState(defaultState),
      pin: extractPincode(address),
      phone: "",
      email: "",
    });
    const groups = (order.boxDimensionGroups || []).filter((g) => g.boxCount > 0);
    setBoxes(
      groups.length
        ? groups.map((g) => ({
            boxCount: String(g.boxCount),
            lengthCm: g.lengthCm ? String(g.lengthCm) : "",
            widthCm: g.widthCm ? String(g.widthCm) : "",
            heightCm: g.heightCm ? String(g.heightCm) : "",
          }))
        : [{ boxCount: String(order.boxCount || 1), lengthCm: "", widthCm: "", heightCm: "" }]
    );
    setInvoices([{ number: order.invoiceNo || "", amount: defaultInvoiceValue > 0 ? defaultInvoiceValue.toFixed(2) : "", ewaybill: "" }]);
    setWeightKg(defaultWeightKg > 0 ? defaultWeightKg.toFixed(2) : "");
    setDescription(order.items?.[0]?.itemName ? `Retail goods - ${order.items[0].itemName}`.slice(0, 100) : "Retail goods");
    setPaymentMode("prepaid");
    setCodAmount("");
    setRov(rovCarrierRisk);
    setFiles([]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order.id]);

  // Resume polling when the modal opens on a pending manifest.
  useEffect(() => {
    if (isOpen && record.manifest?.state === "pending" && !record.lrn) startPolling();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const invoiceTotal = useMemo(() => invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0), [invoices]);
  const needsEwaybill = invoiceTotal > 50000;
  const totalBoxes = boxes.reduce((s, b) => s + (parseInt(b.boxCount, 10) || 0), 0);

  function stopPolling() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    setPolling(false);
  }

  function startPolling() {
    stopPolling();
    setPolling(true);
    const started = Date.now();
    const tick = async () => {
      try {
        const { delhivery } = await delhiveryApi<{ delhivery: DelhiveryShipmentRecord }>(`/orders/${order.id}/manifest`);
        setRecord(delhivery);
        if (delhivery.lrn) {
          showToast(`Delhivery LR ${delhivery.lrn} created`, "success");
          onOrderUpdated();
          return stopPolling();
        }
        if (delhivery.manifest?.state === "failed") {
          setError(delhivery.manifest.message || "Delhivery rejected the booking.");
          return stopPolling();
        }
      } catch (err: any) {
        // Transient poll errors: keep trying until the window closes.
        setError(err.message);
      }
      if (Date.now() - started > POLL_FOR_MS) {
        setError("Still waiting for Delhivery. Close this and use \"Check booking status\" later; do not book again.");
        return stopPolling();
      }
      pollTimer.current = setTimeout(tick, POLL_MS);
    };
    pollTimer.current = setTimeout(tick, 3000);
  }

  const submit = async (override = false) => {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set(
        "payload",
        JSON.stringify({
          consignee,
          boxes: boxes.map((b) => ({
            boxCount: parseInt(b.boxCount, 10),
            lengthCm: parseFloat(b.lengthCm),
            widthCm: parseFloat(b.widthCm),
            heightCm: parseFloat(b.heightCm),
          })),
          totalWeightKg: Number((parseFloat(weightKg) || 0).toFixed(2)),
          invoices: invoices.map((i) => ({
            number: i.number.trim(),
            amount: i.amount ? Number(parseFloat(i.amount).toFixed(2)) : null,
            ewaybill: i.ewaybill.trim(),
          })),
          description,
          paymentMode,
          codAmount: paymentMode === "cod" ? Number((parseFloat(codAmount) || 0).toFixed(2)) : undefined,
          freightMode: "fop",
          rovInsurance: rov,
          override,
        })
      );
      files.forEach((f) => fd.append("invoiceFile", f));
      const { delhivery } = await delhiveryApi<{ delhivery: DelhiveryShipmentRecord }>(`/orders/${order.id}/manifest`, {
        method: "POST",
        body: fd,
      });
      setRecord(delhivery);
      onOrderUpdated();
      if (delhivery.manifest?.state === "pending") {
        showToast("Sent to Delhivery. Waiting for the LR number…", "success");
        startPolling();
      } else {
        setError(delhivery.manifest?.message || "Delhivery's reply was not recognised. Check the Delhivery One panel before trying again.");
      }
    } catch (err: any) {
      setError(err.message);
      try {
        const { delhivery } = await delhiveryApi<{ delhivery: DelhiveryShipmentRecord }>(`/orders/${order.id}/manifest`);
        setRecord(delhivery);
      } catch {}
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const state = record.manifest?.state;
  const booked = Boolean(record.lrn && !record.cancelled);
  const showForm = !booked && state !== "pending" && state !== "submitting";
  const bookingBlocked = !status?.configured || !status.bookingEnabled || !status.warehouseConfigured;
  const totalFileBytes = files.reduce((s, f) => s + f.size, 0);

  const input = "w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400";
  const label = "block text-[11px] font-bold text-slate-700 mb-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5">
      <div className="fixed inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 z-10 flex flex-col max-h-[92vh] text-slate-800">
        <div className="px-5 py-3 bg-gradient-to-r from-red-700 to-rose-800 text-white flex items-center justify-between rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5" />
            <div>
              <h3 className="font-extrabold text-sm">Delhivery One booking · #{order.roPoNumber}</h3>
              <p className="text-[11px] text-red-100">
                Surface B2B (LTL) · {status?.env === "production" ? "Production" : "Staging"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          <DelhiveryStatusNote status={status} forBooking />

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {(state === "pending" || state === "submitting") && !booked && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {polling && <span className="w-3 h-3 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />}
                Delhivery is creating the LR (job {record.manifest?.jobId || "…"}).
              </span>
              {!polling && (
                <button type="button" onClick={startPolling} className="px-2.5 py-1 rounded-lg bg-sky-600 text-white font-bold cursor-pointer">
                  Check booking status
                </button>
              )}
            </div>
          )}

          {state === "unknown_outcome" && !booked && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-1.5">
              <p className="font-bold">The last booking attempt has an unknown result.</p>
              <p>
                It timed out after being sent, so Delhivery may already have created an LR. Look for order{" "}
                <b className="font-mono">{order.roPoNumber}</b> in the Delhivery One panel before booking again. Booking twice means two LRs
                and two bills.
              </p>
              {status?.isAdmin ? (
                <p className="text-[11px]">As an admin you can resubmit below once you have checked.</p>
              ) : (
                <p className="text-[11px]">Only an admin can resubmit.</p>
              )}
            </div>
          )}

          {booked && <DelhiveryShipmentPanel order={order} record={record} status={status} onRecordChange={setRecord} onOrderUpdated={onOrderUpdated} />}

          {showForm && (
            <>
              <section className="space-y-2">
                <h4 className="font-extrabold text-slate-900 uppercase tracking-wide text-[11px]">Consignee (delivery location)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className={label}>Name *</label>
                    <input className={input} value={consignee.name} onChange={(e) => setConsignee({ ...consignee, name: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Address *</label>
                    <textarea rows={2} className={input} value={consignee.address} onChange={(e) => setConsignee({ ...consignee, address: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>City *</label>
                    <input className={input} value={consignee.city} onChange={(e) => setConsignee({ ...consignee, city: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>State *</label>
                    <select className={input} value={consignee.state} onChange={(e) => setConsignee({ ...consignee, state: e.target.value })}>
                      <option value="">Select state</option>
                      {[...new Set(ALL_STATES.map(plainState))].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Pincode *</label>
                    <input
                      className={`${input} font-mono`}
                      inputMode="numeric"
                      value={consignee.pin}
                      onChange={(e) => setConsignee({ ...consignee, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    />
                  </div>
                  <div>
                    <label className={label}>Phone (10 digits) *</label>
                    <input
                      className={`${input} font-mono`}
                      inputMode="numeric"
                      value={consignee.phone}
                      onChange={(e) => setConsignee({ ...consignee, phone: e.target.value.replace(/[^\d+]/g, "").slice(0, 13) })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Email (optional)</label>
                    <input className={input} type="email" value={consignee.email} onChange={(e) => setConsignee({ ...consignee, email: e.target.value })} />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-wide text-[11px]">Boxes ({totalBoxes})</h4>
                  <button
                    type="button"
                    onClick={() => setBoxes([...boxes, { boxCount: "1", lengthCm: "", widthCm: "", heightCm: "" }])}
                    className="text-red-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add box size
                  </button>
                </div>
                {boxes.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                    {(["boxCount", "lengthCm", "widthCm", "heightCm"] as const).map((k) => (
                      <div key={k}>
                        {i === 0 && <label className={label}>{{ boxCount: "Count", lengthCm: "L (cm)", widthCm: "W (cm)", heightCm: "H (cm)" }[k]}</label>}
                        <input
                          className={input}
                          inputMode="decimal"
                          value={b[k]}
                          onChange={(e) => setBoxes(boxes.map((x, j) => (j === i ? { ...x, [k]: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={boxes.length === 1}
                      onClick={() => setBoxes(boxes.filter((_, j) => j !== i))}
                      className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className={label}>Total weight (kg) *</label>
                    <input className={input} inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value.replace(/[^\d.]/g, ""))} />
                  </div>
                  <div>
                    <label className={label}>Description</label>
                    <input className={input} maxLength={100} value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-wide text-[11px]">Invoices · {rupees(invoiceTotal)}</h4>
                  <button
                    type="button"
                    onClick={() => setInvoices([...invoices, { number: "", amount: "", ewaybill: "" }])}
                    className="text-red-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add invoice
                  </button>
                </div>
                {invoices.map((inv, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                    <div>
                      {i === 0 && <label className={label}>Invoice no. *</label>}
                      <input className={input} value={inv.number} onChange={(e) => setInvoices(invoices.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
                    </div>
                    <div>
                      {i === 0 && <label className={label}>Amount (₹) *</label>}
                      <input
                        className={input}
                        inputMode="decimal"
                        value={inv.amount}
                        onChange={(e) => setInvoices(invoices.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                      />
                    </div>
                    <div>
                      {i === 0 && <label className={label}>E-way bill {needsEwaybill ? "*" : "(if any)"}</label>}
                      <input
                        className={`${input} font-mono ${needsEwaybill && !inv.ewaybill.trim() ? "border-amber-400" : ""}`}
                        value={inv.ewaybill}
                        onChange={(e) => setInvoices(invoices.map((x, j) => (j === i ? { ...x, ewaybill: e.target.value.trim() } : x)))}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={invoices.length === 1}
                      onClick={() => setInvoices(invoices.filter((_, j) => j !== i))}
                      className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {needsEwaybill && <p className="text-[10px] text-amber-700 font-semibold">Invoice value is above ₹50,000: every invoice needs an e-way bill.</p>}

                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:bg-slate-100">
                  <FileUp className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">
                    {files.length ? `${files.length} invoice file(s), ${(totalFileBytes / 1024 / 1024).toFixed(2)} MB` : "Attach invoice copies (pdf/png/jpg, up to 10 files, 20 MB)"}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.bmp"
                    className="hidden"
                    onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 10))}
                  />
                </label>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={label}>Payment mode</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["prepaid", "cod"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMode(m)}
                        className={`py-1.5 rounded-lg font-bold border cursor-pointer ${paymentMode === m ? "bg-red-600 text-white border-red-700" : "bg-white border-slate-200"}`}
                      >
                        {m === "prepaid" ? "Prepaid" : "COD"}
                      </button>
                    ))}
                  </div>
                  {paymentMode === "cod" && (
                    <input
                      className={`${input} mt-1.5`}
                      placeholder="COD amount (₹)"
                      inputMode="decimal"
                      value={codAmount}
                      onChange={(e) => setCodAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    />
                  )}
                </div>
                <div>
                  <label className={label}>Risk (ROV)</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[false, true].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setRov(v)}
                        className={`py-1.5 rounded-lg font-bold border cursor-pointer ${rov === v ? "bg-red-600 text-white border-red-700" : "bg-white border-slate-200"}`}
                      >
                        {v ? "Carrier risk" : "Owner risk"}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0 rounded-b-2xl text-xs">
          <span className="text-slate-500">Pickup from {status?.sourcePin || "700100"} · Land surface only</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 font-bold cursor-pointer">
              Close
            </button>
            {showForm && (
              <button
                type="button"
                disabled={submitting || bookingBlocked || (state === "unknown_outcome" && !status?.isAdmin)}
                onClick={() => submit(state === "unknown_outcome")}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              >
                {submitting && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {state === "unknown_outcome" ? "I've checked: book again" : "Create Delhivery LR"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
