"use client";

import { DateInput } from "@/components/ui/DateInput";
import React from "react";
import {
  Search,
  X,
  Truck,
  Building,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Calendar,
  Filter,
} from "lucide-react";
import { CourierPresetItem } from "@/lib/types";

export interface FilterToolbarProps {
  searchTerm: string;
  onSearchChange: (search: string) => void;
  selectedCourier: string;
  onCourierChange: (courier: string) => void;
  courierPresets: CourierPresetItem[];
  selectedWarehouse: string;
  onWarehouseChange: (warehouse: string) => void;
  warehouses: string[];
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedDeliveryStatus: string;
  onDeliveryStatusChange: (status: string) => void;
  quickDate: string;
  onQuickDateChange: (preset: string) => void;
  dateType: string;
  onDateTypeChange: (dt: string) => void;
  startDate: string;
  onStartDateChange: (d: string) => void;
  endDate: string;
  onEndDateChange: (d: string) => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSortChange: (field: string) => void;
  onSortDirToggle: () => void;
  onResetFilters: () => void;
}

export function FilterToolbar({
  searchTerm,
  onSearchChange,
  selectedCourier,
  onCourierChange,
  courierPresets,
  selectedWarehouse,
  onWarehouseChange,
  warehouses,
  selectedStatus,
  onStatusChange,
  selectedDeliveryStatus,
  onDeliveryStatusChange,
  quickDate,
  onQuickDateChange,
  dateType,
  onDateTypeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  sortBy,
  sortDir,
  onSortChange,
  onSortDirToggle,
  onResetFilters,
}: FilterToolbarProps) {
  const availableStatuses = [
    "Pending",
    "Tracking Assigned",
    "In Transit",
    "Appointment Scheduled",
    "Delivered",
    "GRN Issue",
  ];

  const sortOptions = [
    { value: "appointmentDate", label: "Appointment Date" },
    { value: "deliveryDate", label: "Delivery Date" },
    { value: "pickupDate", label: "Pickup Date" },
    { value: "orderDate", label: "Order Date" },
    { value: "createdAt", label: "Created Date" },
    { value: "roPoNumber", label: "RO / PO Number" },
    { value: "courierPartner", label: "Courier Partner" },
    { value: "warehouseName", label: "Destination / Warehouse" },
    { value: "trackingId", label: "Tracking ID / AWB" },
    { value: "courierStatus", label: "Shipment Status" },
    { value: "boxCount", label: "Box Count" },
  ];

  const isAnyFilterActive =
    searchTerm !== "" ||
    selectedCourier !== "ALL" ||
    selectedWarehouse !== "ALL" ||
    selectedStatus !== "ALL" ||
    selectedDeliveryStatus !== "ALL" ||
    quickDate !== "all" ||
    startDate !== "" ||
    endDate !== "";

  // Compact field style shared by every filter control on this bar.
  const field =
    "h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 cursor-pointer";

  return (
    <div className="ui-card">
      {/* Row 1: search + filters */}
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search RO/PO, AWB / tracking, warehouse, SKU, item, invoice… (Ctrl+K)"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-slate-400 hover:text-slate-700"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <label className="relative flex items-center" title="Filter by destination warehouse">
          <Building className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
          <select value={selectedWarehouse} onChange={(e) => onWarehouseChange(e.target.value)} className={`${field} max-w-[190px] truncate pl-7`}>
            <option value="ALL">All warehouses ({warehouses.length})</option>
            {warehouses.map((wh) => (
              <option key={wh} value={wh}>
                {wh}
              </option>
            ))}
          </select>
        </label>

        <label className="relative flex items-center" title="Filter by carrier">
          <Truck className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
          <select value={selectedCourier} onChange={(e) => onCourierChange(e.target.value)} className={`${field} max-w-[180px] truncate pl-7`}>
            <option value="ALL">All couriers ({courierPresets.length})</option>
            {courierPresets.map((cp) => (
              <option key={cp.id} value={cp.name}>
                {cp.name}
              </option>
            ))}
          </select>
        </label>

        <select value={selectedStatus} onChange={(e) => onStatusChange(e.target.value)} className={field} title="Filter by shipment status">
          <option value="ALL">All shipment statuses</option>
          {availableStatuses.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <select value={selectedDeliveryStatus} onChange={(e) => onDeliveryStatusChange(e.target.value)} className={field} title="Filter by delivery outcome">
          <option value="ALL">All delivery states</option>
          <option value="DELIVERED">Delivered only</option>
          <option value="IN_TRANSIT">In transit only</option>
          <option value="PENDING">Pending delivery</option>
        </select>

        {isAnyFilterActive && (
          <button type="button" onClick={onResetFilters} className="ui-btn-ghost h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700" title="Clear all search and filters">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Row 2: quick dates · sort · date range */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <div className="ui-segment overflow-x-auto scrollbar-none" role="group" aria-label="Quick dates">
          {[
            { id: "all", label: "All dates" },
            { id: "yesterday", label: "Yesterday" },
            { id: "today", label: "Today" },
            { id: "tomorrow", label: "Tomorrow" },
            { id: "this_week", label: "This week" },
            { id: "overdue", label: "Past due" },
          ].map((pill) => {
            const active = quickDate === pill.id;
            return (
              <button
                type="button"
                key={pill.id}
                onClick={() => onQuickDateChange(pill.id)}
                aria-pressed={active}
                className={`ui-segment-item ${active ? "ui-segment-item-active" : ""} ${pill.id === "overdue" && active ? "text-rose-700" : ""}`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">Sort</span>
            <select value={sortBy} onChange={(e) => onSortChange(e.target.value)} className={field} title="Field to sort orders by">
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onSortDirToggle}
              className="ui-icon-btn h-8 w-8 border border-slate-200 bg-white shadow-sm"
              title={`Sorted ${sortDir === "asc" ? "ascending" : "descending"} (click to flip)`}
            >
              {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <select value={dateType} onChange={(e) => onDateTypeChange(e.target.value)} className={field} title="Which date the range filters on">
              <option value="pickupDate">Pickup date</option>
              <option value="appointmentDate">Appt date</option>
              <option value="deliveryDate">Delivery date</option>
              <option value="orderDate">Order date</option>
              <option value="createdAt">Created date</option>
            </select>
            <DateInput value={startDate} onChange={(e) => onStartDateChange(e.target.value)} className={`${field} cursor-text`} title="Start date filter" />
            <span className="text-xs text-slate-400">to</span>
            <DateInput value={endDate} onChange={(e) => onEndDateChange(e.target.value)} className={`${field} cursor-text`} title="End date filter" />
          </div>
        </div>
      </div>
    </div>
  );
}
