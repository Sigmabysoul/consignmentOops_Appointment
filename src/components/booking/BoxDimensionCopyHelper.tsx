"use client";

import React, { useState } from "react";
import { BoxDimensionGroup, formatTabSeparatedBoxRow } from "@/lib/dimension-helper";
import { formatDecimalNumber } from "@/lib/courier-defaults";
import { Copy, Check, Sparkles, Layers, ArrowRight } from "lucide-react";

interface BoxDimensionCopyHelperProps {
  groups: BoxDimensionGroup[];
  compact?: boolean;
  orderNumber?: string;
  onDimensionsUpdated?: () => void;
}

export function BoxDimensionCopyHelper({
  groups,
  compact = false,
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

  if (!groups || groups.length === 0) {
    return (
      <div className="text-[11px] text-slate-400 italic flex items-center gap-1.5 py-1">
        <Layers className="w-3.5 h-3.5 text-slate-300" />
        <span>No box dimensions recorded yet</span>
      </div>
    );
  }

  // COMPACT TABLE CELL MODE (Used in Booking Table view)
  if (compact) {
    return (
      <div className="space-y-1.5 py-0.5">
        {groups.map((g, idx) => {
          const countKey = `${g.id}-boxCount`;
          const lKey = `${g.id}-lengthCm`;
          const wKey = `${g.id}-widthCm`;
          const hKey = `${g.id}-heightCm`;
          const wtKey = `${g.id}-weightKg`;
          const tsvKey = `${g.id}-tsv`;

          const isNextCount = activeStep?.groupId === g.id && activeStep?.field === "boxCount";
          const isNextL = activeStep?.groupId === g.id && activeStep?.field === "lengthCm";
          const isNextW = activeStep?.groupId === g.id && activeStep?.field === "widthCm";
          const isNextH = activeStep?.groupId === g.id && activeStep?.field === "heightCm";
          const isNextWt = activeStep?.groupId === g.id && activeStep?.field === "weightKg";

          return (
            <div
              key={g.id || idx}
              className="bg-white/90 border border-slate-200/90 rounded-lg p-1.5 shadow-2xs hover:border-violet-300 transition-colors"
            >
              {/* Group Mini Header & Row Copy */}
              <div className="flex items-center justify-between mb-1 text-[10px]">
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-600" />
                  {g.boxCount} Box{g.boxCount > 1 ? "es" : ""}
                  {g.isRemainder ? " (Rem)" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyRowTsv(g)}
                  title="Copy full row (Tab-separated: Count, L, B, H, Wt)"
                  className="flex items-center gap-1 text-[9px] font-semibold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-1.5 py-0.5 rounded transition cursor-pointer"
                >
                  {copiedKey === tsvKey ? (
                    <>
                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                      <span className="text-emerald-700">Row Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5" />
                      <span>Copy Row</span>
                    </>
                  )}
                </button>
              </div>

              {/* 1-Click Copy Chips */}
              <div className="flex flex-wrap items-center gap-1">
                {/* Count Chip */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(g, "boxCount", g.boxCount)}
                  title="Click to copy box count"
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition ${
                    copiedKey === countKey
                      ? "bg-emerald-600 text-white shadow-xs"
                      : isNextCount
                      ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400 font-extrabold animate-pulse"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="text-[9px] text-slate-500 font-sans">Qty:</span>
                  <span>{g.boxCount}</span>
                  {copiedKey === countKey ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2 h-2 opacity-50" />}
                </button>

                {/* Length Chip */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(g, "lengthCm", g.lengthCm)}
                  title="Click to copy Length"
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition ${
                    copiedKey === lKey
                      ? "bg-emerald-600 text-white shadow-xs"
                      : isNextL
                      ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400 font-extrabold animate-pulse"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="text-[9px] text-slate-500 font-sans">L:</span>
                  <span>{g.lengthCm ?? "?"}</span>
                  {copiedKey === lKey ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2 h-2 opacity-50" />}
                </button>

                {/* Breadth / Width Chip */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(g, "widthCm", g.widthCm)}
                  title="Click to copy Breadth / Width"
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition ${
                    copiedKey === wKey
                      ? "bg-emerald-600 text-white shadow-xs"
                      : isNextW
                      ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400 font-extrabold animate-pulse"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="text-[9px] text-slate-500 font-sans">B:</span>
                  <span>{g.widthCm ?? "?"}</span>
                  {copiedKey === wKey ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2 h-2 opacity-50" />}
                </button>

                {/* Height Chip */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(g, "heightCm", g.heightCm)}
                  title="Click to copy Height"
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition ${
                    copiedKey === hKey
                      ? "bg-emerald-600 text-white shadow-xs"
                      : isNextH
                      ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400 font-extrabold animate-pulse"
                      : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="text-[9px] text-slate-500 font-sans">H:</span>
                  <span>{g.heightCm ?? "?"}</span>
                  {copiedKey === hKey ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2 h-2 opacity-50" />}
                </button>

                {/* Weight Chip (if present) - Formatted to 2 decimals (.00) */}
                {g.weightKg !== null && (
                  <button
                    type="button"
                    onClick={() => handleFieldClick(g, "weightKg", formatDecimalNumber(g.weightKg))}
                    title="Click to copy Weight"
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition ${
                      copiedKey === wtKey
                        ? "bg-emerald-600 text-white shadow-xs"
                        : isNextWt
                        ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400 font-extrabold animate-pulse"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                    }`}
                  >
                    <span className="text-[9px] text-slate-500 font-sans">Wt:</span>
                    <span>{formatDecimalNumber(g.weightKg)}</span>
                    {copiedKey === wtKey ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2 h-2 opacity-50" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // EXPANDED / MODAL / DRAWER MODE (High-Productivity Copy Wizard)
  return (
    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-3">
      {/* Wizard Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <h4 className="text-xs font-extrabold text-slate-800">
            Carrier Booking Box Dimensions
          </h4>
        </div>
        <span className="text-[10px] font-semibold text-slate-500">
          Click any value to copy to booking form
        </span>
      </div>

      {/* Box Dimension Groups */}
      <div className="space-y-2.5">
        {groups.map((group, idx) => {
          const countKey = `${group.id}-boxCount`;
          const lKey = `${group.id}-lengthCm`;
          const wKey = `${group.id}-widthCm`;
          const hKey = `${group.id}-heightCm`;
          const wtKey = `${group.id}-weightKg`;
          const tsvKey = `${group.id}-tsv`;
          const dimKey = `${group.id}-dim`;

          const isNextCount = activeStep?.groupId === group.id && activeStep?.field === "boxCount";
          const isNextL = activeStep?.groupId === group.id && activeStep?.field === "lengthCm";
          const isNextW = activeStep?.groupId === group.id && activeStep?.field === "widthCm";
          const isNextH = activeStep?.groupId === group.id && activeStep?.field === "heightCm";
          const isNextWt = activeStep?.groupId === group.id && activeStep?.field === "weightKg";

          return (
            <div
              key={group.id || idx}
              className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-violet-100 text-violet-800">
                    Group {idx + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {group.boxCount} Box{group.boxCount > 1 ? "es" : ""}
                    {group.isRemainder ? " (Remainder Box)" : ""}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyDimString(group)}
                    title="Copy dimension string e.g. 23x40x25"
                    className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1"
                  >
                    {copiedKey === dimKey ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-slate-500" />
                        <span>Copy String</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyRowTsv(group)}
                    title="Copy entire row for quick Excel/form paste"
                    className="text-[10px] font-bold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 border border-violet-200"
                  >
                    {copiedKey === tsvKey ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">Row Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Row (Tab-separated)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Sequential / Step-by-Step Value Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {/* 1. Box Count */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(group, "boxCount", group.boxCount)}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                    copiedKey === countKey
                      ? "bg-emerald-600 border-emerald-700 text-white shadow-xs"
                      : isNextCount
                      ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400 text-amber-900"
                      : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75 font-semibold">
                    <span>1. Box Count</span>
                    {copiedKey === countKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
                  </div>
                  <div className="text-sm font-mono font-extrabold mt-1">
                    {group.boxCount}
                  </div>
                </button>

                {/* 2. Length */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(group, "lengthCm", group.lengthCm)}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                    copiedKey === lKey
                      ? "bg-emerald-600 border-emerald-700 text-white shadow-xs"
                      : isNextL
                      ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400 text-amber-900"
                      : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75 font-semibold">
                    <span>2. Length ({group.dimensionUnit})</span>
                    {copiedKey === lKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
                  </div>
                  <div className="text-sm font-mono font-extrabold mt-1">
                    {group.lengthCm ?? "-"}
                  </div>
                </button>

                {/* 3. Breadth / Width */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(group, "widthCm", group.widthCm)}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                    copiedKey === wKey
                      ? "bg-emerald-600 border-emerald-700 text-white shadow-xs"
                      : isNextW
                      ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400 text-amber-900"
                      : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75 font-semibold">
                    <span>3. Breadth ({group.dimensionUnit})</span>
                    {copiedKey === wKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
                  </div>
                  <div className="text-sm font-mono font-extrabold mt-1">
                    {group.widthCm ?? "-"}
                  </div>
                </button>

                {/* 4. Height */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(group, "heightCm", group.heightCm)}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                    copiedKey === hKey
                      ? "bg-emerald-600 border-emerald-700 text-white shadow-xs"
                      : isNextH
                      ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400 text-amber-900"
                      : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75 font-semibold">
                    <span>4. Height ({group.dimensionUnit})</span>
                    {copiedKey === hKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
                  </div>
                  <div className="text-sm font-mono font-extrabold mt-1">
                    {group.heightCm ?? "-"}
                  </div>
                </button>

                {/* 5. Weight */}
                <button
                  type="button"
                  onClick={() => handleFieldClick(group, "weightKg", group.weightKg !== null ? formatDecimalNumber(group.weightKg) : "")}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition flex flex-col justify-between ${
                    copiedKey === wtKey
                      ? "bg-emerald-600 border-emerald-700 text-white shadow-xs"
                      : isNextWt
                      ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400 text-amber-900"
                      : "bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-75 font-semibold">
                    <span>5. Weight ({group.weightUnit})</span>
                    {copiedKey === wtKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
                  </div>
                  <div className="text-sm font-mono font-extrabold mt-1">
                    {group.weightKg !== null ? formatDecimalNumber(group.weightKg) : "-"}
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Productivity Tip */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
        <div className="flex items-center gap-1">
          <ArrowRight className="w-3 h-3 text-violet-600" />
          <span>Sequential Copy Guide: clicking a box auto-highlights the next value to paste into the carrier portal.</span>
        </div>
      </div>
    </div>
  );
}
