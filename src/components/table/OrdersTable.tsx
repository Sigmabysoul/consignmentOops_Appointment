"use client";

import { DateInput } from "@/components/ui/DateInput";
import { getOrderTone } from "@/lib/order-tone";
import React, { useState } from "react";
import {
  ExternalLink,
  Edit2,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Truck,
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
import { MarkDeliveredModal } from "@/components/delivery/MarkDeliveredModal";
import { hasPodOnRecord } from "@/lib/pod";
import {
  APP2_COURIER_MILESTONES,
  isClosedOrder,
  isDeliveredOrder,
  isOnAppointmentDesk,
} from "@/lib/order-filters";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
import { isFlipkartFbfOrFksb, getAllowedCouriersForChannel, isSameCourier } from "@/lib/courier-defaults";

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

  // Delivered needs a POD: choosing "Delivered" opens the POD form (POST /api/orders/[id]/deliver)
  const [deliverOrder, setDeliverOrder] = useState<AppointmentOrder | null>(null);

  // Private Personal Note Quick Editor Modal State
  const [activeNoteModal, setActiveNoteModal] = useState<{
    order: AppointmentOrder;
    noteText: string;
  } | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Value each inline edit started from: an unchanged value is never sent back to the server
  const [inlineInitial, setInlineInitial] = useState<string>("");

  const startInlineEdit = (order: AppointmentOrder, field: string, currentValue: string | null) => {
    let initialVal = currentValue || "";
    if (field === "appointmentDate" || field === "deliveryDate") {
      initialVal = formatDateInputValue(currentValue);
    }
    setInlineInitial(initialVal);
    setInlineEditing({
      orderId: order.id,
      field,
      value: initialVal,
    });
  };

  const cancelInlineEdit = () => {
    setInlineEditing(null);
  };

  const saveInlineEdit = async () => {
    if (!inlineEditing) return;

    const unchanged =
      inlineEditing.field === "courierPartner"
        ? isSameCourier(inlineEditing.value, inlineInitial)
        : inlineEditing.value.trim() === inlineInitial.trim();
    if (unchanged) {
      setInlineEditing(null);
      return;
    }

    // Delivered is never a plain status change: it needs the POD upload
    if (inlineEditing.field === "courierStatus" && inlineEditing.value === "Delivered") {
      const ord = orders.find((o) => o.id === inlineEditing.orderId);
      setInlineEditing(null);
      if (ord) setDeliverOrder(ord);
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

  // Filter options (read-only): every milestone an order can carry, whoever set it
  const availableStatuses = [
    "Pending",
    "Tracking Assigned",
    "In Transit",
    "Appointment Scheduled",
    "Delivered",
    "GRN Issue",
    "Cancelled",
  ];
  // Milestones this desk may write (courierStatus only); "Delivered" opens the POD form
  const editableMilestones: string[] = [...APP2_COURIER_MILESTONES];

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
      return <ArrowUpDown className="w-3 h-3 text-slate-300 shrink-0" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-violet-600 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-violet-600 shrink-0" />
    );
  };

  const inlineInputClass =
    "rounded-md border border-violet-400 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20";
  const editIconClass =
    "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-violet-700 focus:opacity-100 group-hover/field:opacity-100";

  const renderEditActions = () => (
    <>
      <button
        onClick={saveInlineEdit}
        disabled={isSavingInline}
        title="Save"
        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={cancelInlineEdit}
        title="Cancel"
        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </>
  );

  const renderSortableTh = (field: string, label: string, extraClass = "") => (
    <th
      onClick={() => onSortChange(field)}
      className={`ui-th cursor-pointer whitespace-nowrap transition hover:text-slate-800 ${extraClass}`}
    >
      <div className={`flex items-center gap-1 ${extraClass.includes("text-center") ? "justify-center" : ""}`}>
        <span>{label}</span>
        {renderSortIndicator(field)}
      </div>
    </th>
  );

  return (
    <div className="ui-card flex flex-col overflow-hidden">
      {/* ── Table toolbar (search, quick dates, sorting, filters) ── */}
      {includeToolbar && (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3">
          {/* Row 1: search & primary dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[260px] flex-1 sm:min-w-[320px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search RO/PO, AWB / tracking, warehouse, SKU, client..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="ui-input pl-8 pr-8"
              />
              {searchTerm && (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-slate-400 hover:text-slate-600"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Warehouse filter */}
            {onWarehouseChange && (
              <select
                value={selectedWarehouse}
                onChange={(e) => onWarehouseChange(e.target.value)}
                className="ui-select w-auto max-w-[180px] truncate"
                title="Filter by destination warehouse"
              >
                <option value="ALL">All warehouses</option>
                {warehouses.map((wh) => (
                  <option key={wh} value={wh}>
                    {wh}
                  </option>
                ))}
              </select>
            )}

            {/* Courier partner filter */}
            <select
              value={selectedCourier}
              onChange={(e) => onCourierChange(e.target.value)}
              className="ui-select w-auto max-w-[170px] truncate"
              title="Filter by carrier"
            >
              <option value="ALL">All couriers</option>
              {courierPresets.map((cp) => (
                <option key={cp.id} value={cp.name}>
                  {cp.name}
                </option>
              ))}
            </select>

            {/* Shipment status filter */}
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="ui-select w-auto"
            >
              <option value="ALL">All shipment statuses</option>
              {availableStatuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {/* Delivery state filter */}
            {onDeliveryStatusChange && (
              <select
                value={selectedDeliveryStatus}
                onChange={(e) => onDeliveryStatusChange(e.target.value)}
                className="ui-select w-auto"
              >
                <option value="ALL">All delivery states</option>
                <option value="DELIVERED">Delivered only</option>
                <option value="IN_TRANSIT">In transit only</option>
                <option value="PENDING">Pending delivery</option>
              </select>
            )}

            {/* Reset filters */}
            {isAnyFilterActive && onResetFilters && (
              <button
                onClick={onResetFilters}
                className="ui-btn-ghost"
                title="Clear all active search and filter parameters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Row 2: quick dates, sort & date range */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {onQuickDateChange && (
              <div className="ui-segment overflow-x-auto scrollbar-none">
                {[
                  { id: "all", label: "All dates" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "today", label: "Today" },
                  { id: "tomorrow", label: "Tomorrow" },
                  { id: "this_week", label: "This week" },
                  { id: "overdue", label: "Past due" },
                ].map((pill) => {
                  const isActive = quickDate === pill.id;
                  return (
                    <button
                      key={pill.id}
                      onClick={() => onQuickDateChange(pill.id)}
                      className={`ui-segment-item ${isActive ? "ui-segment-item-active" : ""}`}
                    >
                      {pill.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {/* Sort options */}
              <div className="flex items-center gap-1.5">
                <span className="ui-muted">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => onSortChange(e.target.value)}
                  className="ui-select w-auto py-1 text-xs"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onSortDirToggle ? onSortDirToggle : () => onSortChange(sortBy)}
                  className="ui-icon-btn h-7 w-7 border border-slate-200 bg-white"
                  title={`Sort ${sortDir === "asc" ? "Ascending" : "Descending"} (Click to flip)`}
                >
                  {sortDir === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5 text-violet-600" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-violet-600" />
                  )}
                </button>
              </div>

              {/* Custom date range */}
              {onDateTypeChange && onStartDateChange && onEndDateChange && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <DateInput
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    className="ui-input w-auto py-1 text-xs"
                    title="From Date"
                  />
                  <span className="ui-muted">to</span>
                  <DateInput
                    value={endDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    className="ui-input w-auto py-1 text-xs"
                    title="To Date"
                  />
                  {(startDate || endDate) && (
                    <button
                      onClick={() => {
                        onStartDateChange("");
                        onEndDateChange("");
                      }}
                      className="ui-btn-ghost ui-btn-sm"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Rows per page */}
              {onPageSizeChange && (
                <div className="flex items-center gap-1.5">
                  <span className="ui-muted">Rows</span>
                  <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
                    className="ui-select w-auto py-1 text-xs"
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

      {/* ── Orders sheet ── */}
      <div className="relative min-h-[380px] overflow-x-auto">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <span>Refreshing consignments…</span>
            </div>
          </div>
        )}

        <table className="ui-table text-xs">
          <thead>
            <tr className="select-none">
              {renderSortableTh("roPoNumber", "RO / PO")}
              {renderSortableTh("orderDate", "Order date")}
              <th className="ui-th whitespace-nowrap">Platform</th>
              {renderSortableTh("warehouseName", "Destination")}
              {renderSortableTh("pickupDate", "Pickup")}
              {renderSortableTh("boxCount", "Boxes")}
              {renderSortableTh("courierPartner", "Courier")}
              {renderSortableTh("trackingId", "Tracking / AWB")}
              {renderSortableTh("appointmentId", "Appt. ID")}
              {renderSortableTh("appointmentDate", "Appointment & slot")}
              {renderSortableTh("courierStatus", "Shipment status")}
              {renderSortableTh("deliveryDate", "Delivery")}
              {/* Private internal note column */}
              <th className="ui-th whitespace-nowrap">
                <div className="flex items-center gap-1" title="Private note visible only to Appointment Desk">
                  <Lock className="h-3 w-3 text-amber-600" />
                  <span>Private note</span>
                </div>
              </th>
              {renderSortableTh("updatedAt", "Last updated")}
              <th className="ui-th whitespace-nowrap text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={15}>
                  <div className="ui-empty">
                    <Truck className="h-8 w-8 stroke-[1.5] text-slate-300" />
                    <p className="font-medium text-slate-700">No consignment orders match your criteria</p>
                    <p className="ui-muted">
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

                // Delivered only from the status written with the POD; a deliveryDate alone is not Delivered
                const isDelivered = isDeliveredOrder(order);
                const canDeliver = isOnAppointmentDesk(order);
                const canCorrectDeliveryDate = isDelivered && hasPodOnRecord(order.customData);
                const milestoneLocked = isClosedOrder(order);
                const destinationAddress =
                  (order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address;

                return (
                  <tr key={order.id} className="ui-tr group text-slate-800">
                    {/* RO / PO number — left edge in the order's stage colour (lib/order-tone.ts) */}
                    <td className="ui-td whitespace-nowrap" style={{ boxShadow: `inset 3px 0 0 ${getOrderTone(order as any).tone.accent}` }}>
                      <div className="flex flex-col">
                        <button
                          onClick={() => onOpenOrderDrawer(order)}
                          className="w-fit cursor-pointer font-mono font-semibold text-violet-700 hover:text-violet-900 hover:underline"
                        >
                          {order.roPoNumber}
                        </button>
                        {order.invoiceNo && (
                          <span className="ui-mono text-[11px] text-slate-400">
                            Inv {order.invoiceNo}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Order date */}
                    <td className="ui-td whitespace-nowrap tabular-nums text-slate-600">
                      {formatDateDisplay(order.orderDate)}
                    </td>

                    {/* Marketplace platform */}
                    <td className="ui-td whitespace-nowrap">
                      <ChannelBadge channel={order.channel} size="sm" />
                    </td>

                    {/* Destination warehouse */}
                    <td className="ui-td max-w-[200px]" title={order.warehouseName || order.client?.name || "—"}>
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate font-medium text-slate-900">
                          {order.warehouseName || "—"}
                        </span>
                        {destinationAddress && (
                          <span className="line-clamp-2 text-[11px] leading-snug text-slate-500" title={destinationAddress}>
                            {destinationAddress}
                          </span>
                        )}
                        {order.client?.name && (
                          <span className="flex items-center gap-1 truncate text-[11px] text-slate-500">
                            <Building className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="truncate">{order.client.name}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Pickup date */}
                    <td className="ui-td whitespace-nowrap tabular-nums text-slate-600">
                      {formatDateDisplay(order.pickupDate || order.orderDate)}
                    </td>

                    {/* Boxes & dimensions with 1-click copy */}
                    <td className="ui-td min-w-[210px]">
                      {order.boxDimensionGroups && order.boxDimensionGroups.length > 0 ? (
                        <BoxDimensionCopyHelper
                          groups={order.boxDimensionGroups}
                          compact={true}
                          orderNumber={order.roPoNumber}
                        />
                      ) : (
                        <span className="font-medium tabular-nums text-slate-700">
                          {order.boxCount ?? 1} box{(order.boxCount ?? 1) > 1 ? "es" : ""}
                        </span>
                      )}
                    </td>

                    {/* Courier partner (inline editable) */}
                    <td className="ui-td whitespace-nowrap">
                      {isEditingCourier ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className={inlineInputClass}
                            autoFocus
                          >
                            <option value="">Select courier...</option>
                            {/* A courier set in the main app that is not offered here (e.g. "Local") stays selectable as-is */}
                            {inlineInitial && !getAllowedCouriersForChannel(order.channel).includes(inlineInitial) && (
                              <option value={inlineInitial}>{inlineInitial}</option>
                            )}
                            {getAllowedCouriersForChannel(order.channel).map((courierName) => {
                              const isRec = isFlipkartFbfOrFksb(order.channel) && courierName === "Ekart";
                              return (
                                <option key={courierName} value={courierName}>
                                  {courierName}{isRec ? " (Recommended)" : ""}
                                </option>
                              );
                            })}
                          </select>
                          {renderEditActions()}
                        </div>
                      ) : (
                        <div className="group/field flex items-center gap-1">
                          <span className="font-medium text-slate-900">
                            {order.courierPartner || <span className="font-normal text-slate-400">Not set</span>}
                          </span>
                          <button
                            onClick={() => startInlineEdit(order, "courierPartner", order.courierPartner)}
                            className={editIconClass}
                            title="Edit courier partner"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Tracking ID & link (inline editable) */}
                    <td className="ui-td whitespace-nowrap">
                      {isEditingTracking ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            placeholder="Enter AWB"
                            className={`${inlineInputClass} w-32 font-mono`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          {renderEditActions()}
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
                            className={`${inlineInputClass} w-40`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          {renderEditActions()}
                        </div>
                      ) : (
                        <div className="group/field flex items-center gap-1">
                          {order.trackingId ? (
                            <span className="flex items-center gap-1">
                              <span className="ui-mono font-medium text-slate-900">{order.trackingId}</span>
                              {order.trackingLink && (
                                <a
                                  href={order.trackingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded p-0.5 text-violet-600 transition hover:text-violet-800"
                                  title="Track courier shipment in real-time"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Missing AWB
                            </span>
                          )}
                          <button
                            onClick={() => startInlineEdit(order, "trackingId", order.trackingId)}
                            className={editIconClass}
                            title="Edit tracking ID"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => startInlineEdit(order, "trackingLink", order.trackingLink)}
                            className={editIconClass}
                            title="Edit tracking URL"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Appointment ID (inline editable) */}
                    <td className="ui-td whitespace-nowrap">
                      {isEditingAppointmentId ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            placeholder="Appointment ID"
                            className={`${inlineInputClass} w-28 font-mono`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          {renderEditActions()}
                        </div>
                      ) : (
                        <div className="group/field flex items-center gap-1">
                          <span className="ui-mono text-slate-700">
                            {order.appointmentId || <span className="font-sans text-slate-400">None</span>}
                          </span>
                          <button
                            onClick={() =>
                              startInlineEdit(order, "appointmentId", order.appointmentId)
                            }
                            className={editIconClass}
                            title="Edit appointment ID"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Appointment date & slot (inline editable) */}
                    <td className="ui-td whitespace-nowrap">
                      {isEditingAppointmentDate ? (
                        <div className="flex items-center gap-1">
                          <DateInput
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className={inlineInputClass}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          {renderEditActions()}
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
                            className={`${inlineInputClass} w-36`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          {renderEditActions()}
                        </div>
                      ) : (
                        <div className="group/field flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="font-medium tabular-nums text-slate-900">
                              {order.appointmentDate ? (
                                formatDateDisplay(order.appointmentDate)
                              ) : (
                                <span className="font-normal text-slate-400">Not set</span>
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
                              className={editIconClass}
                              title="Edit appointment date"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>{order.appointmentSlot || "No slot"}</span>
                            <button
                              onClick={() =>
                                startInlineEdit(
                                  order,
                                  "appointmentSlot",
                                  order.appointmentSlot
                                )
                              }
                              className={editIconClass}
                              title="Edit appointment slot"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Shipment status (read-only badge; separate edit control) */}
                    <td className="ui-td whitespace-nowrap">
                      {isEditingStatus ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className={inlineInputClass}
                            autoFocus
                          >
                            {/* A milestone set elsewhere (e.g. In Transit from BoxTrace) is shown, not offered */}
                            {!editableMilestones.includes(inlineInitial) && (
                              <option value={inlineInitial} disabled>
                                {inlineInitial}
                              </option>
                            )}
                            {editableMilestones.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                            {canDeliver && <option value="Delivered">Delivered (upload POD)</option>}
                          </select>
                          {renderEditActions()}
                        </div>
                      ) : (
                        <div className="group/field flex items-center gap-1">
                          <StatusBadge status={order.courierStatus || "Pending"} size="sm" />
                          {!milestoneLocked && (
                            <button
                              onClick={() =>
                                startInlineEdit(
                                  order,
                                  "courierStatus",
                                  order.courierStatus || "Pending"
                                )
                              }
                              className={editIconClass}
                              title="Change shipment status"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Delivery date (inline editable) */}
                    <td className="ui-td whitespace-nowrap">
                      {isEditingDeliveryDate ? (
                        <div className="flex items-center gap-1">
                          <DateInput
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            className={inlineInputClass}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          {renderEditActions()}
                        </div>
                      ) : (
                        <div className="group/field flex items-center gap-1">
                          <div className="flex flex-col">
                            <span className={`font-medium ${isDelivered ? "text-emerald-700" : "text-slate-500"}`}>
                              {isDelivered ? "Delivered" : "In transit / pending"}
                            </span>
                            {order.deliveryDate && (
                              <span className="text-[11px] tabular-nums text-slate-500">
                                {formatDateDisplay(order.deliveryDate)}
                              </span>
                            )}
                          </div>
                          {/* Set by Mark Delivered (POD); only a Delivered order's date can be corrected here */}
                          {canCorrectDeliveryDate && (
                            <button
                              onClick={() =>
                                startInlineEdit(order, "deliveryDate", order.deliveryDate)
                              }
                              className={editIconClass}
                              title="Correct delivery date"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Private desk note (strictly isolated to the Appointment app) */}
                    <td className="ui-td max-w-[200px]">
                      {order.personalNote ? (
                        <button
                          type="button"
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
                          className="group/note flex w-full cursor-pointer items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-left text-[11px] text-amber-950 transition hover:border-amber-300 hover:bg-amber-100"
                          title="Click to view/edit private note (Hidden from Consignment)"
                        >
                          <Lock className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                          <span className="flex-1 truncate">{order.personalNote}</span>
                          <Edit2 className="mt-0.5 h-3 w-3 shrink-0 text-amber-500 opacity-0 group-hover/note:opacity-100" />
                        </button>
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
                          className="ui-btn-ghost ui-btn-sm font-medium text-slate-400 hover:text-amber-700"
                          title="Add private note (visible only to Appointment team)"
                        >
                          <StickyNote className="h-3.5 w-3.5" />
                          <span>Add note</span>
                        </button>
                      )}
                    </td>

                    {/* Last updated */}
                    <td className="ui-td whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                          <span>{order.lastUpdatedBy || "System"}</span>
                        </span>
                        <span className="text-[11px] tabular-nums text-slate-400">
                          {formatDateTimeDisplay(order.updatedAt)}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="ui-td whitespace-nowrap text-right">
                      <button onClick={() => onOpenOrderDrawer(order)} className="ui-btn-secondary ui-btn-sm">
                        <Eye className="h-3.5 w-3.5" />
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

      {/* ── Server-side pagination footer ── */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
        <div className="ui-muted tabular-nums">
          Showing <span className="font-semibold text-slate-900">{orders.length}</span> of{" "}
          <span className="font-semibold text-slate-900">{totalOrders}</span> consignments · page{" "}
          <span className="font-semibold text-slate-900">{page}</span> of{" "}
          <span className="font-semibold text-slate-900">{Math.max(1, totalPages)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="ui-btn-secondary"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </button>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="ui-btn-secondary"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Mark Delivered (POD mandatory) ── */}
      <MarkDeliveredModal
        key={deliverOrder?.id || "none"}
        order={deliverOrder}
        onClose={() => setDeliverOrder(null)}
        onDelivered={() => {
          setDeliverOrder(null);
          onOrderUpdated();
        }}
      />

      {/* ── Isolated personal note quick editor ── */}
      {activeNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4">
          <div className="ui-overlay" onClick={() => setActiveNoteModal(null)} />

          <div className="ui-dialog z-10 max-w-md">
            <div className="ui-dialog-header">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                  <Lock className="h-4 w-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Private note · <span className="font-mono">{activeNoteModal.order.roPoNumber}</span>
                  </h3>
                  <p className="text-[11px] text-amber-700">
                    Visible only to the Appointment desk — never sent to Consignment
                  </p>
                </div>
              </div>
              <button onClick={() => setActiveNoteModal(null)} className="ui-icon-btn" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="ui-label">Internal operational reminder / note</label>
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
                className="ui-input resize-none text-xs"
                autoFocus
              />
              <p className="ui-muted mt-1.5">
                This note is stored in dedicated isolated storage. Other applications and consignment portals cannot see it.
              </p>
            </div>

            <div className="ui-dialog-footer">
              {activeNoteModal.noteText ? (
                <button
                  type="button"
                  onClick={() =>
                    setActiveNoteModal({
                      ...activeNoteModal,
                      noteText: "",
                    })
                  }
                  className="ui-btn-danger"
                >
                  Clear note
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setActiveNoteModal(null)} className="ui-btn-ghost">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingNote}
                  onClick={savePersonalNote}
                  className="ui-btn-primary"
                >
                  {isSavingNote ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      <span>Save private note</span>
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
