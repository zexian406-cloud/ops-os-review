import type { Shop } from "./types";

/**
 * 店铺数据量口径（Bug3 回归防护）：该店铺下的 MSKU 数量。
 * - mskuStores 按行记录店铺（导入口径）→ 逐个 MSKU 计数
 * - 无 mskuStores 时回退整条记录的 store 字段，MSKU 列表按逗号拆分计数
 * 修复前按 shopId 查 skuMaster.store（存的是店名）恒为 0。
 */
export function countShopMskus(
  rows: ReadonlyArray<{ store?: string | null; msku?: string; mskuStores?: Record<string, string> }>,
  shopName: string,
): number {
  if (!shopName) return 0;
  let count = 0;
  for (const s of rows) {
    if (s.mskuStores && Object.keys(s.mskuStores).length > 0) {
      for (const storeName of Object.values(s.mskuStores)) {
        if (storeName === shopName) count++;
      }
    } else if (s.store === shopName) {
      count += s.msku ? s.msku.split(",").filter((m) => m.trim()).length : 0;
    }
  }
  return count;
}

/**
 * 按当前店铺过滤 SKU 主档。
 *
 * skuMaster.store 的写入有两个口径：
 * - SKU 编辑器写入店铺 id（shop.id）
 * - Excel 导入 / 演示数据存店铺名（shop.name）
 * 因此同时匹配「当前店铺 id」与「店铺名」，只按 id 匹配会让导入/演示数据在
 * 选择店铺后被整体滤空（2026-10 修复的回归缺陷）。
 */
export function filterSkuMasterByShop<T extends { store?: string | null }>(
  rows: T[],
  currentShopId: string,
  shops: ReadonlyArray<Pick<Shop, "id" | "name">>,
): T[] {
  if (currentShopId === "all") return rows;
  const shop = shops.find((s) => s.id === currentShopId);
  const tokens = new Set<string>([currentShopId]);
  if (shop?.name) tokens.add(shop.name);
  return rows.filter((s) => s.store != null && tokens.has(s.store));
}
