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
  anomalyType: "profit" | "sales";
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
  type: "profit" | "sales",
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

function noHistoryResult(type: "profit" | "sales", sku: SkuMaster): DiagnosisOutput {
  return {
    hasHistory: false,
    anomalyType: type,
    sku: sku.sku,
    skuName: sku.name,
    summary: type === "profit" ? "利润率诊断" : "销量诊断",
    reason: "缺少历史数据",
    evidence: [],
    suggestions: [],
    steps: [],
  };
}
