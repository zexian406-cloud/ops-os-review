import type {
  Alert,
  DailySnapshot,
  InventoryLayer,
  OpsLog,
  Promotion,
  SkuMaster,
} from "@/domain/types";
import { db } from "@/domain/db";

/** Reset all tables used by the tests between cases (isolation). */
export async function resetDb(): Promise<void> {
  await Promise.all([
    db.skuMaster.clear(),
    db.dailySnapshot.clear(),
    db.inventoryLayer.clear(),
    db.campaigns.clear(),
    db.promotions.clear(),
    db.manualPromotions.clear(),
    db.alerts.clear(),
    db.config.clear(),
    db.shops.clear(),
    db.opsLogs.clear(),
  ]);
}

/** Build a minimal but valid SkuMaster. Tweak via overrides. */
export function makeSku(overrides: Partial<SkuMaster> = {}): SkuMaster {
  return {
    sku: "SKU-DEFAULT",
    name: "默认品",
    saleStatus: "active",
    fulfillment: "FBA",
    store: "shop_1",
    price: 20,
    costFob: 5,
    costShipping: 1,
    costDelivery: 1,
    costCommission: 0,
    costStorage: 0,
    costReturn: 0,
    costAd: 0,
    leadTimeDays: 40,
    safetyStockDays: 30,
    ...overrides,
  };
}

/** Build a minimal but valid DailySnapshot. Tweak via overrides. */
export function makeSnap(overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    date: "2026-08-01",
    sku: "SKU-DEFAULT",
    dailySales7d: 10,
    monthlySales: 300,
    stockOnHand: 100,
    stockInTransit: 50,
    daysOfCoverOnHand: 10,
    daysOfCoverWithTransit: 15,
    adSpend: 5,
    adRatio: 5,
    profit: 130,
    profitMargin: 65,
    totalCost: 70,
    rating: 4.5,
    reviewCount: 100,
    returnRate: 0,
    refundRate: 0,
    ...overrides,
  };
}

/** Build a minimal Alert. */
export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert-1",
    date: "2026-08-01",
    sku: "SKU-DEFAULT",
    type: "stockout",
    severity: "critical",
    title: "测试告警",
    detail: "测试详情",
    status: "open",
    ...overrides,
  };
}

/** Build a minimal InventoryLayer (four-warehouse breakdown). */
export function makeInv(overrides: Partial<InventoryLayer> = {}): InventoryLayer {
  return {
    date: "2026-08-01",
    sku: "SKU-DEFAULT",
    fbaStock: 0,
    fbmStock: 0,
    factoryStock: 0,
    eastTransit: 0,
    westTransit: 0,
    southeast: 0,
    southcentral: 0,
    eastStock: 0,
    westStock: 0,
    southeastStock: 0,
    southcentralStock: 0,
    ...overrides,
  };
}

/** Build a minimal Promotion. */
export function makePromo(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "P-DEFAULT",
    sku: "SKU-DEFAULT",
    skuName: "默认品",
    store: "shop_1",
    type: "BD",
    name: "默认促销",
    startDate: "2026-08-01",
    endDate: "2026-08-10",
    status: "active",
    ...overrides,
  };
}

/** Build a minimal OpsLog. */
export function makeOpsLog(overrides: Partial<OpsLog> = {}): OpsLog {
  return {
    id: "ops-1",
    sku: "SKU-DEFAULT",
    skuName: "默认品",
    date: "2026-08-01",
    action: "降价",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
