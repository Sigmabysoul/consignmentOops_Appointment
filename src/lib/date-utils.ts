export function formatDateDisplay(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "—";
  try {
    const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

export function formatDateTimeDisplay(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "—";
  try {
    const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    if (isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, "0");
    return `${day}/${month}/${year}, ${hoursStr}:${minutes} ${ampm}`;
  } catch {
    return "—";
  }
}

export function formatDateInputValue(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "";
  try {
    const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
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
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
