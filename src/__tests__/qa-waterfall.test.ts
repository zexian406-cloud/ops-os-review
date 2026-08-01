// QA 验证 F4：优惠券/瀑布图 加总一致性
// 瀑布图段：售价 - (FOB+头程+尾程+佣金+仓租+广告+退货+促销成本手动) 应等于 单件净利(grossProfit)。
// 修复点：此前瀑布图缺失「促销成本(手动)」段，导致有手动促销成本时加总不等于单件净利。
import { describe, it, expect } from "vitest";
import { computeAll } from "@/domain/calculator";
import { makeSku } from "./fixtures";

describe("F4 优惠券/瀑布图 加总一致性", () => {
  const base = {
    price: 100,
    costFob: 30,
    costShipping: 5,
    costDelivery: 4,
    costCommission: 15,
    costStorage: 2,
    costAd: 10,
    costReturn: 3,
    coupon: 5,
  };

  it("含手动促销成本时：瀑布各段（含促销成本）加总等于单件净利", () => {
    const sku = makeSku({ ...base });
    const calc = computeAll({ sku, promoCost: 7 });
    const segs = [
      calc.costFob,
      calc.costShipping,
      calc.costDelivery,
      calc.costCommission,
      calc.costStorage,
      calc.costAd,
      calc.costReturn,
      calc.costPromo,
    ];
    const sum = segs.reduce((a, b) => a + b, 0);
    // 瀑布：售价 - 各成本段 === 单件净利(grossProfit)
    expect(sku.price - sum).toBeCloseTo(calc.grossProfit, 6);
    // 修复点：手动促销成本段已计入瀑布（此前缺失）
    expect(calc.costPromo).toBe(7);
  });

  it("证明修复必要性：若瀑布【不含】促销成本段，则加总不等于单件净利", () => {
    const sku = makeSku({ ...base });
    const calc = computeAll({ sku, promoCost: 7 });
    const sumWithoutPromo =
      calc.costFob +
      calc.costShipping +
      calc.costDelivery +
      calc.costCommission +
      calc.costStorage +
      calc.costAd +
      calc.costReturn;
    expect(sku.price - sumWithoutPromo).not.toBeCloseTo(calc.grossProfit, 6);
  });

  it("无手动促销成本时：costPromo=0 且加总仍成立", () => {
    const sku = makeSku({ ...base });
    const calc = computeAll({ sku });
    expect(calc.costPromo).toBe(0);
    const sum = [
      calc.costFob,
      calc.costShipping,
      calc.costDelivery,
      calc.costCommission,
      calc.costStorage,
      calc.costAd,
      calc.costReturn,
      calc.costPromo,
    ].reduce((a, b) => a + b, 0);
    expect(sku.price - sum).toBeCloseTo(calc.grossProfit, 6);
  });
});
