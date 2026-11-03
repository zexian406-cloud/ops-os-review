// SECURITY: xlsx 0.18.5 存在原型污染和 ReDoS 漏洞，仅用于本地 Excel 解析，输入来自用户上传文件，建议后续评估替换为 exceljs
// build-trigger: force fresh Cloudflare build to include recordMskuPrice/mskuMetrics
import * as XLSX from "xlsx";
import type { SkuMaster, DailySnapshot, InventoryLayer, TransitBatch, FactoryBatch } from "./types";
import { buildColumnMap, headersOf, matchColumn, pickCell } from "./columnMatcher";

const num = (v: unknown, fallback = 0): number => {
  if (v == null || v === "") return fallback;
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    // 优先用 Number 解析（支持科学计数法，如 "1.23E+07"），失败时再做字符清洗
    const s = String(v).trim().replace(/,/g, "");
    n = Number(s);
    if (!Number.isFinite(n)) {
      n = parseFloat(s.replace(/[^\d.\-+eE]/g, ""));
    }
  }
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

/** 默认站点 ID → 中文站名，用于复刻站名还原 siteId 与导出展示 */
const SITE_LABELS: Record<string, string> = {
  site_us: "美国站",
  site_uk: "英国站",
  site_de: "德国站",
  site_jp: "日本站",
  site_ca: "加拿大站",
};

/** 把站点列值解析成 siteId：支持 site_xxx / 中文站名。marketplace 码不映射（历史导出列默认全为 US，会误钉到美站）。无法识别返回 undefined（回退当前站） */
const resolveSiteId = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s || s === "-") return undefined;
  if (/^site_[a-z0-9]+$/i.test(s)) return s.toLowerCase();
  const byName = Object.entries(SITE_LABELS).find(([, name]) => name === s);
  if (byName) return byName[0];
  return undefined;
};

/** 日期偏移（本地时区安全）：d 为 "YYYY-MM-DD"，n 可为负。避免 toISOString 的 UTC 偏移错一天 */
const shiftDays = (d: string, n: number): string => {
  const dt = new Date(`${d}T00:00:00`);
  dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

/** 按前缀匹配 Sheet 名，返回第一个匹配的 Sheet */
function findSheet(wb: XLSX.WorkBook, names: string[]): XLSX.WorkSheet | undefined {
  return findSheets(wb, names)[0];
}

/** 按前缀匹配 Sheet 名，返回所有匹配的 Sheet（保留原名匹配优先、工作簿顺序） */
function findSheets(wb: XLSX.WorkBook, names: string[]): XLSX.WorkSheet[] {
  const found: XLSX.WorkSheet[] = [];
  const used = new Set<XLSX.WorkSheet>();
  // Pass 1: 精确匹配（保持 names 优先级）
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (ws && !used.has(ws)) { found.push(ws); used.add(ws); }
  }
  // Pass 2: 前缀匹配（保持工作簿顺序，跳过已收录）
  for (const sheetName of wb.SheetNames) {
    for (const prefix of names) {
      if (sheetName.startsWith(prefix)) {
        const ws = wb.Sheets[sheetName];
        if (ws && !used.has(ws)) { found.push(ws); used.add(ws); }
        break;
      }
    }
  }
  return found;
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
export function parseOperationExcel(
  buffer: ArrayBuffer,
  customDate?: string,
  opts?: { existingMasters?: SkuMaster[] },
): ImportResult {
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
  const composeMap = new Map<string, string>();
  const idSheet = findSheet(wb, ["SKU标识符", "SKU标识符(一次性迁移)", "基础档案"]);
  const idSheetPresent = !!idSheet;
  if (idSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(idSheet, { defval: "" });
    const idHeaders = headersOf(rows);
    const c = buildColumnMap(
      [
        "sku", "msku", "name", "asin", "store", "price", "shippingFee", "fob", "costStorage",
        "fulfillment", "upc", "category", "launchDate", "linkType",
        "packageLength", "packageWidth", "packageHeight", "packageWeight", "unitsPerBox",
        "productUrl", "competitorUrls", "site", "composeFormula", "factoryName",
        "shipping", "delivery",
      ],
      idHeaders,
    );
    noteCols(c);
    const seenSku = new Set<string>();
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      const formula = str(pickCell(row, c.composeFormula)).trim();
      if (formula) composeMap.set(sku, formula);
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
      // 极简基础档案表：默认工厂名（仅首次记录，后续行不覆盖）
      const factoryNameVal = str(pickCell(row, c.factoryName)) || undefined;
      // 极简基础档案表：头程费/配送费（成本侧，旧 SKU标识符表无此两列，由头程更新 Sheet 提供）
      const costShippingVal = num(pickCell(row, c.shipping)) > 0 ? num(pickCell(row, c.shipping)) : undefined;
      const costDeliveryVal = num(pickCell(row, c.delivery)) > 0 ? num(pickCell(row, c.delivery)) : undefined;

      if (!seenSku.has(sku)) {
        // 首次出现 → 父SKU
        seenSku.add(sku);
        const rec: SkuMaster = {
          sku,
          name,
          store,
          siteId: resolveSiteId(pickCell(row, c.site)),
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
          costShipping: costShippingVal,
          costDelivery: costDeliveryVal,
          fulfillment,
          linkType,
          saleStatus: "active",
          productUrl,
          factoryName: factoryNameVal,
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
          // 极简基础档案表：工厂名仅补空，不覆盖已有值
          if (!existing.factoryName && factoryNameVal) existing.factoryName = factoryNameVal;
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
          // 极简基础档案表：头程费/配送费仅补空，不覆盖已有值（头程更新 Sheet 优先）
          if (existing.costShipping == null && costShippingVal != null) existing.costShipping = costShippingVal;
          if (existing.costDelivery == null && costDeliveryVal != null) existing.costDelivery = costDeliveryVal;
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
  // 兼容"销量导入"、"周销量导入"、"运营数据导入"三张Sheet（新旧模板）。
  // FIX: 若文件同时含"销量导入"+"运营数据导入"，需合并两者：销量/链接来自前者，
  //      ACoAS广告费比/退款率/退货率/评分/评论数/品名来自后者——只读一张会丢字段（广告费比恒0）。
  const salesSheets = findSheets(wb, ["销量导入", "周销量导入", "运营数据导入", "运营数据"]);
  const salesSheetPresent = salesSheets.length > 0;
  if (salesSheets.length > 0) {
    const rows: Record<string, unknown>[] = [];
    for (const sheet of salesSheets) {
      rows.push(...XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
    }
    const salesHeaders = headersOf(rows);
    // 「上期」列先映射并占为己有（排除法）：防止 sessions/orders 的 "Sessions"/"订单量" 同义词
    // 模糊命中 "Sessions(上期)"/"订单量(上期)" 列，导致本期/上期串列
    const cP = buildColumnMap(["sessionsPrev", "ordersPrev"], salesHeaders);
    const claimedPrev = new Set(
      [cP.sessionsPrev, cP.ordersPrev].filter((x): x is string => !!x),
    );
    const restHeaders = salesHeaders.filter((h) => !claimedPrev.has(h));
    // 合并原运营数据导入的独有字段：name(品名)、productUrl(产品链接)、competitorUrls(竞品链接)
    // 极简运营数据表新增：sessions/orders(本期)、cvr(转化率反推订单量)、adSpend(广告花费)
    const c = buildColumnMap(
      ["sku", "msku", "asin", "store", "sales7d", "sales30d", "rating", "reviewCount", "adRatio", "returnRate", "refundRate", "name", "productUrl", "competitorUrls", "sessions", "orders", "cvr", "adSpend", "adOrders"],
      restHeaders,
    );
    noteCols(cP);
    noteCols(c);
    // 防误判：若 adSpend 命中的是 "广告花费占比" 这类费比列（旧文件），改判为 adRatio
    if (c.adSpend && !c.adRatio && /占比|费比|ratio|%/i.test(c.adSpend)) {
      c.adRatio = c.adSpend;
      c.adSpend = undefined;
    }
    // 防误判（反向）：adRatio 同义词 "广告花费占比" 模糊包含 "广告花费" 表头，
    // 极简运营数据表只有花费列时 adRatio 会误命中同列。两字段命中同列时按表头语义裁决：
    // 含 占比/费比/ratio 标记 → 费比列；否则 → 花费列
    if (c.adRatio && c.adSpend && c.adRatio === c.adSpend) {
      if (/占比|费比|ratio|%/i.test(c.adRatio)) {
        c.adSpend = undefined;
      } else {
        c.adRatio = undefined;
      }
    }
    // FIX: 构建 msku → sku 反查映射（当表中只有 MSKU 列时用）
    const mskuToSku = new Map<string, string>();
    // 极简运营数据表通常只有 MSKU：额外用数据库已有主档反查（调用方传入 existingMasters）
    const existingMskuToSku = new Map<string, string>();
    for (const s of opts?.existingMasters ?? []) {
      if (s.msku) {
        for (const m of s.msku.split(",")) {
          const trimmed = m.trim();
          if (trimmed) existingMskuToSku.set(trimmed, s.sku);
        }
      }
      if (s.mskuStores) for (const ms of Object.keys(s.mskuStores)) existingMskuToSku.set(ms, s.sku);
      if (s.mskuMetrics) for (const ms of Object.keys(s.mskuMetrics)) existingMskuToSku.set(ms, s.sku);
    }
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
      sessions: number[]; orders: number[];
      sessionsPrev: number[]; ordersPrev: number[]; adSpend: number[];
      adOrders: number[];
      /** 该 SKU 是否出现过非空退款率单元格（区分「真实 0%」与「未导入」） */
      refundSeen: boolean;
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
      // FIX: 当 sku 为空时，用 msku 反查父 SKU（先查本文件主档，再查数据库已有主档）
      if (!sku && msku) {
        sku = mskuToSku.get(msku) ?? existingMskuToSku.get(msku) ?? "";
      }
      // FIX: 当 sku 实际是 MSKU 编码时（销量导入表中 SKU 列可能存的是 MSKU 而非家族码），反查父 SKU
      if (sku && mskuToSku.has(sku)) {
        sku = mskuToSku.get(sku)!;
      }
      // Upsert 兜底「不存在则新增」：MSKU 在本文件和数据库都匹配不上时，
      // 以 MSKU 作为内部 SKU 自动建档（后续基础档案/标识符导入可补全属性）
      if (!sku && msku) {
        sku = msku;
        skuMaster.push({ sku, name: msku, store: "-", price: 0, saleStatus: "active", fulfillment: "FBM", msku });
        existingMskuToSku.set(msku, sku);
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
      // 可选流量/转化字段（业务报告）：本期会话数 / 订单数 → Listing 分流诊断。
      // 仅填 CVR 不填订单量时自动反推：订单量 = Sessions × CVR%（CVR% Excel 存小数 0.082 → pct() 转 8.2）
      const sessions = num(pickCell(row, c.sessions));
      const cvrPct = pct(pickCell(row, c.cvr));
      const ordersRaw = num(pickCell(row, c.orders));
      const orders = ordersRaw > 0
        ? ordersRaw
        : (cvrPct > 0 && sessions > 0 ? Math.round(sessions * (cvrPct / 100) * 100) / 100 : 0);
      // 上期流量/转化（极简运营数据表）：写入 today-7 稀疏快照，供「本期 vs 上期」分流对比
      const sessionsPrev = num(pickCell(row, cP.sessionsPrev));
      const ordersPrev = num(pickCell(row, cP.ordersPrev));
      // 广告花费（绝对值）：本期行聚合后按 7天销量×售价 近似折算费比
      const adSpendVal = num(pickCell(row, c.adSpend));
      // 广告订单数（选填真实数据）：优先于广告费比推导展示
      const adOrdersVal = num(pickCell(row, c.adOrders));
      // FIX: 收集各 MSKU 的指标值到聚合 Map（而非直接 push 导致同 SKU 多条快照互相覆盖）
      if (!skuAgg.has(sku)) {
        skuAgg.set(sku, { sales7d: [], sales30d: [], rating: [], reviewCount: [], adRatio: [], returnRate: [], refundRate: [], sessions: [], orders: [], sessionsPrev: [], ordersPrev: [], adSpend: [], adOrders: [], refundSeen: false });
      }
      const agg = skuAgg.get(sku)!;
      agg.sales7d.push(daily7d);
      agg.sales30d.push(monthlyRaw);
      agg.rating.push(rating);
      agg.reviewCount.push(reviewCount);
      agg.adRatio.push(adRatio);
      agg.returnRate.push(returnRate);
      agg.refundRate.push(refundRate);
      agg.sessions.push(sessions);
      agg.orders.push(orders);
      agg.sessionsPrev.push(sessionsPrev);
      agg.ordersPrev.push(ordersPrev);
      agg.adSpend.push(adSpendVal);
      agg.adOrders.push(adOrdersVal);
      if (c.refundRate != null && str(pickCell(row, c.refundRate)) !== "") agg.refundSeen = true;
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
      // 流量/转化为总量：多 MSKU 求和；无数据（列缺失或全 0）时保持 undefined
      const sessionsTotal = sumArr(agg.sessions);
      const ordersTotal = sumArr(agg.orders);
      const sessionsPrevTotal = sumArr(agg.sessionsPrev);
      const ordersPrevTotal = sumArr(agg.ordersPrev);
      const adSpendTotal = sumArr(agg.adSpend);
      const adOrdersTotal = sumArr(agg.adOrders);
      // ── 自动计算：毛利率（近似口径）──
      // 毛利率 = (售价 − 佣金估 − 配送费 − FOB − 头程费) / 售价；佣金缺省按佣金率(默认15%)估算。
      // 仅当售价和任一成本项(FOB/配送费)有效时计算，避免只有售价时算出虚高 100%。
      const master = skuMaster.find((s) => s.sku === sku);
      const priceVal = num(master?.price);
      let profitEst = 0, marginEst = 0, costEst = 0;
      if (priceVal > 0 && (num(master?.costFob) > 0 || num(master?.costDelivery) > 0)) {
        const commission = num(master?.costCommission) > 0
          ? num(master?.costCommission)
          : priceVal * (num(master?.commissionRate) > 0 ? num(master?.commissionRate) : 15) / 100;
        costEst = commission + num(master?.costDelivery) + num(master?.costFob) + num(master?.costShipping);
        profitEst = Math.round((priceVal - costEst) * 100) / 100;
        marginEst = Math.round((profitEst / priceVal) * 1000) / 10;
      }
      // ── 自动计算：广告花费 → 费比（近似）──
      // 费比 ≈ 广告花费 / (7天销量 × 售价) × 100；Excel 已填费比列时以填写的为准
      const adRatioFinal = adRatio > 0
        ? adRatio
        : (adSpendTotal > 0 && priceVal > 0 && daily7d > 0
          ? Math.round((adSpendTotal / (daily7d * 7 * priceVal)) * 10000) / 100
          : 0);
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
        adSpend: adSpendTotal > 0 ? Math.round(adSpendTotal * 100) / 100 : 0,
        adRatio: Math.round(adRatioFinal * 100) / 100 || 0,
        profit: profitEst,
        profitMargin: marginEst,
        profitSource: profitEst !== 0 ? "ESTIMATED" : undefined,
        totalCost: Math.round(costEst * 100) / 100,
        rating: Math.round(rating * 10) / 10 || 0,
        reviewCount: reviewCount > 0 ? Math.round(reviewCount) : undefined,
        returnRate: Math.round(returnRate * 100) / 100 || 0,
        // 退款率：>0 用均值；列存在且填过（含真实 0%）记 0；整列没填 → undefined（详情页显示「缺失」）
        refundRate: refundRate > 0 ? Math.round(refundRate * 100) / 100 : (agg.refundSeen ? 0 : undefined),
        sessions: sessionsTotal > 0 ? Math.round(sessionsTotal) : undefined,
        orders: ordersTotal > 0 ? Math.round(ordersTotal * 100) / 100 : undefined,
        adOrders: adOrdersTotal > 0 ? Math.round(adOrdersTotal) : undefined,
      });
      // ── 上期快照（稀疏行）：仅含 Sessions/订单量，写入 today-7 ──
      // 供「销量下滑分流」本期 vs 上期对比；销量字段保持 0（诊断均值会跳过这类稀疏行）
      if (sessionsPrevTotal > 0 || ordersPrevTotal > 0) {
        dailySnapshot.push({
          date: shiftDays(today, -7),
          sku,
          dailySales7d: 0,
          monthlySales: 0,
          stockOnHand: 0,
          stockInTransit: 0,
          daysOfCoverOnHand: Infinity,
          daysOfCoverWithTransit: Infinity,
          adSpend: 0,
          adRatio: 0,
          profit: 0,
          profitMargin: 0,
          totalCost: 0,
          rating: 0,
          returnRate: 0,
          sessions: sessionsPrevTotal > 0 ? Math.round(sessionsPrevTotal) : undefined,
          orders: ordersPrevTotal > 0 ? Math.round(ordersPrevTotal * 100) / 100 : undefined,
        });
      }
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

  // ── Step 7.5: Parse 库存物流（极简模板）→ fbaMap / fbmMap / transitBatches ──
  // 新模板「库存物流表」：SKU, FBA在库, FBM库存, 在途件数, 目的仓, 预计到仓
  const fbmMap = new Map<string, number>();
  const logisticsSheet = findSheet(wb, ["库存物流"]);
  if (logisticsSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(logisticsSheet, { defval: "" });
    const c = buildColumnMap(["sku", "fbaStock", "fbmStock", "qty", "dest", "etaDate"], headersOf(rows));
    noteCols(c);
    for (const row of rows) {
      const sku = str(pickCell(row, c.sku));
      if (!sku) continue;
      const fbaVal = num(pickCell(row, c.fbaStock));
      const fbmVal = num(pickCell(row, c.fbmStock));
      if (fbaVal > 0 && !fbaMap.has(sku)) fbaMap.set(sku, fbaVal);
      if (fbmVal > 0 && !fbmMap.has(sku)) fbmMap.set(sku, fbmVal);
      const qtyVal = num(pickCell(row, c.qty));
      if (qtyVal > 0) {
        const dest = str(pickCell(row, c.dest));
        const list = transitBatches.get(sku) ?? [];
        list.push({
          warehouse: dest || "在途",
          qty: qtyVal,
          etaDate: str(pickCell(row, c.etaDate)),
          shipMethod: "sea",
          status: "in_transit",
        });
        transitBatches.set(sku, list);
      }
    }
  }

  // ── Step 8: 组合款成本自动累加（组合公式: 组件A×数量+组件B×数量）──
  // 公式语法：组件用 SKU 编码（如 "BFEXA72-51-A×1"），也支持数字字面量直接写固定成本
  // （如 "25.64" = 组件固定 FOB，无需为组件单独建 SKU）。
  // 覆盖规则：
  //   - FOB：公式完整解析时以公式计算值为准（组合款 = 组件采购成本之和，用户明确要求）。
  //   - 头程/尾程：仅缺省填充（手填值优先），避免组件缺头程数据时把手填值清成 0。
  // 多遍处理，支持"组装款里再含组装款"的层级链。
  if (composeMap.size > 0) {
    const bySku = new Map(skuMaster.map((m) => [m.sku, m]));
    const numOr0 = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
    const isNumLiteral = (s: string) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s);
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const master of skuMaster) {
        const formula = composeMap.get(master.sku);
        if (!formula) continue;
        const terms = formula.split(/[＋+]/).map((t) => t.trim()).filter(Boolean);
        let fob = 0, ship = 0, deliv = 0, allResolved = true;
        for (const term of terms) {
          const sep = term.search(/[×*]/);
          let compSku = term, qty = 1;
          if (sep >= 0) {
            compSku = term.slice(0, sep).trim();
            const q = parseFloat(term.slice(sep + 1));
            if (isFinite(q) && q > 0) qty = q;
          }
          // 数字字面量：直接作为固定 FOB 成本
          if (isNumLiteral(compSku)) {
            fob += parseFloat(compSku) * qty;
            continue;
          }
          const comp = bySku.get(compSku);
          if (!comp) { allResolved = false; continue; }
          fob += numOr0(comp.costFob) * qty;
          ship += numOr0(comp.costShipping) * qty;
          deliv += numOr0(comp.costDelivery) * qty;
        }
        // 公式未完整解析（有组件缺失）→ 保留手填值，不写入部分和
        if (!allResolved) continue;
        master.composeFormula = formula;
        if (master.costFob !== fob) { changed = true; master.costFob = fob; }
        if (!(numOr0(master.costShipping) > 0) && master.costShipping !== ship) { changed = changed || master.costShipping !== ship; master.costShipping = ship; }
        if (!(numOr0(master.costDelivery) > 0) && master.costDelivery !== deliv) { changed = changed || master.costDelivery !== deliv; master.costDelivery = deliv; }
      }
      if (!changed) break;
    }
  }

  // ── Step 9: Build inventoryLayer by merging FBA + FBM + transit + factory ──
  const allSkus = new Set<string>();
  for (const sku of fbaMap.keys()) allSkus.add(sku);
  for (const sku of warehouseMap.keys()) allSkus.add(sku);
  for (const sku of transitBatches.keys()) allSkus.add(sku);
  for (const sku of factoryBatches.keys()) allSkus.add(sku);
  for (const sku of fbmMap.keys()) allSkus.add(sku);

  const inventoryLayer: InventoryLayer[] = [];
  for (const sku of allSkus) {
    const fba = fbaMap.get(sku) ?? 0;
    const warehouses = warehouseMap.get(sku);
    const fbm = warehouses ? warehouses.reduce((s, w) => s + w.qty, 0) : (fbmMap.get(sku) ?? 0);
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

  // ── Step 9.5: 把库存回填到 dailySnapshot ──
  // 快照的 stockOnHand/stockInTransit 之前恒为 0（导入时未关联库存），
  // 导致历史页「总库存」指标恒 0。这里按 SKU 关联 inventoryLayer：
  //   stockOnHand = FBA + FBM（仓库明细之和），stockInTransit = 在途批次件数之和。
  if (dailySnapshot.length > 0 && inventoryLayer.length > 0) {
    const layerBySku = new Map(inventoryLayer.map((l) => [l.sku, l]));
    for (const snap of dailySnapshot) {
      const layer = layerBySku.get(snap.sku);
      if (!layer) continue;
      const fba = num(layer.fbaStock);
      const fbm = layer.warehouseBreakdown
        ? layer.warehouseBreakdown.reduce((s, w) => s + num(w.qty), 0)
        : num(layer.fbmStock);
      const onHand = fba + fbm;
      const inTransit = layer.transitBatches
        ? layer.transitBatches.reduce((s, b) => s + num(b.qty), 0)
        : 0;
      snap.stockOnHand = onHand;
      snap.stockInTransit = inTransit;
      snap.daysOfCoverOnHand = snap.dailySales7d > 0 ? Number((onHand / snap.dailySales7d).toFixed(1)) : Infinity;
      snap.daysOfCoverWithTransit = snap.dailySales7d > 0 ? Number(((onHand + inTransit) / snap.dailySales7d).toFixed(1)) : Infinity;
    }
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

