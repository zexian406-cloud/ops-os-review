import type { Shop } from "./types";

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
