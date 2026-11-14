import { db } from "./db";
import {
  DEFAULT_OM_RATE_CARD,
  DEFAULT_STATE_ZONE_MAP,
  DEFAULT_ODA_MATRIX,
  DEFAULT_OM_CONFIG,
  OmRateRow,
  OdaBand,
  OmPricingConfig,
} from "@/modules/pricing/om-logistics";
import {
  DEFAULT_CARRIER_PRESETS,
  CarrierRatePreset,
} from "@/modules/pricing/multi-carrier/carrier-comparison-engine";
import {
  OmWhatsAppConfig,
  DEFAULT_OM_WHATSAPP_CONFIG,
} from "./om-whatsapp-booking";

export interface UnifiedShippingPresets {
  omRateCard: OmRateRow[];
  omConfig: OmPricingConfig;
  carrierPresets: CarrierRatePreset[];
  stateZoneMap: Record<string, string>;
  odaMatrix: OdaBand[];
  omWhatsAppConfig?: OmWhatsAppConfig;
  updatedAt?: string;
  updatedBy?: string | null;
}

const PRESET_KEY = "ALL_SHIPPING_PRESETS";

// In-memory fallback / cache
let memoryPresets: UnifiedShippingPresets | null = null;
let isTableVerified = false;

/**
 * Ensures the PostgreSQL ShippingRatePreset table exists.
 */
export async function ensureShippingPresetsTable(client: any = db): Promise<void> {
  if (isTableVerified) return;
  try {
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShippingRatePreset" (
        "key" TEXT NOT NULL,
        "data" JSONB NOT NULL,
        "updatedBy" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ShippingRatePreset_pkey" PRIMARY KEY ("key")
      );
    `);
    isTableVerified = true;
  } catch (err: any) {
    console.warn("[ShippingPresets] ensureTable notice:", err?.message || err);
  }
}

/**
 * Retrieves default presets based on OM Logistics specification (revised 1 Aug 2026).
 */
export function getDefaultShippingPresets(): UnifiedShippingPresets {
  return {
    omRateCard: JSON.parse(JSON.stringify(DEFAULT_OM_RATE_CARD)),
    omConfig: JSON.parse(JSON.stringify(DEFAULT_OM_CONFIG)),
    carrierPresets: JSON.parse(JSON.stringify(DEFAULT_CARRIER_PRESETS)),
    stateZoneMap: JSON.parse(JSON.stringify(DEFAULT_STATE_ZONE_MAP)),
    odaMatrix: JSON.parse(JSON.stringify(DEFAULT_ODA_MATRIX)),
    omWhatsAppConfig: JSON.parse(JSON.stringify(DEFAULT_OM_WHATSAPP_CONFIG)),
    updatedAt: new Date().toISOString(),
    updatedBy: "SYSTEM_DEFAULTS",
  };
}

/**
 * Loads the active shipping presets.
 * Returns merged result from PostgreSQL or memory fallback.
 */
export async function getActiveShippingPresets(client: any = db): Promise<UnifiedShippingPresets> {
  const defaults = getDefaultShippingPresets();

  try {
    await ensureShippingPresetsTable(client);

    const rows = await client.$queryRawUnsafe(`
      SELECT "data", "updatedBy", "updatedAt"
      FROM "ShippingRatePreset"
      WHERE "key" = '${PRESET_KEY}'
      LIMIT 1;
    `);

    if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
      const stored = rows[0].data as Partial<UnifiedShippingPresets>;
      const merged: UnifiedShippingPresets = {
        omRateCard: Array.isArray(stored.omRateCard) && stored.omRateCard.length > 0 ? stored.omRateCard : defaults.omRateCard,
        omConfig: stored.omConfig ? { ...defaults.omConfig, ...stored.omConfig } : defaults.omConfig,
        carrierPresets: Array.isArray(stored.carrierPresets) && stored.carrierPresets.length > 0 ? stored.carrierPresets : defaults.carrierPresets,
        stateZoneMap: stored.stateZoneMap && Object.keys(stored.stateZoneMap).length > 0 ? stored.stateZoneMap : defaults.stateZoneMap,
        odaMatrix: Array.isArray(stored.odaMatrix) && stored.odaMatrix.length > 0 ? stored.odaMatrix : defaults.odaMatrix,
        omWhatsAppConfig: stored.omWhatsAppConfig
          ? { ...defaults.omWhatsAppConfig!, ...stored.omWhatsAppConfig }
          : defaults.omWhatsAppConfig,
        updatedAt: rows[0].updatedAt ? new Date(rows[0].updatedAt).toISOString() : defaults.updatedAt,
        updatedBy: rows[0].updatedBy || "ADMIN",
      };
      memoryPresets = merged;
      return merged;
    }
  } catch (err: any) {
    console.warn("[ShippingPresets] DB query fallback:", err?.message || err);
  }

  if (memoryPresets) {
    return memoryPresets;
  }

  return defaults;
}

/**
 * Saves updated shipping presets into the database and memory.
 */
export async function saveShippingPresets(
  presets: Partial<UnifiedShippingPresets>,
  updatedBy: string = "ADMIN",
  client: any = db
): Promise<UnifiedShippingPresets> {
  const current = await getActiveShippingPresets(client);

  const updated: UnifiedShippingPresets = {
    omRateCard: presets.omRateCard || current.omRateCard,
    omConfig: presets.omConfig ? { ...current.omConfig, ...presets.omConfig } : current.omConfig,
    carrierPresets: presets.carrierPresets || current.carrierPresets,
    stateZoneMap: presets.stateZoneMap || current.stateZoneMap,
    odaMatrix: presets.odaMatrix || current.odaMatrix,
    omWhatsAppConfig: presets.omWhatsAppConfig
      ? { ...(current.omWhatsAppConfig || DEFAULT_OM_WHATSAPP_CONFIG), ...presets.omWhatsAppConfig }
      : current.omWhatsAppConfig || DEFAULT_OM_WHATSAPP_CONFIG,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  memoryPresets = updated;

  try {
    await ensureShippingPresetsTable(client);

    const jsonString = JSON.stringify(updated).replace(/'/g, "''");
    await client.$executeRawUnsafe(`
      INSERT INTO "ShippingRatePreset" ("key", "data", "updatedBy", "updatedAt")
      VALUES ('${PRESET_KEY}', '${jsonString}'::jsonb, '${updatedBy.replace(/'/g, "''")}', NOW())
      ON CONFLICT ("key") DO UPDATE
      SET "data" = EXCLUDED."data",
          "updatedBy" = EXCLUDED."updatedBy",
          "updatedAt" = NOW();
    `);
  } catch (err: any) {
    console.error("[ShippingPresets] Failed to save in DB, kept in memory:", err);
  }

  return updated;
}

/**
 * Resets shipping presets back to OM Logistics defaults (1 Aug 2026).
 */
export async function resetShippingPresets(
  updatedBy: string = "ADMIN",
  client: any = db
): Promise<UnifiedShippingPresets> {
  const defaults = getDefaultShippingPresets();
  memoryPresets = defaults;

  try {
    await ensureShippingPresetsTable(client);
    await client.$executeRawUnsafe(`
      DELETE FROM "ShippingRatePreset" WHERE "key" = '${PRESET_KEY}';
    `);
  } catch (err: any) {
    console.warn("[ShippingPresets] Reset delete warning:", err?.message || err);
  }

  return defaults;
}
