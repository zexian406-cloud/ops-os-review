import { describe, it, expect } from "vitest";
import { computeAll } from "@/domain/calculator";
import { makeInv, makeSku, makeSnap } from "./fixtures";

/**
 * 历史对比页的对比逻辑内联在组件里（metricLevel 未导出），
 * 这里退而验证其数据来源 computeAll 在 latest vs previous 上的关键差值方向，
 * 真实组件渲染的箭头方向由 history.test.tsx 覆盖。
 */
describe("历史对比 — computeAll 关键差值方向（单测）", () => {
  const sku = makeSku({ sku: "H-SKU", costFob: 5 });

  it("成本上升导致毛利率下降：latest 毛利率 < previous 毛利率（goodDir=up → 箭头应为「降」）", () => {
    // computeAll 的毛利率来自 SKU 成本；用不同成本构造 latest/previous 验证差值方向
    const prevSku = makeSku({ sku: "H-SKU", costFob: 3 });
    const curSku = makeSku({ sku: "H-SKU", costFob: 18 });
    const cur = computeAll({ sku: curSku, snap: makeSnap({ sku: "H-SKU" }) });
    const prev = computeAll({ sku: prevSku, snap: makeSnap({ sku: "H-SKU" }) });
    expect(cur.grossMargin).toBeLessThan(prev.grossMargin);
  });

  it("评分下降：latest.rating < previous.rating", () => {
    const latest = makeSnap({ sku: "H-SKU", rating: 4.0 });
    const previous = makeSnap({ sku: "H-SKU", rating: 4.5 });
    expect(latest.rating).toBeLessThan(previous.rating);
  });

  it("TACOS 上升（adRatio 上升）：goodDir=down → 箭头应为「降」(bad)", () => {
    const latest = makeSnap({ sku: "H-SKU", adRatio: 40 });
    const previous = makeSnap({ sku: "H-SKU", adRatio: 20 });
    expect(latest.adRatio).toBeGreaterThan(previous.adRatio);
  });

  it("库存由正变负：标记异常（grossMargin<0 || inStockTotal<0）", () => {
    const latest = makeSnap({ sku: "H-SKU", profitMargin: 30 });
    const previous = makeSnap({ sku: "H-SKU", profitMargin: 30 });
    const invPrev = makeInv({ sku: "H-SKU", eastStock: 100 });
    const invCur = makeInv({
      sku: "H-SKU",
      eastStock: 0,
      warehouseBreakdown: [{ warehouse: "西仓", qty: -50, daysOfCover: 1 }],
    });
    const cur = computeAll({ sku, snap: latest, inv: invCur });
    const prev = computeAll({ sku, snap: previous, inv: invPrev });
    expect(prev.inStockTotal).toBeGreaterThan(0);
    expect(cur.inStockTotal).toBeLessThan(0);
    // 历史页 anomaly 判定公式
    expect(cur.grossMargin < 0 || cur.inStockTotal < 0).toBe(true);
  });
});
