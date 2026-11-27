"use client";

import { formatCbm, summarizeCartons } from "@/lib/dimension-helper";
import React, { useState } from "react";
import { getOrderTone } from "@/lib/order-tone";
import { AppointmentOrder } from "@/lib/types";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { formatDateDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { MarkDeliveredModal } from "@/components/delivery/MarkDeliveredModal";
import { getKanbanStage, isOnAppointmentDesk, type KanbanStage } from "@/lib/order-filters";
import {
  Clock,
  Truck,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Building,
  ExternalLink,
  Eye,
  ArrowRight,
  Layers,
  Hash,
  Calendar,
} from "lucide-react";

interface KanbanViewProps {
  orders: AppointmentOrder[];
  /** Exact per-column totals from the server (columns are loaded separately, capped at columnLimit). */
  stageCounts?: Record<string, number>;
  columnLimit?: number;
  isLoading: boolean;
  onOpenOrderDrawer: (order: AppointmentOrder) => void;
  onQuickNoteClick?: (order: AppointmentOrder) => void;
  onOrderUpdated?: () => void;
}

interface KanbanColumn {
  id: string;
  stage: KanbanStage;
  title: string;
  hint: string;
  category: "remaining" | "gone" | "issue";
  icon: React.ReactNode;
  /** Small colour dot next to the column title (the only colour in the header). */
  dot: string;
}

/** The server tags each row with its stage; the shared classifier is the fallback (same rules). */
const stageOf = (o: AppointmentOrder): KanbanStage => ((o as any).kanbanStage as KanbanStage) || getKanbanStage(o);

export function KanbanView({
  orders,
  stageCounts,
  columnLimit,
  isLoading,
  onOpenOrderDrawer,
  onQuickNoteClick,
  onOrderUpdated,
}: KanbanViewProps) {
  const { showToast } = useToast();
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null);
  // Delivered requires a POD upload, so it opens the POD form instead of a one-tap status change
  const [deliverOrder, setDeliverOrder] = useState<AppointmentOrder | null>(null);

  // Quick milestone action: writes the shipment milestone (courierStatus) only — never the order
  // status. In Transit comes only from the main app's BoxTrace gate; Delivered only with a POD.
  const handleQuickMilestone = async (order: AppointmentOrder, milestone: string) => {
    setIsUpdatingId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierStatus: milestone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      showToast(`Moved ${order.roPoNumber} to "${milestone}"`, "success");
      onOrderUpdated?.();
    } catch (err: any) {
      showToast(err.message || "Failed to update status", "error");
    } finally {
      setIsUpdatingId(null);
    }
  };

  const columns: KanbanColumn[] = [
    {
      id: "remaining_pending",
      stage: "remaining",
      title: "Remaining",
      hint: "To book",
      category: "remaining",
      icon: <Clock className="h-4 w-4 text-slate-400" />,
      dot: "bg-amber-500",
    },
    {
      id: "booked_ready",
      stage: "booked",
      title: "Booked",
      hint: "CN / scheduled",
      category: "remaining",
      icon: <CalendarCheck className="h-4 w-4 text-slate-400" />,
      dot: "bg-sky-500",
    },
    {
      id: "in_transit_gone",
      stage: "in_transit",
      title: "Gone",
      hint: "In transit",
      category: "gone",
      icon: <Truck className="h-4 w-4 text-slate-400" />,
      dot: "bg-violet-500",
    },
    {
      id: "delivered_gone",
      stage: "delivered",
      title: "Delivered",
      hint: "Completed",
      category: "gone",
      icon: <CheckCircle2 className="h-4 w-4 text-slate-400" />,
      dot: "bg-emerald-500",
    },
    {
      id: "grn_issue",
      stage: "grn_issue",
      title: "GRN discrepancy",
      hint: "Needs attention",
      category: "issue",
      icon: <AlertTriangle className="h-4 w-4 text-slate-400" />,
      dot: "bg-rose-500",
    },
  ];

  // Column totals: exact server counts when available, otherwise the loaded rows
  const loadedByStage = (stage: KanbanStage) => orders.filter((o) => stageOf(o) === stage);
  const totalFor = (stage: KanbanStage) => stageCounts?.[stage] ?? loadedByStage(stage).length;

  // Calculate Gone vs Remaining summaries (same stage partition as the columns)
  const remainingCount = totalFor("remaining") + totalFor("booked");
  const goneCount = totalFor("in_transit") + totalFor("delivered");
  const issueCount = totalFor("grn_issue");

  if (isLoading) {
    return (
      <div className="ui-card flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />
          <span>Loading pipeline…</span>
        </div>
      </div>
    );
  }

  const summary = [
    {
      key: "remaining",
      label: "Remaining",
      value: remainingCount,
      unit: "at warehouse",
      note: "Pending / booked",
      icon: <Clock className="h-4 w-4 text-amber-600" />,
      iconBg: "bg-amber-50",
    },
    {
      key: "gone",
      label: "Gone",
      value: goneCount,
      unit: "dispatched",
      note: "In transit / delivered",
      icon: <Truck className="h-4 w-4 text-violet-600" />,
      iconBg: "bg-violet-50",
    },
    {
      key: "issue",
      label: "GRN issues",
      value: issueCount,
      unit: "dock alerts",
      note: "Requires attention",
      icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
      iconBg: "bg-rose-50",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Gone vs Remaining summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((m) => (
          <div key={m.key} className="ui-card flex items-center gap-3 px-4 py-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${m.iconBg}`}>{m.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="ui-muted font-medium">{m.label}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums text-slate-900">{m.value}</span>
                <span className="text-xs text-slate-500">{m.unit}</span>
              </div>
            </div>
            <span className="ui-muted hidden text-right lg:block">{m.note}</span>
          </div>
        ))}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
        {columns.map((col) => {
          const colOrders = loadedByStage(col.stage);
          const colTotal = totalFor(col.stage);

          return (
            <section
              key={col.id}
              className="flex min-w-[280px] max-w-[340px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100/60 sm:min-w-[300px]"
            >
              {/* Column header */}
              <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} aria-hidden />
                  <h3 className="truncate text-sm font-semibold text-slate-900">{col.title}</h3>
                  <span className="ui-muted truncate">{col.hint}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {col.icon}
                  <span className="ui-count">{colTotal}</span>
                </div>
              </header>
              {colOrders.length < colTotal && (
                <div className="border-b border-slate-200 bg-white/70 px-3 py-1.5 text-[11px] text-slate-500">
                  Showing {colOrders.length} of {colTotal}
                  {columnLimit ? ` (first ${columnLimit} by current sort)` : ""} — narrow with filters to see the rest
                </div>
              )}

              {/* Cards */}
              <div className="max-h-[calc(100vh-280px)] flex-1 space-y-2 overflow-y-auto p-2">
                {colOrders.length === 0 ? (
                  <div className="px-3 py-10 text-center text-xs text-slate-400">No orders in this stage</div>
                ) : (
                  colOrders.map((order) => {
                    const isBusy = isUpdatingId === order.id;
                    const cbm = summarizeCartons(order).totalCbm;
                    const boxes = order.boxCount || 1;

                    return (
                      <article
                        key={order.id}
                        className="group relative space-y-2.5 rounded-lg border border-slate-200 border-l-[3px] bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
                        style={{ borderLeftColor: getOrderTone(order as any).tone.accent }}
                      >
                        {/* RO number, channel, quick actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="ui-mono truncate text-[13px] font-semibold text-slate-900">
                              {order.roPoNumber}
                            </div>
                            <ChannelBadge channel={order.channel} size="sm" />
                          </div>

                          <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                            {order.personalNote && (
                              <button
                                type="button"
                                onClick={() => onQuickNoteClick?.(order)}
                                className="ui-icon-btn h-7 w-7 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                title={`Private note: ${order.personalNote}`}
                              >
                                <Lock className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onOpenOrderDrawer(order)}
                              className="ui-icon-btn h-7 w-7"
                              title="Inspect details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Warehouse */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{order.warehouseName || "Destination pending"}</span>
                        </div>

                        {/* Boxes · CBM, carrier */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="tabular-nums">
                              <span className="font-semibold text-slate-900">{boxes}</span> box{boxes > 1 ? "es" : ""}
                              {cbm !== null && <span className="text-slate-500"> · {formatCbm(cbm)}</span>}
                            </span>
                          </span>

                          {order.courierPartner && (
                            <span className="ui-chip max-w-[50%] truncate">
                              <Truck className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="truncate">{order.courierPartner}</span>
                            </span>
                          )}
                        </div>

                        {/* CN and dates */}
                        {(order.trackingId || order.appointmentDate || order.pickupDate) && (
                          <dl className="space-y-1 border-t border-slate-100 pt-2 text-[11px]">
                            {order.trackingId && (
                              <div className="flex items-center gap-1.5">
                                <Hash className="h-3 w-3 shrink-0 text-slate-400" />
                                <dt className="text-slate-500">CN</dt>
                                <dd className="ui-mono truncate font-medium text-slate-900">{order.trackingId}</dd>
                              </div>
                            )}

                            {order.appointmentDate && (
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
                                <dt className="text-slate-500">Appt</dt>
                                <dd className="tabular-nums font-medium text-slate-900">
                                  {formatDateDisplay(order.appointmentDate)}
                                  {order.appointmentSlot ? <span className="font-normal text-slate-500"> · {order.appointmentSlot}</span> : ""}
                                </dd>
                              </div>
                            )}

                            {order.pickupDate && !order.appointmentDate && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                                <dt className="text-slate-500">Pickup</dt>
                                <dd className="tabular-nums font-medium text-slate-900">{formatDateDisplay(order.pickupDate)}</dd>
                              </div>
                            )}
                          </dl>
                        )}

                        {col.id === "grn_issue" && (
                          <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800">
                            <span className="font-semibold">Discrepancy:</span> {order.grnReport || order.comment || "Dock Issue"}
                          </div>
                        )}

                        {/* Footer: main app link + stage action */}
                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                          <a
                            href={`https://consignmentops.averretail.com/?search=${encodeURIComponent(order.roPoNumber)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-violet-600"
                            title="Open in Main Consignment Operations App"
                          >
                            <span>Consignment</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>

                          <div className="flex items-center gap-1">
                            {col.id === "remaining_pending" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickMilestone(order, "Tracking Assigned")}
                                className="ui-btn-primary ui-btn-sm"
                                title="Set the shipment milestone to Tracking Assigned"
                              >
                                <span>Booked</span>
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            )}

                            {/* No "Ship" action: In Transit is recorded only by the BoxTrace dual-scan gate in the main app */}

                            {col.id === "in_transit_gone" && isOnAppointmentDesk(order) && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setDeliverOrder(order)}
                                className="ui-btn-success ui-btn-sm"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Delivered</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <MarkDeliveredModal
        key={deliverOrder?.id || "none"}
        order={deliverOrder}
        onClose={() => setDeliverOrder(null)}
        onDelivered={() => {
          setDeliverOrder(null);
          onOrderUpdated?.();
        }}
      />
    </div>
  );
}
