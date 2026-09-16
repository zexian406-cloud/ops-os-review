import { db, ensureDefaultShops, ensureDefaultSites } from "./db";
import { mockSkuMaster } from "@/mocks/skuMaster";
import { mockLatestSnapshot, buildMockHistory } from "@/mocks/dailySnapshot";
import { mockInventoryLatest } from "@/mocks/inventory";
import { mockCampaigns } from "@/mocks/campaigns";
import { mockPromotions } from "@/mocks/promotions";
import { MOCK_MANUAL_PROMOTIONS } from "@/mocks/manualPromotions";
import type { DailySnapshot, InventoryLayer, Site } from "./types";

const SEED_FLAG = "seeded_v9";

export const DEMO_SITE_ID = "site_demo";

// 演示数据独立站点：绝不与真实站点（site_us 等）混用
export const DEMO_SITE: Site = {
  id: DEMO_SITE_ID,
  name: "演示站点",
  marketplace: "US",
  currency: "USD",
  currencySymbol: "$",
  exchangeRateToUsd: 1.0,
  cnyToUsdRate: 7.25,
  commissionRate: 15,
  fbaDeliveryFee: 3.5,
  vatRate: 0,
  isActive: true,
  sortOrder: 99,
  createdAt: new Date().toISOString(),
};

/**
 * 首次使用（空库）时种入通用演示数据，展示在独立的「演示站点」。
 * 一旦检测到已有任何真实数据，则完全跳过，绝不写入演示数据。
 */
export async function ensureSeedData(): Promise<void> {
  const flag = await db.config.get(SEED_FLAG);
  if (flag?.value === true) return;

  // 只在空库时种入演示数据；有真实数据则标记跳过
  const hasData = (await db.skuMaster.count()) > 0;
  if (hasData) {
    await db.config.put({ key: SEED_FLAG, value: true });
    return;
  }

  await ensureDefaultSites();
  await ensureDefaultShops();

  // 创建演示站点（若站点曾被删除则重建）
  if (!(await db.sites.get(DEMO_SITE_ID))) {
    await db.sites.put(DEMO_SITE);
  }

  const today = new Date().toISOString().slice(0, 10);

  await db.skuMaster.bulkPut(mockSkuMaster);

  const history = buildMockHistory(today).map((s) => ({
    ...s,
    adRatio: Math.abs(s.adRatio), // Normalize: adRatio must always be positive
  }));
  await db.dailySnapshot.bulkAdd(history);

  const todayRows: Omit<DailySnapshot, "id">[] = mockLatestSnapshot.map((s) => ({
    ...s,
    date: today,
    adRatio: Math.abs(s.adRatio), // Normalize: adRatio must always be positive
  }));
  await db.dailySnapshot
    .where("date")
    .equals(today)
    .delete();
  await db.dailySnapshot.bulkAdd(todayRows);

  const invRows: Omit<InventoryLayer, "id">[] = mockInventoryLatest.map((r) => ({
    ...r,
    date: today,
  }));
  await db.inventoryLayer.bulkAdd(invRows);

  await db.campaigns.bulkPut(mockCampaigns);
  await db.promotions.bulkPut(mockPromotions);
  await db.manualPromotions.bulkPut(MOCK_MANUAL_PROMOTIONS);

  // 新用户默认落在演示站点，以便首次看到演示数据
  await db.config.put({ key: "currentSiteId", value: DEMO_SITE_ID });

  await db.config.put({ key: SEED_FLAG, value: true });
}