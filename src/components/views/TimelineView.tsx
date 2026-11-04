"use client";

import React from "react";
import { AppointmentOrder } from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDisplay } from "@/lib/date-utils";
import {
  Calendar,
  Clock,
  Truck,
  Building,
  Lock,
  Eye,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface TimelineViewProps {
  orders: AppointmentOrder[];
  isLoading: boolean;
  onOpenOrderDrawer: (order: AppointmentOrder) => void;
  onQuickNoteClick?: (order: AppointmentOrder) => void;
}

export function TimelineView({
  orders,
  isLoading,
  onOpenOrderDrawer,
  onQuickNoteClick,
}: TimelineViewProps) {
  if (isLoading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl">
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Building Delivery Timeline...</span>
        </div>
      </div>
    );
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const tomorrowEnd = new Date(todayEnd.getTime() + 86400000);
  const weekEnd = new Date(todayEnd.getTime() + 7 * 86400000);

  const overdue: AppointmentOrder[] = [];
  const today: AppointmentOrder[] = [];
  const tomorrow: AppointmentOrder[] = [];
  const thisWeek: AppointmentOrder[] = [];
  const later: AppointmentOrder[] = [];
  const unscheduled: AppointmentOrder[] = [];

  for (const order of orders) {
    const targetDate = order.appointmentDate
      ? new Date(order.appointmentDate)
      : order.deliveryDate
      ? new Date(order.deliveryDate)
      : null;

    if (!targetDate || isNaN(targetDate.getTime())) {
      unscheduled.push(order);
      continue;
    }

    const isDelivered = (order.courierStatus || "").toLowerCase() === "delivered";

    if (targetDate < todayStart && !isDelivered) {
      overdue.push(order);
    } else if (targetDate >= todayStart && targetDate <= todayEnd) {
      today.push(order);
    } else if (targetDate >= tomorrowStart && targetDate <= tomorrowEnd) {
      tomorrow.push(order);
    } else if (targetDate > tomorrowEnd && targetDate <= weekEnd) {
      thisWeek.push(order);
    } else {
      later.push(order);
    }
  }

  const sections = [
    {
      id: "overdue",
      title: "Past Due / Overdue Appointments",
      badgeColor: "bg-rose-100 text-rose-800 border-rose-300",
      accentBg: "border-l-4 border-l-rose-500",
      icon: <AlertCircle className="w-4 h-4 text-rose-600" />,
      items: overdue,
    },
    {
      id: "today",
      title: "Today's Schedule & Appointments",
      badgeColor: "bg-amber-100 text-amber-900 border-amber-300",
      accentBg: "border-l-4 border-l-amber-500",
      icon: <Clock className="w-4 h-4 text-amber-600" />,
      items: today,
    },
    {
      id: "tomorrow",
      title: "Tomorrow's Pipeline",
      badgeColor: "bg-indigo-100 text-indigo-900 border-indigo-300",
      accentBg: "border-l-4 border-l-indigo-500",
      icon: <Calendar className="w-4 h-4 text-indigo-600" />,
      items: tomorrow,
    },
    {
      id: "this_week",
      title: "This Week (Upcoming 7 Days)",
      badgeColor: "bg-purple-100 text-purple-900 border-purple-300",
      accentBg: "border-l-4 border-l-purple-500",
      icon: <Truck className="w-4 h-4 text-purple-600" />,
      items: thisWeek,
    },
    {
      id: "later",
      title: "Scheduled Further Out",
      badgeColor: "bg-slate-100 text-slate-800 border-slate-300",
      accentBg: "border-l-4 border-l-slate-400",
      icon: <Calendar className="w-4 h-4 text-slate-500" />,
      items: later,
    },
    {
      id: "unscheduled",
      title: "Unscheduled / Awaiting Slot",
      badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
      accentBg: "border-l-4 border-l-slate-300",
      icon: <Clock className="w-4 h-4 text-slate-400" />,
      items: unscheduled,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {sections.map((section) => {
        if (section.items.length === 0) return null;

        return (
          <div key={section.id} className="space-y-3">
            {/* Section Header */}
            <div className="flex items-center gap-2">
              {section.icon}
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                {section.title}
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${section.badgeColor}`}
              >
                {section.items.length} {section.items.length === 1 ? "order" : "orders"}
              </span>
            </div>

            {/* Section Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((order) => (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition p-3.5 space-y-2.5 text-slate-800 ${section.accentBg}`}
                >
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onOpenOrderDrawer(order)}
                      className="font-bold text-sm text-violet-700 hover:text-violet-900 hover:underline cursor-pointer truncate"
                    >
                      {order.roPoNumber}
                    </button>
                    <ChannelBadge channel={order.channel} />
                  </div>

                  {/* Destination */}
                  <div className="text-xs text-slate-600 flex items-center gap-1.5 truncate">
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{order.warehouseName || order.client?.name || "Destination not set"}</span>
                  </div>

                  {/* Date & Slot Info */}
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-[10px] block">APPOINTMENT</span>
                      <span className="font-semibold text-slate-800">
                        {formatDateDisplay(order.appointmentDate || order.deliveryDate)}
                      </span>
                    </div>
                    {order.appointmentSlot && (
                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">SLOT</span>
                        <span className="font-medium text-purple-700 text-[11px]">
                          {order.appointmentSlot}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Courier & Tracking */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="font-medium text-slate-700">
                      {order.courierPartner || "Carrier Pending"}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {order.trackingId || "No AWB"}
                    </span>
                  </div>

                  {/* 🔒 Isolated Personal Note */}
                  {order.personalNote ? (
                    <div
                      onClick={() => onQuickNoteClick?.(order)}
                      className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs cursor-pointer hover:bg-amber-100 transition flex items-start gap-1.5"
                      title="Private Appointment Note"
                    >
                      <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                      <span className="line-clamp-2 leading-tight">{order.personalNote}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onQuickNoteClick?.(order)}
                      className="text-[11px] text-slate-400 hover:text-violet-600 flex items-center gap-1 cursor-pointer transition"
                    >
                      <Lock className="w-2.5 h-2.5" />
                      <span>+ Write Private Note</span>
                    </button>
                  )}

                  {/* Status & Inspector Button */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <StatusBadge status={order.courierStatus || "Pending"} size="sm" />
                    <button
                      onClick={() => onOpenOrderDrawer(order)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {orders.length === 0 && (
        <div className="py-20 text-center text-slate-400 text-xs">
          No orders found matching your date criteria.
        </div>
      )}
    </div>
  );
}
