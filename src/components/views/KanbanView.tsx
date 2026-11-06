"use client";

import React, { useState } from "react";
import { AppointmentOrder } from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import {
  Clock,
  Truck,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Building,
  ExternalLink,
  Eye,
  ArrowRight,
  PackageCheck,
  Layers,
  Hash,
  Calendar,
} from "lucide-react";

interface KanbanViewProps {
  orders: AppointmentOrder[];
  isLoading: boolean;
  onOpenOrderDrawer: (order: AppointmentOrder) => void;
  onQuickNoteClick?: (order: AppointmentOrder) => void;
  onOrderUpdated?: () => void;
}

interface KanbanColumn {
  id: string;
  title: string;
  category: "remaining" | "gone" | "issue";
  icon: React.ReactNode;
  headerBg: string;
  badgeBg: string;
  filter: (order: AppointmentOrder) => boolean;
}

export function KanbanView({
  orders,
  isLoading,
  onOpenOrderDrawer,
  onQuickNoteClick,
  onOrderUpdated,
}: KanbanViewProps) {
  const { showToast } = useToast();
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);

  // Quick move status action
  const handleQuickStatusChange = async (
    order: AppointmentOrder,
    newStatus: string,
    extraData: Record<string, any> = {}
  ) => {
    setIsUpdatingId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          courierStatus: newStatus,
          ...extraData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      showToast(`Moved ${order.roPoNumber} to "${newStatus}"`, "success");
      onOrderUpdated?.();
    } catch (err: any) {
      showToast(err.message || "Failed to update status", "error");
    } finally {
      setIsUpdatingId(null);
    }
  };

  const columns: KanbanColumn[] = [
    {
      id: "remaining_pending",
      title: "1. Remaining (To Book)",
      category: "remaining",
      icon: <Clock className="w-4 h-4 text-amber-600" />,
      headerBg: "bg-amber-50/90 border-amber-200 text-amber-950",
      badgeBg: "bg-amber-200 text-amber-950 font-bold",
      filter: (o) => {
        const s = (o.status || o.courierStatus || "pending").toLowerCase();
        const isGone = s === "delivered" || s === "in transit" || s === "dispatched" || !!o.deliveryDate;
        const isBooked = !!o.trackingId || s === "tracking assigned" || s === "appointment scheduled";
        const isIssue = s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
        return !isGone && !isBooked && !isIssue;
      },
    },
    {
      id: "booked_ready",
      title: "2. Booked (CN / Scheduled)",
      category: "remaining",
      icon: <CalendarCheck className="w-4 h-4 text-blue-600" />,
      headerBg: "bg-blue-50/90 border-blue-200 text-blue-950",
      badgeBg: "bg-blue-200 text-blue-950 font-bold",
      filter: (o) => {
        const s = (o.status || o.courierStatus || "").toLowerCase();
        const isGone = s === "delivered" || s === "in transit" || s === "dispatched" || !!o.deliveryDate;
        const isIssue = s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
        const isBooked = (!!o.trackingId || !!o.appointmentDate || s === "tracking assigned" || s === "appointment scheduled");
        return !isGone && !isIssue && isBooked;
      },
    },
    {
      id: "in_transit_gone",
      title: "3. Gone (In Transit / Road)",
      category: "gone",
      icon: <Truck className="w-4 h-4 text-indigo-600" />,
      headerBg: "bg-indigo-50/90 border-indigo-200 text-indigo-950",
      badgeBg: "bg-indigo-200 text-indigo-950 font-bold",
      filter: (o) => {
        const s = (o.status || o.courierStatus || "").toLowerCase();
        const isDelivered = s === "delivered" || !!o.deliveryDate;
        const isIssue = s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
        return !isDelivered && !isIssue && (s === "in transit" || s === "dispatched" || s === "shipped");
      },
    },
    {
      id: "delivered_gone",
      title: "4. Delivered (Completed)",
      category: "gone",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
      headerBg: "bg-emerald-50/90 border-emerald-200 text-emerald-950",
      badgeBg: "bg-emerald-200 text-emerald-950 font-bold",
      filter: (o) => {
        const s = (o.status || o.courierStatus || "").toLowerCase();
        const isIssue = s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
        return !isIssue && (s === "delivered" || !!o.deliveryDate);
      },
    },
    {
      id: "grn_issue",
      title: "5. GRN Discrepancy",
      category: "issue",
      icon: <AlertTriangle className="w-4 h-4 text-rose-600" />,
      headerBg: "bg-rose-50/90 border-rose-200 text-rose-950",
      badgeBg: "bg-rose-200 text-rose-950 font-bold",
      filter: (o) => {
        const s = (o.status || o.courierStatus || "").toLowerCase();
        return s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
      },
    },
  ];

  // Calculate Gone vs Remaining summaries
  const remainingCount = orders.filter((o) => {
    const s = (o.status || o.courierStatus || "pending").toLowerCase();
    const isGone = s === "delivered" || s === "in transit" || s === "dispatched" || !!o.deliveryDate;
    const isIssue = s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
    return !isGone && !isIssue;
  }).length;

  const goneCount = orders.filter((o) => {
    const s = (o.status || o.courierStatus || "").toLowerCase();
    const isIssue = s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
    return !isIssue && (s === "delivered" || s === "in transit" || s === "dispatched" || !!o.deliveryDate);
  }).length;

  const issueCount = orders.filter((o) => {
    const s = (o.status || o.courierStatus || "").toLowerCase();
    return s === "grn issue" || (o.grnStatus || "").toLowerCase().includes("issue");
  }).length;

  if (isLoading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Organizing Gone vs Remaining Logistics Pipeline...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Gone vs Remaining Summary Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Metric 1: Remaining */}
        <div className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                📦 Remaining Shipments
              </div>
              <div className="text-xl font-black text-slate-900">
                {remainingCount}{" "}
                <span className="text-xs font-semibold text-slate-500">at warehouse</span>
              </div>
            </div>
          </div>
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
            Pending / Booked
          </span>
        </div>

        {/* Metric 2: Gone */}
        <div className="bg-white p-3.5 rounded-2xl border border-indigo-200 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Truck className="w-5 h-5 text-indigo-700" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                🚚 Shipments Gone
              </div>
              <div className="text-xl font-black text-slate-900">
                {goneCount}{" "}
                <span className="text-xs font-semibold text-slate-500">dispatched</span>
              </div>
            </div>
          </div>
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200">
            In Transit / Delivered
          </span>
        </div>

        {/* Metric 3: GRN Issues */}
        <div className="bg-white p-3.5 rounded-2xl border border-rose-200 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                ⚠️ GRN Issues
              </div>
              <div className="text-xl font-black text-slate-900">
                {issueCount}{" "}
                <span className="text-xs font-semibold text-slate-500">dock alerts</span>
              </div>
            </div>
          </div>
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-200">
            Requires Attention
          </span>
        </div>
      </div>

      {/* ── Main Kanban Columns ── */}
      <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-thin">
        {columns.map((col) => {
          const colOrders = orders.filter(col.filter);

          return (
            <div
              key={col.id}
              className="flex flex-col min-w-[290px] sm:min-w-[320px] max-w-[340px] flex-1 bg-slate-100/70 rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
            >
              {/* Column Header */}
              <div className={`p-3 border-b flex items-center justify-between ${col.headerBg}`}>
                <div className="flex items-center gap-2">
                  {col.icon}
                  <h3 className="font-extrabold text-xs">{col.title}</h3>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${col.badgeBg}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto max-h-[calc(100vh-280px)]">
                {colOrders.length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <p className="text-xs font-semibold">No orders in this stage</p>
                  </div>
                ) : (
                  colOrders.map((order) => {
                    const isBusy = isUpdatingId === order.id;

                    return (
                      <div
                        key={order.id}
                        className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs hover:shadow-md transition-all space-y-2.5 group relative"
                      >
                        {/* Row 1: Platform & RO/PO */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono font-black text-xs text-slate-900 group-hover:text-violet-600 transition-colors">
                              {order.roPoNumber}
                            </div>
                            <div className="mt-1">
                              <ChannelBadge channel={order.channel} size="sm" />
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {order.personalNote && (
                              <button
                                type="button"
                                onClick={() => onQuickNoteClick?.(order)}
                                className="p-1 rounded bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 cursor-pointer"
                                title={`Private note: ${order.personalNote}`}
                              >
                                <Lock className="w-3 h-3 text-amber-600" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onOpenOrderDrawer(order)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                              title="Inspect details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Row 2: Destination & Box Count */}
                        <div className="space-y-1 text-xs text-slate-600">
                          <div className="flex items-center gap-1 font-semibold truncate">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{order.warehouseName || "Destination Pending"}</span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                            <span className="flex items-center gap-1">
                              <Layers className="w-3 h-3 text-slate-400" />
                              <strong className="font-bold text-slate-800">
                                {order.boxCount || 1} Box{(order.boxCount || 1) > 1 ? "es" : ""}
                              </strong>
                              {order.boxDimensions ? ` (${order.boxDimensions})` : ""}
                            </span>

                            {order.courierPartner && (
                              <span className="font-bold text-violet-700 bg-violet-50 px-1.5 py-0.2 rounded">
                                {order.courierPartner}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Row 3: Priority Tracking Info based on Stage */}
                        <div className="pt-1.5 border-t border-slate-100 text-[11px] space-y-1">
                          {order.trackingId && (
                            <div className="flex items-center gap-1 text-indigo-900 font-mono font-bold bg-indigo-50/80 px-2 py-0.5 rounded">
                              <Hash className="w-3 h-3 text-indigo-600" />
                              <span>CN: {order.trackingId}</span>
                            </div>
                          )}

                          {order.appointmentDate && (
                            <div className="flex items-center gap-1 text-purple-900 font-semibold bg-purple-50/80 px-2 py-0.5 rounded">
                              <Calendar className="w-3 h-3 text-purple-600" />
                              <span>Appt: {formatDateDisplay(order.appointmentDate)}</span>
                              {order.appointmentSlot ? ` (${order.appointmentSlot})` : ""}
                            </div>
                          )}

                          {order.pickupDate && !order.appointmentDate && (
                            <div className="flex items-center gap-1 text-slate-600">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>Pickup: {formatDateDisplay(order.pickupDate)}</span>
                            </div>
                          )}

                          {col.id === "grn_issue" && (
                            <div className="text-[10px] font-semibold text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                              <strong>Discrepancy:</strong> {order.grnReport || order.comment || "Dock Issue"}
                            </div>
                          )}
                        </div>

                        {/* Row 4: Quick Action Pipeline Mover */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                          {/* Main App Link */}
                          <a
                            href={`http://localhost:3000?search=${encodeURIComponent(order.roPoNumber)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                            title="Open in Main Consignment Operations App"
                          >
                            <span>Consignment</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>

                          {/* Stage Transition Buttons */}
                          <div className="flex items-center gap-1">
                            {col.id === "remaining_pending" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickStatusChange(order, "Tracking Assigned")}
                                className="px-2 py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition cursor-pointer flex items-center gap-1"
                              >
                                <span>Booked</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}

                            {(col.id === "remaining_pending" || col.id === "booked_ready") && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  handleQuickStatusChange(order, "In Transit", {
                                    pickupDone: true,
                                    pickupDate: order.pickupDate || new Date().toISOString(),
                                  })
                                }
                                className="px-2 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded transition cursor-pointer flex items-center gap-1"
                              >
                                <span>Ship (Gone)</span>
                                <Truck className="w-2.5 h-2.5" />
                              </button>
                            )}

                            {col.id === "in_transit_gone" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  handleQuickStatusChange(order, "Delivered", {
                                    deliveryDate: new Date().toISOString(),
                                  })
                                }
                                className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Delivered</span>
                              </button>
                            )}

                            {col.id !== "grn_issue" && col.id !== "remaining_pending" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickStatusChange(order, "GRN Issue")}
                                className="px-1.5 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded transition cursor-pointer"
                                title="Report GRN discrepancy"
                              >
                                ⚠️
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
