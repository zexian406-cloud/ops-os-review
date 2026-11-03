import { describe, expect, it } from "vitest";
import { buildAdSuggestion, computeAdInsight, sortAdInsights, summarizeAdInsights } from "./adInsight";
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

  it("阈值边界：Sessions 跌 ≥5% 走流量端建议，跌 4.9% 不算；占比恰好 +5pt 算投入加大", () => {
    expect(buildAdSuggestion({
      sessionsDeltaPct: -5,
      cvrDeltaPct: 0,
      adOrderShare: 40,
      prevAdOrderShare: 39,
    })).toContain("先查流量端");

    expect(buildAdSuggestion({
      sessionsDeltaPct: -4.9,
      cvrDeltaPct: 0,
      adOrderShare: 40,
      prevAdOrderShare: 39,
    })).toContain("核查竞价与关键词");

    expect(buildAdSuggestion({
      sessionsDeltaPct: 0,
      cvrDeltaPct: 0,
      adOrderShare: 45,
      prevAdOrderShare: 40,
    })).toContain("广告投入加大");
  });

  it("目标费比非法（0 / 负数）回退 25，避免除零与负超支", () => {
    const r = computeAdInsight({ sku, current: snap({ adRatio: 50 }), targetAdRatio: 0 });
    expect(r.target).toBe(25);
    expect(r.overspend).toBeCloseTo(50);
  });

  it("严重度边界：恰好 1.5 倍目标 → danger", () => {
    const r = computeAdInsight({ sku, current: snap({ adRatio: 45 }), targetAdRatio: 30 });
    expect(r.severity).toBe("danger"); // 45 / 30 = 1.5
  });

  it("卖价为 0 时估算日超支为 0", () => {
    const r = computeAdInsight({
      sku: { ...sku, price: 0 } as SkuMaster,
      current: snap({ adRatio: 50 }),
      targetAdRatio: 25,
    });
    expect(r.overspend).toBe(0);
  });
});

describe("sortAdInsights / summarizeAdInsights · 广告 Tab 排序与汇总", () => {
  const row = (code: string, adRatio: number, daily: number, price: number) => ({
    code,
    insight: computeAdInsight({
      sku: { sku: code, name: code, price } as SkuMaster,
      current: snap({ adRatio, dailySales7d: daily }),
      targetAdRatio: 25,
    }),
  });

  it("按估算日超支降序：日销大的高费比 SKU 排在日销小的前面", () => {
    const sku001 = row("sku001", 46.46, 10.9, 26.08); // 超支 ~61
    const sku012 = row("sku012", 52.87, 0.4, 19.98);  // 超支 ~2
    const sorted = sortAdInsights([sku012, sku001]);
    expect(sorted.map((r) => r.code)).toEqual(["sku001", "sku012"]);
  });

  it("汇总 SKU 数、合计超支与最严重项", () => {
    const s = summarizeAdInsights([
      row("sku012", 52.87, 0.4, 19.98),
      row("sku001", 46.46, 10.9, 26.08),
      row("sku011", 46.52, 0.5, 22.82),
    ]);
    expect(s.count).toBe(3);
    expect(s.worst?.code).toBe("sku001");
    expect(s.total).toBeGreaterThan(0);
  });

  it("空列表汇总为 0 且无最严重项", () => {
    expect(summarizeAdInsights([])).toEqual({ count: 0, total: 0, worst: undefined });
  });
});
