import type {
  SkuMaster,
  DailySnapshot,
  InventoryLayer,
  ManualPromotion,
  Promotion,
  Alert,
  ShipmentSuggestion,
  Campaign,
  GlobalConfig,
} from "./types";
import { computeAll, computeWarehouseTotals, computeWeeklyPromoCost } from "./calculator";

/**
 * Decision & risk engine.
 * ALL computed values (stock, profit, returnRate, coverDays) route through
 * the unified calculator so every page shows identical numbers.
 */

const uid = () => Math.random().toString(36).slice(2, 10);

export const snapKey = (sku: string, siteId?: string): string =>
  `${sku}__${siteId ?? "site_us"}`;

// -------- Promotion alerts --------
export function computePromotionAlerts(input: {
  promotions: Promotion[];
  today: string;
  daysBeforeStart?: number;
  daysBeforeEnd?: number;
}): Alert[] {
  const {
    promotions,
    today,
    daysBeforeStart = 2,
    daysBeforeEnd = 2,
  } = input;

  const alerts: Alert[] = [];
  const now = new Date(today);

  for (const p of promotions) {
    if (p.status === "ended") continue;

    const start = new Date(p.startDate);
    const end = new Date(p.endDate);

    const daysToStart = Math.ceil(
      (start.getTime() - now.getTime()) / 86400000
    );
    const daysToEnd = Math.ceil(
      (end.getTime() - now.getTime()) / 86400000
    );

    if (p.status === "upcoming" && daysToStart >= 0 && daysToStart <= daysBeforeStart) {
      alerts.push({
        id: uid(),
        date: today,
        sku: p.sku,
        skuName: p.skuName,
        type: "promo_start",
        severity: "info",
        title: `促销即将开始 · ${daysToStart === 0 ? "今天" : `${daysToStart} 天后`}`,
        detail: `${p.skuName ?? p.sku} / ${p.store} — ${p.type}「${p.name}」${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
        suggestion: "提前检查 Listing 状态、库存和广告预算",
        status: "open",
      });
    }

    const activeOrEnding = p.status === "active" || (p.status === "upcoming" && daysToStart <= 0);
    if (activeOrEnding && daysToEnd >= 0 && daysToEnd <= daysBeforeEnd) {
      alerts.push({
        id: uid(),
        date: today,
        sku: p.sku,
        skuName: p.skuName,
        type: "promo_end",
        severity: daysToEnd <= 1 ? "warning" : "info",
        title: `促销即将到期 · ${daysToEnd === 0 ? "今天" : `${daysToEnd} 天后`}`,
        detail: `${p.skuName ?? p.sku} / ${p.store} — ${p.type}「${p.name}」${end.toISOString().slice(0, 10)} 到期`,
        suggestion: "检查促销效果，决定是否续报或调整策略",
        status: "open",
      });
    }
  }

  return alerts;
}

// -------- Week-over-week delta --------
export interface WowDelta {
  sku: string;
  skuName: string;
  dailySalesCurrent: number;
  dailySalesPrev: number;
  dailySalesDelta: number;
  stockCurrent: number;
  stockPrev: number;
  stockDelta: number;
  profitMarginCurrent: number;
  profitMarginPrev: number;
  profitMarginDelta: number;
  adRatioCurrent: number;
  adRatioPrev: number;
  adRatioDelta: number;
  ratingCurrent: number;
  ratingPrev: number;
  ratingDelta: number;
}

export function computeWowDeltas(input: {
  skuMaster: SkuMaster[];
  latestSnapshot: Map<string, DailySnapshot>;
  latestInventory: Map<string, InventoryLayer>;
  previousSnapshot: Map<string, DailySnapshot>;
  config: GlobalConfig;
  defaultCommissionRate?: number;
}): WowDelta[] {
  const { skuMaster, latestSnapshot, latestInventory, previousSnapshot, config, defaultCommissionRate } = input;
  const deltas: WowDelta[] = [];

  for (const sku of skuMaster) {
    const key = snapKey(sku.sku, sku.siteId);
    const cur = latestSnapshot.get(key);
    const prev = previousSnapshot.get(key);
    if (!cur || !prev) continue;

    const inv = latestInventory.get(key);
    const curCalc = computeAll({
      sku, snap: cur, inv,
      defaultLeadTime: config.defaultLeadTime,
      defaultSafetyStockDays: config.defaultSafetyStockDays,
      defaultCommissionRate,
    });
    const prevCalc = computeAll({
      sku, snap: prev, inv,
      defaultLeadTime: config.defaultLeadTime,
      defaultSafetyStockDays: config.defaultSafetyStockDays,
      defaultCommissionRate,
    });

    deltas.push({
      sku: sku.sku,
      skuName: sku.name,
      dailySalesCurrent: cur.dailySales7d,
      dailySalesPrev: prev.dailySales7d,
      dailySalesDelta: cur.dailySales7d - prev.dailySales7d,
      stockCurrent: curCalc.totalStock,
      stockPrev: prevCalc.totalStock,
      stockDelta: curCalc.totalStock - prevCalc.totalStock,
      profitMarginCurrent: curCalc.grossMargin,
      profitMarginPrev: prevCalc.grossMargin,
      profitMarginDelta: curCalc.grossMargin - prevCalc.grossMargin,
      adRatioCurrent: cur.adRatio,
      adRatioPrev: prev.adRatio,
      adRatioDelta: cur.adRatio - prev.adRatio,
      ratingCurrent: cur.rating,
      ratingPrev: prev.rating,
      ratingDelta: cur.rating - prev.rating,
    });
  }

  return deltas;
}

// -------- Risk engine --------
export function computeAlerts(input: {
  skuMaster: SkuMaster[];
  latestSnapshot: Map<string, DailySnapshot>;
  latestInventory: Map<string, InventoryLayer>;
  manualPromotions?: ManualPromotion[];
  previousSnapshot?: Map<string, DailySnapshot>;
  config: GlobalConfig;
  today: string;
  defaultCommissionRate?: number;
}): Alert[] {
  const alerts: Alert[] = [];
  const {
    skuMaster,
    latestSnapshot,
    latestInventory,
    manualPromotions,
    previousSnapshot,
    config,
    today,
    defaultCommissionRate,
  } = input;

  // Build SKU map for promo cost lookup
  const skuMasterMapInternal = new Map<string, SkuMaster>();
  for (const s of skuMaster) skuMasterMapInternal.set(snapKey(s.sku, s.siteId), s);

  for (const sku of skuMaster) {
    if (sku.saleStatus === "discontinued") continue;
    const key = snapKey(sku.sku, sku.siteId);
    const snap = latestSnapshot.get(key);
    if (!snap) continue;

    const prev = previousSnapshot?.get(key);
    const inv = latestInventory.get(key);

    // ── 统一计算引擎 ──
    const calc = computeAll({
      sku, snap, inv,
      defaultLeadTime: config.defaultLeadTime,
      defaultSafetyStockDays: config.defaultSafetyStockDays,
      defaultCommissionRate,
    });

    const safety = sku.safetyStockDays ?? config.defaultSafetyStockDays;
    const leadTime = sku.leadTimeDays ?? config.defaultLeadTime;
    const dailySales = snap.dailySales7d;

    // 1. Stock risk — uses real total stock (4-region sum) from calculator
    if (dailySales > 0) {
      const coverDays = dailySales > 0 ? calc.totalStock / dailySales : 999;

      if (calc.totalStock <= 0) {
        // Out of stock entirely
        alerts.push({
          id: uid(),
          date: today,
          sku: sku.sku,
          skuName: sku.name,
          type: "stockout",
          severity: "critical",
          title: "已断货",
          detail: `${sku.sku} 总库存 0，日销 ${dailySales.toFixed(1)}`,
          suggestion: "立即空运补货并检查跟卖链接",
          status: "open",
        });
      } else if (coverDays < leadTime + safety) {
        // Low stock: cover < leadTime + safety
        alerts.push({
          id: uid(),
          date: today,
          sku: sku.sku,
          skuName: sku.name,
          type: "low_stock",
          severity: coverDays < safety ? "critical" : "warning",
          title: `库存不足 · ${coverDays.toFixed(0)} 天`,
          detail: `可售 ${coverDays.toFixed(0)} 天 < Lead Time ${leadTime} + 安全库存 ${safety}`,
          metric: coverDays,
          suggestion: "前往发货决策中心查看建议数量",
          status: "open",
        });
      } else if (coverDays > config.defaultTargetCoverDays && dailySales < 5) {
        // Overstock: cover > 60 days
        alerts.push({
          id: uid(),
          date: today,
          sku: sku.sku,
          skuName: sku.name,
          type: "overstock",
          severity: "warning",
          title: `库存积压 · ${coverDays.toFixed(0)} 天`,
          detail: `可售 ${coverDays.toFixed(0)} 天，远超 ${config.defaultTargetCoverDays} 天阈值`,
          metric: coverDays,
          suggestion: "考虑降价 / 促销 / 转清货",
          status: "open",
        });
      }
    } else if (calc.totalStock <= 0) {
      // No sales data but zero stock
      alerts.push({
        id: uid(),
        date: today,
        sku: sku.sku,
        skuName: sku.name,
        type: "stockout",
        severity: "critical",
        title: "已断货",
        detail: `${sku.sku} 总库存 0`,
        suggestion: "立即补货",
        status: "open",
      });
    }

    // 2. Profit anomaly — uses calculator's grossMargin
    if (dailySales > 0) {
      if (
        calc.grossMargin < 0 ||
        calc.grossMargin < config.profitMarginThreshold
      ) {
        alerts.push({
          id: uid(),
          date: today,
          sku: sku.sku,
          skuName: sku.name,
          type: "profit",
          severity: calc.grossMargin < 0 ? "critical" : "warning",
          title: `利润异常 · ${calc.grossMargin.toFixed(1)}%`,
          detail: `单件利润 $${calc.grossProfit.toFixed(2)} USD，低于阈值 ${config.profitMarginThreshold}%`,
          metric: calc.grossMargin,
          suggestion: "检查广告 / 佣金 / 头程成本",
          status: "open",
        });
      }
    }

    // 3. Ad anomaly
    if (snap.adRatio > config.adRatioThreshold && dailySales > 0) {
      alerts.push({
        id: uid(),
        date: today,
        sku: sku.sku,
        skuName: sku.name,
        type: "ad",
        severity: snap.adRatio > 70 ? "critical" : "warning",
        title: `广告费比高 · ${snap.adRatio.toFixed(1)}%`,
        detail: `近 30 天费比 ${snap.adRatio.toFixed(1)}% > 阈值 ${config.adRatioThreshold}%`,
        metric: snap.adRatio,
        suggestion: "优化竞价 / 否定关键词 / 检查转化",
        status: "open",
      });
    }

    // 4. Rating drop
    if (prev && snap.rating > 0 && prev.rating > 0) {
      const drop = prev.rating - snap.rating;
      if (drop >= config.ratingDropThreshold) {
        alerts.push({
          id: uid(),
          date: today,
          sku: sku.sku,
          skuName: sku.name,
          type: "rating",
          severity: "warning",
          title: `评分下降 · -${drop.toFixed(1)}`,
          detail: `评分从 ${prev.rating} → ${snap.rating}`,
          metric: snap.rating,
          suggestion: "检查最近差评 & 联系买家",
          status: "open",
        });
      }
    }
    if (snap.rating > 0 && snap.rating < 3.8) {
      alerts.push({
        id: uid(),
        date: today,
        sku: sku.sku,
        skuName: sku.name,
        type: "rating",
        severity: "warning",
        title: `低评分 · ${snap.rating}`,
        detail: `当前评分 ${snap.rating} 低于健康线 3.8`,
        metric: snap.rating,
        suggestion: "紧急处理差评并优化 Listing",
        status: "open",
      });
    }

    // 5. Return rate — uses calculator's returnRate/refundRate for consistency
    const returnMetric = sku.fulfillment === "FBM" ? calc.refundRate : calc.returnRate;
    const returnMetricLabel = sku.fulfillment === "FBM" ? "退款率" : "退货率";
    if (returnMetric > config.returnRateThreshold) {
      alerts.push({
        id: uid(),
        date: today,
        sku: sku.sku,
        skuName: sku.name,
        type: "return",
        severity: returnMetric > 10 ? "critical" : "warning",
        title: `${returnMetricLabel}高 · ${returnMetric.toFixed(1)}%`,
        detail: `近 30 天${returnMetricLabel}超过阈值 ${config.returnRateThreshold}%`,
        metric: returnMetric,
        suggestion: sku.fulfillment === "FBM" ? "分析退款原因（物流 / 描述不符）" : "分析退货原因（质量 / 描述不符）",
        status: "open",
      });
    }

    // 6. Listing todo
    if (sku.aPlus === "todo") {
      alerts.push({
        id: uid(),
        date: today,
        sku: sku.sku,
        skuName: sku.name,
        type: "listing",
        severity: "info",
        title: "A+ 页面未完成",
        detail: `${sku.sku} A+ 页面尚未完成`,
        suggestion: "分配设计任务并完成 A+",
        status: "open",
      });
    }

    // 7. Promo cost alert — 促销成本占售价比例 >10%
    if (manualPromotions && dailySales > 0 && sku.price > 0) {
      const weekPromo = computeWeeklyPromoCost(
        sku.sku,
        today,
        manualPromotions,
        skuMasterMapInternal,
        latestSnapshot,
        sku.siteId,
      );
      if (weekPromo.count > 0 && weekPromo.total > 0) {
        const promoRatio = (weekPromo.total / sku.price) * 100;
        if (promoRatio > 10) {
          alerts.push({
            id: uid(),
            date: today,
            sku: sku.sku,
            skuName: sku.name,
            type: "profit",
            severity: promoRatio > 25 ? "warning" : "info",
            title: `促销投入偏高 · ${promoRatio.toFixed(0)}%`,
            detail: `促销成本 $${weekPromo.total.toFixed(2)} 占售价 ${promoRatio.toFixed(0)}% · ${weekPromo.count} 条促销记录`,
            metric: promoRatio,
            suggestion: "检查促销效果，考虑调整折扣力度或停止低效促销",
            status: "open",
          });
        }
      }
    }
  }

  return alerts;
}

// -------- Shipment engine --------
export function computeShipmentSuggestions(input: {
  skuMaster: SkuMaster[];
  latestSnapshot: Map<string, DailySnapshot>;
  latestInventory: Map<string, InventoryLayer>;
  activeCampaigns: Campaign[];
  config: GlobalConfig;
  today: string;
  salesBasis?: "7d" | "30d";
  defaultCommissionRate?: number;
}): ShipmentSuggestion[] {
  const {
    skuMaster,
    latestSnapshot,
    latestInventory,
    activeCampaigns,
    config,
    today,
    salesBasis = "7d",
    defaultCommissionRate,
  } = input;

  const suggestions: ShipmentSuggestion[] = [];
  const now = new Date(today);

  for (const sku of skuMaster) {
    if (sku.saleStatus === "discontinued") continue;
    const key = snapKey(sku.sku, sku.siteId);
    const snap = latestSnapshot.get(key);
    if (!snap) continue;

    const inv = latestInventory.get(key);

    // Get real total stock from calculator (4-region sum)
    const calc = computeAll({
      sku, snap, inv,
      defaultLeadTime: config.defaultLeadTime,
      defaultSafetyStockDays: config.defaultSafetyStockDays,
      defaultCommissionRate,
    });

    // Choose daily sales basis
    const dailySales = salesBasis === "30d"
      ? (snap.monthlySales > 0 ? snap.monthlySales / 30 : 0)
      : snap.dailySales7d;
    if (dailySales <= 0) continue;

    // Recompute cover days based on real total stock
    const totalStock = calc.totalStock;
    const coverOnHand = dailySales > 0 ? calc.inStockTotal / dailySales : 999;
    const coverWithTransit = dailySales > 0 ? totalStock / dailySales : 999;

    const leadTime = sku.leadTimeDays ?? config.defaultLeadTime;
    const safety = sku.safetyStockDays ?? config.defaultSafetyStockDays;
    let targetDays = config.defaultTargetCoverDays;

    // Apply campaign multiplier
    let multiplier = 1;
    let campaignBoost: string | undefined;
    for (const c of activeCampaigns) {
      if (!c.active) continue;
      if (c.skus && c.skus.length > 0 && !c.skus.includes(sku.sku)) continue;
      if (c.multiplier > multiplier) {
        multiplier = c.multiplier;
        campaignBoost = `${c.name} ×${c.multiplier}`;
      }
    }
    const boostedDaily = dailySales * multiplier;
    if (multiplier > 1) targetDays += 30;

    // Dynamic threshold: trigger when coverage < leadTime + safetyStock (Q3 fix)
    const dynamicThreshold = leadTime + safety;
    const currentCoverWithTransit = coverWithTransit;
    if (currentCoverWithTransit >= dynamicThreshold) continue;

    // Replenish formula: (targetCoverDays + leadTime + safety - coverWithTransit) × daily (Q1 page version, using 综合覆盖)
    const gapDays = targetDays + leadTime + safety - coverWithTransit;
    const suggestQty = Math.ceil(gapDays * boostedDaily);
    if (suggestQty <= 0) continue;

    const daysUntilLatest = Math.max(
      0,
      currentCoverWithTransit - leadTime - safety
    );
    const latestShip = new Date(now);
    latestShip.setDate(now.getDate() + daysUntilLatest);

    let priority: ShipmentSuggestion["priority"] = "normal";
    if (daysUntilLatest <= 3) priority = "urgent";
    else if (daysUntilLatest <= 10) priority = "high";
    else if (daysUntilLatest > 30) priority = "low";

    suggestions.push({
      sku: sku.sku,
      skuName: sku.name,
      image: sku.image,
      currentStock: calc.inStockTotal,
      inTransit: calc.inTransitTotal,
      dailySales: Number(dailySales.toFixed(2)),
      daysOfCoverOnHand: Number(coverOnHand.toFixed(1)),
      daysOfCoverWithTransit: Number(coverWithTransit.toFixed(1)),
      leadTimeDays: leadTime,
      safetyStockDays: safety,
      targetCoverDays: targetDays,
      suggestQty,
      latestShipDate: latestShip.toISOString().slice(0, 10),
      priority,
      reason:
        multiplier > 1
          ? `活动倍率 ${multiplier}×，需备 ${targetDays} 天`
          : `目标 ${targetDays} 天 - 含在途 ${currentCoverWithTransit.toFixed(0)} 天`,
      campaignBoost,
    });
  }

  return suggestions.sort((a, b) => {
    const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
    return rank[a.priority] - rank[b.priority];
  });
}

// -------- Aggregators --------
export function buildSnapshotMap(
  snapshots: DailySnapshot[]
): Map<string, DailySnapshot> {
  const map = new Map<string, DailySnapshot>();
  for (const s of snapshots) {
    const key = snapKey(s.sku, s.siteId);
    const existing = map.get(key);
    if (!existing || existing.date < s.date) {
      // Newer date: replace
      const normalized: DailySnapshot = {
        ...s,
        adRatio: Math.abs(s.adRatio),
      };
      map.set(key, normalized);
    } else if (existing.date === s.date) {
      // Same date: merge (fill gaps in existing with new data)
      const merged: DailySnapshot = {
        ...existing,
        dailySales7d: s.dailySales7d || existing.dailySales7d,
        monthlySales: s.monthlySales || existing.monthlySales,
        adRatio: s.adRatio || existing.adRatio,
        rating: s.rating || existing.rating,
        reviewCount: s.reviewCount ?? existing.reviewCount,
        returnRate: s.returnRate || existing.returnRate,
        refundRate: s.refundRate ?? existing.refundRate,
        adSpend: s.adSpend || existing.adSpend,
        stockOnHand: s.stockOnHand || existing.stockOnHand,
        stockInTransit: s.stockInTransit || existing.stockInTransit,
        profit: s.profit || existing.profit,
        profitMargin: s.profitMargin || existing.profitMargin,
        totalCost: s.totalCost || existing.totalCost,
      };
      map.set(key, merged);
    }
  }
  return map;
}

export function buildInventoryMap(
  layers: InventoryLayer[]
): Map<string, InventoryLayer> {
  const map = new Map<string, InventoryLayer>();
  for (const l of layers) {
    const key = snapKey(l.sku, l.siteId);
    const existing = map.get(key);
    if (!existing || existing.date < l.date) map.set(key, l);
  }
  return map;
}