"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { parseUrlViewState, buildUrlViewSearch, isNavigationChange, type UrlViewState } from "@/lib/url-view-state";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { OrdersTable } from "@/components/table/OrdersTable";
import { BookingView } from "@/components/booking/BookingView";
import { AppointmentView } from "@/components/appointment/AppointmentView";
import { KanbanView } from "@/components/views/KanbanView";
import { TimelineView } from "@/components/views/TimelineView";
import { OrderDetailsDrawer } from "@/components/drawer/OrderDetailsDrawer";
import { FilterToolbar } from "@/components/toolbar/FilterToolbar";
import { ShippingPresetsModal } from "@/components/presets/ShippingPresetsModal";
import { useToast } from "@/components/ui/Toast";
import { Lock, X } from "lucide-react";
import {
  SessionUser,
  AppointmentOrder,
  CourierPresetItem,
  DashboardStats,
  ActiveView,
} from "@/lib/types";

export default function AppointmentDashboard() {
  const router = useRouter();
  const { showToast } = useToast();

  // Authentication State
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // View Mode: 1. Booking, 2. Appointment, 3. Kanban, Sheet, Analytics
  const [activeView, setActiveView] = useState<ActiveView>("booking");

  // Data States
  const [orders, setOrders] = useState<AppointmentOrder[]>([]);
  const [courierPresets, setCourierPresets] = useState<CourierPresetItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter & Pagination States
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("ALL");
  const [selectedCourier, setSelectedCourier] = useState<string>("ALL");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState<string>("ALL");
  const [quickDate, setQuickDate] = useState<string>("all");
  const [dateType, setDateType] = useState<string>("pickupDate");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Dashboard metric drill-down: the sheet shows exactly the rows the clicked card counts
  const [metricFilter, setMetricFilter] = useState<{ key: string; label: string } | null>(null);
  // Kanban column totals from the server (the board loads each column separately)
  const [kanbanMeta, setKanbanMeta] = useState<{ counts: Record<string, number>; columnLimit: number } | null>(null);

  // Switching views always starts at page 1 and drops a metric drill-down
  const selectView = useCallback((view: ActiveView) => {
    setActiveView(view);
    setPage(1);
    setMetricFilter(null);
  }, []);

  // Selected Order for Drawer
  const [selectedDrawerOrder, setSelectedDrawerOrder] = useState<AppointmentOrder | null>(null);

  // ── Shareable URL state (?view=&channel=&date=&order=) ──
  // Read once on mount so a reload keeps the desk, platform, date filter and open drawer, and
  // a link sent to a colleague opens the same screen.
  const pendingUrlOrderRef = useRef<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const lastUrlStateRef = useRef<UrlViewState | null>(null);
  const applyingPopStateRef = useRef(false);

  useEffect(() => {
    const s = parseUrlViewState(window.location.search);
    if (s.view) setActiveView(s.view);
    if (s.channel) setSelectedChannel(s.channel);
    if (s.date) setQuickDate(s.date);
    pendingUrlOrderRef.current = s.order ?? null;
  }, []);

  // Shipping Rate Presets Modal State
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);

  // Private Personal Note Quick Editor Modal State
  const [activeNoteModal, setActiveNoteModal] = useState<{
    order: AppointmentOrder;
    noteText: string;
  } | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Save isolated personal note from hoisted modal
  const handleSavePersonalNote = async () => {
    if (!activeNoteModal) return;

    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/orders/${activeNoteModal.order.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: activeNoteModal.noteText }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save private note");
      }

      showToast("Private note saved (isolated to Appointment desk)", "success");
      setActiveNoteModal(null);
      handleRefresh();
    } catch (err: any) {
      showToast(err.message || "Failed to save note", "error");
    } finally {
      setIsSavingNote(false);
    }
  };

  // Global Keyboard Shortcuts (Alt+1 to Alt+4 for view switching)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "1") {
        e.preventDefault();
        selectView("booking");
      } else if (e.altKey && e.key === "2") {
        e.preventDefault();
        selectView("appointment");
      } else if (e.altKey && e.key === "3") {
        e.preventDefault();
        selectView("kanban");
      } else if (e.altKey && e.key === "4") {
        e.preventDefault();
        selectView("sheet");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectView]);

  // 1. Check Authentication on Mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (data.user) {
          setCurrentUser(data.user);
        } else {
          router.push("/login");
        }
      })
      .catch(() => router.push("/login"))
      .finally(() => setIsAuthLoading(false));
  }, [router]);

  // Open the linked order's drawer once signed in (hidden / unknown orders just stay closed)
  useEffect(() => {
    if (!currentUser || urlReady) return;
    const orderId = pendingUrlOrderRef.current;
    pendingUrlOrderRef.current = null;
    if (!orderId) {
      setUrlReady(true);
      return;
    }
    fetch(`/api/orders/${encodeURIComponent(orderId)}`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.order) setSelectedDrawerOrder(data.order);
      })
      .catch(() => {})
      .finally(() => setUrlReady(true));
  }, [currentUser, urlReady]);

  // Mirror the screen into the address bar: desk / platform changes add a history entry,
  // date filter and drawer changes only replace the current one.
  const drawerOrderId = selectedDrawerOrder?.id;
  useEffect(() => {
    if (!urlReady) return;
    const next: UrlViewState = { view: activeView, channel: selectedChannel, date: quickDate as any, order: drawerOrderId };
    const search = buildUrlViewSearch(next, window.location.search);
    const prev = lastUrlStateRef.current;
    const fromPopState = applyingPopStateRef.current;
    applyingPopStateRef.current = false;
    lastUrlStateRef.current = next;
    if (search === window.location.search) return;
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (prev && !fromPopState && isNavigationChange(prev, next)) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, [urlReady, activeView, selectedChannel, quickDate, drawerOrderId]);

  // Browser Back / Forward restores the desk, platform and date filter (and closes a stale drawer)
  useEffect(() => {
    const onPopState = () => {
      const s = parseUrlViewState(window.location.search);
      applyingPopStateRef.current = true;
      setActiveView(s.view ?? "booking");
      setPage(1);
      setSelectedChannel(s.channel ?? "ALL");
      setQuickDate(s.date ?? "all");
      setSelectedDrawerOrder((cur) => (cur && cur.id === s.order ? cur : null));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 2. Fetch Courier Presets
  useEffect(() => {
    if (!currentUser) return;
    fetch("/api/couriers")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCourierPresets(data);
        }
      })
      .catch(() => {});
  }, [currentUser]);

  // 3. Fetch Dashboard Stats (Includes channel counts & warehouses)
  const fetchStats = useCallback(() => {
    fetch(`/api/dashboard/stats?tab=${activeView}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) {
          setStats(data.stats);
        }
      })
      .catch(() => {});
  }, [activeView]);

  // Derive channel counts and total count matching current active tab
  const effectiveChannelCounts = useMemo(() => {
    if (!stats) return {};
    if (activeView === "booking") {
      return stats.bookingChannelCounts || {};
    }
    if (activeView === "appointment") {
      return stats.appointmentChannelCounts || {};
    }
    return stats.channelCounts || {};
  }, [stats, activeView]);

  const effectiveTotalOrdersCount = useMemo(() => {
    if (!stats) return totalOrders;
    if (activeView === "booking") {
      return stats.bookingCount ?? totalOrders;
    }
    if (activeView === "appointment") {
      return stats.appointmentCount ?? totalOrders;
    }
    return stats.totalOrders ?? totalOrders;
  }, [stats, activeView, totalOrders]);

  // 4. Fetch Paginated Orders
  const fetchOrders = useCallback((isBackground = false) => {
    if (!currentUser) return;
    if (!isBackground) {
      setIsLoadingOrders(true);
    }

    // Kanban is loaded per column by the server (exact counts, no page cap); the timeline shows up to 100
    const effectivePageSize = activeView === "timeline" ? 100 : pageSize;

    const params = new URLSearchParams({
      page: String(activeView === "kanban" ? 1 : page),
      pageSize: String(effectivePageSize),
      search: searchTerm,
      tab: activeView,
      channel: selectedChannel,
      courier: selectedCourier,
      warehouse: selectedWarehouse,
      courierStatus: selectedStatus,
      deliveryStatus: selectedDeliveryStatus,
      quickDate,
      dateType,
      startDate,
      endDate,
      sortBy,
      sortDir,
    });
    if (metricFilter) params.set("metric", metricFilter.key);

    fetch(`/api/orders?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load orders");
        return res.json();
      })
      .then((data) => {
        if (data.orders) {
          setOrders(data.orders);
          setTotalOrders(data.pagination.total);
          setTotalPages(data.pagination.totalPages);
          setKanbanMeta(data.kanban || null);
        }
      })
      .catch((err) => {
        console.error("Order fetch error:", err);
        if (!isBackground) {
          showToast(err.message || "Failed to load orders", "error");
        }
      })
      .finally(() => {
        setIsLoadingOrders(false);
        setIsRefreshing(false);
      });
  }, [
    currentUser,
    activeView,
    page,
    pageSize,
    searchTerm,
    selectedChannel,
    selectedCourier,
    selectedWarehouse,
    selectedStatus,
    selectedDeliveryStatus,
    quickDate,
    dateType,
    startDate,
    endDate,
    sortBy,
    sortDir,
    metricFilter,
  ]);

  // Refetch when filters or pagination change
  useEffect(() => {
    if (currentUser) {
      fetchOrders();
      fetchStats();
    }
  }, [currentUser, fetchOrders, fetchStats]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchOrders();
    fetchStats();
  }, [fetchOrders, fetchStats]);

  // Live cross-tab & cross-app real-time synchronization
  useEffect(() => {
    if (!currentUser) return;

    // 1. Window focus / visibility listener
    const onWindowFocus = () => {
      fetchOrders(true);
      fetchStats();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchOrders(true);
        fetchStats();
      }
    };
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 2. BroadcastChannel cross-window sync
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel("consignment_orders_sync");
        bc.onmessage = (event) => {
          if (event.data?.type === "order_created" || event.data?.type === "order_updated") {
            fetchOrders(true);
            fetchStats();
          }
        };
      }
    } catch {}

    // 3. Storage event fallback
    const onStorage = (e: StorageEvent) => {
      if (e.key === "consignment_orders_sync_trigger") {
        fetchOrders(true);
        fetchStats();
      }
    };
    window.addEventListener("storage", onStorage);

    // 4. Fast background sync (every 4s when tab active) to catch orders from consignment ops
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOrders(true);
        fetchStats();
      }
    }, 4000);

    return () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
      if (bc) bc.close();
    };
  }, [currentUser, fetchOrders, fetchStats]);

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  const handleSortDirToggle = () => {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  // Synchronize default date filtering field with active view
  // (In booking section all filters based on pickup date; in appointment section on appointment date)
  useEffect(() => {
    if (activeView === "booking") {
      setDateType("pickupDate");
    } else if (activeView === "appointment") {
      setDateType("appointmentDate");
    }
  }, [activeView]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedChannel("ALL");
    setSelectedCourier("ALL");
    setSelectedWarehouse("ALL");
    setSelectedStatus("ALL");
    setSelectedDeliveryStatus("ALL");
    setQuickDate("all");
    setStartDate("");
    setEndDate("");
    setDateType(activeView === "booking" ? "pickupDate" : "appointmentDate");
    setSortBy("createdAt");
    setSortDir("desc");
    setPage(1);
    setMetricFilter(null);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-500">
            Loading Logistics WorkHub…
          </span>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f7f9]">
      {/* ── Header: desks + channel filter ── */}
      <AppHeader
        user={currentUser}
        activeView={activeView}
        onSelectView={selectView}
        selectedPlatform={selectedChannel}
        onSelectPlatform={(platform) => {
          setSelectedChannel(platform);
          setPage(1);
        }}
        channelCounts={effectiveChannelCounts}
        totalOrdersCount={effectiveTotalOrdersCount}
        bookingCount={stats?.bookingCount}
        appointmentCount={stats?.appointmentCount}
        allDataCount={stats?.totalOrders}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onOpenPresets={() => setIsPresetsModalOpen(true)}
      />

      {/* ── Main Workspace ── */}
      <main className="ui-page flex-1 py-4 sm:py-5 flex flex-col gap-4">
        {/* Metric Overview (when in Analytics view or summary mode) */}
        {activeView === "analytics" ? (
          <div className="space-y-6">
            <MetricCards
              stats={stats}
              onSelectMetric={(cardId) => {
                // Open the sheet with exactly the conditions the card's count uses (server-side
                // getMetricConditions), clearing other filters that the count does not apply.
                const METRIC_FOR_CARD: Record<string, { key: string; label: string } | null> = {
                  all: null,
                  tracking_missing: { key: "tracking_missing", label: "Tracking Missing" },
                  in_transit: { key: "in_transit", label: "In Transit" },
                  appointments: { key: "scheduled_today", label: "Scheduled Today" },
                  delivered: { key: "delivered", label: "Delivered" },
                  grn_issues: { key: "grn_issues", label: "GRN Discrepancies" },
                };
                handleResetFilters();
                selectView("sheet");
                setMetricFilter(METRIC_FOR_CARD[cardId] ?? null);
              }}
            />

            {/* Detailed Analytics Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="ui-card p-4">
                <h4 className="ui-card-title mb-3">
                  Channel Volume Distribution
                </h4>
                <div className="space-y-2">
                  {Object.entries(stats?.channelCounts || {}).map(([channel, count]) => (
                    <div key={channel} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{channel}</span>
                      <span className="font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full">
                        {count} consignments
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ui-card p-4">
                <h4 className="ui-card-title mb-3">
                  Active Destinations & Warehouses
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(stats?.warehouses || []).map((wh) => (
                    <div
                      key={wh}
                      onClick={() => {
                        selectView("sheet");
                        setSelectedWarehouse(wh);
                      }}
                      className="text-xs text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                    >
                      <span className="truncate">{wh}</span>
                      <span className="text-[10px] text-violet-600 font-semibold">Filter ➔</span>
                    </div>
                  ))}
                  {(stats?.warehouses || []).length === 0 && (
                    <div className="text-xs text-slate-400">No warehouse records logged yet.</div>
                  )}
                </div>
              </div>

              <div className="ui-card p-4">
                <h4 className="ui-card-title mb-3">
                  Appointment Desk Isolation Status
                </h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold">Shared Consignment DB Connected</span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="font-semibold">Private Notes Table (100% Isolated)</span>
                  </div>
                  <div className="text-[11px] text-slate-500 pt-1">
                    Logistics modifications (AWB, appointment dates, slots) update live DB without overwriting consignment status. Personal notes remain strictly confidential to appointment operators.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Operational Views: Sheet, Kanban, Timeline with Universal Filter & Sorting Toolbar ── */}
        {activeView !== "analytics" && (
          <FilterToolbar
            searchTerm={searchTerm}
            onSearchChange={(val) => {
              setSearchTerm(val);
              setPage(1);
            }}
            selectedCourier={selectedCourier}
            onCourierChange={(cr) => {
              setSelectedCourier(cr);
              setPage(1);
            }}
            courierPresets={courierPresets}
            selectedWarehouse={selectedWarehouse}
            onWarehouseChange={(wh) => {
              setSelectedWarehouse(wh);
              setPage(1);
            }}
            warehouses={stats?.warehouses || []}
            selectedStatus={selectedStatus}
            onStatusChange={(st) => {
              setSelectedStatus(st);
              setPage(1);
            }}
            selectedDeliveryStatus={selectedDeliveryStatus}
            onDeliveryStatusChange={(ds) => {
              setSelectedDeliveryStatus(ds);
              setPage(1);
            }}
            quickDate={quickDate}
            onQuickDateChange={(qd) => {
              setQuickDate(qd);
              setPage(1);
            }}
            dateType={dateType}
            onDateTypeChange={(dt) => {
              setDateType(dt);
              setPage(1);
            }}
            startDate={startDate}
            onStartDateChange={(sd) => {
              setStartDate(sd);
              setPage(1);
            }}
            endDate={endDate}
            onEndDateChange={(ed) => {
              setEndDate(ed);
              setPage(1);
            }}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            onSortDirToggle={handleSortDirToggle}
            onResetFilters={handleResetFilters}
          />
        )}

        {metricFilter && activeView === "sheet" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="ui-chip border-violet-200 bg-violet-50 text-violet-800">
              Showing metric: {metricFilter.label} ({totalOrders})
            </span>
            <button
              type="button"
              onClick={() => {
                setMetricFilter(null);
                setPage(1);
              }}
              className="ui-btn-ghost ui-btn-sm"
            >
              <X className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        )}

        {/* Part 1: Booking & Pickup Desk (Priority: Pickup Data & Dimensions) */}
        {activeView === "booking" && (
          <div className="flex-1">
            <BookingView
              orders={orders}
              isLoading={isLoadingOrders}
              courierPresets={courierPresets}
              warehouses={stats?.warehouses || []}
              page={page}
              pageSize={pageSize}
              totalOrders={totalOrders}
              totalPages={totalPages}
              onPageChange={setPage}
              onOpenOrderDrawer={(order) => setSelectedDrawerOrder(order)}
              onOrderUpdated={handleRefresh}
              onOpenPresets={() => setIsPresetsModalOpen(true)}
              onQuickNoteClick={(order) =>
                setActiveNoteModal({
                  order,
                  noteText: order.personalNote || "",
                })
              }
              onSwitchToAppointment={(order) => {
                selectView("appointment");
                if (order) setSelectedDrawerOrder(order);
              }}
            />
          </div>
        )}

        {/* Part 2: Appointment & CN Desk (Priority: CN & Appointment Date, Manual Status) */}
        {activeView === "appointment" && (
          <div className="flex-1">
            <AppointmentView
              orders={orders}
              isLoading={isLoadingOrders}
              courierPresets={courierPresets}
              warehouses={stats?.warehouses || []}
              page={page}
              pageSize={pageSize}
              totalOrders={totalOrders}
              totalPages={totalPages}
              onPageChange={setPage}
              onOpenOrderDrawer={(order) => setSelectedDrawerOrder(order)}
              onOrderUpdated={handleRefresh}
              onOpenPresets={() => setIsPresetsModalOpen(true)}
              onQuickNoteClick={(order) =>
                setActiveNoteModal({
                  order,
                  noteText: order.personalNote || "",
                })
              }
            />
          </div>
        )}

        {/* Part 3: Normal Kanban View (Gone vs Remaining) */}
        {activeView === "kanban" && (
          <div className="flex-1">
            <KanbanView
              orders={orders}
              stageCounts={kanbanMeta?.counts}
              columnLimit={kanbanMeta?.columnLimit}
              isLoading={isLoadingOrders}
              onOpenOrderDrawer={(order) => setSelectedDrawerOrder(order)}
              onQuickNoteClick={(order) =>
                setActiveNoteModal({
                  order,
                  noteText: order.personalNote || "",
                })
              }
              onOrderUpdated={handleRefresh}
            />
          </div>
        )}

        {/* View 4: All Data Spreadsheet Table */}
        {activeView === "sheet" && (
          <div className="flex-1">
            <OrdersTable
              orders={orders}
              isLoading={isLoadingOrders}
              courierPresets={courierPresets}
              warehouses={stats?.warehouses || []}
              page={page}
              pageSize={pageSize}
              totalOrders={totalOrders}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              searchTerm={searchTerm}
              onSearchChange={(val) => {
                setSearchTerm(val);
                setPage(1);
              }}
              selectedChannel={selectedChannel}
              onChannelChange={(ch) => {
                setSelectedChannel(ch);
                setPage(1);
              }}
              selectedCourier={selectedCourier}
              onCourierChange={(cr) => {
                setSelectedCourier(cr);
                setPage(1);
              }}
              selectedWarehouse={selectedWarehouse}
              onWarehouseChange={(wh) => {
                setSelectedWarehouse(wh);
                setPage(1);
              }}
              selectedStatus={selectedStatus}
              onStatusChange={(st) => {
                setSelectedStatus(st);
                setPage(1);
              }}
              selectedDeliveryStatus={selectedDeliveryStatus}
              onDeliveryStatusChange={(ds) => {
                setSelectedDeliveryStatus(ds);
                setPage(1);
              }}
              quickDate={quickDate}
              onQuickDateChange={(qd) => {
                setQuickDate(qd);
                setPage(1);
              }}
              dateType={dateType}
              onDateTypeChange={(dt) => {
                setDateType(dt);
                setPage(1);
              }}
              startDate={startDate}
              onStartDateChange={(sd) => {
                setStartDate(sd);
                setPage(1);
              }}
              endDate={endDate}
              onEndDateChange={(ed) => {
                setEndDate(ed);
                setPage(1);
              }}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={handleSortChange}
              onSortDirToggle={handleSortDirToggle}
              onOpenOrderDrawer={(order) => setSelectedDrawerOrder(order)}
              onOrderUpdated={handleRefresh}
              onResetFilters={handleResetFilters}
              onQuickNoteClick={(order) =>
                setActiveNoteModal({
                  order,
                  noteText: order.personalNote || "",
                })
              }
              includeToolbar={false}
            />
          </div>
        )}

        {/* View 3: Schedule Timeline View */}
        {activeView === "timeline" && (
          <div className="flex-1">
            <TimelineView
              orders={orders}
              isLoading={isLoadingOrders}
              onOpenOrderDrawer={(order) => setSelectedDrawerOrder(order)}
              onQuickNoteClick={(order) =>
                setActiveNoteModal({
                  order,
                  noteText: order.personalNote || "",
                })
              }
            />
          </div>
        )}
      </main>

      {/* ── Order Details Slide-Out Drawer ── */}
      {selectedDrawerOrder && (
        <OrderDetailsDrawer
          order={selectedDrawerOrder}
          onClose={() => setSelectedDrawerOrder(null)}
          courierPresets={courierPresets}
          onOrderUpdated={handleRefresh}
        />
      )}

      {/* ── Personal Private Note Quick Editor Modal (Hoisted & Universal) ── */}
      {activeNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="ui-overlay"
            onClick={() => setActiveNoteModal(null)}
          />

          <div className="ui-dialog max-w-md z-10 animate-slide-up p-5 space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">
                    Private Note: {activeNoteModal.order.roPoNumber}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Only visible on the Appointment desk. Never sent to the Consignment app.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveNoteModal(null)}
                className="ui-icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Note Textarea */}
            <div>
              <label className="ui-label">
                Internal note
              </label>
              <textarea
                rows={4}
                value={activeNoteModal.noteText}
                onChange={(e) =>
                  setActiveNoteModal({
                    ...activeNoteModal,
                    noteText: e.target.value,
                  })
                }
                placeholder="Write personal notes about this order so you remember it (e.g. called driver Ramesh, gate pass number, dock 4 reserved, special handling required)..."
                className="ui-input resize-none"
                autoFocus
              />
              <p className="ui-muted mt-1">
                This note is stored in dedicated isolated storage. Other applications and consignment portals cannot see it.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {activeNoteModal.noteText && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveNoteModal({
                      ...activeNoteModal,
                      noteText: "",
                    })
                  }
                  className="ui-btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  Clear note
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setActiveNoteModal(null)}
                  className="ui-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingNote}
                  onClick={handleSavePersonalNote}
                  className="ui-btn-primary"
                >
                  {isSavingNote ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" />
                      <span>Save note</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Shipping Rate Presets Modal ── */}
      <ShippingPresetsModal
        isOpen={isPresetsModalOpen}
        onClose={() => setIsPresetsModalOpen(false)}
        onPresetsUpdated={handleRefresh}
      />
    </div>
  );
}
