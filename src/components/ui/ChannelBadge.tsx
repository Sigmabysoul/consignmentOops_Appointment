import React from "react";

interface ChannelBadgeProps {
  channel: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ChannelBadge({ channel, size = "md", className = "" }: ChannelBadgeProps) {
  const c = (channel || "OTHER").toUpperCase().trim();

  let label = channel || "Other";
  let bgClass = "bg-slate-100 text-slate-800 border-slate-200";
  let dotColor = "bg-slate-400";

  if (c.includes("SWIGGY")) {
    label = "Swiggy";
    bgClass = "bg-orange-50 text-orange-900 border-orange-200";
    dotColor = "bg-orange-500";
  } else if (c.includes("BLINKIT")) {
    label = "Blinkit";
    bgClass = "bg-amber-50 text-amber-900 border-amber-200";
    dotColor = "bg-amber-500";
  } else if (c.includes("FLIPKART")) {
    label = c.includes("MINUTES") ? "Flipkart Min" : "Flipkart";
    bgClass = "bg-blue-50 text-blue-900 border-blue-200";
    dotColor = "bg-blue-500";
  } else if (c.includes("AMAZON")) {
    label = c.includes("FBA") ? "Amazon FBA" : "Amazon VC";
    bgClass = "bg-emerald-50 text-emerald-900 border-emerald-200";
    dotColor = "bg-emerald-500";
  }

  const sizeClasses =
    size === "sm"
      ? "px-1.5 py-0.2 text-[10px]"
      : size === "lg"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold border ${sizeClasses} ${bgClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
}
