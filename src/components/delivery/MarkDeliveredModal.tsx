"use client";

import React, { useRef, useState } from "react";
import { CheckCircle2, FileCheck2, Upload, X } from "lucide-react";
import { DateInput } from "@/components/ui/DateInput";
import { useToast } from "@/components/ui/Toast";
import { formatDateInputValue } from "@/lib/date-utils";
import { MAX_POD_BYTES, POD_ACCEPTED_EXTENSIONS, isAcceptedPodFile } from "@/lib/pod";

interface MarkDeliveredModalProps {
  order: { id: string; roPoNumber: string; channel?: string | null; deliveryDate?: string | Date | null } | null;
  initialDeliveryDate?: string | null;
  onClose: () => void;
  onDelivered: (order: any) => void;
}

/**
 * Mark Delivered — the POD (proof of delivery) is mandatory. The file goes to the shared database
 * so the main consignment app can show it on its GRN Issue tab.
 */
export function MarkDeliveredModal({ order, initialDeliveryDate, onClose, onDelivered }: MarkDeliveredModalProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    initialDeliveryDate || formatDateInputValue(order?.deliveryDate || new Date())
  );
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return null;

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!isAcceptedPodFile(f.name)) {
      setError(`POD must be one of: ${POD_ACCEPTED_EXTENSIONS.join(", ")}`);
      return;
    }
    if (f.size > MAX_POD_BYTES) {
      setError(`POD is too large (max ${MAX_POD_BYTES / (1024 * 1024)} MB).`);
      return;
    }
    setError(null);
    setFile(f);
  };

  const submit = async () => {
    if (!file) {
      setError("Attach the POD to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (deliveryDate) fd.append("deliveryDate", deliveryDate);
      if (remarks.trim()) fd.append("remarks", remarks.trim());
      const res = await fetch(`/api/orders/${order.id}/deliver`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to mark delivered");
      showToast(`Consignment ${order.roPoNumber} marked as Delivered ✓`, "success");
      onDelivered(data.order);
    } catch (err: any) {
      setError(err.message || "Failed to mark delivered");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => !submitting && onClose()} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-200 p-5 space-y-4 z-10 text-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Mark Delivered</h3>
              <p className="text-[11px] text-slate-500">
                <span className="font-mono font-bold text-emerald-700">{order.roPoNumber}</span>
                {order.channel ? ` (${order.channel})` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">
            Proof of Delivery (POD) <span className="text-rose-600">*</span>
          </label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-3 py-3 cursor-pointer transition ${
              file
                ? "border-emerald-400 bg-emerald-50"
                : over
                ? "border-indigo-500 bg-indigo-50"
                : "border-slate-300 bg-slate-50 hover:border-emerald-400"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={POD_ACCEPTED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {file ? <FileCheck2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Upload className="w-5 h-5 text-slate-500 shrink-0" />}
            <div className="min-w-0 text-xs">
              {file ? (
                <>
                  <div className="font-bold text-emerald-800 truncate">{file.name}</div>
                  <div className="text-[11px] text-slate-500">Click to choose a different file</div>
                </>
              ) : (
                <>
                  <div className="font-bold text-slate-700">Drop the signed POD here, or click to choose</div>
                  <div className="text-[11px] text-slate-500">PDF or photo (JPG / PNG) · max {MAX_POD_BYTES / (1024 * 1024)} MB</div>
                </>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            The platform manager uses this POD to check for damage or short-box remarks if the GRN shows a problem.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">Delivery date</label>
          <DateInput
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">Remarks (optional)</label>
          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. 1 carton received with torn tape, noted on POD"
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>

        {error && <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !file}
            className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {submitting ? "Saving…" : "Mark Delivered"}
          </button>
        </div>
      </div>
    </div>
  );
}
