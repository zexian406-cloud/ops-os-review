import { db, ensureDefaultShops } from "./db";
import { mockSkuMaster } from "@/mocks/skuMaster";
import { mockLatestSnapshot, buildMockHistory } from "@/mocks/dailySnapshot";
import { mockInventoryLatest } from "@/mocks/inventory";
import { mockCampaigns } from "@/mocks/campaigns";
import { mockPromotions } from "@/mocks/promotions";
import type { DailySnapshot, InventoryLayer } from "./types";

const SEED_FLAG = "seeded_v9";

export async function ensureSeedData(): Promise<void> {
  const flag = await db.config.get(SEED_FLAG);
  if (flag?.value === true) return;

  await ensureDefaultShops();

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

  await db.config.put({ key: SEED_FLAG, value: true });
}