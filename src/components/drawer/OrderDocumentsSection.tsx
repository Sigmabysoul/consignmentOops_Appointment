"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Tag, ClipboardCheck, Upload, ExternalLink, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { AppointmentOrder } from "@/lib/types";
import { DOCUMENT_SLOTS, DocumentSlot, DocumentSlotConfig, OrderDocumentView } from "@/lib/order-documents";
import { isOnAppointmentDesk } from "@/lib/order-filters";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useToast } from "@/components/ui/Toast";

const SLOT_ICONS: Record<DocumentSlot, React.ComponentType<{ className?: string }>> = {
  TAX_INVOICE: FileText,
  SHIPPING_LABEL: Tag,
  POD: ClipboardCheck,
};

interface OrderDocumentsSectionProps {
  order: AppointmentOrder;
  /** Opens the Mark Delivered (POD) form owned by the drawer. */
  onMarkDelivered: () => void;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Documents tab of the order drawer: tax invoice, courier shipping label (sent on to the main app
 * so BoxTrace can scan against it) and POD (uploaded with Mark Delivered).
 */
export function OrderDocumentsSection({ order, onMarkDelivered }: OrderDocumentsSectionProps) {
  const { showToast } = useToast();
  const [docs, setDocs] = useState<OrderDocumentView[]>([]);
  const [labelCount, setLabelCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<DocumentSlot | null>(null);
  const [dragSlot, setDragSlot] = useState<DocumentSlot | null>(null);
  const inputs = useRef<Partial<Record<DocumentSlot, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/documents`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load documents");
      setDocs(data.documents || []);
      setLabelCount(Number(data.shippingLabelBarcodeCount) || 0);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const upload = async (slot: DocumentSlotConfig, file: File | undefined | null) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!slot.extensions.includes(ext)) {
      showToast(`${slot.label} must be one of: ${slot.extensions.join(", ")}`, "error");
      return;
    }
    setUploading(slot.slot);
    try {
      const form = new FormData();
      form.append("slot", slot.slot);
      form.append("file", file);
      const res = await fetch(`/api/orders/${order.id}/documents`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (slot.slot === "SHIPPING_LABEL") {
        const n = Number(data.extractedBarcodeCount) || 0;
        showToast(
          n > 0
            ? `Label sent to the main app: ${n} box label${n === 1 ? "" : "s"} read for BoxTrace`
            : "Label saved, but no box barcodes could be read from it. Check the file in the main app.",
          n > 0 ? "success" : "info"
        );
      } else if (slot.slot === "TAX_INVOICE" && data.invoice) {
        const inv = data.invoice;
        if (typeof inv.value === "number") {
          const amt = `₹${inv.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          showToast(`Invoice${inv.number ? ` ${inv.number}` : ""} uploaded: value ${amt} saved for freight quotes`, "success");
        } else {
          showToast(`Invoice uploaded. ${inv.problem || "Its value could not be read."}`, "info");
        }
      } else {
        showToast(`${slot.label} uploaded`, "success");
      }
      await load();
    } catch (err: any) {
      showToast(err.message || "Upload failed", "error");
    } finally {
      setUploading(null);
      const el = inputs.current[slot.slot];
      if (el) el.value = "";
    }
  };

  const canMarkDelivered = isOnAppointmentDesk(order as any);

  return (
    <div className="space-y-3">
      <p className="ui-muted">Files are kept with the order in the shared database, so the main consignment app sees them too.</p>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={() => void load()} className="ui-btn-ghost ui-btn-sm text-rose-700">
            Retry
          </button>
        </div>
      )}

      <div className="ui-card divide-y divide-slate-100 overflow-hidden">
        {DOCUMENT_SLOTS.map((slot) => {
          const Icon = SLOT_ICONS[slot.slot];
          const slotDocs = docs.filter((d) => d.slot === slot.slot);
          const latest = slotDocs[0];
          const isBusy = uploading === slot.slot;
          const acceptsUpload = slot.slot !== "POD";
          const isDragOver = dragSlot === slot.slot;

          return (
            <div
              key={slot.slot}
              onDragOver={(e) => {
                if (!acceptsUpload) return;
                e.preventDefault();
                setDragSlot(slot.slot);
              }}
              onDragLeave={() => setDragSlot((s) => (s === slot.slot ? null : s))}
              onDrop={(e) => {
                if (!acceptsUpload) return;
                e.preventDefault();
                setDragSlot(null);
                void upload(slot, e.dataTransfer.files?.[0]);
              }}
              className={`p-4 transition ${isDragOver ? "bg-violet-50 ring-2 ring-inset ring-violet-300" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    latest ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{slot.label}</h4>
                    {loading ? (
                      <span className="ui-muted">Loading…</span>
                    ) : latest ? (
                      <span className="ui-chip border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> On file
                      </span>
                    ) : (
                      <span className="ui-chip border-amber-200 bg-amber-50 text-amber-800">Missing</span>
                    )}
                    {slot.slot === "SHIPPING_LABEL" && labelCount > 0 && (
                      <span className="ui-chip">
                        {labelCount} box label{labelCount === 1 ? "" : "s"} for BoxTrace
                      </span>
                    )}
                  </div>
                  <p className="ui-muted mt-0.5">{slot.hint}</p>

                  {slotDocs.length > 0 && (
                    <ul className="mt-2.5 divide-y divide-slate-100 rounded-lg bg-slate-50">
                      {slotDocs.map((d, idx) => (
                        <li key={d.id} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${idx > 0 ? "text-slate-400" : "text-slate-700"}`}>
                          <span className="max-w-[220px] truncate font-medium" title={d.fileName}>
                            {d.fileName}
                          </span>
                          <span className="shrink-0 text-[11px]">{formatSize(d.fileSize)}</span>
                          <span className="shrink-0 truncate text-[11px]">
                            · {formatDateTimeDisplay(d.uploadedAt)}
                            {d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
                          </span>
                          {d.viewUrl && (
                            <a
                              href={d.viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto flex shrink-0 items-center gap-1 font-semibold text-violet-700 hover:underline"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {acceptsUpload ? (
                      <>
                        <input
                          ref={(el) => {
                            inputs.current[slot.slot] = el;
                          }}
                          type="file"
                          accept={slot.extensions.map((e) => `.${e}`).join(",")}
                          className="hidden"
                          onChange={(e) => void upload(slot, e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          disabled={isBusy || Boolean(uploading)}
                          onClick={() => inputs.current[slot.slot]?.click()}
                          className={latest ? "ui-btn-secondary" : "ui-btn-primary"}
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          <span>{isBusy ? "Uploading…" : latest ? "Upload new version" : `Upload ${slot.label.toLowerCase()}`}</span>
                        </button>
                        <span className="text-[11px] text-slate-400">or drop a file here · {slot.extensions.join(", ")}</span>
                      </>
                    ) : latest ? null : canMarkDelivered ? (
                      <button type="button" onClick={onMarkDelivered} className="ui-btn-success">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        <span>Mark Delivered & upload POD</span>
                      </button>
                    ) : (
                      <span className="ui-muted">The POD is added when the order is marked Delivered (once it is in transit).</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
