"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Truck,
  Package,
  Layers,
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
  Plane,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AppointmentOrder, CourierPresetItem } from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
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
} from "@/lib/order-logistics-autofill";

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
  const [state, setState] = useState<string>("West Bengal (Kolkata)");
  const [weightKg, setWeightKg] = useState<number>(50);
  const [mode, setMode] = useState<"surface" | "air">("surface");
  const [odaDistanceKm, setOdaDistanceKm] = useState<number>(0);
  const [appointmentDelivery, setAppointmentDelivery] = useState<boolean>(true);
  const [rovCover, setRovCover] = useState<"none" | "shipper" | "carrier">("none");
  const [invoiceValue, setInvoiceValue] = useState<number>(0);

  // Expanded breakdown cards
  const [expandedCarrierId, setExpandedCarrierId] = useState<string | null>("om-surface");

  // Selection & Saving state
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [copiedRo, setCopiedRo] = useState(false);

  // Initialize inputs whenever order changes or modal opens
  useEffect(() => {
    if (!order) return;
    const initial = getInitialLogisticsInput(order);
    setState(initial.state);
    setWeightKg(initial.weightKg);
    setMode(initial.mode || "surface");
    setOdaDistanceKm(initial.odaDistanceKm || 0);
    setAppointmentDelivery(initial.appointmentDelivery ?? true);
    setRovCover(initial.rovCover || "none");
    setInvoiceValue(initial.invoiceValue || 0);
    setExpandedCarrierId("om-surface");
  }, [order, isOpen]);

  // Live Pure Pricing & Multi-Carrier Comparison
  const comparisonResult: MultiCarrierComparisonResponse = useMemo(() => {
    const input: OmDeliveryInput = {
      state,
      weightKg: Number(weightKg) || 0,
      mode,
      odaDistanceKm: Number(odaDistanceKm) || 0,
      appointmentDelivery,
      rovCover,
      invoiceValue: Number(invoiceValue) || 0,
    };
    return compareShippingCarriers(input);
  }, [state, weightKg, mode, odaDistanceKm, appointmentDelivery, rovCover, invoiceValue]);

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

  const omCarrier = comparisonResult.carriers.find((c) => c.id === "om-surface");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Main Dialog Window */}
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[92vh] animate-scale-in text-slate-800">
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
                Booking Desk: Shipping Rate Comparison & Logistics Cost Estimator
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

        {/* ── Scrollable Body: Estimator Controls & Comparison Grid ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* ── Left Column: Inputs & Live Estimator Form (5 Cols) ── */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-violet-600" />
                    <span>Shipment Estimator Parameters</span>
                  </h4>
                  <span className="text-[10px] text-violet-700 font-semibold bg-violet-100 px-2 py-0.5 rounded-full">
                    Live Calculation
                  </span>
                </div>

                {/* Destination State */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Destination State / Hub <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {ALL_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Auto-detected from warehouse address. Determines OM Logistics zone.
                  </p>
                </div>

                {/* Weight in KG & Mode */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Weight in Kg <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={weightKg || ""}
                        onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 250"
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 pr-8 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <span className="absolute right-2.5 top-2 text-xs font-bold text-slate-400">
                        kg
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Service Mode
                    </label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as "surface" | "air")}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="surface">Surface (By Road)</option>
                      <option value="air">Air Express (₹135/kg)</option>
                    </select>
                  </div>
                </div>

                {/* ODA Distance */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      ODA Distance (Optional)
                    </label>
                    <span className="text-[10px] text-slate-400">Applies above 40 km</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={odaDistanceKm || ""}
                      onChange={(e) => setOdaDistanceKm(parseInt(e.target.value, 10) || 0)}
                      placeholder="0 (Not ODA / Local)"
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 pr-8 font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="absolute right-2.5 top-2 text-xs font-bold text-slate-400">
                      km
                    </span>
                  </div>
                </div>

                {/* Appointment Delivery Checkbox */}
                <div className="p-2.5 rounded-lg bg-violet-50/60 border border-violet-100 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="modal-appt-check"
                    checked={appointmentDelivery}
                    onChange={(e) => setAppointmentDelivery(e.target.checked)}
                    className="w-4 h-4 text-violet-600 rounded border-slate-300 focus:ring-violet-500 mt-0.5 cursor-pointer"
                  />
                  <label htmlFor="modal-appt-check" className="text-xs cursor-pointer select-none">
                    <span className="font-bold text-violet-950 block">Appointment-Based Delivery</span>
                    <span className="text-[10px] text-violet-700 block mt-0.5">
                      Standard for warehouse fulfilment. Adds ₹1,000 min (₹1/kg above 1,000 kg).
                    </span>
                  </label>
                </div>

                {/* ROV / Insurance Cover */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    ROV Value Insurance Cover
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {(["none", "shipper", "carrier"] as const).map((cov) => (
                      <button
                        key={cov}
                        type="button"
                        onClick={() => setRovCover(cov)}
                        className={`py-1.5 px-2 rounded-lg font-bold border transition text-center cursor-pointer ${
                          rovCover === cov
                            ? "bg-violet-600 text-white border-violet-700 shadow-2xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {cov === "none" && "None"}
                        {cov === "shipper" && "Shipper (0.3%)"}
                        {cov === "carrier" && "Carrier (0.8%)"}
                      </button>
                    ))}
                  </div>

                  {rovCover !== "none" && (
                    <div className="pt-1.5 animate-fade-in">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Consignment Invoice Value (₹) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={invoiceValue || ""}
                          onChange={(e) => setInvoiceValue(parseFloat(e.target.value) || 0)}
                          placeholder="e.g. 50000"
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 pl-7 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 1-Click Box Dimensions Paste Helper */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-violet-600" />
                    <span>Copy Dimensions for Carrier Booking</span>
                  </span>
                </div>
                <BoxDimensionCopyHelper
                  groups={order.boxDimensionGroups || []}
                  compact={false}
                  orderNumber={order.roPoNumber}
                />
              </div>
            </div>

            {/* ── Right Column: Shipping Price Comparison Cards (7 Cols) ── */}
            <div className="lg:col-span-7 space-y-4">
              {/* Best Price Summary Pill */}
              {comparisonResult.lowestCostCarrierName && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-300/80 flex items-center justify-between text-xs text-emerald-950">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-extrabold">Best Value Partner:</span>
                    <span className="font-bold underline">
                      {comparisonResult.lowestCostCarrierName}
                    </span>
                  </div>
                  <div className="font-black text-sm text-emerald-900">
                    ₹{comparisonResult.lowestCostAmount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}

              {/* Carriers List */}
              <div className="space-y-3">
                {comparisonResult.carriers.map((carrier) => {
                  const isCurrentAssigned =
                    order.courierPartner?.toLowerCase() === carrier.name.toLowerCase();
                  const isExpanded = expandedCarrierId === carrier.id;
                  const hasError = Boolean(carrier.error);

                  return (
                    <div
                      key={carrier.id}
                      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                        carrier.isOmLogistics && !carrier.isAirExpress
                          ? "border-violet-300 bg-violet-50/20 shadow-xs"
                          : carrier.isLowestCost
                          ? "border-emerald-300 bg-emerald-50/20 shadow-xs"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      {/* Carrier Card Header */}
                      <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                              carrier.isOmLogistics
                                ? "bg-violet-600 text-white shadow-sm"
                                : carrier.isAirExpress
                                ? "bg-sky-600 text-white shadow-sm"
                                : "bg-slate-100 text-slate-800 border border-slate-200"
                            }`}
                          >
                            {carrier.isAirExpress ? (
                              <Plane className="w-5 h-5 text-white" />
                            ) : (
                              <Truck className="w-5 h-5" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="font-extrabold text-sm text-slate-900">
                                {carrier.name}
                              </h5>
                              {carrier.isOmLogistics && !carrier.isAirExpress && (
                                <span className="text-[10px] bg-violet-100 text-violet-800 font-extrabold px-2 py-0.5 rounded-full border border-violet-200">
                                  Primary Partner
                                </span>
                              )}
                              {carrier.isLowestCost && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                                  Lowest Cost
                                </span>
                              )}
                              {carrier.isFastest && (
                                <span className="text-[10px] bg-sky-100 text-sky-800 font-extrabold px-2 py-0.5 rounded-full border border-sky-200">
                                  Fastest (Air)
                                </span>
                              )}
                              {isFlipkartFbfOrFksb(order.channel) && carrier.name === "Ekart" && (
                                <span className="text-[10px] bg-blue-100 text-blue-900 font-extrabold px-2 py-0.5 rounded-full border border-blue-200">
                                  Recommended for Flipkart
                                </span>
                              )}
                              {isAmazonChannel(order.channel) && carrier.name === "Amazon ATS" && (
                                <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-full border border-amber-200">
                                  Default for Amazon
                                </span>
                              )}
                              {isCurrentAssigned && (
                                <span className="text-[10px] bg-purple-100 text-purple-900 font-extrabold px-2 py-0.5 rounded-full border border-purple-300 flex items-center gap-1">
                                  <Check className="w-3 h-3 text-purple-700" />
                                  Currently Assigned
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>{carrier.serviceType}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>Transit: {carrier.estimatedTransitDays}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Pricing Summary & Select Button */}
                        <div className="flex items-center gap-3">
                          {hasError ? (
                            <div className="text-right">
                              <span className="text-xs font-bold text-rose-600 block">
                                Rate Unavailable
                              </span>
                              <span className="text-[10px] text-slate-400">See note below</span>
                            </div>
                          ) : (
                            <div className="text-right">
                              <div className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                                ₹{carrier.estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                ₹{carrier.costPerKg.toFixed(2)} / kg
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={hasError || isAssigning === carrier.name}
                            onClick={() => handleAssignCarrier(carrier.name)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              isCurrentAssigned
                                ? "bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700"
                                : "bg-violet-600 hover:bg-violet-700 text-white shadow-xs"
                            }`}
                          >
                            {isAssigning === carrier.name ? (
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : isCurrentAssigned ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Assigned</span>
                              </>
                            ) : (
                              <>
                                <span>Assign</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCarrierId(isExpanded ? null : carrier.id)
                            }
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            title="Toggle breakdown details"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Breakdown Drawer */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-white/70 text-xs space-y-2.5 animate-fade-in">
                          {hasError ? (
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold">Carrier Notice: </span>
                                <span>{carrier.error}</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-600">
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-[10px] text-slate-400 block font-semibold">Freight Charge</span>
                                  <span className="font-bold text-slate-900 text-xs">₹{carrier.breakdown.freight.toFixed(2)}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-[10px] text-slate-400 block font-semibold">Fuel & Docket</span>
                                  <span className="font-bold text-slate-900 text-xs">₹{(carrier.breakdown.fuel + carrier.breakdown.cnOrDocket).toFixed(2)}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-[10px] text-slate-400 block font-semibold">Appt & ODA</span>
                                  <span className="font-bold text-slate-900 text-xs">₹{(carrier.breakdown.appointment + carrier.breakdown.oda).toFixed(2)}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                  <span className="text-[10px] text-slate-400 block font-semibold">GST (18%)</span>
                                  <span className="font-bold text-slate-900 text-xs">₹{carrier.breakdown.gst.toFixed(2)}</span>
                                </div>
                              </div>

                              {carrier.notes && carrier.notes.length > 0 && (
                                <div className="text-[10px] text-slate-500 space-y-0.5 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                                  {carrier.notes.map((n, idx) => (
                                    <div key={idx} className="flex items-start gap-1">
                                      <span className="text-violet-500 font-bold">•</span>
                                      <span>{n}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Informational Guidance Box from OM Logistics Spec */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-600">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-violet-600" />
                  <span>Important Commercial & Fulfillment Terms (OM Logistics)</span>
                </div>
                <ul className="text-[11px] space-y-1 list-disc pl-4 text-slate-500">
                  <li>Transit time is about 8–9 days from Kolkata (12–14 days for Northeast & Special locations).</li>
                  <li>Give one day's prior notice before pickup from Kolkata facility (PIN 700100).</li>
                  <li>
                    An e-way bill is required for every shipment with invoice value &gt; ₹50,000.
                    Transporter ID: <strong className="font-mono text-slate-800">88AAECO4660K1Z7</strong>.
                  </li>
                  <li>Payment terms are 7 days from the date of booking.</li>
                </ul>
              </div>
            </div>
          </div>
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
    </div>
  );
}
