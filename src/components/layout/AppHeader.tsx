"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Boxes,
  TableProperties,
  Kanban,
  LogOut,
  ChevronDown,
  RefreshCw,
  Shield,
  Truck,
  ExternalLink,
  Calendar,
  Sliders,
} from "lucide-react";
import { SessionUser, ActiveView } from "@/lib/types";
import { useRouter } from "next/navigation";

interface PlatformDef {
  code: string;
  name: string;
  /** Brand dot colour for the channel chip. */
  dot: string;
}

const PLATFORMS: PlatformDef[] = [
  { code: "ALL", name: "All channels", dot: "bg-slate-400" },
  { code: "SWIGGY", name: "Swiggy Instamart", dot: "bg-orange-500" },
  { code: "BLINKIT_STO", name: "Blinkit STO", dot: "bg-yellow-400" },
  { code: "FLIPKART_MINUTES", name: "Flipkart Minutes", dot: "bg-blue-600" },
  { code: "FLIPKART_FBF", name: "Flipkart FBF", dot: "bg-sky-500" },
  { code: "FKSB_FLIPKART", name: "FKSB Flipkart", dot: "bg-indigo-500" },
  { code: "AMAZON_VC", name: "Amazon VC", dot: "bg-amber-500" },
  { code: "AMAZON_FBA", name: "Amazon FBA", dot: "bg-red-500" },
];

/** The four desks, in workflow order. */
const VIEWS: Array<{ view: ActiveView; label: string; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { view: "booking", label: "Booking", title: "Booking & pickup desk: printed orders waiting for a carrier", icon: Truck },
  { view: "appointment", label: "Appointment", title: "Appointment & CN desk: in-transit orders", icon: Calendar },
  { view: "kanban", label: "Kanban", title: "Remaining vs gone", icon: Kanban },
  { view: "sheet", label: "All data", title: "Every consignment in one sheet", icon: TableProperties },
];

interface AppHeaderProps {
  user: SessionUser;
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
  channelCounts?: Record<string, number>;
  totalOrdersCount?: number;
  bookingCount?: number;
  appointmentCount?: number;
  allDataCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenPresets?: () => void;
}

export function AppHeader({
  user,
  activeView,
  onSelectView,
  selectedPlatform,
  onSelectPlatform,
  channelCounts = {},
  totalOrdersCount = 0,
  bookingCount,
  appointmentCount,
  allDataCount,
  onRefresh,
  isRefreshing,
  onOpenPresets,
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

  const deskCount = (user.permissions || []).filter((p) => p.actions.includes("logistics.desk")).length;
  const roleDisplay = user.department
    ? `${user.department} · ${deskCount === 1 ? "1 platform" : `${deskCount} platforms`}`
    : deskCount === 1 ? "1 platform" : `${deskCount} platforms`;

  const userInitials = (user.name || user.username || "U")
    .substring(0, 2)
    .toUpperCase();

  const viewCount = (view: ActiveView): number | undefined =>
    view === "booking" ? bookingCount : view === "appointment" ? appointmentCount : view === "sheet" ? allDataCount ?? totalOrdersCount : undefined;

  return (
    <header className="sticky top-0 z-30 select-none border-b border-slate-200 bg-white/95 backdrop-blur">
      {/* Row 1: brand · desks · refresh & user */}
      <div className="ui-page flex h-14 items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
            <Boxes className="h-4 w-4" />
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-semibold text-slate-900">Logistics WorkHub</div>
            <div className="text-[11px] text-slate-500">Appointment & dispatch desk</div>
          </div>
        </div>

        <nav className="ui-segment overflow-x-auto scrollbar-none" aria-label="Desks">
          {VIEWS.map(({ view, label, title, icon: Icon }, i) => {
            const active = activeView === view;
            const count = viewCount(view);
            return (
              <button
                key={view}
                type="button"
                onClick={() => onSelectView(view)}
                title={title}
                aria-current={active ? "page" : undefined}
                className={`ui-segment-item ${active ? "ui-segment-item-active" : ""}`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? "text-violet-600" : "text-slate-400"}`} />
                <span className={view === "sheet" ? "hidden md:inline" : ""}>
                  {view === "sheet" ? label : `${i + 1}. ${label}`}
                </span>
                {typeof count === "number" && (
                  <span className={`ui-count ${active ? "bg-violet-100 text-violet-700" : ""}`}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={isRefreshing} className="ui-icon-btn" title="Refresh order data">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-slate-100"
              title="Account & tools"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold uppercase text-white">
                {userInitials}
              </div>
              <div className="hidden text-left sm:block">
                <div className="max-w-[140px] truncate text-xs font-semibold leading-tight text-slate-900">{user.name || user.username}</div>
                <div className="text-[10px] leading-none text-slate-500">{roleDisplay}</div>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {userMenuOpen && (
              <div className="animate-slide-up absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white py-1.5 text-slate-800 shadow-xl">
                <div className="border-b border-slate-100 px-3.5 py-2.5">
                  <div className="text-xs font-semibold text-slate-900">{user.name || user.username}</div>
                  <div className="text-[11px] text-slate-500">@{user.username}</div>
                  <div className="ui-chip mt-1.5">
                    <Shield className="h-3 w-3 text-violet-600" />
                    <span>{roleDisplay}</span>
                  </div>
                </div>
                <div className="px-1.5 py-1">
                  {onOpenPresets && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onOpenPresets();
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                      title="OM Logistics rate cards, fuel surcharge, ODA matrix and courier presets"
                    >
                      <Sliders className="h-3.5 w-3.5 text-slate-500" />
                      <span>Rate presets</span>
                    </button>
                  )}
                  <a
                    href="https://consignmentops.averretail.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                    <span>Open Consignment App</span>
                  </a>
                </div>
                <div className="border-t border-slate-100 px-1.5 pt-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: channel filter */}
      <div className="border-t border-slate-100">
        <div className="ui-page flex items-center gap-1.5 overflow-x-auto py-2 scrollbar-none">
          {PLATFORMS.map((platform) => {
            const active = selectedPlatform === platform.code;
            const count = platform.code === "ALL" ? totalOrdersCount : channelCounts[platform.code] || 0;
            return (
              <button
                key={platform.code}
                type="button"
                onClick={() => onSelectPlatform(platform.code)}
                aria-pressed={active}
                className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${platform.dot}`} />
                <span>{platform.name}</span>
                {count > 0 && (
                  <span className={`text-[10px] font-semibold tabular-nums ${active ? "text-white/70" : "text-slate-400"}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
