"use client";

import { DateInput } from "@/components/ui/DateInput";
import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Calendar,
  Truck,
  Package,
  History,
  Save,
  ExternalLink,
  Shield,
  CheckCircle2,
  AlertCircle,
  Lock,
  Calculator,
  FileText,
  ChevronDown,
} from "lucide-react";
import { BookingDetailModal } from "@/components/booking/BookingDetailModal";
import { AppointmentOrder, CourierPresetItem } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { formatDateDisplay, formatDateTimeDisplay, formatDateInputValue } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";
import { BoxDimensionCopyHelper } from "@/components/booking/BoxDimensionCopyHelper";
import { extractBoxDimensionGroups, formatCbm, summarizeCartons } from "@/lib/dimension-helper";
import { isAmazonChannel, isFlipkartFbfOrFksb, getAllowedCouriersForChannel, isSameCourier } from "@/lib/courier-defaults";
import { APP2_COURIER_MILESTONES, isDeliveredOrder, isOnAppointmentDesk } from "@/lib/order-filters";

import { DelhiveryDrawerSection } from "@/components/delhivery/DelhiveryDrawerSection";
import { MarkDeliveredModal } from "@/components/delivery/MarkDeliveredModal";
import { OrderDocumentsSection } from "@/components/drawer/OrderDocumentsSection";
import { ShiprocketDrawerSection } from "@/components/shiprocket/ShiprocketDrawerSection";
import { hasPodOnRecord } from "@/lib/pod";

interface OrderDetailsDrawerProps {
  order: AppointmentOrder | null;
  onClose: () => void;
  courierPresets: CourierPresetItem[];
  onOrderUpdated: () => void;
}

export function OrderDetailsDrawer({
  order,
  onClose,
  courierPresets,
  onOrderUpdated,
}: OrderDetailsDrawerProps) {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"edit" | "documents" | "history">("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [detailedOrder, setDetailedOrder] = useState<AppointmentOrder | null>(order);
  // Delivered needs a POD: "Mark Delivered" opens the POD form (POST /api/orders/[id]/deliver)
  const [podFormOpen, setPodFormOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  // Form Fields
  const [trackingId, setTrackingId] = useState("");
  const [courierPartner, setCourierPartner] = useState("");
  const [trackingLink, setTrackingLink] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentSlot, setAppointmentSlot] = useState("");
  const [courierStatus, setCourierStatus] = useState("Pending");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [comment, setComment] = useState("");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [personalNote, setPersonalNote] = useState("");
  const [personalNoteInfo, setPersonalNoteInfo] = useState<{
    updatedAt: string | null;
    updatedBy: string | null;
  }>({ updatedAt: null, updatedBy: null });
  // Values the form opened with: only fields the operator actually changed are sent on save, so an
  // untouched field never overwrites what the main app / courier integrations wrote meanwhile.
  const initialRef = useRef<Record<string, string>>({});

  // Sync state when order changes & fetch full details (including history and audit logs)
  useEffect(() => {
    if (!order) return;

    const defaultCourier = isAmazonChannel(order.channel) ? "Amazon ATS" : "";
    const initial = {
      trackingId: order.trackingId || "",
      courierPartner: order.courierPartner || defaultCourier,
      trackingLink: order.trackingLink || "",
      appointmentId: order.appointmentId || "",
      appointmentDate: formatDateInputValue(order.appointmentDate),
      appointmentSlot: order.appointmentSlot || "",
      // The milestone lives in courierStatus; the order status belongs to the main app
      courierStatus: order.courierStatus || "Pending",
      deliveryDate: formatDateInputValue(order.deliveryDate),
      comment: order.comment || "",
      personalNote: order.personalNote || "",
    };
    // The stored courier (not the channel default) is what "unchanged" is measured against
    initialRef.current = { ...initial, courierPartner: order.courierPartner || "" };
    setTrackingId(initial.trackingId);
    setCourierPartner(initial.courierPartner);
    setTrackingLink(initial.trackingLink);
    setAppointmentId(initial.appointmentId);
    setAppointmentDate(initial.appointmentDate);
    setAppointmentSlot(initial.appointmentSlot);
    setCourierStatus(initial.courierStatus);
    setDeliveryDate(initial.deliveryDate);
    setComment(initial.comment);
    setStatusRemarks("");
    setPersonalNote(order.personalNote || "");
    setPersonalNoteInfo({
      updatedAt: order.personalNoteUpdatedAt || null,
      updatedBy: order.personalNoteUpdatedBy || null,
    });
    setValidationError(null);

    // Fetch complete history & isolated personal note
    setIsLoadingDetails(true);
    fetch(`/api/orders/${order.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.order) {
          setDetailedOrder(data.order);
          if (data.order.personalNote !== undefined) {
            initialRef.current = { ...initialRef.current, personalNote: data.order.personalNote || "" };
            setPersonalNote(data.order.personalNote || "");
            setPersonalNoteInfo({
              updatedAt: data.order.personalNoteUpdatedAt || null,
              updatedBy: data.order.personalNoteUpdatedBy || null,
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingDetails(false));
  }, [order]);

  if (!order) return null;

  const current = detailedOrder || order;
  const deliveredWithPod = isDeliveredOrder(current) && hasPodOnRecord(current.customData);
  const canMarkDelivered = isOnAppointmentDesk(current);

  /** Sends only the fields that differ from what the drawer opened with; never the order status. */
  const performSave = async (afterDelivery = false) => {
    setIsSaving(true);
    setValidationError(null);

    try {
      const init = initialRef.current;
      const payload: Record<string, any> = {};
      const changed = (key: string, value: string) => value.trim() !== (init[key] || "").trim();
      if (changed("trackingId", trackingId)) payload.trackingId = trackingId.trim();
      // Courier: never re-send an unchanged courier ("Delhivery" == "Delhivery One"); "" only when explicitly cleared
      if (!isSameCourier(courierPartner, init.courierPartner)) payload.courierPartner = courierPartner.trim();
      if (changed("trackingLink", trackingLink)) payload.trackingLink = trackingLink.trim();
      if (changed("appointmentId", appointmentId)) payload.appointmentId = appointmentId.trim();
      if (changed("appointmentDate", appointmentDate)) payload.appointmentDate = appointmentDate || null;
      if (changed("appointmentSlot", appointmentSlot)) payload.appointmentSlot = appointmentSlot.trim();
      if (!afterDelivery && changed("courierStatus", courierStatus)) payload.courierStatus = courierStatus.trim();
      if (!afterDelivery && deliveredWithPod && changed("deliveryDate", deliveryDate)) payload.deliveryDate = deliveryDate || null;
      if (changed("comment", comment)) payload.comment = comment.trim();
      if (changed("personalNote", personalNote)) payload.personalNote = personalNote.trim();

      if (Object.keys(payload).length === 0) {
        if (!afterDelivery) showToast("No changes to save", "success");
        return;
      }
      if (statusRemarks.trim()) payload.remarks = statusRemarks.trim();

      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || "Failed to update order";
        setValidationError(errorMsg);
        throw new Error(errorMsg);
      }

      showToast("Logistics information updated successfully", "success");
      if (Array.isArray(data.warnings)) data.warnings.forEach((w: string) => showToast(w, "info"));
      onOrderUpdated();

      // Refresh drawer details; the saved values become the new baseline
      if (data.order) {
        setDetailedOrder(data.order);
      }
      initialRef.current = {
        ...init,
        ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v == null ? "" : String(v)])),
      };
    } catch (err: any) {
      showToast(err.message || "Failed to save updates", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    await performSave();
  };

  // Milestones this app may write (courierStatus only). In Transit is set by the main app's BoxTrace
  // gate, Delivered by "Mark Delivered" with a POD, GRN Issue by the main app's GRN desk.
  const availableStatuses: string[] = [...APP2_COURIER_MILESTONES];

  const deliveredTo =
    (detailedOrder?.customData as any)?.deliveredTo ||
    (order.customData as any)?.deliveredTo ||
    (order.customData as any)?.warehouseAddress ||
    order.client?.address;
  const roExpiry = order.roExpiryDate || (order.customData as any)?.roExpiryDate;
  const cartons = summarizeCartons(detailedOrder || order);
  const boxes = cartons.totalBoxes || order.boxCount || 1;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div className="ui-overlay animate-fade-in" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="ui-eyebrow">Consignment</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="ui-mono truncate text-lg font-semibold tracking-tight text-slate-900">{order.roPoNumber}</span>
                <ChannelBadge channel={order.channel} />
              </div>
              <div className="ui-muted mt-0.5 truncate">
                {order.client?.name ? `${order.client.name} · ` : ""}
                {order.warehouseName || "Logistics & appointment operations"}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={`https://consignmentops.averretail.com/?search=${encodeURIComponent(order.roPoNumber)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn-secondary"
                title="Open this consignment in the Main Consignment App"
              >
                <span>Consignment App</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <button type="button" onClick={onClose} className="ui-icon-btn" aria-label="Close" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tabs (underline) */}
          <div className="-mb-px mt-3 flex gap-1" role="tablist">
            <TabButton active={activeTab === "edit"} onClick={() => setActiveTab("edit")} icon={Truck} label="Logistics & appointment" />
            <TabButton active={activeTab === "documents"} onClick={() => setActiveTab("documents")} icon={FileText} label="Documents" />
            <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")} icon={History} label="Activity history" />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/70">
          {activeTab === "edit" ? (
            <form onSubmit={handleSave} className="flex min-h-full flex-col">
              <div className="flex-1 space-y-4 p-5">
                {/* Validation error */}
                {validationError && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 animate-shake">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <div>
                      <span className="font-semibold">Validation error: </span>
                      <span>{validationError}</span>
                    </div>
                  </div>
                )}

                {/* Order information (read-only) */}
                <Section icon={Package} title="Order information">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    <Field label="Client / customer">
                      {order.client?.name ? `${order.client.name} (${order.client.code})` : "—"}
                    </Field>
                    <Field label="Destination warehouse">{order.warehouseName || "—"}</Field>
                    <Field label="Order date">{formatDateDisplay(order.orderDate)}</Field>
                    <Field label="Pickup date">{formatDateDisplay(order.pickupDate)}</Field>
                    {roExpiry && (
                      <Field label="RO expiry date">
                        <span className="text-amber-700">{formatDateDisplay(roExpiry)}</span>
                      </Field>
                    )}
                    <Field label="Total boxes">
                      {boxes} box{boxes === 1 ? "" : "es"}
                    </Field>
                    <Field label="Total CBM">
                      <span className="ui-mono">{formatCbm(cartons.totalCbm)}</span>
                    </Field>
                    {deliveredTo && (
                      <div className="col-span-2 sm:col-span-3">
                        <dt className="ui-label">Delivered to address</dt>
                        <dd className="select-all rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
                          {deliveredTo}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {/* SKUs: collapsed by default, one tidy row per line item */}
                  {detailedOrder?.items && detailedOrder.items.length > 0 && (
                    <details className="group mt-4 border-t border-slate-100 pt-3">
                      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                        <span className="text-xs font-medium text-slate-600">
                          Consignment SKUs · {detailedOrder.items.length} item{detailedOrder.items.length === 1 ? "" : "s"} ·{" "}
                          {detailedOrder.items.reduce((n, it) => n + (it.totalQty || 0), 0).toLocaleString("en-IN")} pcs
                        </span>
                        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg bg-slate-50">
                        {detailedOrder.items.map((it) => (
                          <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                            <span className="truncate text-slate-700" title={it.itemName || "Item"}>
                              {it.itemName || "Item"}
                            </span>
                            <span className="ui-mono shrink-0 font-medium text-slate-900">{it.totalQty ?? "—"} pcs</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Section>

                {/* Box dimensions: 1-click copy wizard (has its own titled panel) */}
                <BoxDimensionCopyHelper
                  groups={detailedOrder?.boxDimensionGroups || (order ? extractBoxDimensionGroups(order) : [])}
                  compact={false}
                  orderNumber={order.roPoNumber}
                />

                {/* Carrier & tracking (editable) */}
                <Section
                  icon={Truck}
                  title="Carrier & tracking"
                  action={
                    <button
                      type="button"
                      onClick={() => setIsPricingModalOpen(true)}
                      className="ui-btn-secondary ui-btn-sm"
                      title="Compare shipping rates between OM Logistics & partners"
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      <span>Compare shipping rates</span>
                    </button>
                  }
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="ui-label">Courier partner</label>
                      <select value={courierPartner} onChange={(e) => setCourierPartner(e.target.value)} className="ui-select">
                        <option value="">Select courier partner...</option>
                        {/* A courier set in the main app that this desk does not offer (e.g. "Local") is shown, kept as-is */}
                        {courierPartner && !getAllowedCouriersForChannel(order?.channel).includes(courierPartner) && (
                          <option value={courierPartner}>{courierPartner}</option>
                        )}
                        {getAllowedCouriersForChannel(order?.channel).map((courierName) => {
                          const isRec = isFlipkartFbfOrFksb(order?.channel) && courierName === "Ekart";
                          return (
                            <option key={courierName} value={courierName}>
                              {courierName}
                              {isRec ? " (Recommended)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="ui-label">Tracking ID / AWB number</label>
                      <input
                        type="text"
                        placeholder="e.g. OML12345678"
                        value={trackingId}
                        onChange={(e) => setTrackingId(e.target.value)}
                        className="ui-input ui-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="ui-label">Custom tracking URL (optional override)</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="url"
                          placeholder="https://..."
                          value={trackingLink}
                          onChange={(e) => setTrackingLink(e.target.value)}
                          className="ui-input"
                        />
                        {trackingLink && (
                          <a
                            href={trackingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ui-btn-secondary h-[34px] shrink-0 px-2.5"
                            title="Open tracking page"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </Section>

                {/* Carrier API shipments (render only when booked through the API) */}
                <DelhiveryDrawerSection order={detailedOrder || order} onOrderUpdated={onOrderUpdated} />
                <ShiprocketDrawerSection order={detailedOrder || order} onOrderUpdated={onOrderUpdated} />

                {/* Appointment (editable) */}
                <Section icon={Calendar} title="Appointment">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="ui-label">Appointment reference ID</label>
                      <input
                        type="text"
                        placeholder="e.g. APPT-2026-0982"
                        value={appointmentId}
                        onChange={(e) => setAppointmentId(e.target.value)}
                        className="ui-input ui-mono"
                      />
                    </div>

                    <div>
                      <label className="ui-label">Appointment date</label>
                      <DateInput value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="ui-input" />
                    </div>

                    <div>
                      <label className="ui-label">Time slot</label>
                      <input
                        type="text"
                        placeholder="e.g. 10:00 AM - 01:00 PM"
                        value={appointmentSlot}
                        onChange={(e) => setAppointmentSlot(e.target.value)}
                        className="ui-input"
                      />
                    </div>

                    <div>
                      <label className="ui-label">Delivery date (when delivered)</label>
                      {deliveredWithPod ? (
                        <DateInput value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="ui-input" />
                      ) : (
                        <div className="truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-500">
                          {current.deliveryDate ? formatDateDisplay(current.deliveryDate) : "Recorded by Mark Delivered (POD)"}
                        </div>
                      )}
                    </div>
                  </div>
                </Section>

                {/* Shipment status & remarks */}
                <Section
                  icon={Shield}
                  title="Shipment status & remarks"
                  action={
                    /* Read-only badge (never clickable); Mark Delivered opens the POD form */
                    <StatusBadge status={courierStatus} />
                  }
                >
                  <div className="space-y-3">
                    <div>
                      <label className="ui-label">Shipment / courier status</label>
                      <div className="flex items-center gap-2">
                        <select value={courierStatus} onChange={(e) => setCourierStatus(e.target.value)} className="ui-select">
                          {availableStatuses.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                          {/* A status set elsewhere (e.g. GRN Issue from the main app's GRN desk) is shown, not offered */}
                          {courierStatus && !availableStatuses.includes(courierStatus) && (
                            <option value={courierStatus} disabled>
                              {courierStatus}
                            </option>
                          )}
                        </select>
                        {canMarkDelivered && (
                          <button
                            type="button"
                            onClick={() => setPodFormOpen(true)}
                            className="ui-btn-success h-[34px] shrink-0"
                            title="Mark Delivered — upload the POD (proof of delivery)"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Mark Delivered</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="ui-label">Operational notes / comment</label>
                      <textarea
                        rows={2}
                        placeholder="General operational logistics remarks for this shipment..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="ui-input resize-none"
                      />
                    </div>

                    <div>
                      <label className="ui-label">Status change reason (recorded in audit history)</label>
                      <input
                        type="text"
                        placeholder="e.g. Consignment handed over to carrier / Pod verified"
                        value={statusRemarks}
                        onChange={(e) => setStatusRemarks(e.target.value)}
                        className="ui-input"
                      />
                    </div>
                  </div>
                </Section>

                {/* Personal internal note (private to the Appointment desk) */}
                <Section
                  icon={Lock}
                  title="Internal personal note"
                  action={<span className="ui-chip border-amber-200 bg-amber-50 text-amber-800">Private · Appointment desk only</span>}
                >
                  <p className="ui-muted mb-2 leading-normal">
                    Stored only in Appointment desk storage. Never exported, shared, or shown in Consignment Ops or external portals.
                  </p>
                  <textarea
                    rows={3}
                    placeholder="Write personal operational notes, driver contacts, gate pass details, or reminders about this order..."
                    value={personalNote}
                    onChange={(e) => setPersonalNote(e.target.value)}
                    className="ui-input resize-none"
                  />
                  {personalNoteInfo.updatedAt && (
                    <div className="ui-muted mt-1.5 flex items-center justify-between">
                      <span>Last edited {formatDateTimeDisplay(personalNoteInfo.updatedAt)}</span>
                      {personalNoteInfo.updatedBy && <span>by {personalNoteInfo.updatedBy}</span>}
                    </div>
                  )}
                </Section>
              </div>

              {/* Footer actions (sticky at the bottom of the drawer) */}
              <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
                <button type="button" onClick={onClose} className="ui-btn-ghost px-4 py-2">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="ui-btn-primary px-4 py-2">
                  {isSaving ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Save changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : activeTab === "documents" ? (
            <div className="p-5">
              <OrderDocumentsSection order={current} onMarkDelivered={() => setPodFormOpen(true)} />
            </div>
          ) : (
            /* Activity history timeline */
            <div className="p-5">
              <Section
                icon={History}
                title="Activity timeline"
                action={<span className="ui-muted">Order status history & audit log</span>}
              >
                {isLoadingDetails ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading audit trail...</div>
                ) : detailedOrder?.statusHistory && detailedOrder.statusHistory.length > 0 ? (
                  <ol className="relative space-y-4 pl-5 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-slate-200">
                    {detailedOrder.statusHistory.map((item) => (
                      <li key={item.id} className="relative text-xs">
                        <span className="absolute -left-5 top-1 h-[11px] w-[11px] rounded-full border-2 border-white bg-violet-600 ring-1 ring-violet-200" />
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="font-semibold text-slate-900">
                            {item.fromStatus ? `${item.fromStatus} → ${item.toStatus}` : item.toStatus}
                          </span>
                          <span className="ui-mono text-[11px] text-slate-400">{formatDateTimeDisplay(item.timestamp)}</span>
                        </div>
                        <div className="mt-0.5 text-slate-600">{item.reason || "Status updated"}</div>
                        <div className="ui-muted mt-0.5">
                          by <span className="font-medium text-slate-700">{item.userName || "System"}</span>
                          {item.userRole && <span> ({item.userRole})</span>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">No status transition history recorded yet.</div>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>

      {/* ── Order Detail & Multi-Carrier Price Comparison Window ── */}
      <BookingDetailModal
        order={detailedOrder || order}
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        courierPresets={courierPresets}
        onOrderUpdated={() => {
          onOrderUpdated();
          if (order?.id) {
            fetch(`/api/orders/${order.id}`)
              .then((r) => r.json())
              .then((d) => {
                if (d.order?.courierPartner) {
                  setCourierPartner(d.order.courierPartner);
                }
              })
              .catch(() => {});
          }
        }}
      />

      {podFormOpen && (
        <MarkDeliveredModal
          order={detailedOrder || order}
          initialDeliveryDate={null}
          onClose={() => setPodFormOpen(false)}
          onDelivered={(updated) => {
            setPodFormOpen(false);
            if (updated) setDetailedOrder((prev) => ({ ...(prev || order), ...updated }));
            // Save the drawer's other edits (CN, appointment, remarks) now that Delivered is recorded
            void performSave(true);
          }}
        />
      )}
    </div>
  );
}

type IconType = React.ComponentType<{ className?: string }>;

/** Titled white card used for every drawer section. */
function Section({ icon: Icon, title, action, children }: { icon: IconType; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ui-card">
      <div className="ui-card-header">
        <h3 className="ui-card-title">
          <Icon className="h-4 w-4 text-slate-400" />
          <span>{title}</span>
        </h3>
        {action}
      </div>
      <div className="ui-card-body">{children}</div>
    </section>
  );
}

/** Definition-grid entry: label above value. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="ui-label">{label}</dt>
      <dd className="break-words text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: IconType; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
        active ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
