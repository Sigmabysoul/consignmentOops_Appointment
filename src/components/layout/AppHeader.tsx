"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Boxes,
  TableProperties,
  Kanban,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  ChevronDown,
  RefreshCw,
  Shield,
  Truck,
  ExternalLink,
} from "lucide-react";
import { SessionUser, ActiveView } from "@/lib/types";
import { useRouter } from "next/navigation";

interface PlatformDef {
  code: string;
  name: string;
  activeClass: string;
  dotColor: string;
  ringClass: string;
}

const PLATFORMS: PlatformDef[] = [
  {
    code: "ALL",
    name: "All Channels",
    activeClass: "bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-white/40 shadow-md",
    dotColor: "bg-white",
    ringClass: "ring-2 ring-violet-300/50",
  },
  {
    code: "SWIGGY",
    name: "Swiggy Instamart",
    activeClass: "bg-gradient-to-r from-orange-500 to-rose-500 text-white border-white/40 shadow-md",
    dotColor: "bg-orange-300",
    ringClass: "ring-2 ring-orange-300/50",
  },
  {
    code: "BLINKIT_STO",
    name: "Blinkit STO",
    activeClass: "bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-white/40 shadow-md",
    dotColor: "bg-yellow-200",
    ringClass: "ring-2 ring-yellow-300/50",
  },
  {
    code: "FLIPKART_MINUTES",
    name: "Flipkart Minutes",
    activeClass: "bg-gradient-to-r from-blue-600 to-indigo-500 text-white border-white/40 shadow-md",
    dotColor: "bg-blue-300",
    ringClass: "ring-2 ring-blue-300/50",
  },
  {
    code: "FLIPKART_FBF",
    name: "Flipkart FBF",
    activeClass: "bg-gradient-to-r from-sky-500 to-blue-600 text-white border-white/40 shadow-md",
    dotColor: "bg-sky-300",
    ringClass: "ring-2 ring-sky-300/50",
  },
  {
    code: "FKSB_FLIPKART",
    name: "FKSB Flipkart",
    activeClass: "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-white/40 shadow-md",
    dotColor: "bg-indigo-300",
    ringClass: "ring-2 ring-indigo-300/50",
  },
  {
    code: "AMAZON_VC",
    name: "Amazon VC",
    activeClass: "bg-gradient-to-r from-amber-500 to-orange-600 text-white border-white/40 shadow-md",
    dotColor: "bg-amber-300",
    ringClass: "ring-2 ring-amber-300/50",
  },
  {
    code: "AMAZON_FBA",
    name: "Amazon FBA",
    activeClass: "bg-gradient-to-r from-orange-600 to-red-600 text-white border-white/40 shadow-md",
    dotColor: "bg-red-300",
    ringClass: "ring-2 ring-orange-400/50",
  },
];

interface AppHeaderProps {
  user: SessionUser;
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
  channelCounts?: Record<string, number>;
  totalOrdersCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function AppHeader({
  user,
  activeView,
  onSelectView,
  selectedPlatform,
  onSelectPlatform,
  channelCounts = {},
  totalOrdersCount = 0,
  onRefresh,
  isRefreshing,
}: AppHeaderProps) {
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  };

  const roleDisplay =
    user.role === "ADMIN"
      ? "System Administrator"
      : user.username.toLowerCase() === "iqbal" || user.name.toLowerCase().includes("iqbal")
      ? "Logistics Manager (Iqbal)"
      : "Logistics Manager";

  const userInitials = (user.name || user.username || "U")
    .substring(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 select-none shadow-md">
      {/* ── ROW 1: Purple Gradient Navigation Bar (ConsignmentOps Brand Bar) ── */}
      <div
        className="bg-gradient-to-r from-violet-600 to-indigo-600 px-3 sm:px-5 lg:px-8 transition-all duration-300 border-b border-indigo-700/40"
        style={{
          background: "linear-gradient(135deg, rgb(109, 40, 217) 0%, rgb(79, 70, 229) 100%)",
        }}
      >
        <div className="flex items-center justify-between h-14 gap-2 sm:gap-4">
          {/* LEFT: Branding + Live Indicator */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                <Boxes className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="hidden sm:block">
                <div className="text-white font-black text-sm tracking-tight leading-none">
                  Consignment
                </div>
                <div className="text-white/70 text-[10px] font-medium tracking-wider">
                  APPOINTMENT & DISPATCH DESK
                </div>
              </div>
            </div>

            {/* Live DB Indicator */}
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/25">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shrink-0 animate-pulse" />
              <span className="text-white text-[11px] sm:text-xs font-bold truncate">
                LIVE DB
              </span>
            </div>
          </div>

          {/* MIDDLE: Operational View Switchers (Sheet, Kanban, Timeline, Analytics) */}
          <div className="flex items-center bg-black/20 backdrop-blur-sm p-0.5 rounded-xl border border-white/15 gap-0.5">
            {/* Sheet View */}
            <button
              onClick={() => onSelectView("sheet")}
              title="Spreadsheet View"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeView === "sheet"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/15"
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sheet</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
                  activeView === "sheet"
                    ? "bg-indigo-600 text-white"
                    : "bg-white/20 text-white"
                }`}
              >
                {totalOrdersCount}
              </span>
            </button>

            {/* Kanban View */}
            <button
              onClick={() => onSelectView("kanban")}
              title="Kanban Pipeline"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeView === "kanban"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/15"
              }`}
            >
              <Kanban className="w-3.5 h-3.5 opacity-80" />
              <span className="hidden sm:inline">Kanban</span>
            </button>

            {/* Timeline View */}
            <button
              onClick={() => onSelectView("timeline")}
              title="Schedule Timeline"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeView === "timeline"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/15"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 opacity-80" />
              <span className="hidden sm:inline">Timeline</span>
            </button>

            {/* Analytics View */}
            <button
              onClick={() => onSelectView("analytics")}
              title="Analytics & Metrics"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeView === "analytics"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/15"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 opacity-80" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>

          {/* RIGHT: Actions & User Dropdown */}
          <div className="flex items-center gap-2">
            {/* Refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Refresh order data"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
            )}

            {/* User Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg border border-white/25 bg-white/15 backdrop-blur-sm hover:bg-white/25 transition cursor-pointer"
                title="User Profile & Quick Tools"
              >
                <div className="w-7 h-7 rounded-full bg-white/90 text-gray-900 flex items-center justify-center font-black text-xs uppercase shadow-sm">
                  {userInitials}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-white leading-tight truncate max-w-[120px]">
                    {user.name || user.username}
                  </div>
                  <div className="text-[10px] text-white/60 font-medium leading-none">
                    {roleDisplay}
                  </div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-white/70 transition-transform ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 text-slate-800 animate-slide-up">
                  <div className="px-3.5 py-2.5 border-b border-slate-100">
                    <div className="text-xs font-bold text-slate-900">
                      {user.name || user.username}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      @{user.username}
                    </div>
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                      <Shield className="w-3 h-3" />
                      <span>{roleDisplay}</span>
                    </div>
                  </div>

                  <div className="px-2 py-1">
                    <div className="px-2.5 py-1.5 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                      <span>Appointment Desk Mode</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100 px-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Platform Channels Selector Bar (ConsignmentOps Dark Channel Bar) ── */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border-b border-indigo-900/40 px-3 sm:px-5 lg:px-8 shadow-md">
        <div className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {PLATFORMS.map((platform) => {
              const isActive = selectedPlatform === platform.code;
              const count =
                platform.code === "ALL"
                  ? totalOrdersCount
                  : channelCounts[platform.code] || 0;

              return (
                <button
                  key={platform.code}
                  onClick={() => onSelectPlatform(platform.code)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 border cursor-pointer ${
                    isActive
                      ? `${platform.activeClass} ${platform.ringClass}`
                      : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/60"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full border border-white ${
                      isActive ? "bg-white shadow-xs" : platform.dotColor
                    }`}
                  />
                  <span>{platform.name}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? "bg-black/30 text-white"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
