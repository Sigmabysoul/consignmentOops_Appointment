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
  Lock,
  StickyNote,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import { AppointmentOrder, CourierPresetItem } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { formatDateDisplay, formatDateTimeDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
import { isFlipkartFbfOrFksb } from "@/lib/courier-defaults";

interface OrdersTableProps {
  orders: AppointmentOrder[];
  isLoading: boolean;
  courierPresets: CourierPresetItem[];
  warehouses?: string[];
  page: number;
  pageSize: number;
  totalOrders: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  searchTerm: string;
  onSearchChange: (search: string) => void;
  selectedChannel: string;
  onChannelChange: (channel: string) => void;
  selectedCourier: string;
  onCourierChange: (courier: string) => void;
  selectedWarehouse?: string;
  onWarehouseChange?: (warehouse: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedDeliveryStatus?: string;
  onDeliveryStatusChange?: (status: string) => void;
  quickDate?: string;
  onQuickDateChange?: (preset: string) => void;
  dateType?: string;
  onDateTypeChange?: (dt: string) => void;
  startDate?: string;
  onStartDateChange?: (d: string) => void;
  endDate?: string;
  onEndDateChange?: (d: string) => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSortChange: (field: string) => void;
  onSortDirToggle?: () => void;
  onOpenOrderDrawer: (order: AppointmentOrder) => void;
  onOrderUpdated: () => void;
  onResetFilters?: () => void;
  onQuickNoteClick?: (order: AppointmentOrder) => void;
  includeToolbar?: boolean;
}

export function OrdersTable({
  orders,
  isLoading,
  courierPresets,
  warehouses = [],
  page,
  pageSize,
  totalOrders,
  totalPages,
  onPageChange,
  onPageSizeChange,
  searchTerm,
  onSearchChange,
  selectedChannel,
  onChannelChange,
  selectedCourier,
  onCourierChange,
  selectedWarehouse = "ALL",
  onWarehouseChange,
  selectedStatus,
  onStatusChange,
  selectedDeliveryStatus = "ALL",
  onDeliveryStatusChange,
  quickDate = "all",
  onQuickDateChange,
  dateType = "appointmentDate",
  onDateTypeChange,
  startDate = "",
  onStartDateChange,
  endDate = "",
  onEndDateChange,
  sortBy,
  sortDir,
  onSortChange,
  onSortDirToggle,
  onOpenOrderDrawer,
  onOrderUpdated,
  onResetFilters,
  onQuickNoteClick,
  includeToolbar = false,
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

  // Private Personal Note Quick Editor Modal State
  const [activeNoteModal, setActiveNoteModal] = useState<{
    order: AppointmentOrder;
    noteText: string;
  } | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

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

  const saveInlineEdit = async () => {
    if (!inlineEditing) return;

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

  // Save isolated personal note
  const savePersonalNote = async () => {
    if (!activeNoteModal) return;

    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/orders/${activeNoteModal.order.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: activeNoteModal.noteText }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save private note");
      }

      showToast("Private note saved (isolated to Appointment desk)", "success");
      setActiveNoteModal(null);
      onOrderUpdated();
    } catch (err: any) {
      showToast(err.message || "Failed to save note", "error");
    } finally {
      setIsSavingNote(false);
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

  const sortOptions = [
    { value: "appointmentDate", label: "Appointment Date" },
    { value: "deliveryDate", label: "Delivery Date" },
    { value: "orderDate", label: "Order Date" },
    { value: "createdAt", label: "Created Date" },
    { value: "roPoNumber", label: "RO / PO Number" },
    { value: "courierPartner", label: "Courier Partner" },
    { value: "warehouseName", label: "Warehouse" },
    { value: "courierStatus", label: "Shipment Status" },
  ];

  const isAnyFilterActive =
    searchTerm !== "" ||
    selectedChannel !== "ALL" ||
    selectedCourier !== "ALL" ||
    selectedWarehouse !== "ALL" ||
    selectedStatus !== "ALL" ||
    selectedDeliveryStatus !== "ALL" ||
    quickDate !== "all" ||
    startDate !== "" ||
    endDate !== "";

  const renderSortIndicator = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-violet-600 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-violet-600 shrink-0" />
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden flex flex-col">
      {/* ── Table Toolbar (Search, Quick Dates, Sorting, Filters) ── */}
      {includeToolbar && (
        <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col gap-3">
        {/* ROW 1: Search Bar & Primary Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative min-w-[260px] sm:min-w-[320px] flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search RO/PO, AWB / tracking, warehouse, SKU, client..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 text-slate-800 placeholder-slate-400 shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Warehouse Filter */}
          {onWarehouseChange && (
            <div className="flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedWarehouse}
                onChange={(e) => onWarehouseChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/30 max-w-[170px] truncate cursor-pointer shadow-2xs"
                title="Filter by destination warehouse"
              >
                <option value="ALL">All Warehouses</option>
                {warehouses.map((wh) => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Courier Partner Filter */}
          <div className="flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedCourier}
              onChange={(e) => onCourierChange(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/30 max-w-[160px] truncate cursor-pointer shadow-2xs"
              title="Filter by carrier"
            >
              <option value="ALL">All Couriers</option>
              {courierPresets.map((cp) => (
                <option key={cp.id} value={cp.name}>
                  {cp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Shipment Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Shipment Statuses</option>
            {availableStatuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Delivery State Filter */}
          {onDeliveryStatusChange && (
            <select
              value={selectedDeliveryStatus}
              onChange={(e) => onDeliveryStatusChange(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Delivery States</option>
              <option value="DELIVERED">Delivered Only</option>
              <option value="IN_TRANSIT">In Transit Only</option>
              <option value="PENDING">Pending Delivery</option>
            </select>
          )}

          {/* Reset Filters Button */}
          {isAnyFilterActive && onResetFilters && (
            <button
              onClick={onResetFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
              title="Clear all active search and filter parameters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* ROW 2: Quick Date Presets, Sort Dropdown & Date Picker */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
          {/* Quick Date Pills */}
          {onQuickDateChange && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Quick Dates:
              </span>
              {[
                { id: "all", label: "All Dates" },
                { id: "today", label: "Today's All" },
                { id: "tomorrow", label: "Tomorrow's All" },
                { id: "this_week", label: "This Week" },
                { id: "overdue", label: "Past Due" },
              ].map((pill) => {
                const isActive = quickDate === pill.id;
                return (
                  <button
                    key={pill.id}
                    onClick={() => onQuickDateChange(pill.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-violet-600 text-white shadow-xs"
                        : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sorting and Custom Date Range */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Options */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-none"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={onSortDirToggle ? onSortDirToggle : () => onSortChange(sortBy)}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                title={`Sort ${sortDir === "asc" ? "Ascending" : "Descending"} (Click to flip)`}
              >
                {sortDir === "asc" ? (
                  <ArrowUp className="w-3.5 h-3.5 text-violet-600" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5 text-violet-600" />
                )}
              </button>
            </div>

            {/* Custom Date Range Picker */}
            {onDateTypeChange && onStartDateChange && onEndDateChange && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600 pl-2 border-l border-slate-200">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
                  title="From Date"
                />
                <span className="text-slate-400 text-[10px]">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
                  title="To Date"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => {
                      onStartDateChange("");
                      onEndDateChange("");
                    }}
                    className="text-[11px] text-violet-600 hover:text-violet-800 font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Rows Per Page */}
            {onPageSizeChange && (
              <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                <span className="text-[11px] text-slate-500">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── High Density Spreadsheet Table ── */}
      <div className="overflow-x-auto relative min-h-[380px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-20">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Refreshing Consignments...</span>
            </div>
          </div>
        )}

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b-2 border-slate-300 sticky top-0 z-10 select-none">
              <th
                onClick={() => onSortChange("roPoNumber")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>RO / PO</span>
                  {renderSortIndicator("roPoNumber")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("orderDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Order Date</span>
                  {renderSortIndicator("orderDate")}
                </div>
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap">Platform</th>
              <th
                onClick={() => onSortChange("warehouseName")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Destination / Warehouse</span>
                  {renderSortIndicator("warehouseName")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("pickupDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Pickup Date</span>
                  {renderSortIndicator("pickupDate")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("boxCount")}
                className="py-2.5 px-3 whitespace-nowrap text-center cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Boxes</span>
                  {renderSortIndicator("boxCount")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("courierPartner")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Courier Partner</span>
                  {renderSortIndicator("courierPartner")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("trackingId")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Tracking / AWB</span>
                  {renderSortIndicator("trackingId")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("appointmentId")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Appointment ID</span>
                  {renderSortIndicator("appointmentId")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("appointmentDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Appointment Date & Slot</span>
                  {renderSortIndicator("appointmentDate")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("courierStatus")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Shipment Status</span>
                  {renderSortIndicator("courierStatus")}
                </div>
              </th>
              <th
                onClick={() => onSortChange("deliveryDate")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Delivery Date</span>
                  {renderSortIndicator("deliveryDate")}
                </div>
              </th>
              {/* 🔒 PERSONAL INTERNAL NOTE COLUMN */}
              <th className="py-2.5 px-3 whitespace-nowrap bg-amber-50/60 text-amber-900 border-l border-amber-200/60">
                <div className="flex items-center gap-1" title="Private note visible only to Appointment Desk">
                  <Lock className="w-3 h-3 text-amber-600" />
                  <span>Private Note</span>
                </div>
              </th>
              <th
                onClick={() => onSortChange("updatedAt")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>Last Updated</span>
                  {renderSortIndicator("updatedAt")}
                </div>
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {orders.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={15} className="py-14 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Truck className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                    <p className="font-semibold text-slate-600">No consignment orders match your criteria</p>
                    <p className="text-[11px] text-slate-400">
                      Try clearing filters, searching for a different RO/AWB, or switching channels.
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
                    <td className="py-2.5 px-3 whitespace-nowrap">
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
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 text-[11px]">
                      {formatDateDisplay(order.orderDate)}
                    </td>

                    {/* Marketplace Platform */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <ChannelBadge channel={order.channel} />
                    </td>

                    {/* Destination Warehouse */}
                    <td
                      className="py-2.5 px-3 max-w-[180px]"
                      title={order.warehouseName || order.client?.name || "—"}
                    >
                      <div className="flex flex-col truncate">
                        <span className="font-medium text-slate-800 truncate">
                          {order.warehouseName || "—"}
                        </span>
                        {((order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address) && (
                          <span
                            className="text-[10px] text-slate-500 line-clamp-2 font-normal leading-tight"
                            title={((order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address)}
                          >
                            {((order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address)}
                          </span>
                        )}
                        {order.client?.name && (
                          <span className="text-[10px] text-slate-500 truncate flex items-center gap-0.5">
                            <Building className="w-2.5 h-2.5 shrink-0" />
                            <span>{order.client.name}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Pickup Date */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                      {formatDateDisplay(order.pickupDate || order.orderDate)}
                    </td>

                    {/* Boxes & Dimensions with 1-Click Copy */}
                    <td className="py-2.5 px-3 min-w-[190px]">
                      {order.boxDimensionGroups && order.boxDimensionGroups.length > 0 ? (
                        <BoxDimensionCopyHelper
                          groups={order.boxDimensionGroups}
                          compact={true}
                          orderNumber={order.roPoNumber}
                        />
                      ) : (
                        <span className="font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          {order.boxCount ?? 1} box{(order.boxCount ?? 1) > 1 ? "es" : ""}
                        </span>
                      )}
                    </td>

                    {/* Courier Partner (Inline Editable) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
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
                            {courierPresets.map((cp) => {
                              const isRec = isFlipkartFbfOrFksb(order.channel) && cp.name === "Ekart";
                              return (
                                <option key={cp.id} value={cp.name}>
                                  {cp.name}{isRec ? " (Recommended)" : ""}
                                </option>
                              );
                            })}
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

                    {/* Tracking ID & Link (Inline Editable) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {isEditingTracking ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            placeholder="Enter AWB"
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
                            title="Edit tracking URL"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Appointment ID (Inline Editable) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
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

                    {/* Appointment Date & Slot (Inline Editable) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
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

                    {/* Shipment Status (Inline Editable with Confirm) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
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

                    {/* Delivery Date (Inline Editable) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
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
                            title="Set delivery date"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 🔒 13. PRIVATE DESK NOTE (Strictly Isolated to Appointment App) */}
                    <td className="py-2.5 px-3 bg-amber-50/20 border-l border-amber-200/40 max-w-[200px]">
                      {order.personalNote ? (
                        <div
                          onClick={() => {
                            if (onQuickNoteClick) {
                              onQuickNoteClick(order);
                            } else {
                              setActiveNoteModal({
                                order,
                                noteText: order.personalNote || "",
                              });
                            }
                          }}
                          className="p-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-950 text-[11px] cursor-pointer hover:bg-amber-100/90 hover:border-amber-300 transition flex items-start gap-1 group/note"
                          title="Click to view/edit private note (Hidden from Consignment)"
                        >
                          <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                          <span className="truncate flex-1 font-medium">{order.personalNote}</span>
                          <Edit2 className="w-2.5 h-2.5 text-amber-500 opacity-0 group-hover/note:opacity-100 shrink-0 mt-0.5" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (onQuickNoteClick) {
                              onQuickNoteClick(order);
                            } else {
                              setActiveNoteModal({
                                order,
                                noteText: "",
                              });
                            }
                          }}
                          className="text-[11px] text-slate-400 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded-md border border-dashed border-slate-200 hover:border-amber-300 transition flex items-center gap-1 cursor-pointer"
                          title="Add private note (visible only to Appointment team)"
                        >
                          <Lock className="w-2.5 h-2.5" />
                          <span>+ Note</span>
                        </button>
                      )}
                    </td>

                    {/* Last Updated */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 text-[11px]">
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
                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
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
      <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-900">{orders.length}</span> of{" "}
          <span className="font-bold text-slate-900">{totalOrders}</span> consignments (Page{" "}
          <span className="font-bold text-slate-900">{page}</span> of{" "}
          <span className="font-bold text-slate-900">{Math.max(1, totalPages)}</span>)
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
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

      {/* ── 🔒 Isolated Personal Note Quick Editor Modal ── */}
      {activeNoteModal && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveNoteModal(null)}
          />

          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 z-10 animate-scale-in text-slate-800">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Private Note: {activeNoteModal.order.roPoNumber}
                  </h3>
                  <p className="text-[10px] text-amber-700 font-semibold">
                    🔒 Visible ONLY to Appointment Desk — Never sent to Consignment
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveNoteModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Note Textarea */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Internal Operational Reminder / Note
              </label>
              <textarea
                rows={4}
                value={activeNoteModal.noteText}
                onChange={(e) =>
                  setActiveNoteModal({
                    ...activeNoteModal,
                    noteText: e.target.value,
                  })
                }
                placeholder="Write personal notes about this order so you remember it (e.g. called driver Ramesh, gate pass number, dock 4 reserved, special handling required)..."
                className="w-full text-xs bg-amber-50/30 border border-amber-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white resize-none"
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-1">
                This note is stored in dedicated isolated storage. Other applications and consignment portals cannot see it.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {activeNoteModal.noteText && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveNoteModal({
                      ...activeNoteModal,
                      noteText: "",
                    })
                  }
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  Clear Note
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setActiveNoteModal(null)}
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingNote}
                  onClick={savePersonalNote}
                  className="px-4 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-xs hover:shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingNote ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" />
                      <span>Save Private Note</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
