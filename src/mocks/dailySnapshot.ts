import type { DailySnapshot } from "@/domain/types";

// Latest snapshot for today (based on 运营表 real values)
export const mockLatestSnapshot: Omit<DailySnapshot, "id" | "date">[] = [
  { sku: "BFB053", dailySales7d: 10.9, monthlySales: 347, stockOnHand: 685, stockInTransit: 376, daysOfCoverOnHand: 63, daysOfCoverWithTransit: 97.6, adSpend: 12.07, adRatio: 46.46, profit: 4.69, profitMargin: 18.06, totalCost: 21.3, rating: 4.5, returnRate: 1.32 },
  { sku: "BFB052", dailySales7d: 3.0, monthlySales: 153, stockOnHand: 520, stockInTransit: 360, daysOfCoverOnHand: 172.8, daysOfCoverWithTransit: 292.4, adSpend: 7.28, adRatio: 30.35, profit: -0.43, profitMargin: -1.79, totalCost: 24.42, rating: 4.5, returnRate: 0 },
  { sku: "BFRS258-GM", dailySales7d: 9.4, monthlySales: 178, stockOnHand: 502, stockInTransit: 245, daysOfCoverOnHand: 53.2, daysOfCoverWithTransit: 79.1, adSpend: 6.42, adRatio: 21.42, profit: -1.87, profitMargin: -6.22, totalCost: 31.86, rating: 4.4, returnRate: 4.55 },
  { sku: "BFSGB07", dailySales7d: 5.9, monthlySales: 147, stockOnHand: 1620, stockInTransit: 0, daysOfCoverOnHand: 269.6, daysOfCoverWithTransit: 269.6, adSpend: 8.71, adRatio: 21.78, profit: 0.71, profitMargin: 1.78, totalCost: 39.28, rating: 4.4, returnRate: 0 },
  { sku: "BFEGT74-Best", dailySales7d: 2.4, monthlySales: 80, stockOnHand: 1242, stockInTransit: 555, daysOfCoverOnHand: 433.2, daysOfCoverWithTransit: 626.8, adSpend: 14.42, adRatio: 8.69, profit: 10.48, profitMargin: 6.32, totalCost: 155.51, rating: 3.9, returnRate: 0 },
  { sku: "BFTSGB08-GM", dailySales7d: 1.9, monthlySales: 58, stockOnHand: 485, stockInTransit: 20, daysOfCoverOnHand: 72.1, daysOfCoverWithTransit: 75.1, adSpend: 18.93, adRatio: 17.86, profit: 14.83, profitMargin: 13.99, totalCost: 91.16, rating: 4.4, returnRate: 0 },
  { sku: "BFEF41-54", dailySales7d: 2.1, monthlySales: 18, stockOnHand: 631, stockInTransit: 69, daysOfCoverOnHand: 55.2, daysOfCoverWithTransit: 61.2, adSpend: 12.63, adRatio: 14.69, profit: 9.44, profitMargin: 10.98, totalCost: 76.54, rating: 5.0, returnRate: 0 },
  { sku: "HK-BFEF41-54", dailySales7d: 9.3, monthlySales: 228, stockOnHand: 631, stockInTransit: 69, daysOfCoverOnHand: 55.2, daysOfCoverWithTransit: 61.2, adSpend: 25.78, adRatio: 29.98, profit: 9.65, profitMargin: 11.22, totalCost: 76.34, rating: 5.0, returnRate: 1.54 },
  { sku: "HK-BFEF41-54-B", dailySales7d: 5.2, monthlySales: 156, stockOnHand: 420, stockInTransit: 50, daysOfCoverOnHand: 80.8, daysOfCoverWithTransit: 90.4, adSpend: 15.0, adRatio: 25.0, profit: 7.39, profitMargin: 8.5, totalCost: 79.60, rating: 4.8, returnRate: 2.1 },
  { sku: "BFEXA72-51-A", dailySales7d: 2.6, monthlySales: 69, stockOnHand: 776, stockInTransit: 30, daysOfCoverOnHand: 270.7, daysOfCoverWithTransit: 281.1, adSpend: 10.82, adRatio: 7.21, profit: -1.74, profitMargin: -1.16, totalCost: 151.73, rating: 4.0, returnRate: 11.11 },
  { sku: "BFGQ72-4", dailySales7d: 2.9, monthlySales: 83, stockOnHand: 112, stockInTransit: 344, daysOfCoverOnHand: 23.0, daysOfCoverWithTransit: 93.7, adSpend: 37.21, adRatio: 46.52, profit: 25.83, profitMargin: 32.29, totalCost: 54.16, rating: 4.2, returnRate: 0 },
  { sku: "BFGF44-10", dailySales7d: 0.4, monthlySales: 12, stockOnHand: 1, stockInTransit: 100, daysOfCoverOnHand: 1.7, daysOfCoverWithTransit: 173.7, adSpend: 40.18, adRatio: 52.87, profit: -53.9, profitMargin: -70.93, totalCost: 129.89, rating: 0, returnRate: 0 },
  { sku: "BFY22-F-12-10-B", dailySales7d: 0.9, monthlySales: 33, stockOnHand: 186, stockInTransit: 90, daysOfCoverOnHand: 214.5, daysOfCoverWithTransit: 318.3, adSpend: 15.6, adRatio: 26.01, profit: -0.04, profitMargin: -0.07, totalCost: 60.03, rating: 5.0, returnRate: 0 },
  { sku: "BFEQT42", dailySales7d: 1.3, monthlySales: 16, stockOnHand: 768, stockInTransit: 20, daysOfCoverOnHand: 178.8, daysOfCoverWithTransit: 183.4, adSpend: 9.37, adRatio: 7.81, profit: -10.71, profitMargin: -8.93, totalCost: 130.7, rating: 4.2, returnRate: 0 },
  { sku: "HK-BFEQT63DGDXJS", dailySales7d: 8.1, monthlySales: 142, stockOnHand: 620, stockInTransit: 80, daysOfCoverOnHand: 68.8, daysOfCoverWithTransit: 77.7, adSpend: 6.39, adRatio: 4.0, profit: 17.77, profitMargin: 11.11, totalCost: 142.22, rating: 4.7, returnRate: 0 },
  { sku: "BFT009-Best", dailySales7d: 2.7, monthlySales: 87, stockOnHand: 397, stockInTransit: 570, daysOfCoverOnHand: 145.7, daysOfCoverWithTransit: 355.0, adSpend: 51.06, adRatio: 17.61, profit: 53.15, profitMargin: 18.33, totalCost: 236.84, rating: 3.4, returnRate: 5.26 },
  { sku: "BFHJL-BL", dailySales7d: 0.7, monthlySales: 31, stockOnHand: 234, stockInTransit: 99, daysOfCoverOnHand: 323.1, daysOfCoverWithTransit: 459.8, adSpend: 4.14, adRatio: 10.36, profit: -4.65, profitMargin: -11.63, totalCost: 44.64, rating: 4.3, returnRate: 0 },
];

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
      const daily = Math.max(0, s.dailySales7d * (0.85 + Math.random() * 0.3) * dayFactor);
      const stock = Math.max(0, s.stockOnHand + d * daily * 0.6);
      rows.push({
        date,
        sku: s.sku,
        dailySales7d: Number(daily.toFixed(2)),
        monthlySales: Math.round(daily * 30),
        stockOnHand: Math.round(stock),
        stockInTransit: s.stockInTransit,
        daysOfCoverOnHand: daily > 0 ? Number((stock / daily).toFixed(1)) : 999,
        daysOfCoverWithTransit: daily > 0 ? Number(((stock + s.stockInTransit) / daily).toFixed(1)) : 999,
        adSpend: Number((s.adSpend * (0.9 + Math.random() * 0.2)).toFixed(2)),
        adRatio: Number((s.adRatio * (0.9 + Math.random() * 0.2)).toFixed(2)),
        profit: Number((s.profit + (Math.random() - 0.5) * 2).toFixed(2)),
        profitMargin: Number((s.profitMargin + (Math.random() - 0.5) * 4).toFixed(2)),
        totalCost: s.totalCost,
        rating: Math.max(0, Math.min(5, s.rating + (Math.random() - 0.5) * 0.1)),
        returnRate: s.returnRate,
      });
    }
  }
  return rows;
}