"use client";

import { DateInput } from "@/components/ui/DateInput";
import React, { useState } from "react";
import {
  AppointmentOrder,
  CourierPresetItem,
} from "@/lib/types";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConsignmentStatusStack } from "@/components/booking/ConsignmentStatusStack";
import { summarizeCartons } from "@/lib/dimension-helper";
import { formatDateDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import {
  Calendar,
  Truck,
  Copy,
  Check,
  Building,
  Layers,
  ExternalLink,
  ChevronRight,
  Edit2,
  Search,
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
  Lock,
  Sliders,
  DollarSign,
  Calculator,
  ListChecks,
} from "lucide-react";
import { BookingDetailModal } from "@/components/booking/BookingDetailModal";
import { OmWhatsAppBookingModal } from "@/components/booking/OmWhatsAppBookingModal";
import { isAmazonChannel, isFlipkartFbfOrFksb, getAllowedCouriersForChannel } from "@/lib/courier-defaults";

interface BookingViewProps {
  orders: AppointmentOrder[];
  isLoading: boolean;
  courierPresets: CourierPresetItem[];
  warehouses?: string[];
  page: number;
  pageSize: number;
  totalOrders: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onOpenOrderDrawer: (order: AppointmentOrder) => void;
  onOrderUpdated: () => void;
  onQuickNoteClick?: (order: AppointmentOrder) => void;
  onSwitchToAppointment?: (order?: AppointmentOrder) => void;
  onOpenPresets?: () => void;
}

export function BookingView({
  orders,
  isLoading,
  courierPresets,
  warehouses = [],
  page,
  pageSize,
  totalOrders,
  totalPages,
  onPageChange,
  onOpenOrderDrawer,
  onOrderUpdated,
  onQuickNoteClick,
  onSwitchToAppointment,
  onOpenPresets,
}: BookingViewProps) {
  const { showToast } = useToast();

  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editingPickupOrderId, setEditingPickupOrderId] = useState<string | null>(null);
  const [pickupDateVal, setPickupDateVal] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedBookingDetailOrder, setSelectedBookingDetailOrder] = useState<AppointmentOrder | null>(null);
  const [whatsAppModalOrder, setWhatsAppModalOrder] = useState<AppointmentOrder | null>(null);

  // Quick Copy Helper
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      showToast(`${label} copied to clipboard`, "success");
      setTimeout(() => setCopiedText(null), 1800);
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  // Save Inline Pickup Date
  const handleSavePickupDate = async (orderId: string) => {
    if (!pickupDateVal) {
      setEditingPickupOrderId(null);
      return;
    }
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupDate: pickupDateVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update pickup date");

      showToast("Pickup date updated", "success");
      setEditingPickupOrderId(null);
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to update pickup date", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  // Quick Courier Assignment
  const handleCourierChange = async (orderId: string, courierName: string) => {
    if (courierName === "OM Logistics") {
      const target = orders.find((o) => o.id === orderId);
      if (target) {
        setWhatsAppModalOrder(target);
        return;
      }
    }

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierPartner: courierName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update courier");

      showToast(`Courier set to ${courierName}`, "success");
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to update courier", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Loading Booking & Pickup Manifest...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Booking desk: one card per order ── */}
      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-300 py-16 text-center text-slate-400">
          <div className="flex flex-col items-center justify-center gap-2">
            <Truck className="w-8 h-8 text-slate-300" />
            <p className="font-bold text-slate-600">No consignment orders require booking</p>
            <p className="text-xs text-slate-400">All shipments have been booked or no match found.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {orders.map((order) => {
            const isCopiedRo = copiedText === order.roPoNumber;
            const deliveredTo = (order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address;
            const destToCopy = deliveredTo || order.warehouseName || "";
            const isCopiedDest = copiedText === destToCopy;
            const isEditingPickup = editingPickupOrderId === order.id;
            const cartons = summarizeCartons(order);

            // Channel courier policy (Golden Rules 4, 5, 6)
            const isAmz = isAmazonChannel(order.channel);
            const isFk = isFlipkartFbfOrFksb(order.channel);
            const allowedCouriers = getAllowedCouriersForChannel(order.channel);
            const selectedCourierVal = order.courierPartner || (isAmz ? "Amazon ATS" : "");

            return (
              <article
                key={order.id}
                className="bg-white rounded-2xl border border-slate-300 shadow-xs hover:shadow-sm hover:border-violet-300 transition flex flex-col text-slate-800"
              >
                {/* Header: RO, platform, status */}
                <header className="px-4 pt-3.5 pb-3 border-b border-slate-200 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedBookingDetailOrder(order)}
                        className="font-mono font-extrabold text-sm text-violet-700 hover:text-violet-900 hover:underline cursor-pointer"
                        title="Compare rates for this consignment"
                      >
                        {order.roPoNumber}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.roPoNumber, "RO/PO Number")}
                        title="Copy RO/PO Number"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      >
                        {isCopiedRo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <ChannelBadge channel={order.channel} size="sm" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                      {order.invoiceNo && <span className="font-mono">Inv {order.invoiceNo}</span>}
                      {order.personalNote && (
                        <button
                          type="button"
                          onClick={() => onQuickNoteClick?.(order)}
                          className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 max-w-[220px] cursor-pointer hover:bg-amber-100"
                        >
                          <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                          <span className="truncate">{order.personalNote}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Statuses mirrored from the Consignment app (read-only badges) */}
                  <div className="shrink-0">
                    <ConsignmentStatusStack order={order} />
                  </div>
                </header>

                {/* Key facts */}
                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-b border-slate-100">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-violet-500" /> Pickup
                    </div>
                    {isEditingPickup ? (
                      <div className="flex items-center gap-1 mt-1">
                        <DateInput
                          value={pickupDateVal}
                          onChange={(e) => setPickupDateVal(e.target.value)}
                          className="text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 focus:outline-none focus:border-violet-500 w-full"
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleSavePickupDate(order.id)}
                          className="px-1.5 py-0.5 rounded bg-violet-600 text-white hover:bg-violet-700 cursor-pointer text-[10px] font-bold disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPickupOrderId(null)}
                          className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer text-[10px]"
                          aria-label="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPickupOrderId(order.id);
                          setPickupDateVal(formatDateInputValue(order.pickupDate));
                        }}
                        className="mt-0.5 text-left group/date cursor-pointer"
                        title="Edit pickup date"
                      >
                        <span className={`font-bold text-sm ${order.pickupDate ? "text-slate-900" : "text-slate-400 italic font-semibold"}`}>
                          {order.pickupDate ? formatDateDisplay(order.pickupDate) : "Not set"}
                        </span>
                        <span className="ml-1.5 text-[10px] text-violet-600 font-bold opacity-0 group-hover/date:opacity-100 transition">Edit</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Layers className="w-3 h-3 text-violet-500" /> Shipment
                    </div>
                    <div className="mt-0.5 font-bold text-sm text-slate-900">
                      {cartons.totalBoxes > 0 ? `${cartons.totalBoxes} box${cartons.totalBoxes === 1 ? "" : "es"}` : "Boxes pending"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {cartons.totalWeightKg != null ? `${cartons.totalWeightKg.toFixed(2)} kg total` : "Weight pending"}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Building className="w-3 h-3 text-violet-500" /> Destination
                    </div>
                    <div className="mt-0.5 font-bold text-slate-900 line-clamp-1" title={order.warehouseName || undefined}>
                      {order.warehouseName || "Destination pending"}
                    </div>
                    {deliveredTo && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight" title={deliveredTo}>
                        {deliveredTo}
                      </p>
                    )}
                    {destToCopy && (
                      <button
                        type="button"
                        onClick={() => handleCopy(destToCopy, deliveredTo ? "Destination Address" : "Warehouse Name")}
                        className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold cursor-pointer mt-0.5"
                      >
                        {isCopiedDest ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>{deliveredTo ? "Copy address" : "Copy destination"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Box dimensions (1-click copy wizard for carrier portals) */}
                <div className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                  <BoxDimensionCopyHelper groups={order.boxDimensionGroups || []} compact={true} orderNumber={order.roPoNumber} />
                </div>

                {/* Footer: carrier + actions */}
                <footer className="px-4 py-3 mt-auto flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={selectedCourierVal}
                      onChange={(e) => handleCourierChange(order.id, e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer max-w-[170px]"
                      aria-label="Carrier partner"
                    >
                      <option value="">Select courier…</option>
                      {allowedCouriers.map((courierName) => (
                        <option key={courierName} value={courierName}>
                          {courierName}
                          {isFk && courierName === "Ekart" ? " (Recommended)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedBookingDetailOrder(order)}
                      className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-violet-50 text-violet-700 border border-violet-300 rounded-lg transition cursor-pointer flex items-center gap-1.5"
                      title="Compare shipping rates between carriers"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      <span>Compare rates</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => (onSwitchToAppointment ? onSwitchToAppointment(order) : onOpenOrderDrawer(order))}
                      className="px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Enter CN & Slot</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenOrderDrawer(order)}
                      className="px-2 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer flex items-center gap-1"
                      title="Order details, documents and history"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </button>
                    <a
                      href={`https://consignmentops.averretail.com/?search=${encodeURIComponent(order.roPoNumber)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open this consignment in the Main Consignment App"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalOrders > 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-700 bg-white">
          <div>
            Page <span className="font-bold text-slate-900">{page}</span> of <span className="font-bold text-slate-900">{totalPages}</span> ({totalOrders} orders)
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Order Detail & Multi-Carrier Price Comparison Window ── */}
      <BookingDetailModal
        order={selectedBookingDetailOrder}
        isOpen={Boolean(selectedBookingDetailOrder)}
        onClose={() => setSelectedBookingDetailOrder(null)}
        courierPresets={courierPresets}
        onOrderUpdated={() => {
          onOrderUpdated();
          setSelectedBookingDetailOrder(null);
        }}
        onOpenPresets={onOpenPresets}
        onSwitchToAppointment={(ord) => {
          setSelectedBookingDetailOrder(null);
          onSwitchToAppointment?.(ord);
        }}
      />

      {/* ── OM Logistics WhatsApp Pickup Booking Window ── */}
      <OmWhatsAppBookingModal
        order={whatsAppModalOrder}
        isOpen={Boolean(whatsAppModalOrder)}
        onClose={() => setWhatsAppModalOrder(null)}
        onOrderUpdated={onOrderUpdated}
      />
    </div>
  );
}
