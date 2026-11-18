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

/*
 * IST business-day boundaries (servers run in UTC; India has no DST).
 * An IST calendar day D runs from (D 00:00 UTC − 5h30m) to (D+1 00:00 UTC − 5h30m), end exclusive.
 * Every stored form lands on its IST day with these bounds: App 1 date-only values (D 06:30Z = noon
 * IST), this app's parsed YYYY-MM-DD (D 00:00Z = 05:30 IST) and real timestamps
 * (e.g. 2026-11-18T19:30Z = 01:00 IST on 19 Nov).
 */
export const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start (as a UTC instant) of the IST calendar day y-m-d (m is 1-based). */
export function istDayStartFromParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Start of the IST day containing `now`, shifted by `offsetDays` whole days. */
export function istDayStart(now: Date = new Date(), offsetDays = 0): Date {
  const startMs = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  return new Date(startMs + offsetDays * DAY_MS);
}

/** True when both instants fall on the same IST calendar day. */
export function isSameIstDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return istDayStart(a).getTime() === istDayStart(b).getTime();
}

/**
 * IST day [start, end) for a filter bound: "YYYY-MM-DD", "DD/MM/YYYY" and "25 Dec 2026" are read as
 * IST calendar days; anything else is parsed and floored to its IST day.
 */
export function istDayRangeFromInput(value: string | null | undefined): { start: Date; end: Date } | null {
  if (!value || !String(value).trim()) return null;
  const str = String(value).trim();
  let start: Date | null = null;
  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const dMonY = str.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,9})[\s/-](\d{4})$/);
  if (ymd) start = istDayStartFromParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  else if (dmy) start = istDayStartFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  else if (dMonY && MONTH_INDEX[dMonY[2].toLowerCase()] !== undefined) {
    start = istDayStartFromParts(Number(dMonY[3]), MONTH_INDEX[dMonY[2].toLowerCase()] + 1, Number(dMonY[1]));
  } else {
    const d = new Date(str);
    if (!isNaN(d.getTime())) start = istDayStart(d);
  }
  if (!start || isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * Quick-date windows on IST days. All `*End` values are exclusive (use `lt`).
 * The week runs Sunday 00:00 IST → next Sunday 00:00 IST.
 */
export function getIstQuickDateWindows(now: Date = new Date()) {
  const todayStart = istDayStart(now);
  const istWeekday = new Date(todayStart.getTime() + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
  const weekStart = new Date(todayStart.getTime() - istWeekday * DAY_MS);
  return {
    yesterdayStart: istDayStart(now, -1),
    todayStart,
    tomorrowStart: istDayStart(now, 1),
    dayAfterTomorrowStart: istDayStart(now, 2),
    weekStart,
    weekEnd: new Date(weekStart.getTime() + 7 * DAY_MS),
  };
}

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
