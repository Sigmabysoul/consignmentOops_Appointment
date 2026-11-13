"use client";

import React, { useState } from "react";
import {
  AppointmentOrder,
  CourierPresetItem,
} from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
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

  // GRN Issue Modal state
  const [grnModalOrder, setGrnModalOrder] = useState<AppointmentOrder | null>(null);
  const [grnIssueType, setGrnIssueType] = useState<string>("Shortage / Quantity Mismatch");
  const [grnRemarks, setGrnRemarks] = useState<string>("");
  const [isSubmittingGrn, setIsSubmittingGrn] = useState<boolean>(false);

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

  // Manual Status Action: Mark Delivered
  const handleMarkDelivered = async (order: AppointmentOrder) => {
    if (!confirm(`Mark consignment "${order.roPoNumber}" as Delivered? This will update delivery records and synchronize with the main consignment system.`)) {
      return;
    }
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Delivered",
          courierStatus: "Delivered",
          deliveryDate: new Date().toISOString(),
          remarks: "Marked as Delivered from Appointment Desk",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark delivered");

      showToast(`Consignment ${order.roPoNumber} marked as Delivered ✓`, "success");
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to mark delivered", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  // Manual Status Action: Submit GRN Issue
  const handleSubmitGrnIssue = async () => {
    if (!grnModalOrder) return;
    setIsSubmittingGrn(true);
    try {
      const fullReport = `${grnIssueType}: ${grnRemarks || "No details provided"}`;
      const res = await fetch(`/api/orders/${grnModalOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "GRN Issue",
          courierStatus: "GRN Issue",
          grnStatus: "GRN Issue",
          grnReport: fullReport,
          comment: fullReport,
          remarks: `GRN Issue logged: ${grnIssueType}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log GRN issue");

      showToast(`GRN Issue reported for ${grnModalOrder.roPoNumber}`, "success");
      setGrnModalOrder(null);
      setGrnRemarks("");
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to log GRN issue", "error");
    } finally {
      setIsSubmittingGrn(false);
    }
  };

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
      {/* ── Section Header Banner ── */}
      <div className="bg-gradient-to-r from-indigo-900/90 via-purple-900/90 to-slate-900/90 text-white p-4 rounded-2xl border border-indigo-700/50 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/60 border border-indigo-400/40 flex items-center justify-center shadow-inner">
            <Calendar className="w-5 h-5 text-indigo-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black tracking-tight text-white">
                Part 2: Appointment Management & Dispatch Desk
              </h2>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/40 border border-indigo-400/30 text-indigo-200">
                Priority: CN & Appointment Date
              </span>
            </div>
            <p className="text-xs text-indigo-200/80 font-medium mt-0.5">
              Consignment Note (CN / Docket) and Appointment schedule tracking. Manually change status to Delivered or GRN Issue.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto text-xs font-semibold text-indigo-200">
          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
            Showing <span className="font-extrabold text-white">{orders.length}</span> active appointments
          </div>
        </div>
      </div>

      {/* ── Main Orders Appointment Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
                <th className="py-3 px-3.5 whitespace-nowrap">RO / PO & Channel</th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-indigo-50/70 text-indigo-950 border-l border-r border-indigo-200/60 min-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Consignment Note (CN / Docket #)</span>
                  </div>
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-purple-50/70 text-purple-950 border-r border-purple-200/60 min-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <span>Appointment Date & Slot</span>
                  </div>
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap">Warehouse Destination</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Current Status</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right min-w-[220px]">
                  Manual Status Controls
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Calendar className="w-8 h-8 text-slate-300" />
                      <p className="font-bold text-slate-600">No appointments scheduled</p>
                      <p className="text-xs text-slate-400">Add a CN or schedule appointments from the booking desk.</p>
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
                      className="hover:bg-slate-50/80 transition-colors group text-slate-800"
                    >
                      {/* Column 1: RO / PO & Platform */}
                      <td className="py-3 px-3.5 align-top">
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
                      <td className="py-3 px-3.5 align-top bg-indigo-50/30 border-l border-r border-indigo-100">
                        <div className="space-y-1.5">
                          {isEditingCn ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={cnVal}
                                onChange={(e) => setCnVal(e.target.value)}
                                placeholder="Enter CN / Docket No..."
                                className="w-full text-xs font-mono font-bold bg-white border border-indigo-400 rounded px-2 py-1 text-slate-900"
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
                                  className="px-2 py-0.5 text-[10px] bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer"
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
                      <td className="py-3 px-3.5 align-top bg-purple-50/30 border-r border-purple-100">
                        <div className="space-y-1.5">
                          {isEditingDate ? (
                            <div className="space-y-1.5 bg-white p-2 rounded-lg border border-purple-300 shadow-2xs">
                              <div>
                                <label className="block text-[9px] font-bold text-slate-500 uppercase">
                                  Date
                                </label>
                                <input
                                  type="date"
                                  value={dateVal}
                                  onChange={(e) => setDateVal(e.target.value)}
                                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-800"
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
                                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-800"
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
                                  className="px-2 py-0.5 text-[10px] bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer"
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
                      <td className="py-3 px-3.5 align-top">
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
                      <td className="py-3 px-3.5 align-top">
                        <div className="space-y-1">
                          <StatusBadge status={order.status || order.courierStatus} size="sm" />

                          {isDelivered && order.deliveryDate && (
                            <div className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Delivered: {formatDateDisplay(order.deliveryDate)}</span>
                            </div>
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

                            {/* 2. Report GRN Issue Button */}
                            {!isGrnIssue && (
                              <button
                                type="button"
                                onClick={() => {
                                  setGrnModalOrder(order);
                                  setGrnIssueType("Shortage / Quantity Mismatch");
                                  setGrnRemarks(order.grnReport || "");
                                }}
                                title="Change status manually to GRN Issue"
                                className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>GRN Issue</span>
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

                            {/* Direct link to Main Consignment App */}
                            <a
                              href={`http://consignmentops.averretail.com?search=${encodeURIComponent(order.roPoNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Main Consignment Operations App"
                              className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition"
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
          <div className="flex items-center justify-between p-3 border-t border-slate-200 text-xs text-slate-600 bg-slate-50/50">
            <div>
              Page <span className="font-bold text-slate-800">{page}</span> of{" "}
              <span className="font-bold text-slate-800">{totalPages}</span> ({totalOrders} appointments total)
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Manual GRN Issue Modal ── */}
      {grnModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setGrnModalOrder(null)}
          />

          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-rose-200 p-5 space-y-4 z-10 text-slate-800 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-rose-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Report Warehouse GRN Issue
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Consignment: <span className="font-mono font-bold text-rose-700">{grnModalOrder.roPoNumber}</span> ({grnModalOrder.channel})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGrnModalOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Issue Category */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Discrepancy Category
              </label>
              <select
                value={grnIssueType}
                onChange={(e) => setGrnIssueType(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="Shortage / Quantity Mismatch">Shortage / Quantity Mismatch</option>
                <option value="Damaged Carton / Product">Damaged Carton / Product</option>
                <option value="Gate Pass / Dock Rejection">Gate Pass / Dock Rejection</option>
                <option value="Barcode / Label Unreadable">Barcode / Label Unreadable</option>
                <option value="PO / Invoice Mismatch">PO / Invoice Mismatch</option>
                <option value="Expired / Ro Window Closed">Expired / RO Window Closed</option>
                <option value="Other Warehouse Exception">Other Warehouse Exception</option>
              </select>
            </div>

            {/* Remarks Textarea */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Issue Description / Warehouse Feedback
              </label>
              <textarea
                rows={3}
                value={grnRemarks}
                onChange={(e) => setGrnRemarks(e.target.value)}
                placeholder="Enter details from warehouse GRN team (e.g. 2 boxes rejected at dock 4 due to seal damage)..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
              />
            </div>

            {/* Notice */}
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200/60 p-2.5 rounded-xl flex items-start gap-2">
              <FileWarning className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                Submitting this changes status to <strong className="font-bold">GRN Issue</strong> and records the discrepancy in the shared Consignment database for immediate resolution.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGrnModalOrder(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingGrn}
                onClick={handleSubmitGrnIssue}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs hover:shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingGrn ? (
                  <span>Recording Issue...</span>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Set Status to GRN Issue</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
