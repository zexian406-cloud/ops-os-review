// =========================================================
// 诊断规则库 — 可配置的归因规则（指标 + 方向 + 阈值 + 原因 + 建议）
// 规则按数组顺序依次检查，命中第一条即作为归因结论；
// 全部未命中则使用该诊断类型的兜底结论（fallback）。
// =========================================================

import type { DailySnapshot, GlobalConfig, InventoryLayer, SkuMaster } from "./types";
import { computeAll } from "./calculator";

export type DiagType = "profit" | "sales" | "rating" | "adRatio";

/** 阈值口径：pp=百分点差 / pct=相对百分比 / abs=绝对值差 */
export type RuleMode = "pp" | "pct" | "abs";
export type RuleDirection = "up" | "down";

export type DiagMetricKey =
  | "grossMargin"
  | "price"
  | "adRatio"
  | "returnRate"
  | "refundRate"
  | "fob"
  | "dailySales7d"
  | "totalStock"
  | "coverDays"
  | "rating"
  | "reviewCount"
  | "adSpend"
  | "sessions"
  | "cvr"
  | "promoActive";

/** 附加条件（例如「库存下降 20% 且覆盖天数 < 14 天」中的后半句）
 *  basis="delta" 比较变化量（可配口径），basis="value" 直接比较本期实际值 */
export interface RuleGuard {
  metric: DiagMetricKey;
  basis: "delta" | "value";
  mode: RuleMode;
  direction: RuleDirection;
  threshold: number;
}

export interface DiagnosisRule {
  id: string;
  enabled: boolean;
  metric: DiagMetricKey;
  mode: RuleMode;
  direction: RuleDirection;
  threshold: number;
  /** 可选附加条件，与主条件同时满足才命中 */
  guard?: RuleGuard | null;
  /** 可选：自定义检查项名称（默认用指标名） */
  label?: string;
  /** 归因结论（自定义原因） */
  reason: string;
  /** 建议动作，可多行 */
  suggestions: string[];
}

export interface DiagnosisRuleGroup {
  rules: DiagnosisRule[];
  /** 全部规则未命中时的兜底结论 */
  fallback: { reason: string; suggestions: string[] };
}

export type DiagnosisRuleSet = Record<DiagType, DiagnosisRuleGroup>;

export interface RuleContext {
  sku: SkuMaster;
  latestSnap: DailySnapshot;
  previousSnap: DailySnapshot;
  latestInv?: InventoryLayer;
  config: GlobalConfig;
  curCalc: ReturnType<typeof computeAll>;
  prevCalc: ReturnType<typeof computeAll>;
}

type MetricKind = "percent" | "money" | "count" | "days" | "rating" | "boolean";

interface MetricDef {
  label: string;
  kind: MetricKind;
  defaultMode: RuleMode;
  /** abs 模式下变化量的单位 */
  deltaUnit: string;
  extract: (ctx: RuleContext) => { before: number; after: number } | null;
}

const cvrOf = (s: DailySnapshot): number | null => {
  const sessions = s.sessions;
  const orders = s.orders;
  if (sessions == null || sessions <= 0 || orders == null) return null;
  return (orders / sessions) * 100;
};

/** 指标注册表：新增指标只需在此处补充一项，规则编辑 UI 自动出现该选项 */
export const METRICS: Record<DiagMetricKey, MetricDef> = {
  grossMargin: {
    label: "毛利率",
    kind: "percent",
    defaultMode: "pp",
    deltaUnit: "pp",
    extract: (c) => ({ before: c.prevCalc.grossMargin, after: c.curCalc.grossMargin }),
  },
  price: {
    label: "售价",
    kind: "money",
    defaultMode: "pct",
    deltaUnit: "%",
    extract: (c) => ({ before: c.sku.discountPrice ?? c.sku.price, after: c.sku.price }),
  },
  adRatio: {
    label: "广告费比",
    kind: "percent",
    defaultMode: "pp",
    deltaUnit: "pp",
    extract: (c) => ({ before: c.previousSnap.adRatio ?? 0, after: c.latestSnap.adRatio ?? 0 }),
  },
  returnRate: {
    label: "退货率",
    kind: "percent",
    defaultMode: "pp",
    deltaUnit: "pp",
    extract: (c) => ({ before: c.previousSnap.returnRate ?? 0, after: c.latestSnap.returnRate ?? 0 }),
  },
  refundRate: {
    label: "退款率",
    kind: "percent",
    defaultMode: "pp",
    deltaUnit: "pp",
    extract: (c) => {
      const before = c.previousSnap.refundRate;
      const after = c.latestSnap.refundRate;
      if (before == null || after == null) return null;
      return { before, after };
    },
  },
  fob: {
    label: "FOB 成本",
    kind: "money",
    defaultMode: "pct",
    deltaUnit: "%",
    // 历史 FOB 无快照，两期同值（与既有实现一致）
    extract: (c) => ({ before: c.sku.costFob ?? 0, after: c.sku.costFob ?? 0 }),
  },
  dailySales7d: {
    label: "日均销量",
    kind: "count",
    defaultMode: "pct",
    deltaUnit: "%",
    extract: (c) => ({ before: c.previousSnap.dailySales7d, after: c.latestSnap.dailySales7d }),
  },
  totalStock: {
    label: "总库存",
    kind: "count",
    defaultMode: "pct",
    deltaUnit: "%",
    extract: (c) => ({ before: c.prevCalc.totalStock, after: c.curCalc.totalStock }),
  },
  coverDays: {
    label: "可售天数",
    kind: "days",
    defaultMode: "abs",
    deltaUnit: "天",
    extract: (c) => {
      const curSales = c.latestSnap.dailySales7d;
      const prevSales = c.previousSnap.dailySales7d;
      return {
        before: prevSales > 0 ? c.prevCalc.totalStock / prevSales : 999,
        after: curSales > 0 ? c.curCalc.totalStock / curSales : 999,
      };
    },
  },
  rating: {
    label: "评分",
    kind: "rating",
    defaultMode: "abs",
    deltaUnit: "分",
    extract: (c) => ({ before: c.previousSnap.rating ?? 0, after: c.latestSnap.rating ?? 0 }),
  },
  reviewCount: {
    label: "评论数",
    kind: "count",
    defaultMode: "abs",
    deltaUnit: "条",
    extract: (c) => ({ before: c.previousSnap.reviewCount ?? 0, after: c.latestSnap.reviewCount ?? 0 }),
  },
  adSpend: {
    label: "广告花费",
    kind: "money",
    defaultMode: "pct",
    deltaUnit: "%",
    extract: (c) => ({ before: c.previousSnap.adSpend ?? 0, after: c.latestSnap.adSpend ?? 0 }),
  },
  sessions: {
    label: "Sessions",
    kind: "count",
    defaultMode: "pct",
    deltaUnit: "%",
    extract: (c) => {
      const before = c.previousSnap.sessions;
      const after = c.latestSnap.sessions;
      if (before == null || after == null) return null;
      return { before, after };
    },
  },
  cvr: {
    label: "CVR",
    kind: "percent",
    defaultMode: "pp",
    deltaUnit: "pp",
    extract: (c) => {
      const before = cvrOf(c.previousSnap);
      const after = cvrOf(c.latestSnap);
      if (before == null || after == null) return null;
      return { before, after };
    },
  },
  promoActive: {
    label: "促销价状态",
    kind: "boolean",
    defaultMode: "abs",
    deltaUnit: "",
    // 状态类指标：before 恒为 0，after 为 1/0，配合 direction=up 使用
    extract: (c) => {
      const onSale = (c.sku.discountPrice ?? 0) > 0 && (c.sku.discountPrice ?? 0) < c.sku.price;
      return { before: 0, after: onSale ? 1 : 0 };
    },
  },
};

export const METRIC_OPTIONS: Array<{ key: DiagMetricKey; label: string }> = (
  Object.keys(METRICS) as DiagMetricKey[]
).map((k) => ({ key: k, label: METRICS[k].label }));

export const MODE_LABELS: Record<RuleMode, string> = {
  pp: "百分点差 (pp)",
  pct: "相对变化 (%)",
  abs: "绝对值差",
};

export const DIAG_TYPE_LABELS: Record<DiagType, string> = {
  profit: "利润下降诊断",
  sales: "销量下降诊断",
  rating: "评分下降诊断",
  adRatio: "费比上升诊断",
};

/** 指标展示格式 */
export function formatMetricValue(metric: DiagMetricKey, v: number): string {
  const def = METRICS[metric];
  if (def.kind === "boolean") return v ? "是" : "否";
  if (def.kind === "percent") return `${v.toFixed(1)}%`;
  if (def.kind === "money") return `$${v.toFixed(2)}`;
  if (def.kind === "days") return `${Math.round(v)} 天`;
  if (def.kind === "rating") return `${v.toFixed(2)} 星`;
  return v.toLocaleString("zh-CN");
}

/** 计算规则口径下的变化量 */
export function ruleDelta(before: number, after: number, mode: RuleMode): number {
  if (mode === "pp" || mode === "abs") return after - before;
  if (before === 0) return 0;
  return ((after - before) / Math.abs(before)) * 100;
}

/** 变化量单位（step 里的 unit 字段） */
export function ruleDeltaUnit(metric: DiagMetricKey, mode: RuleMode): string {
  if (mode === "pp") return "pp";
  if (mode === "pct") return "%";
  return METRICS[metric].deltaUnit;
}

const isHit = (delta: number, direction: RuleDirection, threshold: number): boolean =>
  direction === "up" ? delta > threshold : delta < -Math.abs(threshold);

/** 本期实际值比较（guard basis=value）：down 即 value < 阈值（阈值可正可负） */
const isValueHit = (value: number, direction: RuleDirection, threshold: number): boolean =>
  direction === "up" ? value > threshold : value < threshold;

export interface EvaluatedStep {
  key: string;
  checkName: string;
  before?: string;
  after?: string;
  delta?: number;
  unit?: string;
  hit: boolean;
  note: string;
}

export interface RuleEvaluation {
  steps: EvaluatedStep[];
  hitRule?: DiagnosisRule;
  hitDelta?: number;
  hitBefore?: number;
  hitAfter?: number;
  checkedCount: number;
}

/** 对一组规则做顺序求值：命中第一条即返回；缺失数据的规则会标注跳过 */
export function evaluateRules(rules: DiagnosisRule[], ctx: RuleContext): RuleEvaluation {
  const steps: EvaluatedStep[] = [];
  let checkedCount = 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const def = METRICS[rule.metric];
    if (!def) continue;
    const values = def.extract(ctx);
    if (!values) {
      steps.push({
        key: rule.id,
        checkName: rule.label?.trim() || def.label,
        hit: false,
        note: "数据缺失，跳过",
      });
      continue;
    }
    checkedCount++;
    const delta = ruleDelta(values.before, values.after, rule.mode);
    const unit = ruleDeltaUnit(rule.metric, rule.mode);
    const hit = isHit(delta, rule.direction, rule.threshold);

    let guardPassed = true;
    if (hit && rule.guard) {
      const gDef = METRICS[rule.guard.metric];
      const gValues = gDef?.extract(ctx);
      if (!gValues) guardPassed = false;
      else if (rule.guard.basis === "value") {
        guardPassed = isValueHit(gValues.after, rule.guard.direction, rule.guard.threshold);
      } else {
        const gDelta = ruleDelta(gValues.before, gValues.after, rule.guard.mode);
        guardPassed = isHit(gDelta, rule.guard.direction, rule.guard.threshold);
      }
    }

    const sign = delta > 0 ? "+" : "";
    const thresholdText = rule.guard?.basis === "value" && !guardPassed
      ? `${rule.guard.direction === "up" ? " > " : " < "}${Math.abs(rule.guard.threshold)}`
      : "";
    const deltaText = def.kind === "boolean"
      ? formatMetricValue(rule.metric, values.after)
      : `${sign}${Math.abs(delta).toFixed(1)}${unit}`;
    const note = hit
      ? guardPassed
        ? `${deltaText}，命中`
        : `${deltaText}，但附加条件未满足（${thresholdText}）`
      : `未达阈值（需${rule.direction === "up" ? " > " : " < -"}${Math.abs(rule.threshold)}${unit}）`;

    steps.push({
      key: rule.id,
      checkName: rule.label?.trim() || def.label,
      before: formatMetricValue(rule.metric, values.before),
      after: formatMetricValue(rule.metric, values.after),
      delta,
      unit,
      hit: hit && guardPassed,
      note,
    });

    if (hit && guardPassed) {
      return {
        steps,
        hitRule: rule,
        hitDelta: delta,
        hitBefore: values.before,
        hitAfter: values.after,
        checkedCount,
      };
    }
  }

  return { steps, checkedCount };
}

/* ─────────────────── 默认规则集（等价于重构前的硬编码决策树） ─────────────────── */

const rule = (
  id: string,
  metric: DiagMetricKey,
  direction: RuleDirection,
  threshold: number,
  mode: RuleMode,
  reason: string,
  suggestions: string[],
  guard?: RuleGuard,
  label?: string,
): DiagnosisRule => ({ id, enabled: true, metric, mode, direction, threshold, guard, label, reason, suggestions });

export const DEFAULT_DIAGNOSIS_RULES: DiagnosisRuleSet = {
  profit: {
    rules: [
      rule("profit_price_down", "price", "down", 5, "pct", "降价促销", ["确认促销活动是否正常，计算促销 ROI"], undefined, "售价检查"),
      rule("profit_ad_ratio_up", "adRatio", "up", 10, "pp", "广告成本上涨", [
        "优化广告投放，检查竞品是否加大投放",
        "检查关键词竞价和广告活动结构",
      ], undefined, "ACOS 检查"),
      rule("profit_natural_traffic_down", "adRatio", "up", 20, "pp", "自然流量下降，被迫依赖广告", [
        "检查 Listing 质量和自然排名，排查竞品动作",
        "优化关键词排名和 A+ 内容",
      ], undefined, "广告订单占比检查"),
      rule("profit_return_up", "returnRate", "up", 3, "pp", "退货增加侵蚀利润", [
        "分析退货原因，检查产品质量和 Listing 描述",
        "查看退货报告，定位高频退货原因",
      ], undefined, "退货率检查"),
      rule("profit_fob_up", "fob", "up", 5, "pct", "采购成本上涨", [
        "与供应商协商价格或寻找替代货源",
        "评估是否需要调整售价以维持利润",
      ], undefined, "FOB 检查"),
    ],
    fallback: {
      reason: "多因素综合影响",
      suggestions: ["逐一排查以上因素", "检查是否有一次性成本（如库存调整、退货处理）影响本期利润"],
    },
  },
  sales: {
    rules: [
      rule("sales_stockout", "totalStock", "down", 20, "pct", "库存不足导致断货损失", [
        "紧急补货，考虑空运",
        "检查在途批次 ETA，必要时加急",
      ], { metric: "coverDays", basis: "value", mode: "abs", direction: "down", threshold: 14 }, "库存检查"),
      rule("sales_rating_down", "rating", "down", 0.3, "abs", "差评影响转化率", [
        "分析差评原因，优化产品质量或 Listing",
        "联系买家处理差评，检查是否有恶意差评",
      ], undefined, "评分检查"),
      rule("sales_ad_spend_down", "adSpend", "down", 30, "pct", "广告投放减少导致曝光下降", [
        "检查广告活动是否正常，是否被竞品挤占",
        "评估是否需要恢复广告预算，关注核心关键词",
      ], undefined, "广告花费检查"),
      rule("sales_ad_ratio_up", "adRatio", "up", 20, "pp", "自然排名下降", [
        "检查关键词排名和 Listing 质量",
        "排查竞品是否抢占自然位",
      ], undefined, "广告占比检查"),
      rule("sales_price_up", "price", "up", 5, "pct", "提价抑制需求", [
        "评估提价对销量的影响，考虑回调",
        "测试不同价格点的销量弹性",
      ], undefined, "售价检查"),
    ],
    fallback: {
      reason: "多因素综合影响",
      suggestions: ["逐一排查以上因素", "检查是否有季节性因素或市场整体波动"],
    },
  },
  rating: {
    rules: [
      rule("rating_return_up", "returnRate", "up", 3, "pp", "产品质量问题引发差评", [
        "优先排查退货原因（质量/尺寸/描述不符），处理在途库存",
        "针对差评逐条回复并推动移除违规评价",
      ], undefined, "退货率检查"),
      rule("rating_new_bad_review", "reviewCount", "up", 0, "abs", "新差评拉低评分", [
        "查看最新差评内容，定位产品或物流问题",
        "增加索评触达，稀释差评权重",
      ], { metric: "rating", basis: "delta", mode: "abs", direction: "down", threshold: 0.2 }, "新增评论检查"),
      rule("rating_heavy_drop", "rating", "down", 0.5, "abs", "评分重度下滑（多个差评）", [
        "立即排查近 30 天评价与退货记录，评估是否下架整改",
      ], undefined, "降幅分级"),
      rule("rating_light_drop", "rating", "down", 0.2, "abs", "评分轻度波动", [
        "持续观察评分走势，跟进近期评价内容",
      ], undefined, "降幅分级"),
    ],
    fallback: {
      reason: "评分稳定",
      suggestions: ["保持现有品控与索评节奏"],
    },
  },
  adRatio: {
    rules: [
      rule("ad_ratio_sales_down", "dailySales7d", "down", 20, "pct", "转化下降，广告占比被动升高", [
        "排查 Listing 排名与竞品动作，检查主图/价格/评论变化",
        "暂停低效广告组，避免无效花费放大",
      ], { metric: "adRatio", basis: "delta", mode: "pp", direction: "up", threshold: 5 }, "销量检查"),
      rule("ad_ratio_spend_up", "adSpend", "up", 20, "pct", "广告加投推高费比", [
        "评估加投的广告活动 ROI，收紧低产出广告位竞价",
      ], { metric: "dailySales7d", basis: "delta", mode: "pct", direction: "up", threshold: -10 }, "广告花费检查"),
      rule("ad_ratio_promo", "promoActive", "up", 0, "abs", "促销期费比正常升高", [
        "促销属预期行为，结束后费比会自然回落",
      ], { metric: "adRatio", basis: "delta", mode: "pp", direction: "up", threshold: 5 }, "促销检查"),
    ],
    fallback: {
      reason: "费比波动正常",
      suggestions: ["保持现有投放策略"],
    },
  },
};

export const DEFAULT_RULE_SET: DiagnosisRuleSet = JSON.parse(JSON.stringify(DEFAULT_DIAGNOSIS_RULES));

/** 深拷贝默认规则（编辑前使用，避免误改常量） */
export const cloneDefaultRules = (): DiagnosisRuleSet => JSON.parse(JSON.stringify(DEFAULT_DIAGNOSIS_RULES));

const isMetricKey = (v: unknown): v is DiagMetricKey => typeof v === "string" && v in METRICS;
const isMode = (v: unknown): v is RuleMode => v === "pp" || v === "pct" || v === "abs";
const isDirection = (v: unknown): v is RuleDirection => v === "up" || v === "down";

const sanitizeRule = (raw: unknown): DiagnosisRule | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<DiagnosisRule>;
  if (!isMetricKey(r.metric) || !isMode(r.mode) || !isDirection(r.direction)) return null;
  const threshold = Number(r.threshold);
  if (!Number.isFinite(threshold)) return null;
  const suggestions = Array.isArray(r.suggestions)
    ? r.suggestions.map((s) => String(s)).filter((s) => s.trim() !== "")
    : [];
  return {
    id: String(r.id || `rule_${Math.random().toString(36).slice(2, 8)}`),
    enabled: r.enabled !== false,
    metric: r.metric,
    mode: r.mode,
    direction: r.direction,
    threshold,
    label: typeof r.label === "string" ? r.label : undefined,
    guard: r.guard && isMetricKey(r.guard.metric) && isMode(r.guard.mode) && isDirection(r.guard.direction) && Number.isFinite(Number(r.guard.threshold))
      ? {
          metric: r.guard.metric,
          basis: r.guard.basis === "value" ? "value" : "delta",
          mode: r.guard.mode,
          direction: r.guard.direction,
          threshold: Number(r.guard.threshold),
        }
      : null,
    reason: String(r.reason ?? "").trim() || "未命名原因",
    suggestions,
  };
};

/**
 * 清洗外部存储的规则集：非法规则丢弃；缺失/损坏的诊断类型回退到默认规则。
 * 用户主动清空规则数组是合法配置（全部走 fallback），不会被默认规则覆盖。
 */
export function normalizeRuleSet(raw: unknown): DiagnosisRuleSet {
  const src = raw as Partial<Record<DiagType, unknown>> | null | undefined;
  const out = {} as DiagnosisRuleSet;
  for (const type of Object.keys(DEFAULT_DIAGNOSIS_RULES) as DiagType[]) {
    const group = src?.[type] as Partial<DiagnosisRuleGroup> | undefined;
    if (!group || !Array.isArray(group.rules)) {
      out[type] = JSON.parse(JSON.stringify(DEFAULT_DIAGNOSIS_RULES[type]));
      continue;
    }
    const rules = group.rules.map(sanitizeRule).filter((r): r is DiagnosisRule => !!r);
    const fallbackSrc = group.fallback as Partial<DiagnosisRuleGroup["fallback"]> | undefined;
    out[type] = {
      rules,
      fallback: {
        reason: String(fallbackSrc?.reason ?? "").trim() || DEFAULT_DIAGNOSIS_RULES[type].fallback.reason,
        suggestions: Array.isArray(fallbackSrc?.suggestions)
          ? fallbackSrc!.suggestions!.map((s) => String(s)).filter((s) => s.trim() !== "")
          : [...DEFAULT_DIAGNOSIS_RULES[type].fallback.suggestions],
      },
    };
  }
  return out;
}

/** 构造规则求值上下文（computeAll 只算一次） */
export function buildRuleContext(input: {
  sku: SkuMaster;
  latestSnap: DailySnapshot;
  previousSnap: DailySnapshot;
  latestInv?: InventoryLayer;
  config: GlobalConfig;
}): RuleContext {
  const { sku, latestSnap, previousSnap, latestInv, config } = input;
  const calcArgs = {
    sku,
    inv: latestInv,
    defaultLeadTime: config.defaultLeadTime,
    defaultSafetyStockDays: config.defaultSafetyStockDays,
  };
  return {
    sku,
    latestSnap,
    previousSnap,
    latestInv,
    config,
    curCalc: computeAll({ ...calcArgs, snap: latestSnap }),
    prevCalc: computeAll({ ...calcArgs, snap: previousSnap }),
  };
}
