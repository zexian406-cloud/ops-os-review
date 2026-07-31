import type { SkuMaster, DailySnapshot, InventoryLayer, Promotion, ManualPromotion } from "./types";

// =========================================================
// 自动计算引擎 — 纯函数，14条规则，仅在目标字段为空时触发
// =========================================================

export interface CalcResult {
  // ── 正常列 ──
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  adRatio: number;
  returnRate: number;
  refundRate: number;
  returnFee30d: number;

  // ── 折扣列 ──
  discountTotalCost: number;
  discountProfit: number;
  discountMargin: number;
  discountAdRatio: number;
  discountReturnRate: number;
  discountRefundRate: number;
  discountReturnFee30d: number;

  // ── 估算字段 ──
  discountAdEstimated: number;
  discountReturnFeeEstimated: number;

  // ── 反推标记 ──
  isAdInferred: boolean;
  isReturnInferred: boolean;
  isCommissionInferred: boolean;
  isDiscountAdInferred: boolean;
  isDiscountReturnInferred: boolean;

  // ── 各成本明细 ──
  costFob: number;
  costShipping: number;
  costDelivery: number;
  costCommission: number;
  costStorage: number;
  costAd: number;
  costReturn: number;
  costCoupon: number;
  costPromo: number;
  discountCostFob: number;
  discountCostShipping: number;
  discountCostDelivery: number;
  discountCostCommission: number;
  discountCostStorage: number;
  discountCostAd: number;
  discountCostReturn: number;
  discountCostCoupon: number;
  discountCostPromo: number;

  // ── 仓库汇总 ──
  inStockTotal: number;
  inTransitTotal: number;
  totalStock: number;
  daysOfCoverOnHand: number;
  daysOfCoverWithTransit: number;

  // ── 混卖补货 ──
  fbaReplenish?: ReplenishResult;
  fbmReplenish?: ReplenishResult;
}

export interface ReplenishResult {
  dailySales: number;
  stockOnHand: number;
  stockInTransit: number;
  leadTimeDays: number;
  safetyStockDays: number;
  safetyStock: number;
  suggestQty: number;
  coverDays: number;
}

// ────────── 空值取 0 ──────────
const n = (v?: number | null) => v ?? 0;

// ────────── 规则1：总成本（正常列） ──────────
export function computeTotalCost(
  sku: SkuMaster,
  snap?: DailySnapshot,
  discountPrice?: number,
  promoCost = 0,
): { total: number; detail: CostDetail; inferred: InferredFlags } {
  const price = discountPrice ?? sku.price;

  const fob = n(sku.costFob);
  const shipping = n(sku.costShipping);
  const delivery = n(sku.costDelivery);
  const storage = n(sku.costStorage);
  const coupon = n(sku.coupon);

  // 佣金：有值保留，空则 15% 估算
  let commission = n(sku.costCommission);
  let isCommissionInferred = false;
  if (commission === 0 && price > 0) {
    commission = price * 0.15;
    isCommissionInferred = true;
  }

  // 广告费：有值保留，空则从费比×售价反推
  let ad = n(sku.costAd);
  let isAdInferred = false;
  if (ad === 0 && snap && snap.adRatio > 0 && price > 0) {
    ad = (snap.adRatio / 100) * price;
    isAdInferred = true;
  }

  // 退货费：有值保留，空则从退货率×售价反推
  let ret = n(sku.costReturn);
  let isReturnInferred = false;
  if (ret === 0 && snap && snap.returnRate > 0 && price > 0) {
    ret = (snap.returnRate / 100) * price;
    isReturnInferred = true;
  }

  const total = fob + shipping + delivery + commission + storage + ad + ret + promoCost;

  return {
    total,
    detail: { fob, shipping, delivery, commission, storage, ad, ret, coupon, promoCost },
    inferred: { isAdInferred, isReturnInferred, isCommissionInferred },
  };
}

export interface CostDetail {
  fob: number;
  shipping: number;
  delivery: number;
  commission: number;
  storage: number;
  ad: number;
  ret: number;
  coupon: number;
  promoCost: number;
}

export interface InferredFlags {
  isAdInferred: boolean;
  isReturnInferred: boolean;
  isCommissionInferred: boolean;
}

// ────────── 规则1b：折扣总成本 ──────────
export function computeDiscountTotalCost(
  sku: SkuMaster,
  snap?: DailySnapshot,
  discountPrice?: number,
  normalDetail?: CostDetail,
  promoCost = 0,
): { total: number; detail: CostDetail; inferred: InferredFlags } {
  const dp = discountPrice ?? sku.discountPrice ?? sku.price;
  const nd = normalDetail ?? computeTotalCost(sku, snap, dp, promoCost).detail;

  // 折扣字段为空 → 用正常字段值替代
  const fob = sku.discountFob != null ? n(sku.discountFob) : nd.fob;
  const shipping = sku.discountShipping != null ? n(sku.discountShipping) : nd.shipping;
  const delivery = sku.discountDelivery != null ? n(sku.discountDelivery) : nd.delivery;
  const storage = sku.discountStorage != null ? n(sku.discountStorage) : nd.storage;
  const coupon = sku.discountCoupon != null ? n(sku.discountCoupon) : nd.coupon;

  // 佣金：折扣佣金为空 → 按比例缩放 或 用 15%×折扣价
  let commission: number;
  let isCommissionInferred = false;
  if (sku.discountCommission != null) {
    commission = n(sku.discountCommission);
  } else if (sku.price > 0 && nd.commission > 0 && dp !== sku.price) {
    commission = nd.commission * (dp / sku.price);
    isCommissionInferred = nd.commission === 0 || sku.costCommission == null;
  } else {
    commission = dp * 0.15;
    isCommissionInferred = true;
  }

  // 广告费：折扣广告费为空 → 费比×折扣价 或 按比例缩放
  let ad: number;
  let isAdInferred = false;
  if (sku.discountAd != null) {
    ad = n(sku.discountAd);
  } else if (snap && snap.adRatio > 0) {
    ad = (snap.adRatio / 100) * dp;
    isAdInferred = true;
  } else if (sku.price > 0 && nd.ad > 0 && dp !== sku.price) {
    ad = nd.ad * (dp / sku.price);
    isAdInferred = true;
  } else {
    ad = nd.ad;
  }

  // 退货费：折扣退货费为空 → 退货率×折扣价 或 按比例缩放
  let ret: number;
  let isReturnInferred = false;
  if (sku.discountReturn != null) {
    ret = n(sku.discountReturn);
  } else if (snap && snap.returnRate > 0) {
    ret = (snap.returnRate / 100) * dp;
    isReturnInferred = true;
  } else if (sku.price > 0 && nd.ret > 0 && dp !== sku.price) {
    ret = nd.ret * (dp / sku.price);
    isReturnInferred = true;
  } else {
    ret = nd.ret;
  }

  const total = fob + shipping + delivery + commission + storage + ad + ret + promoCost;

  return {
    total,
    detail: { fob, shipping, delivery, commission, storage, ad, ret, coupon, promoCost },
    inferred: { isAdInferred, isReturnInferred, isCommissionInferred },
  };
}

// ────────── 规则2：单件净利 ──────────
export function computeGrossProfit(price: number, totalCost: number): number {
  if (price <= 0 || totalCost <= 0) return 0;
  return price - totalCost;
}

// ────────── 规则3：净利率 ──────────
export function computeGrossMargin(profit: number, price: number): number {
  if (price <= 0) return 0;
  return (profit / price) * 100;
}

// ────────── 规则4：广告费比 ──────────
export function computeAdRatio(adFee: number, price: number): number {
  if (price <= 0) return 0;
  return (adFee / price) * 100;
}

// ────────── 规则5：退款率 ──────────
export function computeReturnRate(returnFee: number, price: number): number {
  if (price <= 0) return 0;
  return (returnFee / price) * 100;
}

// ────────── 规则6：退款费(30天) ──────────
export function computeReturnFee30d(price: number, returnRate: number, monthlySales: number): number {
  if (returnRate <= 0 || monthlySales <= 0 || price <= 0) return 0;
  return price * (returnRate / 100) * monthlySales;
}

// ────────── 规则7：折扣广告费(估) ──────────
export function computeDiscountAdEstimated(normalAdFee: number, discountAdFee?: number): number {
  if (discountAdFee != null && discountAdFee > 0) return discountAdFee;
  return normalAdFee * 1.1;
}

// ────────── 规则8：折扣退款费(估) ──────────
export function computeDiscountReturnFeeEstimated(normalReturnFee: number, discountReturnFee?: number): number {
  if (discountReturnFee != null && discountReturnFee > 0) return discountReturnFee;
  return normalReturnFee * 1.1;
}

// ────────── 规则9：仓库库存自动汇总 ──────────
export function computeWarehouseTotals(inv?: InventoryLayer): {
  inStock: number;
  inTransit: number;
  total: number;
  eastStock: number;
  westStock: number;
  southeastStock: number;
  southcentralStock: number;
  eastTransit: number;
  westTransit: number;
  southeastTransit: number;
  southcentralTransit: number;
} {
  const eS = n(inv?.eastStock);
  const wS = n(inv?.westStock);
  const seS = n(inv?.southeastStock);
  const scS = n(inv?.southcentralStock);
  const eT = n(inv?.eastTransit);
  const wT = n(inv?.westTransit);
  const seT = n(inv?.southeastTransit);
  const scT = n(inv?.southcentralTransit);

  // FBA 区域库存 + FBM 仓库明细汇总
  const fbaRegionSum = eS + wS + seS + scS;
  const fbmWarehouseSum = inv?.warehouseBreakdown
    ? inv.warehouseBreakdown.reduce((s, wb) => s + n(wb.qty), 0)
    : 0;

  let inStock = fbaRegionSum > 0 ? fbaRegionSum + fbmWarehouseSum : fbmWarehouseSum;
  // 如果 FBA 区域字段没用但 fbaStock 有值，加进来
  if (fbaRegionSum === 0 && n(inv?.fbaStock) > 0) {
    inStock = n(inv?.fbaStock) + fbmWarehouseSum;
  }
  // 兜底：都没有但 warehouseBreakdown 有数据
  if (inStock === 0 && inv?.warehouseBreakdown?.length) {
    inStock = fbmWarehouseSum;
  }

  const inTransit = eT + wT + seT + scT;

  return {
    inStock,
    inTransit,
    total: inStock + inTransit,
    eastStock: eS,
    westStock: wS,
    southeastStock: seS,
    southcentralStock: scS,
    eastTransit: eT,
    westTransit: wT,
    southeastTransit: seT,
    southcentralTransit: scT,
  };
}

// ────────── 规则10：覆盖天数 ──────────
export function computeCoverDays(stock: number, dailySales: number): number {
  if (dailySales <= 0) return 999;
  return stock / dailySales;
}

// ────────── 规则11：混卖FBA补货 ──────────
export function computeFbaReplenishment(
  sku: SkuMaster,
  snap?: DailySnapshot,
  defaultLeadTime?: number,
  defaultSafetyStockDays?: number,
): ReplenishResult | undefined {
  if (!snap || sku.fulfillment !== "mixed") return undefined;
  const dailySales = n(snap.fbaDailySales7d) || n(snap.dailySales7d);
  if (dailySales <= 0) return undefined;

  const stockOnHand = n(snap.fbaStockOnHand) || n(snap.stockOnHand);
  const stockInTransit = n(snap.fbaStockInTransit) || n(snap.stockInTransit);
  const leadTime = sku.fbaLeadTimeDays ?? sku.leadTimeDays ?? defaultLeadTime ?? 40;
  const safetyDays = sku.fbaSafetyStockDays ?? sku.safetyStockDays ?? defaultSafetyStockDays ?? 30;

  const safetyStock = leadTime * dailySales * 0.2;
  const suggestQty = Math.ceil((leadTime * dailySales) + safetyStock - stockOnHand - stockInTransit);
  const coverDays = dailySales > 0 ? stockOnHand / dailySales : 999;

  return { dailySales, stockOnHand, stockInTransit, leadTimeDays: leadTime, safetyStockDays: safetyDays, safetyStock, suggestQty: Math.max(0, suggestQty), coverDays };
}

// ────────── 规则11b：混卖FBM补货 ──────────
export function computeFbmReplenishment(
  sku: SkuMaster,
  snap?: DailySnapshot,
  defaultLeadTime?: number,
  defaultSafetyStockDays?: number,
): ReplenishResult | undefined {
  if (!snap || sku.fulfillment !== "mixed") return undefined;
  const dailySales = n(snap.fbmDailySales7d) || n(snap.dailySales7d);
  if (dailySales <= 0) return undefined;

  const stockOnHand = n(snap.fbmStockOnHand) || n(snap.stockOnHand);
  const stockInTransit = n(snap.fbmStockInTransit) || n(snap.stockInTransit);
  const leadTime = sku.fbmLeadTimeDays ?? sku.leadTimeDays ?? defaultLeadTime ?? 40;
  const safetyDays = sku.fbmSafetyStockDays ?? sku.safetyStockDays ?? defaultSafetyStockDays ?? 30;

  const safetyStock = leadTime * dailySales * 0.5;
  const suggestQty = Math.ceil((leadTime * dailySales) + safetyStock - stockOnHand - stockInTransit);
  const coverDays = dailySales > 0 ? stockOnHand / dailySales : 999;

  return { dailySales, stockOnHand, stockInTransit, leadTimeDays: leadTime, safetyStockDays: safetyDays, safetyStock, suggestQty: Math.max(0, suggestQty), coverDays };
}

// ────────── 规则12：计算优先级链（总入口） ──────────
export function computeAll(params: {
  sku: SkuMaster;
  snap?: DailySnapshot;
  inv?: InventoryLayer;
  activePromo?: Promotion;
  defaultLeadTime?: number;
  defaultSafetyStockDays?: number;
  promoCost?: number;
}): CalcResult {
  const { sku, snap, inv, activePromo, defaultLeadTime = 40, defaultSafetyStockDays = 30, promoCost = 0 } = params;

  const discountPrice = activePromo?.discountPrice ?? sku.discountPrice ?? undefined;
  const effectivePrice = discountPrice ?? sku.price;

  // Step 1: 正常列总成本
  const normal = computeTotalCost(sku, snap, undefined, promoCost);
  const totalCost = normal.total;

  // Step 2: 折扣列总成本
  const discount = computeDiscountTotalCost(sku, snap, discountPrice, normal.detail, promoCost);
  const disTotalCost = discount.total;

  // Step 3: 单件净利
  const grossProfit = computeGrossProfit(sku.price, totalCost);
  const discountProfit = discountPrice ? computeGrossProfit(discountPrice, disTotalCost) : 0;

  // Step 4: 净利率
  const grossMargin = computeGrossMargin(grossProfit, sku.price);
  const discountMargin = discountPrice ? computeGrossMargin(discountProfit, discountPrice) : 0;

  // Step 5: 广告费比
  const adRatio = computeAdRatio(normal.detail.ad, sku.price);
  const discountAdRatio = discountPrice ? computeAdRatio(discount.detail.ad, discountPrice) : 0;

  // Step 6: 退款率
  const returnRate = computeReturnRate(normal.detail.ret, sku.price);
  const discountReturnRate = discountPrice ? computeReturnRate(discount.detail.ret, discountPrice) : 0;

  // 退款率 (FBM)
  const refundRate = sku.fulfillment === "FBM" ? (snap?.refundRate ?? 0) : 0;
  const discountRefundRate = discountPrice ? refundRate : 0;

  // Step 7: 退款费(30天) — 使用计算器自身的退货率
  const monthlySales = snap?.monthlySales ?? 0;
  const returnFee30d = computeReturnFee30d(sku.price, returnRate, monthlySales);
  const discountReturnFee30d = discountPrice ? computeReturnFee30d(discountPrice, discountReturnRate, monthlySales) : 0;

  // Step 8: 估算字段
  const discountAdEstimated = computeDiscountAdEstimated(normal.detail.ad, discount.detail.ad);
  const discountReturnFeeEstimated = computeDiscountReturnFeeEstimated(returnFee30d, discountReturnFee30d);

  // Step 9: 仓库汇总
  const warehouse = computeWarehouseTotals(inv);

  // Step 10: 覆盖天数
  const dailySales = snap?.dailySales7d ?? 0;
  const daysOfCoverOnHand = computeCoverDays(warehouse.inStock, dailySales);
  const daysOfCoverWithTransit = computeCoverDays(warehouse.total, dailySales);

  // Step 11: 混卖补货
  const fbaReplenish = computeFbaReplenishment(sku, snap, defaultLeadTime, defaultSafetyStockDays);
  const fbmReplenish = computeFbmReplenishment(sku, snap, defaultLeadTime, defaultSafetyStockDays);

  return {
    totalCost,
    grossProfit,
    grossMargin,
    adRatio,
    returnRate,
    refundRate,
    returnFee30d,
    discountTotalCost: disTotalCost,
    discountProfit,
    discountMargin,
    discountAdRatio,
    discountReturnRate,
    discountRefundRate,
    discountReturnFee30d,
    discountAdEstimated,
    discountReturnFeeEstimated,
    isAdInferred: normal.inferred.isAdInferred,
    isReturnInferred: normal.inferred.isReturnInferred,
    isCommissionInferred: normal.inferred.isCommissionInferred,
    isDiscountAdInferred: discount.inferred.isAdInferred,
    isDiscountReturnInferred: discount.inferred.isReturnInferred,
    costFob: normal.detail.fob,
    costShipping: normal.detail.shipping,
    costDelivery: normal.detail.delivery,
    costCommission: normal.detail.commission,
    costStorage: normal.detail.storage,
    costAd: normal.detail.ad,
    costReturn: normal.detail.ret,
    costCoupon: normal.detail.coupon,
    costPromo: normal.detail.promoCost,
    discountCostFob: discount.detail.fob,
    discountCostShipping: discount.detail.shipping,
    discountCostDelivery: discount.detail.delivery,
    discountCostCommission: discount.detail.commission,
    discountCostStorage: discount.detail.storage,
    discountCostAd: discount.detail.ad,
    discountCostReturn: discount.detail.ret,
    discountCostCoupon: discount.detail.coupon,
    discountCostPromo: discount.detail.promoCost,
    inStockTotal: warehouse.inStock,
    inTransitTotal: warehouse.inTransit,
    totalStock: warehouse.total,
    daysOfCoverOnHand,
    daysOfCoverWithTransit,
    fbaReplenish,
    fbmReplenish,
  };
}

// ────────── 促销成本按周聚合 ──────────

/** 获取指定日期所在周的周一 */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

/** 获取指定日期所在周的周日 */
export function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** 两段日期区间是否有重叠 */
function rangesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 <= e2 && e1 >= s2;
}

/**
 * 计算某个 SKU 在指定快照日期所在周的促销成本总和。
 * 规则：遍历所有 ManualPromotion，若其 [startDate, endDate] 与该周重叠，
 *       按金额模式或折扣率模式累加成本。
 */
export function computeWeeklyPromoCost(
  sku: string,
  weekDate: string,
  manualPromos: ManualPromotion[],
  skuMasterMap?: Map<string, SkuMaster>,
  snapMap?: Map<string, DailySnapshot>,
): { total: number; count: number } {
  const weekStart = getWeekStart(weekDate);
  const weekEnd = getWeekEnd(weekStart);

  let total = 0;
  let count = 0;

  for (const promo of manualPromos) {
    if (promo.sku !== sku) continue;
    if (!rangesOverlap(promo.startDate, promo.endDate, weekStart, weekEnd)) continue;

    count++;

    if (promo.costMode === "amount" && promo.amount != null && promo.amount > 0) {
      total += promo.amount;
    } else if (promo.costMode === "rate" && promo.rate != null && promo.rate > 0) {
      const skuMaster = skuMasterMap?.get(sku);
      const price = skuMaster?.price ?? 0;
      const snap = snapMap?.get(sku);
      const dailySales = snap?.dailySales7d ?? 0;
      const weeklySales = dailySales * 7;

      if (weeklySales <= 0) {
        if (promo.estimatedCost != null && promo.estimatedCost > 0) {
          total += promo.estimatedCost;
        }
      } else {
        const cost = (promo.rate / 100) * price * weeklySales;
        total += Number(cost.toFixed(2));
      }
    } else if (promo.estimatedCost != null && promo.estimatedCost > 0) {
      total += promo.estimatedCost;
    }
  }

  return { total, count };
}