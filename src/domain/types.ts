// =========================================================
// Amazon Operation OS — Unified Data Model
// SSOT: single source of truth for every module.
// =========================================================

/** SKU 主档（静态属性，人工维护一次即可） */
export interface SkuMaster {
  sku: string;                // 主键
  name: string;               // 品名
  image?: string;             // 图片 URL / 文件名
  asin?: string;
  linkType?: "main" | "follow" | "backup"; // 主链接 / 跟卖 / 备用
  saleStatus: "active" | "clearance" | "paused" | "discontinued"; // 在售 / 清货 / 停售
  fulfillment: "FBA" | "FBM" | "mixed";  // 仓库类型，mixed=混卖
  store: string;               // 所属店铺
  marketplace?: string;        // 站点，默认 US
  price: number;               // 售价
  productUrl?: string;
  competitorUrls?: string[];
  aPlus?: "done" | "todo";     // A+ 是否完成
  category?: string;           // 品类
  lifecycle?: "new" | "growth" | "mature" | "clearance" | "eol"; // 生命周期
  launchDate?: string;         // 上架日期 YYYY-MM-DD
  parentGroup?: string;        // 父记录
  costFob?: number;
  costShipping?: number;       // 头程
  costDelivery?: number;       // 配送费
  costCommission?: number;     // 佣金
  costStorage?: number;        // 仓储费
  costReturn?: number;         // 退货费
  costAd?: number;             // 广告费
  // 折扣列成本字段
  discountPrice?: number;       // 折扣售价
  discountFob?: number;
  discountShipping?: number;   // 折扣头程
  discountDelivery?: number;   // 折扣尾程
  discountCommission?: number;
  discountStorage?: number;
  discountReturn?: number;
  discountAd?: number;
  discountCoupon?: number;
  // FBA/FBM 分拆（混卖模式）
  fbaPrice?: number;
  fbmPrice?: number;
  fbaLeadTimeDays?: number;
  fbmLeadTimeDays?: number;
  fbaSafetyStockDays?: number;
  fbmSafetyStockDays?: number;
  leadTimeDays?: number;       // 工厂→FBA 天数（默认 40）
  safetyStockDays?: number;    // 安全库存天数（默认 30）
  moq?: number;                // 最小起订量
  // 运营表扩展字段
  upc?: string;                // UPC
  parentAsin?: string;         // 父体 ASIN
  parentSku?: string;          // 父体 SKU
groupSku?: string;           // 所属父SKU分组，空/未设置表示自己是父SKU/独立SKU
  msku?: string;               // MSKU
  listPrice?: number;          // List Price
  coupon?: number;             // 优惠券金额
  packageLength?: number;      // 包裹长 cm
  packageWidth?: number;       // 包裹宽 cm
  packageHeight?: number;      // 包裹高 cm
  unitsPerBox?: number;        // 单箱数
  packageWeight?: number;      // 包裹重 kg
  aPlusAdvanced?: "done" | "todo"; // 高级 A+
  installVideo?: "done" | "todo";  // 安装视频
  transparentPlan?: string;    // 透明计划
}

/** 每日快照（动态指标，系统自动写入 / Excel 每日导入） */
export interface DailySnapshot {
  id?: number;
  date: string;              // YYYY-MM-DD
  sku: string;
  // 销量
  dailySales7d: number;      // 近 7 天日均
  monthlySales: number;
  // 库存
  stockOnHand: number;
  stockInTransit: number;
  daysOfCoverOnHand: number;
  daysOfCoverWithTransit: number;
  // 广告 & 利润
  adSpend: number;
  adRatio: number;           // 费比 %
  profit: number;
  profitMargin: number;      // 利润率 %
  totalCost: number;
  // Review
  rating: number;
  reviewCount?: number;
  returnRate: number;        // 退货率 %
  refundRate?: number;       // 退款率 % (FBM)
  // FBA/FBM 分拆（混卖模式）
  fbaDailySales7d?: number;
  fbmDailySales7d?: number;
  fbaMonthlySales?: number;
  fbmMonthlySales?: number;
  fbaStockOnHand?: number;
  fbmStockOnHand?: number;
  fbaStockInTransit?: number;
  fbmStockInTransit?: number;
  // 折扣利润（有促销时记录）
  discountTotalCost?: number;
  discountProfit?: number;
  discountMargin?: number;
}

/** 分仓库存切片 */
export interface InventoryLayer {
  id?: number;
  date: string;
  sku: string;
  fbaStock: number;
  fbmStock: number;
  factoryStock: number;
  eastTransit: number;
  westTransit: number;
  southeast: number;    // 乐歌美东南（兼容旧数据）
  southcentral: number; // 乐歌美中南（兼容旧数据）
  // 新：4 区域 × 在库 / 在途
  eastStock?: number;
  westStock?: number;
  southeastStock?: number;
  southcentralStock?: number;
  southeastTransit?: number;
  southcentralTransit?: number;
  warehouseBreakdown?: WarehouseStock[];  // 海外仓拆分明细
  transitBatches?: TransitBatch[];       // 在途批次明细
  factoryBatches?: FactoryBatch[];         // 工厂批次明细
}

/** 活动配置 */
export interface Campaign {
  id: string;
  name: string;              // Prime Day / BF / Xmas
  startDate: string;
  endDate: string;
  multiplier: number;        // 销量倍率
  skus?: string[];           // 参与 SKU，空=全站
  active: boolean;
  discountPrice?: number;    // 大促期间预估折扣售价，用于利润模拟
}

/** 促销 / Deal 活动（BD / LD / 7DD / Coupon 等） */
export type PromotionType = "BD" | "LD" | "7DD" | "Coupon" | "other";

export interface Promotion {
  id: string;
  sku: string;
  skuName?: string;
  store: string;
  type: PromotionType;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "ended";
  notes?: string;
  multiplier?: number;
  discountPrice?: number;    // 折扣价格（运营表中的折扣售价）
}

/** 手动促销成本类型（优惠券/秒杀/站外折扣） */
export type ManualPromoType = "coupon" | "flash_sale" | "offsite_discount" | "other";

/** 手动促销成本记录 — 存 IndexedDB manualPromotions 表 */
export interface ManualPromotion {
  id: string;
  sku: string;
  skuName?: string;
  type: ManualPromoType;
  startDate: string;          // 起 YYYY-MM-DD
  endDate: string;            // 止 YYYY-MM-DD
  costMode: "amount" | "rate";
  amount?: number;            // 金额模式：直接填促销成本金额 (USD)
  rate?: number;              // 折扣率模式：如 20 表示 20%
  estimatedCost?: number;    // 折扣率模式自动估算：rate% × 售价 × 周销量
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

/** 风险 / 告警 */
export type AlertType =
  | "stockout"
  | "low_stock"
  | "overstock"
  | "profit"
  | "ad"
  | "rating"
  | "review"
  | "return"
  | "listing"
  | "promo_start"      // 促销即将开始
  | "promo_end";        // 促销即将到期

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  id: string;
  date: string;
  sku: string;
  skuName?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  metric?: number;
  suggestion?: string;
  status: "open" | "handled" | "ignored";
}

/** 发货建议 */
export interface ShipmentSuggestion {
  sku: string;
  skuName: string;
  image?: string;
  currentStock: number;
  inTransit: number;
  dailySales: number;
  daysOfCoverOnHand: number;
  daysOfCoverWithTransit: number;
  leadTimeDays: number;
  safetyStockDays: number;
  targetCoverDays: number;
  suggestQty: number;
  latestShipDate: string;    // 建议最晚发货日
  priority: "urgent" | "high" | "normal" | "low";
  reason: string;
  campaignBoost?: string;
}

/** 全局参数 */
export interface GlobalConfig {
  defaultLeadTime: number;         // 默认 Lead Time
  defaultSafetyStockDays: number;  // 默认安全库存天数
  defaultTargetCoverDays: number;  // 默认目标库存天数
  profitMarginThreshold: number;   // 利润率异常阈值 %
  adRatioThreshold: number;        // 费比异常阈值 %
  ratingDropThreshold: number;     // 评分下降阈值
  returnRateThreshold: number;     // 退货率异常阈值 %
  lifecycleNewDays: number;        // 新品期天数
  lifecycleGrowthDays: number;     // 成长期天数
}

/** 云端同步配置（GitHub） */
export interface CloudConfig {
  provider: "github";
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;              // 存放文件路径
  lastSyncAt?: string;
}

/** 海外仓库存拆分 */
export interface WarehouseStock {
  warehouse: string;        // 美西 / 美东 / 美中南 / 美东南
  qty: number;
  daysOfCover: number;      // 该仓可售天数 = qty / daily
}

/** 在途批次明细 */
export interface TransitBatch {
  warehouse: string;           // 物流商-目的仓，如"无忧达-美东南"
  qty: number;
  etaDate: string;               // 预计到仓日期 YYYY-MM-DD
  shipDate?: string;             // 出港日期
  pickupDate?: string;           // 提柜日期
  arrivalDate?: string;          // 到港/卸船日期
  statusText?: string;           // 自定义状态文字，如"已卸船"
  shipMethod: "sea" | "air" | "express";
  status: "in_transit" | "at_port" | "customs" | "receiving";
}

/** 工厂批次明细 */
export interface FactoryBatch {
  factoryName: string;
  qty: number;                   // 当前工厂在产/库存数量
  totalQty?: number;             // 该批次下单总量
  deliveryDate: string;          // 交期 YYYY-MM-DD
  status: "producing" | "ready" | "shipped";
}

// ═══════ 海外仓费率配置 ═══════
export interface RateTier {
  min: number;
  max?: number;       // undefined = 无上限
  rate: number;       // USD 费率
}

export interface WarehouseProvider {
  id: string;
  name: string;                 // 服务商名称，如"无忧达"
  billingMode: "days_tier" | "longest_edge_tier"; // 天数阶梯 / 最长边阶梯
  unit: "cbm_per_day" | "cft_per_day";            // USD/立方米/天 或 USD/立方尺/天
  tiers: RateTier[];            // 服务商级费率表（不分仓库）
}

// ═══════ 新品测算 ═══════
export interface EstimateInput {
  id?: string;
  name?: string;               // 品名 选填
  length: number;              // 长 cm
  width: number;               // 宽 cm
  height: number;              // 高 cm
  weight: number;              // 重量 kg
  fobCny: number;              // FOB CNY
  shippingCost: number;        // 头程 USD
  expectedPrice: number;       // 预计售价 USD
  commissionRate: number;      // 佣金比例 % 默认15
  adBudget: number;            // 广告费预算 USD/月
  fbaDelivery: number;         // FBA配送费 USD/件
  fbaStorage: number;          // FBA仓储费 USD/件
  overseasProviderId?: string; // 选中的海外仓服务商
  overseasWarehouseId?: string;// 选中的海外仓仓库
  overseasDays: number;        // 在库天数 默认30
  returnRate: number;          // 退货率 % 默认值
  coupon: number;              // 优惠券 USD
  createdAt?: string;
}

export interface EstimateResult {
  volumeCbm: number;           // 体积 立方米
  volumeCft: number;           // 体积 立方尺
  fobUsd: number;              // FOB USD (CNY/7.2)
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  adRatio: number;
  fbaStorageCost: number;      // FBA仓储费（手动）
  overseasStorageCost: number; // 海外仓仓储费（自动算）
}

// ═══════ 新品测算记录 ═══════
export interface CalculationRecord {
  id: string;
  sku?: string;                // 关联 SKU（如果保存到已有 SKU）
  name: string;               // 品名
  asin?: string;
  marketplace: string;        // 站点
  price: number;              // 售价
  costFob: number;            // FOB USD
  costShipping: number;       // 头程 USD
  costDelivery: number;       // 配送费 USD
  costCommission: number;     // 佣金 USD
  costStorage: number;        // 仓储费 USD
  costAd: number;             // 广告费 USD
  costReturn: number;         // 退货费 USD
  coupon: number;             // 优惠券 USD
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  roi: number;
  deliveryMode: "FBA" | "FBM";
  fbaDelivery?: number;
  fbaStorage?: number;
  createdAt: string;
  notes?: string;
}

// ═══════ 待办事项 ═══════
export interface TodoItem {
  id: string;
  content: string;             // 必填，文字
  relatedSku?: string;         // 选填，关联SKU
  dueDate?: string;             // 选填，截止日 YYYY-MM-DD
  completed: boolean;           // 完成状态
  createdAt: string;            // 创建时间
  completedAt?: string;         // 完成时间
}// ═══════ 店铺管理 ═══════
export interface Shop {
  id: string;
  name: string;
  createdAt: string;
}