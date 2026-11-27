"use client";

import { DateInput } from "@/components/ui/DateInput";
import { getOrderTone } from "@/lib/order-tone";
import React, { useState } from "react";
import {
  AppointmentOrder,
  CourierPresetItem,
} from "@/lib/types";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConsignmentStatusStack } from "@/components/booking/ConsignmentStatusStack";
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
  ChevronLeft,
  ChevronRight,
  Edit2,
  ArrowRight,
  Lock,
  Calculator,
  ListChecks,
  X,
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
      <div className="ui-card flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
          <span>Loading booking &amp; pickup manifest…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Booking sheet ── */}
      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ui-table text-xs">
            <thead>
              <tr className="select-none">
                <th className="ui-th whitespace-nowrap">Order &amp; pickup</th>
                <th className="ui-th whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                    <span>Statuses</span>
                  </div>
                </th>
                <th className="ui-th min-w-[200px] whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-slate-400" />
                    <span>Boxes · click to copy</span>
                  </div>
                </th>
                <th className="ui-th whitespace-nowrap">Destination</th>
                <th className="ui-th whitespace-nowrap">Courier</th>
                <th className="ui-th whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="ui-empty">
                      <Truck className="h-8 w-8 stroke-[1.5] text-slate-300" />
                      <p className="font-medium text-slate-700">No consignment orders require booking</p>
                      <p className="ui-muted">All shipments have been booked or no match found.</p>
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
                      className="ui-tr group cursor-pointer text-slate-800"
                      title="Click anywhere on row to view order details & compare carrier rates"
                    >
                      {/* Column 1: RO / PO & platform — stage colour edge */}
                      <td className="ui-td" style={{ boxShadow: `inset 3px 0 0 ${getOrderTone(order as any).tone.accent}` }}>
                        <div className="flex min-w-[170px] flex-col gap-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBookingDetailOrder(order);
                              }}
                              className="cursor-pointer text-left font-mono text-[13px] font-semibold text-violet-700 hover:text-violet-900 hover:underline"
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
                              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            >
                              {isCopiedRo ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <ChannelBadge channel={order.channel} size="sm" />
                            {order.invoiceNo && (
                              <span className="ui-mono text-[11px] text-slate-400">Inv {order.invoiceNo}</span>
                            )}
                          </div>

                          {/* Pickup date */}
                          <div onClick={(e) => e.stopPropagation()}>
                            {isEditingPickup ? (
                              <div className="flex items-center gap-1">
                                <DateInput
                                  value={pickupDateVal}
                                  onChange={(e) => setPickupDateVal(e.target.value)}
                                  className="rounded-md border border-violet-400 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleSavePickupDate(order.id)}
                                  className="ui-btn-primary ui-btn-sm"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPickupOrderId(null)}
                                  title="Cancel"
                                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="group/date flex items-center gap-1.5 text-xs">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                <span className="text-slate-500">Pickup</span>
                                <span className={`font-medium tabular-nums ${order.pickupDate ? "text-slate-900" : "text-slate-400"}`}>
                                  {order.pickupDate ? formatDateDisplay(order.pickupDate) : "Not set"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPickupOrderId(order.id);
                                    setPickupDateVal(formatDateInputValue(order.pickupDate));
                                  }}
                                  title="Edit pickup date"
                                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-violet-700 focus:opacity-100 group-hover/date:opacity-100"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {order.personalNote && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onQuickNoteClick?.(order);
                              }}
                              className="flex max-w-[180px] cursor-pointer items-center gap-1 truncate rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100"
                            >
                              <Lock className="h-3 w-3 shrink-0 text-amber-600" />
                              <span className="truncate">{order.personalNote}</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Column 2: statuses mirrored from the Consignment app (read-only badges) */}
                      <td className="ui-td">
                        <ConsignmentStatusStack order={order} />
                      </td>

                      {/* Column 3: box dimensions (1-click copy wizard) */}
                      <td className="ui-td cursor-default" onClick={(e) => e.stopPropagation()}>
                        <BoxDimensionCopyHelper
                          groups={order.boxDimensionGroups || []}
                          compact={true}
                          orderNumber={order.roPoNumber}
                        />
                      </td>

                      {/* Column 4: warehouse destination */}
                      <td className="ui-td">
                        <div className="flex min-w-[180px] max-w-[240px] flex-col gap-1">
                          <div className="flex items-start gap-1.5 font-medium text-slate-900">
                            <Building className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="line-clamp-2">{order.warehouseName || "Destination pending"}</span>
                          </div>

                          {deliveredTo && (
                            <p className="line-clamp-2 pl-5 text-[11px] leading-snug text-slate-500" title={deliveredTo}>
                              {deliveredTo}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-2 pl-5">
                            {order.client?.city && (
                              <span className="text-[11px] text-slate-400">{order.client.city}</span>
                            )}
                            {destToCopy && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(destToCopy, deliveredTo ? "Destination Address" : "Warehouse Name");
                                }}
                                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] font-medium text-slate-500 hover:text-violet-700"
                              >
                                {isCopiedDest ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span className="text-emerald-700">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>{deliveredTo ? "Copy address" : "Copy destination"}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 5: carrier partner */}
                      <td className="ui-td cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-start gap-1.5">
                          <select
                            value={selectedCourierVal}
                            onChange={(e) => handleCourierChange(order.id, e.target.value)}
                            className="ui-select w-[160px] py-1 text-xs font-medium"
                          >
                            <option value="">Select courier…</option>
                            {allowedCouriers.map((courierName) => {
                              const isRecommended = isFk && courierName === "Ekart";
                              return (
                                <option key={courierName} value={courierName}>
                                  {courierName}{isRecommended ? " (Recommended)" : ""}
                                </option>
                              );
                            })}
                          </select>

                          <StatusBadge status={order.courierStatus || order.status} size="sm" />
                        </div>
                      </td>

                      {/* Column 6: booking actions */}
                      <td className="ui-td cursor-default text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-end gap-1.5">
                          {/* Next step: move to Appointment / enter CN */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onSwitchToAppointment) {
                                onSwitchToAppointment(order);
                              } else {
                                onOpenOrderDrawer(order);
                              }
                            }}
                            className="ui-btn-primary"
                          >
                            <span>Enter CN &amp; slot</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>

                          {/* Compare rates & cost estimator */}
                          <button
                            type="button"
                            onClick={() => setSelectedBookingDetailOrder(order)}
                            className="ui-btn-secondary"
                            title="Compare shipping rates between OM Logistics & partner carriers"
                          >
                            <Calculator className="h-3.5 w-3.5 text-slate-500" />
                            <span>Compare rates</span>
                          </button>

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => onOpenOrderDrawer(order)}
                              className="ui-btn-ghost ui-btn-sm"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>

                            {/* Direct link to open in Main Consignment App */}
                            <a
                              href={`https://consignmentops.averretail.com/?search=${encodeURIComponent(order.roPoNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open this consignment in the Main Consignment App"
                              className="ui-btn-ghost ui-btn-sm"
                            >
                              <span>Consignment</span>
                              <ExternalLink className="h-3 w-3" />
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

        {/* ── Pagination footer ── */}
        {totalOrders > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
            <div className="ui-muted tabular-nums">
              Page <span className="font-semibold text-slate-900">{page}</span> of{" "}
              <span className="font-semibold text-slate-900">{totalPages}</span> · {totalOrders} orders total
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="ui-btn-secondary"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="ui-btn-secondary"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
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
