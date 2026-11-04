"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  CalendarCheck,
  LogOut,
  ChevronDown,
  RefreshCw,
  Shield,
  Truck,
  ExternalLink,
} from "lucide-react";
import { SessionUser } from "@/lib/types";
import { useRouter } from "next/navigation";

interface AppHeaderProps {
  user: SessionUser;
  activeNavTab: string;
  onSelectNavTab: (tab: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function AppHeader({
  user,
  activeNavTab,
  onSelectNavTab,
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

  const navItems = [
    { id: "all", label: "All Orders" },
    { id: "pending", label: "Pending" },
    { id: "tracking_missing", label: "Missing Tracking" },
    { id: "in_transit", label: "In Transit" },
    { id: "appointments", label: "Appointments" },
    { id: "delivered", label: "Delivered" },
    { id: "grn_issues", label: "GRN Issues" },
  ];

  const roleDisplay =
    user.role === "ADMIN"
      ? "Administrator"
      : user.username.toLowerCase() === "iqbal" || user.name.toLowerCase().includes("iqbal")
      ? "Logistics Manager (Iqbal)"
      : "Logistics Manager";

  return (
    <header className="sticky top-0 z-30 select-none shadow-md">
      {/* ── Purple Gradient Header Matching ConsignmentOps ── */}
      <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-900 px-4 sm:px-6 lg:px-8 border-b border-indigo-700/40">
        <div className="flex items-center justify-between h-14 gap-3">
          {/* LEFT: Branding + Live DB Indicator */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-md">
                <CalendarCheck className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-extrabold text-sm tracking-tight leading-none">
                    Appointment
                  </span>
                  {/* Live Database Status Indicator */}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-semibold text-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>LIVE DB</span>
                  </span>
                </div>
                <div className="text-white/70 text-[10px] font-medium tracking-wider">
                  LOGISTICS MANAGEMENT
                </div>
              </div>
            </div>
          </div>

          {/* MIDDLE: Navigation Tabs */}
          <nav className="hidden md:flex items-center bg-black/25 backdrop-blur-sm p-1 rounded-xl border border-white/15 gap-1">
            {navItems.map((item) => {
              const isActive = activeNavTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectNavTab(item.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-white text-gray-900 shadow-md"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* RIGHT: User Profile & Actions */}
          <div className="flex items-center gap-2">
            {/* Refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Refresh order data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            )}

            {/* User Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-white/25 bg-white/15 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center font-bold text-xs uppercase border border-white/40">
                  {user.name ? user.name[0] : user.username[0]}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold leading-tight">{user.name || user.username}</div>
                  <div className="text-[10px] text-white/75 leading-tight">{roleDisplay}</div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 text-slate-800 animate-slide-up">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <div className="text-xs font-bold text-slate-900">{user.name}</div>
                    <div className="text-[11px] text-slate-500">@{user.username}</div>
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                      <Shield className="w-3 h-3" />
                      <span>{roleDisplay}</span>
                    </div>
                  </div>

                  <div className="px-2 py-1">
                    <a
                      href="https://averretail.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition"
                    >
                      <span className="flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-slate-400" />
                        <span>ConsignmentOps Hub</span>
                      </span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  </div>

                  <div className="pt-1 border-t border-slate-100 px-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer text-left"
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
    </header>
  );
}
