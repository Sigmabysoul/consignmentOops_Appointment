"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { OrdersTable } from "@/components/table/OrdersTable";
import { KanbanView } from "@/components/views/KanbanView";
import { TimelineView } from "@/components/views/TimelineView";
import { OrderDetailsDrawer } from "@/components/drawer/OrderDetailsDrawer";
import {
  SessionUser,
  AppointmentOrder,
  CourierPresetItem,
  DashboardStats,
  ActiveView,
} from "@/lib/types";

export default function AppointmentDashboard() {
  const router = useRouter();

  // Authentication State
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // View Mode: Sheet, Kanban, Timeline, Analytics
  const [activeView, setActiveView] = useState<ActiveView>("sheet");

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
  const [dateType, setDateType] = useState<string>("appointmentDate");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Selected Order for Drawer
  const [selectedDrawerOrder, setSelectedDrawerOrder] = useState<AppointmentOrder | null>(null);

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
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) {
          setStats(data.stats);
        }
      })
      .catch(() => {});
  }, []);

  // 4. Fetch Paginated Orders
  const fetchOrders = useCallback(() => {
    if (!currentUser) return;
    setIsLoadingOrders(true);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      search: searchTerm,
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

    fetch(`/api/orders?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.orders) {
          setOrders(data.orders);
          setTotalOrders(data.pagination.total);
          setTotalPages(data.pagination.totalPages);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingOrders(false);
        setIsRefreshing(false);
      });
  }, [
    currentUser,
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
  ]);

  // Refetch when filters or pagination change
  useEffect(() => {
    if (currentUser) {
      fetchOrders();
      fetchStats();
    }
  }, [currentUser, fetchOrders, fetchStats]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchOrders();
    fetchStats();
  };

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
    setSortBy("createdAt");
    setSortDir("desc");
    setPage(1);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white">
          <span className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-300">
            Initializing Appointment Management Desk...
          </span>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6fa]">
      {/* ── ConsignmentOps Purple Header with Top Views & Platform Bar ── */}
      <AppHeader
        user={currentUser}
        activeView={activeView}
        onSelectView={setActiveView}
        selectedPlatform={selectedChannel}
        onSelectPlatform={(platform) => {
          setSelectedChannel(platform);
          setPage(1);
        }}
        channelCounts={stats?.channelCounts || {}}
        totalOrdersCount={stats?.totalOrders || totalOrders}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* ── Main Workspace ── */}
      <main className="flex-1 p-3 sm:p-5 lg:p-6 w-full max-w-[1700px] mx-auto flex flex-col gap-4">
        {/* Metric Overview (when in Analytics view or summary mode) */}
        {activeView === "analytics" ? (
          <div className="space-y-6">
            <MetricCards
              stats={stats}
              onSelectMetric={(statusKey) => {
                if (statusKey === "delivered") setSelectedDeliveryStatus("DELIVERED");
                else if (statusKey === "in_transit") setSelectedDeliveryStatus("IN_TRANSIT");
                else if (statusKey === "pending") setSelectedStatus("Pending");
                else if (statusKey === "appointments") setQuickDate("today");
                setActiveView("sheet");
              }}
            />

            {/* Detailed Analytics Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider mb-3">
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

              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider mb-3">
                  Active Destinations & Warehouses
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(stats?.warehouses || []).map((wh) => (
                    <div
                      key={wh}
                      onClick={() => {
                        setSelectedWarehouse(wh);
                        setActiveView("sheet");
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

              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider mb-3">
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

        {/* View 1: Spreadsheet Table (Primary Operational View) */}
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
            />
          </div>
        )}

        {/* View 2: Kanban Pipeline View */}
        {activeView === "kanban" && (
          <div className="flex-1">
            <KanbanView
              orders={orders}
              isLoading={isLoadingOrders}
              onOpenOrderDrawer={(order) => setSelectedDrawerOrder(order)}
              onQuickNoteClick={(order) => setSelectedDrawerOrder(order)}
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
              onQuickNoteClick={(order) => setSelectedDrawerOrder(order)}
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
    </div>
  );
}
