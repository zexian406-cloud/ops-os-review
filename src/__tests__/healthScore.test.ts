import { describe, it, expect } from "vitest";
import {
  computeHealthScores,
  getHealthLevel,
  type HealthScore,
} from "@/domain/healthScore";
import type { Alert, DailySnapshot, SkuMaster } from "@/domain/types";
import { makeAlert, makeSku, makeSnap } from "./fixtures";

type Case = {
  sku: SkuMaster;
  snap: DailySnapshot;
  alerts?: Alert[];
  previous?: DailySnapshot;
};

function score(c: Case): HealthScore {
  const latest = new Map<string, DailySnapshot>([[c.sku.sku, c.snap]]);
  const previous = c.previous
    ? new Map<string, DailySnapshot>([[c.sku.sku, c.previous]])
    : new Map<string, DailySnapshot>();
  const alertsBySku = new Map<string, Alert[]>();
  if (c.alerts) alertsBySku.set(c.sku.sku, c.alerts);
  const result = computeHealthScores({
    skuMaster: [c.sku],
    latest,
    previous,
    alertsBySku,
  });
  const hs = result.get(c.sku.sku);
  if (!hs) throw new Error(`健康分未生成: ${c.sku.sku}`);
  return hs;
}

describe("getHealthLevel 边界", () => {
  it("95 -> 健康", () => expect(getHealthLevel(95)).toBe("健康"));
  it("75 -> 关注", () => expect(getHealthLevel(75)).toBe("关注"));
  it("60 -> 风险", () => expect(getHealthLevel(60)).toBe("风险"));
});

describe("健康分规则命中", () => {
  it("断货 SKU 含 stock_stockout 且扣 40", () => {
    const hs = score({
      sku: makeSku({ sku: "S-OUT" }),
      snap: makeSnap({ sku: "S-OUT" }),
      alerts: [makeAlert({ sku: "S-OUT", type: "stockout" })],
    });
    expect(hs.factors.some((f) => f.key === "stock_stockout")).toBe(true);
    expect(hs.factors.find((f) => f.key === "stock_stockout")?.impact).toBe(40);
    expect(hs.score).toBe(60);
    expect(hs.level).toBe("风险");
  });

  it("低库存扣 25", () => {
    const hs = score({
      sku: makeSku({ sku: "S-LOW" }),
      snap: makeSnap({ sku: "S-LOW" }),
      alerts: [makeAlert({ sku: "S-LOW", type: "low_stock" })],
    });
    expect(hs.factors.find((f) => f.key === "stock_low")?.impact).toBe(25);
    expect(hs.score).toBe(75);
    expect(hs.level).toBe("关注");
  });

  it("库存积压扣 10", () => {
    const hs = score({
      sku: makeSku({ sku: "S-OVER" }),
      snap: makeSnap({ sku: "S-OVER" }),
      alerts: [makeAlert({ sku: "S-OVER", type: "overstock" })],
    });
    expect(hs.factors.find((f) => f.key === "stock_overstock")?.impact).toBe(10);
    expect(hs.score).toBe(90);
  });

  it("毛利率 < 10% 扣 20，且单件利润 < $2 扣 10", () => {
    // grossProfit = 20 - (18+1+1) = 0 → margin 0% < 10，单件利润 0 < 2
    const hs = score({
      sku: makeSku({ sku: "S-MARGIN", costFob: 18 }),
      snap: makeSnap({ sku: "S-MARGIN" }),
    });
    expect(hs.factors.find((f) => f.key === "profit_margin")?.impact).toBe(20);
    expect(hs.factors.find((f) => f.key === "profit_unit")?.impact).toBe(10);
  });

  it("利润率环比下降扣 10", () => {
    const hs = score({
      sku: makeSku({ sku: "S-MDRO" }),
      snap: makeSnap({ sku: "S-MDRO", profitMargin: 25 }),
      previous: makeSnap({ sku: "S-MDRO", profitMargin: 35 }),
    });
    expect(hs.factors.find((f) => f.key === "profit_margin_drop")?.impact).toBe(10);
    expect(hs.score).toBe(90);
  });

  it("广告费比 TACOS > 25% 扣 15", () => {
    const hs = score({
      sku: makeSku({ sku: "S-ADT" }),
      snap: makeSnap({ sku: "S-ADT", adRatio: 30 }),
    });
    expect(hs.factors.find((f) => f.key === "ad_tacos")?.impact).toBe(15);
    expect(hs.score).toBe(85);
  });

  it("ACOS > 30% 扣 10", () => {
    // costAd=8, price=20 → ACOS = 40% > 30；adRatio 保持 5 避免触发 tacos
    const hs = score({
      sku: makeSku({ sku: "S-ACOS", costAd: 8 }),
      snap: makeSnap({ sku: "S-ACOS", adRatio: 5 }),
    });
    expect(hs.factors.find((f) => f.key === "ad_acos")?.impact).toBe(10);
    expect(hs.factors.some((f) => f.key === "ad_tacos")).toBe(false);
    expect(hs.score).toBe(90);
  });

  it("评分 < 3.8 扣 20", () => {
    const hs = score({
      sku: makeSku({ sku: "S-RATE" }),
      snap: makeSnap({ sku: "S-RATE", rating: 3.5 }),
    });
    expect(hs.factors.find((f) => f.key === "rating_low")?.impact).toBe(20);
    expect(hs.score).toBe(80);
  });

  it("评分环比下降扣 10", () => {
    const hs = score({
      sku: makeSku({ sku: "S-RDROP" }),
      snap: makeSnap({ sku: "S-RDROP", rating: 4.0 }),
      previous: makeSnap({ sku: "S-RDROP", rating: 4.5 }),
    });
    expect(hs.factors.find((f) => f.key === "rating_drop")?.impact).toBe(10);
    expect(hs.factors.some((f) => f.key === "rating_low")).toBe(false);
  });

  it("FBA 退货率 > 10% 扣 20", () => {
    const hs = score({
      sku: makeSku({ sku: "S-RET", fulfillment: "FBA" }),
      snap: makeSnap({ sku: "S-RET", returnRate: 15 }),
    });
    expect(hs.factors.find((f) => f.key === "return_high")?.impact).toBe(20);
    expect(hs.score).toBe(80);
  });

  it("退货率 5-10% 扣 10", () => {
    const hs = score({
      sku: makeSku({ sku: "S-RETM" }),
      snap: makeSnap({ sku: "S-RETM", returnRate: 7 }),
    });
    expect(hs.factors.find((f) => f.key === "return_mid")?.impact).toBe(10);
    expect(hs.score).toBe(90);
  });
});

describe("分数 clamp 与综合场景", () => {
  it("分数被 clamp 在 0-100（多因子叠加不低于 0）", () => {
    const hs = score({
      sku: makeSku({ sku: "S-CLAMP", costFob: 18, costAd: 8 }),
      snap: makeSnap({ sku: "S-CLAMP", rating: 3.5, adRatio: 30, returnRate: 15 }),
      alerts: [
        makeAlert({ sku: "S-CLAMP", type: "stockout" }),
        makeAlert({ sku: "S-CLAMP", type: "overstock" }),
      ],
      previous: makeSnap({ sku: "S-CLAMP", rating: 4.5, profitMargin: 65 }),
    });
    // 叠加 155 分扣分 → 100 - 155 = -55 → clamp 0
    expect(hs.score).toBe(0);
    expect(hs.level).toBe("风险");
    expect(hs.factors.length).toBeGreaterThan(1);
  });

  it("综合：断货 + 毛利<10% + 评分<3.8 → factors 与 score 符合预期", () => {
    const hs = score({
      sku: makeSku({ sku: "S-COMBO", costFob: 18 }),
      snap: makeSnap({ sku: "S-COMBO", rating: 3.5 }),
      alerts: [makeAlert({ sku: "S-COMBO", type: "stockout" })],
    });
    const keys = hs.factors.map((f) => f.key);
    expect(keys).toEqual(["stock_stockout", "profit_margin", "profit_unit", "rating_low"]);
    expect(hs.score).toBe(10);
    expect(hs.level).toBe("风险");
  });

  it("断货与低库存互斥：只扣一个（stockout 优先）", () => {
    const hs = score({
      sku: makeSku({ sku: "S-MUTEX" }),
      snap: makeSnap({ sku: "S-MUTEX" }),
      alerts: [
        makeAlert({ sku: "S-MUTEX", type: "stockout" }),
        makeAlert({ sku: "S-MUTEX", type: "low_stock" }),
      ],
    });
    expect(hs.factors.some((f) => f.key === "stock_stockout")).toBe(true);
    expect(hs.factors.some((f) => f.key === "stock_low")).toBe(false);
    expect(hs.score).toBe(60);
  });
});

describe("停售 SKU 跳过", () => {
  it("discontinued SKU 不计入结果", () => {
    const sku = makeSku({ sku: "S-DISC", saleStatus: "discontinued" });
    const snap = makeSnap({ sku: "S-DISC" });
    const result = computeHealthScores({
      skuMaster: [sku],
      latest: new Map([[sku.sku, snap]]),
      previous: new Map(),
      alertsBySku: new Map([
        [sku.sku, [makeAlert({ sku: "S-DISC", type: "stockout" })]],
      ]),
    });
    expect(result.has("S-DISC")).toBe(false);
  });

  it("无快照的 SKU 不计入结果", () => {
    const sku = makeSku({ sku: "S-NOSNAP" });
    const result = computeHealthScores({
      skuMaster: [sku],
      latest: new Map(),
      previous: new Map(),
      alertsBySku: new Map(),
    });
    expect(result.has("S-NOSNAP")).toBe(false);
  });
});
