/**
 * Delhivery B2B discovery: calls the real API and saves REDACTED raw responses as fixtures,
 * so response mappers are written from real data instead of guesses (CLAUDE.md rule 5).
 *
 *   npm run delhivery:discover                       # read-only: login, serviceability, TAT, freight estimate
 *   npm run delhivery:discover -- --dest=400093,110037
 *   npm run delhivery:discover -- --manifest         # ALSO books a test LR on STAGING (refused on production)
 *   npm run delhivery:discover -- --lrn=220012345678 # track / labels / freight breakup / POD for an existing LR
 *
 * Output: tests/fixtures/delhivery/<name>.json
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DELHIVERY_PATHS,
  DelhiveryError,
  getDelhiveryConfig,
  getPincodeServiceability,
  getExpectedTat,
  estimateFreight,
  createManifest,
  getManifestStatus,
  trackLr,
  getShippingLabels,
  getFreightBreakup,
  downloadDocument,
  redactDelhiveryPayload,
  type DelhiveryResponse,
} from "../src/modules/delhivery";

if (existsSync(".env")) process.loadEnvFile(".env");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const OUT_DIR = join(process.cwd(), "tests", "fixtures", "delhivery");
mkdirSync(OUT_DIR, { recursive: true });

const config = getDelhiveryConfig();
const destinations = String(args.dest || "400093,110037,781001").split(",").map((s) => s.trim()).filter(Boolean);

function save(name: string, payload: unknown) {
  const file = join(OUT_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(redactDelhiveryPayload(payload), null, 2) + "\n");
  console.log(`  saved ${file}`);
}

async function capture(name: string, call: () => Promise<DelhiveryResponse>) {
  process.stdout.write(`→ ${name} ... `);
  try {
    const res = await call();
    console.log(`HTTP ${res.status} (${res.durationMs}ms)`);
    save(name, { ok: true, status: res.status, contentType: res.contentType, data: res.data });
    return res.data;
  } catch (err) {
    if (err instanceof DelhiveryError) {
      console.log(`FAILED ${err.kind}${err.status ? ` HTTP ${err.status}` : ""}: ${err.message}`);
      save(name, { ok: false, kind: err.kind, status: err.status ?? null, body: err.body ?? null });
      if (err.kind === "auth" || err.kind === "auth_locked") {
        console.error("\nLogin rejected. Fix DELHIVERY_USERNAME / DELHIVERY_PASSWORD. Do NOT re-run for 10 minutes (account lock).");
        process.exit(1);
      }
    } else {
      console.log(`FAILED ${(err as Error)?.message ?? err}`);
    }
    return undefined;
  }
}

/** Finds a value by key name anywhere in a payload. Discovery-only helper. */
function findKey(node: unknown, re: RegExp, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (re.test(k) && (typeof v === "string" || typeof v === "number") && String(v)) return v;
    const nested = findKey(v, re, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

async function main() {
  console.log(`Delhivery discovery — env=${config.env} base=${config.baseUrl} source_pin=${config.sourcePin}\n`);

  // 1. Login (raw response captured once so we learn its shape; the client logs in separately)
  process.stdout.write("→ login ... ");
  const loginRes = await fetch(config.baseUrl + DELHIVERY_PATHS.login, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const loginText = await loginRes.text();
  let loginBody: unknown = loginText;
  try {
    loginBody = JSON.parse(loginText);
  } catch {}
  console.log(`HTTP ${loginRes.status}`);
  save("login", { status: loginRes.status, data: loginBody });
  if (!loginRes.ok) {
    console.error("\nLogin rejected. Fix credentials; wait 10 minutes before retrying (account lock).");
    process.exit(1);
  }

  // 2. Serviceability (source + destinations) incl. a heavy weight to see weight-based fields
  await capture(`serviceability_${config.sourcePin}`, () => getPincodeServiceability(config.sourcePin, undefined, config));
  for (const pin of destinations) {
    await capture(`serviceability_${pin}`, () => getPincodeServiceability(pin, 50_000, config));
  }
  await capture("serviceability_invalid_999999", () => getPincodeServiceability("999999", undefined, config));

  // 3. TAT (surface)
  for (const pin of destinations) {
    await capture(`tat_${config.sourcePin}_${pin}`, () => getExpectedTat(config.sourcePin, pin, config));
  }

  // 4. Freight estimate — standard + remainder box sets (6 × 40x30x25, 1 × 30x20x15), 54.18 kg
  const sampleBoxes = [
    { lengthCm: 40, widthCm: 30, heightCm: 25, boxCount: 6 },
    { lengthCm: 30, widthCm: 20, heightCm: 15, boxCount: 1 },
  ];
  for (const pin of destinations) {
    await capture(`freight_estimate_${pin}`, () =>
      estimateFreight({ boxes: sampleBoxes, totalWeightKg: 54.18, destinationPin: pin, invoiceAmount: 25000, rovInsurance: false }, config)
    );
  }
  await capture(`freight_estimate_${destinations[0]}_carrier_risk`, () =>
    estimateFreight({ boxes: sampleBoxes, totalWeightKg: 54.18, destinationPin: destinations[0], invoiceAmount: 25000, rovInsurance: true }, config)
  );

  // 5. Optional: book a TEST shipment on staging
  let lrn = args.lrn && args.lrn !== "true" ? String(args.lrn) : undefined;
  if (args.manifest) {
    if (config.env !== "test") {
      console.error("\n--manifest is refused outside DELHIVERY_ENV=test (it creates a billable LR).");
      process.exit(1);
    }
    if (!config.warehouseName) {
      console.error("\n--manifest needs DELHIVERY_WAREHOUSE_NAME (exact registered staging warehouse name).");
      process.exit(1);
    }
    const manifest = await capture("manifest_create", () =>
      createManifest(
        {
          orderId: `DISCOVERY-${Date.now()}`,
          description: "Discovery test shipment",
          boxes: sampleBoxes,
          totalWeightKg: 54.18,
          consignee: {
            name: "Discovery Test",
            address: "Test address, Andheri East",
            city: "Mumbai",
            state: "Maharashtra",
            pin: destinations[0],
            phone: "9999999999",
          },
          invoices: [{ number: `DISC-${Date.now()}`, amount: 25000 }],
          rovInsurance: false,
        },
        { ...config, bookingEnabled: true }
      )
    );
    const jobId = findKey(manifest, /job_?id/i);
    if (jobId) {
      for (let attempt = 1; attempt <= 12; attempt++) {
        await new Promise((r) => setTimeout(r, attempt === 1 ? 5000 : 8000));
        const status = await capture(`manifest_status_${attempt}`, () => getManifestStatus(String(jobId), config));
        const found = findKey(status, /^lrn?$|lr_?num/i);
        if (found) {
          lrn = String(found);
          console.log(`  LR: ${lrn}`);
          break;
        }
      }
    } else {
      console.log("  No job id found in the manifest response; inspect manifest_create.json.");
    }
  }

  // 6. Post-booking reads for an LR
  if (lrn) {
    await capture("track", () => trackLr(lrn!, false, config));
    await capture("track_all_wbns", () => trackLr(lrn!, true, config));
    await capture("labels_std", () => getShippingLabels(lrn!, "std", config));
    await capture("freight_breakup", () => getFreightBreakup([lrn!], config));
    await capture("pod_download", () => downloadDocument(lrn!, "LM_POD", config));
  }

  console.log(`\nDone. Fixtures are in ${OUT_DIR} (secrets redacted). Review them before committing.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
