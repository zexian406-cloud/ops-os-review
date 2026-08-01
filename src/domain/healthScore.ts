import type { SkuMaster, DailySnapshot, Alert } from "./types";
import { computeAll } from "./calculator";

/**
 * SKU 健康评分引擎 — 纯函数，基于最新快照 + 上期快照 + 风险告警 派生综合健康分。
 *
 * 设计原则（贴合产品定位）：不引入任何存储 / 服务器，
 * 全部基于 latest / previous 快照 + 统一计算引擎 computeAll 实时派生。
 * 评分仅用于"一眼看出哪些 SKU 最需要关注"，不替代风险引擎的明细。
 */

export type HealthLevel = "健康" | "关注" | "风险";

export interface HealthFactor {
  /** 触发项 key，如 stock_stockout / profit_margin */
  key: string;
  /** 中文标签，用于 UI 展示 */
  label: string;
  /** 扣分量（正数表示被扣的分） */
  impact: number;
}

export interface HealthScore {
  /** 0-100，越高越健康 */
  score: number;
  /** 等级：≥90 健康 / 70-89 关注 / <70 风险 */
  level: HealthLevel;
  /** 命中的扣分因子（按触发顺序） */
  factors: HealthFactor[];
}

/** 根据分数返回健康等级 */
export function getHealthLevel(score: number): HealthLevel {
  if (score >= 90) return "健康";
  if (score >= 70) return "关注";
  return "风险";
}

/**
 * 计算所有 SKU 的健康评分。
 *
 * @param input.skuMaster   SKU 主档列表
 * @param input.latest      最新快照映射（sku -> DailySnapshot）
 * @param input.previous    上期快照映射（sku -> DailySnapshot），无则传空 Map
 * @param input.alertsBySku 按 SKU 分组的告警映射
 * @param input.wowBySku    可选，周环比映射（与 previous 同源，预留扩展）
 * @param input.config      全局参数（提供默认 Lead Time / 安全库存）
 */
export function computeHealthScores(input: {
  skuMaster: SkuMaster[];
  latest: Map<string, DailySnapshot>;
  previous: Map<string, DailySnapshot>;
  alertsBySku: Map<string, Alert[]>;
  wowBySku?: Map<string, unknown>;
  config?: { defaultLeadTime?: number; defaultSafetyStockDays?: number };
}): Map<string, HealthScore> {
  const { skuMaster, latest, previous, alertsBySku, config } = input;
  const defaultLeadTime = config?.defaultLeadTime ?? 40;
  const defaultSafetyStockDays = config?.defaultSafetyStockDays ?? 30;

  const result = new Map<string, HealthScore>();

  for (const sku of skuMaster) {
    if (sku.saleStatus === "discontinued") continue;
    const snap = latest.get(sku.sku);
    if (!snap) continue;

    const prev = previous.get(sku.sku);
    const calc = computeAll({
      sku,
      snap,
      defaultLeadTime,
      defaultSafetyStockDays,
    });

    const factors: HealthFactor[] = [];
    let score = 100;

    const apply = (key: string, label: string, impact: number) => {
      score -= impact;
      factors.push({ key, label, impact });
    };

    // ── 库存风险 ──
    const alerts = alertsBySku.get(sku.sku) ?? [];
    if (alerts.some((a) => a.type === "stockout")) {
      apply("stock_stockout", "已断货", 40);
    } else if (alerts.some((a) => a.type === "low_stock")) {
      apply("stock_low", "库存紧张", 25);
    }
    if (alerts.some((a) => a.type === "overstock")) {
      apply("stock_overstock", "库存积压", 10);
    }

    // ── 利润风险 ──
    if (calc.grossMargin < 10) {
      apply("profit_margin", "利润率 < 10%", 20);
    }
    if (
      prev &&
      prev.profitMargin != null &&
      snap.profitMargin < prev.profitMargin
    ) {
      apply("profit_margin_drop", "利润率环比下降", 10);
    }
    if (calc.grossProfit < 2) {
      apply("profit_unit", "单件利润 < $2", 10);
    }

    // ── 广告风险 ──
    if (snap.adRatio > 25) {
      apply("ad_tacos", "TACOS > 25%", 15);
    }
    if (calc.adRatio > 30) {
      apply("ad_acos", "ACOS > 30%", 10);
    }

    // ── 产品风险 ──
    if (snap.rating > 0 && snap.rating < 3.8) {
      apply("rating_low", "评分 < 3.8", 20);
    }
    if (prev && prev.rating > 0 && snap.rating < prev.rating) {
      apply("rating_drop", "评分环比下降", 10);
    }
    const returnMetric =
      sku.fulfillment === "FBM"
        ? snap.refundRate ?? 0
        : snap.returnRate ?? 0;
    if (returnMetric > 10) {
      apply("return_high", "退货率 > 10%", 20);
    } else if (returnMetric >= 5) {
      apply("return_mid", "退货率 5-10%", 10);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    result.set(sku.sku, {
      score,
      level: getHealthLevel(score),
      factors,
    });
  }

  return result;
}
