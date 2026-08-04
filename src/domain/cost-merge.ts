import { db } from "./db";
import type { SkuMaster } from "./types";

/**
 * Incremental cost update: when only a "head-cost update" sheet is imported
 * (no full SKU master data), update existing SkuMaster records' costShipping
 * and costDelivery fields based on the shipping map.
 *
 * @param shippingMap - Map<SKU, { shipping: number; delivery: number }>
 */
export async function applyIncrementalCostUpdate(
  shippingMap: Map<string, { shipping: number; delivery: number }>,
): Promise<void> {
  if (shippingMap.size === 0) return;

  const updates: SkuMaster[] = [];

  for (const [sku, { shipping, delivery }] of shippingMap) {
    const existing = await db.skuMaster.where("sku").equals(sku).first();
    if (!existing) continue;

    const updated: SkuMaster = {
      ...existing,
      costShipping: shipping > 0 ? shipping : existing.costShipping,
      costDelivery: delivery > 0 ? delivery : existing.costDelivery,
    };
    updates.push(updated);
  }

  if (updates.length > 0) {
    await db.skuMaster.bulkPut(updates);
  }
}