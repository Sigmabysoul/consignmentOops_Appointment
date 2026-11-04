"use client";

import React from "react";
import { AppointmentOrder } from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay } from "@/lib/date-utils";
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
} from "lucide-react";

interface KanbanViewProps {
  orders: AppointmentOrder[];
  isLoading: boolean;
  onOpenOrderDrawer: (order: AppointmentOrder) => void;
  onQuickNoteClick?: (order: AppointmentOrder) => void;
}

interface KanbanColumn {
  id: string;
  title: string;
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
}: KanbanViewProps) {
  const columns: KanbanColumn[] = [
    {
      id: "pending",
      title: "Pending Dispatch",
      icon: <Clock className="w-4 h-4 text-slate-500" />,
      headerBg: "bg-slate-100 border-slate-300 text-slate-800",
      badgeBg: "bg-slate-200 text-slate-800",
      filter: (o) => {
        const s = (o.courierStatus || "pending").toLowerCase();
        return s === "pending" || s === "draft" || s === "new";
      },
    },
    {
      id: "tracking_assigned",
      title: "Tracking Assigned",
      icon: <Truck className="w-4 h-4 text-blue-500" />,
      headerBg: "bg-blue-50 border-blue-200 text-blue-900",
      badgeBg: "bg-blue-200 text-blue-900",
      filter: (o) => (o.courierStatus || "").toLowerCase() === "tracking assigned",
    },
    {
      id: "in_transit",
      title: "In Transit",
      icon: <Truck className="w-4 h-4 text-indigo-500" />,
      headerBg: "bg-indigo-50 border-indigo-200 text-indigo-900",
      badgeBg: "bg-indigo-200 text-indigo-900",
      filter: (o) => (o.courierStatus || "").toLowerCase() === "in transit",
    },
    {
      id: "appointment_scheduled",
      title: "Appointment Booked",
      icon: <CalendarCheck className="w-4 h-4 text-purple-500" />,
      headerBg: "bg-purple-50 border-purple-200 text-purple-900",
      badgeBg: "bg-purple-200 text-purple-900",
      filter: (o) => {
        const s = (o.courierStatus || "").toLowerCase();
        return s === "appointment scheduled" || (!!o.appointmentDate && s !== "delivered");
      },
    },
    {
      id: "delivered",
      title: "Delivered",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      headerBg: "bg-emerald-50 border-emerald-200 text-emerald-900",
      badgeBg: "bg-emerald-200 text-emerald-900",
      filter: (o) => (o.courierStatus || "").toLowerCase() === "delivered" || !!o.deliveryDate,
    },
    {
      id: "grn_issue",
      title: "GRN Discrepancy",
      icon: <AlertTriangle className="w-4 h-4 text-rose-500" />,
      headerBg: "bg-rose-50 border-rose-200 text-rose-900",
      badgeBg: "bg-rose-200 text-rose-900",
      filter: (o) =>
        (o.courierStatus || "").toLowerCase() === "grn issue" ||
        (o.grnStatus || "").toLowerCase().includes("issue"),
    },
  ];

  if (isLoading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Organizing Logistics Pipeline...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-thin">
      {columns.map((col) => {
        const colOrders = orders.filter(col.filter);

        return (
          <div
            key={col.id}
            className="flex flex-col min-w-[280px] sm:min-w-[310px] max-w-[330px] flex-1 bg-slate-100/70 rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
          >
            {/* Column Header */}
            <div
              className={`p-3 border-b flex items-center justify-between font-bold text-xs ${col.headerBg}`}
            >
              <div className="flex items-center gap-2">
                {col.icon}
                <span>{col.title}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${col.badgeBg}`}>
                {colOrders.length}
              </span>
            </div>

            {/* Column Cards */}
            <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-270px)]">
              {colOrders.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  No consignments in this stage
                </div>
              ) : (
                colOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition group text-slate-800 flex flex-col gap-2"
                  >
                    {/* Top row: RO/PO & Channel */}
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => onOpenOrderDrawer(order)}
                        className="font-bold text-xs text-violet-700 hover:text-violet-900 hover:underline cursor-pointer truncate"
                      >
                        {order.roPoNumber}
                      </button>
                      <ChannelBadge channel={order.channel} />
                    </div>

                    {/* Warehouse destination */}
                    {order.warehouseName && (
                      <div className="text-[11px] text-slate-600 truncate flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{order.warehouseName}</span>
                      </div>
                    )}

                    {/* Courier and AWB info */}
                    <div className="text-[11px] text-slate-700 flex items-center justify-between gap-1">
                      <span className="font-semibold">{order.courierPartner || "Carrier Unassigned"}</span>
                      {order.trackingId ? (
                        <span className="font-mono text-[10px] text-slate-500 truncate max-w-[120px]">
                          {order.trackingId}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                          No AWB
                        </span>
                      )}
                    </div>

                    {/* Appointment Date */}
                    {order.appointmentDate && (
                      <div className="text-[10px] text-purple-700 bg-purple-50 px-2 py-1 rounded-md border border-purple-100 flex items-center justify-between">
                        <span>Appt: {formatDateDisplay(order.appointmentDate)}</span>
                        {order.appointmentSlot && <span>{order.appointmentSlot}</span>}
                      </div>
                    )}

                    {/* 🔒 PERSONAL INTERNAL NOTE BADGE */}
                    {order.personalNote ? (
                      <div
                        onClick={() => onQuickNoteClick?.(order)}
                        className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] cursor-pointer hover:bg-amber-100 transition flex items-start gap-1.5"
                        title="Private Appointment Note (Click to edit)"
                      >
                        <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                        <span className="line-clamp-2 leading-tight">{order.personalNote}</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => onQuickNoteClick?.(order)}
                        className="text-[10px] text-slate-400 hover:text-violet-600 flex items-center gap-1 transition self-start cursor-pointer"
                      >
                        <Lock className="w-2.5 h-2.5" />
                        <span>+ Private Note</span>
                      </button>
                    )}

                    {/* Footer: Status and Inspect */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <StatusBadge status={order.courierStatus || "Pending"} size="sm" />
                      <button
                        onClick={() => onOpenOrderDrawer(order)}
                        className="p-1 rounded text-slate-400 hover:text-violet-700 hover:bg-violet-50 transition cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
