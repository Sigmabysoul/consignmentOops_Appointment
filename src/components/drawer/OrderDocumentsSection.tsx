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
      <p className="text-[11px] text-slate-500">
        Files are kept with the order in the shared database, so the main consignment app sees them too.
      </p>

      {loadError && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

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
            className={`rounded-xl border p-3.5 transition ${
              isDragOver ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200" : latest ? "border-slate-200 bg-white" : "border-dashed border-slate-300 bg-slate-50/60"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${latest ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-white text-slate-400 border border-slate-200"}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-extrabold text-slate-900">{slot.label}</h4>
                  {loading ? (
                    <span className="text-[10px] text-slate-400">Loading…</span>
                  ) : latest ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> On file
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Missing</span>
                  )}
                  {slot.slot === "SHIPPING_LABEL" && labelCount > 0 && (
                    <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                      {labelCount} box label{labelCount === 1 ? "" : "s"} for BoxTrace
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{slot.hint}</p>

                {slotDocs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {slotDocs.map((d, idx) => (
                      <li key={d.id} className={`flex items-center gap-2 text-[11px] ${idx > 0 ? "text-slate-400" : "text-slate-700"}`}>
                        <span className="font-semibold truncate max-w-[220px]" title={d.fileName}>
                          {d.fileName}
                        </span>
                        <span className="shrink-0">{formatSize(d.fileSize)}</span>
                        <span className="shrink-0 truncate">
                          · {formatDateTimeDisplay(d.uploadedAt)}
                          {d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
                        </span>
                        {d.viewUrl && (
                          <a
                            href={d.viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto shrink-0 font-bold text-violet-700 hover:underline flex items-center gap-1"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
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
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        <span>{isBusy ? "Uploading…" : latest ? "Upload new version" : `Upload ${slot.label.toLowerCase()}`}</span>
                      </button>
                      <span className="text-[10px] text-slate-400">or drop a file here · {slot.extensions.join(", ")}</span>
                    </>
                  ) : latest ? null : canMarkDelivered ? (
                    <button
                      type="button"
                      onClick={onMarkDelivered}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>Mark Delivered & upload POD</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500">The POD is added when the order is marked Delivered (once it is in transit).</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
