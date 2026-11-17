/**
 * Delhivery raw response -> app types.
 *
 * PROVISIONAL: the Developer Portal documents requests but not response bodies, and no
 * staging fixtures have been captured yet (no credentials). Until `npm run delhivery:discover`
 * has been run and these mappers have been checked against tests/fixtures/delhivery/*.json,
 * every mapper here:
 *   - searches for a field by a list of likely key names instead of one exact path,
 *   - returns `null` (never a guess) when nothing matches,
 *   - reports `matched` = which keys it actually used, so the UI can show "unverified".
 *
 * When real fixtures exist, replace the candidate lists with the exact paths and add the
 * fixtures to tests/delhivery-mappers.test.ts.
 */

export const DELHIVERY_TRACK_STATUSES = [
  "MANIFESTED",
  "PICKED_UP",
  "LEFT_ORIGIN",
  "REACH_DESTINATION",
  "UNDEL_REATTEMPT",
  "PART_DEL",
  "OFD",
  "DELIVERED",
  "RETURNED_INTRANSIT",
  "RECEIVED_AT_RETURN_CENTER",
  "RETURN_OFD",
  "RETURN_DELIVERED",
  "NOT_PICKED",
  "LOST",
] as const;

export type DelhiveryTrackStatus = (typeof DELHIVERY_TRACK_STATUSES)[number];

export const DELHIVERY_TRACK_STATUS_LABELS: Record<DelhiveryTrackStatus, string> = {
  MANIFESTED: "Manifested",
  PICKED_UP: "Picked up",
  LEFT_ORIGIN: "Left origin",
  REACH_DESTINATION: "Reached destination city",
  UNDEL_REATTEMPT: "Delivery attempted",
  PART_DEL: "Partially delivered",
  OFD: "Out for delivery",
  DELIVERED: "Delivered",
  RETURNED_INTRANSIT: "Returning",
  RECEIVED_AT_RETURN_CENTER: "At return centre",
  RETURN_OFD: "Return out for delivery",
  RETURN_DELIVERED: "Return delivered",
  NOT_PICKED: "Not picked",
  LOST: "Lost",
};

// ---------- generic search helpers ----------

type Found<T> = { value: T; key: string; path: string };

function walk(node: unknown, visit: (key: string, value: unknown, path: string) => void, key = "", path = "", depth = 0) {
  if (depth > 8 || node == null) return;
  visit(key, node, path);
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, visit, key, `${path}[${i}]`, depth + 1));
  } else if (typeof node === "object") {
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      walk(child, visit, k, path ? `${path}.${k}` : k, depth + 1);
    }
  }
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** First value whose key matches one of `keys` (in priority order) and passes `accept`. */
function findByKeys<T>(body: unknown, keys: string[], accept: (v: unknown) => T | null): Found<T> | null {
  const wanted = keys.map(norm);
  const hits: { rank: number; found: Found<T> }[] = [];
  walk(body, (k, v, path) => {
    const rank = wanted.indexOf(norm(k));
    if (rank < 0) return;
    const value = accept(v);
    if (value !== null) hits.push({ rank, found: { value, key: k, path } });
  });
  hits.sort((a, b) => a.rank - b.rank);
  return hits[0]?.found ?? null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "yes", "y", "1", "serviceable"].includes(s)) return true;
    if (["false", "no", "n", "0", "non-serviceable", "not serviceable"].includes(s)) return false;
  }
  if (v === 1) return true;
  if (v === 0) return false;
  return null;
}

const money = (n: number) => Number(n.toFixed(2));

/** Delhivery error bodies vary; pull a human sentence if one exists. */
export function extractDelhiveryMessage(body: unknown): string | null {
  if (typeof body === "string") return body.trim().slice(0, 300) || null;
  const hit = findByKeys(body, ["error", "message", "msg", "detail", "errors", "reason", "remarks"], (v) => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return (v as string[]).join("; ");
    return null;
  });
  return hit ? hit.value.slice(0, 300) : null;
}

// ---------- serviceability ----------

export interface MappedServiceability {
  serviceable: boolean | null;
  oda: boolean | null;
  matched: string[];
}

export function mapServiceability(body: unknown): MappedServiceability {
  const s = findByKeys(body, ["serviceable", "is_serviceable", "servicable", "is_servicable", "serviceability"], asBool);
  const oda = findByKeys(body, ["is_oda", "oda", "oda_flag"], asBool);
  return {
    serviceable: s?.value ?? null,
    oda: oda?.value ?? null,
    matched: [s?.path, oda?.path].filter(Boolean) as string[],
  };
}

// ---------- TAT ----------

export interface MappedTat {
  days: number | null;
  matched: string[];
}

export function mapTat(body: unknown): MappedTat {
  const hit = findByKeys(body, ["tat", "tat_days", "expected_tat", "estimated_tat", "days", "tat_in_days"], (v) => {
    const n = asNumber(v);
    return n !== null && n >= 0 && n < 60 ? n : null;
  });
  return { days: hit?.value ?? null, matched: hit ? [hit.path] : [] };
}

// ---------- freight estimate / breakup ----------

export interface ChargeLine {
  label: string;
  amount: number;
}

export interface MappedFreight {
  total: number | null;
  gst: number | null;
  /** Numeric charge fields found next to the total, for the breakdown drawer. */
  lines: ChargeLine[];
  matched: string[];
}

const TOTAL_KEYS = ["total", "total_amount", "grand_total", "total_charge", "total_charges", "total_freight", "estimated_freight", "freight_total", "net_amount", "amount"];
const GST_KEYS = ["gst", "gst_amount", "tax", "total_tax", "igst"];
const BREAKUP_KEYS = ["price_breakup", "breakup", "charges", "charge_breakup", "freight_breakup", "charges_breakup", "details"];

function collectLines(node: unknown): ChargeLine[] {
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  return Object.entries(node as Record<string, unknown>)
    .map(([k, v]) => ({ label: k, amount: asNumber(v) }))
    .filter((l): l is ChargeLine => l.amount !== null && l.amount !== 0)
    .map((l) => ({ label: l.label.replace(/_/g, " "), amount: money(l.amount) }));
}

export function mapFreight(body: unknown): MappedFreight {
  const total = findByKeys(body, TOTAL_KEYS, (v) => {
    const n = asNumber(v);
    return n !== null && n > 0 ? n : null;
  });
  const gst = findByKeys(body, GST_KEYS, (v) => {
    const n = asNumber(v);
    return n !== null && n >= 0 ? n : null;
  });
  const breakup = findByKeys(body, BREAKUP_KEYS, (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null));
  return {
    total: total ? money(total.value) : null,
    gst: gst ? money(gst.value) : null,
    lines: breakup ? collectLines(breakup.value) : [],
    matched: [total?.path, gst?.path, breakup?.path].filter(Boolean) as string[],
  };
}

/** Freight breakup for several LRs. Returns one entry per LR found, keyed by LR number. */
export function mapFreightBreakup(body: unknown, lrns: string[]): Record<string, MappedFreight> {
  const out: Record<string, MappedFreight> = {};
  for (const lrn of lrns) {
    let scoped: unknown = null;
    walk(body, (k, v) => {
      if (scoped) return;
      if (k === lrn && v && typeof v === "object") scoped = v;
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        const rec = v as Record<string, unknown>;
        if (["lrn", "lr_number", "lrnum", "lr"].some((key) => asString(rec[key]) === lrn)) scoped = v;
      }
    });
    if (scoped) out[lrn] = mapFreight(scoped);
  }
  if (!Object.keys(out).length && lrns.length === 1) out[lrns[0]] = mapFreight(body);
  return out;
}

// ---------- manifest ----------

export function mapManifestJobId(body: unknown): string | null {
  return findByKeys(body, ["job_id", "jobid", "job"], asString)?.value ?? null;
}

export type ManifestState = "pending" | "success" | "failed" | "unknown";

export interface MappedManifestStatus {
  state: ManifestState;
  rawStatus: string | null;
  lrn: string | null;
  awbs: string[];
  message: string | null;
  matched: string[];
}

const LRN_KEYS = ["lrn", "lr_number", "lrnum", "lr_no", "lr"];
const AWB_KEYS = ["waybills", "awbs", "wbns", "awb_numbers", "waybill", "awb", "wbn", "master_waybill", "child_waybills"];

function collectAwbs(body: unknown): { awbs: string[]; paths: string[] } {
  const set = new Set<string>();
  const paths: string[] = [];
  const wanted = AWB_KEYS.map(norm);
  walk(body, (k, v, path) => {
    if (!wanted.includes(norm(k))) return;
    const add = (x: unknown) => {
      const s = asString(x);
      if (s && /^[A-Za-z0-9-]{6,30}$/.test(s)) set.add(s);
    };
    if (Array.isArray(v)) v.forEach(add);
    else add(v);
    paths.push(path);
  });
  return { awbs: [...set], paths };
}

export function mapManifestStatus(body: unknown): MappedManifestStatus {
  const status = findByKeys(body, ["status", "state", "job_status"], asString);
  const lrn = findByKeys(body, LRN_KEYS, (v) => {
    const s = asString(v);
    return s && /^[A-Za-z0-9-]{4,30}$/.test(s) ? s : null;
  });
  const { awbs, paths } = collectAwbs(body);
  const raw = status?.value ?? null;
  const s = (raw ?? "").toLowerCase();

  let state: ManifestState = "unknown";
  if (lrn) state = "success";
  else if (/fail|error|reject|invalid/.test(s)) state = "failed";
  else if (/pend|process|queue|progress|init|running|accept/.test(s)) state = "pending";
  else if (/success|complete|done|created/.test(s)) state = lrn ? "success" : "unknown";

  return {
    state,
    rawStatus: raw,
    lrn: lrn?.value ?? null,
    awbs,
    message: state === "failed" ? extractDelhiveryMessage(body) : null,
    matched: [status?.path, lrn?.path, ...paths].filter(Boolean) as string[],
  };
}

// ---------- tracking ----------

export interface MappedTrack {
  status: DelhiveryTrackStatus | null;
  rawStatus: string | null;
  location: string | null;
  statusTime: string | null;
  matched: string[];
}

export function mapTrack(body: unknown): MappedTrack {
  // The status vocabulary IS documented, so the most reliable signal is a known value.
  // Prefer one under a status-like key; otherwise the first known value anywhere.
  let known: Found<DelhiveryTrackStatus> | null = null;
  let knownUnderStatusKey = false;
  walk(body, (k, v, path) => {
    if (knownUnderStatusKey || typeof v !== "string") return;
    const up = v.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (!(DELHIVERY_TRACK_STATUSES as readonly string[]).includes(up)) return;
    const statusKey = /status/i.test(k);
    if (!known || statusKey) {
      known = { value: up as DelhiveryTrackStatus, key: k, path };
      knownUnderStatusKey = statusKey;
    }
  });
  const foundKnown = known as Found<DelhiveryTrackStatus> | null;
  const raw = foundKnown ? null : findByKeys(body, ["status", "current_status", "shipment_status"], asString);
  const location = findByKeys(body, ["location", "current_location", "city", "scan_location", "center"], asString);
  const time = findByKeys(body, ["status_time", "timestamp", "updated_at", "scan_time", "status_date_time", "date"], asString);
  return {
    status: foundKnown?.value ?? null,
    rawStatus: foundKnown?.value ?? raw?.value ?? null,
    location: location?.value ?? null,
    statusTime: time?.value ?? null,
    matched: [foundKnown?.path, raw?.path, location?.path, time?.path].filter(Boolean) as string[],
  };
}

// ---------- labels / pickup ----------

/** Every http(s) URL in the response, in order, de-duplicated. */
export function mapLabelUrls(body: unknown): string[] {
  const urls = new Set<string>();
  walk(body, (_k, v) => {
    if (typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim())) urls.add(v.trim());
  });
  return [...urls];
}

export function mapPickupId(body: unknown): string | null {
  return findByKeys(body, ["pickup_id", "pickupid", "pr_id", "pur_id", "pickup_request_id", "request_id", "id"], asString)?.value ?? null;
}
