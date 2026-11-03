// =========================================================
// 月度复盘领域计算单元测试（monthlyReview.ts）
// 覆盖：促销 ROI 三种成本口径与已结束过滤 · 动作闭环前后窗口与样本不足 ·
//       月度盈亏公式与连续两月亏损 · 费用趋势两档口径
// =========================================================
import { describe, expect, it } from "vitest";
import {
  computeActionLoop, computeMonthlyProfit, computePromoRoi, computeStoreFeeTrend,
  daysInMonth, diffDays, shiftDate,
} from "./monthlyReview";
import type { DailySnapshot, OpsLog, Promotion, SkuMaster } from "./types";

const TODAY = "2026-11-02";

/** 测试主档：售价 10，FOB 2 → 正常价单件净利 > 0 且可复算 */
const mkMaster = (over: Partial<SkuMaster> = {}): SkuMaster =>
  ({
    sku: "T1", name: "测试品", store: "S1", price: 10,
    costFob: 2, saleStatus: "active", fulfillment: "FBA",
    ...over,
  }) as SkuMaster;

const mkSnap = (sku: string, date: string, daily: number, over: Partial<DailySnapshot> = {}): DailySnapshot =>
  ({ date, sku, siteId: "site_us", dailySales7d: daily, monthlySales: daily * 30, adRatio: 0, rating: 4.5, reviewCount: 10, returnRate: 0, ...over }) as DailySnapshot;

const mkPromo = (over: Partial<Promotion> = {}): Promotion =>
  ({ id: "p1", sku: "T1", store: "S1", type: "BD", name: "活动A", startDate: "2026-10-10", endDate: "2026-10-16", status: "ended", ...over }) as Promotion;

describe("日期工具", () => {
  it("shiftDate 跨月正常", () => {
    expect(shiftDate("2026-10-28", 5)).toBe("2026-11-02");
    expect(shiftDate("2026-11-02", -7)).toBe("2026-10-26");
  });
  it("diffDays", () => {
    expect(diffDays("2026-11-02", "2026-10-28")).toBe(5);
    expect(diffDays("2026-10-10", "2026-10-16")).toBe(-6);
  });
  it("daysInMonth", () => {
    expect(daysInMonth("2026-10")).toBe(31);
    expect(daysInMonth("2026-11")).toBe(30);
    expect(daysInMonth("2026-02")).toBe(28);
  });
});

describe("板块1 · computePromoRoi", () => {
  // 活动期 10-10..10-16（7天）日均 8 → 期销 56；前7天 10-03..10-09 日均 6 → 增量 56−42=14
  const snaps = [
    ...Array.from({ length: 9 }, (_, i) => mkSnap("T1", `2026-10-0${i + 1}`, 6)),
    ...Array.from({ length: 7 }, (_, i) => mkSnap("T1", `2026-10-${String(10 + i).padStart(2, "0")}`, 8)),
    mkSnap("T1", "2026-10-20", 6),
  ];

  it("金额成本：期销/增量/毛贡献/ROI 按公式逐项对上", () => {
    const [row] = computePromoRoi({
      promotions: [mkPromo({ costMode: "amount", amount: 50 })],
      skuMaster: [mkMaster()], snapshots: snaps, today: TODAY,
    });
    expect(row).toBeTruthy();
    expect(row.days).toBe(7);
    expect(row.periodSales).toBeCloseTo(56);
    expect(row.baseDaily).toBeCloseTo(6);
    expect(row.liftUnits).toBeCloseTo(14);
    expect(row.unitProfit).not.toBeNull();
    expect(row.grossContribution).toBeCloseTo(56 * (row.unitProfit as number));
    expect(row.roi).toBeCloseTo(row.grossContribution! - 50);
  });

  it("折扣率成本：无估值时按 率×正常价×期销 估算（净利不受折扣价影响）", () => {
    const [row] = computePromoRoi({
      promotions: [mkPromo({ costMode: "rate", rate: 10 })],
      skuMaster: [mkMaster()], snapshots: snaps, today: TODAY,
    });
    // 估算成本 = 10% × 10 × 56 = 56
    expect(row.cost).toBeCloseTo(56);
  });

  it("仅统计已结束：active/upcoming 不进结果；endDate 已过但状态未更新会被兜底计入", () => {
    const rows = computePromoRoi({
      promotions: [
        mkPromo({ id: "a", status: "active", startDate: "2026-11-10", endDate: "2026-11-20" }),
        mkPromo({ id: "b", status: "upcoming", startDate: "2026-12-01", endDate: "2026-12-05" }),
        mkPromo({ id: "c", status: "upcoming", startDate: "2026-10-10", endDate: "2026-10-16" }),
      ],
      skuMaster: [mkMaster()], snapshots: snaps, today: TODAY,
    });
    expect(rows.map((r) => r.promoId)).toEqual(["c"]);
  });

  it("无前7天快照 → 增量为 null；无活动期快照 → hasData=false", () => {
    // 10-01..10-05 活动：前窗 09-24..09-30 无任何快照 → 无基期
    const [noBefore] = computePromoRoi({
      promotions: [mkPromo({ startDate: "2026-10-01", endDate: "2026-10-05" })],
      skuMaster: [mkMaster()], snapshots: snaps, today: TODAY,
    });
    expect(noBefore.baseDaily).toBeNull();
    expect(noBefore.liftUnits).toBeNull();

    const [noData] = computePromoRoi({
      promotions: [mkPromo({ startDate: "2026-09-01", endDate: "2026-09-07" })],
      skuMaster: [mkMaster()], snapshots: snaps, today: TODAY,
    });
    expect(noData.hasData).toBe(false);
    expect(noData.periodSales).toBe(0);
  });

  it("成本高于毛贡献 → ROI 为负", () => {
    const [row] = computePromoRoi({
      promotions: [mkPromo({ costMode: "amount", amount: 9999 })],
      skuMaster: [mkMaster()], snapshots: snaps, today: TODAY,
    });
    expect(row.roi!).toBeLessThan(0);
  });
});

describe("板块2 · computeActionLoop", () => {
  // 10-01..10-31 每天一条快照：1-10 日均 5，11-20 日均 8，21-31 日均 10
  const snaps: DailySnapshot[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, "0")}`;
    snaps.push(mkSnap("T1", date, d <= 10 ? 5 : d <= 20 ? 8 : 10));
  }
  const mkLog = (over: Partial<OpsLog> = {}): OpsLog =>
    ({ id: "log1", sku: "T1", date: "2026-10-11", action: "开广告", createdAt: "2026-10-11T00:00:00Z", ...over }) as OpsLog;

  it("操作日 10-11：前7天(10-04..10-10)日均 5，后7天(10-11..10-17)日均 8", () => {
    const [row] = computeActionLoop({ logs: [mkLog()], skuMaster: [mkMaster()], snapshots: snaps });
    expect(row.beforeSamples).toBe(7);
    expect(row.afterSamples).toBe(7);
    expect(row.salesBefore).toBeCloseTo(5);
    expect(row.salesAfter).toBeCloseTo(8);
    expect(row.salesDelta).toBeCloseTo(3);
  });

  it("数据不足7天 → 对应窗口样本为 0，值显示 null", () => {
    const [row] = computeActionLoop({ logs: [mkLog({ id: "log2", date: "2026-10-01" })], skuMaster: [mkMaster()], snapshots: snaps });
    expect(row.beforeSamples).toBe(0);
    expect(row.salesBefore).toBeNull();
    expect(row.salesDelta).toBeNull();
  });

  it("操作记录记在 MSKU 上 → 反查父SKU后可对比", () => {
    const master = mkMaster({ msku: "T1-B" });
    const [row] = computeActionLoop({ logs: [mkLog({ sku: "T1-B" })], skuMaster: [master], snapshots: snaps });
    expect(row.sku).toBe("T1");
    expect(row.salesAfter).toBeCloseTo(8);
  });

  it("仅展示不做因果：净利率变化独立于销量变化计算", () => {
    const [row] = computeActionLoop({
      logs: [mkLog()],
      skuMaster: [mkMaster({ costFob: 5 })], // 净利率更低但仍可算
      snapshots: snaps,
    });
    expect(row.marginBefore).not.toBeNull();
    expect(row.marginAfter).not.toBeNull();
    expect(row.marginDelta).toBeCloseTo((row.marginAfter as number) - (row.marginBefore as number));
  });
});

describe("板块3 · computeMonthlyProfit", () => {
  // 9月与10月各 4 条快照，日均 5；单件净利 >0
  const snaps = [
    ...["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"].map((d) => mkSnap("T1", d, 5)),
    ...["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"].map((d) => mkSnap("T1", d, 5)),
  ];

  it("today=2026-10-15 → 本月10月、上月9月；月净利 = 日均 × 单件净利 × 当月天数", () => {
    const { rows, curMonth, prevMonth } = computeMonthlyProfit({ skuMaster: [mkMaster()], snapshots: snaps, today: "2026-10-15" });
    expect(curMonth).toBe("2026-10");
    expect(prevMonth).toBe("2026-09");
    const [row] = rows;
    expect(row.curProfit).toBeCloseTo(5 * (row.unitProfit as number) * 31);
    expect(row.prevProfit).toBeCloseTo(5 * (row.unitProfit as number) * 30);
    expect(row.delta).not.toBeNull();
    expect(row.bothLoss).toBe(false);
  });

  it("连续两月亏损（单件净利为负）→ bothLoss 标记", () => {
    const lossMaster = mkMaster({ price: 10, costFob: 20 }); // 成本高于售价 → 净利为负
    const { rows } = computeMonthlyProfit({ skuMaster: [lossMaster], snapshots: snaps, today: "2026-10-15" });
    expect(rows[0].bothLoss).toBe(true);
    expect(rows[0].curProfit!).toBeLessThan(0);
  });

  it("本月无数据的 SKU 不入榜；today 所在月无快照时回退到最新有数月", () => {
    const { curMonth } = computeMonthlyProfit({ skuMaster: [mkMaster()], snapshots: snaps, today: "2026-11-02" });
    expect(curMonth).toBe("2026-10"); // 11月无快照 → 回退 10 月
  });
});

describe("板块4 · computeStoreFeeTrend", () => {
  it("有广告花费 → 精确口径 Σ广告费/Σ销售额；退货率取有值平均", () => {
    const snaps = [
      mkSnap("T1", "2026-10-05", 10, { adSpend: 50, returnRate: 4 }),
      mkSnap("T2", "2026-10-05", 20, { adSpend: 100, returnRate: 6 }),
      mkSnap("T3", "2026-10-05", 5, { returnRate: 0 }), // 无退货率 → 不计入平均
    ];
    const masters = [
      mkMaster({ sku: "T1", price: 10 }),  // 销售额 100
      mkMaster({ sku: "T2", price: 10 }),  // 销售额 200
      mkMaster({ sku: "T3", price: 10 }),  // 销售额 50
    ];
    const [pt] = computeStoreFeeTrend({ skuMaster: masters, snapshots: snaps, today: TODAY });
    expect(pt.month).toBe("2026-10");
    expect(pt.adRatio).toBeCloseTo((150 / 350) * 100);
    expect(pt.returnRate).toBeCloseTo(5);
  });

  it("无广告花费时按费比反推；缺月不产生点", () => {
    const snaps = [
      mkSnap("T1", "2026-09-05", 10, { adRatio: 10 }),
      mkSnap("T1", "2026-10-05", 10, { adRatio: 20 }),
    ];
    const points = computeStoreFeeTrend({ skuMaster: [mkMaster()], snapshots: snaps, today: TODAY });
    expect(points.map((p) => p.month)).toEqual(["2026-09", "2026-10"]);
    expect(points[0].adRatio).toBeCloseTo(10);
    expect(points[1].adRatio).toBeCloseTo(20);
  });
});
