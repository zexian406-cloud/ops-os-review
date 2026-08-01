import { db } from "./db";
import type { SkuMaster } from "./types";

/**
 * 增量成本更新回写。
 *
 * 当用户只导入单表「产品成本更新」/「头程更新」时，parseOperationExcel 的
 * skuMaster 为空，FOB/头程映射在 excel.ts 的合并循环里无处挂载会被静默丢弃。
 * 这里按 SKU 从现有 skuMaster 取出记录，把 costFob / costShipping / costDelivery
 * 合并进已有记录再 bulkPut，保证单表成本更新能正确覆盖现有 SKU，且不丢其它字段。
 */
export async function applyIncrementalCostUpdate(
  costFobMap: Map<string, number>,
  shippingMap: Map<string, { shipping: number; delivery: number }>,
): Promise<number> {
  const skus = new Set<string>([...costFobMap.keys(), ...shippingMap.keys()]);
  if (skus.size === 0) return 0;

  const updates: SkuMaster[] = [];
  for (const sku of skus) {
    const existing = await db.skuMaster.get(sku);
    if (!existing) continue; // 现有库中没有该 SKU，跳过（不新建）

    const merged: SkuMaster = { ...existing };
    const fob = costFobMap.get(sku);
    if (fob != null) merged.costFob = fob;
    const ship = shippingMap.get(sku);
    if (ship) {
      if (ship.shipping > 0) merged.costShipping = ship.shipping;
      if (ship.delivery > 0) merged.costDelivery = ship.delivery;
    }
    updates.push(merged);
  }

  if (updates.length > 0) await db.skuMaster.bulkPut(updates);
  return updates.length;
}
