// =========================================================
// 异常诊断模块 — 基于「可配置规则库」的根因分析
// 不用 AI，完全基于上次导入 vs 本次导入的快照对比。
// 规则（指标 / 方向 / 阈值 / 原因文案 / 建议动作）可在参数中心维护，
// 未传入自定义规则时使用内置默认规则（等价于原硬编码决策树）。
// =========================================================

import type { DailySnapshot, GlobalConfig, InventoryLayer, ListingVerdict, SkuMaster } from "./types";
import { computeListingVerdict, extractListingInput } from "./listingVerdict";
import {
  buildRuleContext,
  DEFAULT_DIAGNOSIS_RULES,
  evaluateRules,
  type DiagnosisRuleSet,
  type DiagType,
  type RuleContext,
  type RuleEvaluation,
} from "./diagnosisRules";

/** 诊断步骤（规则库每一层检查） */
export interface DiagnosisStep {
  checkName: string;         // 检查项名称
  before: number | string;   // 上次值
  after: number | string;    // 本次值
  delta?: number;            // 变化量
  unit?: string;             // 单位
  hit: boolean;              // 是否命中（触发该原因）
  note?: string;             // 附加说明
}

/** 诊断输出 */
export interface DiagnosisOutput {
  hasHistory: boolean;       // 是否有历史数据可对比
  anomalyType: "profit" | "sales" | "rating" | "adRatio";
  sku: string;
  skuName?: string;
  /** 异常概要，如 "利润率异常：18% → 8%（下降 10pp）" */
  summary: string;
  /** 主要病因 */
  reason: string;
  /** 证据列表（每条一句话） */
  evidence: string[];
  /** 建议动作列表 */
  suggestions: string[];
  /** 诊断过程（规则库每一层检查，含命中/未命中标记） */
  steps: DiagnosisStep[];
  /** Listing 归因分流（仅销量下降诊断注入；数据缺失时 verdict = "insufficient"） */
  listing?: ListingAttribution;
}

/** Listing 归因分流数据（流量端 Sessions vs 转化端 CVR） */
export interface ListingAttribution {
  verdict: ListingVerdict;
  sessionsCurrent?: number;
  sessionsPrevious?: number;
  cvrCurrent?: number;
  cvrPrevious?: number;
}

/** 诊断输入参数 */
export interface DiagnosisInput {
  sku: SkuMaster;
  latestSnap?: DailySnapshot;
  previousSnap?: DailySnapshot;
  latestInv?: InventoryLayer;
  config: GlobalConfig;
}

/* ────────── 工具函数 ────────── */

/** 命中规则 → 证据（取命中的那一步） */
function evidenceFromSteps(steps: DiagnosisStep[]): string[] {
  const hit = steps.find((s) => s.hit);
  if (!hit) return [];
  const deltaNum = typeof hit.delta === "number" ? hit.delta : 0;
  const sign = deltaNum > 0 ? "+" : "";
  return [
    `${hit.checkName}：${hit.before} → ${hit.after}（${sign}${deltaNum.toFixed(1)}${hit.unit ?? ""}）`,
  ];
}

/** 执行规则库：返回步骤、结论与建议 */
function runRules(
  type: DiagType,
  ctx: RuleContext,
  ruleSet?: DiagnosisRuleSet,
): { evaluation: RuleEvaluation; reason: string; evidence: string[]; suggestions: string[] } {
  const group = (ruleSet ?? DEFAULT_DIAGNOSIS_RULES)[type];
  const evaluation = evaluateRules(group.rules, ctx);
  const steps = toSteps(evaluation);

  if (evaluation.hitRule) {
    return {
      evaluation,
      reason: evaluation.hitRule.reason,
      evidence: evidenceFromSteps(steps),
      suggestions: [...evaluation.hitRule.suggestions],
    };
  }
  return {
    evaluation,
    reason: group.fallback.reason,
    evidence: [`已检查 ${evaluation.checkedCount} 项指标，均未命中当前规则`],
    suggestions: [...group.fallback.suggestions],
  };
}

// 避免循环依赖路径过长，直接内联调用（diagnosisRules 已导出）

/* ────────── 利润下降诊断 ────────── */
export function diagnoseProfitDecline(input: DiagnosisInput, ruleSet?: DiagnosisRuleSet): DiagnosisOutput {
  const { sku, latestSnap, previousSnap } = input;
  if (!latestSnap || !previousSnap) return noHistoryResult("profit", sku);

  const ctx = buildRuleContext({ ...input, latestSnap, previousSnap });
  const { reason, evidence, suggestions, evaluation } = runRules("profit", ctx, ruleSet);
  const steps = toSteps(evaluation);
  const curMargin = ctx.curCalc.grossMargin;
  const prevMargin = ctx.prevCalc.grossMargin;
  return buildResult("profit", sku, curMargin, prevMargin, curMargin - prevMargin, reason, evidence, suggestions, steps);
}

/* ────────── 销量下降诊断 ────────── */
export function diagnoseSalesDecline(input: DiagnosisInput, ruleSet?: DiagnosisRuleSet): DiagnosisOutput {
  const { sku, latestSnap, previousSnap } = input;
  if (!latestSnap || !previousSnap) return noHistoryResult("sales", sku);

  const ctx = buildRuleContext({ ...input, latestSnap, previousSnap });
  const { reason, evidence, suggestions, evaluation } = runRules("sales", ctx, ruleSet);
  const steps = toSteps(evaluation);

  const curSales = latestSnap.dailySales7d;
  const prevSales = previousSnap.dailySales7d;
  const delta = curSales - prevSales;

  // Listing 流量/转化分流（与可配置规则互补的专项归因）
  const listingInput = extractListingInput(latestSnap, previousSnap);
  const verdict = computeListingVerdict(
    listingInput.sessionsCurrent,
    listingInput.sessionsPrevious,
    listingInput.cvrCurrent,
    listingInput.cvrPrevious,
  );
  const listing: ListingAttribution = {
    verdict,
    sessionsCurrent: listingInput.sessionsCurrent,
    sessionsPrevious: listingInput.sessionsPrevious,
    cvrCurrent: listingInput.cvrCurrent,
    cvrPrevious: listingInput.cvrPrevious,
  };

  const listingSuggestion: Record<string, string> = {
    visibility: "流量端问题：检查广告投放与关键词排名，确认 Listing 是否被抑制曝光",
    detail_page: "转化端问题：检查主图/价格/评分/退货率，优化详情页转化",
    both: "流量与转化双跌：先排除下架/类目整体下滑，再分别查广告排名与详情页",
  };
  const action = listingSuggestion[verdict];
  const finalSuggestions = action ? [action, ...suggestions] : suggestions;

  const out = buildResult("sales", sku, curSales, prevSales, delta, reason, evidence, finalSuggestions, steps, "日均销量", "件");
  return { ...out, listing };
}

/* ────────── 评分下降诊断 ────────── */
export function diagnoseRatingDecline(input: DiagnosisInput, ruleSet?: DiagnosisRuleSet): DiagnosisOutput {
  const { sku, latestSnap, previousSnap } = input;
  if (!latestSnap || !previousSnap) return noHistoryResult("rating", sku);

  const ctx = buildRuleContext({ ...input, latestSnap, previousSnap });
  const { reason, evidence, suggestions, evaluation } = runRules("rating", ctx, ruleSet);
  const steps = toSteps(evaluation);
  const cur = latestSnap.rating ?? 0;
  const prev = previousSnap.rating ?? 0;
  return buildResult("rating", sku, cur, prev, cur - prev, reason, evidence, suggestions, steps, "评分", "分");
}

/* ────────── 费比上升诊断 ────────── */
export function diagnoseAdRatioRise(input: DiagnosisInput, ruleSet?: DiagnosisRuleSet): DiagnosisOutput {
  const { sku, latestSnap, previousSnap } = input;
  if (!latestSnap || !previousSnap) return noHistoryResult("adRatio", sku);

  const ctx = buildRuleContext({ ...input, latestSnap, previousSnap });
  const { reason, evidence, suggestions, evaluation } = runRules("adRatio", ctx, ruleSet);
  const steps = toSteps(evaluation);
  const cur = latestSnap.adRatio ?? 0;
  const prev = previousSnap.adRatio ?? 0;
  return buildResult("adRatio", sku, cur, prev, cur - prev, reason, evidence, suggestions, steps, "广告费比", "%");
}

/** 规则求值结果 → 诊断步骤（补齐展示字段） */
function toSteps(evaluation: RuleEvaluation): DiagnosisStep[] {
  return evaluation.steps.map((s) => ({
    checkName: s.checkName,
    before: s.before ?? "—",
    after: s.after ?? "—",
    delta: s.delta,
    unit: s.unit,
    hit: s.hit,
    note: s.note,
  }));
}

/* ────────── 结果构造 ────────── */

function buildResult(
  type: "profit" | "sales" | "rating" | "adRatio",
  sku: SkuMaster,
  curValue: number,
  prevValue: number,
  delta: number,
  reason: string,
  evidence: string[],
  suggestions: string[],
  steps: DiagnosisStep[],
  metricLabel = "利润率",
  unit = "%",
): DiagnosisOutput {
  const deltaLabel = type === "profit"
    ? `${delta > 0 ? "上升" : "下降"} ${Math.abs(delta).toFixed(1)}pp`
    : `${delta > 0 ? "上升" : "下降"} ${Math.abs(delta).toFixed(1)} ${unit}`;

  const summary = type === "profit"
    ? `利润率异常：${prevValue.toFixed(1)}% → ${curValue.toFixed(1)}%（${deltaLabel}）`
    : `${metricLabel}异常：${prevValue.toFixed(1)} → ${curValue.toFixed(1)} ${unit}（${deltaLabel}）`;

  return {
    hasHistory: true,
    anomalyType: type,
    sku: sku.sku,
    skuName: sku.name,
    summary,
    reason,
    evidence,
    suggestions,
    steps,
  };
}

function noHistoryResult(type: "profit" | "sales" | "rating" | "adRatio", sku: SkuMaster): DiagnosisOutput {
  const labelMap: Record<typeof type, string> = {
    profit: "利润率诊断",
    sales: "销量诊断",
    rating: "评分下降诊断",
    adRatio: "广告费比诊断",
  };
  return {
    hasHistory: false,
    anomalyType: type,
    sku: sku.sku,
    skuName: sku.name,
    summary: `暂无历史数据，无法进行${labelMap[type]}`,
    reason: "数据不足",
    evidence: [],
    suggestions: ["导入两次以上数据后即可对比诊断"],
    steps: [],
  };
}
