import { OmRateRow } from "./types";

/**
 * OM Logistics Supply Chain Pvt Ltd Surface Rate Card
 * Commercial Ex Kolkata, Surface, Per Kg (revised 1 Aug 2026).
 *
 * Rules:
 * - Rows above 250 kg are all-inclusive (no fuel surcharge, no CN charge).
 * - Special Zone and 7 Sister have no rates above 250 kg.
 * - Northeast has no rates for 251–500 kg.
 * - The East-Kolkata 501–1000 kg rate of ₹18 is flagged as unconfirmed.
 */
export const DEFAULT_OM_RATE_CARD: OmRateRow[] = [
  // ── Light Slab (0–250 kg): Subject to DPH/Fuel % + CN Charge ₹100 ──
  {
    id: "om-light-main",
    zones: ["West", "South", "East", "North", "Central"],
    minKg: 0,
    maxKg: 250,
    ratePerKg: 6.55,
    fuelPercent: 20,
    cnCharge: 100,
    note: "Light slab base rate for West, South, East, North, Central",
  },
  {
    id: "om-light-kolkata",
    zones: ["East-Kolkata"],
    minKg: 0,
    maxKg: 250,
    ratePerKg: 6.0,
    fuelPercent: 20,
    cnCharge: 100,
    note: "Local Kolkata light slab",
  },
  {
    id: "om-light-northeast",
    zones: ["Northeast"],
    minKg: 0,
    maxKg: 250,
    ratePerKg: 13.0,
    fuelPercent: 50,
    cnCharge: 100,
    note: "Northeast light slab (50% fuel)",
  },
  {
    id: "om-light-guwahati",
    zones: ["Guwahati"],
    minKg: 0,
    maxKg: 250,
    ratePerKg: 11.0,
    fuelPercent: 50,
    cnCharge: 100,
    note: "Guwahati light slab (50% fuel)",
  },
  {
    id: "om-light-special",
    zones: ["Special Zone"],
    minKg: 0,
    maxKg: 250,
    ratePerKg: 14.0,
    fuelPercent: 50,
    cnCharge: 100,
    note: "Special Zone light slab (50% fuel)",
  },
  {
    id: "om-light-7sister",
    zones: ["7 Sister"],
    minKg: 0,
    maxKg: 250,
    ratePerKg: 15.0,
    fuelPercent: 50,
    cnCharge: 100,
    note: "7 Sister light slab (50% fuel)",
  },

  // ── Heavy Slabs (>250 kg): All-inclusive, no fuel surcharge, no CN charge ──
  {
    id: "om-heavy-main-251-500",
    zones: ["East", "West", "North", "South"],
    minKg: 251,
    maxKg: 500,
    ratePerKg: 10.0,
    fuelPercent: 0,
    cnCharge: 0,
    note: "All-inclusive heavy slab 251–500 kg",
  },
  {
    id: "om-heavy-main-501-1000",
    zones: ["East", "West", "North", "South"],
    minKg: 501,
    maxKg: 1000,
    ratePerKg: 9.0,
    fuelPercent: 0,
    cnCharge: 0,
    note: "All-inclusive heavy slab 501–1000 kg",
  },
  {
    id: "om-heavy-main-1001-2000",
    zones: ["East", "West", "North", "South"],
    minKg: 1001,
    maxKg: 2000,
    ratePerKg: 8.5,
    fuelPercent: 0,
    cnCharge: 0,
    note: "All-inclusive heavy slab 1001–2000 kg",
  },
  {
    id: "om-heavy-main-2001-4000",
    zones: ["East", "West", "North", "South"],
    minKg: 2001,
    maxKg: 4000,
    ratePerKg: 8.3,
    fuelPercent: 0,
    cnCharge: 0,
    note: "All-inclusive heavy slab 2001–4000 kg",
  },
  {
    id: "om-heavy-kolkata-251-500",
    zones: ["East-Kolkata"],
    minKg: 251,
    maxKg: 500,
    ratePerKg: 10.0,
    fuelPercent: 0,
    cnCharge: 0,
    note: "Local Kolkata heavy slab 251–500 kg",
  },
  {
    id: "om-heavy-kolkata-501-1000",
    zones: ["East-Kolkata"],
    minKg: 501,
    maxKg: 1000,
    ratePerKg: 18.0,
    fuelPercent: 0,
    cnCharge: 0,
    // Note: The East-Kolkata 501–1000 kg rate of ₹18 is flagged as unconfirmed in sheet.
    note: "UNCONFIRMED: East-Kolkata 501–1000 kg rate of ₹18 is flagged as unconfirmed in sheet",
  },
  {
    id: "om-heavy-central-251-1000",
    zones: ["Central"],
    minKg: 251,
    maxKg: 1000,
    ratePerKg: 18.0,
    fuelPercent: 0,
    cnCharge: 0,
    note: "Central heavy slab 251–1000 kg",
  },
  {
    id: "om-heavy-northeast-501-1000",
    zones: ["Northeast"],
    minKg: 501,
    maxKg: 1000,
    ratePerKg: 17.0,
    fuelPercent: 0,
    cnCharge: 0,
    note: "Northeast heavy slab 501–1000 kg (Northeast has no rate for 251–500 kg)",
  },
  {
    id: "om-heavy-guwahati-501-1000",
    zones: ["Guwahati"],
    minKg: 501,
    maxKg: 1000,
    ratePerKg: 13.0,
    fuelPercent: 0,
    cnCharge: 0,
    note: "Guwahati heavy slab 501–1000 kg",
  },
];
