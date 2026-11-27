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
    badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800";
    dotClass = "bg-emerald-500";
    label = "Delivered";
  } else if (s.includes("transit") || s === "dispatched" || s === "shipped") {
    badgeClass = "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/70 dark:text-violet-300 dark:border-violet-800";
    dotClass = "bg-violet-500";
    label = "In Transit";
  } else if (s.includes("appointment") || s.includes("scheduled")) {
    badgeClass = "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800";
    dotClass = "bg-sky-500";
    label = "Appointment Scheduled";
  } else if (s.includes("tracking") || s === "tracking assigned") {
    badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
    dotClass = "bg-amber-500";
    label = "Tracking Assigned";
  } else if (s.includes("grn") || s.includes("issue") || s.includes("error")) {
    badgeClass = "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800";
    dotClass = "bg-orange-500";
    label = "GRN Issue";
  } else if (s.includes("cancel")) {
    badgeClass = "bg-gray-100 text-gray-600 border-gray-200 line-through dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
    dotClass = "bg-gray-400";
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
