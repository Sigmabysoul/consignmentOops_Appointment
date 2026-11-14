"use client";

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
    "Cancelled",
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

  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden flex flex-col">
      <div className="p-3 sm:p-4 bg-slate-50 flex flex-col gap-3">
        {/* ROW 1: Search Bar & Primary Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative min-w-[260px] sm:min-w-[320px] flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search RO/PO, AWB / tracking, warehouse, SKU, item, invoice... (Ctrl+K)"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 text-slate-800 placeholder-slate-400 shadow-2xs font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Warehouse Filter */}
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedWarehouse}
              onChange={(e) => onWarehouseChange(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/30 max-w-[170px] truncate cursor-pointer shadow-2xs"
              title="Filter by destination warehouse"
            >
              <option value="ALL">All Warehouses ({warehouses.length})</option>
              {warehouses.map((wh) => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
          </div>

          {/* Courier Partner Filter */}
          <div className="flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedCourier}
              onChange={(e) => onCourierChange(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/30 max-w-[160px] truncate cursor-pointer shadow-2xs"
              title="Filter by carrier"
            >
              <option value="ALL">All Couriers ({courierPresets.length})</option>
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
            className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer shadow-2xs"
            title="Filter by shipment status"
          >
            <option value="ALL">All Shipment Statuses</option>
            {availableStatuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Delivery State Filter */}
          <select
            value={selectedDeliveryStatus}
            onChange={(e) => onDeliveryStatusChange(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer shadow-2xs"
            title="Filter by delivery outcome"
          >
            <option value="ALL">All Delivery States</option>
            <option value="DELIVERED">Delivered Only</option>
            <option value="IN_TRANSIT">In Transit Only</option>
            <option value="PENDING">Pending Delivery</option>
          </select>

          {/* Reset Filters Button */}
          {isAnyFilterActive && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition cursor-pointer shadow-2xs"
              title="Clear all active search and filter parameters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* ROW 2: Quick Date Presets, Sort Dropdown & Date Picker */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-300">
          {/* Quick Date Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              Quick Dates:
            </span>
            {[
              { id: "all", label: "All Dates" },
              { id: "yesterday", label: "Yesterday" },
              { id: "today", label: "Today's All" },
              { id: "tomorrow", label: "Tomorrow's All" },
              { id: "this_week", label: "This Week" },
              { id: "overdue", label: "Past Due" },
            ].map((pill) => {
              const isActive = quickDate === pill.id;
              return (
                <button
                  type="button"
                  key={pill.id}
                  onClick={() => onQuickDateChange(pill.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-violet-600 text-white shadow-xs"
                      : "bg-white text-slate-700 hover:text-slate-900 border border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Sorting and Custom Date Range */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Options */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-600">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium focus:outline-none cursor-pointer"
                title="Select field to sort orders by"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onSortDirToggle}
                className="p-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                title={`Sort ${sortDir === "asc" ? "Ascending" : "Descending"} (Click to flip)`}
              >
                {sortDir === "asc" ? (
                  <ArrowUp className="w-3.5 h-3.5 text-violet-600" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5 text-violet-600" />
                )}
              </button>
            </div>

            {/* Custom Date Range */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={dateType}
                onChange={(e) => onDateTypeChange(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 font-medium focus:outline-none"
              >
                <option value="pickupDate">Pickup Date</option>
                <option value="appointmentDate">Appt Date</option>
                <option value="deliveryDate">Delivery Date</option>
                <option value="orderDate">Order Date</option>
                <option value="createdAt">Created Date</option>
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                placeholder="dd/mm/yyyy"
                className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 focus:outline-none font-medium"
                title="Start date filter (dd/mm/yyyy)"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                placeholder="dd/mm/yyyy"
                className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 focus:outline-none font-medium"
                title="End date filter (dd/mm/yyyy)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

