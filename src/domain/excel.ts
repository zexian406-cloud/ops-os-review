// SECURITY: xlsx 0.18.5 存在原型污染和 ReDoS 漏洞，仅用于本地 Excel 解析，输入来自用户上传文件，建议后续评估替换为 exceljs
// build-trigger: force fresh Cloudflare build to include recordMskuPrice/mskuMetrics
import * as XLSX from "xlsx";
import type { SkuMaster, DailySnapshot, InventoryLayer, TransitBatch, FactoryBatch } from "./types";
import { buildColumnMap, headersOf, matchColumn, pickCell } from "./columnMatcher";

const num = (v: unknown, fallback = 0): number => {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};

/** 读取百分比值：Excel 百分比格式存为小数（7.23%→0.0723），自动转成整数（7.23） */
const pct = (v: unknown, fallback = 0): number => {
  const n = num(v, fallback);
  if (n > 0 && n < 1) return Math.round(n * 10000) / 100;
  return n;
};

const str = (v: unknown, fallback = ""): string => {
  if (v == null) return fallback;
  return String(v).trim();
};

const mapTransitStatus = (v: string): TransitBatch["status"] => {
  if (v.includes("卸船") || v.includes("到仓") || v.includes("签收")) return "receiving";
  if (v.includes("提柜") || v.includes("清关")) return "customs";
  if (v.includes("到港")) return "at_port";
  return "in_transit";
};

const mapFactoryStatus = (v: string): FactoryBatch["status"] => {
  const lower = String(v).toLowerCase();
  if (lower.includes("ship") || lower.includes("出货") || lower.includes("发货")) return "shipped";
  if (lower.includes("ready") || lower.includes("完成") || lower.includes("备齐") || lower.includes("已备料")) return "ready";
  return "producing";
};

/** 按前缀匹配 Sheet 名，返回第一个匹配的 Sheet */
function findSheet(wb: XLSX.WorkBook, names: string[]): XLSX.WorkSheet | undefined {
  for (const name of names) {
    const exact = wb.Sheets[name];
    if (exact) return exact;
  }
  // 前缀匹配
  for (const sheetName of wb.SheetNames) {
    for (const prefix of names) {
      if (sheetName.startsWith(prefix)) return wb.Sheets[sheetName];
    }
  }
  return undefined;
}

export interface ImportResult {
  skuMaster: SkuMaster[];
  dailySnapshot: DailySnapshot[];
  inventoryLayer: InventoryLayer[];
  transitBatches: Map<string, TransitBatch[]>;
  factoryBatches: Map<string, FactoryBatch[]>;
  /** 头程更新 sheet 解析出的头程/配送费映射（SKU → {shipping, delivery}） */
  shippingMap: Map<string, { shipping: number; delivery: number }>;
  today: string;
  droppedFields: string[];
  addedFields: string[];
  /** 字段识别结果：逻辑字段 → 实际命中的表头（用于导入页展示，供用户确认）。仅包含已命中的字段。 */
  columnMap: Record<string, string>;
  /** 未识别到的关键字段（"sku" / "sales"）。非空则应阻断导入。 */
  missingCritical: string[];
}

/**
 * Parse the Bundle（综合运营表）Excel.
 * 7 sheets:
 *   SKU标识符 → SkuMaster
 *   销量导入/周销量导入 → DailySnapshot
 *   FBA库存明细 → InventoryLayer.fbaStock
 *   仓库明细(FBM)/仓库明细 → InventoryLayer.fbmStock + warehouseBreakdown
 *   在途明细 → TransitBatch
 *   工厂明细 → FactoryBatch
 *   头程更新 → SkuMaster.costShipping / costDelivery
 *
 * 列名全部走 matchColumn 模糊匹配（规则 H）：领星 / Amazon 后台导出的列名
 * 可能是 FOB / 采购价 / 产品成本 / 含税成本 等，不再写死精确列名。
 */
export function parseOperationExcel(buffer: ArrayBuffer, customDate?: string): ImportResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const today = customDate || new Date().toISOString().slice(0, 10);

  // 字段识别结果汇总（逻辑字段 → 实际表头）
  const columnMap: Record<string, string> = {};
  const noteCols = (m: Record<string, string | undefined>) => {
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (v) columnMap[k] = v;
    }
  };

  // ── Step 1: Parse SKU标识符 → skuMaster ──
  // 支持多MSKU：同一SKU出现多次时，首次为父SKU，后续为子MSKU（设groupSku）
  const skuMaster: SkuMaster[] = [];
  const idSheet = findSheet(wb, ["SKU标识符", "SKU标识符(一次性迁移)"]);
  const idSheetPresent = !!idSheet;
  if (idSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(idSheet, { defval: "" });
    const idHeaders = headersOf(rows);
    const c = buildColumnMap(
      [
        "sku", "msku", "name", "asin", "store", "price", "shippingFee", "fob", "costStorage",
        "fulfillment", "upc", "category", "launchDate", "linkType",
        "packageLength", "packageWidth", "packageHeight", "packageWeight", "unitsPerBox",
        "productUrl", "competitorUrls",
      ],
      idHeaders,
    );
    noteCols(c);
    const seenSku = new Set<string>();
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      const name = str(pickCell(row, c.name)) || sku;
      const msku = str(pickCell(row, c.msku)) || undefined;
      const store = str(pickCell(row, c.store)) || "-";
      const asin = str(pickCell(row, c.asin)) || undefined;
      const price = num(pickCell(row, c.price));
      // 运费（收入侧，买家支付的运费）→ 自动计算销售总价 listPrice = 售价 + 运费
      const shippingFee = num(pickCell(row, c.shippingFee));
      const listPrice = shippingFee > 0 ? price + shippingFee : (price > 0 ? price : undefined);
      // FOB 等仍 >0 才保留（避免空串/0 污染），但列名识别用模糊匹配
      const costFob = num(pickCell(row, c.fob)) > 0 ? num(pickCell(row, c.fob)) : undefined;
      const costStorage = num(pickCell(row, c.costStorage)) > 0 ? num(pickCell(row, c.costStorage)) : undefined;
      const fulfillment = normalizeFulfillment(pickCell(row, c.fulfillment));
      const upc = str(pickCell(row, c.upc)) || undefined;
      const category = str(pickCell(row, c.category)) || undefined;
      const launchDate = str(pickCell(row, c.launchDate)) || undefined;
      const linkType = normalizeLinkType(pickCell(row, c.linkType));
      const packageLength = num(pickCell(row, c.packageLength)) > 0 ? num(pickCell(row, c.packageLength)) : undefined;
      const packageWidth = num(pickCell(row, c.packageWidth)) > 0 ? num(pickCell(row, c.packageWidth)) : undefined;
      const packageHeight = num(pickCell(row, c.packageHeight)) > 0 ? num(pickCell(row, c.packageHeight)) : undefined;
      const packageWeight = num(pickCell(row, c.packageWeight)) > 0 ? num(pickCell(row, c.packageWeight)) : undefined;
      const unitsPerBox = num(pickCell(row, c.unitsPerBox)) > 0 ? num(pickCell(row, c.unitsPerBox)) : undefined;
      // FIX: 产品链接 / 竞品链接（支持多竞品，按换行/分号/逗号分隔）
      const productUrl = str(pickCell(row, c.productUrl)) || undefined;
      const competitorUrlsRaw = str(pickCell(row, c.competitorUrls));
      const competitorUrls = competitorUrlsRaw
        ? competitorUrlsRaw.split(/[\n;；|]+/).map((s) => s.trim()).filter(Boolean)
        : undefined;

      if (!seenSku.has(sku)) {
        // 首次出现 → 父SKU
        seenSku.add(sku);
        const rec: SkuMaster = {
          sku,
          name,
          store,
          price,
          listPrice,
          asin,
          msku,
          upc,
          category,
          launchDate,
          packageLength,
          packageWidth,
          packageHeight,
          packageWeight,
          unitsPerBox,
          costFob,
          costStorage,
          fulfillment,
          linkType,
          saleStatus: "active",
          productUrl,
          competitorUrls: competitorUrls && competitorUrls.length > 0 ? competitorUrls : undefined,
        };
        // 父行 MSKU 也按行保留店铺（多 MSKU 场景各店铺不同）
        recordMskuStore(rec, msku, store);
        // FIX: 父行 MSKU 也记录 ASIN，展开子项时各 MSKU 显示自身 ASIN
        recordMskuAsin(rec, msku, asin);
        // FIX: 父行 MSKU 也记录售价/运费/销售总价，展开子项时各 MSKU 显示自身价格
        recordMskuPrice(rec, msku, price, shippingFee, listPrice);
        // FIX: 父行 MSKU 也记录链接类型，ASIN 显示逻辑据此判断是否回退父级
        recordMskuLinkType(rec, msku, linkType);
        skuMaster.push(rec);
      } else {
        // 再次出现（同一「SKU」系列下的多变体行）→ 合并进首条记录，绝不另建独立主键。
        // 整库库存/销量均以「SKU」列(家族码)为关联键，变体若拆成 MSKU/拼接码主键会失联。
        // 故：重复行的属性补进已有记录，sku 仍为干净的家族码，不产生中文/拼接垃圾码。
        const existing = skuMaster.find((s) => s.sku === sku);
        if (existing) {
          // MSKU：收集全部变体（含 MSKU=SKU 的情况），逗号拼接避免丢信息
          if (msku && !existing.msku?.split(",").includes(msku)) {
            existing.msku = existing.msku ? `${existing.msku},${msku}` : msku;
          }
          // 各 MSKU 独立店铺：按行保留到 mskuStores（首次出现为准）
          recordMskuStore(existing, msku, store);
          // FIX: 各 MSKU 独立 ASIN：按行保留到 mskuAsins（首次出现为准）
          recordMskuAsin(existing, msku, asin);
          // FIX: 各 MSKU 独立售价/运费/销售总价：按行保留到 mskuMetrics（首次出现为准）
          recordMskuPrice(existing, msku, price, shippingFee, listPrice);
          // FIX: 各 MSKU 独立链接类型：按行保留到 mskuLinkTypes（首次出现为准）
          recordMskuLinkType(existing, msku, linkType);
          // 父级 store 回填：首行店铺为空/占位（'-'）时，用后续行的店铺补齐
          if ((!existing.store || existing.store === "-") && store && store !== "-") {
            existing.store = store;
          }
          if (!existing.asin && asin) existing.asin = asin;
          if ((!existing.name || existing.name === sku) && name && name !== sku) existing.name = name;
          if (existing.price == null && price != null) existing.price = price;
          if (existing.listPrice == null && listPrice != null) existing.listPrice = listPrice;
          if (!existing.upc && upc) existing.upc = upc;
          if (!existing.category && category) existing.category = category;
          if (!existing.launchDate && launchDate) existing.launchDate = launchDate;
          if (existing.costFob == null && costFob != null) existing.costFob = costFob;
          if (!existing.costStorage && costStorage) existing.costStorage = costStorage;
          if (!existing.fulfillment && fulfillment) existing.fulfillment = fulfillment;
          if (!existing.unitsPerBox && unitsPerBox) existing.unitsPerBox = unitsPerBox;
          if (!existing.packageLength && packageLength) existing.packageLength = packageLength;
          if (!existing.packageWidth && packageWidth) existing.packageWidth = packageWidth;
          if (!existing.packageHeight && packageHeight) existing.packageHeight = packageHeight;
          if (!existing.packageWeight && packageWeight) existing.packageWeight = packageWeight;
          // FIX: 链接补齐（首次出现为准）
          if (!existing.productUrl && productUrl) existing.productUrl = productUrl;
          if ((!existing.competitorUrls || existing.competitorUrls.length === 0) && competitorUrls && competitorUrls.length > 0) {
            existing.competitorUrls = competitorUrls;
          }
        }
        // 不 push 新记录 → 不产生重复主键 / 中文 / 拼接垃圾码
      }
    }
  }

  // ── Step 2: Parse 销量导入 → dailySnapshot（合并原运营数据导入字段：品名/链接）──
  const dailySnapshot: DailySnapshot[] = [];
  // 支持"销量导入"、"周销量导入"、"运营数据导入"三种Sheet名（兼容旧模板）
  const salesSheet = findSheet(wb, ["销量导入", "周销量导入", "运营数据导入"]);
  const salesSheetPresent = !!salesSheet;
  if (salesSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(salesSheet, { defval: "" });
    const salesHeaders = headersOf(rows);
    // 合并原运营数据导入的独有字段：name(品名)、productUrl(产品链接)、competitorUrls(竞品链接)
    const c = buildColumnMap(
      ["sku", "msku", "asin", "store", "sales7d", "sales30d", "rating", "reviewCount", "adRatio", "returnRate", "refundRate", "name", "productUrl", "competitorUrls"],
      salesHeaders,
    );
    noteCols(c);
    // FIX: 构建 msku → sku 反查映射（当表中只有 MSKU 列时用）
    const mskuToSku = new Map<string, string>();
    // FIX: 构建 ASIN → 子记录 sku 映射（MSKU 为空时按 ASIN 关联独立指标）
    const asinToChildSku = new Map<string, string>();
    // FIX: 构建 SKU|店铺 → MSKU 映射（MSKU为空时用店铺匹配，这是最可靠的匹配方式）
    const skuShopToMsku = new Map<string, string>();
    for (const s of skuMaster) {
      if (s.msku) {
        for (const m of s.msku.split(",")) {
          const trimmed = m.trim();
          if (trimmed) mskuToSku.set(trimmed, s.sku);
        }
      }
      // 子记录（有 groupSku 或 sku 与父级不同）的 ASIN 映射
      if (s.asin) {
        asinToChildSku.set(s.asin, s.sku);
      }
      // FIX: 从 mskuStores 构建 SKU+店铺→MSKU 映射
      // mskuStores 格式: { mskuName: shopName }
      if (s.mskuStores) {
        for (const [mskuName, shopName] of Object.entries(s.mskuStores)) {
          if (shopName) {
            skuShopToMsku.set(`${s.sku}|${shopName}`, mskuName);
          }
        }
      }
    }
    // FIX: 按 sku 聚合多 MSKU 行的指标（家族级快照仍取平均，保证向后兼容），
    //      同时按 MSKU 行保留独立指标到父 SKU 的 mskuMetrics（不取平均），
    //      这样展开 MSKU 子项时能展示各 MSKU 自身的退款率/退货率/广告费比/星级。
    const skuAgg = new Map<string, {
      sales7d: number[]; sales30d: number[];
      rating: number[]; reviewCount: number[]; adRatio: number[];
      returnRate: number[]; refundRate: number[];
    }>();
    // FIX: 合并原运营数据导入功能：收集品名/店铺/ASIN/链接信息（first-wins）
    const infoAgg = new Map<string, {
      name?: string; store?: string; asin?: string;
      productUrl?: string; competitorUrls?: string[];
    }>();
    // FIX: 按 sku 收集各 MSKU 独立指标（不取平均，按行保留）
    const mskuMetricsAgg = new Map<string, Record<string, {
      rating?: number; reviewCount?: number; adRatio?: number;
      returnRate?: number; refundRate?: number; sales7d?: number; sales30d?: number;
    }>>();
    for (const row of rows) {
      let sku = str(pickCell(row, c.sku));
      const msku = str(pickCell(row, c.msku));
      // FIX: 当 sku 为空时，用 msku 反查父 SKU
      if (!sku && msku) {
        sku = mskuToSku.get(msku) ?? "";
      }
      // FIX: 当 sku 实际是 MSKU 编码时（销量导入表中 SKU 列可能存的是 MSKU 而非家族码），反查父 SKU
      if (sku && mskuToSku.has(sku)) {
        sku = mskuToSku.get(sku)!;
      }
      if (!sku) continue;
      // 合并原运营数据导入：收集品名/店铺/ASIN/链接（first-wins）
      if (!infoAgg.has(sku)) {
        const nameRaw = str(pickCell(row, c.name));
        const storeRaw = str(pickCell(row, c.store)) || (skuMaster.find((s) => s.sku === sku)?.store) || "-";
        const asinRaw = str(pickCell(row, c.asin));
        const productUrlRaw = str(pickCell(row, c.productUrl)) || undefined;
        const compRaw = str(pickCell(row, c.competitorUrls));
        const compUrls = compRaw ? compRaw.split(/[\n;；|]+/).map((s) => s.trim()).filter(Boolean) : undefined;
        infoAgg.set(sku, {
          name: nameRaw && nameRaw !== sku ? nameRaw : undefined,
          store: storeRaw !== "-" ? storeRaw : undefined,
          asin: asinRaw || undefined,
          productUrl: productUrlRaw,
          competitorUrls: compUrls && compUrls.length > 0 ? compUrls : undefined,
        });
      }
      // 支持"7天销量"(周期总量)自动算日均，也兼容"近7天日均"(直接日均值)
      const sales7dRaw = num(pickCell(row, c.sales7d));
      const isWeeklyTotal = c.sales7d != null && !/日均|日销量|daily/i.test(c.sales7d);
      const daily7d = isWeeklyTotal ? Math.round((sales7dRaw / 7) * 100) / 100 : sales7dRaw;
      const monthlyRaw = num(pickCell(row, c.sales30d));
      // 30天销量导入的是周期总量 → monthlySales 存总量，dailySales30d 存日均
      const isMonthlyTotal = c.sales30d != null;
      const monthlyDaily = isMonthlyTotal ? Math.round((monthlyRaw / 30) * 100) / 100 : monthlyRaw;
      // 可选字段：评分、评论数、广告费比、退货率、退款率
      const rating = num(pickCell(row, c.rating));
      const reviewCount = num(pickCell(row, c.reviewCount));
      const adRatio = pct(pickCell(row, c.adRatio));
      const returnRate = pct(pickCell(row, c.returnRate));
      const refundRate = pct(pickCell(row, c.refundRate));
      // FIX: 收集各 MSKU 的指标值到聚合 Map（而非直接 push 导致同 SKU 多条快照互相覆盖）
      if (!skuAgg.has(sku)) {
        skuAgg.set(sku, { sales7d: [], sales30d: [], rating: [], reviewCount: [], adRatio: [], returnRate: [], refundRate: [] });
      }
      const agg = skuAgg.get(sku)!;
      agg.sales7d.push(daily7d);
      agg.sales30d.push(monthlyRaw);
      agg.rating.push(rating);
      agg.reviewCount.push(reviewCount);
      agg.adRatio.push(adRatio);
      agg.returnRate.push(returnRate);
      agg.refundRate.push(refundRate);
      // FIX: 按 MSKU 行保留独立指标（不取平均）——这是修复"展开列表显示相同数据"的关键
      // MSKU 列可能是逗号分隔多值（如 "BFRS258,BFRS258-GM"），需拆分后分别记录
      // 当 MSKU 为空时，按优先级查找：SKU+店铺 → ASIN → 不记录
      let mskuTokens: string[] = [];
      if (msku) {
        mskuTokens = msku.split(/[,\s，、·]+/).map((t) => t.trim()).filter(Boolean);
      } else {
        // 优先用 SKU+店铺 匹配（最可靠，因为每个MSKU对应唯一店铺）
        const storeVal = str(pickCell(row, c.store));
        if (storeVal && skuShopToMsku.has(`${sku}|${storeVal}`)) {
          mskuTokens = [skuShopToMsku.get(`${sku}|${storeVal}`)!];
        } else {
          // 次选用 ASIN 查找子记录 SKU（适用于子记录有独立ASIN的情况）
          const asinVal = str(pickCell(row, c.asin));
          if (asinVal && asinToChildSku.has(asinVal)) {
            mskuTokens = [asinToChildSku.get(asinVal)!];
          }
        }
      }
      if (!mskuMetricsAgg.has(sku)) mskuMetricsAgg.set(sku, {});
      const skuMetricsMap = mskuMetricsAgg.get(sku)!;
      // FIX: 同时记录各 MSKU 对应的 ASIN（如有）
      const salesRowAsin = str(pickCell(row, c.asin));
      for (const mskuKey of mskuTokens) {
        if (!mskuKey) continue;
        // 记录 MSKU → ASIN 映射（first-wins）
        if (salesRowAsin) {
          const master = skuMaster.find((s) => s.sku === sku);
          if (master) recordMskuAsin(master, mskuKey, salesRowAsin);
        }
        // 每个MSKU首次写入时保留已有字段，避免覆盖Step1写入的price/shippingFee/listPrice
        if (!skuMetricsMap[mskuKey]) {
          skuMetricsMap[mskuKey] = {};
        }
        const m = skuMetricsMap[mskuKey];
        if (m.rating == null && rating > 0) m.rating = Math.round(rating * 10) / 10;
        if (m.reviewCount == null && reviewCount > 0) m.reviewCount = Math.round(reviewCount);
        if (m.adRatio == null && adRatio > 0) m.adRatio = Math.round(adRatio * 100) / 100;
        if (m.returnRate == null && returnRate > 0) m.returnRate = Math.round(returnRate * 100) / 100;
        if (m.refundRate == null && refundRate > 0) m.refundRate = Math.round(refundRate * 100) / 100;
        if (m.sales7d == null && daily7d > 0) m.sales7d = daily7d;
        if (m.sales30d == null && monthlyRaw > 0) m.sales30d = monthlyRaw;
      }
    }
    // FIX: 销量(绝对值)取总和，比率类指标取平均。
    //   之前 sales7d/sales30d 用 avgArr 会让多 MSKU 的 SKU 月销变小(看起来像日销)。
    //   修正：dailySales7d = 各 MSKU 日均之和(SKU 总日均)，monthlySales = 各 MSKU 月销之和(SKU 总月销)。
    const sumArr = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) : 0;
    const avgNonZero = (arr: number[]) => {
      const nonZero = arr.filter((v) => v > 0);
      return nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
    };
    for (const [sku, agg] of skuAgg) {
      const daily7d = sumArr(agg.sales7d);
      const monthlyTotal = sumArr(agg.sales30d);
      const monthlyDaily = monthlyTotal > 0 ? Math.round((monthlyTotal / 30) * 100) / 100 : 0;
      const rating = avgNonZero(agg.rating);
      const reviewCount = avgNonZero(agg.reviewCount);
      const adRatio = avgNonZero(agg.adRatio);
      const returnRate = avgNonZero(agg.returnRate);
      const refundRate = avgNonZero(agg.refundRate);
      dailySnapshot.push({
        date: today,
        sku,
        dailySales7d: Math.round(daily7d * 100) / 100,
        dailySales30d: monthlyDaily,
        monthlySales: Math.round(monthlyTotal * 100) / 100,
        stockOnHand: 0,
        stockInTransit: 0,
        daysOfCoverOnHand: daily7d > 0 ? Number((0 / daily7d).toFixed(1)) : Infinity,
        daysOfCoverWithTransit: daily7d > 0 ? Number((0 / daily7d).toFixed(1)) : Infinity,
        adSpend: 0,
        adRatio: Math.round(adRatio * 100) / 100 || 0,
        profit: 0,
        profitMargin: 0,
        totalCost: 0,
        rating: Math.round(rating * 10) / 10 || 0,
        reviewCount: reviewCount > 0 ? Math.round(reviewCount) : undefined,
        returnRate: Math.round(returnRate * 100) / 100 || 0,
        refundRate: refundRate > 0 ? Math.round(refundRate * 100) / 100 : undefined,
      });
    }
    // FIX: 把各 MSKU 独立指标合并到父 SKU 的 mskuMetrics 字段（保留 Step 1 写入的 price/shippingFee/listPrice）
    for (const [sku, metrics] of mskuMetricsAgg) {
      const master = skuMaster.find((s) => s.sku === sku);
      if (master) {
        if (!master.mskuMetrics) master.mskuMetrics = {};
        for (const [mskuName, metric] of Object.entries(metrics)) {
          if (!master.mskuMetrics[mskuName]) master.mskuMetrics[mskuName] = {};
          // 合并指标（rating/sales等），不覆盖已有的 price/shippingFee/listPrice
          Object.assign(master.mskuMetrics[mskuName], metric);
        }
      }
    }
    // FIX: 合并原运营数据导入：品名/店铺/ASIN/链接更新到skuMaster
    for (const [sku, info] of infoAgg) {
      let master = skuMaster.find((s) => s.sku === sku);
      if (!master) {
        // SKU标识符Sheet不存在时，销量导入也能新建SKU
        master = {
          sku, name: info.name || sku, store: info.store || "-", price: 0,
          saleStatus: "active", fulfillment: "FBM",
          asin: info.asin, productUrl: info.productUrl, competitorUrls: info.competitorUrls,
        };
        skuMaster.push(master);
      } else {
        // first-wins 策略：仅补空，不覆盖已有值（与 handleSalesImport 保持一致）
        if (info.store && info.store !== "-") master.store = info.store;
        if (info.name && info.name !== sku && !master.name) master.name = info.name;
        if (info.asin && !master.asin) master.asin = info.asin;
        if (!master.productUrl && info.productUrl) master.productUrl = info.productUrl;
        if ((!master.competitorUrls || master.competitorUrls.length === 0) && info.competitorUrls && info.competitorUrls.length > 0) {
          master.competitorUrls = info.competitorUrls;
        }
      }
    }
  }

  // ── Step 3: Parse FBA库存明细 → fbaStock map ──
  const fbaMap = new Map<string, number>();
  const fbaSheet = findSheet(wb, ["FBA库存明细", "FBA库存"]);
  if (fbaSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(fbaSheet, { defval: "" });
    const c = buildColumnMap(["sku", "fbaStock"], headersOf(rows));
    noteCols(c);
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      fbaMap.set(sku, num(pickCell(row, c.fbaStock)));
    }
  }

  // ── Step 4: Parse 仓库明细(FBM) → warehouse breakdown ──
  const warehouseMap = new Map<string, { warehouse: string; qty: number }[]>();
  const warehouseSheet = findSheet(wb, ["仓库明细(FBM)", "仓库明细"]);
  if (warehouseSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(warehouseSheet, { defval: "" });
    const c = buildColumnMap(["sku", "warehouse", "qty"], headersOf(rows));
    noteCols(c);
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      const warehouse = str(pickCell(row, c.warehouse));
      const qty = num(pickCell(row, c.qty));
      if (!warehouse) continue;
      const list = warehouseMap.get(sku) ?? [];
      list.push({ warehouse, qty });
      warehouseMap.set(sku, list);
    }
  }

  // ── Step 5: Parse 在途明细 → transitBatches ──
  const transitBatches = new Map<string, TransitBatch[]>();
  const transitSheet = findSheet(wb, ["在途明细"]);
  if (transitSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(transitSheet, { defval: "" });
    const c = buildColumnMap(["sku", "provider", "dest", "etaDate", "shipDate", "qty", "statusText"], headersOf(rows));
    noteCols(c);
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      const provider = str(pickCell(row, c.provider));
      const dest = str(pickCell(row, c.dest));
      const warehouse = provider && dest ? `${provider}-${dest}` : provider || dest || "在途";
      const etaRaw = pickCell(row, c.etaDate);
      // 预计到仓直接保留原始文本（支持多行/中文/件数前缀等任意格式），不做日期解析避免识别失败
      const etaDate = str(etaRaw);
      const statusTextVal = str(pickCell(row, c.statusText));
      const batch: TransitBatch = {
        warehouse,
        qty: num(pickCell(row, c.qty)),
        etaDate,
        shipDate: str(pickCell(row, c.shipDate)) || undefined,
        statusText: statusTextVal || undefined,
        shipMethod: "sea",
        status: mapTransitStatus(statusTextVal),
      };
      const list = transitBatches.get(sku) ?? [];
      list.push(batch);
      transitBatches.set(sku, list);
    }
  }

  // ── Step 6: Parse 工厂明细 → factoryBatches ──
  const factoryBatches = new Map<string, FactoryBatch[]>();
  const factorySheet = findSheet(wb, ["工厂明细"]);
  if (factorySheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(factorySheet, { defval: "" });
    const c = buildColumnMap(["sku", "factoryName", "qty", "totalQty", "deliveryDate", "factoryStatus"], headersOf(rows));
    noteCols(c);
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      const batch: FactoryBatch = {
        factoryName: str(pickCell(row, c.factoryName)),
        qty: num(pickCell(row, c.qty)),
        totalQty: num(pickCell(row, c.totalQty)) || undefined,
        deliveryDate: str(pickCell(row, c.deliveryDate)),
        status: mapFactoryStatus(str(pickCell(row, c.factoryStatus))),
      };
      const list = factoryBatches.get(sku) ?? [];
      list.push(batch);
      factoryBatches.set(sku, list);
    }
  }

  // ── Step 7: Parse 头程更新 → costShipping / costDelivery map ──
  const shippingMap = new Map<string, { shipping: number; delivery: number }>();
  const shipSheet = findSheet(wb, ["头程尾程更新", "头程更新", "头程"]);
  if (shipSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(shipSheet, { defval: "" });
    const c = buildColumnMap(["sku", "shipping", "delivery"], headersOf(rows));
    noteCols(c);
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      const shipping = num(pickCell(row, c.shipping));
      const delivery = num(pickCell(row, c.delivery));
      if (shipping > 0 || delivery > 0) {
        shippingMap.set(sku, { shipping, delivery });
      }
    }
  }

  // ── Merge shipping into skuMaster ──
  for (const master of skuMaster) {
    const ship = shippingMap.get(master.sku);
    if (ship) {
      if (ship.shipping > 0) master.costShipping = ship.shipping;
      if (ship.delivery > 0) master.costDelivery = ship.delivery;
    }
  }

  // ── Step 9: Build inventoryLayer by merging FBA + FBM + transit + factory ──
  const allSkus = new Set<string>();
  for (const sku of fbaMap.keys()) allSkus.add(sku);
  for (const sku of warehouseMap.keys()) allSkus.add(sku);
  for (const sku of transitBatches.keys()) allSkus.add(sku);
  for (const sku of factoryBatches.keys()) allSkus.add(sku);

  const inventoryLayer: InventoryLayer[] = [];
  for (const sku of allSkus) {
    const fba = fbaMap.get(sku) ?? 0;
    const warehouses = warehouseMap.get(sku);
    const fbm = warehouses ? warehouses.reduce((s, w) => s + w.qty, 0) : 0;
    const tb = transitBatches.get(sku);
    const fb = factoryBatches.get(sku);
    const factoryQty = fb ? fb.reduce((s, b) => s + b.qty, 0) : 0;

    const layer: InventoryLayer = {
      date: today,
      sku,
      fbaStock: fba,
      fbmStock: fbm,
      factoryStock: factoryQty,
      eastTransit: 0,
      westTransit: 0,
      southeast: 0,
      southcentral: 0,
    };
    if (warehouses && warehouses.length > 0) {
      layer.warehouseBreakdown = warehouses.map((w) => ({
        warehouse: w.warehouse,
        qty: w.qty,
        daysOfCover: 0,
      }));
    }
    if (tb && tb.length > 0) layer.transitBatches = tb;
    if (fb && fb.length > 0) layer.factoryBatches = fb;
    inventoryLayer.push(layer);
  }

  // ── 关键字段缺失判定（规则 H：未识别到 SKU / 销量则阻断导入）──
  const missingCritical: string[] = [];
  if (idSheetPresent && !columnMap["sku"]) missingCritical.push("sku");
  if (salesSheetPresent && !columnMap["sales7d"] && !columnMap["sales30d"]) missingCritical.push("sales");

  return {
    skuMaster,
    dailySnapshot,
    inventoryLayer,
    transitBatches,
    factoryBatches,
    shippingMap,
    today,
    droppedFields: [],
    addedFields: [],
    columnMap,
    missingCritical,
  };
}
/** 统一发货方式：支持中文"混发"→"mixed"，默认FBM */
const normalizeFulfillment = (v: unknown): "FBA" | "FBM" | "mixed" => {
  const val = str(v);
  if (val === "FBA") return "FBA";
  if (val === "FBM") return "FBM";
  if (val === "mixed" || val === "混发" || val === "混卖") return "mixed";
  return "FBM"; // 用户主要做FBM
};

/** 统一链接类型：支持中文映射，空值返回 undefined（不设置） */
const normalizeLinkType = (v: unknown): "main" | "follow" | "backup" | undefined => {
  const val = str(v).toLowerCase();
  if (!val) return undefined;
  if (val === "main" || val === "主链接" || val === "主") return "main";
  if (val === "follow" || val === "跟卖" || val === "跟卖链接") return "follow";
  if (val === "backup" || val === "备用" || val === "备用链接") return "backup";
  return "main"; // 默认主链接
};

/**
 * 把某行的 MSKU（可能逗号/空格/顿号/间隔号分隔多值）对应的店铺记录到父记录的 mskuStores。
 * 同一 MSKU 重复出现且店铺不同 → 首次出现为准（first-wins），保证确定性、可重复导入幂等。
 * 家族码本身（== 父 SKU）不计为变体；占位店铺 '-' 不记录。
 */
export function recordMskuStore(existing: SkuMaster, mskuRaw: string | undefined, storeVal: string): void {
  if (!mskuRaw || !storeVal || storeVal === "-") return;
  const tokens = mskuRaw.split(/[,\s，、·]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (t === existing.sku) continue; // 家族码本身不算 MSKU 变体
    if (!existing.mskuStores) existing.mskuStores = {};
    if (!(t in existing.mskuStores)) existing.mskuStores[t] = storeVal; // first-wins
  }
}

/**
 * 把某行的 MSKU 对应的 ASIN 记录到父记录的 mskuAsins。
 * first-wins：同一 MSKU 重复出现时首次 ASIN 为准。
 * 注意：不跳过 t === existing.sku 的情况（MSKU 可能就是 SKU 本身，也需记录 ASIN）。
 */
export function recordMskuAsin(existing: SkuMaster, mskuRaw: string | undefined, asinVal: string | undefined): void {
  if (!mskuRaw || !asinVal) return;
  const tokens = mskuRaw.split(/[,\s，、·]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (!existing.mskuAsins) existing.mskuAsins = {};
    if (!(t in existing.mskuAsins)) existing.mskuAsins[t] = asinVal; // first-wins
  }
}

/**
 * 把某行的 MSKU 对应的链接类型记录到父记录的 mskuLinkTypes。
 * first-wins：同一 MSKU 重复出现时首次链接类型为准。
 * ASIN 显示逻辑据此判断：仅 follow（跟卖）才回退父级 ASIN，非跟卖必须有独立 ASIN。
 */
export function recordMskuLinkType(existing: SkuMaster, mskuRaw: string | undefined, linkType: "main" | "follow" | "backup" | undefined): void {
  if (!mskuRaw || !linkType) return;
  const tokens = mskuRaw.split(/[,\s，、·]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (!existing.mskuLinkTypes) existing.mskuLinkTypes = {};
    if (!(t in existing.mskuLinkTypes)) existing.mskuLinkTypes[t] = linkType; // first-wins
  }
}

/**
 * 把某行的 MSKU 对应的售价/运费/销售总价记录到父记录的 mskuMetrics。
 * 这样展开 MSKU 子项时能展示各 MSKU 自身的销售总价，而非共用父级。
 * first-wins：同一 MSKU 重复出现时首次值为准。
 *
 * 注意：不跳过 t === existing.sku 的情况。因为用户的 SKU 标识符 Sheet 中，
 * MSKU 列可能就填的是 SKU 本身（如 MSKU=BFEGT74, price=185.99），
 * 此时该 MSKU 也应有独立的 price 记录，否则虚拟子项会回退到父级首次出现的 price。
 */
export function recordMskuPrice(
  existing: SkuMaster,
  mskuRaw: string | undefined,
  priceVal: number,
  shippingFeeVal: number,
  listPriceVal: number | undefined,
): void {
  if (!mskuRaw) return;
  const tokens = mskuRaw.split(/[,\s，、·]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (!existing.mskuMetrics) existing.mskuMetrics = {};
    if (!existing.mskuMetrics[t]) existing.mskuMetrics[t] = {};
    const m = existing.mskuMetrics[t];
    if (m.price == null && priceVal != null) m.price = priceVal;
    if (m.shippingFee == null && shippingFeeVal != null) m.shippingFee = shippingFeeVal;
    if (m.listPrice == null && listPriceVal != null) m.listPrice = listPriceVal;
  }
}

