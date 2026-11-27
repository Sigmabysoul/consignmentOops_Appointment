"use client";

import React, { useState } from "react";
import { BoxDimensionGroup, formatCbm, formatTabSeparatedBoxRow, summarizeCartons } from "@/lib/dimension-helper";
import { formatDecimalNumber } from "@/lib/courier-defaults";
import { Copy, Check, Layers, ArrowRight } from "lucide-react";

interface BoxDimensionCopyHelperProps {
  groups: BoxDimensionGroup[];
  compact?: boolean;
  /** Full-width layout: each box group on a single row (label | values | copy buttons) on large screens. */
  wide?: boolean;
  orderNumber?: string;
  onDimensionsUpdated?: () => void;
}

type CopyField = "boxCount" | "lengthCm" | "widthCm" | "heightCm" | "weightKg";

/** Visual state of a copy target: just copied (green), next in the auto-advance sequence (violet ring), idle. */
function chipState(copied: boolean, next: boolean) {
  if (copied) return "border-emerald-600 bg-emerald-600 text-white";
  if (next) return "border-violet-400 bg-violet-50 text-violet-900 ring-2 ring-violet-400/60";
  return "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50";
}

/** Small "Copy row" / "Copy string" button with a copied confirmation. */
function CopyTextButton({
  copied,
  onClick,
  title,
  label,
  copiedLabel,
  primary = false,
}: {
  copied: boolean;
  onClick: () => void;
  title: string;
  label: string;
  copiedLabel: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${primary ? "ui-btn-secondary text-violet-700 hover:text-violet-800" : "ui-btn-ghost"} ui-btn-sm`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-700">{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

export function BoxDimensionCopyHelper({
  groups,
  compact = false,
  wide = false,
  orderNumber,
}: BoxDimensionCopyHelperProps) {
  // State tracking which field was just copied: `${groupId}-${fieldKey}`
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Active step sequence: [boxCount -> lengthCm -> widthCm -> heightCm -> weightKg]
  const [activeStep, setActiveStep] = useState<{
    groupId: string;
    field: "boxCount" | "lengthCm" | "widthCm" | "heightCm" | "weightKg";
  } | null>(null);

  const copyToClipboard = async (text: string | number | null | undefined, key: string) => {
    if (text === null || text === undefined || text === "") return;
    const cleanVal = String(text).trim();
    try {
      await navigator.clipboard.writeText(cleanVal);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = cleanVal;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  // Helper to copy a field and auto-advance to the next field in sequence
  const handleFieldClick = (
    group: BoxDimensionGroup,
    field: "boxCount" | "lengthCm" | "widthCm" | "heightCm" | "weightKg",
    val: number | string | null
  ) => {
    const key = `${group.id}-${field}`;
    copyToClipboard(val, key);

    // Sequence progression: boxCount -> lengthCm -> widthCm -> heightCm -> weightKg
    if (field === "boxCount") {
      setActiveStep({ groupId: group.id, field: "lengthCm" });
    } else if (field === "lengthCm") {
      setActiveStep({ groupId: group.id, field: "widthCm" });
    } else if (field === "widthCm") {
      setActiveStep({ groupId: group.id, field: "heightCm" });
    } else if (field === "heightCm") {
      if (group.weightKg) {
        setActiveStep({ groupId: group.id, field: "weightKg" });
      } else {
        // Move to next group if available
        const currIdx = groups.findIndex((g) => g.id === group.id);
        if (currIdx >= 0 && currIdx < groups.length - 1) {
          setActiveStep({ groupId: groups[currIdx + 1].id, field: "boxCount" });
        } else {
          setActiveStep(null);
        }
      }
    } else if (field === "weightKg") {
      const currIdx = groups.findIndex((g) => g.id === group.id);
      if (currIdx >= 0 && currIdx < groups.length - 1) {
        setActiveStep({ groupId: groups[currIdx + 1].id, field: "boxCount" });
      } else {
        setActiveStep(null);
      }
    }
  };

  const handleCopyRowTsv = (group: BoxDimensionGroup) => {
    const tsv = formatTabSeparatedBoxRow(group);
    copyToClipboard(tsv, `${group.id}-tsv`);
  };

  const handleCopyDimString = (group: BoxDimensionGroup) => {
    const dim = `${group.lengthCm || 0}x${group.widthCm || 0}x${group.heightCm || 0}`;
    copyToClipboard(dim, `${group.id}-dim`);
  };

  // Order total (exact 2 dp, = the order's weightKg): rows show the weight of ONE box.
  const summary = summarizeCartons(groups || []);

  if (!groups || groups.length === 0) {
    return (
      <div className="flex items-center gap-1.5 py-1 text-xs text-slate-400">
        <Layers className="h-3.5 w-3.5 text-slate-300" />
        <span>No box dimensions recorded yet</span>
      </div>
    );
  }

  const isNext = (groupId: string, field: CopyField) =>
    activeStep?.groupId === groupId && activeStep?.field === field;

  // COMPACT TABLE CELL MODE (Used in Booking Table view)
  if (compact) {
    return (
      <div className="space-y-2">
        {groups.map((g, idx) => {
          const tsvKey = `${g.id}-tsv`;
          const chips: { field: CopyField; label: string; display: React.ReactNode; value: number | string | null; title: string }[] = [
            { field: "boxCount", label: "Qty", display: g.boxCount, value: g.boxCount, title: "Click to copy box count" },
            { field: "lengthCm", label: "L", display: g.lengthCm ?? "?", value: g.lengthCm, title: "Click to copy Length" },
            { field: "widthCm", label: "B", display: g.widthCm ?? "?", value: g.widthCm, title: "Click to copy Breadth / Width" },
            { field: "heightCm", label: "H", display: g.heightCm ?? "?", value: g.heightCm, title: "Click to copy Height" },
          ];
          // Weight chip (if present) - Formatted to 2 decimals (.00)
          if (g.weightKg !== null) {
            chips.push({
              field: "weightKg",
              label: "Wt/box",
              display: formatDecimalNumber(g.weightKg),
              value: formatDecimalNumber(g.weightKg),
              title: "Click to copy the weight of ONE box",
            });
          }

          return (
            <div key={g.id || idx} className="space-y-1">
              {/* Group header & row copy */}
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <span className="tabular-nums">
                    {g.boxCount} box{g.boxCount > 1 ? "es" : ""}
                  </span>
                  {g.isRemainder && (
                    <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-medium text-slate-500">Rem</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyRowTsv(g)}
                  title="Copy full row (Tab-separated: Count, L, B, H, Wt per box)"
                  className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-violet-700 transition hover:bg-violet-50 hover:text-violet-800"
                >
                  {copiedKey === tsvKey ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Row copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy row</span>
                    </>
                  )}
                </button>
              </div>

              {/* 1-click copy chips */}
              <div className="flex flex-wrap items-center gap-1">
                {chips.map((c) => {
                  const key = `${g.id}-${c.field}`;
                  const copied = copiedKey === key;
                  return (
                    <button
                      key={c.field}
                      type="button"
                      onClick={() => handleFieldClick(g, c.field, c.value)}
                      title={c.title}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition ${chipState(copied, isNext(g.id, c.field))}`}
                    >
                      <span className={copied ? "text-emerald-100" : "text-slate-400"}>{c.label}</span>
                      <span className="font-mono font-semibold tabular-nums">{c.display}</span>
                      {copied && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {summary.totalBoxes > 0 && (
          <div className="border-t border-slate-100 pt-1.5 text-[11px] font-medium tabular-nums text-slate-500">
            Total: {summary.totalBoxes} box{summary.totalBoxes > 1 ? "es" : ""}
            {summary.totalWeightKg !== null ? ` · ${formatDecimalNumber(summary.totalWeightKg)} kg` : ""}
            {summary.totalCbm !== null ? ` · ${formatCbm(summary.totalCbm)}` : ""}
          </div>
        )}
      </div>
    );
  }

  // EXPANDED / MODAL / DRAWER MODE (High-Productivity Copy Wizard)
  return (
    <div className="ui-card overflow-hidden">
      {/* Wizard header */}
      <div className="ui-card-header">
        <h4 className="ui-card-title">
          <Layers className="h-4 w-4 text-violet-600" />
          Carrier booking box dimensions
        </h4>
        <span className="ui-muted hidden sm:inline">Click any value to copy it into the booking form</span>
      </div>

      {/* Box dimension groups */}
      <div className="divide-y divide-slate-100">
        {groups.map((group, idx) => {
          const tsvKey = `${group.id}-tsv`;
          const dimKey = `${group.id}-dim`;
          const fields: { field: CopyField; label: string; display: React.ReactNode; value: number | string | null }[] = [
            { field: "boxCount", label: "1. Box count", display: group.boxCount, value: group.boxCount },
            { field: "lengthCm", label: `2. Length (${group.dimensionUnit})`, display: group.lengthCm ?? "-", value: group.lengthCm },
            { field: "widthCm", label: `3. Breadth (${group.dimensionUnit})`, display: group.widthCm ?? "-", value: group.widthCm },
            { field: "heightCm", label: `4. Height (${group.dimensionUnit})`, display: group.heightCm ?? "-", value: group.heightCm },
            {
              field: "weightKg",
              label: `5. Wt/box (${group.weightUnit})`,
              display: group.weightKg !== null ? formatDecimalNumber(group.weightKg) : "-",
              value: group.weightKg !== null ? formatDecimalNumber(group.weightKg) : "",
            },
          ];

          return (
            <div
              key={group.id || idx}
              className={
                wide
                  ? "flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-4"
                  : "space-y-2 px-4 py-3"
              }
            >
              <div className={wide ? "flex items-center justify-between gap-2 lg:contents" : "flex items-center justify-between gap-2"}>
                <div className={wide ? "flex items-center gap-2 lg:order-1 lg:w-44 lg:shrink-0" : "flex items-center gap-2"}>
                  <span className="ui-eyebrow">Group {idx + 1}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {group.boxCount} box{group.boxCount > 1 ? "es" : ""}
                  </span>
                  {group.isRemainder && (
                    <span className="rounded bg-slate-100 px-1.5 py-px text-[11px] font-medium text-slate-600">Remainder</span>
                  )}
                </div>

                <div className={wide ? "flex items-center gap-1 lg:order-3 lg:shrink-0" : "flex items-center gap-1"}>
                  <CopyTextButton
                    copied={copiedKey === dimKey}
                    onClick={() => handleCopyDimString(group)}
                    title="Copy dimension string e.g. 23x40x25"
                    label="Copy string"
                    copiedLabel="Copied"
                  />
                  <CopyTextButton
                    primary
                    copied={copiedKey === tsvKey}
                    onClick={() => handleCopyRowTsv(group)}
                    title="Copy entire row (tab-separated) for quick Excel/form paste"
                    label={wide ? "Copy row" : "Copy row (tab-separated)"}
                    copiedLabel="Row copied"
                  />
                </div>
              </div>

              {/* Sequential / step-by-step value buttons */}
              <div className={wide ? "grid grid-cols-2 gap-1.5 sm:grid-cols-5 lg:order-2 lg:flex-1" : "grid grid-cols-2 gap-1.5 sm:grid-cols-5"}>
                {fields.map((f) => {
                  const copied = copiedKey === `${group.id}-${f.field}`;
                  return (
                    <button
                      key={f.field}
                      type="button"
                      onClick={() => handleFieldClick(group, f.field, f.value)}
                      className={`flex cursor-pointer flex-col justify-between rounded-lg border px-2.5 py-2 text-left transition ${chipState(copied, isNext(group.id, f.field))}`}
                    >
                      <span className={`flex items-center justify-between gap-1 whitespace-nowrap text-[11px] font-medium ${copied ? "text-emerald-50" : "text-slate-500"}`}>
                        <span>{f.label}</span>
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 opacity-40" />}
                      </span>
                      <span className="mt-1 font-mono text-sm font-semibold tabular-nums">{f.display}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Order totals (weights above are per box) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="text-xs font-semibold tabular-nums text-slate-800">
          Total: {summary.totalBoxes} box{summary.totalBoxes === 1 ? "" : "es"}
          {summary.totalWeightKg !== null ? ` · ${formatDecimalNumber(summary.totalWeightKg)} kg` : " · weight pending"}
          {summary.totalCbm !== null ? ` · ${formatCbm(summary.totalCbm)}` : ""}
        </span>
        <span className="ui-muted">
          Weights shown are per box. Rows of the same size can differ by 0.01 kg so the boxes add up to
          the exact order total.
        </span>
      </div>

      {/* Productivity tip */}
      <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-violet-600" />
        <span>Sequential copy: clicking a value highlights the next one to paste into the carrier portal.</span>
      </div>
    </div>
  );
}
