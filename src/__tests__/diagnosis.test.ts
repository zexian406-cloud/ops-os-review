import { describe, it, expect } from "vitest";
import { computeDiagnosis } from "@/domain/diagnosis";
import { makeSku, makeSnap } from "./fixtures";

describe("异常诊断引擎", () => {
  it("利润异常：factors 含 售价/广告/成本/毛利 拆解，summary 非空", () => {
    const sku = makeSku({ sku: "DG-PROFIT", costFob: 18 });
    const latest = makeSnap({ sku: "DG-PROFIT", profitMargin: 10, adRatio: 20 });
    const previous = makeSnap({ sku: "DG-PROFIT", profitMargin: 20, adRatio: 10 });
    const result = computeDiagnosis({
      type: "profit",
      sku,
      latestSnap: latest,
      previousSnap: previous,
    });
    const keys = result.factors.map((f) => f.key);
    expect(keys).toContain("margin");
    expect(keys).toContain("price");
    expect(keys).toContain("ad");
    expect(keys).toContain("return");
    expect(keys).toContain("residual");
    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("广告异常：factors 含 ACOS / TACOS 相关因子", () => {
    const sku = makeSku({ sku: "DG-AD", costAd: 8 });
    const latest = makeSnap({
      sku: "DG-AD",
      adRatio: 40,
      adSpend: 80,
      dailySales7d: 10,
    });
    const previous = makeSnap({
      sku: "DG-AD",
      adRatio: 20,
      adSpend: 40,
      dailySales7d: 10,
    });
    const result = computeDiagnosis({
      type: "ad",
      sku,
      latestSnap: latest,
      previousSnap: previous,
    });
    const keys = result.factors.map((f) => f.key);
    expect(keys).toContain("acos");
    expect(keys).toContain("tacos");
    expect(result.summary).toBeTruthy();
  });

  it("库存异常：factors 含 可售天数 等条目，summary 非空", () => {
    const sku = makeSku({ sku: "DG-STOCK", leadTimeDays: 40 });
    const latest = makeSnap({
      sku: "DG-STOCK",
      stockOnHand: 0,
      dailySales7d: 10,
    });
    const result = computeDiagnosis({
      type: "low_stock",
      sku,
      latestSnap: latest,
    });
    const keys = result.factors.map((f) => f.key);
    expect(keys).toContain("cover");
    expect(result.summary).toContain("断货");
  });

  it("评分异常：factors 含 评分 条目，summary 非空", () => {
    const sku = makeSku({ sku: "DG-RATE" });
    const latest = makeSnap({ sku: "DG-RATE", rating: 3.5 });
    const previous = makeSnap({ sku: "DG-RATE", rating: 4.5 });
    const result = computeDiagnosis({
      type: "rating",
      sku,
      latestSnap: latest,
      previousSnap: previous,
    });
    const keys = result.factors.map((f) => f.key);
    expect(keys).toContain("rating");
    expect(result.summary).toContain("降至");
  });
});
