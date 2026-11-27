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
      <div className="ui-card flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />
          <span>Building delivery timeline…</span>
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
      title: "Past due",
      hint: "Appointment date has passed",
      dot: "bg-rose-500",
      icon: <AlertCircle className="h-4 w-4 text-rose-500" />,
      items: overdue,
    },
    {
      id: "today",
      title: "Today",
      hint: "Appointments scheduled today",
      dot: "bg-amber-500",
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      items: today,
    },
    {
      id: "tomorrow",
      title: "Tomorrow",
      hint: "Next day pipeline",
      dot: "bg-sky-500",
      icon: <Calendar className="h-4 w-4 text-sky-500" />,
      items: tomorrow,
    },
    {
      id: "this_week",
      title: "This week",
      hint: "Upcoming 7 days",
      dot: "bg-violet-500",
      icon: <Truck className="h-4 w-4 text-violet-500" />,
      items: thisWeek,
    },
    {
      id: "later",
      title: "Further out",
      hint: "Scheduled beyond this week",
      dot: "bg-slate-400",
      icon: <Calendar className="h-4 w-4 text-slate-400" />,
      items: later,
    },
    {
      id: "unscheduled",
      title: "Unscheduled",
      hint: "Awaiting a slot",
      dot: "bg-slate-300",
      icon: <Clock className="h-4 w-4 text-slate-400" />,
      items: unscheduled,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {sections.map((section) => {
        if (section.items.length === 0) return null;

        return (
          <section key={section.id} className="space-y-2.5">
            {/* Section header */}
            <div className="flex items-center gap-2">
              {section.icon}
              <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
              <span className="ui-count">{section.items.length}</span>
              <span className="ui-muted hidden sm:inline">· {section.hint}</span>
            </div>

            {/* Section cards */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {section.items.map((order) => (
                <article
                  key={order.id}
                  className="ui-card flex flex-col gap-2.5 p-3.5 text-slate-800 transition hover:border-slate-300 hover:shadow-sm"
                >
                  {/* RO number + channel */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${section.dot}`} aria-hidden />
                      <button
                        onClick={() => onOpenOrderDrawer(order)}
                        className="ui-mono cursor-pointer truncate text-[13px] font-semibold text-slate-900 hover:text-violet-700 hover:underline"
                      >
                        {order.roPoNumber}
                      </button>
                    </div>
                    <ChannelBadge channel={order.channel} size="sm" />
                  </div>

                  {/* Destination */}
                  <div className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                    <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{order.warehouseName || order.client?.name || "Destination not set"}</span>
                  </div>

                  {/* Appointment, slot, carrier, CN */}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <dt className="ui-muted">Appointment</dt>
                      <dd className="font-medium tabular-nums text-slate-900">
                        {formatDateDisplay(order.appointmentDate || order.deliveryDate)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="ui-muted">Slot</dt>
                      <dd className="truncate font-medium text-slate-900">{order.appointmentSlot || "—"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="ui-muted">Carrier</dt>
                      <dd className="truncate font-medium text-slate-900">{order.courierPartner || "Carrier pending"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="ui-muted">CN / AWB</dt>
                      <dd className="ui-mono truncate text-slate-700">{order.trackingId || "No AWB"}</dd>
                    </div>
                  </dl>

                  {/* Private note */}
                  {order.personalNote ? (
                    <div
                      onClick={() => onQuickNoteClick?.(order)}
                      className="flex cursor-pointer items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 transition hover:bg-amber-100"
                      title="Private Appointment Note"
                    >
                      <Lock className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                      <span className="line-clamp-2 leading-tight">{order.personalNote}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onQuickNoteClick?.(order)}
                      className="flex w-fit cursor-pointer items-center gap-1 text-[11px] text-slate-400 transition hover:text-violet-600"
                    >
                      <Lock className="h-3 w-3" />
                      <span>Add private note</span>
                    </button>
                  )}

                  {/* Status + inspect */}
                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <StatusBadge status={order.courierStatus || "Pending"} size="sm" />
                    <button onClick={() => onOpenOrderDrawer(order)} className="ui-btn-secondary ui-btn-sm">
                      <Eye className="h-3 w-3" />
                      <span>Inspect</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {orders.length === 0 && (
        <div className="ui-card ui-empty">
          <Calendar className="h-8 w-8 text-slate-300" />
          <p>No orders found matching your date criteria.</p>
        </div>
      )}
    </div>
  );
}
