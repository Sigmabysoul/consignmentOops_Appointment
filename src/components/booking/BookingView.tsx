"use client";

import React, { useState } from "react";
import {
  AppointmentOrder,
  CourierPresetItem,
} from "@/lib/types";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import {
  Calendar,
  Truck,
  Copy,
  Check,
  Building,
  CheckCircle2,
  Clock,
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
  MessageSquare,
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
      {/* ── Main Orders Booking Table ── */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-300 select-none">
                <th className="py-3 px-3.5 whitespace-nowrap border-r border-slate-300">RO / PO & Channel</th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-slate-50 text-slate-900 border-r border-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-violet-600" />
                    <span>Pickup Data (Priority 1)</span>
                  </div>
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap min-w-[340px] bg-slate-50 border-r border-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-violet-600" />
                    <span>Box Dimensions (1-Click Copy Wizard)</span>
                  </div>
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap border-r border-slate-300">Warehouse Destination</th>
                <th className="py-3 px-3.5 whitespace-nowrap border-r border-slate-300">Carrier Partner</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Booking Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-300">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Truck className="w-8 h-8 text-slate-300" />
                      <p className="font-bold text-slate-600">No consignment orders require booking</p>
                      <p className="text-xs text-slate-400">All shipments have been booked or no match found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isCopiedRo = copiedText === order.roPoNumber;
                  const deliveredTo = (order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address;
                  const destToCopy = deliveredTo || order.warehouseName || "";
                  const isCopiedDest = copiedText === destToCopy;
                  const isEditingPickup = editingPickupOrderId === order.id;

                  // Channel Default Courier Logic (Rules 4, 5, 6)
                  const isAmz = isAmazonChannel(order.channel);
                  const isFk = isFlipkartFbfOrFksb(order.channel);
                  const allowedCouriers = getAllowedCouriersForChannel(order.channel);
                  const selectedCourierVal = order.courierPartner || (isAmz ? "Amazon ATS" : "");

                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedBookingDetailOrder(order)}
                      className="hover:bg-slate-50 transition-colors group text-slate-800 cursor-pointer"
                      title="Click anywhere on row to view order details & compare carrier rates"
                    >
                      {/* Column 1: RO / PO & Platform */}
                      <td className="py-3 px-3.5 align-top border-r border-slate-200">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBookingDetailOrder(order);
                              }}
                              className="font-mono font-extrabold text-violet-700 hover:text-violet-900 hover:underline text-xs text-left cursor-pointer"
                              title="Click to view details & compare rates"
                            >
                              {order.roPoNumber}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(order.roPoNumber, "RO/PO Number");
                              }}
                              title="Copy RO/PO Number"
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                            >
                              {isCopiedRo ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          <div>
                            <ChannelBadge channel={order.channel} size="sm" />
                          </div>

                          {order.invoiceNo && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Inv: {order.invoiceNo}
                            </div>
                          )}

                          {order.personalNote && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickNoteClick?.(order);
                              }}
                              className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 max-w-[140px] truncate cursor-pointer hover:bg-amber-100"
                            >
                              <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                              <span className="truncate">{order.personalNote}</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Column 2: Pickup Data (PRIORITY 1 - Sourced from Consignment Sheet) */}
                      <td className="py-3 px-3.5 align-top bg-slate-50/50 border-r border-slate-200" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-2 max-w-[200px]">
                          {/* Read-Only Pickup Status Badge */}
                          <div
                            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border shadow-2xs ${
                              order.pickupDone
                                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                                : "bg-amber-50 border-amber-300 text-amber-800"
                            }`}
                            title="Pickup status is sourced directly from consignment sheet"
                          >
                            {order.pickupDone ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            )}
                            <span>{order.pickupDone ? "Pickup Done" : "Pickup Pending"}</span>
                          </div>

                          {/* Pickup Date Display / Inline Edit */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                              Pickup Scheduled Date
                            </span>

                            {isEditingPickup ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={pickupDateVal}
                                  onChange={(e) => setPickupDateVal(e.target.value)}
                                  className="text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 focus:outline-none focus:border-violet-500"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSavePickupDate(order.id);
                                  }}
                                  className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 cursor-pointer text-[10px] font-bold"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPickupOrderId(null);
                                  }}
                                  className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer text-[10px]"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between group/date">
                                <span className="font-semibold text-xs text-slate-800">
                                  {order.pickupDate ? formatDateDisplay(order.pickupDate) : "Date Not Set"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPickupOrderId(order.id);
                                    setPickupDateVal(formatDateInputValue(order.pickupDate));
                                  }}
                                  title="Edit pickup date"
                                  className="text-[10px] text-violet-600 hover:text-violet-800 font-bold opacity-0 group-hover/date:opacity-100 transition cursor-pointer"
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 3: Box Dimensions (UNIQUE DISPLAY & 1-CLICK COPY WIZARD) */}
                      <td className="py-3 px-3.5 align-top bg-slate-50/30 border-r border-slate-200" onClick={(e) => e.stopPropagation()}>
                        <BoxDimensionCopyHelper
                          groups={order.boxDimensionGroups || []}
                          compact={true}
                          orderNumber={order.roPoNumber}
                        />
                      </td>

                      {/* Column 4: Warehouse Destination */}
                      <td className="py-3 px-3.5 align-top border-r border-slate-200">
                        <div className="space-y-1 max-w-[200px]">
                          <div className="font-semibold text-xs text-slate-800 flex items-start gap-1">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{order.warehouseName || "Destination Pending"}</span>
                          </div>

                          {deliveredTo && (
                            <p className="text-[11px] text-slate-600 line-clamp-2 font-normal leading-tight" title={deliveredTo}>
                              {deliveredTo}
                            </p>
                          )}

                          {destToCopy && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(destToCopy, deliveredTo ? "Destination Address" : "Warehouse Name");
                              }}
                              className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium cursor-pointer"
                            >
                              {isCopiedDest ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="text-emerald-700">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5" />
                                  <span>{deliveredTo ? "Copy Address" : "Copy Destination"}</span>
                                </>
                              )}
                            </button>
                          )}

                          {order.client?.city && (
                            <div className="text-[10px] text-slate-400">
                              City: {order.client.city}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Carrier Partner */}
                      <td className="py-3 px-3.5 align-top border-r border-slate-200" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1.5">
                          <select
                            value={selectedCourierVal}
                            onChange={(e) => handleCourierChange(order.id, e.target.value)}
                            className="text-xs bg-slate-50 hover:bg-white border border-slate-300 rounded-lg p-1.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer w-full max-w-[155px]"
                          >
                            <option value="">Select Courier...</option>
                            {allowedCouriers.map((courierName) => {
                              const isRecommended = isFk && courierName === "Ekart";
                              return (
                                <option key={courierName} value={courierName}>
                                  {courierName}{isRecommended ? " (Recommended)" : ""}
                                </option>
                              );
                            })}
                          </select>

                          <div className="flex items-center gap-1">
                            <StatusBadge status={order.courierStatus || order.status} size="sm" />
                          </div>
                        </div>
                      </td>

                      {/* Column 6: Booking Actions */}
                      <td className="py-3 px-3.5 align-top text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-end gap-1.5">
                          {/* Next Step Button: Move to Appointment / Enter CN */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onSwitchToAppointment) {
                                onSwitchToAppointment(order);
                              } else {
                                onOpenOrderDrawer(order);
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-2xs hover:shadow-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span>Enter CN & Slot</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>

                          {/* Compare Rates & Cost Estimator Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedBookingDetailOrder(order)}
                            className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                            title="Compare shipping rates between OM Logistics & partner carriers"
                          >
                            <Calculator className="w-3.5 h-3.5 text-slate-500" />
                            <span>Compare Rates</span>
                          </button>

                          {/* OM Logistics WhatsApp Booking Button */}
                          {(allowedCouriers.includes("OM Logistics") || order.courierPartner === "OM Logistics") && (
                            <button
                              type="button"
                              onClick={() => setWhatsAppModalOrder(order)}
                              className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                              title="Draft WhatsApp Pickup Booking for OM Logistics"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                              <span>WhatsApp Booking</span>
                            </button>
                          )}

                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => onOpenOrderDrawer(order)}
                              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3 text-slate-400" />
                              <span>Edit Details</span>
                            </button>

                            <span className="text-slate-300 text-xs">•</span>

                            {/* Direct link to open in Main Consignment App */}
                            <a
                              href={`https://consignmentops.averretail.com/?search=${encodeURIComponent(order.roPoNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open this consignment in the Main Consignment App"
                              className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition"
                            >
                              <span>Consignment</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Footer ── */}
        {totalOrders > 0 && (
          <div className="flex items-center justify-between p-3 border-t border-slate-300 text-xs text-slate-700 bg-slate-50">
            <div>
              Page <span className="font-bold text-slate-900">{page}</span> of{" "}
              <span className="font-bold text-slate-900">{totalPages}</span> ({totalOrders} orders total)
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
      </div>

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
