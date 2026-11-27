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
      <div className="ui-overlay" onClick={() => !submitting && onClose()} />
      <div className="ui-dialog z-10 max-w-md">
        <div className="ui-dialog-header">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">Mark Delivered</h3>
              <p className="ui-muted truncate">
                <span className="ui-mono font-medium text-slate-700">{order.roPoNumber}</span>
                {order.channel ? ` · ${order.channel}` : ""}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="ui-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="ui-label">
              Proof of delivery (POD) <span className="text-rose-600">*</span>
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
              className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-3 py-4 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                file
                  ? "border-emerald-300 bg-emerald-50/60"
                  : over
                  ? "border-violet-400 bg-violet-50"
                  : "border-slate-300 bg-slate-50 hover:border-slate-400"
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
              {file ? <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Upload className="h-5 w-5 shrink-0 text-slate-400" />}
              <div className="min-w-0 text-xs">
                {file ? (
                  <>
                    <div className="truncate font-semibold text-emerald-800">{file.name}</div>
                    <div className="ui-muted">Click to choose a different file</div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-slate-700">Drop the signed POD here, or click to choose</div>
                    <div className="ui-muted">PDF or photo (JPG / PNG) · max {MAX_POD_BYTES / (1024 * 1024)} MB</div>
                  </>
                )}
              </div>
            </div>
            <p className="ui-muted mt-1.5">
              The platform manager uses this POD to check for damage or short-box remarks if the GRN shows a problem.
            </p>
          </div>

          <div>
            <label className="ui-label">Delivery date</label>
            <DateInput value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="ui-input" />
          </div>

          <div>
            <label className="ui-label">Remarks (optional)</label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. 1 carton received with torn tape, noted on POD"
              className="ui-input resize-none"
            />
          </div>

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</div>}
        </div>

        <div className="ui-dialog-footer justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className="ui-btn-ghost px-4 py-2">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting || !file} className="ui-btn-success px-4 py-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {submitting ? "Saving…" : "Mark Delivered"}
          </button>
        </div>
      </div>
    </div>
  );
}
