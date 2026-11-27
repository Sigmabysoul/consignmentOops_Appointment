"use client";

import { DateInput } from "@/components/ui/DateInput";
import { getOrderTone } from "@/lib/order-tone";
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
  Copy,
  Check,
  Building,
  Edit2,
  ExternalLink,
  Truck,
  Lock,
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
      if (Array.isArray(data.warnings)) data.warnings.forEach((w: string) => showToast(w, "info"));
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
      <div className="ui-card flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />
          <span>Loading appointment manifest…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DelhiveryTrackingRefresh orders={orders} onRefreshed={onOrderUpdated} />
      <ShiprocketTrackingRefresh orders={orders} onRefreshed={onOrderUpdated} />

      {/* Appointment table */}
      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr className="select-none">
                <th className="ui-th whitespace-nowrap">Order</th>
                <th className="ui-th min-w-[190px] whitespace-nowrap">CN / docket #</th>
                <th className="ui-th min-w-[190px] whitespace-nowrap">Appointment</th>
                <th className="ui-th whitespace-nowrap">Destination</th>
                <th className="ui-th whitespace-nowrap">Status</th>
                <th className="ui-th min-w-[180px] whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="ui-empty">
                      <Calendar className="h-8 w-8 text-slate-300" />
                      <p className="font-medium text-slate-700">No in-transit shipments</p>
                      <p className="ui-muted">Orders move to the appointment desk once they are in transit.</p>
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
                  const address =
                    (order.customData as any)?.deliveredTo || (order.customData as any)?.warehouseAddress || order.client?.address;

                  return (
                    <tr key={order.id} className="ui-tr group text-slate-800">
                      {/* Order: RO / PO, channel, carrier, private note — stage colour edge */}
                      <td className="ui-td" style={{ boxShadow: `inset 3px 0 0 ${getOrderTone(order as any).tone.accent}` }}>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1">
                            <span className="ui-mono text-[13px] font-semibold text-slate-900">{order.roPoNumber}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(order.roPoNumber, "RO/PO Number")}
                              title="Copy RO/PO Number"
                              className="ui-icon-btn h-6 w-6"
                            >
                              {isCopiedRo ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>

                          <ChannelBadge channel={order.channel} size="sm" />

                          {order.courierPartner && (
                            <div className="flex items-center gap-1 text-xs text-slate-600">
                              <Truck className="h-3.5 w-3.5 text-slate-400" />
                              <span>{order.courierPartner}</span>
                            </div>
                          )}

                          {order.personalNote && (
                            <button
                              type="button"
                              onClick={() => onQuickNoteClick?.(order)}
                              className="flex max-w-[160px] cursor-pointer items-center gap-1 truncate rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
                            >
                              <Lock className="h-3 w-3 shrink-0 text-amber-600" />
                              <span className="truncate">{order.personalNote}</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Consignment note (CN / docket #) */}
                      <td className="ui-td">
                        {isEditingCn ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={cnVal}
                              onChange={(e) => setCnVal(e.target.value)}
                              placeholder="Enter CN / docket no."
                              className="ui-input ui-mono py-1 text-xs"
                              autoFocus
                            />
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => handleSaveCn(order.id)} className="ui-btn-primary ui-btn-sm">
                                Save CN
                              </button>
                              <button type="button" onClick={() => setEditingCnOrderId(null)} className="ui-btn-ghost ui-btn-sm">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {order.trackingId ? (
                                <div className="flex items-center gap-0.5">
                                  <span className="ui-mono text-[13px] font-medium text-slate-900">{order.trackingId}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(order.trackingId || "", "CN Number")}
                                    title="Copy Consignment Note (CN)"
                                    className="ui-icon-btn h-6 w-6"
                                  >
                                    {isCopiedCn ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-rose-600">CN missing</span>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCnOrderId(order.id);
                                  setCnVal(order.trackingId || "");
                                }}
                                className="ui-btn-ghost ui-btn-sm text-violet-700 hover:text-violet-800"
                              >
                                {order.trackingId ? (
                                  <>
                                    <Edit2 className="h-3 w-3" />
                                    <span>Edit</span>
                                  </>
                                ) : (
                                  <span>+ Enter CN</span>
                                )}
                              </button>
                            </div>

                            {/* Custom tracking link (only if manually provided by user) */}
                            {order.trackingLink && (
                              <a
                                href={order.trackingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex w-fit items-center gap-1 text-[11px] font-medium text-violet-700 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>Tracking link</span>
                              </a>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Appointment date & slot */}
                      <td className="ui-td">
                        {isEditingDate ? (
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <div>
                              <label className="ui-label">Date</label>
                              <DateInput
                                value={dateVal}
                                onChange={(e) => setDateVal(e.target.value)}
                                className="ui-input py-1 text-xs"
                              />
                            </div>

                            <div>
                              <label className="ui-label">Slot</label>
                              <input
                                type="text"
                                value={slotVal}
                                onChange={(e) => setSlotVal(e.target.value)}
                                placeholder="e.g. 10:00 - 13:00"
                                className="ui-input py-1 text-xs"
                              />
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveAppointmentDate(order.id)}
                                className="ui-btn-primary ui-btn-sm"
                              >
                                Save slot
                              </button>
                              <button type="button" onClick={() => setEditingDateOrderId(null)} className="ui-btn-ghost ui-btn-sm">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              {order.appointmentDate ? (
                                <span className="text-[13px] font-medium tabular-nums text-slate-900">
                                  {formatDateDisplay(order.appointmentDate)}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">Not set</span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDateOrderId(order.id);
                                  setDateVal(formatDateInputValue(order.appointmentDate));
                                  setSlotVal(order.appointmentSlot || "");
                                }}
                                className="ui-btn-ghost ui-btn-sm text-violet-700 hover:text-violet-800"
                              >
                                {order.appointmentDate ? (
                                  <>
                                    <Edit2 className="h-3 w-3" />
                                    <span>Edit</span>
                                  </>
                                ) : (
                                  <span>+ Set date</span>
                                )}
                              </button>
                            </div>

                            {order.appointmentSlot && (
                              <div className="text-xs text-slate-600">
                                <span className="text-slate-400">Slot</span> {order.appointmentSlot}
                              </div>
                            )}

                            {order.appointmentId && (
                              <div className="ui-mono text-[11px] text-slate-500">ID {order.appointmentId}</div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Destination */}
                      <td className="ui-td">
                        <div className="max-w-[220px] space-y-1">
                          <div className="flex items-start gap-1.5 text-xs font-medium text-slate-800">
                            <Building className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="line-clamp-2">{order.warehouseName || "Destination pending"}</span>
                          </div>

                          {address && (
                            <p className="line-clamp-2 pl-5 text-[11px] leading-snug text-slate-500" title={address}>
                              {address}
                            </p>
                          )}

                          {order.client?.name && (
                            <div className="truncate pl-5 text-[11px] text-slate-500">Client: {order.client.name}</div>
                          )}
                        </div>
                      </td>

                      {/* Status (read-only badges) */}
                      <td className="ui-td">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={order.status || order.courierStatus} size="sm" />
                          <DelhiveryTrackingTag order={order} />
                          <ShiprocketTrackingTag order={order} />

                          {isDelivered && order.deliveryDate && (
                            <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span className="tabular-nums">Delivered {formatDateDisplay(order.deliveryDate)}</span>
                            </div>
                          )}

                          {isDelivered && getPodRecord(order.customData) && (
                            <a
                              href={podFileUrl(order.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>View POD</span>
                            </a>
                          )}

                          {isGrnIssue && (
                            <div className="max-w-[200px] rounded-md border border-rose-200 bg-rose-50 px-1.5 py-1 text-[11px] text-rose-800">
                              <span className="font-semibold">GRN issue:</span> {order.grnReport || order.comment || "Discrepancy flagged"}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="ui-td text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {!isDelivered && (
                            <button
                              type="button"
                              onClick={() => handleMarkDelivered(order)}
                              title="Change status manually to Delivered"
                              className="ui-btn-success"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Mark delivered</span>
                            </button>
                          )}

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => onOpenOrderDrawer(order)}
                              className="ui-btn-ghost ui-btn-sm"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Details</span>
                            </button>

                            {/* Direct link to Main Consignment App */}
                            <a
                              href={`http://consignmentops.averretail.com?search=${encodeURIComponent(order.roPoNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Main Consignment Operations App"
                              className="ui-btn-ghost ui-btn-sm"
                            >
                              <span>Consignment</span>
                              <ExternalLink className="h-3 w-3" />
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

        {/* Pagination footer */}
        {totalOrders > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-600">
            <div className="tabular-nums">
              Page <span className="font-semibold text-slate-900">{page}</span> of{" "}
              <span className="font-semibold text-slate-900">{totalPages}</span>
              <span className="text-slate-400"> · </span>
              {totalOrders} appointments
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="ui-btn-secondary ui-btn-sm"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="ui-btn-secondary ui-btn-sm"
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
