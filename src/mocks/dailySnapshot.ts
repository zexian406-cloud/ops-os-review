import type { DailySnapshot } from "@/domain/types";

// Latest snapshot for today (通用演示数据)
const mockLatestSnapshotBase: Omit<DailySnapshot, "id" | "date">[] = [
  { sku: "sku001", siteId: "site_demo", dailySales7d: 10.9, monthlySales: 347, stockOnHand: 685, stockInTransit: 376, daysOfCoverOnHand: 63, daysOfCoverWithTransit: 97.6, adSpend: 12.07, adRatio: 46.46, profit: 4.69, profitMargin: 18.06, totalCost: 21.3, rating: 4.5, returnRate: 8 },
  { sku: "sku002", siteId: "site_demo", dailySales7d: 3.0, monthlySales: 153, stockOnHand: 520, stockInTransit: 360, daysOfCoverOnHand: 172.8, daysOfCoverWithTransit: 292.4, adSpend: 7.28, adRatio: 30.35, profit: -0.43, profitMargin: -1.79, totalCost: 24.42, rating: 4.5, returnRate: 0 },
  { sku: "sku003", siteId: "site_demo", dailySales7d: 9.4, monthlySales: 178, stockOnHand: 502, stockInTransit: 245, daysOfCoverOnHand: 53.2, daysOfCoverWithTransit: 79.1, adSpend: 6.42, adRatio: 21.42, profit: -1.87, profitMargin: -6.22, totalCost: 31.86, rating: 4.4, returnRate: 4.55 },
  { sku: "sku004", siteId: "site_demo", dailySales7d: 5.9, monthlySales: 147, stockOnHand: 1620, stockInTransit: 0, daysOfCoverOnHand: 269.6, daysOfCoverWithTransit: 269.6, adSpend: 8.71, adRatio: 21.78, profit: 0.71, profitMargin: 1.78, totalCost: 39.28, rating: 4.4, returnRate: 0 },
  { sku: "sku005", siteId: "site_demo", dailySales7d: 2.4, monthlySales: 80, stockOnHand: 1242, stockInTransit: 555, daysOfCoverOnHand: 433.2, daysOfCoverWithTransit: 626.8, adSpend: 14.42, adRatio: 8.69, profit: 10.48, profitMargin: 6.32, totalCost: 155.51, rating: 3.9, returnRate: 0 },
  { sku: "sku006", siteId: "site_demo", dailySales7d: 1.9, monthlySales: 58, stockOnHand: 485, stockInTransit: 20, daysOfCoverOnHand: 72.1, daysOfCoverWithTransit: 75.1, adSpend: 18.93, adRatio: 17.86, profit: 14.83, profitMargin: 13.99, totalCost: 91.16, rating: 4.4, returnRate: 0 },
  { sku: "sku007", siteId: "site_demo", dailySales7d: 2.1, monthlySales: 18, stockOnHand: 631, stockInTransit: 69, daysOfCoverOnHand: 55.2, daysOfCoverWithTransit: 61.2, adSpend: 12.63, adRatio: 14.69, profit: 9.44, profitMargin: 10.98, totalCost: 76.54, rating: 5.0, returnRate: 0 },
  { sku: "sku008", siteId: "site_demo", dailySales7d: 9.3, monthlySales: 228, stockOnHand: 631, stockInTransit: 69, daysOfCoverOnHand: 55.2, daysOfCoverWithTransit: 61.2, adSpend: 25.78, adRatio: 29.98, profit: 9.65, profitMargin: 11.22, totalCost: 76.34, rating: 5.0, returnRate: 1.54 },
  { sku: "sku009", siteId: "site_demo", dailySales7d: 5.2, monthlySales: 156, stockOnHand: 420, stockInTransit: 50, daysOfCoverOnHand: 80.8, daysOfCoverWithTransit: 90.4, adSpend: 15.0, adRatio: 25.0, profit: 7.39, profitMargin: 8.5, totalCost: 79.60, rating: 4.8, returnRate: 2.1 },
  { sku: "sku010", siteId: "site_demo", dailySales7d: 2.6, monthlySales: 69, stockOnHand: 776, stockInTransit: 30, daysOfCoverOnHand: 270.7, daysOfCoverWithTransit: 281.1, adSpend: 10.82, adRatio: 7.21, profit: -1.74, profitMargin: -1.16, totalCost: 151.73, rating: 4.0, returnRate: 11.11, refundRate: 11.11 },
  { sku: "sku011", siteId: "site_demo", dailySales7d: 2.9, monthlySales: 83, stockOnHand: 112, stockInTransit: 344, daysOfCoverOnHand: 23.0, daysOfCoverWithTransit: 93.7, adSpend: 37.21, adRatio: 46.52, profit: 25.83, profitMargin: 32.29, totalCost: 54.16, rating: 4.2, returnRate: 0 },
  { sku: "sku012", siteId: "site_demo", dailySales7d: 0.4, monthlySales: 12, stockOnHand: 1, stockInTransit: 100, daysOfCoverOnHand: 1.7, daysOfCoverWithTransit: 173.7, adSpend: 40.18, adRatio: 52.87, profit: -53.9, profitMargin: -70.93, totalCost: 129.89, rating: 0, returnRate: 0 },
  { sku: "sku013", siteId: "site_demo", dailySales7d: 0.9, monthlySales: 33, stockOnHand: 186, stockInTransit: 90, daysOfCoverOnHand: 214.5, daysOfCoverWithTransit: 318.3, adSpend: 15.6, adRatio: 26.01, profit: -0.04, profitMargin: -0.07, totalCost: 60.03, rating: 5.0, returnRate: 0 },
  { sku: "sku014", siteId: "site_demo", dailySales7d: 1.3, monthlySales: 16, stockOnHand: 768, stockInTransit: 20, daysOfCoverOnHand: 178.8, daysOfCoverWithTransit: 183.4, adSpend: 9.37, adRatio: 7.81, profit: -10.71, profitMargin: -8.93, totalCost: 130.7, rating: 4.2, returnRate: 0 },
  { sku: "sku015", siteId: "site_demo", dailySales7d: 8.1, monthlySales: 142, stockOnHand: 620, stockInTransit: 80, daysOfCoverOnHand: 68.8, daysOfCoverWithTransit: 77.7, adSpend: 6.39, adRatio: 4.0, profit: 17.77, profitMargin: 11.11, totalCost: 142.22, rating: 4.7, returnRate: 0 },
  { sku: "sku016", siteId: "site_demo", dailySales7d: 2.7, monthlySales: 87, stockOnHand: 397, stockInTransit: 570, daysOfCoverOnHand: 145.7, daysOfCoverWithTransit: 355.0, adSpend: 51.06, adRatio: 17.61, profit: 53.15, profitMargin: 18.33, totalCost: 236.84, rating: 3.4, returnRate: 5.26, refundRate: 8.62 },
  { sku: "sku017", siteId: "site_demo", dailySales7d: 0.7, monthlySales: 31, stockOnHand: 234, stockInTransit: 99, daysOfCoverOnHand: 323.1, daysOfCoverWithTransit: 459.8, adSpend: 4.14, adRatio: 10.36, profit: -4.65, profitMargin: -11.63, totalCost: 44.64, rating: 4.3, returnRate: 0 },
];

/** 演示基准转化率（%）：历史期稳定值；今天的偏离用于制造分流案例（流量端 / 转化端） */
const BASE_CVR: Record<string, number> = {
  sku010: 8.6,   // 转化端案例：Sessions 大涨但 CVR 崩（差评/退货场景自洽）
  sku015: 8.0,   // 流量端案例：Sessions 下跌、CVR 稳定
};

// 注入演示流量/转化数据（sessions/orders）：orders ≈ 日均销量，sessions 按基准 CVR 派生
export const mockLatestSnapshot: Omit<DailySnapshot, "id" | "date">[] = mockLatestSnapshotBase.map((s) => {
  const baseCvr = BASE_CVR[s.sku] ?? 8.5;
  let orders = s.dailySales7d;
  let sessions = orders / (baseCvr / 100) * 1.01;      // 默认：两期都稳 → verdict = none
  if (s.sku === "sku004") { sessions = 28; orders = 2.38; } // 流量下滑 critical 案例：昨天 ~60-80 → 今天 28（-53%~-65%），CVR 持平 8.5% → 流量端异常
  if (s.sku === "sku008") { sessions = 65; orders = 5.53; } // 流量下滑 warning 案例：昨天 ~94-127 → 今天 65（-31%~-49%），CVR 持平 → 流量下滑告警（warning 级）
  if (s.sku === "sku005") sessions = 25;               // 流量端案例：Sessions ~29 → 25（-14%），CVR 稳/升（有库存积压告警可展示 Badge）
  if (s.sku === "sku010") sessions = orders / 0.03;    // 转化端案例：CVR 8.6% → 3.0%，Sessions 稳/升
  if (s.sku === "sku015") sessions = 82;               // 流量端案例：Sessions ~101 → 82（-19%），CVR 稳/升
  return { ...s, orders: Number(orders.toFixed(2)), sessions: Math.round(sessions) };
});

// 演示案例定向制造：让部分 SKU 在「今天 vs 历史」对比中稳定触发评分/费比异常，
// 保证演示环境下问题总览与评分/费比诊断始终有可看的内容
const demoOverrides: Record<string, { dailyFactor?: number; adSpend?: number; adRatio?: number; rating?: number; returnRate?: number }> = {
  sku001: { dailyFactor: 1, returnRate: 3 },              // 退货率上升侵蚀利润：3% → 8%
  sku011: { dailyFactor: 1, adSpend: 25, adRatio: 32 },   // 广告加投推高费比：32% → 46.52%
  sku017: { dailyFactor: 1, rating: 5.0, returnRate: 0 }, // 评分重度下滑：5.0 → 4.3
};

// Generate a small history (last 30 days) so trend charts have data
export function buildMockHistory(today: string): DailySnapshot[] {
  const base = new Date(today);
  const rows: DailySnapshot[] = [];
  for (let d = 29; d >= 0; d--) {
    const day = new Date(base);
    day.setDate(base.getDate() - d);
    const date = day.toISOString().slice(0, 10);
    const dayFactor = 1 + Math.sin(d / 5) * 0.1;
    for (const s of mockLatestSnapshot) {
      const ov = demoOverrides[s.sku] ?? {};
      const daily = Math.max(0, s.dailySales7d * (ov.dailyFactor ?? (0.85 + Math.random() * 0.3)) * dayFactor);
      const stock = Math.max(0, s.stockOnHand + d * daily * 0.6);
      rows.push({
        date,
        sku: s.sku,
        siteId: "site_demo",
        dailySales7d: Number(daily.toFixed(2)),
        monthlySales: Math.round(daily * 30),
        stockOnHand: Math.round(stock),
        stockInTransit: s.stockInTransit,
        daysOfCoverOnHand: daily > 0 ? Number((stock / daily).toFixed(1)) : 999,
        daysOfCoverWithTransit: daily > 0 ? Number(((stock + s.stockInTransit) / daily).toFixed(1)) : 999,
        adSpend: Number((ov.adSpend ?? s.adSpend * (0.9 + Math.random() * 0.2)).toFixed(2)),
        adRatio: Number((ov.adRatio ?? s.adRatio * (0.9 + Math.random() * 0.2)).toFixed(2)),
        profit: Number((s.profit + (Math.random() - 0.5) * 2).toFixed(2)),
        profitMargin: Number((s.profitMargin + (Math.random() - 0.5) * 4).toFixed(2)),
        totalCost: s.totalCost,
        rating: Math.max(0, Math.min(5, ov.rating ?? s.rating + (Math.random() - 0.5) * 0.1)),
        returnRate: ov.returnRate ?? s.returnRate,
        // 历史期流量/转化：CVR 恒等于基准转化率（今天的偏离即分流案例）
        orders: Number(daily.toFixed(2)),
        sessions: Math.round(daily / ((BASE_CVR[s.sku] ?? 8.5) / 100)),
      });
    }
  }
  return rows;
}