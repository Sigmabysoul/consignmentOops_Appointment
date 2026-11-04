"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusTabs } from "@/components/layout/StatusTabs";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { OrdersTable } from "@/components/table/OrdersTable";
import { OrderDetailsDrawer } from "@/components/drawer/OrderDetailsDrawer";
import { SessionUser, AppointmentOrder, CourierPresetItem, DashboardStats } from "@/lib/types";

export default function AppointmentDashboard() {
  const router = useRouter();

  // Authentication State
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Data States
  const [orders, setOrders] = useState<AppointmentOrder[]>([]);
  const [courierPresets, setCourierPresets] = useState<CourierPresetItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter & Pagination States
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("ALL");
  const [selectedCourier, setSelectedCourier] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState<string>("ALL");
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

  // 3. Fetch Dashboard Stats
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
      tab: activeTab,
      search: searchTerm,
      channel: selectedChannel,
      courier: selectedCourier,
      courierStatus: selectedStatus,
      deliveryStatus: selectedDeliveryStatus,
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
    activeTab,
    searchTerm,
    selectedChannel,
    selectedCourier,
    selectedStatus,
    selectedDeliveryStatus,
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

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
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
    <div className="min-h-screen flex flex-col bg-[#f8f9fc]">
      {/* ── App Header (ConsignmentOps Purple Navigation) ── */}
      <AppHeader
        user={currentUser}
        activeNavTab={activeTab}
        onSelectNavTab={handleTabChange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* ── Status Tabs (Live Counters) ── */}
      <StatusTabs
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        stats={stats}
      />

      {/* ── Main Workspace ── */}
      <main className="flex-1 p-3 sm:p-5 lg:p-6 w-full max-w-[1700px] mx-auto flex flex-col">
        {/* Metric Summary Indicators */}
        <MetricCards stats={stats} onSelectMetric={handleTabChange} />

        {/* Operational Orders Table */}
        <div className="flex-1">
          <OrdersTable
            orders={orders}
            isLoading={isLoadingOrders}
            courierPresets={courierPresets}
            page={page}
            pageSize={pageSize}
            totalOrders={totalOrders}
            totalPages={totalPages}
            onPageChange={setPage}
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
            onOpenOrderDrawer={(order) => setSelectedDrawerOrder(order)}
            onOrderUpdated={handleRefresh}
          />
        </div>
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

