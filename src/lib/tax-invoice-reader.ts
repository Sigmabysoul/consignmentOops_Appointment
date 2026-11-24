/**
 * Reads the figures the booking desk needs from our own GST tax invoice (the one sent with the
 * goods, e.g. "TBC/26-27/1125"), from `pdftotext -layout` text.
 *
 * Invoice value = the invoice's bottom-line "Total :" (GST included), which is what carriers
 * bill ROV on (Shiprocket's and Delhivery's invoices quote the same figure as "Invoice Value" /
 * "Product Value"). Nothing is guessed: when the total is not found the result has no value and
 * the operator is told to check the file.
 */

export interface TaxInvoiceRead {
  /** Invoice total incl. GST, ₹ (2 decimals). null = not found. */
  invoiceValue: number | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  ewayBillNumber: string | null;
}

/** "3,92,108.00" → 392108 (Indian or western grouping). */
function parseRupees(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
}

const AMOUNT = String.raw`(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)`;

function findTotal(text: string): number | null {
  // Most specific first. "Total :" must not be "Sub Total :" or "Total Tax".
  const patterns = [
    new RegExp(String.raw`Grand\s+Total\s*:?\s*${AMOUNT}`, "i"),
    new RegExp(String.raw`Total\s+Invoice\s+(?:Value|Amount)\s*:?\s*${AMOUNT}`, "i"),
    new RegExp(String.raw`(?<!Sub\s{0,3})\bTotal\s*:\s*${AMOUNT}`, "i"),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const v = m ? parseRupees(m[1]) : null;
    if (v !== null) return v;
  }
  return null;
}

function findInvoiceNumber(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/Invoice\s*(?:No\.?|Number|#)\s*:?\s*(\S+)/i);
    if (!m) continue;
    let num = m[1];
    // The layout often wraps "TBC/26-" / "27/1125" onto the next line, under the same column.
    if (/[-/]$/.test(num) && lines[i + 1]) {
      // The wrapped part sits somewhere between the label's column and the value's column.
      const from = (m.index ?? 0) - 2;
      const to = lines[i].indexOf(m[1], m.index) + 6;
      const tail = [...lines[i + 1].matchAll(/[0-9A-Za-z][0-9A-Za-z/-]*/g)].find(
        (t) => (t.index ?? 0) >= from && (t.index ?? 0) <= to && /\d/.test(t[0])
      );
      if (tail) num += tail[0];
    }
    return num;
  }
  return null;
}

export function readTaxInvoiceText(text: string): TaxInvoiceRead {
  const lines = text.split(/\r?\n/);
  const po = text.match(/\bP\.?O\.?\s*(?:No\.?|Number|#)\s*:?\s*([A-Za-z0-9-]+)/i);
  const eway = text.match(/E-?\s?way\s*Bill\s*(?:No\.?|number)?\s*:?[\s\S]{0,200}?\b(\d{12})\b/i);
  return {
    invoiceValue: findTotal(text),
    invoiceNumber: findInvoiceNumber(lines),
    poNumber: po ? po[1] : null,
    ewayBillNumber: eway ? eway[1] : null,
  };
}

const norm = (s: string) => s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

/** True when the invoice names a PO that is clearly not this order's RO/PO number. */
export function invoicePoMismatch(read: TaxInvoiceRead, roPoNumber: string): boolean {
  if (!read.poNumber) return false;
  const a = norm(read.poNumber);
  const b = norm(roPoNumber);
  return Boolean(a && b) && !a.includes(b) && !b.includes(a);
}
