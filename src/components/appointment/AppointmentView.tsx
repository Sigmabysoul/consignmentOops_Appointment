"use client";

import { DateInput } from "@/components/ui/DateInput";
import React, { useState } from "react";
import {
  AppointmentOrder,
  CourierPresetItem,
} from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { DelhiveryTrackingRefresh, DelhiveryTrackingTag } from "@/components/delhivery/DelhiveryTrackingTag";
import { MarkDeliveredModal } from "@/components/delivery/MarkDeliveredModal";
import { ShiprocketTrackingRefresh, ShiprocketTrackingTag } from "@/components/shiprocket/ShiprocketTrackingTag";
import { getPodRecord, podFileUrl } from "@/lib/pod";
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Building,
  Edit2,
  ExternalLink,
  Clock,
  Truck,
  Hash,
  Lock,
  ChevronRight,
  X,
  FileWarning,
} from "lucide-react";

interface AppointmentViewProps {
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
  onOpenPresets?: () => void;
}

export function AppointmentView({
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
  onOpenPresets,
}: AppointmentViewProps) {
  const { showToast } = useToast();

  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editingCnOrderId, setEditingCnOrderId] = useState<string | null>(null);
  const [cnVal, setCnVal] = useState<string>("");

  const [editingDateOrderId, setEditingDateOrderId] = useState<string | null>(null);
  const [dateVal, setDateVal] = useState<string>("");
  const [slotVal, setSlotVal] = useState<string>("");

  const [isUpdating, setIsUpdating] = useState(false);

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

  // Save Inline CN (Tracking ID)
  const handleSaveCn = async (orderId: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingId: cnVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update CN");

      showToast("Consignment Note (CN) updated", "success");
      setEditingCnOrderId(null);
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to update CN", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  // Save Inline Appointment Date & Slot
  const handleSaveAppointmentDate = async (orderId: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentDate: dateVal || null,
          appointmentSlot: slotVal || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update appointment");

      showToast("Appointment date & slot updated", "success");
      setEditingDateOrderId(null);
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to update appointment", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  // Manual Status Action: Mark Delivered — opens the POD form (POD is mandatory)
  const [deliverOrder, setDeliverOrder] = useState<AppointmentOrder | null>(null);
  const handleMarkDelivered = (order: AppointmentOrder) => setDeliverOrder(order);

  if (isLoading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Loading Appointment Manifest...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DelhiveryTrackingRefresh orders={orders} onRefreshed={onOrderUpdated} />
      <ShiprocketTrackingRefresh orders={orders} onRefreshed={onOrderUpdated} />

      {/* ── Main Orders Appointment Table ── */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-300 select-none">
                <th className="py-3 px-3.5 whitespace-nowrap border-r border-slate-300">RO / PO & Channel</th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-slate-50 text-slate-900 border-r border-slate-300 min-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Consignment Note (CN / Docket #)</span>
                  </div>
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-slate-50 text-slate-900 border-r border-slate-300 min-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <span>Appointment Date & Slot</span>
                  </div>
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap border-r border-slate-300">Warehouse Destination</th>
                <th className="py-3 px-3.5 whitespace-nowrap border-r border-slate-300">Current Status</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right min-w-[220px]">
                  Manual Status Controls
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-300">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Calendar className="w-8 h-8 text-slate-300" />
                      <p className="font-bold text-slate-600">No in-transit shipments</p>
                      <p className="text-xs text-slate-400">Orders move to the appointment desk once they are in transit.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isCopiedRo = copiedText === order.roPoNumber;
                  const isCopiedCn = copiedText === (order.trackingId || "");
                  const isEditingCn = editingCnOrderId === order.id;
                  const isEditingDate = editingDateOrderId === order.id;

                  const isDelivered = (order.status || "").toLowerCase() === "delivered" || (order.courierStatus || "").toLowerCase() === "delivered";
                  const isGrnIssue = (order.status || "").toLowerCase().includes("issue") || (order.grnStatus || "").toLowerCase().includes("issue");

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50 transition-colors group text-slate-800"
                    >
                      {/* Column 1: RO / PO & Platform */}
                      <td className="py-3 px-3.5 align-top border-r border-slate-200">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-extrabold text-slate-900 text-xs">
                              {order.roPoNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(order.roPoNumber, "RO/PO Number")}
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

                          {order.courierPartner && (
                            <div className="text-[10px] text-slate-600 font-semibold flex items-center gap-1">
                              <Truck className="w-3 h-3 text-slate-400" />
                              <span>{order.courierPartner}</span>
                            </div>
                          )}

                          {order.personalNote && (
                            <button
                              type="button"
                              onClick={() => onQuickNoteClick?.(order)}
                              className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 max-w-[140px] truncate cursor-pointer hover:bg-amber-100"
                            >
                              <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                              <span className="truncate">{order.personalNote}</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Column 2: Consignment Note (CN / Docket #) (PRIORITY 1) */}
                      <td className="py-3 px-3.5 align-top bg-slate-50/50 border-r border-slate-200">
                        <div className="space-y-1.5">
                          {isEditingCn ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={cnVal}
                                onChange={(e) => setCnVal(e.target.value)}
                                placeholder="Enter CN / Docket No..."
                                className="w-full text-xs font-mono font-bold bg-white border border-indigo-400 rounded px-2 py-1 text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                autoFocus
                              />
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveCn(order.id)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer"
                                >
                                  Save CN
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCnOrderId(null)}
                                  className="px-2 py-0.5 text-[10px] bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                {order.trackingId ? (
                                  <div className="flex items-center gap-1 bg-white border border-indigo-200 px-2 py-1 rounded-lg shadow-2xs">
                                    <span className="font-mono font-black text-indigo-900 text-xs tracking-wide">
                                      {order.trackingId}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(order.trackingId || "", "CN Number")}
                                      title="Copy Consignment Note (CN)"
                                      className="p-1 rounded text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 transition cursor-pointer"
                                    >
                                      {isCopiedCn ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] font-semibold text-rose-500 italic">
                                    CN Missing
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCnOrderId(order.id);
                                    setCnVal(order.trackingId || "");
                                  }}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                                >
                                  {order.trackingId ? "Edit" : "+ Enter CN"}
                                </button>
                              </div>

                              {/* Custom Tracking Link (Only if manually provided by user) */}
                              {order.trackingLink && (
                                <a
                                  href={order.trackingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  <span>Tracking Link</span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Appointment Date & Slot (PRIORITY 2) */}
                      <td className="py-3 px-3.5 align-top bg-slate-50/30 border-r border-slate-200">
                        <div className="space-y-1.5">
                          {isEditingDate ? (
                            <div className="space-y-1.5 bg-white p-2 rounded-lg border border-purple-300 shadow-2xs">
                              <div>
                                <label className="block text-[9px] font-bold text-slate-500 uppercase">
                                  Date
                                </label>
                                <DateInput
                                  value={dateVal}
                                  onChange={(e) => setDateVal(e.target.value)}
                                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-slate-800"
                                />
                              </div>

                              <div>
                                <label className="block text-[9px] font-bold text-slate-500 uppercase">
                                  Slot
                                </label>
                                <input
                                  type="text"
                                  value={slotVal}
                                  onChange={(e) => setSlotVal(e.target.value)}
                                  placeholder="e.g. 10:00 - 13:00"
                                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-slate-800"
                                />
                              </div>

                              <div className="flex items-center gap-1 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveAppointmentDate(order.id)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-purple-600 text-white rounded hover:bg-purple-700 cursor-pointer"
                                >
                                  Save Slot
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingDateOrderId(null)}
                                  className="px-2 py-0.5 text-[10px] bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="font-extrabold text-xs text-purple-950 flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                  <span>
                                    {order.appointmentDate
                                      ? formatDateDisplay(order.appointmentDate)
                                      : "Appointment Not Set"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDateOrderId(order.id);
                                    setDateVal(formatDateInputValue(order.appointmentDate));
                                    setSlotVal(order.appointmentSlot || "");
                                  }}
                                  className="text-[10px] text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
                                >
                                  {order.appointmentDate ? "Edit" : "+ Set Date"}
                                </button>
                              </div>

                              {order.appointmentSlot && (
                                <div className="text-[10px] font-semibold text-purple-800 bg-purple-100/70 px-1.5 py-0.5 rounded inline-block">
                                  Slot: {order.appointmentSlot}
                                </div>
                              )}

                              {order.appointmentId && (
                                <div className="text-[10px] text-slate-500 font-mono">
                                  ID: {order.appointmentId}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 4: Warehouse Destination */}
                      <td className="py-3 px-3.5 align-top border-r border-slate-200">
                        <div className="space-y-1 max-w-[190px]">
                          <div className="font-semibold text-xs text-slate-800 flex items-start gap-1">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{order.warehouseName || "Destination Pending"}</span>
                          </div>

                          {((order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address) && (
                            <p
                              className="text-[10px] text-slate-600 line-clamp-2 leading-tight"
                              title={(order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address}
                            >
                              {(order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address}
                            </p>
                          )}

                          {order.client?.name && (
                            <div className="text-[10px] text-slate-500 truncate">
                              Client: {order.client.name}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Current Status */}
                      <td className="py-3 px-3.5 align-top border-r border-slate-200">
                        <div className="space-y-1">
                          <StatusBadge status={order.status || order.courierStatus} size="sm" />
                          <DelhiveryTrackingTag order={order} />
                          <ShiprocketTrackingTag order={order} />

                          {isDelivered && order.deliveryDate && (
                            <div className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Delivered: {formatDateDisplay(order.deliveryDate)}</span>
                            </div>
                          )}

                          {isDelivered && getPodRecord(order.customData) && (
                            <a
                              href={podFileUrl(order.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-semibold text-sky-700 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View POD</span>
                            </a>
                          )}

                          {isGrnIssue && (
                            <div className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 p-1 rounded max-w-[180px]">
                              <span className="font-bold">GRN Issue:</span> {order.grnReport || order.comment || "Discrepancy flagged"}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 6: Manual Status Controls (PRIORITY REQUIREMENT) */}
                      <td className="py-3 px-3.5 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1.5">
                            {/* 1. Mark Delivered Button */}
                            {!isDelivered && (
                              <button
                                type="button"
                                onClick={() => handleMarkDelivered(order)}
                                title="Change status manually to Delivered"
                                className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Mark Delivered</span>
                              </button>
                            )}

                          </div>

                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => onOpenOrderDrawer(order)}
                              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3 text-indigo-500" />
                              <span>More Details</span>
                            </button>

                            <span className="text-slate-300 text-xs">•</span>

                            {/* Direct link to Main Consignment App */}
                            <a
                              href={`http://consignmentops.averretail.com?search=${encodeURIComponent(order.roPoNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Main Consignment Operations App"
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
              <span className="font-bold text-slate-900">{totalPages}</span> ({totalOrders} appointments total)
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

      <MarkDeliveredModal
        key={deliverOrder?.id || "none"}
        order={deliverOrder}
        onClose={() => setDeliverOrder(null)}
        onDelivered={() => {
          setDeliverOrder(null);
          onOrderUpdated();
        }}
      />

    </div>
  );
}
