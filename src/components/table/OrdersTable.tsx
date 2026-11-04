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
} from "lucide-react";
import { AppointmentOrder, CourierPresetItem } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { formatDateDisplay, formatDateTimeDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";

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
  sortBy,
  sortDir,
  onSortChange,
  onOpenOrderDrawer,
  onOrderUpdated,
}: OrdersTableProps) {
  const { showToast } = useToast();

  // Inline editing state: track orderId and field being edited
  const [inlineEditing, setInlineEditing] = useState<{
    orderId: string;
    field: string;
    value: string;
  } | null>(null);
  const [isSavingInline, setIsSavingInline] = useState(false);

  const startInlineEdit = (order: AppointmentOrder, field: string, currentValue: string | null) => {
    setInlineEditing({
      orderId: order.id,
      field,
      value: currentValue || "",
    });
  };

  const cancelInlineEdit = () => {
    setInlineEditing(null);
  };

  const saveInlineEdit = async () => {
    if (!inlineEditing) return;
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
      <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1">
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
            <Filter className="w-3.5 h-3.5 text-slate-400" />
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
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500 max-w-[150px] truncate"
          >
            <option value="ALL">All Couriers</option>
            {courierPresets.map((cp) => (
              <option key={cp.id} value={cp.name}>
                {cp.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            <option value="ALL">All Statuses</option>
            {availableStatuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* Counter Summary */}
        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-900">{orders.length}</span> of{" "}
          <span className="font-bold text-slate-900">{totalOrders}</span> consignments
        </div>
      </div>

      {/* ── High Density Spreadsheet Table ── */}
      <div className="overflow-x-auto relative min-h-[300px]">
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
            <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 select-none">
              <th
                onClick={() => onSortChange("roPoNumber")}
                className="py-2.5 px-3 whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition"
              >
                <div className="flex items-center gap-1">
                  <span>RO / PO Number</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap">Marketplace</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Warehouse Destination</th>
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
                <td colSpan={12} className="py-12 text-center text-slate-400">
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
                const isEditingAppointment =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "appointmentId";
                const isEditingStatus =
                  inlineEditing?.orderId === order.id && inlineEditing?.field === "courierStatus";

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

                    {/* Marketplace */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <ChannelBadge channel={order.channel} />
                    </td>

                    {/* Destination Warehouse */}
                    <td className="py-2 px-3 max-w-[160px] truncate" title={order.warehouseName || "—"}>
                      <span className="font-medium text-slate-700">
                        {order.warehouseName || (order.client?.name ? order.client.name : "—")}
                      </span>
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

                    {/* Courier Partner */}
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
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
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
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition"
                            title="Edit courier partner"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Tracking ID & Clickable Link */}
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
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
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
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition"
                            title="Edit tracking ID"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Appointment ID */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isEditingAppointment ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={inlineEditing.value}
                            onChange={(e) =>
                              setInlineEditing({ ...inlineEditing, value: e.target.value })
                            }
                            placeholder="Appointment ID"
                            className="text-xs bg-white border border-violet-400 rounded px-2 py-0.5 focus:outline-none w-28"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveInlineEdit();
                              if (e.key === "Escape") cancelInlineEdit();
                            }}
                          />
                          <button
                            onClick={saveInlineEdit}
                            disabled={isSavingInline}
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
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
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition"
                            title="Edit appointment ID"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Appointment Date & Slot */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {order.appointmentDate ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">
                            {formatDateDisplay(order.appointmentDate)}
                          </span>
                          {order.appointmentSlot && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              Slot: {order.appointmentSlot}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not scheduled</span>
                      )}
                    </td>

                    {/* Courier / Shipment Status */}
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
                            className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
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
                            className="opacity-0 group-hover/field:opacity-100 p-0.5 text-slate-400 hover:text-violet-600 rounded transition"
                            title="Change shipment status"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Last Updated */}
                    <td className="py-2 px-3 whitespace-nowrap text-slate-500 text-[11px]">
                      {formatDateTimeDisplay(order.updatedAt)}
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
      <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <div className="text-xs text-slate-500 font-medium">
          Page <span className="font-bold text-slate-900">{page}</span> of{" "}
          <span className="font-bold text-slate-900">{Math.max(1, totalPages)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
