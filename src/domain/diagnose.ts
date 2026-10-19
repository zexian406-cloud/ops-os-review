// =========================================================
// 异常诊断模块 — 基于预设规则的根因分析（决策树）
// 不用 AI，完全基于上次导入 vs 本次导入的快照对比
// =========================================================

import type { DailySnapshot, GlobalConfig, InventoryLayer, SkuMaster } from "./types";
import { computeAll } from "./calculator";

/** 诊断步骤（决策树每一层检查） */
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
  /** 诊断过程（决策树每一层检查，含命中/未命中标记） */
  steps: DiagnosisStep[];
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

const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtUsd = (v: number) => `$${v.toFixed(2)}`;
const fmtNum = (v: number) => v.toLocaleString("zh-CN");

/** 计算变化百分点（pp），用于百分比类指标 */
const ppDelta = (cur: number, prev: number) => cur - prev;

/** 计算相对变化百分比，用于绝对值类指标 */
const relDelta = (cur: number, prev: number) => (prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : 0);

/* ────────── 利润下降诊断 ────────── */
/**
 * 利润下降诊断规则（按顺序检查，找到第一个匹配的原因）：
 * 1. 售价下降 > 5%     → 降价促销
 * 2. ACOS 上涨 > 10pp  → 广告成本上涨
 * 3. 广告订单占比上涨 > 20pp → 自然流量下降
 * 4. 退货率上涨 > 3pp  → 退货增加侵蚀利润
 * 5. FOB 上涨 > 5%     → 采购成本上涨
 * 6. 以上都不命中       → 多因素综合影响
 *
 * 注：当前数据模型中 adRatio 为「广告费比」（ad spend / revenue），
 * 与 ACOS 概念接近（ACOS = ad spend / ad revenue），此处用 adRatio 作为 ACOS 的代理指标。
 * 「广告订单占比」在当前数据中无直接字段，暂用 adRatio 变化作为自然流量变化的代理。
 */
export function diagnoseProfitDecline(input: DiagnosisInput): DiagnosisOutput {
  const { sku, latestSnap, previousSnap, latestInv, config } = input;

  // 无历史数据 → 无法诊断
  if (!latestSnap || !previousSnap) {
    return noHistoryResult("profit", sku);
  }

  const curCalc = computeAll({
    sku, snap: latestSnap, inv: latestInv,
    defaultLeadTime: config.defaultLeadTime,
    defaultSafetyStockDays: config.defaultSafetyStockDays,
  });
  const prevCalc = computeAll({
    sku, snap: previousSnap, inv: latestInv,
    defaultLeadTime: config.defaultLeadTime,
    defaultSafetyStockDays: config.defaultSafetyStockDays,
  });

  const curMargin = curCalc.grossMargin;
  const prevMargin = prevCalc.grossMargin;
  const marginDelta = ppDelta(curMargin, prevMargin);

  const steps: DiagnosisStep[] = [];
  const evidence: string[] = [];
  const suggestions: string[] = [];
  let reason = "";

  // 当前售价 vs 上次售价
  const curPrice = sku.price;
  const prevPrice = previousSnap ? (sku.discountPrice ?? sku.price) : sku.price;
  // 注：历史售价无法从快照中精确获取（快照只存利润率不存售价），
  // 此处用 sku.price 作为当前价，prevPrice 暂用同值（无历史售价字段）
  // 若 sku 有 discountPrice 则视为促销价
  const priceDelta = relDelta(curPrice, prevPrice);

  // ── 检查 1：售价下降 > 5% → 降价促销 ──
  const step1Hit = priceDelta < -5;
  steps.push({
    checkName: "售价检查",
    before: fmtUsd(prevPrice),
    after: fmtUsd(curPrice),
    delta: priceDelta,
    unit: "%",
    hit: step1Hit,
    note: step1Hit ? "降幅 > 5%，命中" : priceDelta === 0 ? "无变化" : "降幅未达阈值",
  });
  if (step1Hit) {
    reason = "降价促销";
    evidence.push(`售价从 ${fmtUsd(prevPrice)} 降至 ${fmtUsd(curPrice)}（降幅 ${Math.abs(priceDelta).toFixed(1)}%）`);
    suggestions.push("确认促销活动是否正常，计算促销 ROI");
    return buildResult("profit", sku, curMargin, prevMargin, marginDelta, reason, evidence, suggestions, steps);
  }

  // ── 检查 2：ACOS 上涨 > 10pp → 广告成本上涨 ──
  // 使用 adRatio 作为 ACOS 代理
  const curAdRatio = latestSnap.adRatio ?? 0;
  const prevAdRatio = previousSnap.adRatio ?? 0;
  const adRatioDelta = ppDelta(curAdRatio, prevAdRatio);
  const step2Hit = adRatioDelta > 10;
  steps.push({
    checkName: "ACOS 检查",
    before: fmtPct(prevAdRatio),
    after: fmtPct(curAdRatio),
    delta: adRatioDelta,
    unit: "pp",
    hit: step2Hit,
    note: step2Hit ? `+${adRatioDelta.toFixed(1)}pp，命中` : "涨幅未达 10pp 阈值",
  });
  if (step2Hit) {
    reason = "广告成本上涨";
    evidence.push(`ACOS（广告费比）从 ${fmtPct(prevAdRatio)} 升至 ${fmtPct(curAdRatio)}（+${adRatioDelta.toFixed(1)}pp）`);
    suggestions.push("优化广告投放，检查竞品是否加大投放");
    suggestions.push("检查关键词竞价和广告活动结构");
    return buildResult("profit", sku, curMargin, prevMargin, marginDelta, reason, evidence, suggestions, steps);
  }

  // ── 检查 3：广告订单占比上涨 > 20pp → 自然流量下降 ──
  // 当前数据无「广告订单占比」字段，用 adRatio 大幅上涨（>20pp）作为自然流量下降的代理
  const step3Hit = adRatioDelta > 20;
  steps.push({
    checkName: "广告订单占比检查",
    before: fmtPct(prevAdRatio),
    after: fmtPct(curAdRatio),
    delta: adRatioDelta,
    unit: "pp",
    hit: step3Hit,
    note: step3Hit ? `+${adRatioDelta.toFixed(1)}pp，命中（用广告费比代理）` : "涨幅未达 20pp 阈值",
  });
  if (step3Hit) {
    reason = "自然流量下降，被迫依赖广告";
    evidence.push(`广告费比从 ${fmtPct(prevAdRatio)} 升至 ${fmtPct(curAdRatio)}（+${adRatioDelta.toFixed(1)}pp）`);
    suggestions.push("检查 Listing 质量和自然排名，排查竞品动作");
    suggestions.push("优化关键词排名和 A+ 内容");
    return buildResult("profit", sku, curMargin, prevMargin, marginDelta, reason, evidence, suggestions, steps);
  }

  // ── 检查 4：退货率上涨 > 3pp → 退货增加侵蚀利润 ──
  const curReturn = latestSnap.returnRate ?? 0;
  const prevReturn = previousSnap.returnRate ?? 0;
  const returnDelta = ppDelta(curReturn, prevReturn);
  const step4Hit = returnDelta > 3;
  steps.push({
    checkName: "退货率检查",
    before: fmtPct(prevReturn),
    after: fmtPct(curReturn),
    delta: returnDelta,
    unit: "pp",
    hit: step4Hit,
    note: step4Hit ? `+${returnDelta.toFixed(1)}pp，命中` : "涨幅未达 3pp 阈值",
  });
  if (step4Hit) {
    reason = "退货增加侵蚀利润";
    evidence.push(`退货率从 ${fmtPct(prevReturn)} 升至 ${fmtPct(curReturn)}（+${returnDelta.toFixed(1)}pp）`);
    suggestions.push("分析退货原因，检查产品质量和 Listing 描述");
    suggestions.push("查看退货报告，定位高频退货原因");
    return buildResult("profit", sku, curMargin, prevMargin, marginDelta, reason, evidence, suggestions, steps);
  }

  // ── 检查 5：FOB 上涨 > 5% → 采购成本上涨 ──
  const curFob = sku.costFob ?? 0;
  const prevFob = previousSnap ? (sku.costFob ?? 0) : curFob; // 历史FOB无快照，暂用同值
  const fobDelta = relDelta(curFob, prevFob);
  const step5Hit = fobDelta > 5;
  steps.push({
    checkName: "FOB 检查",
    before: fmtUsd(prevFob),
    after: fmtUsd(curFob),
    delta: fobDelta,
    unit: "%",
    hit: step5Hit,
    note: step5Hit ? `+${fobDelta.toFixed(1)}%，命中` : "涨幅未达 5% 阈值",
  });
  if (step5Hit) {
    reason = "采购成本上涨";
    evidence.push(`FOB 从 ${fmtUsd(prevFob)} 涨至 ${fmtUsd(curFob)}（+${fobDelta.toFixed(1)}%）`);
    suggestions.push("与供应商协商价格或寻找替代货源");
    suggestions.push("评估是否需要调整售价以维持利润");
    return buildResult("profit", sku, curMargin, prevMargin, marginDelta, reason, evidence, suggestions, steps);
  }

  // ── 兜底：多因素综合影响 ──
  reason = "多因素综合影响";
  const changedMetrics: string[] = [];
  if (Math.abs(priceDelta) > 5) changedMetrics.push(`售价 ${priceDelta > 0 ? "+" : ""}${priceDelta.toFixed(1)}%`);
  if (Math.abs(adRatioDelta) > 5) changedMetrics.push(`广告费比 ${adRatioDelta > 0 ? "+" : ""}${adRatioDelta.toFixed(1)}pp`);
  if (Math.abs(returnDelta) > 1) changedMetrics.push(`退货率 ${returnDelta > 0 ? "+" : ""}${returnDelta.toFixed(1)}pp`);
  if (changedMetrics.length > 0) {
    evidence.push(`变化超过阈值的指标：${changedMetrics.join("、")}`);
  } else {
    evidence.push("各项指标变化均不显著，可能受销量波动或一次性费用影响");
  }
  suggestions.push("逐一排查以上因素");
  suggestions.push("检查是否有一次性成本（如库存调整、退货处理）影响本期利润");

  return buildResult("profit", sku, curMargin, prevMargin, marginDelta, reason, evidence, suggestions, steps);
}

/* ────────── 销量下降诊断 ────────── */
/**
 * 销量下降诊断规则（按顺序检查，找到第一个匹配的原因）：
 * 1. 库存下降 > 20% 且覆盖天数 < 14 天 → 库存不足导致断货损失
 * 2. 评分下降 > 0.3                  → 差评影响转化率
 * 3. 广告花费下降 > 30%               → 广告投放减少导致曝光下降
 * 4. 广告订单占比上涨 > 20pp           → 自然排名下降
 * 5. 售价上涨 > 5%                    → 提价抑制需求
 * 6. 以上都不命中                     → 多因素综合影响
 */
export function diagnoseSalesDecline(input: DiagnosisInput): DiagnosisOutput {
  const { sku, latestSnap, previousSnap, latestInv, config } = input;

  // 无历史数据 → 无法诊断
  if (!latestSnap || !previousSnap) {
    return noHistoryResult("sales", sku);
  }

  const curCalc = computeAll({
    sku, snap: latestSnap, inv: latestInv,
    defaultLeadTime: config.defaultLeadTime,
    defaultSafetyStockDays: config.defaultSafetyStockDays,
  });
  const prevCalc = computeAll({
    sku, snap: previousSnap, inv: latestInv,
    defaultLeadTime: config.defaultLeadTime,
    defaultSafetyStockDays: config.defaultSafetyStockDays,
  });

  const curSales = latestSnap.dailySales7d;
  const prevSales = previousSnap.dailySales7d;
  const salesDelta = curSales - prevSales;
  const salesDeltaPct = relDelta(curSales, prevSales);

  const steps: DiagnosisStep[] = [];
  const evidence: string[] = [];
  const suggestions: string[] = [];
  let reason = "";

  const curStock = curCalc.totalStock;
  const prevStock = prevCalc.totalStock;
  const stockDeltaPct = relDelta(curStock, prevStock);
  const coverDays = curSales > 0 ? curStock / curSales : 999;

  // ── 检查 1：库存下降 > 20% 且覆盖天数 < 14 天 → 库存不足导致断货损失 ──
  const step1Hit = stockDeltaPct < -20 && coverDays < 14;
  steps.push({
    checkName: "库存检查",
    before: fmtNum(prevStock),
    after: fmtNum(curStock),
    delta: stockDeltaPct,
    unit: "%",
    hit: step1Hit,
    note: step1Hit
      ? `库存降幅 ${Math.abs(stockDeltaPct).toFixed(0)}%，覆盖仅 ${coverDays.toFixed(0)} 天，命中`
      : `库存变化 ${stockDeltaPct.toFixed(0)}%，覆盖 ${coverDays.toFixed(0)} 天`,
  });
  if (step1Hit) {
    reason = "库存不足导致断货损失";
    evidence.push(`库存从 ${fmtNum(prevStock)} 降至 ${fmtNum(curStock)}，覆盖仅剩 ${coverDays.toFixed(0)} 天`);
    suggestions.push("紧急补货，考虑空运");
    suggestions.push("检查在途批次 ETA，必要时加急");
    return buildResult("sales", sku, curSales, prevSales, salesDelta, reason, evidence, suggestions, steps, "日均销量", "件/天");
  }

  // ── 检查 2：评分下降 > 0.3 → 差评影响转化率 ──
  const curRating = latestSnap.rating ?? 0;
  const prevRating = previousSnap.rating ?? 0;
  const ratingDelta = curRating - prevRating;
  const step2Hit = ratingDelta < -0.3;
  steps.push({
    checkName: "评分检查",
    before: prevRating.toFixed(2),
    after: curRating.toFixed(2),
    delta: ratingDelta,
    unit: "星",
    hit: step2Hit,
    note: step2Hit ? `下降 ${Math.abs(ratingDelta).toFixed(2)}，命中` : "下降未达 0.3 阈值",
  });
  if (step2Hit) {
    reason = "差评影响转化率";
    evidence.push(`评分从 ${prevRating.toFixed(2)} 降至 ${curRating.toFixed(2)}（下降 ${Math.abs(ratingDelta).toFixed(2)}）`);
    suggestions.push("分析差评原因，优化产品质量或 Listing");
    suggestions.push("联系买家处理差评，检查是否有恶意差评");
    return buildResult("sales", sku, curSales, prevSales, salesDelta, reason, evidence, suggestions, steps, "日均销量", "件/天");
  }

  // ── 检查 3：广告花费下降 > 30% → 广告投放减少导致曝光下降 ──
  const curAdSpend = latestSnap.adSpend ?? 0;
  const prevAdSpend = previousSnap.adSpend ?? 0;
  const adSpendDeltaPct = relDelta(curAdSpend, prevAdSpend);
  const step3Hit = adSpendDeltaPct < -30;
  steps.push({
    checkName: "广告花费检查",
    before: fmtUsd(prevAdSpend),
    after: fmtUsd(curAdSpend),
    delta: adSpendDeltaPct,
    unit: "%",
    hit: step3Hit,
    note: step3Hit ? `降幅 ${Math.abs(adSpendDeltaPct).toFixed(0)}%，命中` : "降幅未达 30% 阈值",
  });
  if (step3Hit) {
    reason = "广告投放减少导致曝光下降";
    evidence.push(`广告花费从 ${fmtUsd(prevAdSpend)} 降至 ${fmtUsd(curAdSpend)}（降幅 ${Math.abs(adSpendDeltaPct).toFixed(0)}%）`);
    suggestions.push("检查广告活动是否正常，是否被竞品挤占");
    suggestions.push("评估是否需要恢复广告预算，关注核心关键词");
    return buildResult("sales", sku, curSales, prevSales, salesDelta, reason, evidence, suggestions, steps, "日均销量", "件/天");
  }

  // ── 检查 4：广告订单占比上涨 > 20pp → 自然排名下降 ──
  // 用 adRatio 变化作为代理
  const curAdRatio = latestSnap.adRatio ?? 0;
  const prevAdRatio = previousSnap.adRatio ?? 0;
  const adRatioDelta = ppDelta(curAdRatio, prevAdRatio);
  const step4Hit = adRatioDelta > 20;
  steps.push({
    checkName: "广告占比检查",
    before: fmtPct(prevAdRatio),
    after: fmtPct(curAdRatio),
    delta: adRatioDelta,
    unit: "pp",
    hit: step4Hit,
    note: step4Hit ? `+${adRatioDelta.toFixed(1)}pp，命中（用广告费比代理）` : "涨幅未达 20pp 阈值",
  });
  if (step4Hit) {
    reason = "自然排名下降";
    evidence.push(`广告占比从 ${fmtPct(prevAdRatio)} 升至 ${fmtPct(curAdRatio)}（+${adRatioDelta.toFixed(1)}pp）`);
    suggestions.push("检查关键词排名和 Listing 质量");
    suggestions.push("排查竞品是否抢占自然位");
    return buildResult("sales", sku, curSales, prevSales, salesDelta, reason, evidence, suggestions, steps, "日均销量", "件/天");
  }

  // ── 检查 5：售价上涨 > 5% → 提价抑制需求 ──
  const curPrice = sku.price;
  const prevPrice = sku.price; // 历史售价无快照，暂用同值
  const priceDelta = relDelta(curPrice, prevPrice);
  const step5Hit = priceDelta > 5;
  steps.push({
    checkName: "售价检查",
    before: fmtUsd(prevPrice),
    after: fmtUsd(curPrice),
    delta: priceDelta,
    unit: "%",
    hit: step5Hit,
    note: step5Hit ? `+${priceDelta.toFixed(1)}%，命中` : "涨幅未达 5% 阈值",
  });
  if (step5Hit) {
    reason = "提价抑制需求";
    evidence.push(`售价从 ${fmtUsd(prevPrice)} 涨至 ${fmtUsd(curPrice)}（+${priceDelta.toFixed(1)}%）`);
    suggestions.push("评估提价对销量的影响，考虑回调");
    suggestions.push("测试不同价格点的销量弹性");
    return buildResult("sales", sku, curSales, prevSales, salesDelta, reason, evidence, suggestions, steps, "日均销量", "件/天");
  }

  // ── 兜底：多因素综合影响 ──
  reason = "多因素综合影响";
  const changedMetrics: string[] = [];
  if (Math.abs(stockDeltaPct) > 20) changedMetrics.push(`库存 ${stockDeltaPct > 0 ? "+" : ""}${stockDeltaPct.toFixed(0)}%`);
  if (Math.abs(ratingDelta) > 0.2) changedMetrics.push(`评分 ${ratingDelta > 0 ? "+" : ""}${ratingDelta.toFixed(2)}`);
  if (Math.abs(adSpendDeltaPct) > 20) changedMetrics.push(`广告花费 ${adSpendDeltaPct > 0 ? "+" : ""}${adSpendDeltaPct.toFixed(0)}%`);
  if (Math.abs(adRatioDelta) > 5) changedMetrics.push(`广告费比 ${adRatioDelta > 0 ? "+" : ""}${adRatioDelta.toFixed(1)}pp`);
  if (changedMetrics.length > 0) {
    evidence.push(`变化超过阈值的指标：${changedMetrics.join("、")}`);
  } else {
    evidence.push("各项指标变化均不显著，可能受季节性或市场波动影响");
  }
  suggestions.push("逐一排查以上因素");
  suggestions.push("检查是否有季节性因素或市场整体波动");

  return buildResult("sales", sku, curSales, prevSales, salesDelta, reason, evidence, suggestions, steps, "日均销量", "件/天");
}

/* ────────── 内部辅助函数 ────────── */

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
    summary: labelMap[type],
    reason: "缺少历史数据",
    evidence: [],
    suggestions: [],
    steps: [],
  };
}

/* ────────── 评分下降诊断 ────────── */
/**
 * 评分下降诊断规则（按顺序检查，找到第一个匹配的原因）：
 * 1. 退货率上涨 > 3pp          → 产品质量问题引发差评
 * 2. 新增评论且评分降幅 ≥ 0.2  → 新差评拉低评分
 * 3. 评分降幅 ≥ 0.5            → 评分重度下滑
 * 4. 评分降幅 0.2 ~ 0.5        → 评分轻度波动
 * 5. 以上都不命中              → 评分稳定
 */
export function diagnoseRatingDecline(input: DiagnosisInput): DiagnosisOutput {
  const { sku, latestSnap, previousSnap } = input;
  if (!latestSnap || !previousSnap) return noHistoryResult("rating", sku);

  const curRating = latestSnap.rating ?? 0;
  const prevRating = previousSnap.rating ?? 0;
  const ratingDelta = curRating - prevRating;

  const steps: DiagnosisStep[] = [];
  const evidence: string[] = [];
  const suggestions: string[] = [];
  let reason = "";

  // ── 检查 1：退货率上涨 > 3pp → 产品质量问题 ──
  const curReturn = latestSnap.returnRate ?? 0;
  const prevReturn = previousSnap.returnRate ?? 0;
  const returnDelta = ppDelta(curReturn, prevReturn);
  const step1Hit = returnDelta > 3;
  steps.push({
    checkName: "退货率检查",
    before: fmtPct(prevReturn),
    after: fmtPct(curReturn),
    delta: returnDelta,
    unit: "pp",
    hit: step1Hit,
    note: step1Hit ? `+${returnDelta.toFixed(1)}pp，命中` : "涨幅未达 3pp 阈值",
  });
  if (step1Hit) {
    reason = "产品质量问题引发差评";
    evidence.push(`评分从 ${prevRating.toFixed(1)} 降至 ${curRating.toFixed(1)}（-${Math.abs(ratingDelta).toFixed(1)} 分）`);
    evidence.push(`退货率从 ${fmtPct(prevReturn)} 升至 ${fmtPct(curReturn)}（+${returnDelta.toFixed(1)}pp）`);
    suggestions.push("优先排查退货原因（质量/尺寸/描述不符），处理在途库存");
    suggestions.push("针对差评逐条回复并推动移除违规评价");
    return buildResult("rating", sku, curRating, prevRating, ratingDelta, reason, evidence, suggestions, steps, "评分", "分");
  }

  // ── 检查 2：新增评论且评分降幅 ≥ 0.2 → 新差评拉低评分 ──
  const curReviews = latestSnap.reviewCount ?? 0;
  const prevReviews = previousSnap.reviewCount ?? 0;
  const newReviews = curReviews - prevReviews;
  const step2Hit = newReviews > 0 && ratingDelta <= -0.2;
  steps.push({
    checkName: "新增评论检查",
    before: fmtNum(prevReviews),
    after: fmtNum(curReviews),
    delta: newReviews,
    unit: "条",
    hit: step2Hit,
    note: prevReviews === 0 ? "无评论数历史数据" : step2Hit ? `新增 ${newReviews} 条，命中` : "无新增或降幅未达阈值",
  });
  if (step2Hit) {
    reason = "新差评拉低评分";
    evidence.push(`评分从 ${prevRating.toFixed(1)} 降至 ${curRating.toFixed(1)}（-${Math.abs(ratingDelta).toFixed(1)} 分）`);
    evidence.push(`评论数从 ${fmtNum(prevReviews)} 增至 ${fmtNum(curReviews)}（新增 ${newReviews} 条）`);
    suggestions.push("查看最新差评内容，定位产品或物流问题");
    suggestions.push("增加索评触达，稀释差评权重");
    return buildResult("rating", sku, curRating, prevRating, ratingDelta, reason, evidence, suggestions, steps, "评分", "分");
  }

  // ── 检查 3/4：按降幅分级 ──
  const step3Hit = ratingDelta <= -0.5;
  steps.push({
    checkName: "降幅分级",
    before: prevRating.toFixed(1),
    after: curRating.toFixed(1),
    delta: ratingDelta,
    unit: "分",
    hit: step3Hit,
    note: step3Hit ? "降幅 ≥ 0.5 分，重度下滑" : ratingDelta <= -0.2 ? "降幅 0.2~0.5 分，轻度波动" : "降幅未达 0.2 分",
  });
  if (ratingDelta <= -0.2) {
    reason = step3Hit ? "评分重度下滑（多个差评）" : "评分轻度波动";
    evidence.push(`评分从 ${prevRating.toFixed(1)} 降至 ${curRating.toFixed(1)}（-${Math.abs(ratingDelta).toFixed(1)} 分）`);
    if (step3Hit) suggestions.push("立即排查近 30 天评价与退货记录，评估是否下架整改");
    else suggestions.push("持续观察评分走势，跟进近期评价内容");
    return buildResult("rating", sku, curRating, prevRating, ratingDelta, reason, evidence, suggestions, steps, "评分", "分");
  }

  // ── 兜底：评分稳定 ──
  steps.push({
    checkName: "结论",
    before: prevRating.toFixed(1),
    after: curRating.toFixed(1),
    delta: ratingDelta,
    unit: "分",
    hit: false,
    note: "评分变化在正常范围内",
  });
  return buildResult("rating", sku, curRating, prevRating, ratingDelta, "评分稳定", evidence.length ? evidence : [`评分 ${prevRating.toFixed(1)} → ${curRating.toFixed(1)}，无异常波动`], ["保持现有品控与索评节奏"], steps, "评分", "分");
}

/* ────────── 广告费比上升诊断 ────────── */
/**
 * 广告费比上升诊断规则（按顺序检查，找到第一个匹配的原因）：
 * 1. 销量降幅 > 20% 且费比上涨        → 转化下降，广告占比被动升高
 * 2. 广告花费涨幅 > 20% 且销量基本持平 → 广告加投推高费比
 * 3. 当前为促销价                      → 促销期费比正常升高
 * 4. 费比涨幅 ≤ 5pp                    → 波动正常
 * 5. 以上都不命中                      → 多因素综合影响
 */
export function diagnoseAdRatioRise(input: DiagnosisInput): DiagnosisOutput {
  const { sku, latestSnap, previousSnap } = input;
  if (!latestSnap || !previousSnap) return noHistoryResult("adRatio", sku);

  const curAdRatio = latestSnap.adRatio ?? 0;
  const prevAdRatio = previousSnap.adRatio ?? 0;
  const adRatioDelta = ppDelta(curAdRatio, prevAdRatio);

  const steps: DiagnosisStep[] = [];
  const evidence: string[] = [];
  const suggestions: string[] = [];
  let reason = "";

  // ── 检查 1：销量降幅 > 20% → 转化下降 ──
  const curSales = latestSnap.dailySales7d ?? 0;
  const prevSales = previousSnap.dailySales7d ?? 0;
  const salesDelta = relDelta(curSales, prevSales);
  const step1Hit = salesDelta < -20 && adRatioDelta > 5;
  steps.push({
    checkName: "销量检查",
    before: fmtNum(prevSales),
    after: fmtNum(curSales),
    delta: salesDelta,
    unit: "%",
    hit: step1Hit,
    note: step1Hit ? `销量降幅 ${Math.abs(salesDelta).toFixed(1)}%，命中` : "销量降幅未达 20% 阈值",
  });
  if (step1Hit) {
    reason = "转化下降，广告占比被动升高";
    evidence.push(`广告费比从 ${fmtPct(prevAdRatio)} 升至 ${fmtPct(curAdRatio)}（+${adRatioDelta.toFixed(1)}pp）`);
    evidence.push(`近 7 天日均销量从 ${fmtNum(prevSales)} 降至 ${fmtNum(curSales)}（${salesDelta.toFixed(1)}%）`);
    suggestions.push("排查 Listing 排名与竞品动作，检查主图/价格/评论变化");
    suggestions.push("暂停低效广告组，避免无效花费放大");
    return buildResult("adRatio", sku, curAdRatio, prevAdRatio, adRatioDelta, reason, evidence, suggestions, steps, "广告费比");
  }

  // ── 检查 2：广告花费涨幅 > 20% 且销量基本持平 ──
  const curAdSpend = latestSnap.adSpend ?? 0;
  const prevAdSpend = previousSnap.adSpend ?? 0;
  const adSpendDelta = relDelta(curAdSpend, prevAdSpend);
  const step2Hit = adSpendDelta > 20 && salesDelta > -10;
  steps.push({
    checkName: "广告花费检查",
    before: fmtUsd(prevAdSpend),
    after: fmtUsd(curAdSpend),
    delta: adSpendDelta,
    unit: "%",
    hit: step2Hit,
    note: step2Hit ? `花费涨幅 ${adSpendDelta.toFixed(1)}%，命中` : "花费涨幅未达 20% 阈值",
  });
  if (step2Hit) {
    reason = "广告加投推高费比";
    evidence.push(`广告费比从 ${fmtPct(prevAdRatio)} 升至 ${fmtPct(curAdRatio)}（+${adRatioDelta.toFixed(1)}pp）`);
    evidence.push(`广告花费从 ${fmtUsd(prevAdSpend)} 升至 ${fmtUsd(curAdSpend)}（+${adSpendDelta.toFixed(1)}%），销量基本持平`);
    suggestions.push("评估加投的广告活动 ROI，收紧低产出广告位竞价");
    return buildResult("adRatio", sku, curAdRatio, prevAdRatio, adRatioDelta, reason, evidence, suggestions, steps, "广告费比");
  }

  // ── 检查 3：促销价 → 费比正常升高 ──
  const onSale = (sku.discountPrice ?? 0) > 0 && (sku.discountPrice ?? 0) < sku.price;
  steps.push({
    checkName: "促销检查",
    before: fmtUsd(sku.price),
    after: onSale ? fmtUsd(sku.discountPrice ?? 0) : fmtUsd(sku.price),
    hit: onSale,
    note: onSale ? "当前为促销价，命中" : "未在促销",
  });
  if (onSale && adRatioDelta > 5) {
    reason = "促销期费比正常升高";
    evidence.push(`广告费比从 ${fmtPct(prevAdRatio)} 升至 ${fmtPct(curAdRatio)}（+${adRatioDelta.toFixed(1)}pp）`);
    evidence.push(`当前为促销价（${fmtUsd(sku.price)} → ${fmtUsd(sku.discountPrice ?? 0)}），销售额基数下降推高费比`);
    suggestions.push("促销属预期行为，结束后费比会自然回落");
    return buildResult("adRatio", sku, curAdRatio, prevAdRatio, adRatioDelta, reason, evidence, suggestions, steps, "广告费比");
  }

  // ── 检查 4/5：按涨幅分级 ──
  const step4Hit = adRatioDelta <= 5;
  steps.push({
    checkName: "涨幅分级",
    before: fmtPct(prevAdRatio),
    after: fmtPct(curAdRatio),
    delta: adRatioDelta,
    unit: "pp",
    hit: step4Hit,
    note: step4Hit ? "涨幅 ≤ 5pp，波动正常" : "涨幅 > 5pp，多因素影响",
  });
  if (step4Hit) {
    return buildResult("adRatio", sku, curAdRatio, prevAdRatio, adRatioDelta, "费比波动正常", evidence.length ? evidence : [`广告费比 ${fmtPct(prevAdRatio)} → ${fmtPct(curAdRatio)}，无异常`], ["保持现有投放策略"], steps, "广告费比");
  }
  reason = "多因素综合影响";
  evidence.push(`广告费比从 ${fmtPct(prevAdRatio)} 升至 ${fmtPct(curAdRatio)}（+${adRatioDelta.toFixed(1)}pp）`);
  suggestions.push("结合销量、花费与促销状态逐项排查");
  return buildResult("adRatio", sku, curAdRatio, prevAdRatio, adRatioDelta, reason, evidence, suggestions, steps, "广告费比");
}
