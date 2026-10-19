// =========================================================
// ERP 数据归一化层 —— MCP 与 REST 共用（需求核心规则）
// ---------------------------------------------------------
// 职责：把任意 ERP 原始响应行转换为统一字段结构 NormalizedRow，
// 之后由 ingest.ts 统一写入 IndexedDB。
// 策略：各 ERP（甚至同一 ERP 不同接口版本）返回字段名常有差异，
// 因此用「字段别名表 + 宽松匹配」取值，命中即用，全部落空给默认值，
// 保证归一化永不抛错 —— 错误数据宁可标 0 也不阻断拉取流程。
// =========================================================

import type { NormalizedRow } from "./types";

/** 从对象中按别名列表宽松取第一个非空字段值 */
export function pickField<T = unknown>(row: Record<string, unknown>, aliases: string[]): T | undefined {
  for (const key of aliases) {
    const v = row[key];
    if (v != null && v !== "") return v as T;
    // 领星部分接口字段在嵌套对象里（如 { statistics: {...} }），做一层浅扫
  }
  // 兜底：忽略大小写 / 下划线连字符差异再扫一遍
  const norm = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, "");
  const aliasSet = aliases.map(norm);
  for (const k of Object.keys(row)) {
    if (aliasSet.includes(norm(k))) {
      const v = row[k];
      if (v != null && v !== "") return v as T;
    }
  }
  return undefined;
}

/** 数值清洗：字符串/千分位/百分比统一转数字，非法给 fallback */
export function toNum(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,，\s%]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/* ────────── 领星字段别名表（以官方文档为准，发现新字段名往这里补即可） ────────── */
const LX = {
  msku: ["msku", "msku_name", "seller_sku", "sellerSku", "在线SKU"],
  asin: ["asin", "asin1", "ASIN"],
  sku: ["sku", "product_sku", "local_sku", "本地SKU"],
  name: ["name", "product_name", "title", "品名", "产品名称"],
  store: ["seller_name", "shop_name", "store_name", "店铺名称", "店铺"],
  // 销量（近7天累计）
  sales7: ["sales_7d", "sales7d", "sales7", "last7_sales", "sales_last_7_days", "quantity_7", "7天销量", "近7天销量"],
  sales30: ["sales_30d", "sales30d", "sales30", "last30_sales", "quantity_30", "30天销量", "近30天销量"],
  // 销售额（近7天，站点币种）
  revenue7: ["sales_amount_7d", "revenue_7d", "sales_7", "amount_7d", "sale_amount", "销售额", "销售额_7天"],
  // 广告
  adSpend7: ["ad_spend_7d", "cost_7d", "ad_cost", "spend", "cost", "advertising_cost", "广告花费", "广告费"],
  adSales7: ["ad_sales_7d", "ad_sales", "ad_sales_amount", "ad_sale_amount", "advertising_sales", "sales_same_day", "广告销售额"],
  acos: ["acos", "acos_rate", "ACoS", "广告ACOS"],
  // 库存
  fbaStock: ["fba_stock", "fba_available", "fba_quantity", "afn_fulfillable_quantity", "fba可售库存", "FBA库存", "可售数量"],
  whStock: ["warehouse_stock", "overseas_stock", "third_warehouse_stock", "fbm_stock", "local_stock", "海外仓库存", "仓库存"],
  // 退款
  refundQty: ["refund_quantity_7d", "refund_quantity", "refund_qty", "return_quantity", "退款数量", "退货数量"],
} as const;

/**
 * 领星数据归一化入口（MCP 与 REST 共用）。
 * 各数据源可缺省：缺哪个源，对应字段记 0，由调用方在 UI 上提示覆盖情况。
 *
 * @param listingRows  Listing 数据（msku/asin/sku/name/store 主档）
 * @param salesRows    销量/销售额数据（按 msku 维度）
 * @param adRows       广告数据（按 msku/asin 维度的花费、ACoS）
 * @param stockRows    FBA 库存数据
 * @param whRows       海外仓库存数据
 */
export function normalizeLingxing(
  listingRows: Record<string, unknown>[],
  salesRows: Record<string, unknown>[],
  adRows: Record<string, unknown>[],
  stockRows: Record<string, unknown>[],
  whRows: Record<string, unknown>[],
): NormalizedRow[] {
  // 1. 建立全局「标识符 → 行」别名索引：MSKU / ASIN / SKU 任一命中即合并到同一行。
  //    背景：领星不同接口的行键不一致（Listing 按 MSKU、库存常按本地 SKU），
  //    若只按单一键建索引会出现同一商品被拆成多行、销量库存挂不上的问题。
  const aliasIndex = new Map<string, NormalizedRow>();
  const rows: NormalizedRow[] = [];

  /** 提取一行的三个标识符（宽松匹配，可能为空） */
  const idsOf = (row: Record<string, unknown>) => ({
    m: pickField<string>(row, [...LX.msku]) ?? "",
    a: pickField<string>(row, [...LX.asin]) ?? "",
    s: pickField<string>(row, [...LX.sku]) ?? "",
  });

  const ensure = (row: Record<string, unknown>): NormalizedRow => {
    const { m, a, s } = idsOf(row);
    // 任一标识符命中已有行 → 合并；否则新建行并登记全部标识符
    let r = (m && aliasIndex.get(`m:${m}`)) || (a && aliasIndex.get(`a:${a}`)) || (s && aliasIndex.get(`s:${s}`));
    if (!r) {
      r = {
        msku: m, asin: a, sku: s,
        name: pickField<string>(row, [...LX.name]),
        store: pickField<string>(row, [...LX.store]),
        sales: 0, revenue: 0, adSpend: 0, acos: 0,
        fbaStock: 0, whStock: 0, refundQty: 0,
      };
      rows.push(r);
    } else {
      // 补全主档缺失的标识与品名/店铺（首个非空值优先，不覆盖已有）
      if (m && !r.msku) r.msku = m;
      if (a && !r.asin) r.asin = a;
      if (s && !r.sku) r.sku = s;
      if (!r.name) r.name = pickField<string>(row, [...LX.name]);
      if (!r.store) r.store = pickField<string>(row, [...LX.store]);
    }
    if (m && !aliasIndex.has(`m:${m}`)) aliasIndex.set(`m:${m}`, r);
    if (a && !aliasIndex.has(`a:${a}`)) aliasIndex.set(`a:${a}`, r);
    if (s && !aliasIndex.has(`s:${s}`)) aliasIndex.set(`s:${s}`, r);
    return r;
  };
  listingRows.forEach(ensure);

  // 2. 挂销量 / 销售额
  salesRows.forEach((row) => {
    const r = ensure(row);
    r.sales = toNum(pickField(row, [...LX.sales7]), r.sales);
    r.sales30d = toNum(pickField(row, [...LX.sales30]), r.sales30d ?? 0);
    r.revenue = toNum(pickField(row, [...LX.revenue7]), r.revenue);
  });

  // 3. 挂广告数据；ACoS 优先直取，拿不到则用 花费/广告销售额 计算
  adRows.forEach((row) => {
    const r = ensure(row);
    r.adSpend = toNum(pickField(row, [...LX.adSpend7]), r.adSpend);
    const directAcos = pickField<string | number>(row, [...LX.acos]);
    const adSales = toNum(pickField(row, [...LX.adSales7]), 0);
    if (directAcos != null) {
      r.acos = toNum(directAcos, 0);
    } else if (adSales > 0) {
      r.acos = Math.round((r.adSpend / adSales) * 10000) / 100;
    }
  });

  // 4. 挂库存（FBA 可售 / 海外仓）
  stockRows.forEach((row) => {
    const r = ensure(row);
    r.fbaStock = toNum(pickField(row, [...LX.fbaStock]), r.fbaStock);
  });
  whRows.forEach((row) => {
    const r = ensure(row);
    r.whStock = toNum(pickField(row, [...LX.whStock]), r.whStock);
    if (!r.fbaStock) r.fbaStock = toNum(pickField(row, ["fba_stock", "fba_available", "FBA库存"]), 0);
  });

  // 5. 退款数量（多在销量/售后报表里）
  [...salesRows, ...adRows].forEach((row) => {
    const r = ensure(row);
    const refund = pickField<number | string>(row, [...LX.refundQty]);
    if (refund != null) r.refundQty = toNum(refund, 0);
  });

  // 6. 丢掉完全无标识的行（无法写入系统主键）
  return rows.filter((r) => r.msku || r.asin || r.sku);
}
