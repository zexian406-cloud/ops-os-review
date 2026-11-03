import { describe, expect, it } from "vitest";
import { computeAll } from "./calculator";
import type { DailySnapshot, Promotion, SkuMaster } from "./types";

/** 成本项固定（FOB=5，其余为 0），只让退款损失随口径变化，便于断言 */
const sku = {
  sku: "TSKU-1",
  name: "测试品",
  siteId: "site_us",
  price: 20,
  costFob: 5,
  costShipping: 0,
  costDelivery: 0,
  costStorage: 0,
  costCommission: 0,
  costAd: 0,
  costReturn: 0,
  coupon: 0,
  saleStatus: "active",
  fulfillment: "FBA",
} as unknown as SkuMaster;

const snap = (patch: Partial<DailySnapshot> = {}): DailySnapshot =>
  ({
    date: "2026-11-01",
    sku: "TSKU-1",
    siteId: "site_us",
    dailySales7d: 1,
    monthlySales: 100,
    adRatio: 0,
    rating: 0,
    reviewCount: 0,
    returnRate: 5,
    refundRate: 10,
    sessions: 100,
    orders: 10,
    ...patch,
  }) as unknown as DailySnapshot;

const promo = { discountPrice: 10 } as unknown as Promotion;

describe("computeAll · 退款损失取数口径（退款率 / 退货率）", () => {
  it("默认按退款率：10% × 售价 20 = 2，净利率 65%", () => {
    const r = computeAll({ sku, snap: snap() });
    expect(r.costRefundLoss).toBeCloseTo(2);
    expect(r.totalCost).toBeCloseTo(7);
    expect(r.grossMargin).toBeCloseTo(65);
    expect(r.returnRate).toBe(5); // 退货率展示值不受口径影响
    expect(r.refundRate).toBe(10);
  });

  it("切换按退货率：5% × 售价 20 = 1，净利率 70%，退款率展示值不变", () => {
    const r = computeAll({ sku, snap: snap(), returnBasis: "return" });
    expect(r.costRefundLoss).toBeCloseTo(1);
    expect(r.totalCost).toBeCloseTo(6);
    expect(r.grossMargin).toBeCloseTo(70);
    expect(r.refundRate).toBe(10);
    expect(r.returnRate).toBe(5);
  });

  it("退款率缺失：退款口径损失记 0；退货口径仍可用退货率取数", () => {
    const refund = computeAll({ sku, snap: snap({ refundRate: undefined }) });
    expect(refund.costRefundLoss).toBe(0);
    const ret = computeAll({ sku, snap: snap({ refundRate: undefined }), returnBasis: "return" });
    expect(ret.costRefundLoss).toBeCloseTo(1);
  });

  it("折扣列同步换算：退款损失按折扣价 10 计，口径切换后折扣净利率同步变化", () => {
    // 折扣列佣金无显式值时按 15% × 折扣价估算（1.5），故总成本 = 5 + 1.5 + 退款损失
    const refund = computeAll({ sku, snap: snap(), activePromo: promo });
    expect(refund.discountCostRefundLoss).toBeCloseTo(1);
    expect(refund.discountMargin).toBeCloseTo(25);

    const ret = computeAll({ sku, snap: snap(), activePromo: promo, returnBasis: "return" });
    expect(ret.discountCostRefundLoss).toBeCloseTo(0.5);
    expect(ret.discountMargin).toBeCloseTo(30);
  });

  it("退款费率卡（30 天）始终按退款率统计，不随利润口径切换", () => {
    const r = computeAll({ sku, snap: snap(), returnBasis: "return" });
    expect(r.returnFee30d).toBeCloseTo(20 * 0.1 * 100);
  });
});
