"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Truck,
  Package,
  History,
  Save,
  ExternalLink,
  Clock,
  Shield,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { AppointmentOrder, CourierPresetItem } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { formatDateDisplay, formatDateTimeDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";

interface OrderDetailsDrawerProps {
  order: AppointmentOrder | null;
  onClose: () => void;
  courierPresets: CourierPresetItem[];
  onOrderUpdated: () => void;
}

export function OrderDetailsDrawer({
  order,
  onClose,
  courierPresets,
  onOrderUpdated,
}: OrderDetailsDrawerProps) {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"edit" | "history">("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [detailedOrder, setDetailedOrder] = useState<AppointmentOrder | null>(order);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Form Fields
  const [trackingId, setTrackingId] = useState("");
  const [courierPartner, setCourierPartner] = useState("");
  const [trackingLink, setTrackingLink] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentSlot, setAppointmentSlot] = useState("");
  const [courierStatus, setCourierStatus] = useState("Pending");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [comment, setComment] = useState("");
  const [statusRemarks, setStatusRemarks] = useState("");

  // Sync state when order changes & fetch full details (including history and audit logs)
  useEffect(() => {
    if (!order) return;

    setTrackingId(order.trackingId || "");
    setCourierPartner(order.courierPartner || "");
    setTrackingLink(order.trackingLink || "");
    setAppointmentId(order.appointmentId || "");
    setAppointmentDate(formatDateInputValue(order.appointmentDate));
    setAppointmentSlot(order.appointmentSlot || "");
    setCourierStatus(order.courierStatus || "Pending");
    setDeliveryDate(formatDateInputValue(order.deliveryDate));
    setComment(order.comment || "");
    setStatusRemarks("");

    // Fetch complete history
    setIsLoadingDetails(true);
    fetch(`/api/orders/${order.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.order) {
          setDetailedOrder(data.order);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingDetails(false));
  }, [order]);

  if (!order) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload: Record<string, any> = {
        trackingId: trackingId.trim(),
        courierPartner: courierPartner.trim(),
        trackingLink: trackingLink.trim(),
        appointmentId: appointmentId.trim(),
        appointmentDate: appointmentDate ? appointmentDate : null,
        appointmentSlot: appointmentSlot.trim(),
        courierStatus: courierStatus.trim(),
        deliveryDate: deliveryDate ? deliveryDate : null,
        comment: comment.trim(),
        remarks: statusRemarks.trim(),
      };

      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update order");
      }

      showToast("Logistics information updated successfully", "success");
      onOrderUpdated();

      // Refresh drawer details
      if (data.order) {
        setDetailedOrder(data.order);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to save updates", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const availableStatuses = [
    "Pending",
    "Tracking Assigned",
    "In Transit",
    "Appointment Scheduled",
    "Delivered",
    "GRN Issue",
    "Cancelled",
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl z-10 flex flex-col h-full border-l border-slate-200">
        {/* Drawer Header */}
        <div className="p-4 bg-gradient-to-r from-purple-800 to-indigo-900 text-white flex items-center justify-between border-b border-indigo-700">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight">{order.roPoNumber}</span>
              <ChannelBadge channel={order.channel} />
            </div>
            <div className="text-[11px] text-white/70 mt-0.5">
              Consignment Logistics & Appointment Operations
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs inside Drawer */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4">
          <button
            onClick={() => setActiveTab("edit")}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "edit"
                ? "border-violet-600 text-violet-700 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Logistics & Appointment Details</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "history"
                ? "border-violet-600 text-violet-700 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity History</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "edit" ? (
            <form onSubmit={handleSave} className="space-y-5">
              {/* SECTION 1: Order Information (Read-only reference) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-violet-600" />
                  <span>Order Information</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Warehouse:</span>{" "}
                    <span className="font-semibold text-slate-800">
                      {order.warehouseName || (order.client?.name ? order.client.name : "—")}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Order / Pickup Date:</span>{" "}
                    <span className="font-semibold text-slate-800">
                      {formatDateDisplay(order.pickupDate || order.orderDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Boxes:</span>{" "}
                    <span className="font-semibold text-slate-800">{order.boxCount ?? 1} boxes</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Box Dimensions:</span>{" "}
                    <span className="font-semibold text-slate-800">{order.boxDimensions || "—"}</span>
                  </div>
                </div>

                {/* Items preview if available */}
                {detailedOrder?.items && detailedOrder.items.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/70">
                    <span className="text-[11px] font-semibold text-slate-500">Consignment SKUs:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {detailedOrder.items.map((it) => (
                        <span
                          key={it.id}
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-700"
                        >
                          {it.itemName || "Item"} {it.totalQty ? `(${it.totalQty} pcs)` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: Courier & Tracking Information (Editable) */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-violet-600" />
                  <span>Carrier & Tracking Information</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Courier Partner
                    </label>
                    <select
                      value={courierPartner}
                      onChange={(e) => setCourierPartner(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      <option value="">Select courier partner...</option>
                      {courierPresets.map((cp) => (
                        <option key={cp.id} value={cp.name}>
                          {cp.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tracking ID / AWB Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. OML12345678"
                      value={trackingId}
                      onChange={(e) => setTrackingId(e.target.value)}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Custom Tracking URL (Optional Override)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      placeholder="https://..."
                      value={trackingLink}
                      onChange={(e) => setTrackingLink(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    {trackingLink && (
                      <a
                        href={trackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition shrink-0"
                        title="Open tracking page"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 3: Appointment Scheduling (Editable) */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-violet-600" />
                  <span>Appointment Scheduling</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Appointment Reference ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. APPT-2026-0982"
                      value={appointmentId}
                      onChange={(e) => setAppointmentId(e.target.value)}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Appointment Scheduled Date
                    </label>
                    <input
                      type="date"
                      value={appointmentDate}
                      onChange={(e) => setAppointmentDate(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Time Slot
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10:00 AM - 01:00 PM"
                      value={appointmentSlot}
                      onChange={(e) => setAppointmentSlot(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Delivery Date (When Delivered)
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: Shipment Status & Audit Remarks */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-violet-600" />
                  <span>Shipment Status & Remarks</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Shipment / Courier Status
                    </label>
                    <select
                      value={courierStatus}
                      onChange={(e) => setCourierStatus(e.target.value)}
                      className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      {availableStatuses.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Current Milestone Badge
                    </label>
                    <div className="pt-1.5">
                      <StatusBadge status={courierStatus} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Logistics Operational Notes / Comment
                  </label>
                  <textarea
                    rows={2}
                    placeholder="General operational logistics remarks for this shipment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status Change Reason (Recorded into Audit History)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Consignment handed over to carrier / Pod verified"
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-md hover:shadow-lg transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* SECTION 5: Activity History Timeline */
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                <span>Consignment Activity Timeline</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  Recorded in OrderStatusHistory & AuditLog
                </span>
              </div>

              {isLoadingDetails ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading audit trail...</div>
              ) : detailedOrder?.statusHistory && detailedOrder.statusHistory.length > 0 ? (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {detailedOrder.statusHistory.map((item) => (
                    <div key={item.id} className="relative text-xs">
                      <div className="absolute -left-6 top-0.5 w-3 h-3 rounded-full bg-violet-600 ring-4 ring-white" />
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {item.fromStatus ? `${item.fromStatus} ➔ ${item.toStatus}` : item.toStatus}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatDateTimeDisplay(item.timestamp)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">
                          {item.reason || "Status updated"}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                          <span>Updated by:</span>
                          <span className="font-semibold text-slate-700">
                            {item.userName || "System"}
                          </span>
                          {item.userRole && <span>({item.userRole})</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No status transition history recorded yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
