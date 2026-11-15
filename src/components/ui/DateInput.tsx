"use client";

import React, { useEffect, useRef } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { formatDateDisplay, DATE_DISPLAY_PLACEHOLDER } from "@/lib/date-utils";

/**
 * Drop-in replacement for <input type="date">.
 *
 * Native date inputs render in the BROWSER's locale (an en-US browser shows 12/25/2026),
 * so the app's format cannot be enforced with them. This keeps the native input's contract
 * (value = "YYYY-MM-DD", onChange receives the native change event) but displays
 * "25 Dec 2026" and opens the native calendar on click / Space / ArrowDown.
 */
type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  value?: string | null;
};

export function DateInput({
  value,
  className = "",
  placeholder,
  disabled,
  autoFocus,
  onKeyDown,
  title,
  style,
  ...inputProps
}: DateInputProps) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const display = value ? formatDateDisplay(value) : "";
  const shown = display && display !== "—" ? display : "";

  const openPicker = () => {
    if (disabled) return;
    const el = nativeRef.current;
    if (!el) return;
    try {
      if (typeof (el as any).showPicker === "function") (el as any).showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };

  useEffect(() => {
    if (!autoFocus) return;
    buttonRef.current?.focus();
    openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className="relative inline-flex w-full items-center">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        title={title}
        style={style}
        onClick={openPicker}
        onKeyDown={(e) => {
          onKeyDown?.(e as unknown as React.KeyboardEvent<HTMLInputElement>);
          if (e.key === "Enter") e.preventDefault(); // Enter belongs to the caller (e.g. save)
          if (e.key === "ArrowDown") {
            e.preventDefault();
            openPicker();
          }
        }}
        className={`${className} inline-flex items-center justify-between gap-2 text-left ${shown ? "" : "text-slate-400"} ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
      >
        <span className="truncate">{shown || placeholder || DATE_DISPLAY_PLACEHOLDER}</span>
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      </button>
      <input
        {...inputProps}
        ref={nativeRef}
        type="date"
        value={value ?? ""}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />
    </span>
  );
}
