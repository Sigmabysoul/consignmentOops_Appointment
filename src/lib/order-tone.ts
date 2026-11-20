/**
 * Order colour system — the ONE place that decides what colour an order or status is.
 * App 2 keeps a byte-identical copy at consignmentOops_Appointment/src/lib/order-tone.ts
 * (tests/order-tone.test.ts fails if they drift). No imports, so both apps can share it.
 *
 * An order's colour = its lifecycle stage (base hue) + its progress on the floor:
 *
 *   Draft            slate
 *   New              red     ┐ the row blends toward YELLOW as product labels get printed
 *   In Processing    amber   ┘ and toward GREEN once box dimensions are given
 *   Packaging        amber + a small "Packaging in progress" box badge (no new hue)
 *   Packed           green (everything printed and measured)
 *   In Transit       purple
 *   Delivered        deep green
 *   GRN Issue        orange
 *   Cancelled        grey
 *   Archived         the colour of the state it was archived from
 *                    (delivered → green, GRN resolved → green with an orange edge,
 *                     cancelled → grey), always a little muted.
 */

export type ToneKey =
  | "slate"
  | "red"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "deepgreen"
  | "purple"
  | "orange"
  | "grey";

export interface Tone {
  key: ToneKey;
  /** Row / card tint (light, dark). */
  bg: string;
  darkBg: string;
  /** Strong accent: left edge stripe, dots, borders (light, dark). */
  accent: string;
  darkAccent: string;
  /** Tailwind classes for a status chip (light + dark). */
  badgeClass: string;
  /** Tailwind classes for a tinted cell (light + dark). */
  cellClass: string;
  /** Tailwind classes for a <select> styled as the status. */
  selectClass: string;
  /** Tailwind background class for a status dot. */
  dotClass: string;
}

export const TONES: Record<ToneKey, Tone> = {
  slate: {
    key: "slate",
    bg: "#f1f5f9",
    darkBg: "#141b26",
    accent: "#94a3b8",
    darkAccent: "#64748b",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-600",
    cellClass: "bg-slate-50 text-slate-900 border-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:border-slate-700",
    selectClass: "bg-slate-100 border-slate-300 text-slate-800 font-semibold focus:ring-slate-500",
    dotClass: "bg-slate-400",
  },
  red: {
    key: "red",
    bg: "#ffe4e6",
    darkBg: "#33101a",
    accent: "#f43f5e",
    darkAccent: "#fb7185",
    badgeClass: "bg-rose-500 text-white border-rose-600 font-bold shadow-2xs dark:bg-rose-600 dark:border-rose-500",
    cellClass: "bg-rose-50 text-rose-950 border-rose-200 dark:bg-rose-950/50 dark:text-rose-100 dark:border-rose-900",
    selectClass: "bg-rose-500 border-rose-600 text-white font-bold focus:ring-rose-500",
    dotClass: "bg-rose-500",
  },
  amber: {
    key: "amber",
    bg: "#fef3c7",
    darkBg: "#2d2108",
    accent: "#f59e0b",
    darkAccent: "#fbbf24",
    badgeClass: "bg-amber-400 text-amber-950 border-amber-500 font-bold shadow-2xs dark:bg-amber-500 dark:text-amber-950 dark:border-amber-400",
    cellClass: "bg-amber-50 text-amber-950 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900",
    selectClass: "bg-amber-400 border-amber-500 text-amber-950 font-bold focus:ring-amber-500",
    dotClass: "bg-amber-500",
  },
  yellow: {
    key: "yellow",
    bg: "#fef9c3",
    darkBg: "#2a2707",
    accent: "#eab308",
    darkAccent: "#facc15",
    badgeClass: "bg-yellow-100 text-yellow-900 border-yellow-400 font-bold dark:bg-yellow-950/70 dark:text-yellow-200 dark:border-yellow-700",
    cellClass: "bg-yellow-50 text-yellow-950 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-100 dark:border-yellow-900",
    selectClass: "bg-yellow-100 border-yellow-400 text-yellow-900 font-semibold focus:ring-yellow-500",
    dotClass: "bg-yellow-500",
  },
  lime: {
    key: "lime",
    bg: "#ecfccb",
    darkBg: "#1b2a0b",
    accent: "#84cc16",
    darkAccent: "#a3e635",
    badgeClass: "bg-lime-100 text-lime-900 border-lime-400 font-bold dark:bg-lime-950/70 dark:text-lime-200 dark:border-lime-700",
    cellClass: "bg-lime-50 text-lime-950 border-lime-200 dark:bg-lime-950/40 dark:text-lime-100 dark:border-lime-900",
    selectClass: "bg-lime-100 border-lime-400 text-lime-900 font-semibold focus:ring-lime-500",
    dotClass: "bg-lime-500",
  },
  green: {
    key: "green",
    bg: "#d1fae5",
    darkBg: "#0a2a1f",
    accent: "#10b981",
    darkAccent: "#34d399",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-400 font-bold dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700",
    cellClass: "bg-emerald-50 text-emerald-950 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900",
    selectClass: "bg-emerald-100 border-emerald-400 text-emerald-900 font-semibold focus:ring-emerald-500",
    dotClass: "bg-emerald-500",
  },
  deepgreen: {
    key: "deepgreen",
    bg: "#bbf7d0",
    darkBg: "#07301a",
    accent: "#16a34a",
    darkAccent: "#4ade80",
    badgeClass: "bg-green-600 text-white border-green-700 font-bold shadow-2xs dark:bg-green-600 dark:border-green-500",
    cellClass: "bg-green-50 text-green-950 border-green-200 dark:bg-green-950/50 dark:text-green-100 dark:border-green-900",
    selectClass: "bg-green-600 border-green-700 text-white font-bold focus:ring-green-500",
    dotClass: "bg-green-600",
  },
  purple: {
    key: "purple",
    bg: "#ede9fe",
    darkBg: "#1e1236",
    accent: "#8b5cf6",
    darkAccent: "#a78bfa",
    badgeClass: "bg-violet-600 text-white border-violet-700 font-bold shadow-2xs dark:bg-violet-600 dark:border-violet-500",
    cellClass: "bg-violet-50 text-violet-950 border-violet-200 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-900",
    selectClass: "bg-violet-600 border-violet-700 text-white font-bold focus:ring-violet-500",
    dotClass: "bg-violet-500",
  },
  orange: {
    key: "orange",
    bg: "#ffedd5",
    darkBg: "#33170a",
    accent: "#f97316",
    darkAccent: "#fb923c",
    badgeClass: "bg-orange-500 text-white border-orange-600 font-bold shadow-2xs dark:bg-orange-600 dark:border-orange-500",
    cellClass: "bg-orange-50 text-orange-950 border-orange-200 dark:bg-orange-950/50 dark:text-orange-100 dark:border-orange-900",
    selectClass: "bg-orange-500 border-orange-600 text-white font-bold focus:ring-orange-500",
    dotClass: "bg-orange-500",
  },
  grey: {
    key: "grey",
    bg: "#e5e7eb",
    darkBg: "#1c1d21",
    accent: "#9ca3af",
    darkAccent: "#6b7280",
    badgeClass: "bg-gray-200 text-gray-600 border-gray-300 font-semibold line-through decoration-gray-400/70 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
    cellClass: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/70 dark:text-gray-400 dark:border-gray-800",
    selectClass: "bg-gray-200 border-gray-300 text-gray-700 font-semibold focus:ring-gray-400",
    dotClass: "bg-gray-400",
  },
};

/** Lifecycle stage of an order. */
export type OrderStage =
  | "draft"
  | "new"
  | "processing"
  | "packed"
  | "transit"
  | "delivered"
  | "grn"
  | "cancelled"
  | "archived";

const STAGE_TONE: Record<Exclude<OrderStage, "archived">, ToneKey> = {
  draft: "slate",
  new: "red",
  processing: "amber",
  packed: "green",
  transit: "purple",
  delivered: "deepgreen",
  grn: "orange",
  cancelled: "grey",
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/** Stage from a status string alone (lifecycle, fulfilment or legacy wording). */
export function stageFromStatus(status: unknown): OrderStage {
  const s = norm(status);
  if (!s || s === "scheduled") return "new";
  if (s === "draft" || s === "pending approval") return "draft";
  if (s === "new" || s === "created") return "new";
  if (s.includes("cancel") || s.includes("reject")) return "cancelled";
  if (s.includes("archive")) return "archived";
  if (s.includes("grn") || s.includes("shortage") || s.includes("damaged") || s.includes("issue") || s.includes("error")) return "grn";
  if (s.includes("deliver") || s.includes("completed") || s.includes("successful")) return "delivered";
  if (s.includes("transit") || s.includes("shipped") || s.includes("dispatch") || s.includes("destination")) return "transit";
  if (s === "packed" || s.includes("box packed") || s.includes("final packed") || s.includes("ready for pickup") || s.includes("ready to")) return "packed";
  return "processing";
}

/** Tone for a plain status chip (lifecycle, fulfilment or printing wording). */
export function getStatusTone(status: unknown): Tone {
  const s = norm(status);
  // Progress wording used by the printing / fulfilment chips
  if (s.includes("partial") && s.includes("print")) return TONES.yellow;
  if (s === "docs printed" || s === "document printed" || s === "printed") return TONES.lime;
  if (s === "pending print" || s === "unprinted" || s === "box dimension pending") return TONES.slate;
  if (s === "box dimension approved" || s === "box dimension confirmed" || s === "dimensions given") return TONES.lime;
  if (s === "packaging in progress" || s === "clear bag assigned") return TONES.amber;
  const stage = stageFromStatus(status);
  return stage === "archived" ? TONES.grey : TONES[STAGE_TONE[stage]];
}

export interface OrderToneInput {
  status?: string | null;
  fulfilmentStatus?: string | null;
  printingStatus?: string | null;
  docsPrinted?: boolean | null;
  dimensionConfirmed?: boolean | null;
  boxesPacked?: boolean | null;
  pickupDone?: boolean | null;
  isArchived?: boolean | null;
  items?: Array<{ isPrinted?: boolean | null }> | null;
  customData?: unknown;
}

export type PrintProgress = "none" | "partial" | "full";

export interface OrderTone {
  stage: OrderStage;
  /** Base hue of the row. */
  tone: Tone;
  /** For archived orders: the stage they were archived from. */
  archivedFrom: OrderStage | null;
  printProgress: PrintProgress;
  dimensionsGiven: boolean;
  packagingInProgress: boolean;
  /** Short human label, e.g. "New", "Archived · Delivered". */
  label: string;
}

function printProgressOf(order: OrderToneInput): PrintProgress {
  const ps = norm(order.printingStatus);
  const items = Array.isArray(order.items) ? order.items : [];
  const printedItems = items.filter((it) => it?.isPrinted).length;
  if (order.docsPrinted || ps === "docs printed" || ps === "document printed" || (items.length > 0 && printedItems === items.length)) {
    return "full";
  }
  if (ps.includes("partial") || printedItems > 0) return "partial";
  return "none";
}

const STAGE_LABEL: Record<OrderStage, string> = {
  draft: "Draft",
  new: "New",
  processing: "In Processing",
  packed: "Packed",
  transit: "In Transit",
  delivered: "Delivered",
  grn: "GRN Issue",
  cancelled: "Cancelled",
  archived: "Archived",
};

/** Combined colour state of one order. */
export function getOrderTone(order: OrderToneInput): OrderTone {
  const custom = (order.customData && typeof order.customData === "object" ? order.customData : {}) as Record<string, any>;
  const fs = norm(order.fulfilmentStatus);
  let stage = stageFromStatus(order.status);

  // Archived: keep the colour of the state it was archived from.
  let archivedFrom: OrderStage | null = null;
  if (stage === "archived" || order.isArchived) {
    const reason = norm(custom.archiveReason);
    const from = custom.archivedFromStatus ? stageFromStatus(custom.archivedFromStatus) : null;
    archivedFrom =
      stage === "cancelled" ? "cancelled" :
      reason === "grn_resolved" ? "grn" :
      reason.startsWith("grn") ? "delivered" :
      from && from !== "archived" ? from :
      order.pickupDone ? "delivered" : "cancelled";
    stage = "archived";
  }

  // Packed on the floor while the lifecycle still says In Processing → green.
  if (stage === "processing" && (fs === "packed" || order.boxesPacked)) stage = "packed";
  if (stage === "processing" && (fs === "dispatched" || order.pickupDone)) stage = "transit";

  const printProgress = printProgressOf(order);
  const dimensionsGiven = Boolean(order.dimensionConfirmed) || fs === "box dimension approved" || fs === "box dimension confirmed";
  const packagingInProgress =
    (fs === "packaging in progress" || norm(order.status) === "packaging in progress") && (stage === "processing" || stage === "new");

  let tone: Tone;
  let label = STAGE_LABEL[stage];
  if ((stage as OrderStage) === "archived") {
    const fromStage = ((archivedFrom as OrderStage | null) && archivedFrom !== ("archived" as OrderStage) ? archivedFrom : "cancelled") as Exclude<OrderStage, "archived">;
    const fromTone = fromStage === "grn" ? TONES.green : TONES[STAGE_TONE[fromStage as Exclude<OrderStage, "archived" | "grn">]];
    tone = fromTone;
    label = `Archived · ${fromStage === "grn" ? "GRN resolved" : STAGE_LABEL[fromStage]}`;
  } else {
    tone = TONES[STAGE_TONE[stage as Exclude<OrderStage, "archived">]];
  }

  return { stage, tone, archivedFrom, printProgress, dimensionsGiven, packagingInProgress, label };
}

/** Progress tints blended into New / In Processing rows. */
const PROGRESS = {
  printPartial: { light: "#fef08a", dark: "#3d3509" },
  printFull: { light: "#d9f99d", dark: "#26360b" },
  dimensions: { light: "#a7f3d0", dark: "#0b3b2c" },
};

/**
 * CSS background for an order row or card. New / In Processing rows show their progress as a
 * left-to-right blend: base hue → yellow (labels printing) → green (dimensions given).
 * Everything else is a flat tint of its stage colour.
 */
export function getOrderRowBackground(order: OrderToneInput, dark = false): string {
  const t = getOrderTone(order);
  const base = dark ? t.tone.darkBg : t.tone.bg;
  if (t.stage !== "new" && t.stage !== "processing") {
    if (t.stage === "archived") {
      // Muted, with a thin orange edge for GRN-resolved archives.
      const edge = t.archivedFrom === "grn" ? (dark ? TONES.orange.darkAccent : TONES.orange.accent) : null;
      return edge ? `linear-gradient(90deg, ${edge} 0, ${edge} 3px, ${base} 3px)` : base;
    }
    return base;
  }
  const stops: string[] = [`${base} 0%`, `${base} 38%`];
  const print = t.printProgress === "full" ? PROGRESS.printFull : t.printProgress === "partial" ? PROGRESS.printPartial : null;
  if (print && t.dimensionsGiven) {
    stops.push(`${dark ? print.dark : print.light} 72%`, `${dark ? PROGRESS.dimensions.dark : PROGRESS.dimensions.light} 100%`);
  } else if (print) {
    stops.push(`${dark ? print.dark : print.light} 100%`);
  } else if (t.dimensionsGiven) {
    stops.push(`${dark ? PROGRESS.dimensions.dark : PROGRESS.dimensions.light} 100%`);
  } else {
    return base;
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Hex of the order's accent (left edge stripe on rows and cards). */
export function getOrderAccent(order: OrderToneInput, dark = false): string {
  const t = getOrderTone(order);
  return dark ? t.tone.darkAccent : t.tone.accent;
}
