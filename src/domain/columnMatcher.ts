/**
 * columnMatcher.ts — 列名模糊匹配工具（规则 H）
 *
 * 背景：领星 / Amazon 后台导出的列名因站点、版本不同五花八门
 * （FOB / fob / FOB成本 / 采购价 / 产品成本 / 含税成本 …），
 * 解析层不能再写死精确列名。本模块提供「逻辑字段 → 实际表头」的宽松匹配，
 * 命中后展示识别结果供用户确认；关键字段（SKU、销量）未命中则阻断导入。
 *
 * 匹配策略（保守）：
 *  1. normalizeHeader：小写 + 去除空格 + 去除中英文括号/方括号。
 *  2. 同义词分两类：
 *     - EXACT_ONLY（整词精确）：仅当表头整体等于该同义词时才命中。
 *       用于短而通用的词（如 "成本""价格""SKU""库存"），避免误命中
 *       "头程成本""出厂价格""子SKU""仓库库存" 等无关列。
 *     - 其余（短语模糊）：表头「包含」该同义词即命中（也兼容同义词包含表头）。
 *  3. 优先精确命中（Pass1），再模糊命中（Pass2），保证具体别名优先于兜底词。
 */

/** 逻辑字段 → 常见列名别名（含领星 / Amazon 后台常见写法） */
export const SYNONYMS: Record<string, string[]> = {
  // ── 关键标识 ──
  sku: ["SKU", "sku", "SKU码", "产品SKU", "父SKU", "asin", "ASIN", "Asin"],
  msku: ["MSKU", "msku", "子SKU", "变体SKU", "MSKU码", "产品MSKU", "卖家SKU", "Seller SKU", "seller-sku"],
  asin: ["asin", "ASIN", "Asin", "父体ASIN", "父ASIN"],
  name: ["品名", "商品名称", "产品名称", "name", "标题", "商品标题"],
  upc: ["UPC", "upc", "条形码", "条码"],
  category: ["品类", "category", "类目", "产品类目"],
  launchDate: ["上架日期", "launchDate", "上架时间", "首发日期", "上市日期"],
  store: ["店铺", "店铺名", "Store", "store"],
  fulfillment: ["发货方式", "履约方式", "Fulfillment"],

  // ── 成本 / 价格 ──
  // 注意：fob 的兜底词 "成本" 设为整词精确，避免误命中 "头程成本"/"仓储成本"。
  fob: ["FOB", "fob", "FOB成本", "fob成本", "采购价", "采购成本", "产品成本", "含税成本", "成本(USD)", "成本"],
  price: ["售价", "售价（总价）", "售价总价", "单价", "价格"],
  costStorage: ["仓租", "仓储费", "仓储成本", "仓库租金", "costStorage", "仓租费"],
  // 头程费：覆盖 "头程成本"（不会误归到 fob，因为 fob 的 "成本" 是整词精确）
  // 注意：移除 "头程运费" 避免与收入侧 "运费"(shippingFee) 模糊匹配冲突
  shipping: ["头程费", "头程", "头程成本", "costShipping", "头程费用"],
  delivery: ["配送费", "costDelivery", "配送", "delivery", "尾程费", "尾程配送费"],
  // 收入侧运费（买家支付的运费），与成本侧头程/尾程区分；"运费" 走整词匹配
  shippingFee: ["运费", "shippingFee", "shipping fee", "运费收入"],

  // ── 销量（7 天 / 30 天分开，避免日均与周期总量混淆）──
  sales7d: ["7天销量", "近7天销量", "近七天销量", "周销量", "日销量", "日销（近七天）", "近7天日均", "dailySales7d"],
  sales30d: ["30天销量", "近30天销量", "月销量", "月销", "monthlySales", "月度销量"],
  // 兼容任务描述的合并 `sales` 逻辑字段（展示/测试用，解析时改用 sales7d / sales30d）
  sales: ["近7天销量", "周销量", "7天销量", "日销量", "近30天销量", "30天销量", "月销量", "销量"],

  // ── 评分 / 评论 / 广告 / 退货退款 ──
  rating: ["评分", "rating", "星级", "starRating", "评价分", "stars", "review_rating", "Review Rating", "平均评分", "商品评分"],
  reviewCount: ["评论数", "reviewCount", "review_count", "评价数", "评论量", "reviews", "Review Count", "Rating Count", "评分数", "评论条数"],
  adRatio: ["广告费比", "ACoAS", "ACoS", "广告花费占比", "adRatio", "广告占比", "广告费率", "广告销售成本比", "ad ratio", "广告费用比", "广告花费/销售额"],
  returnRate: [
    "退货率", "退货比例", "退货比率", "退货率%", "退货率(FBA)", "FBA退货率", "退货率(FBM)", "FBM退货率",
    "returnRate", "return_rate", "return-rate", "Return Rate", "Return%", "return rate", "Return_Rate",
    "退货率（FBA）", "退货率（FBM）"
  ],
  refundRate: [
    "退款率", "退款比例", "退款比率", "退款率%", "退款率(FBM)", "FBM退款率", "退款率(FBA)", "FBA退款率",
    "refundRate", "refund_rate", "refund-rate", "Refund Rate", "Refund%", "refund rate", "Refund_Rate",
    "退款率（FBM）", "退款率（FBA）", "Refund Rate (FBM)"
  ],

  // ── 包裹尺寸 / 重量 / 单箱数 ──
  packageLength: ["包裹长cm", "包裹长", "长cm", "length", "包裹长度", "长(cm)"],
  packageWidth: ["包裹宽cm", "包裹宽", "宽cm", "width", "包裹宽度", "宽(cm)"],
  packageHeight: ["包裹高cm", "包裹高", "高cm", "height", "包裹高度", "高(cm)"],
  packageWeight: ["包裹重kg", "包裹重", "重kg", "weight", "包裹重量", "重(kg)"],
  unitsPerBox: ["单箱数", "箱数", "unitsPerBox", "每箱数量", "装箱数", "数量/箱"],

  // ── 库存 / 仓库 ──
  fbaStock: ["FBA库存", "FBA在库", "fbaStock", "库存"],
  warehouse: ["仓库", "warehouse", "海外仓", "仓库名"],
  qty: ["件数", "数量", "qty", "quantity"],
  totalQty: ["下单总量", "总数量", "totalQty", "订单总量"],

  // ── 在途 / 工厂 ──
  provider: ["承运商", "carrier", "物流商", "运输商"],
  dest: ["目的仓", "目的仓库", "destination", "destinationWarehouse", "目的国"],
  etaDate: ["预计到仓", "预计到货", "etaDate", "预计到达", "到仓日期"],
  shipDate: ["出港日期", "发货日期", "shipDate", "离港日期"],
  statusText: ["在途情况", "状态文字", "statusText", "物流状态"],
  factoryName: ["工厂名", "factoryName", "供应商"],
  deliveryDate: ["交期", "预计交期", "deliveryDate", "交货日期", "交货期"],
  factoryStatus: ["状态", "factoryStatus", "生产状态"],

  // ── 链接（产品链接 / 竞品链接）──
  productUrl: ["产品链接", "产品URL", "Product URL", "productUrl", "product_url", "product-url", "Listing链接", "亚马逊链接", "商品链接", "Listing URL"],
  competitorUrls: ["竞品链接", "竞品URL", "Competitor URLs", "competitorUrls", "competitor_urls", "竞品1", "竞品链接1", "竞品链接2", "竞品1链接", "竞品2链接"],
};

/**
 * 整词精确同义词：必须表头整体等于该词才命中。
 * 用于短/通用词，防止误匹配到包含该词的无关列。
 */
const EXACT_ONLY = new Set<string>([
  // sku / msku：避免 "子SKU" / "MSKU" 被 sku 的 "SKU" 命中
  "SKU",
  "sku",
  "MSKU",
  "msku",
  "子SKU",
  "变体SKU",
  // fob：兜底 "成本" 仅整词命中，避免 "头程成本"/"仓储成本" 被归到 fob
  "成本",
  // price：兜底 "价格" 仅整词命中，避免 "出厂价格" 被归到售价
  "价格",
  // shippingFee：兜底 "运费" 仅整词命中，避免 "头程运费" 被归到收入侧运费
  "运费",
  // fbaStock：兜底 "库存" 仅整词命中（仓库明细的库存是另一含义）
  "库存",
  // qty：兜底 "数量" 仅整词命中，避免 "下单总量" 被归到件数
  "数量",
]);

/** 归一化表头：小写 + 去空格 + 去中英文括号/方括号。 */
export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()【】\[\]]/g, "");
}

/**
 * 从表头数组中为某个逻辑字段选出第一个命中的实际列名。
 * 命中不到返回 undefined。
 */
export function matchColumn(logicalField: string, headers: string[]): string | undefined {
  const syns = SYNONYMS[logicalField];
  if (!syns || syns.length === 0) return undefined;
  const normHeaders = headers.map(normalizeHeader);

  // Pass 1：整词精确命中（具体别名优先）
  const exactSyns = syns.filter((s) => EXACT_ONLY.has(s));
  for (let i = 0; i < headers.length; i++) {
    const nh = normHeaders[i];
    for (const s of exactSyns) {
      if (normalizeHeader(s) === nh) return headers[i];
    }
  }

  // Pass 2：短语模糊命中（表头包含同义词，或同义词包含表头）
  const fuzzySyns = syns.filter((s) => !EXACT_ONLY.has(s));
  for (let i = 0; i < headers.length; i++) {
    const nh = normHeaders[i];
    for (const s of fuzzySyns) {
      const ns = normalizeHeader(s);
      if (ns.length === 0) continue;
      if (nh.includes(ns) || ns.includes(nh)) return headers[i];
    }
  }

  return undefined;
}

/** 从一行数据取出某实际列的值（列名为 undefined 时安全返回 undefined）。 */
export function pickCell(row: Record<string, unknown>, col: string | undefined): unknown {
  if (!col) return undefined;
  return row[col];
}

/**
 * 一次性为多个逻辑字段构建「逻辑字段 → 实际列名」映射。
 * 未命中的字段值为 undefined。
 */
export function buildColumnMap(fields: string[], headers: string[]): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const f of fields) map[f] = matchColumn(f, headers);
  return map;
}

/** 取一行数据的表头（用于构建列映射）。 */
export function headersOf(rows: Record<string, unknown>[]): string[] {
  return Object.keys(rows[0] ?? {});
}

