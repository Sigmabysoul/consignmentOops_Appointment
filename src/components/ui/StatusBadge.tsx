import React from "react";

interface StatusBadgeProps {
  status: string | null | undefined;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const s = (status || "Pending").toLowerCase().trim();

  let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";
  let dotClass = "bg-slate-400";
  let label = status || "Pending";

  if (s.includes("delivered") || s === "completed") {
    badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
    dotClass = "bg-emerald-500";
    label = "Delivered";
  } else if (s.includes("transit") || s === "dispatched" || s === "shipped") {
    badgeClass = "bg-indigo-50 text-indigo-700 border-indigo-200";
    dotClass = "bg-indigo-500";
    label = "In Transit";
  } else if (s.includes("appointment") || s.includes("scheduled")) {
    badgeClass = "bg-violet-50 text-violet-700 border-violet-200";
    dotClass = "bg-violet-500";
    label = "Appointment Scheduled";
  } else if (s.includes("tracking") || s === "tracking assigned") {
    badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
    dotClass = "bg-amber-500";
    label = "Tracking Assigned";
  } else if (s.includes("grn") || s.includes("issue") || s.includes("error")) {
    badgeClass = "bg-rose-50 text-rose-700 border-rose-200";
    dotClass = "bg-rose-500";
    label = "GRN Issue";
  } else if (s.includes("cancel")) {
    badgeClass = "bg-zinc-100 text-zinc-600 border-zinc-200 line-through";
    dotClass = "bg-zinc-400";
    label = "Cancelled";
  }

  const paddingClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${badgeClass} ${paddingClass} whitespace-nowrap`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      <span>{label}</span>
    </span>
  );
}
