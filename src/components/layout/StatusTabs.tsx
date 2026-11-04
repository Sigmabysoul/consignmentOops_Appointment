"use client";

import React from "react";
import { DashboardStats } from "@/lib/types";

interface StatusTabsProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  stats?: DashboardStats | null;
}

export function StatusTabs({ activeTab, onSelectTab, stats }: StatusTabsProps) {
  const tabs = [
    {
      id: "all",
      label: "All Orders",
      count: stats?.totalOrders ?? 0,
      badgeColor: "bg-slate-200 text-slate-700",
    },
    {
      id: "pending",
      label: "Pending",
      count: stats?.pending ?? 0,
      badgeColor: "bg-slate-100 text-slate-700",
    },
    {
      id: "tracking_missing",
      label: "Tracking Missing",
      count: stats?.trackingMissing ?? 0,
      badgeColor: "bg-amber-100 text-amber-800",
    },
    {
      id: "in_transit",
      label: "In Transit",
      count: stats?.inTransit ?? 0,
      badgeColor: "bg-indigo-100 text-indigo-800",
    },
    {
      id: "appointments",
      label: "Appointment Scheduled",
      count: stats?.appointmentScheduled ?? 0,
      badgeColor: "bg-purple-100 text-purple-800",
    },
    {
      id: "delivered",
      label: "Delivered",
      count: stats?.delivered ?? 0,
      badgeColor: "bg-emerald-100 text-emerald-800",
    },
    {
      id: "grn_issues",
      label: "GRN Issue",
      count: stats?.grnIssues ?? 0,
      badgeColor: "bg-rose-100 text-rose-800",
    },
    {
      id: "cancelled",
      label: "Cancelled",
      count: stats?.cancelled ?? 0,
      badgeColor: "bg-slate-100 text-slate-600",
    },
  ];

  return (
    <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-2">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                isSelected
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                  isSelected ? "bg-white/25 text-white" : tab.badgeColor
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
