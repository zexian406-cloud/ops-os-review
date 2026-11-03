import { describe, expect, it } from "vitest";
import { buildAdSuggestion, computeAdInsight } from "./adInsight";
import type { DailySnapshot, SkuMaster } from "./types";

const sku = { sku: "AD-1", name: "广告测试品", price: 20 } as unknown as SkuMaster;

const snap = (over: Partial<DailySnapshot> = {}): DailySnapshot =>
  ({
    sku: "AD-1",
    date: "2026-11-01",
    dailySales7d: 10,
    dailySales30d: 300,
    monthlySales: 300,
    adRatio: 50,
    adSpend: 100,
    sessions: 1000,
    orders: 10,
    rating: 4.5,
    returnRate: 0,
    refundRate: 3,
    ...over,
  }) as unknown as DailySnapshot;

describe("computeAdInsight · 广告异常指标", () => {
  it("估算日超支 = (实际费比 − 目标费比) × 售价 × 日销，且 ≥1.5 倍目标为 danger", () => {
    const r = computeAdInsight({ sku, current: snap({ adRatio: 50 }), targetAdRatio: 25 });
    expect(r.overspend).toBeCloseTo(50);
    expect(r.target).toBe(25);
    expect(r.severity).toBe("danger"); // 50 / 25 = 2 倍
  });

  it("费比为目标 1~1.5 倍 → warn；低于目标时超支归零", () => {
    expect(computeAdInsight({ sku, current: snap({ adRatio: 35 }), targetAdRatio: 30 }).severity).toBe("warn");
    const low = computeAdInsight({ sku, current: snap({ adRatio: 20 }), targetAdRatio: 30 });
    expect(low.overspend).toBe(0);
  });

  it("费比变化 = 本期 − 上期（pt）", () => {
    const r = computeAdInsight({
      sku,
      current: snap({ adRatio: 46.46 }),
      previous: snap({ adRatio: 34.16 }),
      targetAdRatio: 25,
    });
    expect(r.deltaPt).toBeCloseTo(12.3, 1);
    expect(r.prevAdRatio).toBeCloseTo(34.16);
  });

  it("广告单占比 = 广告订单数 / 日销；未导入为 null", () => {
    const withOrders = computeAdInsight({ sku, current: snap({ adOrders: 4 }), targetAdRatio: 25 });
    expect(withOrders.adOrderShare).toBeCloseTo(40);

    const missing = computeAdInsight({ sku, current: snap({ adOrders: undefined }), targetAdRatio: 25 });
    expect(missing.adOrderShare).toBeNull();
  });

  it("建议文案三选一：流量下滑优先 → 广告单占比上升 → 转化正常", () => {
    expect(buildAdSuggestion({
      sessionsDeltaPct: -20,
      cvrDeltaPct: 0,
      adOrderShare: 40,
      prevAdOrderShare: 25,
    })).toContain("先查流量端");

    expect(buildAdSuggestion({
      sessionsDeltaPct: 2,
      cvrDeltaPct: 1,
      adOrderShare: 40,
      prevAdOrderShare: 25,
    })).toContain("广告投入加大");

    expect(buildAdSuggestion({
      sessionsDeltaPct: 1,
      cvrDeltaPct: 0,
      adOrderShare: 40,
      prevAdOrderShare: 39,
    })).toContain("核查竞价与关键词");
  });
});
