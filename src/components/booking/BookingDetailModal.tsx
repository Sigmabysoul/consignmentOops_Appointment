"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Truck,
  Package,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  Sliders,
  DollarSign,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  Upload,
  FileText,
} from "lucide-react";
import { AppointmentOrder, CourierPresetItem } from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
import { RateComparisonCards } from "@/components/booking/RateComparisonCards";
import { OmWhatsAppBookingModal } from "@/components/booking/OmWhatsAppBookingModal";
import { DelhiveryQuoteCard } from "@/components/delhivery/DelhiveryQuoteCard";
import { DelhiveryBookingModal } from "@/components/delhivery/DelhiveryBookingModal";
import { DELHIVERY_NAME, useDelhiveryStatus } from "@/components/delhivery/delhivery-client";
import { ShiprocketQuoteCard } from "@/components/shiprocket/ShiprocketQuoteCard";
import { ShiprocketBookingModal } from "@/components/shiprocket/ShiprocketBookingModal";
import { useShiprocketStatus } from "@/components/shiprocket/shiprocket-client";
import { SHIPROCKET_COURIER_NAME, type ShiprocketQuote } from "@/lib/shiprocket-types";
import { isAmazonChannel, isFlipkartFbfOrFksb } from "@/lib/courier-defaults";
import {
  ALL_STATES,
  OmDeliveryInput,
  OmDeliveryResult,
  calculateOmDeliveryCost,
} from "@/modules/pricing/om-logistics";
import {
  compareShippingCarriers,
  CarrierComparisonItem,
  MultiCarrierComparisonResponse,
} from "@/modules/pricing/multi-carrier/carrier-comparison-engine";
import {
  detectStateFromOrder,
  getOrderTotalWeightKg,
  getOrderInvoiceValue,
  getInitialLogisticsInput,
  getOrderInvoiceSource,
} from "@/lib/order-logistics-autofill";
import type { UnifiedShippingPresets } from "@/lib/shipping-presets-storage";

interface BookingDetailModalProps {
  order: AppointmentOrder | null;
  isOpen: boolean;
  onClose: () => void;
  courierPresets?: CourierPresetItem[];
  onOrderUpdated: () => void;
  onOpenPresets?: () => void;
  onSwitchToAppointment?: (order: AppointmentOrder) => void;
}

export function BookingDetailModal({
  order,
  isOpen,
  onClose,
  courierPresets = [],
  onOrderUpdated,
  onOpenPresets,
  onSwitchToAppointment,
}: BookingDetailModalProps) {
  const { showToast } = useToast();

  // Inputs State
  // "" = destination state not detected: the operator must choose it before any quote/booking.
  const [state, setState] = useState<string>("");
  const [weightKg, setWeightKg] = useState<number>(0);
  // Saved rate presets (ShippingPresetsModal). null = not loaded yet → built-in defaults.
  const [presets, setPresets] = useState<UnifiedShippingPresets | null>(null);
  const [odaDistanceKm, setOdaDistanceKm] = useState<number>(0);
  const [appointmentDelivery, setAppointmentDelivery] = useState<boolean>(true);
  const [rovCover, setRovCover] = useState<"none" | "shipper" | "carrier">("shipper");
  const [invoiceValue, setInvoiceValue] = useState<number>(0);
  // Where the invoice value came from: the uploaded tax invoice (read-only) or nothing yet.
  const [invoiceSource, setInvoiceSource] = useState<{ number: string | null; fileName: string | null } | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [invoiceProblem, setInvoiceProblem] = useState<string | null>(null);
  const invoiceInput = useRef<HTMLInputElement | null>(null);

  // Selection & Saving state
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [copiedRo, setCopiedRo] = useState(false);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [delhiveryModalOpen, setDelhiveryModalOpen] = useState(false);
  const delhiveryStatus = useDelhiveryStatus();
  const [shiprocketModalOpen, setShiprocketModalOpen] = useState(false);
  const shiprocketStatus = useShiprocketStatus();
  const [shiprocketQuotes, setShiprocketQuotes] = useState<ShiprocketQuote[] | null>(null);

  // Initialize inputs whenever order changes or modal opens
  useEffect(() => {
    if (!order) return;
    const initial = getInitialLogisticsInput(order);
    setState(initial.state);
    setWeightKg(Number(Number(initial.weightKg).toFixed(2)));
    setOdaDistanceKm(initial.odaDistanceKm || 0);
    setAppointmentDelivery(initial.appointmentDelivery ?? true);
    setRovCover(initial.rovCover || "shipper");
    setInvoiceValue(Number(Number(initial.invoiceValue || 0).toFixed(2)));
    setInvoiceSource(getOrderInvoiceSource(order));
    setInvoiceProblem(null);
  }, [order, isOpen]);

  // Load the saved rate cards / zone map / ODA matrix / per-courier presets every time the
  // modal opens, so edits made in Shipping Presets are what the quotes use.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    fetch("/api/shipping-presets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.presets) setPresets(data.presets as UnifiedShippingPresets);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const stateMissing = !state;

  // Live Pure Pricing & Multi-Carrier Comparison (Strictly Land Surface & Channel Filtered)
  const comparisonResult: MultiCarrierComparisonResponse = useMemo(() => {
    const input: OmDeliveryInput = {
      state,
      weightKg: Number(Number(weightKg).toFixed(2)) || 0,
      mode: "surface", // Rule 1: All shipments done by land
      odaDistanceKm: Number(odaDistanceKm) || 0,
      appointmentDelivery,
      rovCover,
      invoiceValue: Number(Number(invoiceValue).toFixed(2)) || 0,
    };
    return compareShippingCarriers(input, {
      channel: order?.channel,
      ...(presets
        ? {
            customRateCard: presets.omRateCard,
            customStateZoneMap: presets.stateZoneMap,
            customOdaMatrix: presets.odaMatrix,
            customConfig: presets.omConfig,
            carrierPresets: presets.carrierPresets,
          }
        : {}),
    });
  }, [state, weightKg, odaDistanceKm, appointmentDelivery, rovCover, invoiceValue, order?.channel, presets]);

  if (!isOpen || !order) return null;

  const deliveredTo =
    (order.customData as any)?.deliveredTo ||
    (order.customData as any)?.warehouseAddress ||
    order.client?.address ||
    "";

  // Assign carrier directly to consignment order
  const handleAssignCarrier = async (carrierName: string) => {
    setIsAssigning(carrierName);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierPartner: carrierName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to assign carrier");
      }

      showToast(`Carrier assigned to #${order.roPoNumber}: ${carrierName} ✓`, "success");
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to update carrier", "error");
    } finally {
      setIsAssigning(null);
    }
  };

  // Upload the tax invoice; the server reads its total and saves it on the order.
  const handleInvoiceUpload = async (file: File | undefined | null) => {
    if (!file) return;
    setInvoiceUploading(true);
    setInvoiceProblem(null);
    try {
      const form = new FormData();
      form.append("slot", "TAX_INVOICE");
      form.append("file", file);
      const res = await fetch(`/api/orders/${order.id}/documents`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const inv = data.invoice;
      if (inv && typeof inv.value === "number") {
        setInvoiceValue(Number(inv.value.toFixed(2)));
        setInvoiceSource({ number: inv.number ?? null, fileName: file.name });
        showToast(`Invoice${inv.number ? ` ${inv.number}` : ""} read: ₹${inv.value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "success");
        onOrderUpdated();
      } else {
        setInvoiceProblem(inv?.problem || "The invoice value could not be read.");
      }
    } catch (err: any) {
      showToast(err.message || "Invoice upload failed", "error");
    } finally {
      setInvoiceUploading(false);
      if (invoiceInput.current) invoiceInput.current.value = "";
    }
  };

  const handleCopyRo = async () => {
    try {
      await navigator.clipboard.writeText(order.roPoNumber);
      setCopiedRo(true);
      showToast("RO/PO Number copied", "success");
      setTimeout(() => setCopiedRo(false), 1500);
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Main Dialog Window */}
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[92vh] animate-scale-in text-slate-800">
        {/* ── Modal Header ── */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-violet-900 via-indigo-900 to-purple-900 text-white flex items-center justify-between border-b border-violet-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <Truck className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base tracking-tight font-mono text-white">
                  {order.roPoNumber}
                </h3>
                <button
                  type="button"
                  onClick={handleCopyRo}
                  title="Copy RO/PO Number"
                  className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  {copiedRo ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <ChannelBadge channel={order.channel} size="sm" />
                <StatusBadge status={order.courierStatus || order.status || "Pending"} />
              </div>
              <p className="text-[11px] text-violet-200/80">
                Compare rates · charges by carrier for this consignment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPresets && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPresets();
                }}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition border border-white/20 cursor-pointer"
                title="Manage Rate Cards & Courier Presets"
              >
                <Sliders className="w-3.5 h-3.5 text-violet-300" />
                <span>Rate Presets</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Order Snapshot Strip ── */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200/80 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-700 shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <span className="text-slate-400 font-semibold">Warehouse: </span>
              <span className="font-bold text-slate-900">{order.warehouseName || "—"}</span>
            </div>
            {deliveredTo && (
              <div className="max-w-md truncate" title={deliveredTo}>
                <span className="text-slate-400 font-semibold">Address: </span>
                <span className="font-medium text-slate-800">{deliveredTo}</span>
              </div>
            )}
            <div>
              <span className="text-slate-400 font-semibold">Boxes: </span>
              <span className="font-bold text-slate-900">{order.boxCount ?? 1}</span>
            </div>
            {order.boxDimensions && (
              <div>
                <span className="text-slate-400 font-semibold">Dims: </span>
                <span className="font-mono text-slate-800 font-semibold">{order.boxDimensions}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold">Assigned Carrier:</span>
            <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${order.courierPartner ? "bg-violet-100 text-violet-900 border border-violet-200" : "bg-amber-100 text-amber-900 border border-amber-200"}`}>
              {order.courierPartner || "Not Assigned"}
            </span>
          </div>
        </div>

        {/* ── Scrollable Body: parameters bar, quote sheet, live API quotes, box dimensions ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Shipment parameters (every change re-prices the sheet live) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-extrabold text-[11px] text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-violet-600" />
                Shipment parameters
              </h4>
              <span className="text-[10px] text-slate-500">Land surface only · prices update as you type</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 text-xs">
              <label className="col-span-2 md:col-span-1 xl:col-span-2 block">
                <span className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Destination state <span className="text-rose-500">*</span>
                </span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={`w-full bg-white border rounded-lg px-2 py-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                    stateMissing ? "border-rose-400 ring-2 ring-rose-200" : "border-slate-300"
                  }`}
                >
                  <option value="" disabled>
                    Select destination state…
                  </option>
                  {ALL_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Total weight (kg) <span className="text-rose-500">*</span>
                </span>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={weightKg || ""}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 250"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-slate-600 mb-0.5">ODA distance (km)</span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={odaDistanceKm || ""}
                  onChange={(e) => setOdaDistanceKm(parseInt(e.target.value, 10) || 0)}
                  placeholder="0 = not ODA"
                  title="ODA charges apply above 40 km"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-bold text-slate-600 mb-0.5">ROV insurance</span>
                <select
                  value={rovCover}
                  onChange={(e) => setRovCover(e.target.value as "none" | "shipper" | "carrier")}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="none">None</option>
                  <option value="shipper">Shipper risk (0.3%)</option>
                  <option value="carrier">Carrier risk (0.8%)</option>
                </select>
              </label>
              <div className="block">
                <span className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Invoice value (₹){rovCover !== "none" && <span className="text-rose-500"> *</span>}
                </span>
                <div className="flex gap-1">
                  {invoiceSource ? (
                    <div
                      className="flex-1 min-w-0 bg-emerald-50 border border-emerald-300 rounded-lg px-2 py-1.5 font-bold text-slate-900 truncate"
                      title={`Read from ${invoiceSource.fileName || "the uploaded tax invoice"}`}
                    >
                      ₹{invoiceValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={invoiceValue || ""}
                      onChange={(e) => setInvoiceValue(parseFloat(e.target.value) || 0)}
                      placeholder="Upload invoice →"
                      title="Upload the tax invoice to fill this in. Type it only if the invoice cannot be read."
                      className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => invoiceInput.current?.click()}
                    disabled={invoiceUploading}
                    title={invoiceSource ? "Replace the tax invoice" : "Upload the tax invoice (PDF): its total is read automatically"}
                    className="shrink-0 px-2 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-50 cursor-pointer"
                  >
                    {invoiceUploading ? (
                      <span className="block w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <input
                    ref={invoiceInput}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => void handleInvoiceUpload(e.target.files?.[0])}
                  />
                </div>
                {invoiceSource ? (
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-700 truncate">
                    <FileText className="w-3 h-3 shrink-0" />
                    From invoice {invoiceSource.number || invoiceSource.fileName || ""}
                  </span>
                ) : invoiceProblem ? (
                  <span className="mt-0.5 block text-[10px] text-rose-600 leading-tight">{invoiceProblem}</span>
                ) : null}
              </div>
            </div>
            <label className="mt-2.5 inline-flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={appointmentDelivery}
                onChange={(e) => setAppointmentDelivery(e.target.checked)}
                className="w-4 h-4 text-violet-600 rounded border-slate-300 focus:ring-violet-500"
              />
              <span className="font-bold text-slate-800">Appointment-based delivery</span>
              <span className="text-[10px] text-slate-500">standard for warehouses · OM adds ₹1,000 min (₹1/kg above 1,000 kg)</span>
            </label>
          </div>

          {stateMissing && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                <strong>Destination state required.</strong> It was not found in the delivery address or PIN code.
                Pick it above: totals, courier assignment and API bookings stay locked until then.
              </span>
            </div>
          )}

          <RateComparisonCards
            carriers={comparisonResult.carriers}
            assignedCourier={order.courierPartner}
            locked={stateMissing}
            actualWeightKg={Number(Number(weightKg).toFixed(2)) || 0}
            assigningName={isAssigning}
            carrierTags={{
              ...(isFlipkartFbfOrFksb(order.channel) ? { Ekart: "Flipkart: Ekart only" } : {}),
              ...(isAmazonChannel(order.channel) ? { "Amazon ATS": "Amazon: ATS only" } : {}),
            }}
            liveQuotes={{
              [SHIPROCKET_COURIER_NAME]: shiprocketQuotes
                ? {
                    quotes: shiprocketQuotes,
                    onBook: () => setShiprocketModalOpen(true),
                    bookDisabled: !shiprocketStatus?.configured,
                    invoiceValue: Number(Number(invoiceValue).toFixed(2)) || 0,
                  }
                : undefined,
            }}
            onAssign={(carrier) => {
              // OM Logistics is booked over WhatsApp: Assign opens the pickup draft,
              // which assigns OM Logistics when the message is sent.
              if (carrier.isOmLogistics) setWhatsAppModalOpen(true);
              else void handleAssignCarrier(carrier.name);
            }}
          />

          {/* Live API quotes and bookings for carriers priced by their own API */}
          {!stateMissing &&
            comparisonResult.carriers.some((c) => c.name === DELHIVERY_NAME || c.name === SHIPROCKET_COURIER_NAME) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {comparisonResult.carriers.some((c) => c.name === DELHIVERY_NAME) && (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      {DELHIVERY_NAME} · live quote & booking
                    </div>
                    <DelhiveryQuoteCard
                      order={order}
                      status={delhiveryStatus}
                      weightKg={Number(Number(weightKg).toFixed(2)) || 0}
                      invoiceValue={Number(Number(invoiceValue).toFixed(2)) || 0}
                      rovCarrierRisk={rovCover === "carrier"}
                      onBook={() => setDelhiveryModalOpen(true)}
                    />
                  </div>
                )}
                {comparisonResult.carriers.some((c) => c.name === SHIPROCKET_COURIER_NAME) && (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      {SHIPROCKET_COURIER_NAME} · live rates & booking
                    </div>
                    <ShiprocketQuoteCard
                      order={order}
                      status={shiprocketStatus}
                      weightKg={Number(Number(weightKg).toFixed(2)) || 0}
                      invoiceValue={Number(Number(invoiceValue).toFixed(2)) || 0}
                      stateLabel={state}
                      onBook={() => setShiprocketModalOpen(true)}
                      onQuotesChange={setShiprocketQuotes}
                    />
                  </div>
                )}
              </div>
            )}

          {/* 1-Click box dimensions for carrier portals */}
          <BoxDimensionCopyHelper
            groups={order.boxDimensionGroups || []}
            compact={false}
            wide={true}
            orderNumber={order.roPoNumber}
          />
        </div>

        {/* ── Modal Footer ── */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="text-slate-500">
            Consignment #{order.roPoNumber} • Ready for Logistics Booking & Courier Assignment
          </div>

          <div className="flex items-center gap-2">
            {onSwitchToAppointment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToAppointment(order);
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>Enter CN & Slot</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* ── Delhivery One API Booking Window ── */}
      <DelhiveryBookingModal
        order={order}
        isOpen={delhiveryModalOpen}
        status={delhiveryStatus}
        defaultWeightKg={Number(Number(weightKg).toFixed(2)) || 0}
        defaultInvoiceValue={Number(Number(invoiceValue).toFixed(2)) || 0}
        defaultState={state}
        rovCarrierRisk={rovCover === "carrier"}
        onClose={() => setDelhiveryModalOpen(false)}
        onOrderUpdated={onOrderUpdated}
      />

      {/* ── Shiprocket Cargo API Booking Window ── */}
      <ShiprocketBookingModal
        order={order}
        isOpen={shiprocketModalOpen}
        status={shiprocketStatus}
        defaultWeightKg={Number(Number(weightKg).toFixed(2)) || 0}
        defaultInvoiceValue={Number(Number(invoiceValue).toFixed(2)) || 0}
        defaultStateLabel={state}
        onClose={() => setShiprocketModalOpen(false)}
        onOrderUpdated={onOrderUpdated}
      />

      {/* ── OM Logistics WhatsApp Pickup Booking Window ── */}
      <OmWhatsAppBookingModal
        order={order}
        isOpen={whatsAppModalOpen}
        onClose={() => setWhatsAppModalOpen(false)}
        onOrderUpdated={() => {
          onOrderUpdated();
          setWhatsAppModalOpen(false);
        }}
      />
    </div>
  );
}
