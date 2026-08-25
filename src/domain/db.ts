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
} from "./types";
import type { Site, SiteConfig, CrossSiteSummary, CrossSiteReport } from "./types";

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
  sites!: Table<Site, string>;

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
      skuMaster: "sku, store, siteId, fulfillment, saleStatus, owner, category, lifecycle",
      dailySnapshot: "++id, [sku+date], date, sku, siteId",
      inventoryLayer: "++id, [sku+date], date, sku, siteId",
      campaigns: "id, siteId, startDate, endDate, active",
      promotions: "id, sku, store, siteId, type, status, startDate, endDate",
      manualPromotions: "id, sku, siteId, type, startDate, endDate",
      alerts: "id, sku, siteId, type, severity, status, date",
      config: "key",
      warehouseProviders: "id",
      warehouseMappings: "++id, warehouseName, region",
      calculationRecords: "id, sku, siteId, createdAt",
      todos: "id, siteId, completed, dueDate",
      shops: "id, name, siteId, createdAt",
      opsLogs: "id, sku, siteId, date, action",
      sites: "id, name, marketplace, currency, isActive, sortOrder",
    });
    // Step 1: Backup skuMaster data and delete original table
    // (Dexie doesn't support changing primary key directly, so we use backup+restore)
    this.version(10).stores({
      skuMasterBackup: "sku, store, siteId",
      // Omitting skuMaster deletes it
    }).upgrade(async (tx) => {
      // Copy all data from old skuMaster to backup before it's deleted
      const all = await tx.table("skuMaster").toArray();
      await tx.table("skuMasterBackup").bulkPut(all);
    });

    // Step 2: Create new skuMaster with [sku+siteId] compound key + restore from backup
    this.version(11).stores({
      skuMaster: "[sku+siteId], store, siteId, fulfillment, saleStatus, owner, category, lifecycle",
    }).upgrade(async (tx) => {
      const all = await tx.table("skuMasterBackup").toArray();
      const fixed = all.map((item: any) => ({
        ...item,
        siteId: item.siteId || "site_us",
      }));
      await tx.table("skuMaster").bulkPut(fixed);
    });

    // Step 3: Delete backup table
    this.version(12).stores({
      // Omitting skuMasterBackup deletes it
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

// ==================== 数据健康报告（最近一次导入） ====================
export async function getLatestHealthReport<T = unknown>(): Promise<T | null> {
  const row = await db.config.get("latestHealthReport");
  return (row?.value as T) ?? null;
}

export async function setLatestHealthReport(report: unknown): Promise<void> {
  await db.config.put({
    key: "latestHealthReport",
    value: { ...(report as Record<string, unknown>), savedAt: new Date().toISOString() },
  });
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

/**
 * 部分更新模式：仅覆盖新数据中有值的字段，空值/0 不覆盖已有数据。
 * 适用于「只改部分参数」场景——Excel 中空单元格不会清空已有 FOB/售价等固定信息。
 *
 * 合并策略：
 * - 数值字段：新值 > 0 才覆盖，否则保留旧值
 * - 字符串字段：新值非空才覆盖，否则保留旧值
 * - 数组字段（competitorUrls/mskuStores 等）：新值有元素才覆盖
 * - 新 SKU（数据库中不存在）：直接写入，不合并
 */
export async function upsertSkuMasterPartial(rows: SkuMaster[]): Promise<void> {
  if (rows.length === 0) return;

  // 批量查询已有记录
  const skuKeys = rows.map((r) => r.sku);
  const existing = await db.skuMaster.bulkGet(skuKeys);
  const existingMap = new Map<string, SkuMaster>();
  for (const e of existing) {
    if (e) existingMap.set(e.sku, e);
  }

  // 数值字段：新值 > 0 才覆盖
  const numFields: (keyof SkuMaster)[] = [
    "price", "listPrice", "costFob", "costShipping", "costDelivery",
    "costCommission", "commissionRate", "costStorage", "costReturn", "costAd",
    "discountPrice", "discountFob", "discountShipping", "discountDelivery",
    "discountCommission", "discountStorage", "discountReturn", "discountAd", "discountCoupon",
    "fbaPrice", "fbmPrice", "fbaLeadTimeDays", "fbmLeadTimeDays",
    "fbaSafetyStockDays", "fbmSafetyStockDays", "leadTimeDays", "safetyStockDays", "moq",
    "packageLength", "packageWidth", "packageHeight", "packageWeight", "unitsPerBox",
  ];

  // 字符串字段：新值非空才覆盖
  const strFields: (keyof SkuMaster)[] = [
    "name", "asin", "upc", "category", "launchDate", "parentGroup",
    "parentAsin", "parentSku", "productUrl", "marketplace", "image",
  ];

  const merged: SkuMaster[] = rows.map((row) => {
    const old = existingMap.get(row.sku);
    if (!old) return row; // 新 SKU，直接写入

    const result: SkuMaster = { ...old };

    // 数值字段：新值 > 0 才覆盖
    for (const f of numFields) {
      const newVal = row[f] as number | undefined;
      if (newVal != null && newVal > 0) {
        (result as Record<string, unknown>)[f] = newVal;
      }
    }

    // 字符串字段：新值非空才覆盖
    for (const f of strFields) {
      const newVal = row[f] as string | undefined;
      if (newVal && newVal.trim() !== "" && newVal !== "-") {
        (result as Record<string, unknown>)[f] = newVal;
      }
    }

    // 枚举/特殊字段
    if (row.fulfillment && row.fulfillment !== old.fulfillment) {
      result.fulfillment = row.fulfillment;
    }
    if (row.saleStatus && row.saleStatus !== old.saleStatus) {
      result.saleStatus = row.saleStatus;
    }
    if (row.linkType) {
      result.linkType = row.linkType;
    }
    if (row.lifecycle) {
      result.lifecycle = row.lifecycle;
    }
    if (row.fulfillmentMode) {
      result.fulfillmentMode = row.fulfillmentMode;
    }
    if (row.aPlus) {
      result.aPlus = row.aPlus;
    }

    // store：新值非空且非占位符才覆盖
    if (row.store && row.store !== "-" && row.store.startsWith("shop_")) {
      result.store = row.store;
    }

    // msku：新值非空才覆盖
    if (row.msku && row.msku.trim() !== "") {
      result.msku = row.msku;
    }

    // 数组/Record 字段：新值有键才覆盖
    if (row.competitorUrls && row.competitorUrls.length > 0) {
      result.competitorUrls = row.competitorUrls;
    }
    if (row.mskuStores && Object.keys(row.mskuStores).length > 0) {
      result.mskuStores = row.mskuStores;
    }
    if (row.mskuAsins && Object.keys(row.mskuAsins).length > 0) {
      result.mskuAsins = row.mskuAsins;
    }
    if (row.mskuMetrics && Object.keys(row.mskuMetrics).length > 0) {
      result.mskuMetrics = row.mskuMetrics;
    }
    if (row.mskuLinkTypes && Object.keys(row.mskuLinkTypes).length > 0) {
      result.mskuLinkTypes = row.mskuLinkTypes;
    }

    return result;
  });

  await db.skuMaster.bulkPut(merged);
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

/**
 * 部分更新模式：仅覆盖新数据中有值的库存字段，空值/0 不覆盖已有数据。
 * 适用于「只改部分参数」场景——Excel 中空单元格不会清空已有海外仓/FBA/FBM 库存。
 *
 * 合并策略：
 * - 数值字段：新值 > 0 才覆盖，否则保留旧值
 * - 数组字段（warehouseBreakdown/transitBatches/factoryBatches）：新值有元素才覆盖
 * - 新 SKU（数据库中不存在）：直接写入，不合并
 */
export async function upsertInventoryLayersPartial(rows: InventoryLayer[]): Promise<void> {
  if (rows.length === 0) return;

  // 批量查询已有记录（按 date + sku 查找）
  const date = rows[0].date;
  const existing = await db.inventoryLayer
    .where("date")
    .equals(date)
    .toArray();
  const existingMap = new Map<string, InventoryLayer>();
  for (const e of existing) {
    existingMap.set(`${e.sku}__${e.date}`, e);
  }

  // FIX: 查询每个 SKU 的最近一次库存记录（不含当前日期），用于继承 FBM/海外仓等数据
  // 解决：新日期导入时如果 Excel 没有 FBM 库存 sheet，海外仓可售会显示 0
  const skuList = [...new Set(rows.map((r) => r.sku))];
  const allPrevInventory = await db.inventoryLayer
    .where("sku")
    .anyOf(skuList)
    .and((r) => r.date !== date)
    .toArray();
  const latestPrevBySku = new Map<string, InventoryLayer>();
  for (const inv of allPrevInventory) {
    const cur = latestPrevBySku.get(inv.sku);
    if (!cur || cur.date < inv.date) {
      latestPrevBySku.set(inv.sku, inv);
    }
  }

  // 数值字段：新值 > 0 才覆盖
  const numFields: (keyof InventoryLayer)[] = [
    "fbaStock", "fbmStock", "factoryStock",
    "eastTransit", "westTransit", "southeast", "southcentral",
    "eastStock", "westStock", "southeastStock", "southcentralStock",
    "southeastTransit", "southcentralTransit",
  ];

  const merged: InventoryLayer[] = rows.map((row) => {
    const key = `${row.sku}__${row.date}`;
    const old = existingMap.get(key);
    if (!old) {
      // 新日期的记录：从上一次库存记录继承 FBM/海外仓数据
      const prev = latestPrevBySku.get(row.sku);
      if (prev) {
        const result: InventoryLayer = { ...row };
        // 数值字段：新值为 0/空时从上一次记录继承
        for (const f of numFields) {
          const newVal = result[f] as number | undefined;
          if (newVal == null || newVal <= 0) {
            const prevVal = prev[f] as number | undefined;
            if (prevVal != null && prevVal > 0) {
              (result as Record<string, unknown>)[f] = prevVal;
            }
          }
        }
        // warehouseBreakdown：新值为空时从上一次记录继承
        if ((!result.warehouseBreakdown || result.warehouseBreakdown.length === 0) && prev.warehouseBreakdown && prev.warehouseBreakdown.length > 0) {
          result.warehouseBreakdown = prev.warehouseBreakdown;
        }
        // transitBatches：新值为空时从上一次记录继承
        if ((!result.transitBatches || result.transitBatches.length === 0) && prev.transitBatches && prev.transitBatches.length > 0) {
          result.transitBatches = prev.transitBatches;
        }
        // factoryBatches：新值为空时从上一次记录继承
        if ((!result.factoryBatches || result.factoryBatches.length === 0) && prev.factoryBatches && prev.factoryBatches.length > 0) {
          result.factoryBatches = prev.factoryBatches;
        }
        return result;
      }
      return row; // 无历史记录，直接写入
    }

    const result: InventoryLayer = { ...old };
    const prev = latestPrevBySku.get(row.sku);

    // 数值字段：新值 > 0 才覆盖；新值为 0 且旧值也为 0 时，从上一次记录继承（修复历史脏数据）
    for (const f of numFields) {
      const newVal = row[f] as number | undefined;
      if (newVal != null && newVal > 0) {
        (result as Record<string, unknown>)[f] = newVal;
      } else {
        const oldVal = result[f] as number | undefined;
        if ((oldVal == null || oldVal <= 0) && prev) {
          const prevVal = prev[f] as number | undefined;
          if (prevVal != null && prevVal > 0) {
            (result as Record<string, unknown>)[f] = prevVal;
          }
        }
      }
    }

    // 数组字段：新值有元素才覆盖；新值为空且旧值也为空时，从上一次记录继承
    if (row.warehouseBreakdown && row.warehouseBreakdown.length > 0) {
      result.warehouseBreakdown = row.warehouseBreakdown;
    } else if ((!result.warehouseBreakdown || result.warehouseBreakdown.length === 0) && prev?.warehouseBreakdown && prev.warehouseBreakdown.length > 0) {
      result.warehouseBreakdown = prev.warehouseBreakdown;
    }
    if (row.transitBatches && row.transitBatches.length > 0) {
      result.transitBatches = row.transitBatches;
    } else if ((!result.transitBatches || result.transitBatches.length === 0) && prev?.transitBatches && prev.transitBatches.length > 0) {
      result.transitBatches = prev.transitBatches;
    }
    if (row.factoryBatches && row.factoryBatches.length > 0) {
      result.factoryBatches = row.factoryBatches;
    } else if ((!result.factoryBatches || result.factoryBatches.length === 0) && prev?.factoryBatches && prev.factoryBatches.length > 0) {
      result.factoryBatches = prev.factoryBatches;
    }

    return result;
  });

  // 删除已有记录（用合并后的数据替换）
  const toDelete = existing.filter((e) => {
    const key = `${e.sku}__${e.date}`;
    return rows.some((r) => `${r.sku}__${r.date}` === key);
  });
  if (toDelete.length > 0) {
    await db.inventoryLayer.bulkDelete(
      toDelete.map((e) => e.id as number).filter((id) => id != null)
    );
  }
  await db.inventoryLayer.bulkAdd(merged);
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
  exportedAt: string;
}> {
  const [skuMaster, dailySnapshot, inventoryLayer, campaigns, promotions, manualPromotions, alerts, config, shops, opsLogs, warehouseMappings] =
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
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function deleteOpsLog(id: string): Promise<void> {
  await db.opsLogs.delete(id);
}

// ==================== Warehouse Mapping helpers ====================

/** 智能猜测仓库名对应的区域 */
export function guessRegion(warehouseName: string): import("./types").WarehouseRegion | null {
  const name = warehouseName.toLowerCase();
  // 美东关键词
  if (/美东|east|nj|newjersey|新泽西|njf|njjw/.test(name)) return "east";
  // 美西关键词（\bcap\b 匹配独立单词 cap，兼容 "乐歌(新) CAP" 这类无尾随空格的仓库名）
  if (/美西|west|ca[^a-z]|cali|洛杉矶|cajw|\bcap\b/.test(name)) return "west";
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

/**
 * 按店铺名查找已有店铺，不存在则自动创建，返回 shopId。
 * 用于导入时自动匹配/创建店铺，与 addShop 逻辑一致。
 */
export async function getOrCreateShopByName(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "-";
  const all = await db.shops.toArray();
  const existing = all.find(s => s.name === trimmed);
  if (existing) return existing.id;
  const shop = await addShop(trimmed);
  return shop.id;
}

// ==================== Site management (multi-site) ====================
export const DEFAULT_SITES: Site[] = [
  {
    id: "site_us",
    name: "美国站",
    marketplace: "US",
    currency: "USD",
    currencySymbol: "$",
    exchangeRateToUsd: 1.0,
    cnyToUsdRate: 7.25,
    commissionRate: 15,
    fbaDeliveryFee: 3.5,
    vatRate: 0,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: "site_uk",
    name: "英国站",
    marketplace: "UK",
    currency: "GBP",
    currencySymbol: "£",
    exchangeRateToUsd: 1.27,
    cnyToUsdRate: 7.25,
    commissionRate: 15,
    fbaDeliveryFee: 2.5,
    vatRate: 20,
    isActive: false,
    sortOrder: 2,
    createdAt: new Date().toISOString(),
  },
  {
    id: "site_de",
    name: "德国站",
    marketplace: "DE",
    currency: "EUR",
    currencySymbol: "€",
    exchangeRateToUsd: 1.08,
    cnyToUsdRate: 7.25,
    commissionRate: 15,
    fbaDeliveryFee: 3.0,
    vatRate: 19,
    isActive: false,
    sortOrder: 3,
    createdAt: new Date().toISOString(),
  },
  {
    id: "site_jp",
    name: "日本站",
    marketplace: "JP",
    currency: "JPY",
    currencySymbol: "¥",
    exchangeRateToUsd: 0.0067,
    cnyToUsdRate: 7.25,
    commissionRate: 15,
    fbaDeliveryFee: 500,
    vatRate: 10,
    isActive: false,
    sortOrder: 4,
    createdAt: new Date().toISOString(),
  },
  {
    id: "site_ca",
    name: "加拿大站",
    marketplace: "CA",
    currency: "CAD",
    currencySymbol: "C$",
    exchangeRateToUsd: 0.73,
    cnyToUsdRate: 7.25,
    commissionRate: 15,
    fbaDeliveryFee: 4.5,
    vatRate: 5,
    isActive: false,
    sortOrder: 5,
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteId: "",
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

export async function ensureDefaultSites(): Promise<void> {
  const count = await db.sites.count();
  if (count > 0) return;
  await db.sites.bulkPut(DEFAULT_SITES);
}

export async function getAllSites(): Promise<Site[]> {
  return db.sites.orderBy("sortOrder").toArray();
}

export async function getActiveSites(): Promise<Site[]> {
  return db.sites.where("isActive").equals(1 as never).toArray()
    .catch(() => db.sites.toArray());
}

export async function getSite(id: string): Promise<Site | undefined> {
  return db.sites.get(id);
}

export async function addSite(site: Omit<Site, "id" | "createdAt">): Promise<Site> {
  const newSite: Site = {
    ...site,
    id: `site_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  await db.sites.put(newSite);
  return newSite;
}

export async function updateSite(id: string, updates: Partial<Site>): Promise<void> {
  const site = await db.sites.get(id);
  if (!site) throw new Error("站点不存在");
  await db.sites.put({ ...site, ...updates, updatedAt: new Date().toISOString() });
}

export async function deleteSite(id: string): Promise<void> {
  if (id === "site_us") throw new Error("默认站点不可删除");
  await db.sites.delete(id);
  await db.skuMaster.where("siteId").equals(id).modify({ siteId: "site_us" });
  await db.shops.where("siteId").equals(id).modify({ siteId: "site_us" });
  await db.promotions.where("siteId").equals(id).modify({ siteId: "site_us" });
  await db.dailySnapshot.where("siteId").equals(id).modify({ siteId: "site_us" });
  await db.inventoryLayer.where("siteId").equals(id).modify({ siteId: "site_us" });
}

export async function getCurrentSiteId(): Promise<string> {
  const row = await db.config.get("currentSiteId");
  return (row?.value as string) ?? "site_us";
}

export async function setCurrentSiteId(siteId: string): Promise<void> {
  await db.config.put({ key: "currentSiteId", value: siteId });
}

export async function getSiteConfig(siteId: string): Promise<SiteConfig> {
  const row = await db.config.get(`siteConfig_${siteId}`);
  return (row?.value as SiteConfig) ?? { ...DEFAULT_SITE_CONFIG, siteId };
}

export async function setSiteConfig(cfg: SiteConfig): Promise<void> {
  await db.config.put({ key: `siteConfig_${cfg.siteId}`, value: cfg });
}

export async function getCrossSiteSummary(): Promise<CrossSiteReport> {
  const sites = await getAllSites();
  const summaries: CrossSiteSummary[] = [];

  for (const site of sites.filter(s => s.isActive)) {
    const [skus, snapshots, alerts] = await Promise.all([
      db.skuMaster.where("siteId").equals(site.id).count(),
      db.dailySnapshot.where("siteId").equals(site.id).toArray(),
      db.alerts.where("siteId").equals(site.id).count(),
    ]);

    const latestSnapshots = new Map<string, typeof snapshots[0]>();
    for (const s of snapshots) {
      if (!latestSnapshots.has(s.sku)) latestSnapshots.set(s.sku, s);
    }

    let totalSalesUsd = 0;
    let totalProfitUsd = 0;
    let totalStock = 0;

    for (const snap of latestSnapshots.values()) {
      totalSalesUsd += (snap.monthlySales || 0) * site.exchangeRateToUsd;
      totalProfitUsd += (snap.profit || 0) * site.exchangeRateToUsd;
      totalStock += snap.stockOnHand || 0;
    }

    summaries.push({
      siteId: site.id,
      siteName: site.name,
      currency: site.currency,
      exchangeRateToUsd: site.exchangeRateToUsd,
      totalSalesUsd,
      totalProfitUsd,
      totalSkuCount: skus,
      totalStockOnHand: totalStock,
      alertCount: alerts,
    });
  }

  return {
    sites: summaries,
    grandTotalSalesUsd: summaries.reduce((s, x) => s + x.totalSalesUsd, 0),
    grandTotalProfitUsd: summaries.reduce((s, x) => s + x.totalProfitUsd, 0),
    grandTotalSkuCount: summaries.reduce((s, x) => s + x.totalSkuCount, 0),
    grandTotalAlertCount: summaries.reduce((s, x) => s + x.alertCount, 0),
  };
}
