/**
 * Date utilities for the Appointment app (Asia/Kolkata).
 * Display format:   "25 Dec 2026"
 * Date-time format: "25 Dec 2026, 03:45 PM"
 * Every user-facing date must go through these helpers. Month names come from a fixed list so
 * output never depends on the browser/ICU version.
 */

const TIMEZONE = "Asia/Kolkata";
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8,
  october: 9, november: 10, december: 11,
};

function toIstParts(d: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
  } catch {
    const ist = new Date(d.getTime() + 330 * 60 * 1000); // IST = UTC+05:30, no DST
    return {
      year: ist.getUTCFullYear(),
      month: ist.getUTCMonth() + 1,
      day: ist.getUTCDate(),
      hour: ist.getUTCHours(),
      minute: ist.getUTCMinutes(),
    };
  }
}

const composeDate = (y: number, m: number, d: number) => `${String(d).padStart(2, "0")} ${MONTHS_SHORT[m - 1]} ${y}`;
const composeTime = (h: number, min: number) =>
  `${String(h % 12 || 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;

function toDate(value: string | Date): Date | null {
  const d = typeof value === "string" ? parseDateInput(value) : value;
  return d && !isNaN(d.getTime()) ? d : null;
}

/** "25 Dec 2026". Plain YYYY-MM-DD strings are calendar dates and are not timezone-shifted. */
export function formatDateDisplay(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "—";
  if (typeof dateValue === "string") {
    const ymd = dateValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return composeDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }
  const d = toDate(dateValue);
  if (!d) return "—";
  const p = toIstParts(d);
  return composeDate(p.year, p.month, p.day);
}

/** "25 Dec 2026, 03:45 PM" */
export function formatDateTimeDisplay(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "—";
  const d = toDate(dateValue);
  if (!d) return "—";
  const p = toIstParts(d);
  return `${composeDate(p.year, p.month, p.day)}, ${composeTime(p.hour, p.minute)}`;
}

/** "03:45 PM" */
export function formatTimeDisplay(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "";
  const d = toDate(dateValue);
  if (!d) return "";
  const p = toIstParts(d);
  return composeTime(p.hour, p.minute);
}

/** YYYY-MM-DD (IST calendar day) for native date inputs and date filters. */
export function formatDateInputValue(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "";
  if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) return dateValue.trim();
  const d = toDate(dateValue);
  if (!d) return "";
  const p = toIstParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Placeholder text for date fields, matching the display format. */
export const DATE_DISPLAY_PLACEHOLDER = "DD Mon YYYY";

export function parseDateInput(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
  // Support dd/mm/yyyy or dd-mm-yyyy
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
    const year = parseInt(ddmmyyyyMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  // Support "25 Dec 2026", "25-Dec-2026", "25 Sept 2026"
  const dMonY = str.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,9})[\s/-](\d{4})$/);
  if (dMonY) {
    const month = MONTH_INDEX[dMonY[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(parseInt(dMonY[3], 10), month, parseInt(dMonY[1], 10));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
