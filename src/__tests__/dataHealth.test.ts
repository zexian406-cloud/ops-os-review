import { describe, it, expect } from "vitest";
import { runDataHealth } from "@/domain/dataHealth";
import type { DailySnapshot, InventoryLayer, SkuMaster } from "@/domain/types";
import { makeInv, makeSku, makeSnap } from "./fixtures";

describe("数据健康 — 本轮新增两类", () => {
  it("missing_leadtime：leadTimeDays 缺失时被识别", () => {
    const sku: SkuMaster = makeSku({
      sku: "DH-LT1",
      leadTimeDays: undefined,
      costFob: 5,
    });
    const snap: DailySnapshot = makeSnap({ sku: "DH-LT1", profitMargin: 30 });
    const inv: InventoryLayer = makeInv({ sku: "DH-LT1", eastStock: 100 });
    const report = runDataHealth({
      skuMaster: [sku],
      snapshots: [snap],
      inventory: [inv],
    });
    expect(report.counts.missing_leadtime).toBeGreaterThanOrEqual(1);
    expect(report.byCategory.missing_leadtime[0]?.sku).toBe("DH-LT1");
  });

  it("missing_leadtime：leadTimeDays 为 0 也被识别", () => {
    const sku: SkuMaster = makeSku({
      sku: "DH-LT2",
      leadTimeDays: 0,
      costFob: 5,
    });
    const snap: DailySnapshot = makeSnap({ sku: "DH-LT2", profitMargin: 30 });
    const inv: InventoryLayer = makeInv({ sku: "DH-LT2", eastStock: 100 });
    const report = runDataHealth({
      skuMaster: [sku],
      snapshots: [snap],
      inventory: [inv],
    });
    expect(report.counts.missing_leadtime).toBeGreaterThanOrEqual(1);
  });

  it("stock_negative：inventory 总库存为负（危险级）被识别", () => {
    const sku: SkuMaster = makeSku({
      sku: "DH-NEG",
      leadTimeDays: 40,
      costFob: 5,
    });
    const snap: DailySnapshot = makeSnap({ sku: "DH-NEG", profitMargin: 30 });
    // 仓库拆分为负 → computeWarehouseTotals().total < 0
    const inv: InventoryLayer = makeInv({
      sku: "DH-NEG",
      eastStock: 0,
      westStock: 0,
      southeastStock: 0,
      southcentralStock: 0,
      warehouseBreakdown: [{ warehouse: "西仓", qty: -50, daysOfCover: 1 }],
    });
    const report = runDataHealth({
      skuMaster: [sku],
      snapshots: [snap],
      inventory: [inv],
    });
    expect(report.counts.stock_negative).toBeGreaterThanOrEqual(1);
    expect(report.byCategory.stock_negative[0]?.severity).toBe("critical");
    expect(report.byCategory.stock_negative[0]?.sku).toBe("DH-NEG");
  });
});

describe("数据健康 — 既有类别不回归", () => {
  it("missing_cost：有售价但缺 FOB 成本被识别", () => {
    const sku: SkuMaster = makeSku({
      sku: "DH-COST",
      leadTimeDays: 40,
      costFob: undefined, // 缺失 FOB
      costShipping: undefined, // 缺失头程
    });
    const snap: DailySnapshot = makeSnap({ sku: "DH-COST", profitMargin: 30 });
    const inv: InventoryLayer = makeInv({ sku: "DH-COST", eastStock: 100 });
    const report = runDataHealth({
      skuMaster: [sku],
      snapshots: [snap],
      inventory: [inv],
    });
    expect(report.counts.missing_cost).toBeGreaterThanOrEqual(1);
    expect(
      report.byCategory.missing_cost.some((i) => i.sku === "DH-COST"),
    ).toBe(true);
  });

  it("abnormal_profit：利润率为负（critical）被识别", () => {
    const sku: SkuMaster = makeSku({
      sku: "DH-PROFIT",
      leadTimeDays: 40,
      costFob: 5,
    });
    const snap: DailySnapshot = makeSnap({ sku: "DH-PROFIT", profitMargin: -5 });
    const inv: InventoryLayer = makeInv({ sku: "DH-PROFIT", eastStock: 100 });
    const report = runDataHealth({
      skuMaster: [sku],
      snapshots: [snap],
      inventory: [inv],
    });
    expect(report.counts.abnormal_profit).toBeGreaterThanOrEqual(1);
    expect(report.byCategory.abnormal_profit[0]?.severity).toBe("critical");
  });

  it("abnormal_profit：利润率为 0（warning）被识别", () => {
    const sku: SkuMaster = makeSku({
      sku: "DH-PROFIT0",
      leadTimeDays: 40,
      costFob: 5,
    });
    const snap: DailySnapshot = makeSnap({ sku: "DH-PROFIT0", profitMargin: 0 });
    const inv: InventoryLayer = makeInv({ sku: "DH-PROFIT0", eastStock: 100 });
    const report = runDataHealth({
      skuMaster: [sku],
      snapshots: [snap],
      inventory: [inv],
    });
    expect(
      report.byCategory.abnormal_profit.some(
        (i) => i.sku === "DH-PROFIT0" && i.severity === "warning",
      ),
    ).toBe(true);
  });
});
