import { describe, expect, it } from "vitest";
import {
  aggregateSnapshots,
  daysBetween,
  resolveComparison,
  shiftDate,
} from "./diagnosis-period";
import type { DailySnapshot } from "./types";

const snap = (date: string, patch: Partial<DailySnapshot> = {}): DailySnapshot => ({
  date,
  sku: "sku001",
  siteId: "site_us",
  dailySales7d: 10,
  monthlySales: 300,
  stockOnHand: 100,
  stockInTransit: 0,
  daysOfCoverOnHand: 10,
  daysOfCoverWithTransit: 10,
  adSpend: 10,
  adRatio: 10,
  profit: 100,
  profitMargin: 20,
  totalCost: 10,
  rating: 4.5,
  reviewCount: 100,
  returnRate: 2,
  ...patch,
});

describe("shiftDate / daysBetween", () => {
  it("跨月加减日期", () => {
    expect(shiftDate("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("闭区间天数", () => {
    expect(daysBetween("2026-10-19", "2026-10-25")).toBe(7);
    expect(daysBetween("2026-10-25", "2026-10-19")).toBe(7);
    expect(daysBetween("2026-10-19", "2026-10-19")).toBe(1);
  });
});

describe("aggregateSnapshots", () => {
  it("率类取均值，存量取最后一天", () => {
    const agg = aggregateSnapshots([
      snap("2026-10-19", { dailySales7d: 10, adRatio: 10, stockOnHand: 100 }),
      snap("2026-10-20", { dailySales7d: 20, adRatio: 20, stockOnHand: 80 }),
    ]);
    expect(agg?.dailySales7d).toBe(15);
    expect(agg?.adRatio).toBe(15);
    expect(agg?.stockOnHand).toBe(80);
    expect(agg?.date).toBe("2026-10-20");
  });

  it("评分缺失(0)不参与均值", () => {
    const agg = aggregateSnapshots([
      snap("2026-10-19", { rating: 4 }),
      snap("2026-10-20", { rating: 0 }),
    ]);
    expect(agg?.rating).toBe(4);
  });
});

describe("resolveComparison · 指定日期区间", () => {
  const rows = [
    snap("2026-10-05", { dailySales7d: 30 }),
    snap("2026-10-06", { dailySales7d: 30 }),
    snap("2026-10-12", { dailySales7d: 20 }),
    snap("2026-10-19", { dailySales7d: 10 }),
    snap("2026-10-20", { dailySales7d: 10 }),
    snap("2026-10-25", { dailySales7d: 10 }),
  ];

  it("本期为指定区间均值，上期为紧邻等长区间", () => {
    const r = resolveComparison({
      rows,
      basis: "range",
      rangeStart: "2026-10-19",
      rangeEnd: "2026-10-25",
    });
    expect(r.current?.dailySales7d).toBe(10);
    expect(r.previous?.dailySales7d).toBe(20); // 10-12 ~ 10-18 内只有 10-12 一条
    expect(r.previousLabel).toContain("2026-10-12 ~ 2026-10-18");
    expect(r.warning).toBeUndefined();
  });

  it("起止顺序颠倒时自动纠正", () => {
    const r = resolveComparison({
      rows,
      basis: "range",
      rangeStart: "2026-10-25",
      rangeEnd: "2026-10-19",
    });
    expect(r.currentLabel).toContain("2026-10-19 ~ 2026-10-25");
  });

  it("区间内无快照时给出提示", () => {
    const r = resolveComparison({
      rows,
      basis: "range",
      rangeStart: "2026-09-01",
      rangeEnd: "2026-09-07",
    });
    expect(r.current).toBeUndefined();
    expect(r.warning).toContain("没有快照");
  });

  it("未选起止日期时提示选择", () => {
    const r = resolveComparison({ rows, basis: "range" });
    expect(r.warning).toContain("请选择");
  });
});

describe("resolveComparison · 固定天数", () => {
  const rows = [
    snap("2026-10-01", { dailySales7d: 40 }),
    snap("2026-10-10", { dailySales7d: 30 }),
    snap("2026-10-17", { dailySales7d: 20 }),
    snap("2026-10-21", { dailySales7d: 10 }),
  ];

  it("近7天 vs 前7天按区间均值对比，而非单日快照", () => {
    const r = resolveComparison({ rows, basis: "7d" });
    // 本期 10-15 ~ 10-21：10-17(20) + 10-21(10) → 15
    expect(r.current?.dailySales7d).toBe(15);
    // 上期 10-08 ~ 10-14：10-10(30) → 30
    expect(r.previous?.dailySales7d).toBe(30);
    expect(r.currentLabel).toContain("2026-10-15 ~ 2026-10-21");
  });

  it("自定义天数生效", () => {
    const r = resolveComparison({ rows, basis: "custom", customDays: 3 });
    expect(r.currentLabel).toContain("3 天均值");
  });
});

describe("resolveComparison · 导入批次", () => {
  it("取最近两次导入日期", () => {
    const r = resolveComparison({
      rows: [snap("2026-10-10"), snap("2026-10-21", { dailySales7d: 20 })],
      basis: "import",
    });
    expect(r.current?.dailySales7d).toBe(20);
    expect(r.previous?.dailySales7d).toBe(10);
    expect(r.currentLabel).toContain("2026-10-21");
  });

  it("只有一次导入时提示改用区间环比", () => {
    const r = resolveComparison({ rows: [snap("2026-10-21")], basis: "import" });
    expect(r.previous).toBeUndefined();
    expect(r.warning).toContain("只有一次导入");
  });
});
