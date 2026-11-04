"use client";

import React, { useState } from "react";
import {
  ExternalLink,
  Edit2,
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  Truck,
  Hash,
  AlertCircle,
  Check,
  X,
  Eye,
  Building,
  UserCheck,
} from "lucide-react";
import { AppointmentOrder, CourierPresetItem } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { formatDateDisplay, formatDateTimeDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";

interface OrdersTableProps {
  orders: AppointmentOrder[];
  isLoading: boolean;
  courierPresets: CourierPresetItem[];
  page: number;
  pageSize: number;
  totalOrders: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  searchTerm: string;
  onSearchChange: (search: string) => void;
  selectedChannel: string;
  onChannelChange: (channel: string) => void;
  selectedCourier: string;
  onCourierChange: (courier: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedDeliveryStatus?: string;
  onDeliveryStatusChange?: (status: string) => void;
  dateType?: string;
  onDateTypeChange?: (dt: string) => void;
  startDate?: string;
  onStartDateChange?: (d: string) => void;
  endDate?: string;
  onEndDateChange?: (d: string) => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSortChange: (field: string) => void;
  onOpenOrderDrawer: (order: AppointmentOrder) => void;
  onOrderUpdated: () => void;
}

export function OrdersTable({
  orders,
  isLoading,
  courierPresets,
  page,
  pageSize,
  totalOrders,
  totalPages,
  onPageChange,
  searchTerm,
  onSearchChange,
  selectedChannel,
  onChannelChange,
  selectedCourier,
  onCourierChange,
  selectedStatus,
  onStatusChange,
  selectedDeliveryStatus = "ALL",
  onDeliveryStatusChange,
  dateType = "appointmentDate",
  onDateTypeChange,
  startDate = "",
  onStartDateChange,
  endDate = "",
  onEndDateChange,
  sortBy,
  sortDir,
  onSortChange,
  onOpenOrderDrawer,
  onOrderUpdated,
}: OrdersTableProps) {
  const { showToast } = useToast();

  // Inline editing state: track orderId, field, and current input value
  const [inlineEditing, setInlineEditing] = useState<{
    orderId: string;
    field: string;
    value: string;
  } | null>(null);
  const [isSavingInline, setIsSavingInline] = useState(false);

  // Status Change Confirmation Dialog State
  const [confirmStatusModal, setConfirmStatusModal] = useState<{
    orderId: string;
    roPoNumber: string;
    newStatus: string;
  } | null>(null);

  const startInlineEdit = (order: AppointmentOrder, field: string, currentValue: string | null) => {
    let initialVal = currentValue || "";
    if (field === "appointmentDate" || field === "deliveryDate") {
      initialVal = formatDateInputValue(currentValue);
    }
    setInlineEditing({
      orderId: order.id,
      field,
      value: initialVal,
    });
  };

  const cancelInlineEdit = () => {
    setInlineEditing(null);
  };

  const executeStatusUpdate = async (orderId: string, newStatus: string) => {
    setIsSavingInline(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierStatus: newStatus,
          remarks: `Shipment status changed to ${newStatus} via inline desk table`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }

      showToast(`Status updated to "${newStatus}"`, "success");
      setConfirmStatusModal(null);
      setInlineEditing(null);
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to save status", "error");
    } finally {
      setIsSavingInline(false);
    }
  };

  const handleStatusSelectChange = (order: AppointmentOrder, newStatus: string) => {
    // Critical transitions require confirmation
    if (["Delivered", "Cancelled", "GRN Issue"].includes(newStatus)) {
      setConfirmStatusModal({
        orderId: order.id,
        roPoNumber: order.roPoNumber,
        newStatus,
      });
    } else {
      executeStatusUpdate(order.id, newStatus);
    }
  };

  const saveInlineEdit = async () => {
    if (!inlineEditing) return;

    // If editing courierStatus to critical, prompt confirmation
    if (
      inlineEditing.field === "courierStatus" &&
      ["Delivered", "Cancelled", "GRN Issue"].includes(inlineEditing.value)
    ) {
      const ord = orders.find((o) => o.id === inlineEditing.orderId);
      setConfirmStatusModal({
        orderId: inlineEditing.orderId,
        roPoNumber: ord?.roPoNumber || "Consignment",
        newStatus: inlineEditing.value,
      });
      return;
    }

    setIsSavingInline(true);
    try {
      const payload: Record<string, any> = {
        [inlineEditing.field]: inlineEditing.value,
      };

      const res = await fetch(`/api/orders/${inlineEditing.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update field");
      }

      showToast(`Updated ${inlineEditing.field} successfully`, "success");
      setInlineEditing(null);
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to save update", "error");
    } finally {
      setIsSavingInline(false);
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* ── Table Toolbar (Search & Filters) ── */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/70 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Main search and selectors */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Search Input */}
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search RO, tracking ID, appointment ID..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Marketplace Channel Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedChannel}
                onChange={(e) => onChannelChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="ALL">All Marketplaces</option>
                <option value="SWIGGY">Swiggy</option>
                <option value="BLINKIT_STO">Blinkit</option>
                <option value="FLIPKART_MINUTES">Flipkart Minutes</option>
                <option value="FLIPKART_FBF">Flipkart FBF</option>
                <option value="AMAZON_VC">Amazon VC</option>
                <option value="AMAZON_FBA">Amazon FBA</option>
              </select>
            </div>

            {/* Courier Filter */}
            <select
              value={selectedCourier}
              onChange={(e) => onCourierChange(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500 max-w-[140px] truncate"
            >
              <option value="ALL">All Couriers</option>
              {courierPresets.map((cp) => (
                <option key={cp.id} value={cp.name}>
                  {cp.name}
                </option>
              ))}
            </select>

            {/* Shipment Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="ALL">All Shipment Statuses</option>
              {availableStatuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {/* Delivery Status Filter */}
            {onDeliveryStatusChange && (
              <select
                value={selectedDeliveryStatus}
                onChange={(e) => onDeliveryStatusChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="ALL">All Delivery States</option>
                <option value="DELIVERED">Delivered Only</option>
                <option value="IN_TRANSIT">In Transit Only</option>
                <option value="PENDING">Pending Delivery</option>
              </select>
            )}
          </div>

          {/* Counter Summary */}
          <div className="text-xs text-slate-500 font-medium shrink-0">
            Showing <span className="font-bold text-slate-900">{orders.length}</span> of{" "}
            <span className="font-bold text-slate-900">{totalOrders}</span> consignments
          </div>
        </div>

        {/* Date Filter Row */}
        {onDateTypeChange && onStartDateChange && onEndDateChange && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 text-xs text-slate-600">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-violet-600" />
              <span>Date Filter:</span>
            </span>

            <select
              value={dateType}
              onChange={(e) => onDateTypeChange(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none"
            >
              <option value="appointmentDate">Appointment Date</option>
              <option value="pickupDate">Pickup Date</option>
              <option value="orderDate">Order Date</option>
              <option value="deliveryDate">Delivery Date</option>
              <option value="createdAt">Created Date</option>
            </select>

            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[11px]">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
              />
            </div>

            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[11px]">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
              />
            </div>

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  onStartDateChange("");
                  onEndDateChange("");
                }}
                className="text-[11px] text-violet-600 hover:text-violet-800 font-medium ml-1 cursor-pointer"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── High Density Spreadsheet Table ── */}
      <div className="overflow-x-auto relative min-h-[340px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-20">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Loading Logistics Records...</span>
            </div>
          </div>
        )}

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 select-none">
              <th
                onClick={() => onSortChange("roPoNumber")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>RO / PO</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange("orderDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Order Date</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap">Marketplace</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Client / Destination</th>
              <th
                onClick={() => onSortChange("pickupDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Pickup Date</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap text-center">Boxes</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Courier Partner</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Tracking / AWB</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Appointment ID</th>
              <th
                onClick={() => onSortChange("appointmentDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Appointment Date & Slot</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap">Shipment Status</th>
              <th
                onClick={() => onSortChange("deliveryDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Delivery Status</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => onSortChange("updatedAt")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Last Updated</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={14} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Truck className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                    <p className="font-semibold text-slate-600">No consignment orders match your filter</p>
                    <p className="text-[11px] text-slate-400">
                      Try clearing search queries or switching navigation tabs.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const isEditingTracking =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "trackingId";
                const isEditingCourier =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "courierPartner";
                const isEditingTrackingLink =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "trackingLink";
                const isEditingAppointmentId =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "appointmentId";
                const isEditingAppointmentDate =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "appointmentDate";
                const isEditingAppointmentSlot =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "appointmentSlot";
                const isEditingStatus =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "courierStatus";
                const isEditingDeliveryDate =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "deliveryDate";

                const isDelivered =
                  (order.courierStatus || "").toLowerCase() === "delivered" || !!order.deliveryDate;

                return (
                  <tr
                    key={order.id}
                    className="hover:bg-violet-50/30 transition-colors group text-slate-800"
                  >
                    {/* RO / PO Number */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onOpenOrderDrawer(order)}
                          className="font-bold text-violet-700 hover:text-violet-900 hover:underline cursor-pointer"
                        >
                          {order.roPoNumber}
                        </button>
                        {order.invoiceNo && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({order.invoiceNo})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Order Date */}
                    <td className="py-2 px-3 whitespace-nowrap text-slate-600 text-[11px]">
                      {formatDateDisplay(order.orderDate)}
                    </td>

                    {/* Marketplace */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <ChannelBadge channel={order.channel} />
                    </td>

                    {/* Client / Destination Warehouse */}
                    <td className="py-2 px-3 max-w-[170px]" title={order.warehouseName || order.client?.name || "—"}>
                      <div className="flex flex-col truncate">
                        <span className="font-medium text-slate-800 truncate">
                          {order.warehouseName || "—"}
                        </span>
                        {order.client?.name && (
                          <span className="text-[10px] text-slate-500 truncate flex items-center gap-0.5">
                            <Building className="w-2.5 h-2.5 shrink-0" />
                            <span>{order.client.name}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Pickup Date */}
                    <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                      {formatDateDisplay(order.pickupDate || order.orderDate)}
                    </td>

                    {/* Boxes */}
                    <td className="py-2 px-3 whitespace-nowrap text-center">
                      <span className="font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        {order.boxCount ?? 1}
                      </span>
                    </td>

                    {/* 1. Courier Partner (Inline Editable) */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isEditingCourier ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className="text-xs bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none"
                            autoFocus
                          >
                            <option value="">Select courier...</option>
                            {courierPresets.map((cp) => (
                              <option key={cp.id} value={cp.name}>
                                {cp.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group/field">
                          <span className="font-medium">
                            {order.courierPartner || <span className="text-slate-400 italic">Not set</span>}
                          </span>
                          <button
                            onClick={() => startInlineEdit(order, "courierPartner", order.courierPartner)}
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition cursor-pointer"
                            title="Edit courier partner"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 2 & 3. Tracking ID & Link (Inline Editable) */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isEditingTracking ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            placeholder="Enter AWB / Tracking ID"
                            className="text-xs bg-white border border-violet-400 rounded px-2 py-0.5 focus:outline-none w-32 font-mono"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : isEditingTrackingLink ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="url"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            placeholder="https://track..."
                            className="text-xs bg-white border border-violet-400 rounded px-2 py-0.5 focus:outline-none w-36"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/field">
                          {order.trackingId ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-medium text-slate-800">
                                {order.trackingId}
                              </span>
                              {order.trackingLink && (
                                <a
                                  href={order.trackingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-violet-600 hover:text-violet-800 p-0.5 rounded transition"
                                  title="Track courier shipment in real-time"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-amber-600 font-medium text-[11px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Missing AWB
                            </span>
                          )}
                          <button
                            onClick={() => startInlineEdit(order, "trackingId", order.trackingId)}
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition cursor-pointer"
                            title="Edit tracking ID"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => startInlineEdit(order, "trackingLink", order.trackingLink)}
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
                            title="Edit custom tracking URL"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 4. Appointment ID (Inline Editable) */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isEditingAppointmentId ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            placeholder="Appointment ID"
                            className="text-xs bg-white border border-violet-400 rounded px-2 py-0.5 focus:outline-none w-28 font-mono"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group/field">
                          <span className="font-mono text-slate-700">
                            {order.appointmentId || <span className="text-slate-400 italic">None</span>}
                          </span>
                          <button
                            onClick={() =>
                              startInlineEdit(order, "appointmentId", order.appointmentId)
                            }
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition cursor-pointer"
                            title="Edit appointment ID"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 5 & 6. Appointment Date & Slot (Inline Editable) */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isEditingAppointmentDate ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className="text-xs bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : isEditingAppointmentSlot ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="e.g. 10:00 AM - 1:00 PM"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className="text-xs bg-white border border-violet-400 rounded px-2 py-0.5 focus:outline-none w-32"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col group/field">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-slate-800">
                              {order.appointmentDate ? (
                                formatDateDisplay(order.appointmentDate)
                              ) : (
                                <span className="text-slate-400 italic font-normal">Not set</span>
                              )}
                            </span>
                            <button
                              onClick={() =>
                                startInlineEdit(
                                  order,
                                  "appointmentDate",
                                  order.appointmentDate
                                )
                              }
                              className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition cursor-pointer"
                              title="Edit appointment date"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                            <span>Slot: {order.appointmentSlot || "—"}</span>
                            <button
                              onClick={() =>
                                startInlineEdit(
                                  order,
                                  "appointmentSlot",
                                  order.appointmentSlot
                                )
                              }
                              className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition cursor-pointer"
                              title="Edit appointment slot"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 7. Courier / Shipment Status (Inline Editable with Confirm) */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isEditingStatus ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className="text-xs bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none"
                            autoFocus
                          >
                            {availableStatuses.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/field">
                          <StatusBadge status={order.courierStatus || "Pending"} size="sm" />
                          <button
                            onClick={() =>
                              startInlineEdit(
                                order,
                                "courierStatus",
                                order.courierStatus || "Pending"
                              )
                            }
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition cursor-pointer"
                            title="Change shipment status"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 8. Delivery Status & Date (Inline Editable) */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isEditingDeliveryDate ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className="text-xs bg-white border border-violet-400 rounded px-1.5 py-0.5 focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/field">
                          <div className="flex flex-col">
                            <span
                              className={`text-[11px] font-semibold ${
                                isDelivered ? "text-emerald-700" : "text-slate-600"
                              }`}
                            >
                              {isDelivered ? "Delivered" : "In Transit / Pending"}
                            </span>
                            {order.deliveryDate && (
                              <span className="text-[10px] text-slate-400">
                                {formatDateDisplay(order.deliveryDate)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              startInlineEdit(order, "deliveryDate", order.deliveryDate)
                            }
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition cursor-pointer"
                            title="Set or update delivery date"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Last Updated (By & Time) */}
                    <td className="py-2 px-3 whitespace-nowrap text-slate-500 text-[11px]">
                      <div className="flex flex-col">
                        <span className="text-slate-700 font-medium flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-slate-400" />
                          <span>{order.lastUpdatedBy || "System"}</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDateTimeDisplay(order.updatedAt)}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => onOpenOrderDrawer(order)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Server-Side Pagination Footer ── */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <div className="text-xs text-slate-500 font-medium">
          Page <span className="font-bold text-slate-900">{page}</span> of{" "}
          <span className="font-bold text-slate-900">{Math.max(1, totalPages)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Status Transition Confirmation Dialog ── */}
      {confirmStatusModal && (
        <ConfirmationDialog
          isOpen={true}
          title={`Confirm Shipment Status: ${confirmStatusModal.newStatus}`}
          message={`Are you sure you want to transition order "${confirmStatusModal.roPoNumber}" to "${confirmStatusModal.newStatus}"? This update will be recorded in the shared consignment database and audit logs.`}
          confirmLabel={`Mark as ${confirmStatusModal.newStatus}`}
          variant={
            confirmStatusModal.newStatus === "Cancelled"
              ? "danger"
              : confirmStatusModal.newStatus === "GRN Issue"
              ? "warning"
              : "primary"
          }
          isLoading={isSavingInline}
          onConfirm={() =>
            executeStatusUpdate(confirmStatusModal.orderId, confirmStatusModal.newStatus)
          }
          onCancel={() => setConfirmStatusModal(null)}
        />
      )}
    </div>
  );
}
