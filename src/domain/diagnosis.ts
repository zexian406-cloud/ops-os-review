import type { AlertType, DailySnapshot, InventoryLayer, SkuMaster } from "./types";
import { computeAll, type CalcResult } from "./calculator";

/**
 * 异常诊断引擎 — 对已被风险引擎发现的异常做"原因拆解"。
 *
 * 设计原则（贴合产品定位）：只做"分析原因"，不引入任何存储 / 服务器，
 * 全部基于 latest / previous 快照 + SkuMaster + 统一计算引擎 computeAll 实时派生。
 *
 * 数据可得性说明：
 *  - DailySnapshot 携带 adRatio / returnRate / adSpend / rating / profitMargin 等，可做环比。
 *  - SkuMaster 的成本（FOB / 头程 / FBA配送 / 佣金 / 仓储 / 退货 / 广告）为"当前值"，
 *    若未重新导入则 latest 与 previous 相同；因此"成本变化 / FBA费用变化"优先展示当前结构占比，
 *    差值作为"售价或成本变化（残余）"给出，并提示结合成本更新表确认。
 */

export type Impact = "up_bad" | "up_good" | "down_bad" | "down_good" | "neutral";

export interface DiagnosisFactor {
  key: string;
  label: string;
  before?: number | string;
  after?: number | string;
  delta?: number;
  unit?: "%" | "$" | "天" | "分" | "";
  impact?: Impact;
  note?: string;
}

export interface DiagnosisResult {
  type: AlertType;
  sku: string;
  skuName?: string;
  title: string;
  summary: string;
  factors: DiagnosisFactor[];
  /** 建议动作（与风险引擎的 suggestion 一致，便于"诊断→处理"闭环） */
  suggestion?: string;
}

const n = (v?: number | null) => (v == null || !Number.isFinite(v) ? 0 : v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ───────── 利润下降诊断 ─────────
function diagnoseProfit(
  sku: SkuMaster,
  cur: DailySnapshot,
  prev: DailySnapshot | undefined,
  calcCur: CalcResult,
): DiagnosisResult {
  const price = sku.price > 0 ? sku.price : 1;
  const marginNow = calcCur.grossMargin;
  const marginPrev = prev ? (() => {
    // 上期毛利率（用上期 adRatio / returnRate 近似反推不可靠，直接用上期 profitMargin 字段）
    return prev.profitMargin || 0;
  })() : undefined;

  const marginDelta = marginPrev != null ? marginNow - marginPrev : undefined;

  // 广告费（每单位）：adRatio% × 售价
  const adFeeNow = (calcCur.adRatio / 100) * price;
  const adFeePrev = prev ? (prev.adRatio / 100) * price : undefined;
  const adDelta = adFeePrev != null ? adFeeNow - adFeePrev : undefined;

  // 退货/退款费（每单位）
  const retFeeNow = calcCur.costReturn;
  const retFeePrev = prev ? (() => {
    const rate = prev.refundRate && prev.refundRate > 0 ? prev.refundRate : prev.returnRate;
    return rate > 0 ? (rate / 100) * price : 0;
  })() : undefined;
  const retDelta = retFeePrev != null ? retFeeNow - retFeePrev : undefined;

  // 残余：售价或成本变化（无法直接从快照分离的毛利变化）
  const observedDelta = (adDelta ?? 0) + (retDelta ?? 0);
  const residualDelta = marginDelta != null ? marginDelta - (observedDelta / price * 100) : undefined;

  const factors: DiagnosisFactor[] = [
    {
      key: "margin",
      label: "毛利率（整体）",
      before: marginPrev != null ? `${r1(marginPrev)}%` : "—",
      after: `${r1(marginNow)}%`,
      delta: marginDelta != null ? r1(marginDelta) : undefined,
      unit: "%",
      impact: marginDelta != null ? (marginDelta < 0 ? "down_bad" : "up_good") : "neutral",
    },
    {
      key: "price",
      label: "售价",
      before: undefined,
      after: `$${r2(price)}`,
      unit: "$",
      impact: "neutral",
      note: "售价变化需结合成本更新表 / 折扣价确认",
    },
    {
      key: "ad",
      label: "广告费（每单位）",
      before: adFeePrev != null ? `$${r2(adFeePrev)}` : "—",
      after: `$${r2(adFeeNow)}`,
      delta: adDelta != null ? r2(adDelta) : undefined,
      unit: "$",
      impact: adDelta != null ? (adDelta > 0 ? "up_bad" : "down_good") : "neutral",
      note: `广告费比 ACOS≈${r1(calcCur.adRatio)}%`,
    },
    {
      key: "return",
      label: "退货/退款费（每单位）",
      before: retFeePrev != null ? `$${r2(retFeePrev)}` : "—",
      after: `$${r2(retFeeNow)}`,
      delta: retDelta != null ? r2(retDelta) : undefined,
      unit: "$",
      impact: retDelta != null ? (retDelta > 0 ? "up_bad" : "down_good") : "neutral",
      note: `${sku.fulfillment === "FBM" ? "退款率" : "退货率"}≈${r1(sku.fulfillment === "FBM" ? (cur.refundRate ?? 0) : (cur.returnRate ?? 0))}%`,
    },
    {
      key: "residual",
      label: "售价 / 成本变化（残余）",
      before: undefined,
      after: residualDelta != null ? `${r1(residualDelta)}%` : "—",
      delta: residualDelta != null ? r1(residualDelta) : undefined,
      unit: "%",
      impact: residualDelta != null ? (residualDelta < 0 ? "down_bad" : "up_good") : "neutral",
      note: "毛利变化中无法由广告/退货解释的剩余部分，多为 FOB / 头程 / FBA 费用或售价变化",
    },
  ];

  const summary =
    marginDelta != null && marginDelta < 0
      ? `毛利率较上期下降 ${r1(Math.abs(marginDelta))} 个百分点，主要由${adDelta != null && adDelta > 0 ? "广告费上升" : ""}${retDelta != null && retDelta > 0 ? "、退货费上升" : ""}${residualDelta != null && residualDelta < 0 ? "、售价/成本变化" : ""}贡献。`
      : `当前毛利率 ${r1(marginNow)}%，处于异常区间，需结合成本结构排查。`;

  return {
    type: "profit",
    sku: sku.sku,
    skuName: sku.name,
    title: "利润下降诊断",
    summary,
    factors,
    suggestion: "检查广告竞价 / 否定词、退货原因，并核对 FOB / 头程 / 佣金是否上涨",
  };
}

// ───────── 广告异常诊断 ─────────
function diagnoseAd(
  sku: SkuMaster,
  cur: DailySnapshot,
  prev: DailySnapshot | undefined,
  calcCur: CalcResult,
): DiagnosisResult {
  const price = sku.price > 0 ? sku.price : 1;
  const acosNow = calcCur.adRatio; // 广告费占售价比，近似 ACOS
  const acosPrev = prev?.adRatio;

  // TACOS = 广告花费 / 总营收；总营收 ≈ 日均销量 × 售价
  const revenue = cur.dailySales7d * price;
  const tacosNow = revenue > 0 ? (cur.adSpend / revenue) * 100 : 0;
  const tacosPrev = prev && prev.dailySales7d > 0 ? (prev.adSpend / (prev.dailySales7d * price)) * 100 : undefined;

  // 广告费占毛利比：adFee / grossProfit，>100% 说明广告吃光利润
  const grossProfit = calcCur.grossProfit > 0 ? calcCur.grossProfit : 0.0001;
  const adToProfit = (calcCur.costAd / grossProfit) * 100;

  const factors: DiagnosisFactor[] = [
    {
      key: "acos",
      label: "ACOS（广告费比，近似）",
      before: acosPrev != null ? `${r1(acosPrev)}%` : "—",
      after: `${r1(acosNow)}%`,
      delta: acosPrev != null ? r1(acosNow - acosPrev) : undefined,
      unit: "%",
      impact: acosPrev != null ? (acosNow > acosPrev ? "up_bad" : "down_good") : "neutral",
      note: "广告花费 / 售价，严格 ACOS 需广告报告",
    },
    {
      key: "tacos",
      label: "TACOS（广告费 / 总营收）",
      before: tacosPrev != null ? `${r1(tacosPrev)}%` : "—",
      after: `${r1(tacosNow)}%`,
      delta: tacosPrev != null ? r1(tacosNow - tacosPrev) : undefined,
      unit: "%",
      impact: tacosPrev != null ? (tacosNow > tacosPrev ? "up_bad" : "down_good") : "neutral",
      note: `日均销量 ${r1(cur.dailySales7d)} × 售价 $${r2(price)}`,
    },
    {
      key: "adspend",
      label: "日广告花费",
      before: prev ? `$${r2(prev.adSpend)}` : "—",
      after: `$${r2(cur.adSpend)}`,
      unit: "$",
      impact: prev ? (cur.adSpend > prev.adSpend ? "up_bad" : "down_good") : "neutral",
    },
    {
      key: "ad_to_profit",
      label: "广告费 / 毛利",
      before: undefined,
      after: `${r1(adToProfit)}%`,
      unit: "%",
      impact: adToProfit > 100 ? "up_bad" : "neutral",
      note: adToProfit > 100 ? "广告费已超过毛利，自然订单在补贴广告" : "广告仍在毛利承受范围内",
    },
    {
      key: "order_mix",
      label: "广告订单占比 / 自然订单",
      before: undefined,
      after: "需补充",
      note: "平台广告报告才有广告/自然订单拆分，当前用 ACOS / TACOS 代理判断广告依赖度",
    },
  ];

  const summary =
    acosPrev != null && acosNow > acosPrev
      ? `广告费比由 ${r1(acosPrev)}% 升至 ${r1(acosNow)}%，TACOS ${r1(tacosNow)}%，广告依赖度上升${adToProfit > 100 ? "且已吃光毛利" : ""}。`
      : `当前广告费比 ${r1(acosNow)}%、TACOS ${r1(tacosNow)}%${adToProfit > 100 ? "，广告费已超过毛利" : ""}，需优化投放结构。`;

  return {
    type: "ad",
    sku: sku.sku,
    skuName: sku.name,
    title: "广告异常诊断",
    summary,
    factors,
    suggestion: "降低高 ACOS 词出价、加否定词、把预算倾斜到自然单占比高的 ASIN",
  };
}

// ───────── 库存风险诊断 ─────────
function diagnoseStock(
  sku: SkuMaster,
  cur: DailySnapshot,
  _prev: DailySnapshot | undefined,
  calcCur: CalcResult,
  inv: InventoryLayer | undefined,
): DiagnosisResult {
  const daily = cur.dailySales7d > 0 ? cur.dailySales7d : 0.0001;
  const inStock = calcCur.inStockTotal;
  const inTransit = calcCur.inTransitTotal;
  const coverOnHand = calcCur.daysOfCoverOnHand;
  const coverWithTransit = calcCur.daysOfCoverWithTransit;
  const leadTime = sku.leadTimeDays ?? 40;
  const safety = sku.safetyStockDays ?? 30;

  const factors: DiagnosisFactor[] = [
    {
      key: "cover",
      label: "可售天数（含在途）",
      before: undefined,
      after: `${r1(coverWithTransit)} 天`,
      unit: "天",
      impact: coverWithTransit < leadTime + safety ? "down_bad" : "neutral",
    },
    {
      key: "onhand",
      label: "在库可售",
      before: undefined,
      after: `${Math.round(inStock)} 件`,
      unit: "",
      impact: "neutral",
      note: `覆盖 ${r1(coverOnHand)} 天`,
    },
    {
      key: "transit",
      label: "在途库存",
      before: undefined,
      after: `${Math.round(inTransit)} 件`,
      unit: "",
      impact: "neutral",
    },
    {
      key: "daily",
      label: "日均销量（近7天）",
      before: undefined,
      after: `${r1(cur.dailySales7d)} 件/天`,
      unit: "",
      impact: "neutral",
    },
    {
      key: "threshold",
      label: "安全阈值（Lead+安全库存）",
      before: undefined,
      after: `${leadTime + safety} 天`,
      unit: "天",
      impact: "neutral",
      note: `Lead Time ${leadTime} + 安全 ${safety}`,
    },
  ];

  let summary: string;
  if (inStock <= 0) summary = "总库存已为 0，存在断货风险，需立即补货。";
  else if (coverWithTransit < safety) summary = `含在途仅 ${r1(coverWithTransit)} 天，已低于安全库存 ${safety} 天，紧急补货。`;
  else if (coverWithTransit < leadTime + safety) summary = `含在途 ${r1(coverWithTransit)} 天 < 补货周期 ${leadTime + safety} 天，需安排发货。`;
  else summary = `库存可售 ${r1(coverWithTransit)} 天，覆盖充足。`;

  return {
    type: "low_stock",
    sku: sku.sku,
    skuName: sku.name,
    title: "库存风险诊断",
    summary,
    factors,
    suggestion: "前往发货决策中心查看建议补货数量与最晚发货日",
  };
}

// ───────── 评分下降诊断 ─────────
function diagnoseRating(
  sku: SkuMaster,
  cur: DailySnapshot,
  prev: DailySnapshot | undefined,
): DiagnosisResult {
  const ratingNow = cur.rating;
  const ratingPrev = prev?.rating;
  const drop = ratingPrev != null ? ratingPrev - ratingNow : undefined;

  const factors: DiagnosisFactor[] = [
    {
      key: "rating",
      label: "评分",
      before: ratingPrev != null ? r2(ratingPrev) : "—",
      after: r2(ratingNow),
      delta: drop != null ? r2(drop) : undefined,
      unit: "分",
      impact: drop != null ? (drop > 0 ? "down_bad" : "up_good") : "neutral",
    },
    {
      key: "reviews",
      label: "Review 数量",
      before: prev?.reviewCount != null ? `${prev.reviewCount}` : "—",
      after: cur.reviewCount != null ? `${cur.reviewCount}` : "—",
      unit: "",
      impact: "neutral",
    },
    {
      key: "health",
      label: "健康线",
      before: undefined,
      after: "3.8 分",
      note: ratingNow < 3.8 ? "已低于健康线，转化将明显受损" : "高于健康线",
      impact: ratingNow < 3.8 ? "down_bad" : "neutral",
    },
  ];

  const summary =
    drop != null && drop > 0
      ? `评分由 ${r2(ratingPrev!)} 降至 ${r2(ratingNow)}（↓${r2(drop)}），需排查近期差评。`
      : `当前评分 ${r2(ratingNow)}${ratingNow < 3.8 ? "，低于健康线 3.8，需紧急处理" : ""}。`;

  return {
    type: "rating",
    sku: sku.sku,
    skuName: sku.name,
    title: "评分下降诊断",
    summary,
    factors,
    suggestion: "定位差评内容（物流 / 描述不符 / 质量），联系买家并尝试移除违规评论",
  };
}

// ───────── 退货异常诊断 ─────────
function diagnoseReturn(
  sku: SkuMaster,
  cur: DailySnapshot,
  prev: DailySnapshot | undefined,
  calcCur: CalcResult,
): DiagnosisResult {
  const price = sku.price > 0 ? sku.price : 1;
  const rateNow = sku.fulfillment === "FBM" ? (cur.refundRate ?? 0) : (cur.returnRate ?? 0);
  const ratePrev = prev ? (sku.fulfillment === "FBM" ? (prev.refundRate ?? 0) : (prev.returnRate ?? 0)) : undefined;
  const fee30 = calcCur.returnFee30d;

  const factors: DiagnosisFactor[] = [
    {
      key: "rate",
      label: sku.fulfillment === "FBM" ? "退款率" : "退货率",
      before: ratePrev != null ? `${r1(ratePrev)}%` : "—",
      after: `${r1(rateNow)}%`,
      delta: ratePrev != null ? r1(rateNow - ratePrev) : undefined,
      unit: "%",
      impact: ratePrev != null ? (rateNow > ratePrev ? "up_bad" : "down_good") : "neutral",
    },
    {
      key: "fee30",
      label: "预估退货费（30天）",
      before: undefined,
      after: `$${r1(fee30)}`,
      unit: "$",
      impact: "neutral",
      note: `按 ${r1(rateNow)}% × 月销 ${cur.monthlySales} × $${r2(price)}`,
    },
    {
      key: "health",
      label: "健康线",
      before: undefined,
      after: `${calcCur ? "5%" : "5%"}`,
      note: rateNow > 10 ? "已超 10%，严重侵蚀利润" : rateNow > 5 ? "高于健康线 5%" : "正常",
      impact: rateNow > 10 ? "up_bad" : rateNow > 5 ? "neutral" : "neutral",
    },
  ];

  const summary =
    ratePrev != null && rateNow > ratePrev
      ? `${sku.fulfillment === "FBM" ? "退款率" : "退货率"}由 ${r1(ratePrev)}% 升至 ${r1(rateNow)}%，近30天预估退货费 $${r1(fee30)}。`
      : `当前${sku.fulfillment === "FBM" ? "退款率" : "退货率"} ${r1(rateNow)}%，预估月退货费 $${r1(fee30)}。`;

  return {
    type: "return",
    sku: sku.sku,
    skuName: sku.name,
    title: "退货异常诊断",
    summary,
    factors,
    suggestion: sku.fulfillment === "FBM" ? "分析退款原因（物流时效 / 描述不符），优化发货与详情页" : "分析退货原因（质量 / 尺寸 / 描述不符）",
  };
}

// ═══════ 总入口 ═══════
export function computeDiagnosis(input: {
  type: AlertType;
  sku: SkuMaster;
  latestSnap: DailySnapshot;
  previousSnap?: DailySnapshot;
  latestInv?: InventoryLayer;
  previousInv?: InventoryLayer;
  defaultLeadTime?: number;
  defaultSafetyStockDays?: number;
}): DiagnosisResult {
  const { type, sku, latestSnap, previousSnap, latestInv, defaultLeadTime = 40, defaultSafetyStockDays = 30 } = input;
  const calcCur = computeAll({ sku, snap: latestSnap, inv: latestInv, defaultLeadTime, defaultSafetyStockDays });

  // 利润 / 广告 / 评分 / 退货 都依赖"变化"维度，但 stock 不需要 previous
  switch (type) {
    case "profit":
      return diagnoseProfit(sku, latestSnap, previousSnap, calcCur);
    case "ad":
      return diagnoseAd(sku, latestSnap, previousSnap, calcCur);
    case "rating":
      return diagnoseRating(sku, latestSnap, previousSnap);
    case "return":
    case "review":
      return diagnoseReturn(sku, latestSnap, previousSnap, calcCur);
    case "stockout":
    case "low_stock":
    case "overstock":
      return diagnoseStock(sku, latestSnap, previousSnap, calcCur, latestInv);
    default:
      return {
        type,
        sku: sku.sku,
        skuName: sku.name,
        title: "异常诊断",
        summary: "该类型暂未提供结构化诊断。",
        factors: [],
      };
  }
}
