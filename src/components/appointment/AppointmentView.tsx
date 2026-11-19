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

      {/* ── Appointment desk: one card per in-transit order ── */}
      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-300 py-16 text-center text-slate-400">
          <div className="flex flex-col items-center justify-center gap-2">
            <Calendar className="w-8 h-8 text-slate-300" />
            <p className="font-bold text-slate-600">No in-transit shipments</p>
            <p className="text-xs text-slate-400">Orders move to the appointment desk once they are in transit.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {orders.map((order) => {
            const isCopiedRo = copiedText === order.roPoNumber;
            const isCopiedCn = copiedText === (order.trackingId || "");
            const isEditingCn = editingCnOrderId === order.id;
            const isEditingDate = editingDateOrderId === order.id;
            const isDelivered = (order.status || "").toLowerCase() === "delivered" || (order.courierStatus || "").toLowerCase() === "delivered";
            const isGrnIssue = (order.status || "").toLowerCase().includes("issue") || (order.grnStatus || "").toLowerCase().includes("issue");
            const address = (order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address;
            const pod = getPodRecord(order.customData);

            return (
              <article
                key={order.id}
                className={`bg-white rounded-2xl border shadow-xs hover:shadow-sm transition flex flex-col text-slate-800 ${
                  isGrnIssue ? "border-rose-300" : isDelivered ? "border-emerald-300" : "border-slate-300 hover:border-indigo-300"
                }`}
              >
                {/* Header */}
                <header className="px-4 pt-3.5 pb-3 border-b border-slate-200 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-extrabold text-sm text-slate-900">{order.roPoNumber}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.roPoNumber, "RO/PO Number")}
                        title="Copy RO/PO Number"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      >
                        {isCopiedRo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <ChannelBadge channel={order.channel} size="sm" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600">
                      {order.courierPartner && (
                        <span className="font-semibold flex items-center gap-1">
                          <Truck className="w-3 h-3 text-slate-400" />
                          {order.courierPartner}
                        </span>
                      )}
                      {order.personalNote && (
                        <button
                          type="button"
                          onClick={() => onQuickNoteClick?.(order)}
                          className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 max-w-[220px] cursor-pointer hover:bg-amber-100"
                        >
                          <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                          <span className="truncate">{order.personalNote}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <StatusBadge status={order.status || order.courierStatus} size="sm" />
                    <DelhiveryTrackingTag order={order} />
                    <ShiprocketTrackingTag order={order} />
                  </div>
                </header>

                {/* CN · Appointment · Destination */}
                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-b border-slate-100">
                  {/* Consignment note (CN / docket) */}
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Hash className="w-3 h-3 text-indigo-500" /> CN / Docket
                    </div>
                    {isEditingCn ? (
                      <div className="mt-1 space-y-1">
                        <input
                          type="text"
                          value={cnVal}
                          onChange={(e) => setCnVal(e.target.value)}
                          placeholder="Enter CN / docket no."
                          className="w-full text-xs font-mono font-bold bg-white border border-indigo-400 rounded px-2 py-1 text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveCn(order.id);
                            if (e.key === "Escape") setEditingCnOrderId(null);
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleSaveCn(order.id)}
                            className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
                          >
                            Save
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
                      <div className="mt-0.5 space-y-0.5">
                        {order.trackingId ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-black text-sm text-indigo-900 truncate" title={order.trackingId}>
                              {order.trackingId}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(order.trackingId || "", "CN Number")}
                              title="Copy CN"
                              className="p-1 rounded text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 transition cursor-pointer"
                            >
                              {isCopiedCn ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <div className="font-bold text-sm text-rose-600">Missing</div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCnOrderId(order.id);
                              setCnVal(order.trackingId || "");
                            }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                          >
                            {order.trackingId ? "Edit" : "+ Enter CN"}
                          </button>
                          {order.trackingLink && (
                            <a
                              href={order.trackingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-indigo-600 hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> Track
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Appointment date & slot */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-purple-500" /> Appointment
                    </div>
                    {isEditingDate ? (
                      <div className="mt-1 space-y-1">
                        <DateInput
                          value={dateVal}
                          onChange={(e) => setDateVal(e.target.value)}
                          className="w-full text-xs bg-white border border-purple-300 rounded px-1.5 py-0.5 text-slate-800"
                        />
                        <input
                          type="text"
                          value={slotVal}
                          onChange={(e) => setSlotVal(e.target.value)}
                          placeholder="Slot, e.g. 10:00 - 13:00"
                          className="w-full text-xs bg-white border border-purple-300 rounded px-1.5 py-0.5 text-slate-800"
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleSaveAppointmentDate(order.id)}
                            className="px-2 py-0.5 text-[10px] font-bold bg-purple-600 text-white rounded hover:bg-purple-700 cursor-pointer disabled:opacity-50"
                          >
                            Save
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
                      <div className="mt-0.5 space-y-0.5">
                        <div className={`font-bold text-sm ${order.appointmentDate ? "text-purple-950" : "text-slate-400 italic font-semibold"}`}>
                          {order.appointmentDate ? formatDateDisplay(order.appointmentDate) : "Not set"}
                        </div>
                        {order.appointmentSlot && <div className="text-[11px] font-semibold text-purple-800">Slot {order.appointmentSlot}</div>}
                        {order.appointmentId && <div className="text-[10px] text-slate-500 font-mono">ID {order.appointmentId}</div>}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDateOrderId(order.id);
                            setDateVal(formatDateInputValue(order.appointmentDate));
                            setSlotVal(order.appointmentSlot || "");
                          }}
                          className="text-[10px] text-purple-700 hover:text-purple-900 font-bold cursor-pointer"
                        >
                          {order.appointmentDate ? "Edit" : "+ Set date & slot"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Destination */}
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Building className="w-3 h-3 text-slate-400" /> Destination
                    </div>
                    <div className="mt-0.5 font-bold text-slate-900 line-clamp-1" title={order.warehouseName || undefined}>
                      {order.warehouseName || "Destination pending"}
                    </div>
                    {address && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight" title={address}>
                        {address}
                      </p>
                    )}
                    {order.client?.name && <div className="text-[10px] text-slate-500 truncate">Client: {order.client.name}</div>}
                  </div>
                </div>

                {/* Delivery / GRN state */}
                {(isDelivered || isGrnIssue) && (
                  <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-3 text-[11px]">
                    {isDelivered && order.deliveryDate && (
                      <span className="font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Delivered {formatDateDisplay(order.deliveryDate)}
                      </span>
                    )}
                    {isDelivered && pod && (
                      <a href={podFileUrl(order.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-700 hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> View POD
                      </a>
                    )}
                    {isGrnIssue && (
                      <span className="font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                        GRN issue: {order.grnReport || order.comment || "discrepancy flagged"}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer actions */}
                <footer className="px-4 py-3 mt-auto flex flex-wrap items-center gap-2 justify-end">
                  {!isDelivered && (
                    <button
                      type="button"
                      onClick={() => handleMarkDelivered(order)}
                      title="Mark Delivered: upload the POD"
                      className="mr-auto px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Delivered</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenOrderDrawer(order)}
                    className="px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg cursor-pointer flex items-center gap-1"
                    title="Order details, documents and history"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Details & documents</span>
                  </button>
                  <a
                    href={`https://consignmentops.averretail.com/?search=${encodeURIComponent(order.roPoNumber)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in the Main Consignment App"
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalOrders > 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-700 bg-white">
          <div>
            Page <span className="font-bold text-slate-900">{page}</span> of <span className="font-bold text-slate-900">{totalPages}</span> ({totalOrders} appointments)
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
