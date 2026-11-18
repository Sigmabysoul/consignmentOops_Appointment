/**
 * Carton groups for carrier booking (copy wizard, Delhivery, Shiprocket, OM WhatsApp draft).
 *
 * ORDER / ITEM FIELD CONTRACT (written by the consignment app, App 1 — see its
 * packaging-service.ts resolveItemPackaging and DimensionConfirmationModal):
 *   boxCount           = TOTAL cartons, INCLUDING the single remainder carton
 *                        (fullBoxes + (hasRemainder ? 1 : 0))
 *   lengthCm/…Cm       = full-box dimensions
 *   weightKg           = TOTAL weight of the order/item (full boxes + remainder carton)
 *   remainderQty       = number of PIECES (units) inside the ONE remainder carton — not a carton count
 *   remainder…Cm       = remainder carton dimensions
 *   remainderWeightKg  = weight of that one remainder carton
 *   dimensionUnit / weightUnit = units of the numbers above (cm|mm|in|m, kg|g|lb)
 *
 * Example (real App 1 row): 1000 pcs @ 150/box → boxCount 7, 40×30×25, weightKg 70,
 * remainderQty 100, remainder 30×20×15 @ 6.67 kg  ⇒  6 × 40×30×25 + 1 × 30×20×15, total 70.00 kg.
 *
 * GROUP WEIGHT CONTRACT (output):
 *   weightKg / weightPerBoxKg = weight of ONE carton in the group (kg, exactly 2 dp)
 *   totalWeightKg             = boxCount × weightPerBoxKg (kg, exactly 2 dp)
 * Weights are distributed in integer 10 g units (0.01 kg) so that the sum of every carton equals
 * the order total exactly at 2 dp (zero drift, CLAUDE.md Problem 2). When the total does not
 * divide evenly, a group is split into two rows that differ by 0.01 kg per box
 * (e.g. 63.33 kg over 6 boxes → 3 × 10.56 + 3 × 10.55) instead of showing a rounded average whose
 * sum would drift from the order total.
 *
 * All output dimensions are in cm and weights in kg (converted from the stored units).
 */
export interface BoxDimensionGroup {
  id: string;
  /** Physical cartons in this row. */
  boxCount: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  /** Weight of ONE carton (kg, 2 dp). Same value as weightPerBoxKg; kept for existing callers. */
  weightKg: number | null;
  /** Weight of ONE carton (kg, 2 dp). */
  weightPerBoxKg?: number | null;
  /** boxCount × weightPerBoxKg (kg, exact 2 dp). */
  totalWeightKg?: number | null;
  /** Always "cm" for groups built here (stored units are converted). */
  dimensionUnit: string;
  /** Always "kg" for groups built here (stored units are converted). */
  weightUnit: string;
  isRemainder?: boolean;
  /** Pieces inside the remainder carton (remainder rows only). */
  remainderPieces?: number | null;
  label?: string;
  key: string; // unique dimension key e.g. "23x40x25"
}

/**
 * Parses numeric dimension string like "23 x 40 x 25", "23x40x25", "23*40*25"
 */
export function parseDimensionString(dimStr?: string | null): {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  boxCount: number | null;
} | null {
  if (!dimStr || !dimStr.trim()) return null;
  const s = dimStr.trim();

  // Match: "3 @ 23x40x25" or "3 x 23 x 40 x 25"
  const multiMatch = s.match(/^(\d+)\s*[@xX*]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)/);
  if (multiMatch) {
    return {
      boxCount: parseInt(multiMatch[1], 10),
      lengthCm: parseFloat(multiMatch[2]),
      widthCm: parseFloat(multiMatch[3]),
      heightCm: parseFloat(multiMatch[4]),
    };
  }

  // Match: "23 x 40 x 25" or "23x40x25"
  const standardMatch = s.match(/(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)/);
  if (standardMatch) {
    return {
      boxCount: null,
      lengthCm: parseFloat(standardMatch[1]),
      widthCm: parseFloat(standardMatch[2]),
      heightCm: parseFloat(standardMatch[3]),
    };
  }

  return null;
}

/**
 * Parses App 1's compound packaging strings into carton rows:
 *   "6 BOX ( 40X30X25 ) + 1 REM ( 30X20X15 )", "6 ( 40X30X25 ) | 1 REM ( 30X20X15 )", "1 REM ( 30X20X15 )".
 * Returns null when the string is not in that format.
 */
export function parseCompoundDimensionString(
  dimStr?: string | null
): Array<{ count: number; lengthCm: number; widthCm: number; heightCm: number; isRemainder: boolean }> | null {
  if (!dimStr) return null;
  const re = /(\d+)\s*(BOX(?:ES)?|REM(?:AINDER)?)?\s*\(\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*\)/gi;
  const rows: Array<{ count: number; lengthCm: number; widthCm: number; heightCm: number; isRemainder: boolean }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(dimStr))) {
    rows.push({
      count: parseInt(m[1], 10),
      lengthCm: parseFloat(m[3]),
      widthCm: parseFloat(m[4]),
      heightCm: parseFloat(m[5]),
      isRemainder: /^rem/i.test(m[2] || ""),
    });
  }
  return rows.length ? rows : null;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Multiplier that converts a length in `unit` to cm (cm, mm, in/inch, m). Unknown → cm. */
export function lengthToCmFactor(unit?: string | null): number {
  const u = String(unit || "cm").trim().toLowerCase();
  if (u === "mm" || u.startsWith("milli")) return 0.1;
  if (u === "in" || u === "inch" || u === "inches" || u === '"') return 2.54;
  if (u === "m" || u === "mtr" || u === "meter" || u === "metre" || u === "meters" || u === "metres") return 100;
  return 1;
}

/** Multiplier that converts a weight in `unit` to kg (kg, g/gm/gram, lb/lbs). Unknown → kg. */
export function weightToKgFactor(unit?: string | null): number {
  const u = String(unit || "kg").trim().toLowerCase();
  if (u === "g" || u === "gm" || u === "gms" || u === "gram" || u === "grams" || u === "gr") return 0.001;
  if (u === "lb" || u === "lbs" || u === "pound" || u === "pounds") return 0.45359237;
  return 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** kg → integer 10 g units (0.01 kg). */
const toCenti = (kg: number) => Math.round(kg * 100);
const fromCenti = (c: number) => c / 100;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
const posInt = (v: unknown): number => {
  const n = num(v);
  return n !== null && n > 0 ? Math.floor(n) : 0;
};
const cm = (v: unknown, factor: number): number | null => {
  const n = pos(v);
  return n === null ? null : round2(n * factor);
};

/**
 * Splits `totalCenti` (integer 0.01 kg units) over `n` boxes. Returns at most two rows: the
 * heavier boxes (base + 0.01 kg) first. Σ count × centi === totalCenti exactly.
 */
export function distributeWeightCenti(totalCenti: number, n: number): Array<{ count: number; centi: number }> {
  if (!(n > 0)) return [];
  const total = Math.max(0, Math.round(totalCenti));
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return [
    { count: extra, centi: base + 1 },
    { count: n - extra, centi: base },
  ].filter((r) => r.count > 0);
}

// ---------------------------------------------------------------------------
// Carton rows (before weight distribution)
// ---------------------------------------------------------------------------

interface CartonRow {
  id: string;
  count: number;
  l: number | null;
  w: number | null;
  h: number | null;
  /** Total weight of all cartons in this row, 0.01 kg units (null = unknown). */
  totalCenti: number | null;
  /** Known exact per-box weight (explicit groups); otherwise distributed from totalCenti. */
  perBoxCenti?: number | null;
  isRemainder: boolean;
  pieces?: number | null;
  labelSuffix?: string;
}

interface PackagingFields {
  boxCount?: unknown;
  lengthCm?: unknown;
  widthCm?: unknown;
  heightCm?: unknown;
  weightKg?: unknown;
  remainderQty?: unknown;
  remainderLengthCm?: unknown;
  remainderWidthCm?: unknown;
  remainderHeightCm?: unknown;
  remainderWeightKg?: unknown;
  totalQty?: unknown;
  dimensionUnit?: string | null;
  weightUnit?: string | null;
  boxDimensions?: string | null;
}

/**
 * Carton rows from one set of App 1 packaging fields (an order or an OrderItem), using the
 * contract documented at the top of this file.
 */
function rowsFromPackagingFields(
  f: PackagingFields,
  idPrefix: string,
  units: { dim?: string | null; wt?: string | null },
  labelSuffix?: string
): CartonRow[] {
  const lf = lengthToCmFactor(f.dimensionUnit || units.dim);
  const wf = weightToKgFactor(f.weightUnit || units.wt);

  const totalBoxes = posInt(f.boxCount);
  const L = cm(f.lengthCm, lf);
  const W = cm(f.widthCm, lf);
  const H = cm(f.heightCm, lf);
  const hasFullDims = L !== null || W !== null || H !== null;

  const remPieces = posInt(f.remainderQty);
  const rL = cm(f.remainderLengthCm, lf);
  const rW = cm(f.remainderWidthCm, lf);
  const rH = cm(f.remainderHeightCm, lf);
  const hasRemDims = rL !== null && rW !== null && rH !== null;
  const remWtKg = pos(f.remainderWeightKg);
  const remCenti = remWtKg !== null ? toCenti(remWtKg * wf) : null;
  const totalWtKg = pos(f.weightKg);
  const totalCenti = totalWtKg !== null ? toCenti(totalWtKg * wf) : null;

  // App 1 fills remainder dims with the full-box dims even when there is no remainder
  // (resolveItemPackaging), so dims alone are not a remainder signal: pieces, or dims + weight.
  const hasRemainder = remPieces > 0 || (hasRemDims && remCenti !== null);

  // Without structured dims, the packaging text (if parseable) is more precise than a bare count.
  const textUsable =
    !hasFullDims && !hasRemDims && Boolean(parseCompoundDimensionString(f.boxDimensions) || parseDimensionString(f.boxDimensions));

  let rows: CartonRow[] = [];
  if (!textUsable && (hasFullDims || totalBoxes > 0 || hasRemainder)) {
    // boxCount includes the remainder carton. A missing count with dims means "1 box" (legacy).
    const fullBoxes = totalBoxes > 0 ? Math.max(0, totalBoxes - (hasRemainder ? 1 : 0)) : hasRemainder ? 0 : 1;
    const remL = hasRemDims ? rL : L;
    const remW = hasRemDims ? rW : W;
    const remH = hasRemDims ? rH : H;

    let fullTotal: number | null = null;
    let remTotal: number | null = null;
    if (!hasRemainder) {
      fullTotal = totalCenti;
    } else if (fullBoxes === 0) {
      remTotal = totalCenti ?? remCenti;
    } else if (totalCenti !== null && remCenti !== null && remCenti <= totalCenti) {
      remTotal = remCenti;
      fullTotal = totalCenti - remCenti;
    } else if (totalCenti !== null) {
      // Remainder weight unknown (or inconsistent): split by pieces when the unit count is known,
      // otherwise evenly per carton. Integer arithmetic keeps Σ === total.
      const totalQty = posInt(f.totalQty);
      if (totalQty > remPieces && remPieces > 0) {
        remTotal = Math.round((totalCenti * remPieces) / totalQty);
      } else {
        remTotal = Math.round(totalCenti / (fullBoxes + 1));
      }
      fullTotal = totalCenti - remTotal;
    } else {
      remTotal = remCenti;
    }

    if (fullBoxes > 0) {
      rows.push({ id: `${idPrefix}standard`, count: fullBoxes, l: L, w: W, h: H, totalCenti: fullTotal, isRemainder: false, labelSuffix });
    }
    if (hasRemainder) {
      rows.push({
        id: `${idPrefix}remainder`,
        count: 1,
        l: remL,
        w: remW,
        h: remH,
        totalCenti: remTotal,
        isRemainder: true,
        pieces: remPieces || null,
        labelSuffix,
      });
    }
  }

  // Fallback: the packaging text ("6 BOX ( 40X30X25 ) + 1 REM ( 30X20X15 )" or "23x40x25").
  if (rows.length === 0 && f.boxDimensions) {
    const compound = parseCompoundDimensionString(f.boxDimensions);
    const parsed = compound
      ? compound
      : (() => {
          const p = parseDimensionString(f.boxDimensions);
          return p
            ? [{ count: p.boxCount || totalBoxes || 1, lengthCm: p.lengthCm!, widthCm: p.widthCm!, heightCm: p.heightCm!, isRemainder: false }]
            : null;
        })();
    if (parsed) {
      const cartons = parsed.reduce((s, r) => s + r.count, 0);
      rows = parsed.map((r, i) => ({
        id: `${idPrefix}parsed-${i}`,
        count: r.count,
        l: round2(r.lengthCm * lf),
        w: round2(r.widthCm * lf),
        h: round2(r.heightCm * lf),
        totalCenti: null,
        isRemainder: r.isRemainder,
        labelSuffix,
      }));
      // Weight: remainder carton gets remainderWeightKg when known, the rest is spread per carton.
      if (totalCenti !== null && cartons > 0) {
        const remRow = rows.find((r) => r.isRemainder && r.count === 1);
        let left = totalCenti;
        let leftBoxes = cartons;
        if (remRow && remCenti !== null && remCenti <= totalCenti) {
          remRow.totalCenti = remCenti;
          left -= remCenti;
          leftBoxes -= 1;
        }
        const pending = rows.filter((r) => r.totalCenti === null);
        pending.forEach((r, i) => {
          const share = i === pending.length - 1 ? left : Math.round((left * r.count) / Math.max(1, leftBoxes));
          r.totalCenti = share;
          left -= share;
          leftBoxes -= r.count;
        });
      }
    }
  }
  return rows;
}

/** App 1's per-item box groups (customData.itemBoxGroups[itemId]): per-box weight `boxWeightKg`. */
function rowsFromBoxGroupSpecs(specs: any[], idPrefix: string, labelSuffix?: string): CartonRow[] {
  const rows: CartonRow[] = [];
  specs.forEach((g, i) => {
    const count = posInt(g?.boxCount);
    if (count <= 0) return;
    const lf = lengthToCmFactor(g.dimensionUnit);
    const wf = weightToKgFactor(g.weightUnit);
    const perBox = pos(g.boxWeightKg ?? g.weightPerBoxKg ?? g.weightKg);
    const perBoxCenti = perBox !== null ? toCenti(perBox * wf) : null;
    rows.push({
      id: `${idPrefix}group-${i}`,
      count,
      l: cm(g.lengthCm, lf),
      w: cm(g.widthCm, lf),
      h: cm(g.heightCm, lf),
      perBoxCenti,
      totalCenti: perBoxCenti !== null ? perBoxCenti * count : null,
      isRemainder: false,
      labelSuffix,
    });
  });
  return rows;
}

/**
 * Explicit carton groups already in the BoxDimensionGroup shape (order.boxDimensionGroups as sent
 * by the API, or customData.boxDimensionGroups). Their weightKg is PER BOX (weightPerBoxKg wins).
 */
function rowsFromExplicitGroups(groups: any[], units: { dim?: string | null; wt?: string | null }): CartonRow[] {
  return groups
    .map((eg, i): CartonRow | null => {
      const count = posInt(eg?.boxCount ?? eg?.count) || 1;
      const lf = lengthToCmFactor(eg.dimensionUnit || units.dim);
      const wf = weightToKgFactor(eg.weightUnit || units.wt);
      const perBox = pos(eg.weightPerBoxKg ?? eg.weightKg ?? eg.weight);
      const perBoxCenti = perBox !== null ? toCenti(perBox * wf) : null;
      return {
        id: typeof eg.id === "string" && eg.id ? eg.id : `explicit-${i}`,
        count,
        l: cm(eg.lengthCm, lf),
        w: cm(eg.widthCm, lf),
        h: cm(eg.heightCm, lf),
        perBoxCenti,
        totalCenti: perBoxCenti !== null ? perBoxCenti * count : null,
        isRemainder: Boolean(eg.isRemainder),
        pieces: posInt(eg.remainderPieces) || null,
      };
    })
    .filter((r): r is CartonRow => r !== null);
}

const itemHasPackaging = (it: any) =>
  posInt(it?.boxCount) > 0 || pos(it?.lengthCm) !== null || pos(it?.widthCm) !== null || pos(it?.heightCm) !== null || Boolean(it?.boxDimensions);

/** Cartons an item contributes (boxCount includes the remainder carton). */
function itemCartonCount(it: any, specs: any[] | null): number {
  if (specs) return specs.reduce((s, g) => s + posInt(g?.boxCount), 0);
  return rowsFromPackagingFields(it, "", {}).reduce((s, r) => s + r.count, 0);
}

function cartonRows(order: any): CartonRow[] {
  const units = { dim: order.dimensionUnit, wt: order.weightUnit };

  // 0. Explicit groups (already in output shape).
  const explicit = order.boxDimensionGroups || order.customData?.boxDimensionGroups;
  if (Array.isArray(explicit) && explicit.length > 0) return rowsFromExplicitGroups(explicit, units);

  const itemGroupsMap =
    order.customData?.itemBoxGroups && typeof order.customData.itemBoxGroups === "object" ? order.customData.itemBoxGroups : {};
  const specsFor = (key: unknown): any[] | null => {
    const g = typeof key === "string" ? itemGroupsMap[key] : null;
    return Array.isArray(g) && g.some((x: any) => posInt(x?.boxCount) > 0) ? g : null;
  };
  const orderBoxes = posInt(order.boxCount);

  // 1. Per-item data. Used for multi-item orders (order-level dims only describe the primary
  //    item) and for single-item orders that App 1 split into explicit box groups. Only when the
  //    items still add up to the order's carton count: if logistics edited the order-level
  //    fields in App 2, those edits win.
  const items: any[] = Array.isArray(order.items) ? order.items.filter(itemHasPackaging) : [];
  if (items.length > 0) {
    const sum = items.reduce((s, it) => s + itemCartonCount(it, specsFor(it.id)), 0);
    const consistent = orderBoxes === 0 || sum === orderBoxes;
    const anySpecs = items.some((it) => specsFor(it.id));
    if (consistent && sum > 0 && (items.length > 1 || anySpecs)) {
      const rows: CartonRow[] = [];
      items.forEach((it, idx) => {
        const prefix = `item-${it.id || idx}-`;
        const suffix = items.length > 1 ? it.itemName || `Item ${idx + 1}` : undefined;
        const specs = specsFor(it.id);
        rows.push(...(specs ? rowsFromBoxGroupSpecs(specs, prefix, suffix) : rowsFromPackagingFields(it, prefix, units, suffix)));
      });
      if (rows.length) return rows;
    }
  }

  // 2. Legacy single orders split into explicit groups by App 1 (customData.itemBoxGroups.single).
  const single = specsFor("single");
  if (single) {
    const sum = single.reduce((s: number, g: any) => s + posInt(g?.boxCount), 0);
    if (orderBoxes === 0 || sum === orderBoxes) return rowsFromBoxGroupSpecs(single, "");
  }

  // 3. Order-level fields (+ boxDimensions text fallback).
  const rows = rowsFromPackagingFields(order, "", units);
  if (rows.length) return rows;

  // 4. Items without order-level data (single item that was not used above).
  if (items.length > 0) {
    const out: CartonRow[] = [];
    items.forEach((it, idx) => {
      out.push(...rowsFromPackagingFields(it, `item-${it.id || idx}-`, units, it.itemName || undefined));
    });
    if (out.length) return out;
  }
  return [];
}

function toGroups(rows: CartonRow[]): BoxDimensionGroup[] {
  const out: BoxDimensionGroup[] = [];
  for (const r of rows) {
    const pieces: Array<{ count: number; centi: number | null }> =
      r.perBoxCenti !== undefined && r.perBoxCenti !== null
        ? [{ count: r.count, centi: r.perBoxCenti }]
        : r.totalCenti !== null
        ? distributeWeightCenti(r.totalCenti, r.count)
        : [{ count: r.count, centi: null }];
    pieces.forEach((p, i) => {
      const perBox = p.centi !== null ? fromCenti(p.centi) : null;
      out.push({
        id: pieces.length > 1 ? `${r.id}-${i + 1}` : r.id,
        boxCount: p.count,
        lengthCm: r.l,
        widthCm: r.w,
        heightCm: r.h,
        weightKg: perBox,
        weightPerBoxKg: perBox,
        totalWeightKg: p.centi !== null ? fromCenti(p.centi * p.count) : null,
        dimensionUnit: "cm",
        weightUnit: "kg",
        isRemainder: r.isRemainder,
        remainderPieces: r.isRemainder ? r.pieces ?? null : null,
        label: "",
        key: `${r.l ?? "?"}x${r.w ?? "?"}x${r.h ?? "?"}`,
      });
    });
  }
  return out;
}

function groupLabel(g: BoxDimensionGroup): string {
  const n = g.boxCount;
  if (g.isRemainder) return `${n} Remainder Box${n > 1 ? "es" : ""}${g.remainderPieces ? ` (${g.remainderPieces} pcs)` : ""}`;
  return `${n} Box${n > 1 ? "es" : ""}`;
}

/**
 * Extract carton groups from an order (see the contract at the top of this file).
 * Groups with identical dimensions AND identical per-box weight are merged (3 × 4 kg + 1 × 4 kg
 * of the same size → "4 boxes @ 4.00 kg/box"); cartons of the same size but a different weight
 * stay on their own row, so every row reads "N boxes × L×W×H @ X kg per box".
 */
export function extractBoxDimensionGroups(order: any): BoxDimensionGroup[] {
  if (!order) return [];
  const groups = toGroups(cartonRows(order));

  const merged = new Map<string, BoxDimensionGroup>();
  for (const g of groups) {
    const hasDims = g.lengthCm !== null && g.widthCm !== null && g.heightCm !== null;
    const mergeKey = hasDims ? `${g.key}@${g.weightPerBoxKg ?? "?"}` : `${g.id}#${merged.size}`;
    const existing = merged.get(mergeKey);
    if (existing && hasDims) {
      existing.boxCount += g.boxCount;
      if (existing.totalWeightKg !== null && existing.totalWeightKg !== undefined && g.totalWeightKg !== null && g.totalWeightKg !== undefined) {
        existing.totalWeightKg = fromCenti(toCenti(existing.totalWeightKg) + toCenti(g.totalWeightKg));
      }
      // A merged row holds both full and remainder cartons: it is no longer "the remainder box".
      if (existing.isRemainder !== g.isRemainder) {
        existing.isRemainder = false;
        existing.remainderPieces = null;
      }
    } else {
      merged.set(mergeKey, { ...g });
    }
  }
  return Array.from(merged.values()).map((g) => ({ ...g, label: groupLabel(g) }));
}

export interface CartonSummary {
  groups: BoxDimensionGroup[];
  /** Physical cartons across all groups (full + remainder). */
  totalBoxes: number;
  /** Σ totalWeightKg of the groups (kg, exact 2 dp), or null if no group has a weight. */
  totalWeightKg: number | null;
  /** Every group has L, W and H. */
  allDimensionsKnown: boolean;
}

export function summarizeCartons(orderOrGroups: any): CartonSummary {
  const groups: BoxDimensionGroup[] = Array.isArray(orderOrGroups)
    ? extractBoxDimensionGroups({ boxDimensionGroups: orderOrGroups })
    : extractBoxDimensionGroups(orderOrGroups);
  const totalBoxes = groups.reduce((s, g) => s + g.boxCount, 0);
  const weighed = groups.filter((g) => typeof g.totalWeightKg === "number");
  const totalCenti = weighed.reduce((s, g) => s + toCenti(g.totalWeightKg as number), 0);
  return {
    groups,
    totalBoxes,
    totalWeightKg: weighed.length ? fromCenti(totalCenti) : null,
    allDimensionsKnown: groups.length > 0 && groups.every((g) => g.lengthCm !== null && g.widthCm !== null && g.heightCm !== null),
  };
}

/**
 * Collapses groups that share L×W×H (regardless of per-box weight) for payloads that carry box
 * counts per size but only a consignment-level weight (Delhivery `dimensions`).
 */
export function mergeGroupsByDimensions(
  groups: BoxDimensionGroup[]
): Array<{ boxCount: number; lengthCm: number | null; widthCm: number | null; heightCm: number | null; totalWeightKg: number | null }> {
  const map = new Map<string, { boxCount: number; lengthCm: number | null; widthCm: number | null; heightCm: number | null; totalCenti: number | null }>();
  groups.forEach((g, i) => {
    const hasDims = g.lengthCm !== null && g.widthCm !== null && g.heightCm !== null;
    const key = hasDims ? `${g.lengthCm}x${g.widthCm}x${g.heightCm}` : `nodims-${i}`;
    const t = typeof g.totalWeightKg === "number" ? toCenti(g.totalWeightKg) : null;
    const cur = map.get(key);
    if (cur) {
      cur.boxCount += g.boxCount;
      cur.totalCenti = cur.totalCenti !== null && t !== null ? cur.totalCenti + t : null;
    } else {
      map.set(key, { boxCount: g.boxCount, lengthCm: g.lengthCm, widthCm: g.widthCm, heightCm: g.heightCm, totalCenti: t });
    }
  });
  return Array.from(map.values()).map(({ totalCenti, ...rest }) => ({
    ...rest,
    totalWeightKg: totalCenti !== null ? fromCenti(totalCenti) : null,
  }));
}

/** Per-box weight of a group (kg), whichever field the caller has. */
export function groupWeightPerBoxKg(group: Pick<BoxDimensionGroup, "weightKg" | "weightPerBoxKg">): number | null {
  const v = group.weightPerBoxKg ?? group.weightKg;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Returns a TSV (tab-separated) string for 1-click clipboard paste into booking websites.
 * Format: Count \t Length \t Breadth \t Height \t Weight PER BOX (kg, 2 dp) — carrier bulk box
 * grids (Delhivery / OM / Ekart) take one row per box size with the weight of one box.
 */
export function formatTabSeparatedBoxRow(group: BoxDimensionGroup): string {
  const count = group.boxCount || 1;
  const l = group.lengthCm ?? "";
  const w = group.widthCm ?? "";
  const h = group.heightCm ?? "";
  const perBox = groupWeightPerBoxKg(group);
  const wt = perBox !== null ? round2(perBox).toFixed(2) : "";
  return `${count}\t${l}\t${w}\t${h}\t${wt}`;
}

/**
 * Formatted string: "23 x 40 x 25 cm"
 */
export function formatDimensionDisplay(group: BoxDimensionGroup): string {
  if (group.lengthCm === null && group.widthCm === null && group.heightCm === null) {
    return "Dimensions Pending";
  }
  return `${group.lengthCm ?? 0} × ${group.widthCm ?? 0} × ${group.heightCm ?? 0} ${group.dimensionUnit}`;
}
