import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIAGNOSIS_RULES,
  evaluateRules,
  buildRuleContext,
  normalizeRuleSet,
  ruleDelta,
  formatMetricValue,
  type DiagnosisRule,
  type DiagnosisRuleSet,
} from "./diagnosisRules";
import { diagnoseProfitDecline, diagnoseSalesDecline } from "./diagnose";
import { DEFAULT_GLOBAL_CONFIG } from "./db";
import type { DailySnapshot, SkuMaster } from "./types";
const sku: SkuMaster = {
  sku: "BFRS258",
  name: "BF卡式炉",
  store: "-",
  price: 39.99,
  saleStatus: "active",
  fulfillment: "FBM",
  costFob: 28.5,
};

const snap = (over: Partial<DailySnapshot> = {}): DailySnapshot => ({
  sku: "BFRS258",
  date: "2026-11-01",
  dailySales7d: 24,
  dailySales30d: 102,
  monthlySales: 102,
  stockOnHand: 186,
  stockInTransit: 80,
  daysOfCoverOnHand: 54,
  daysOfCoverWithTransit: 87,
  adSpend: 45.6,
  adRatio: 12,
  profit: 96,
  profitMargin: 20,
  totalCost: 380,
  rating: 4.2,
  returnRate: 3.2,
  ...over,
});

const input = (latest: Partial<DailySnapshot>, previous: Partial<DailySnapshot>) => ({
  sku,
  latestSnap: snap({ date: "2026-11-01", ...latest }),
  previousSnap: snap({ date: "2026-10-25", ...previous }),
  config: DEFAULT_GLOBAL_CONFIG,
});

describe("ruleDelta · 三种阈值口径", () => {
  it("pp 直接相减、pct 相对变化、abs 绝对差", () => {
    expect(ruleDelta(3.2, 8, "pp")).toBeCloseTo(4.8, 6);
    expect(ruleDelta(100, 80, "pct")).toBeCloseTo(-20, 6);
    expect(ruleDelta(4.5, 4.2, "abs")).toBeCloseTo(-0.3, 6);
  });

  it("pct 基数 0 时不产生 Infinity/NaN", () => {
    expect(ruleDelta(0, 10, "pct")).toBe(0);
  });
});

describe("evaluateRules · 基础语义", () => {
  // 退货率 3.0% → 8.2%（+5.2pp），用于验证阈值匹配
  const ctx = buildRuleContext(input({ returnRate: 8.2 }, { returnRate: 3.0 }));

  it("按顺序匹配，命中第一条即停止", () => {
    const rules: DiagnosisRule[] = [
      { id: "a", enabled: true, metric: "returnRate", direction: "up", threshold: 2, mode: "pp", reason: "A", suggestions: [] },
      { id: "b", enabled: true, metric: "returnRate", direction: "up", threshold: 10, mode: "pp", reason: "B", suggestions: [] },
    ];
    const ev = evaluateRules(rules, ctx);
    expect(ev.hitRule?.id).toBe("a");
    expect(ev.steps).toHaveLength(1);
  });

  it("禁用规则被跳过，不参与匹配", () => {
    const rules: DiagnosisRule[] = [
      { id: "off", enabled: false, metric: "returnRate", direction: "up", threshold: 1, mode: "pp", reason: "OFF", suggestions: [] },
      { id: "on", enabled: true, metric: "returnRate", direction: "up", threshold: 4, mode: "pp", reason: "ON", suggestions: [] },
    ];
    const ev = evaluateRules(rules, ctx);
    expect(ev.steps).toHaveLength(1);
    expect(ev.hitRule?.id).toBe("on");
  });

  it("未达阈值时记录对比值但不命中", () => {
    const rules: DiagnosisRule[] = [
      { id: "x", enabled: true, metric: "returnRate", direction: "up", threshold: 10, mode: "pp", reason: "X", suggestions: [] },
    ];
    const ev = evaluateRules(rules, ctx);
    expect(ev.hitRule).toBeUndefined();
    expect(ev.steps[0].hit).toBe(false);
    expect(ev.steps[0].before).toBe("3.0%");
    expect(ev.steps[0].after).toBe("8.2%");
    expect(ev.steps[0].note).toContain("未达阈值");
  });

  it("数据缺失的指标标「跳过」，不阻断后续规则", () => {
    const rules: DiagnosisRule[] = [
      { id: "miss", enabled: true, metric: "sessions", direction: "down", threshold: 20, mode: "pct", reason: "MISS", suggestions: [] },
    ];
    const ctxNoSessions = buildRuleContext(input({ sessions: undefined }, { sessions: undefined }));
    const ev = evaluateRules(rules, ctxNoSessions);
    expect(ev.steps[0].note).toBe("数据缺失，跳过");
    expect(ev.steps[0].hit).toBe(false);
    expect(ev.checkedCount).toBe(0);
  });
});

describe("evaluateRules · 附加条件（guard）", () => {
  it("value 口径：库存跌 20% 但覆盖天数仍 >14 天 → 不命中断货规则", () => {
    const rules = DEFAULT_DIAGNOSIS_RULES.sales.rules.filter((r) => r.id === "sales_stockout");
    const ctx = buildRuleContext(input({}, {}));
    // 两期库存与销量相同 → 库存变化 0%，主条件不满足
    const ev = evaluateRules(rules, ctx);
    expect(ev.hitRule).toBeUndefined();
  });

  it("delta 口径：新增评论且评分跌 0.2 才命中「新差评」规则", () => {
    const rules = DEFAULT_DIAGNOSIS_RULES.rating.rules.filter((r) => r.id === "rating_new_bad_review");
    const hitCtx = buildRuleContext(input({ reviewCount: 160, rating: 4.0 }, { reviewCount: 156, rating: 4.3 }));
    expect(evaluateRules(rules, hitCtx).hitRule?.id).toBe("rating_new_bad_review");

    // 评论增加但评分未跌 → 主条件满足、附加条件失败
    const flatCtx = buildRuleContext(input({ reviewCount: 160, rating: 4.3 }, { reviewCount: 156, rating: 4.3 }));
    const ev = evaluateRules(rules, flatCtx);
    expect(ev.hitRule).toBeUndefined();
    expect(ev.steps[0].note).toContain("附加条件未满足");
  });
});

describe("诊断集成 · 自定义规则生效", () => {
  it("默认规则：退货率 +5pp 命中「退货增加侵蚀利润」", () => {
    const out = diagnoseProfitDecline(input({ returnRate: 8.2 }, { returnRate: 3.0 }));
    expect(out.hasHistory).toBe(true);
    expect(out.reason).toBe("退货增加侵蚀利润");
    expect(out.suggestions.length).toBeGreaterThan(0);
    const hit = out.steps.find((s) => s.hit);
    expect(hit?.checkName).toBe("退货率检查");
  });

  it("自定义优先级：新规则置顶后改用自定义原因与建议", () => {
    const custom: DiagnosisRuleSet = JSON.parse(JSON.stringify(DEFAULT_DIAGNOSIS_RULES));
    custom.profit.rules.unshift({
      id: "custom_return_spike",
      enabled: true,
      metric: "returnRate",
      direction: "up",
      threshold: 2,
      mode: "pp",
      guard: null,
      label: "退货激增检查",
      reason: "退货激增导致利润下滑",
      suggestions: ["优先排查退货原因并联系供应商"],
    });
    const out = diagnoseProfitDecline(input({ returnRate: 8.2 }, { returnRate: 3.0 }), custom);
    expect(out.reason).toBe("退货激增导致利润下滑");
    expect(out.suggestions[0]).toBe("优先排查退货原因并联系供应商");
    expect(out.steps[0].checkName).toBe("退货激增检查");
    // 默认规则阈值 3pp 时原本命中的「退货增加侵蚀利润」被自定义规则抢先
    expect(out.reason).not.toBe("退货增加侵蚀利润");
  });

  it("自定义规则不命中时继续走默认规则", () => {
    const custom: DiagnosisRuleSet = JSON.parse(JSON.stringify(DEFAULT_DIAGNOSIS_RULES));
    custom.profit.rules.unshift({
      id: "custom_return_strict",
      enabled: true,
      metric: "returnRate",
      direction: "up",
      threshold: 10,
      mode: "pp",
      guard: null,
      reason: "退货翻倍级恶化",
      suggestions: [],
    });
    const out = diagnoseProfitDecline(input({ returnRate: 8.2 }, { returnRate: 3.0 }), custom);
    expect(out.reason).toBe("退货增加侵蚀利润");
  });

  it("兜底结论：空规则集直接使用自定义 fallback", () => {
    const custom: DiagnosisRuleSet = JSON.parse(JSON.stringify(DEFAULT_DIAGNOSIS_RULES));
    custom.sales.rules = [];
    custom.sales.fallback = { reason: "我这边的兜底原因", suggestions: ["兜底动作"] };
    const out = diagnoseSalesDecline(input({ dailySales7d: 18 }, { dailySales7d: 24 }), custom);
    expect(out.reason).toBe("我这边的兜底原因");
    expect(out.suggestions).toContain("兜底动作");
    expect(out.evidence[0]).toContain("已检查 0 项指标");
  });

  it("销量诊断仍保留 Listing 分流结论", () => {
    const out = diagnoseSalesDecline(
      input(
        { dailySales7d: 12, sessions: 400, orders: 24 },
        { dailySales7d: 24, sessions: 1200, orders: 72 },
      ),
    );
    expect(out.listing?.verdict).toBe("visibility");
  });
});

describe("normalizeRuleSet · 脏配置清洗", () => {
  it("非法指标/方向/阈值被丢弃，合法规则保留", () => {
    const raw = {
      profit: {
        rules: [
          { id: "ok", enabled: true, metric: "adRatio", direction: "up", threshold: 10, mode: "pp", reason: "R", suggestions: ["S"] },
          { id: "bad_metric", metric: "unknown", direction: "up", threshold: 1, mode: "pp", reason: "X", suggestions: [] },
          { id: "bad_threshold", metric: "adRatio", direction: "up", threshold: "abc", mode: "pp", reason: "X", suggestions: [] },
        ],
        fallback: { reason: "F", suggestions: ["FS"] },
      },
    };
    const out = normalizeRuleSet(raw);
    expect(out.profit.rules.map((r) => r.id)).toEqual(["ok"]);
    expect(out.profit.fallback.reason).toBe("F");
    // 其余类型缺失 → 回退默认
    expect(out.sales.rules.length).toBe(DEFAULT_DIAGNOSIS_RULES.sales.rules.length);
  });

  it("空规则数组是合法配置（全部走 fallback），不会被默认覆盖", () => {
    const raw = { profit: { rules: [], fallback: { reason: "空", suggestions: [] } } };
    const out = normalizeRuleSet(raw);
    expect(out.profit.rules).toHaveLength(0);
    expect(out.profit.fallback.reason).toBe("空");
  });

  it("guard 缺 basis 时默认 delta", () => {
    const out = normalizeRuleSet({
      profit: {
        rules: [{
          id: "g", metric: "dailySales7d", direction: "down", threshold: 20, mode: "pct", reason: "R", suggestions: [],
          guard: { metric: "adRatio", mode: "pp", direction: "up", threshold: 5 },
        }],
        fallback: { reason: "F", suggestions: [] },
      },
    });
    expect(out.profit.rules[0].guard?.basis).toBe("delta");
  });
});

describe("formatMetricValue · 指标展示", () => {
  it("按指标类型格式化", () => {
    expect(formatMetricValue("adRatio", 46.46)).toBe("46.5%");
    expect(formatMetricValue("price", 39.99)).toBe("$39.99");
    expect(formatMetricValue("rating", 4.2)).toBe("4.20 星");
    expect(formatMetricValue("coverDays", 13.6)).toBe("14 天");
    expect(formatMetricValue("promoActive", 1)).toBe("是");
  });
});
