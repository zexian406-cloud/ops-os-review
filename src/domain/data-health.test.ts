import { describe, expect, it } from "vitest";
import { validateImportData } from "./data-health";
import type { ImportResult } from "./excel";
import type { DailySnapshot } from "./types";

const snap = (over: Partial<DailySnapshot> = {}): DailySnapshot => ({
  sku: "BFRS258",
  date: "2026-11-01",
  dailySales7d: 24,
  dailySales30d: 102,
  monthlySales: 102,
  stockOnHand: 186,
  stockInTransit: 80,
  daysOfCoverOnHand: 54,
  daysOfCoverWithTransit: 87,
  adSpend: 45.6,
  adRatio: 12,
  profit: 96,
  profitMargin: 20,
  totalCost: 380,
  rating: 4.2,
  returnRate: 3.2,
  ...over,
});

const buildResult = (snapshots: DailySnapshot[]): ImportResult => ({
  skuMaster: [{ sku: "BFRS258", name: "X", store: "-", price: 39.99, saleStatus: "active", fulfillment: "FBM" }],
  dailySnapshot: snapshots,
  inventoryLayer: [],
  transitBatches: new Map(),
  factoryBatches: new Map(),
  shippingMap: new Map(),
  today: "2026-11-01",
  droppedFields: [],
  addedFields: [],
  columnMap: {},
  missingCritical: [],
});

describe("validateImportData · 功能4：退款率规则 10/11", () => {
  it("退款率为空 → 提示级 ruleId 10（原样入库，仅标记）", () => {
    const v = validateImportData(buildResult([snap({ refundRate: undefined })]));
    const tip = v.tips.find((t) => t.ruleId === 10);
    expect(tip).toBeTruthy();
    expect(tip!.type).toBe("tip");
    expect(tip!.sku).toBe("BFRS258");
    expect(tip!.action).toBe("mark");
    // 数据本身不被修正或跳过
    expect(v.validRows.dailySnapshot).toHaveLength(1);
    expect(v.errors).toHaveLength(0);
  });

  it("退款率 > 20% → 警告级 ruleId 11，文案保留 1 位小数", () => {
    const v = validateImportData(buildResult([snap({ refundRate: 25.3 })]));
    const w = v.warnings.find((t) => t.ruleId === 11);
    expect(w).toBeTruthy();
    expect(w!.type).toBe("warning");
    expect(w!.detail).toContain("25.3%");
    // 警告级自动修正后仍写入
    expect(v.validRows.dailySnapshot).toHaveLength(1);
  });

  it("退款率正常（5%）→ 不触发任何退款率规则", () => {
    const v = validateImportData(buildResult([snap({ refundRate: 5 })]));
    expect(v.tips.find((t) => t.ruleId === 10)).toBeUndefined();
    expect(v.warnings.find((t) => t.ruleId === 11)).toBeUndefined();
  });

  it("真实 0% 与未导入区分：0 不触发规则 10，缺失触发", () => {
    const zero = validateImportData(buildResult([snap({ refundRate: 0 })]));
    expect(zero.tips.find((t) => t.ruleId === 10)).toBeUndefined();

    const missing = validateImportData(buildResult([snap({ refundRate: undefined })]));
    expect(missing.tips.find((t) => t.ruleId === 10)).toBeTruthy();
  });

  it("稀疏上期流量行（销量 0、仅有 Sessions/订单）不触发规则 10/11", () => {
    const v = validateImportData(
      buildResult([
        snap({ dailySales7d: 0, dailySales30d: 0, sessions: 1350, orders: 30, refundRate: undefined }),
        snap({ dailySales7d: 0, dailySales30d: 0, sessions: 1350, orders: 30, refundRate: 25 }),
      ]),
    );
    expect(v.tips.find((t) => t.ruleId === 10)).toBeUndefined();
    expect(v.warnings.find((t) => t.ruleId === 11)).toBeUndefined();
  });
});

describe("validateImportData · 功能：广告订单数规则 12/13", () => {
  it("广告订单数为空 → 提示级 ruleId 12，文案说明按费比估算", () => {
    const v = validateImportData(buildResult([snap({ adOrders: undefined })]));
    const tip = v.tips.find((t) => t.ruleId === 12);
    expect(tip).toBeTruthy();
    expect(tip!.detail).toContain("费比估算");
    expect(v.validRows.dailySnapshot).toHaveLength(1);
  });

  it("广告订单数 > 日销 → 警告级 ruleId 13", () => {
    const v = validateImportData(buildResult([snap({ dailySales7d: 24, adOrders: 30 })]));
    const w = v.warnings.find((t) => t.ruleId === 13);
    expect(w).toBeTruthy();
    expect(w!.detail).toContain("30");
    expect(w!.detail).toContain("24.0");
    expect(v.validRows.dailySnapshot).toHaveLength(1);
  });

  it("广告订单数 ≤ 日销（含真实 0）→ 不触发规则 13", () => {
    const ok = validateImportData(buildResult([snap({ dailySales7d: 24, adOrders: 6 })]));
    expect(ok.warnings.find((t) => t.ruleId === 13)).toBeUndefined();

    const zero = validateImportData(buildResult([snap({ dailySales7d: 24, adOrders: 0 })]));
    expect(zero.warnings.find((t) => t.ruleId === 13)).toBeUndefined();
    expect(zero.tips.find((t) => t.ruleId === 12)).toBeUndefined();
  });

  it("稀疏上期流量行不触发规则 12/13", () => {
    const v = validateImportData(
      buildResult([
        snap({ dailySales7d: 0, dailySales30d: 0, sessions: 1350, orders: 30, adOrders: undefined }),
        snap({ dailySales7d: 0, dailySales30d: 0, sessions: 1350, orders: 30, adOrders: 5 }),
      ]),
    );
    expect(v.tips.find((t) => t.ruleId === 12)).toBeUndefined();
    expect(v.warnings.find((t) => t.ruleId === 13)).toBeUndefined();
  });
});
