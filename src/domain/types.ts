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
  fulfillmentMode?: FulfillmentMode;     // 计算模式：FBA_ONLY/FBM_ONLY/FBA_FBM_COMBINED（缺省=严格分拆，不自动合并）
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
  commissionRate?: number;      // 佣金率 %（显式设置时优先于固定 15% 默认）
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
  /** 各 MSKU 对应的独立 ASIN（MSKU -> ASIN）。
   *  导入「SKU标识符」/「销量导入」时按行保留，展示/筛选时优先取此值，缺失则回退 asin。
   *  向后兼容：旧数据无此字段时一律用父级 asin。 */
  mskuAsins?: Record<string, string>;
  /** 各 MSKU 对应的独立店铺（MSKU -> storeId/storeName）。
   *  导入「SKU标识符」时按行保留，展示/筛选时优先取此值，缺失则回退 store。
   *  向后兼容：旧数据无此字段时一律用父级 store。 */
  mskuStores?: Record<string, string>;
  /** 各 MSKU 对应的独立链接类型（MSKU -> "main"|"follow"|"backup"）。
   *  导入「SKU标识符」时按行保留，ASIN 显示逻辑据此判断是否回退父级 ASIN。
   *  向后兼容：旧数据无此字段时回退到父级 linkType。 */
  mskuLinkTypes?: Record<string, "main" | "follow" | "backup">;
  /** 各 MSKU 独立的动态指标（按 MSKU 行保留，不取平均）。
   *  导入「销量导入」「运营数据导入」时按行写入，展示层展开 MSKU 时优先取此值。
   *  向后兼容：旧数据无此字段时回退到家族级快照。 */
  mskuMetrics?: Record<string, {
    rating?: number;
    reviewCount?: number;
    adRatio?: number;
    returnRate?: number;
    refundRate?: number;
    sales7d?: number;
    sales30d?: number;
    price?: number;
    shippingFee?: number;
    listPrice?: number;
  }>;
  shippingFee?: number;        // 运费
  listPrice?: number;          // List Price（销售总价 = price + shippingFee）
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
  dailySales30d?: number;    // 近 30 天日均（由 sales30d 导入 ÷30；可选，缺省按 7d）
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
  profitSource?: "CALCULATED" | "ESTIMATED";  // 利润来源标记（费率联动重算后写入）
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

/** 履约计算模式 */
export type FulfillmentMode = "FBA_ONLY" | "FBM_ONLY" | "FBA_FBM_COMBINED";

/** 销售实体（分析层派生，主键 = SKU + 店铺 + 发货方式）
 *  底层 skuMaster / dailySnapshot 仍按家族 SKU 存储，仅在分析层按维度展开。
 *  - FBA_ONLY / FBM_ONLY / 缺省：FBA 与 FBM 严格分开（各自独立卡片）
 *  - FBA_FBM_COMBINED：运营明确选择后合并（库存/销量/在途汇总，底层仍独立） */
export interface SalesEntity {
  key: string;                 // `${sku}__${store}__${fulfillment}`
  sku: string;
  skuName: string;
  store: string;
  marketplace: string;
  fulfillment: "FBA" | "FBM" | "COMBINED";
  mode: FulfillmentMode;
  dailySales: number;          // 当前口径日均（按 config.salesBasis）
  dailySales7d: number;
  dailySales30d: number;
  stockOnHand: number;
  stockInTransit: number;
  fbaStockOnHand: number;
  fbmStockOnHand: number;
  fbaStockInTransit: number;
  fbmStockInTransit: number;
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

/** 促销 / Deal 活动
 *  支持标准类型 + 自定义命名（type=custom 时用 customTypeName 显示） */
export type PromotionType =
  | "BD"              // Best Deal
  | "LD"              // Lightning Deal
  | "Coupon"
  | "Price Discount"
  | "Promotion"
  | "custom";         // 自定义（用 customTypeName 展示）

export interface Promotion {
  id: string;
  sku: string;
  skuName?: string;
  /** 子链接 MSKU：促销针对特定 MSKU（如跟卖链接）而非父 SKU 时填写 */
  msku?: string;
  store: string;
  type: PromotionType;
  /** 自定义类型名称：type=custom 时必填，其他类型忽略 */
  customTypeName?: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "ended";
  notes?: string;
  multiplier?: number;
  discountPrice?: number;    // 折扣价格（运营表中的折扣售价）
  // —— 内嵌促销成本（活动创建即录，实现"一次录入，全局联动"）——
  costMode?: "amount" | "rate";   // 缺省=无独立促销成本；amount=金额模式，rate=折扣率模式
  amount?: number;                // 金额模式：该活动促销成本 USD
  rate?: number;                  // 折扣率模式：如 20 表示 20%
  estimatedCost?: number;         // rate 模式自动估算（rate% × 售价 × 周销量）
  promoCost?: number;             // 【冗余缓存】计算后有效成本，供时间线/汇总快速取用
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
  salesBasis?: "7d" | "30d";       // 日均销量口径（缺省 7d，可在参数中心切 30d）
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
  etaDate: string;               // 预计到仓（保留原始文本，支持多行/中文/件数前缀等格式）
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
  deliveryDate: string;          // 交期（保留原始文本）
  status: "producing" | "ready" | "shipped";
}

// ═══════ 海外仓费率配置 ═══════
export interface RateTier {
  min: number;
  max?: number;       // undefined = 无上限
  rate: number;       // USD 费率
}

export type WarehouseRegion = "east" | "west" | "southeast" | "southcentral";

export interface WarehouseMapping {
  id?: number;
  warehouseName: string;   // 原始仓库名，如 "乐歌(新) CAP"
  region: WarehouseRegion; // 映射到的区域
  createdAt: string;
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
  exchangeRate?: number;      // 汇率 (CNY→本地货币)
  commissionRate?: number;    // 佣金率 (%)
  adRate?: number;            // 广告率 (%)
  returnRate?: number;        // 退货率 (%)
  storageDays?: number;       // 仓储天数
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
  schemeName?: string;        // FBM 模式下的方案名称（承运商/海外仓名称）
  isBestScheme?: boolean;     // 是否为最优方案
  createdAt: string;
  notes?: string;
}

// ═══════ 待办事项 ═══════
export interface TodoItem {
  id: string;
  content: string;             // 必填，文字
  relatedSku?: string;         // 选填，关联SKU
  relatedMsku?: string;        // 选填，关联MSKU（子链接）
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
// ═══════ 运营操作记录（SKU操作日志） ═══════
/** 异常类型（用于"诊断→处理"闭环关联） */
export type AnomalyType =
  | "stockout"      // 断货
  | "low_stock"     // 库存紧张
  | "overstock"     // 库存积压
  | "profit"        // 利润异常
  | "ad"            // 广告异常
  | "rating"        // 评分下降
  | "return"        // 退货异常
  | "listing"       // Listing 待优化
  | "other";        // 其他

export interface OpsLog {
  id?: string;
  sku: string;             // 所属 SKU（父SKU或MSKU）
  msku?: string;           // 具体 MSKU（选填，关联到具体子SKU）
  skuName?: string;        // 品名（冗余，方便展示）
  date: string;            // 操作日期 YYYY-MM-DD
  action: string;          // 处理动作，如"降价"、"开广告"、"优化Listing"
  detail?: string;         // 详细说明（旧字段，向后兼容）
  impact?: string;         // 销量影响描述，如"销量上涨约30%"
  // ── 增强字段（贴合"记录处理过程"：日期/异常类型/原因/处理动作/备注）──
  anomalyType?: AnomalyType; // 关联的异常类型（来自诊断）
  reason?: string;         // 原因
  note?: string;           // 备注
  promotionId?: string;    // 关联的促销活动 ID（与促销活动页 SKU↔促销 一致）
  promotionName?: string;  // 关联促销活动名称（冗余，方便展示）
  createdAt: string;       // 记录创建时间
}

// ==================== 多站点架构 ====================
export interface Site {
  id: string;
  name: string;
  marketplace: string;
  currency: string;
  currencySymbol: string;
  exchangeRateToUsd: number;
  commissionRate: number;
  fbaDeliveryFee?: number;
  vatRate?: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SiteConfig {
  siteId: string;
  defaultLeadTime: number;
  defaultSafetyStockDays: number;
  defaultTargetCoverDays: number;
  profitMarginThreshold: number;
  adRatioThreshold: number;
  ratingDropThreshold: number;
  returnRateThreshold: number;
  lifecycleNewDays: number;
  lifecycleGrowthDays: number;
}

export interface CrossSiteSummary {
  siteId: string;
  siteName: string;
  currency: string;
  exchangeRateToUsd: number;
  totalSalesUsd: number;
  totalProfitUsd: number;
  totalSkuCount: number;
  totalStockOnHand: number;
  alertCount: number;
}

export interface CrossSiteReport {
  sites: CrossSiteSummary[];
  grandTotalSalesUsd: number;
  grandTotalProfitUsd: number;
  grandTotalSkuCount: number;
  grandTotalAlertCount: number;
}