import type { ShiprocketQuote } from "./shiprocket-types";

const inr = (n: number) =>
  `₹${Number(n.toFixed(2)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "15%" when amount/base is a clean percentage (to 0.01%), else null. */
function cleanPercent(amount: number, base: number): string | null {
  if (!(base > 0) || !(amount > 0)) return null;
  const pct = (amount / base) * 100;
  const rounded = Math.round(pct * 100) / 100;
  // Shiprocket rounds each charge to paise, so allow one paisa of slack.
  if (Math.abs((rounded / 100) * base - amount) > 0.011) return null;
  return `${Number(rounded.toFixed(2))}%`;
}

/**
 * How a Shiprocket charge was worked out, read back from the API's own numbers.
 * The rate API returns amounts only, so this explains a line only when the arithmetic
 * checks out exactly (e.g. FSC = 15% of freight); otherwise it returns undefined.
 * Patterns match Shiprocket's invoice working: FSC and FPL are % of freight, appointment
 * is ₹1/kg with a minimum, ROV is a % of invoice value with a minimum.
 */
export function shiprocketLineBasis(label: string, amount: number, quote: ShiprocketQuote, invoiceValue = 0): string | undefined {
  const freight = quote.lines.find((l) => l.label === "Freight")?.amount ?? 0;
  const kg = quote.chargeableWeightKg ?? 0;
  switch (label) {
    case "Freight":
      return quote.ratePerKg && kg ? `₹${quote.ratePerKg.toFixed(2)}/kg × ${kg.toFixed(2)} kg` : undefined;
    case "Fuel surcharge":
    case "FPL": {
      const pct = cleanPercent(amount, freight);
      return pct ? `${pct} of freight ${inr(freight)}` : undefined;
    }
    case "Appointment delivery":
      if (kg > 0 && Math.abs(amount - kg) < 0.011) return `₹1/kg × ${kg.toFixed(2)} kg`;
      return kg > 0 && amount > kg ? `Minimum charge (₹1/kg × ${kg.toFixed(2)} kg is less)` : undefined;
    case "Risk of value (ROV)": {
      if (!(invoiceValue > 0)) return undefined;
      const pct = cleanPercent(amount, invoiceValue);
      // ROV is rounded to whole rupees on the invoice, so 0.1% of ₹2,81,824 shows as ₹282.
      const tenth = invoiceValue * 0.001;
      if (Math.abs(Math.round(tenth) - amount) < 0.011) return `0.1% of invoice value ${inr(invoiceValue)}`;
      if (amount > tenth) return `Minimum charge (0.1% of ${inr(invoiceValue)} is ${inr(tenth)})`;
      return pct ? `${pct} of invoice value ${inr(invoiceValue)}` : undefined;
    }
    case "Docket / AWB":
      return "Fixed, per docket";
    case "ODA":
      return "Drop pincode is out of the carrier's delivery area";
    default:
      return undefined;
  }
}
