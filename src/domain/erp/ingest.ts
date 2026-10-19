// =========================================================
// ERP 拉取编排 —— 连接 → 原始数据 → 归一化 → 写 IndexedDB
// ---------------------------------------------------------
// 核心规则（需求）：无论 MCP 还是 REST 拉到的数据，
// 统一走 normalize 归一化成 NormalizedRow，再映射进系统三张表：
//   SkuMaster（部分更新，不覆盖 Excel 已录成本字段）
//   DailySnapshot（销量/销售额/广告/ACoS/退款）
//   InventoryLayer（FBA 可售 / 海外仓库存）
// =========================================================

import {
  db,
  getCurrentSiteId,
  getOrCreateShopByName,
  upsertSkuMasterPartial,
  upsertSnapshots,
  upsertInventoryLayers,
} from "@/domain/db";
import type { DailySnapshot, InventoryLayer, SkuMaster } from "@/domain/types";
import { normalizeLingxing } from "./normalize";
import { lingxingMcpPull, lingxingRestPull, type RawRow } from "./lingxing";
import type { McpCredential, RestCredential, PullLogEntry } from "./types";

export type PullLog = (level: PullLogEntry["level"], msg: string) => void;

/** 归一化结果 + 写入前的预览统计 */
export interface IngestPreview {
  rows: Awaited<ReturnType<typeof normalizeLingxing>>;
  skipped: { noKey: number }; // 无 MSKU/ASIN/SKU 标识被丢弃的行数
}

/** 统一归一化入口：领星（一期）。二期在此按 erpId 分派其他 adapter。 */
export async function pullAndNormalize(
  method: "mcp" | "rest",
  credential: McpCredential | RestCredential,
  log: PullLog,
): Promise<IngestPreview> {
  // 一期仅领星；MCP 与 REST 拉到的原始行统一交给同一个归一化函数
  let listingRows: RawRow[] = [], salesRows: RawRow[] = [], stockRows: RawRow[] = [], whRows: RawRow[] = [], adRows: RawRow[] = [];
  if (method === "mcp") {
    const r = await lingxingMcpPull(credential as McpCredential, log);
    listingRows = r.listingRows; salesRows = r.salesRows; stockRows = r.stockRows; whRows = r.whRows; adRows = r.adRows;
  } else {
    const r = await lingxingRestPull(credential as RestCredential, log);
    salesRows = r.salesRows; stockRows = r.stockRows; whRows = r.whRows;
    if (salesRows.length === 0) log("warn", "REST 未拉到销量数据：销售额/销量将为 0（接口路径以官方文档为准，见 lingxing.ts LINGXING_ENDPOINTS）");
  }
  if (salesRows.length === 0) {
    log("warn", "本次拉取没有销量数据源：快照的销量/销售额将为 0，Excel 侧已录入的数值不受影响，可改用 REST 通道或 Excel 补录");
  }
  log("info", `归一化：主档 ${listingRows.length} · 销量 ${salesRows.length} · FBA库存 ${stockRows.length} · 海外仓 ${whRows.length} · 广告 ${adRows.length}`);
  const rows = normalizeLingxing(listingRows, salesRows, adRows, stockRows, whRows);
  log("ok", `归一化完成：${rows.length} 行统一结构（MSKU/ASIN/SKU/销量/销售额/广告/ACoS/库存/退款）`);
  return { rows, skipped: { noKey: 0 } };
}

/** 写入映射结果统计（UI 展示） */
export interface IngestResult {
  skuCount: number;
  snapshotCount: number;
  inventoryCount: number;
  shopNames: string[];
}

/**
 * 将归一化行写入 IndexedDB。
 * @param rows 归一化后的统一结构
 * @param date 数据归属日期（YYYY-MM-DD，默认今天，与 Excel 导入口径一致）
 * @param fallbackShop 行内无店铺名时的兜底店铺（UI 选择的「导入到店铺」）
 */
export async function writeNormalizedRows(
  rows: Awaited<ReturnType<typeof normalizeLingxing>>,
  date: string,
  fallbackShop?: string,
): Promise<IngestResult> {
  const siteId = await getCurrentSiteId();
  const shopNames = new Set<string>();

  // ── 1. SKU 主档（部分更新：仅补 msku/asin/name/store，不碰成本/售价等已有字段） ──
  // 主键复用：先按 MSKU/ASIN 建现有主档索引，命中则沿用已有主键，
  // 避免与 Excel 导入的主档（本地 SKU 主键）对同一商品各建一条
  const allMaster = await db.skuMaster.toArray();
  const masterKeyByMsku = new Map<string, string>();
  const masterKeyByAsin = new Map<string, string>();
  for (const s of allMaster) {
    if ((s.siteId ?? "site_us") !== siteId) continue;
    if (s.msku) {
      for (const m of s.msku.split(",")) {
        const t = m.trim();
        if (t) masterKeyByMsku.set(t, s.sku);
      }
    }
    if (s.asin) masterKeyByAsin.set(s.asin, s.sku);
  }

  const skuRows: SkuMaster[] = [];
  for (const r of rows) {
    // 主键优先级：已有主档的 MSKU/ASIN 命中 → 沿用其主键；否则 本地SKU → MSKU（|| 跳过空串）
    const keySku = masterKeyByMsku.get(r.msku) ?? masterKeyByAsin.get(r.asin) ?? (r.sku || r.msku);
    if (!keySku) continue;
    const storeName = r.store || fallbackShop || "";
    if (storeName) {
      await getOrCreateShopByName(storeName); // 与 Excel 导入行为一致：店铺不存在自动创建
      shopNames.add(storeName);
    }
    skuRows.push({
      sku: keySku,
      siteId,
      msku: r.msku || undefined,
      asin: r.asin || undefined,
      name: r.name || keySku,
      store: storeName || "未分类",
      // 系统必填字段给安全默认值（部分更新只在已有记录上 patch 这些以外的字段）
      saleStatus: "active",
      fulfillment: r.fbaStock > 0 ? "FBA" : "FBM",
      price: 0,
    });
  }
  await upsertSkuMasterPartial(skuRows);

  // ── 2. 每日快照（口径与 Excel 导入一致：dailySales7d = 7天累计/7；monthlySales = 30天累计/30） ──
  const snapshots: DailySnapshot[] = rows
    .filter((r) => r.sku || r.msku)
    .map((r) => {
      const keySku = masterKeyByMsku.get(r.msku) ?? masterKeyByAsin.get(r.asin) ?? (r.sku || r.msku);
      const daily = Math.round((r.sales / 7) * 100) / 100;
      const stockOnHand = r.fbaStock + r.whStock;
      return {
        date,
        sku: keySku,
        siteId,
        dailySales7d: daily,
        monthlySales: Math.round(((r.sales30d ?? 0) / 30) * 100) / 100,
        stockOnHand,
        stockInTransit: 0,
        daysOfCoverOnHand: daily > 0 ? Number((stockOnHand / daily).toFixed(1)) : Infinity,
        daysOfCoverWithTransit: daily > 0 ? Number((stockOnHand / daily).toFixed(1)) : Infinity,
        adSpend: r.adSpend,
        adRatio: r.revenue > 0 ? Math.round((r.adSpend / r.revenue) * 10000) / 100 : 0,
        profit: 0,
        profitMargin: 0,
        totalCost: 0,
        rating: 0,
        returnRate: 0,
        revenue: r.revenue,
        acos: r.acos,
        refundQty: r.refundQty,
      } satisfies DailySnapshot;
    });
  await upsertSnapshots(snapshots);

  // ── 3. 库存分层（FBA 可售 / 海外仓 = FBM 仓库存） ──
  const layers: InventoryLayer[] = rows
    .filter((r) => r.sku || r.msku)
    .map((r) => ({
      date,
      sku: masterKeyByMsku.get(r.msku) ?? masterKeyByAsin.get(r.asin) ?? (r.sku || r.msku),
      siteId,
      fbaStock: r.fbaStock,
      fbmStock: r.whStock,
      factoryStock: 0,
      eastTransit: 0,
      westTransit: 0,
      southeast: 0,
      southcentral: 0,
    }));
  await upsertInventoryLayers(layers);

  // 广播数据变更（沿用站点数据刷新事件机制）
  window.dispatchEvent(new CustomEvent("ops-data-change", { detail: { source: "erp-pull" } }));
  void db; // 保持 db 引用（懒加载场景下确保 Dexie 已初始化）
  return {
    skuCount: skuRows.length,
    snapshotCount: snapshots.length,
    inventoryCount: layers.length,
    shopNames: Array.from(shopNames),
  };
}
