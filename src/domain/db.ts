import Dexie, { type Table } from "dexie";
import type {
  SkuMaster,
  DailySnapshot,
  InventoryLayer,
  Campaign,
  Promotion,
  ManualPromotion,
  Alert,
  GlobalConfig,
  CloudConfig,
  WarehouseProvider,
  WarehouseMapping,
  EstimateInput,
  TodoItem,
  CalculationRecord,
  Shop,
  OpsLog,
  CompetitorRecord,
} from "./types";

/**
 * Amazon Operation OS — Local storage layer (IndexedDB via Dexie).
 * Every module reads from these tables. There is no duplicated data anywhere.
 */
export class AmzOpsDB extends Dexie {
  skuMaster!: Table<SkuMaster, string>;
  dailySnapshot!: Table<DailySnapshot, number>;
  inventoryLayer!: Table<InventoryLayer, number>;
  campaigns!: Table<Campaign, string>;
  promotions!: Table<Promotion, string>;
  manualPromotions!: Table<ManualPromotion, string>;
  alerts!: Table<Alert, string>;
  config!: Table<{ key: string; value: unknown }, string>;
  warehouseProviders!: Table<WarehouseProvider, string>;
  warehouseMappings!: Table<WarehouseMapping, number>;
  calculationRecords!: Table<CalculationRecord, string>;
  todos!: Table<TodoItem, string>;
  shops!: Table<Shop, string>;
  opsLogs!: Table<OpsLog, string>;
  competitors!: Table<CompetitorRecord, string>;

  constructor() {
    super("amazon-ops-os");
    this.version(3).stores({
      skuMaster: "sku, store, fulfillment, saleStatus, owner, category, lifecycle",
      dailySnapshot: "++id, [sku+date], date, sku",
      inventoryLayer: "++id, [sku+date], date, sku",
      campaigns: "id, startDate, endDate, active",
      promotions: "id, sku, store, type, status, startDate, endDate",
      alerts: "id, sku, type, severity, status, date",
      config: "key",
      warehouseProviders: "id",
      estimates: "id",
      calculationRecords: "id, sku, createdAt",
    });
    this.version(4).stores({
      skuMaster: "sku, store, fulfillment, saleStatus, owner, category, lifecycle",
      dailySnapshot: "++id, [sku+date], date, sku",
      inventoryLayer: "++id, [sku+date], date, sku",
      campaigns: "id, startDate, endDate, active",
      promotions: "id, sku, store, type, status, startDate, endDate",
      alerts: "id, sku, type, severity, status, date",
      config: "key",
      warehouseProviders: "id",
      estimates: "id",
      todos: "id, completed, dueDate",
    });
    this.version(5).stores({
      skuMaster: "sku, store, fulfillment, saleStatus, owner, category, lifecycle",
      dailySnapshot: "++id, [sku+date], date, sku",
      inventoryLayer: "++id, [sku+date], date, sku",
      campaigns: "id, startDate, endDate, active",
      promotions: "id, sku, store, type, status, startDate, endDate",
      manualPromotions: "id, sku, type, startDate, endDate",
      alerts: "id, sku, type, severity, status, date",
      config: "key",
      warehouseProviders: "id",
      estimates: "id",
      todos: "id, completed, dueDate",
    });
    this.version(6).stores({
      skuMaster: "sku, store, fulfillment, saleStatus, owner, category, lifecycle",
      dailySnapshot: "++id, [sku+date], date, sku",
      inventoryLayer: "++id, [sku+date], date, sku",
      campaigns: "id, startDate, endDate, active",
      promotions: "id, sku, store, type, status, startDate, endDate",
      manualPromotions: "id, sku, type, startDate, endDate",
      alerts: "id, sku, type, severity, status, date",
      config: "key",
      warehouseProviders: "id",
      estimates: "id",
      todos: "id, completed, dueDate",
      shops: "id, name, createdAt",
    });
    this.version(7).stores({
      skuMaster: "sku, store, fulfillment, saleStatus, owner, category, lifecycle",
      dailySnapshot: "++id, [sku+date], date, sku",
      inventoryLayer: "++id, [sku+date], date, sku",
      campaigns: "id, startDate, endDate, active",
      promotions: "id, sku, store, type, status, startDate, endDate",
      manualPromotions: "id, sku, type, startDate, endDate",
      alerts: "id, sku, type, severity, status, date",
      config: "key",
      warehouseProviders: "id",
      estimates: "id",
      todos: "id, completed, dueDate",
      shops: "id, name, createdAt",
      opsLogs: "id, sku, date, action",
    });
    this.version(8).stores({
      warehouseMappings: "++id, warehouseName, region",
    });
    this.version(9).stores({
      competitors: "id, sku, date, competitorName",
    });
  }
}

export const db = new AmzOpsDB();

// ==================== Config helpers ====================
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  defaultLeadTime: 40,
  defaultSafetyStockDays: 30,
  defaultTargetCoverDays: 60,
  profitMarginThreshold: 5,
  adRatioThreshold: 30,
  ratingDropThreshold: 0.2,
  returnRateThreshold: 5,
  lifecycleNewDays: 90,
  lifecycleGrowthDays: 180,
};

export async function getGlobalConfig(): Promise<GlobalConfig> {
  const row = await db.config.get("global");
  return (row?.value as GlobalConfig) ?? DEFAULT_GLOBAL_CONFIG;
}

export async function setGlobalConfig(cfg: GlobalConfig): Promise<void> {
  await db.config.put({ key: "global", value: cfg });
}

export async function getCloudConfig(): Promise<CloudConfig | null> {
  const row = await db.config.get("cloud");
  return (row?.value as CloudConfig) ?? null;
}

export async function setCloudConfig(cfg: CloudConfig): Promise<void> {
  await db.config.put({ key: "cloud", value: cfg });
}

// ==================== Shop management ====================
const DEFAULT_SHOPS = [
  { id: "shop_1", name: "一店", createdAt: new Date().toISOString() },
  { id: "shop_2", name: "二店", createdAt: new Date().toISOString() },
  { id: "shop_3", name: "三店", createdAt: new Date().toISOString() },
];

export async function ensureDefaultShops(): Promise<void> {
  const count = await db.shops.count();
  if (count > 0) return;

  // Collect existing unique store values from data
  const existingStores = new Set<string>();
  const skus = await db.skuMaster.toArray();
  for (const sku of skus) {
    if (sku.store) existingStores.add(sku.store);
  }
  const promos = await db.promotions.toArray();
  for (const promo of promos) {
    if (promo.store) existingStores.add(promo.store);
  }

  // Check if any existing stores are already shop IDs (shop_xxx format)
  const hasShopIds = [...existingStores].some((s) => s.startsWith("shop_"));

  if (hasShopIds) {
    // Some stores are already shop IDs, just create default shops
    await db.shops.bulkPut(DEFAULT_SHOPS);
  } else {
    // Create shops from existing store values (backward compatibility)
    const shopList: Shop[] = [];
    const storeToId = new Map<string, string>();
    let idx = 1;
    for (const store of existingStores) {
      const id = `shop_${idx}`;
      shopList.push({ id, name: store, createdAt: new Date().toISOString() });
      storeToId.set(store, id);
      idx++;
    }

    // If no existing stores, create default shops
    if (shopList.length === 0) {
      await db.shops.bulkPut(DEFAULT_SHOPS);
      return;
    }

    await db.shops.bulkPut(shopList);

    // Migrate skuMaster.store references
    for (const sku of skus) {
      const newId = storeToId.get(sku.store);
      if (newId) {
        await db.skuMaster.put({ ...sku, store: newId });
      }
    }

    // Migrate promotions.store references
    for (const promo of promos) {
      const newId = storeToId.get(promo.store);
      if (newId) {
        await db.promotions.put({ ...promo, store: newId });
      }
    }
  }
}

export async function getAllShops(): Promise<Shop[]> {
  return db.shops.toArray();
}

export async function addShop(name: string): Promise<Shop> {
  const shop: Shop = {
    id: `shop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  await db.shops.put(shop);
  return shop;
}

export async function renameShop(id: string, newName: string): Promise<void> {
  const shop = await db.shops.get(id);
  if (!shop) throw new Error("店铺不存在");
  await db.shops.put({ ...shop, name: newName.trim() });
}

export async function deleteShop(id: string): Promise<void> {
  await db.shops.delete(id);
  // Also clear store references in skuMaster and promotions
  const skus = await db.skuMaster.where("store").equals(id).toArray();
  for (const sku of skus) {
    await db.skuMaster.put({ ...sku, store: "" });
  }
  const promos = await db.promotions.where("store").equals(id).toArray();
  for (const promo of promos) {
    await db.promotions.put({ ...promo, store: "" });
  }
}

export async function getShopName(id: string): Promise<string> {
  const shop = await db.shops.get(id);
  return shop?.name ?? id;
}

export async function getShopDataCount(shopId: string): Promise<number> {
  const skuCount = await db.skuMaster.where("store").equals(shopId).count();
  const promoCount = await db.promotions.where("store").equals(shopId).count();
  return skuCount + promoCount;
}

// ==================== Bulk operations ====================
export async function upsertSkuMaster(rows: SkuMaster[]): Promise<void> {
  if (rows.length === 0) return;
  await db.skuMaster.bulkPut(rows);
}

export async function upsertSnapshots(rows: DailySnapshot[]): Promise<void> {
  if (rows.length === 0) return;
  // Normalize: adRatio must always be positive
  const normalized = rows.map((r) => ({ ...r, adRatio: Math.abs(r.adRatio) }));
  const keys = new Set(normalized.map((r) => `${r.sku}__${r.date}`));
  const existing = await db.dailySnapshot
    .where("date")
    .equals(normalized[0].date)
    .toArray();
  const toDelete = existing.filter((e) => keys.has(`${e.sku}__${e.date}`));

  // Merge: for existing entries with same SKU+date, keep non-zero values from both sides
  const merged: DailySnapshot[] = [];
  const existingMap = new Map(toDelete.map((e) => [`${e.sku}__${e.date}`, e]));
  for (const row of normalized) {
    const key = `${row.sku}__${row.date}`;
    const old = existingMap.get(key);
    if (old) {
      merged.push({
        ...old,
        // New data fills gaps: only overwrite if old is 0/empty and new has value
        dailySales7d: row.dailySales7d || old.dailySales7d,
        monthlySales: row.monthlySales || old.monthlySales,
        adRatio: row.adRatio || old.adRatio,
        rating: row.rating || old.rating,
        reviewCount: row.reviewCount ?? old.reviewCount,
        returnRate: row.returnRate || old.returnRate,
        refundRate: row.refundRate ?? old.refundRate,
        adSpend: row.adSpend || old.adSpend,
        stockOnHand: row.stockOnHand || old.stockOnHand,
        stockInTransit: row.stockInTransit || old.stockInTransit,
        profit: row.profit || old.profit,
        profitMargin: row.profitMargin || old.profitMargin,
        totalCost: row.totalCost || old.totalCost,
      });
    } else {
      merged.push(row);
    }
  }
  if (toDelete.length > 0) {
    await db.dailySnapshot.bulkDelete(
      toDelete.map((e) => e.id as number).filter((id) => id != null)
    );
  }
  await db.dailySnapshot.bulkAdd(merged);
}

export async function upsertInventoryLayers(rows: InventoryLayer[]): Promise<void> {
  if (rows.length === 0) return;
  const keys = new Set(rows.map((r) => `${r.sku}__${r.date}`));
  const existing = await db.inventoryLayer
    .where("date")
    .equals(rows[0].date)
    .toArray();
  const toDelete = existing.filter((e) => keys.has(`${e.sku}__${e.date}`));
  if (toDelete.length > 0) {
    await db.inventoryLayer.bulkDelete(
      toDelete.map((e) => e.id as number).filter((id) => id != null)
    );
  }
  await db.inventoryLayer.bulkAdd(rows);
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    "rw",
    db.skuMaster,
    db.dailySnapshot,
    db.inventoryLayer,
    db.campaigns,
    db.promotions,
    db.manualPromotions,
    db.alerts,
    db.config,
    db.warehouseProviders,
    db.estimates,
      db.todos,
      db.calculationRecords,
      db.shops,
      db.opsLogs,
      db.competitors,
      async () => {
        await db.skuMaster.clear();
        await db.dailySnapshot.clear();
        await db.inventoryLayer.clear();
        await db.campaigns.clear();
        await db.promotions.clear();
        await db.manualPromotions.clear();
        await db.alerts.clear();
        await db.config.clear();
        await db.warehouseProviders.clear();
        await db.estimates.clear();
        await db.todos.clear();
        await db.calculationRecords.clear();
        await db.shops.clear();
        await db.opsLogs.clear();
        await db.warehouseMappings.clear();
        await db.competitors.clear();
      }
    );
  }

/** Export the whole database as one JSON blob for cloud sync. */
export async function exportSnapshot(): Promise<{
  skuMaster: SkuMaster[];
  dailySnapshot: DailySnapshot[];
  inventoryLayer: InventoryLayer[];
  campaigns: Campaign[];
  promotions: Promotion[];
  manualPromotions: ManualPromotion[];
  alerts: Alert[];
  config: { key: string; value: unknown }[];
  shops: Shop[];
  opsLogs: OpsLog[];
  competitors: CompetitorRecord[];
  exportedAt: string;
}> {
  const [skuMaster, dailySnapshot, inventoryLayer, campaigns, promotions, manualPromotions, alerts, config, shops, opsLogs, warehouseMappings, competitors] =
    await Promise.all([
      db.skuMaster.toArray(),
      db.dailySnapshot.toArray(),
      db.inventoryLayer.toArray(),
      db.campaigns.toArray(),
      db.promotions.toArray(),
      db.manualPromotions.toArray(),
      db.alerts.toArray(),
      db.config.toArray(),
      db.shops.toArray(),
      db.opsLogs.toArray(),
      db.warehouseMappings.toArray(),
      db.competitors.toArray(),
    ]);
  return {
    skuMaster,
    dailySnapshot,
    inventoryLayer,
    campaigns,
    promotions,
    manualPromotions,
    alerts,
    config,
    shops,
    opsLogs,
    warehouseMappings,
    competitors,
    exportedAt: new Date().toISOString(),
  };
}

/** Import a JSON blob back into the local DB. */
export async function importSnapshot(payload: {
  skuMaster?: SkuMaster[];
  dailySnapshot?: DailySnapshot[];
  inventoryLayer?: InventoryLayer[];
  campaigns?: Campaign[];
  promotions?: Promotion[];
  manualPromotions?: ManualPromotion[];
  alerts?: Alert[];
  config?: { key: string; value: unknown }[];
  shops?: Shop[];
  opsLogs?: OpsLog[];
  competitors?: CompetitorRecord[];
  warehouseMappings?: WarehouseMapping[];
}): Promise<void> {
  await db.transaction(
    "rw",
    db.skuMaster,
    db.dailySnapshot,
    db.inventoryLayer,
    db.campaigns,
    db.promotions,
    db.manualPromotions,
    db.alerts,
    db.config,
    db.warehouseProviders,
    db.estimates,
    db.todos,
    db.calculationRecords,
    db.shops,
    db.opsLogs,
    db.competitors,
    db.warehouseMappings,
    async () => {
      if (payload.skuMaster) {
        await db.skuMaster.clear();
        await db.skuMaster.bulkPut(payload.skuMaster);
      }
      if (payload.dailySnapshot) {
        await db.dailySnapshot.clear();
        const rows = payload.dailySnapshot.map(({ id: _id, ...rest }) => rest);
        await db.dailySnapshot.bulkAdd(rows);
      }
      if (payload.inventoryLayer) {
        await db.inventoryLayer.clear();
        const rows = payload.inventoryLayer.map(({ id: _id, ...rest }) => rest);
        await db.inventoryLayer.bulkAdd(rows);
      }
      if (payload.campaigns) {
        await db.campaigns.clear();
        await db.campaigns.bulkPut(payload.campaigns);
      }
      if (payload.promotions) {
        await db.promotions.clear();
        await db.promotions.bulkPut(payload.promotions);
      }
      if (payload.manualPromotions) {
        await db.manualPromotions.clear();
        await db.manualPromotions.bulkPut(payload.manualPromotions);
      }
      if (payload.alerts) {
        await db.alerts.clear();
        await db.alerts.bulkPut(payload.alerts);
      }
      if (payload.config) {
        await db.config.clear();
        await db.config.bulkPut(payload.config);
      }
      if (payload.shops) {
        await db.shops.clear();
        await db.shops.bulkPut(payload.shops);
      }
      if (payload.opsLogs) {
        await db.opsLogs.clear();
        await db.opsLogs.bulkPut(payload.opsLogs);
      }
      if (payload.competitors) {
        await db.competitors.clear();
        await db.competitors.bulkPut(payload.competitors);
      }
      if (payload.warehouseMappings) {
        await db.warehouseMappings.clear();
        await db.warehouseMappings.bulkPut(payload.warehouseMappings);
      }
    }
  );
}
// ==================== OpsLog CRUD ====================
export async function getOpsLogs(sku: string): Promise<OpsLog[]> {
  const data = await db.opsLogs.where("sku").equals(sku).toArray();
  return data.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function addOpsLog(
  sku: string,
  date: string,
  action: string,
  detail: string,
  impact?: string,
  msku?: string,
  skuName?: string,
  anomalyType?: string,
  reason?: string,
  note?: string,
): Promise<string> {
  const id = `opslog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.opsLogs.put({
    id,
    sku,
    msku,
    skuName,
    date,
    action,
    detail,
    impact,
    anomalyType,
    reason,
    note,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function deleteOpsLog(id: string): Promise<void> {
  await db.opsLogs.delete(id);
}

// ==================== Competitor records (竞品记录) ====================
export async function getCompetitors(): Promise<CompetitorRecord[]> {
  const all = await db.competitors.toArray();
  return all.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function addCompetitor(rec: Omit<CompetitorRecord, "id" | "createdAt"> & Partial<Pick<CompetitorRecord, "id" | "createdAt">>): Promise<string> {
  const id = rec.id ?? `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.competitors.put({
    ...rec,
    id,
    createdAt: rec.createdAt ?? new Date().toISOString(),
  });
  return id;
}

export async function updateCompetitor(id: string, patch: Partial<CompetitorRecord>): Promise<void> {
  await db.competitors.update(id, patch);
}

export async function deleteCompetitor(id: string): Promise<void> {
  await db.competitors.delete(id);
}

// ==================== Warehouse Mapping helpers ======================

/** 智能猜测仓库名对应的区域 */
export function guessRegion(warehouseName: string): import("./types").WarehouseRegion | null {
  const name = warehouseName.toLowerCase();
  // 美东关键词
  if (/美东|east|nj|newjersey|新泽西|njf|njjw/.test(name)) return "east";
  // 美西关键词
  if (/美西|west|ca[^a-z]|cali|洛杉矶|cajw|cap /.test(name)) return "west";
  // 东南关键词
  if (/东南|southeast|sav|savannah|萨凡纳/.test(name)) return "southeast";
  // 中南关键词
  if (/中南|southcentral|hou|texas|tx|休斯顿|txjw/.test(name)) return "southcentral";
  return null;
}

/** 获取所有仓库映射 */
export async function getAllWarehouseMappings(): Promise<import("./types").WarehouseMapping[]> {
  return db.warehouseMappings.toArray();
}

/** 根据仓库名获取映射的区域 */
export async function getWarehouseRegion(warehouseName: string): Promise<import("./types").WarehouseRegion | null> {
  const mapping = await db.warehouseMappings.where("warehouseName").equals(warehouseName).first();
  return mapping?.region ?? null;
}

/** 批量获取仓库名→区域映射 */
export async function getWarehouseRegionMap(): Promise<Map<string, import("./types").WarehouseRegion>> {
  const all = await db.warehouseMappings.toArray();
  return new Map(all.map(m => [m.warehouseName, m.region]));
}

/** 保存或更新单条仓库映射，并自动重算已有库存数据的区域字段 */
export async function upsertWarehouseMapping(warehouseName: string, region: import("./types").WarehouseRegion): Promise<void> {
  const existing = await db.warehouseMappings.where("warehouseName").equals(warehouseName).first();
  if (existing) {
    await db.warehouseMappings.update(existing.id!, { region });
  } else {
    await db.warehouseMappings.add({
      warehouseName,
      region,
      createdAt: new Date().toISOString(),
    });
  }
  await reapplyWarehouseMappings();
}

/** 删除仓库映射，并自动重算已有库存数据的区域字段 */
export async function deleteWarehouseMapping(id: number): Promise<void> {
  await db.warehouseMappings.delete(id);
  await reapplyWarehouseMappings();
}

/**
 * 重新应用仓库映射：遍历所有 inventoryLayer 记录，
 * 根据 warehouseBreakdown 中的仓库名 + 当前映射重算四仓区域字段。
 * 在映射变更后自动调用，无需重新导入数据。
 */
export async function reapplyWarehouseMappings(): Promise<number> {
  const regionMap = await getWarehouseRegionMap();
  const allInv = await db.inventoryLayer.toArray();
  let updated = 0;
  for (const inv of allInv) {
    if (!inv.warehouseBreakdown?.length) continue;
    let eastStock = 0, westStock = 0, southeastStock = 0, southcentralStock = 0;
    for (const wb of inv.warehouseBreakdown) {
      const region = regionMap.get(wb.warehouse);
      if (!region) continue;
      switch (region) {
        case "east": eastStock += wb.qty; break;
        case "west": westStock += wb.qty; break;
        case "southeast": southeastStock += wb.qty; break;
        case "southcentral": southcentralStock += wb.qty; break;
      }
    }
    await db.inventoryLayer.update(inv.id!, {
      eastStock, westStock, southeastStock, southcentralStock,
    });
    updated++;
  }
  return updated;
}
