"use client";

import React from "react";
import {
  PackageCheck,
  AlertTriangle,
  Truck,
  Calendar,
  CheckCircle2,
  FileWarning,
} from "lucide-react";
import { DashboardStats } from "@/lib/types";

interface MetricCardsProps {
  stats: DashboardStats | null;
  onSelectMetric?: (tab: string) => void;
}

export function MetricCards({ stats, onSelectMetric }: MetricCardsProps) {
  const cards = [
    {
      id: "all",
      label: "Total Orders",
      value: stats?.totalOrders ?? 0,
      sub: "Active Consignments",
      icon: PackageCheck,
      iconColor: "text-violet-600 bg-violet-50 border-violet-100",
      accent: "border-slate-200",
    },
    {
      id: "tracking_missing",
      label: "Tracking Missing",
      value: stats?.trackingMissing ?? 0,
      sub: "Requires AWB / Carrier",
      icon: AlertTriangle,
      iconColor: "text-amber-600 bg-amber-50 border-amber-100",
      accent: (stats?.trackingMissing ?? 0) > 0 ? "border-amber-200" : "border-slate-200",
    },
    {
      id: "in_transit",
      label: "In Transit",
      value: stats?.inTransit ?? 0,
      sub: "With Courier Partner",
      icon: Truck,
      iconColor: "text-indigo-600 bg-indigo-50 border-indigo-100",
      accent: "border-slate-200",
    },
    {
      id: "appointments",
      label: "Scheduled Today",
      value: stats?.scheduledToday ?? 0,
      sub: `${stats?.appointmentScheduled ?? 0} total scheduled`,
      icon: Calendar,
      iconColor: "text-purple-600 bg-purple-50 border-purple-100",
      accent: "border-slate-200",
    },
    {
      id: "delivered",
      label: "Delivered",
      value: stats?.delivered ?? 0,
      sub: "Confirmed At Hub",
      icon: CheckCircle2,
      iconColor: "text-emerald-600 bg-emerald-50 border-emerald-100",
      accent: "border-slate-200",
    },
    {
      id: "grn_issues",
      label: "GRN Discrepancies",
      value: stats?.grnIssues ?? 0,
      sub: "Flagged Discrepancies",
      icon: FileWarning,
      iconColor: "text-rose-600 bg-rose-50 border-rose-100",
      accent: (stats?.grnIssues ?? 0) > 0 ? "border-rose-200" : "border-slate-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            onClick={() => onSelectMetric && onSelectMetric(card.id)}
            className={`bg-white rounded-xl p-3 border ${card.accent} shadow-xs hover:shadow-md transition-all duration-150 cursor-pointer flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500 truncate">{card.label}</span>
              <div className={`p-1.5 rounded-lg border shrink-0 ${card.iconColor}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-extrabold text-slate-900 tracking-tight leading-none">
                {card.value}
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-1 truncate">
                {card.sub}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
