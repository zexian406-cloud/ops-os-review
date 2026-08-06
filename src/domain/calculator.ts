import type { SkuMaster, DailySnapshot, InventoryLayer, Promotion, ManualPromotion } from "./types";

// =========================================================
// 自动计算引擎 — 纯函数，14条规则，仅在目标字段为空时触发
// =========================================================

export interface CalcResult {
  // ── 正常列 ──
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  profitSource?: "CALCULATED" | "ESTIMATED";  // 利润来源标记（费率联动重算后写入）
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
  costRefundLoss: number;
  costCoupon: number;
  costPromo: number;
  discountCostFob: number;
  discountCostShipping: number;
  discountCostDelivery: number;
  discountCostCommission: number;
  discountCostStorage: number;
  discountCostAd: number;
  discountCostReturn: number;
  discountCostRefundLoss: number;
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

// ────────── 成本是否全部缺失 ──────────
/**
 * 成本字段是否全部缺失：有售价但 6 项成本（FOB/头程/配送/佣金/仓储/广告）
 * 全为 0 或未填。此时 computeAll 会把利润率算成 100%，为失真占位值，
 * 界面应标注「缺失/成本缺失」而非直接显示 0。
 *
 * 注：退货费(costReturn)与退款率(refundRate)不纳入成本缺失判断——
 * 退货损失改用 refundRate × 售价（见 computeTotalCost 的 refundLoss），
 * 退款率缺失与否由 isReturnRateMissing 单独判断。
 */
export function isCostFullyMissing(sku: SkuMaster): boolean {
  if (!sku.price || sku.price <= 0) return false;
  const c = (v?: number | null) => (v == null ? 0 : v);
  return (
    c(sku.costFob) === 0 &&
    c(sku.costShipping) === 0 &&
    c(sku.costDelivery) === 0 &&
    c(sku.costCommission) === 0 &&
    c(sku.costStorage) === 0 &&
    c(sku.costAd) === 0
  );
}

/**
 * 退款率是否因底层数据缺失而失真（真实值未导入）。
 * 退款率(refundRate)现已对所有履约方式生效（FBA/FBM/mixed 均使用上传的 refundRate，
 * 不再依赖退货成本 costReturn 是否全缺），因此只要 refundRate 为空（null/undefined）
 * 即判定缺失，界面标注「缺失」而非误导性的 0%。
 */
export function isReturnRateMissing(opts: {
  fulfillment: "FBA" | "FBM" | "mixed";
  costMissing: boolean;
  refundRate?: number | null;
}): boolean {
  return opts.refundRate == null;
}

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

  // 佣金：costCommission 优先；为空时若显式设定 commissionRate 则用 费率×售价，否则 15% 估算
  let commission = n(sku.costCommission);
  let isCommissionInferred = false;
  if (commission === 0 && price > 0) {
    if (sku.commissionRate && sku.commissionRate > 0) {
      commission = (sku.commissionRate / 100) * price;
    } else {
      commission = price * 0.15;
      isCommissionInferred = true;
    }
  }

  // 广告费：有值保留，空则从费比×售价反推
  let ad = n(sku.costAd);
  let isAdInferred = false;
  if (ad === 0 && snap && snap.adRatio > 0 && price > 0) {
    ad = (snap.adRatio / 100) * price;
    isAdInferred = true;
  }

  // 退货费(costReturn)：仅用于诊断查看的退货率(returnRate=costReturn/售价)，不再计入成本
  // ⚠️ 仅用导入的 returnRate 反推，绝不 fallback 到 refundRate！
  //    之前混用 refundRate 反推 costReturn → computeReturnRate(ret,price) 又反推出 returnRate，
  //    导致退货率和退款率显示值完全一致，两个指标失去区分意义。
  let ret = n(sku.costReturn);
  let isReturnInferred = false;
  if (ret === 0 && snap && price > 0 && snap.returnRate && snap.returnRate > 0) {
    ret = (snap.returnRate / 100) * price;
    isReturnInferred = true;
  }

  // 退货损失（计入总成本）：退款率 × 售价，对所有履约方式生效（FBA 也用上传的 refundRate，不再强制 0）
  const refundLoss = snap ? (snap.refundRate ?? 0) / 100 * price : 0;

  // 优惠券计入总成本（用户拍板：优惠券是真实支出，应纳入成本与净利）
  const total = fob + shipping + delivery + commission + storage + ad + refundLoss + promoCost + coupon;

  return {
    total,
    detail: { fob, shipping, delivery, commission, storage, ad, ret, refundLoss, coupon, promoCost },
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
  refundLoss: number;
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
    commission = dp * (sku.commissionRate && sku.commissionRate > 0 ? sku.commissionRate / 100 : 0.15);
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

  // 折扣退货费(costReturn/discountReturn)：仅用于诊断查看的退货率，不再计入成本
  // ⚠️ 仅用导入的 returnRate 反推，绝不 fallback 到 refundRate！避免两个指标显示值完全一致
  let ret: number;
  let isReturnInferred = false;
  if (sku.discountReturn != null) {
    ret = n(sku.discountReturn);
  } else if (snap && snap.returnRate && snap.returnRate > 0) {
    ret = (snap.returnRate / 100) * dp;
    isReturnInferred = true;
  } else if (sku.price > 0 && nd.ret > 0 && dp !== sku.price) {
    ret = nd.ret * (dp / sku.price);
    isReturnInferred = true;
  } else {
    ret = nd.ret;
  }

  // 退货损失（计入折扣总成本）：退款率 × 折扣价，对所有履约方式生效
  const refundLoss = snap ? (snap.refundRate ?? 0) / 100 * dp : 0;

  // 优惠券计入折扣总成本（与正常成本口径一致）
  const total = fob + shipping + delivery + commission + storage + ad + refundLoss + promoCost + coupon;

  return {
    total,
    detail: { fob, shipping, delivery, commission, storage, ad, ret, refundLoss, coupon, promoCost },
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

  // ⚠️ 修复库存重复计算：四仓区域字段(eastStock等) 是通过 reapplyWarehouseMappings 从 warehouseBreakdown 映射出来的，
  //    两者本质是同一批数据（仓库明细→映射→填充四仓字段），绝不能简单相加，否则会导致 746 → 1492 这样的翻倍错误。
  //    计算规则（优先级从高到低）：
  //    1. 有 warehouseBreakdown（仓库明细）→ 直接取其总和（明细最权威，包含了映射到四仓的 + 没映射的其他仓库）
  //    2. 无 warehouseBreakdown 但有四仓区域字段 → 取四仓之和（FBA库存明细直接填区域的场景）
  //    3. 两者都无但有 fbaStock 总数 → 取 fbaStock
  //    4. 都没有 → 0
  const fbaRegionSum = eS + wS + seS + scS;
  const fbmWarehouseSum = inv?.warehouseBreakdown?.length
    ? inv.warehouseBreakdown.reduce((s, wb) => s + n(wb.qty), 0)
    : 0;

  let inStock: number;
  if (fbmWarehouseSum > 0) {
    inStock = fbmWarehouseSum;  // 明细最权威，已包含映射的四仓和其他独立仓库
  } else if (fbaRegionSum > 0) {
    inStock = fbaRegionSum;     // 无明细时用四仓汇总
  } else {
    inStock = n(inv?.fbaStock); // 兜底：老数据只有 fbaStock 总数
  }

  const inTransit = eT + wT + seT + scT;

  // 兜底：四仓在途为0但有在途批次时，取在途批次汇总
  const batchTransitTotal = inv?.transitBatches
    ? inv.transitBatches.reduce((s, b) => s + n(b.qty), 0)
    : 0;
  const finalInTransit = inTransit > 0 ? inTransit : batchTransitTotal;

  return {
    inStock,
    inTransit: finalInTransit,
    total: inStock + finalInTransit,
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
  if (dailySales <= 0) return Infinity;
  return stock / dailySales;
}

/** 覆盖天数展示：有限值显示天数，无销量（Infinity）显示 ∞。 */
export function formatCoverDays(days: number): string {
  return Number.isFinite(days) ? `${Math.round(days)}` : "∞";
}

/** 无销量时覆盖卡片的副标题。 */
export const COVER_NO_SALES_SUB = "暂无销量";

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
  const coverDays = dailySales > 0 ? stockOnHand / dailySales : Infinity;

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
  const coverDays = dailySales > 0 ? stockOnHand / dailySales : Infinity;

  return { dailySales, stockOnHand, stockInTransit, leadTimeDays: leadTime, safetyStockDays: safetyDays, safetyStock, suggestQty: Math.max(0, suggestQty), coverDays };
}

// ────────── 规则12：计算优先级链（总入口） ──────────
// ────────── 利润来源标记（费率联动重算） ──────────
// 其他成本组件（FOB/头程/配送/佣金/仓储）齐全 → CALCULATED；有缺失 → ESTIMATED。
// 注：退款损失(refundLoss) 允许为 0（退款率=0 属正常），不计入齐全判定。
export function deriveProfitSource(detail: CostDetail): "CALCULATED" | "ESTIMATED" {
  const core = [detail.fob, detail.shipping, detail.delivery, detail.commission, detail.storage];
  return core.every((v) => v > 0) ? "CALCULATED" : "ESTIMATED";
}

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

  // Step 6: 退货率 — 优先用导入的 returnRate，避免从 costReturn 反推时 fallback 到 refundRate 导致两者一致
  const returnRate = snap?.returnRate ?? computeReturnRate(normal.detail.ret, sku.price);
  const discountReturnRate = snap?.returnRate ?? (discountPrice ? computeReturnRate(discount.detail.ret, discountPrice) : 0);

  // 退款率(refundRate)：对所有履约方式生效（FBA 也使用上传的 refundRate，不再强制 0）
  const refundRate = snap?.refundRate ?? 0;
  const discountRefundRate = discountPrice ? refundRate : 0;

  // Step 7: 退款费(30天) — 使用退款率(refundRate)
  const monthlySales = snap?.monthlySales ?? 0;
  const returnFee30d = computeReturnFee30d(sku.price, refundRate, monthlySales);
  const discountReturnFee30d = discountPrice ? computeReturnFee30d(discountPrice, discountRefundRate, monthlySales) : 0;

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
    profitSource: deriveProfitSource(normal.detail),
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
    costRefundLoss: normal.detail.refundLoss,
    costCoupon: normal.detail.coupon,
    costPromo: normal.detail.promoCost,
    discountCostFob: discount.detail.fob,
    discountCostShipping: discount.detail.shipping,
    discountCostDelivery: discount.detail.delivery,
    discountCostCommission: discount.detail.commission,
    discountCostStorage: discount.detail.storage,
    discountCostAd: discount.detail.ad,
    discountCostReturn: discount.detail.ret,
    discountCostRefundLoss: discount.detail.refundLoss,
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
  if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
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

/**
 * 计算单条 Promotion 的有效促销成本（用于利润率计算时传入 computeAll 的 promoCost）。
 * - amount 模式：直接返回 amount
 * - rate 模式：rate% × price × weeklySales；无周销量则回退 estimatedCost
 * - 无 costMode：返回 0（向后兼容，旧数据无成本字段）
 */
export function getEffectivePromoCost(
  promo: Promotion,
  sku?: SkuMaster,
  snap?: DailySnapshot,
): number {
  if (promo.costMode === "amount" && promo.amount != null && promo.amount > 0) {
    return promo.amount;
  }
  if (promo.costMode === "rate" && promo.rate != null && promo.rate > 0) {
    // 若促销指定了 MSKU，优先使用 mskuMetrics 中的 price 和 sales
    let price = sku?.price ?? 0;
    let dailySales = snap?.dailySales7d ?? 0;
    if (promo.msku && sku?.mskuMetrics?.[promo.msku]) {
      const m = sku.mskuMetrics[promo.msku];
      if (m.price != null) price = m.price;
      if (m.sales7d != null) dailySales = m.sales7d;
    }
    const weeklySales = dailySales * 7;
    if (weeklySales > 0 && price > 0) {
      return Number(((promo.rate / 100) * price * weeklySales).toFixed(2));
    }
    return promo.estimatedCost ?? 0;
  }
  return 0;
}

export interface WeeklyCostBucket {
  weekStart: string;
  weekEnd: string;
  promoCost: number;   // 活动成本（Promotion 内嵌）
  otherCost: number;   // 其他成本（ManualPromotion）
  total: number;
  count: number;
}

/**
 * 按周聚合促销成本时间线（活动成本 + 其他成本）。
 * - amount 模式：跨周按覆盖周数均摊（避免重复计入）
 * - rate 模式：每周独立计入（rate% × price × weeklySales，天然按周）
 * - 以 today 所在周为末周，向前取 weeksBack 周（默认 8）
 */
export function aggregateWeeklyCosts(
  promotions: Promotion[],
  manualPromotions: ManualPromotion[],
  skuMasterMap: Map<string, SkuMaster>,
  snapMap: Map<string, DailySnapshot>,
  today: string = new Date().toISOString().slice(0, 10),
  weeksBack: number = 8,
): WeeklyCostBucket[] {
  const buckets: WeeklyCostBucket[] = [];
  const todayWeekStart = getWeekStart(today);
  const todayWeekDate = new Date(todayWeekStart + "T00:00:00");

  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(todayWeekDate);
    d.setDate(d.getDate() - i * 7);
    const weekStart = d.toISOString().slice(0, 10);
    const weekEnd = getWeekEnd(weekStart);
    buckets.push({ weekStart, weekEnd, promoCost: 0, otherCost: 0, total: 0, count: 0 });
  }

  // 活动成本（Promotion 内嵌）— amount 跨周均摊，rate 每周独立
  for (const promo of promotions) {
    if (!promo.costMode) continue;
    const sku = skuMasterMap.get(promo.sku);
    const snap = snapMap.get(promo.sku);
    const effectiveCost = getEffectivePromoCost(promo, sku, snap);
    if (effectiveCost <= 0) continue;

    let coveringWeeks = 0;
    for (const b of buckets) {
      if (rangesOverlap(promo.startDate, promo.endDate, b.weekStart, b.weekEnd)) coveringWeeks++;
    }
    if (coveringWeeks === 0) continue;

    const perWeekCost = promo.costMode === "amount" ? effectiveCost / coveringWeeks : effectiveCost;
    for (const b of buckets) {
      if (rangesOverlap(promo.startDate, promo.endDate, b.weekStart, b.weekEnd)) {
        b.promoCost += Number(perWeekCost.toFixed(2));
        b.count++;
      }
    }
  }

  // 其他成本（ManualPromotion）— amount 跨周均摊，rate 每周独立
  for (const m of manualPromotions) {
    const sku = skuMasterMap.get(m.sku);
    const snap = snapMap.get(m.sku);
    let effectiveCost = 0;
    if (m.costMode === "amount" && m.amount != null && m.amount > 0) {
      effectiveCost = m.amount;
    } else if (m.costMode === "rate" && m.rate != null && m.rate > 0) {
      const price = sku?.price ?? 0;
      const dailySales = snap?.dailySales7d ?? 0;
      const weeklySales = dailySales * 7;
      if (weeklySales > 0 && price > 0) {
        effectiveCost = Number(((m.rate / 100) * price * weeklySales).toFixed(2));
      } else {
        effectiveCost = m.estimatedCost ?? 0;
      }
    } else if (m.estimatedCost != null && m.estimatedCost > 0) {
      effectiveCost = m.estimatedCost;
    }
    if (effectiveCost <= 0) continue;

    let coveringWeeks = 0;
    for (const b of buckets) {
      if (rangesOverlap(m.startDate, m.endDate, b.weekStart, b.weekEnd)) coveringWeeks++;
    }
    if (coveringWeeks === 0) continue;

    const perWeekCost = m.costMode === "amount" ? effectiveCost / coveringWeeks : effectiveCost;
    for (const b of buckets) {
      if (rangesOverlap(m.startDate, m.endDate, b.weekStart, b.weekEnd)) {
        b.otherCost += Number(perWeekCost.toFixed(2));
        b.count++;
      }
    }
  }

  for (const b of buckets) {
    b.promoCost = Number(b.promoCost.toFixed(2));
    b.otherCost = Number(b.otherCost.toFixed(2));
    b.total = Number((b.promoCost + b.otherCost).toFixed(2));
  }

  return buckets;
}