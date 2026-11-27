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
  Info,
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
  detectCityFromOrder,
  findPincode,
} from "@/lib/order-logistics-autofill";
import { formatCbm, summarizeCartons } from "@/lib/dimension-helper";
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
  // Totals for the header strip and volumetric weight (carriers that bill it, e.g. Delhivery).
  const cartons = useMemo(() => summarizeCartons(order), [order]);

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
      volumeCbm: cartons.totalCbm,
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
  }, [state, weightKg, odaDistanceKm, appointmentDelivery, rovCover, invoiceValue, order?.channel, presets, cartons.totalCbm]);

  if (!isOpen || !order) return null;

  const deliveredTo =
    (order.customData as any)?.deliveredTo ||
    (order.customData as any)?.warehouseAddress ||
    order.client?.address ||
    "";
  const destPin = findPincode(deliveredTo);
  const destCity = detectCityFromOrder(order);
  const showDelhivery = comparisonResult.carriers.some((c) => c.name === DELHIVERY_NAME);
  const showShiprocket = comparisonResult.carriers.some((c) => c.name === SHIPROCKET_COURIER_NAME);

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
      <div className="ui-overlay transition-opacity" onClick={onClose} />

      {/* Main Dialog Window */}
      <div className="ui-dialog max-w-6xl z-10 animate-scale-in">
        {/* ── Modal Header ── */}
        <div className="ui-dialog-header">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
              <Truck className="w-5 h-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="ui-mono text-base font-semibold tracking-tight text-slate-900">{order.roPoNumber}</h3>
                <button
                  type="button"
                  onClick={handleCopyRo}
                  title="Copy RO/PO Number"
                  className="ui-icon-btn h-7 w-7"
                >
                  {copiedRo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <ChannelBadge channel={order.channel} size="sm" />
                <StatusBadge status={order.courierStatus || order.status || "Pending"} />
              </div>
              <p className="ui-muted mt-0.5">Freight comparison and carrier booking · land surface only</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenPresets && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPresets();
                }}
                className="ui-btn-secondary hidden sm:inline-flex"
                title="Manage Rate Cards & Courier Presets"
              >
                <Sliders className="w-3.5 h-3.5 text-violet-600" />
                <span>Rate presets</span>
              </button>
            )}
            <button type="button" onClick={onClose} className="ui-icon-btn" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body: summary, parameters, quote cards, live API quotes, box dimensions ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4 sm:p-5 space-y-4">
          {/* Order snapshot: what is being shipped, where, and who carries it */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-[minmax(16rem,2fr)_repeat(4,minmax(0,1fr))] gap-2">
            <SnapshotStat label="Deliver to" wide>
              <span className="font-semibold text-slate-900">{order.warehouseName || "—"}</span>
              {(destCity || destPin) && (
                <span className="text-slate-500"> · {[destCity, destPin].filter(Boolean).join(" ")}</span>
              )}
              {deliveredTo && (
                <span className="block text-[11px] text-slate-400 truncate" title={deliveredTo}>
                  {deliveredTo}
                </span>
              )}
            </SnapshotStat>
            <SnapshotStat label="Total boxes">
              <span className="text-base font-semibold tabular-nums text-slate-900">{cartons.totalBoxes || order.boxCount || 1}</span>
            </SnapshotStat>
            <SnapshotStat label="Total weight">
              <span className="text-base font-semibold tabular-nums text-slate-900">{weightKg > 0 ? `${weightKg.toFixed(2)} kg` : "—"}</span>
            </SnapshotStat>
            <SnapshotStat label="Total CBM">
              <span className="text-base font-semibold tabular-nums text-slate-900">{formatCbm(cartons.totalCbm)}</span>
            </SnapshotStat>
            <SnapshotStat label="Assigned carrier">
              <span className={`text-sm font-semibold ${order.courierPartner ? "text-violet-700" : "text-amber-700"}`}>
                {order.courierPartner || "Not assigned"}
              </span>
            </SnapshotStat>
          </div>

          {/* Shipment parameters (every change re-prices the cards live) */}
          <section className="ui-card">
            <div className="ui-card-header">
              <h4 className="ui-card-title">
                <Sliders className="w-4 h-4 text-violet-600" />
                Shipment parameters
              </h4>
              <span className="ui-muted hidden sm:inline">Land surface only · prices update as you type</span>
            </div>
            <div className="ui-card-body space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <label className="col-span-2 md:col-span-1 xl:col-span-2 block">
                  <span className="ui-label">
                    Destination state <span className="text-rose-500">*</span>
                  </span>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={`ui-select ${stateMissing ? "border-rose-400 ring-2 ring-rose-200" : ""}`}
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
                  <span className="ui-label">
                    Total weight (kg) <span className="text-rose-500">*</span>
                  </span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={weightKg || ""}
                    onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 250"
                    className="ui-input tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="ui-label">ODA distance (km)</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={odaDistanceKm || ""}
                    onChange={(e) => setOdaDistanceKm(parseInt(e.target.value, 10) || 0)}
                    placeholder="0 = not ODA"
                    title="ODA charges apply above 40 km"
                    className="ui-input tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="ui-label">ROV insurance</span>
                  <select
                    value={rovCover}
                    onChange={(e) => setRovCover(e.target.value as "none" | "shipper" | "carrier")}
                    className="ui-select"
                  >
                    <option value="none">None</option>
                    <option value="shipper">Shipper risk (0.3%)</option>
                    <option value="carrier">Carrier risk (0.8%)</option>
                  </select>
                </label>
                <div className="block">
                  <span className="ui-label">
                    Invoice value (₹){rovCover !== "none" && <span className="text-rose-500"> *</span>}
                  </span>
                  <div className="flex gap-1.5">
                    {invoiceSource ? (
                      <div
                        className="flex-1 min-w-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-sm font-semibold tabular-nums text-slate-900 truncate"
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
                        className="ui-input flex-1 min-w-0 tabular-nums"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => invoiceInput.current?.click()}
                      disabled={invoiceUploading}
                      title={invoiceSource ? "Replace the tax invoice" : "Upload the tax invoice (PDF): its total is read automatically"}
                      className="ui-btn-secondary shrink-0 px-2.5"
                    >
                      {invoiceUploading ? (
                        <span className="block w-3.5 h-3.5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5 text-violet-600" />
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
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700 truncate">
                      <FileText className="w-3 h-3 shrink-0" />
                      From invoice {invoiceSource.number || invoiceSource.fileName || ""}
                    </span>
                  ) : invoiceProblem ? (
                    <span className="mt-1 block text-[11px] text-rose-600 leading-tight">{invoiceProblem}</span>
                  ) : null}
                </div>
              </div>
              <label className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={appointmentDelivery}
                  onChange={(e) => setAppointmentDelivery(e.target.checked)}
                  className="w-4 h-4 text-violet-600 rounded border-slate-300 focus:ring-violet-500"
                />
                <span className="font-medium text-slate-800">Appointment-based delivery</span>
                <span className="ui-muted">Standard for warehouses · OM adds ₹1,000 min (₹1/kg above 1,000 kg)</span>
              </label>
            </div>
          </section>

          {stateMissing && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold">Destination state required.</strong> It was not found in the delivery address or PIN code.
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

          {/* Live carrier APIs. Delhivery without credentials is priced from its rate card above. */}
          {!stateMissing && showShiprocket && (
            <ShiprocketQuoteCard
              order={order}
              status={shiprocketStatus}
              weightKg={Number(Number(weightKg).toFixed(2)) || 0}
              invoiceValue={Number(Number(invoiceValue).toFixed(2)) || 0}
              stateLabel={state}
              onBook={() => setShiprocketModalOpen(true)}
              onQuotesChange={setShiprocketQuotes}
            />
          )}
          {!stateMissing && showDelhivery && delhiveryStatus?.configured && (
            <DelhiveryQuoteCard
              order={order}
              status={delhiveryStatus}
              weightKg={Number(Number(weightKg).toFixed(2)) || 0}
              invoiceValue={Number(Number(invoiceValue).toFixed(2)) || 0}
              rovCarrierRisk={rovCover === "carrier"}
              onBook={() => setDelhiveryModalOpen(true)}
            />
          )}
          {!stateMissing && showDelhivery && delhiveryStatus && !delhiveryStatus.configured && (
            <p className="flex items-start gap-1.5 ui-muted px-1">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-px" />
              Delhivery API is not connected yet: the {DELHIVERY_NAME} price above is worked out from the Delhivery B2B
              rate card (zone rate × chargeable kg, volumetric 6 kg/CFT). Edit the rates in Rate Presets.
            </p>
          )}

          {/* 1-Click box dimensions for carrier portals */}
          <details className="group ui-card">
            <summary className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none list-none rounded-xl hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="ui-card-title flex-wrap">
                <Package className="w-4 h-4 text-violet-600" />
                Box dimensions for carrier portals
                <span className="font-normal text-slate-500">
                  ·{" "}
                  {cartons.groups.length === 0
                    ? "not recorded yet"
                    : `${cartons.groups.length} size${cartons.groups.length === 1 ? "" : "s"} · ${cartons.totalBoxes} box${cartons.totalBoxes === 1 ? "" : "es"}`}
                </span>
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 p-3">
              <BoxDimensionCopyHelper
                groups={order.boxDimensionGroups || []}
                compact={false}
                wide={true}
                orderNumber={order.roPoNumber}
              />
            </div>
          </details>
        </div>

        {/* ── Modal Footer ── */}
        <div className="ui-dialog-footer flex-wrap">
          <div className="ui-muted">
            Consignment <span className="ui-mono">#{order.roPoNumber}</span> · ready for booking and courier assignment
          </div>

          <div className="flex items-center gap-2">
            {onSwitchToAppointment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToAppointment(order);
                }}
                className="ui-btn-secondary"
              >
                <span>Enter CN & slot</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="ui-btn-secondary px-4"
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

/** One labelled figure in the modal's order snapshot row. */
function SnapshotStat({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`ui-card px-3 py-2 min-w-0 ${wide ? "col-span-2 sm:col-span-4 lg:col-span-1" : ""}`}>
      <span className="ui-eyebrow block">{label}</span>
      <div className="mt-0.5 text-sm leading-snug">{children}</div>
    </div>
  );
}
