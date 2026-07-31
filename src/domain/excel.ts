import * as XLSX from "xlsx";
import type { SkuMaster, DailySnapshot, InventoryLayer, TransitBatch, FactoryBatch } from "./types";

const num = (v: unknown, fallback = 0): number => {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
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
  today: string;
  droppedFields: string[];
  addedFields: string[];
}

/**
 * Parse the Bundle（综合运营表）Excel.
 * 8 sheets:
 *   SKU标识符 → SkuMaster
 *   销量导入/周销量导入 → DailySnapshot
 *   FBA库存明细 → InventoryLayer.fbaStock
 *   仓库明细(FBM)/仓库明细 → InventoryLayer.fbmStock + warehouseBreakdown
 *   在途明细 → TransitBatch
 *   工厂明细 → FactoryBatch
 *   产品成本更新 → SkuMaster.costFob
 *   头程更新 → SkuMaster.costShipping / costDelivery
 */
export function parseOperationExcel(buffer: ArrayBuffer): ImportResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const today = new Date().toISOString().slice(0, 10);

  // ── Step 1: Parse SKU标识符 → skuMaster ──
  // 支持多MSKU：同一SKU出现多次时，首次为父SKU，后续为子MSKU（设groupSku）
  const skuMaster: SkuMaster[] = [];
  const idSheet = findSheet(wb, ["SKU标识符", "SKU标识符(一次性迁移)"]);
  if (idSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(idSheet, { defval: "" });
    const seenSku = new Set<string>();
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const name = str(row["品名"]) || sku;
      const msku = str(row["MSKU"]) || undefined;
      const store = str(row["店铺"]) || "-";
      const asin = str(row["ASIN"]) || undefined;
      const price = num(row["售价（总价）"] ?? row["售价"]);
      const costFob = num(row["FOB"]) > 0 ? num(row["FOB"]) : undefined;
      const costStorage = num(row["仓租"]) > 0 ? num(row["仓租"]) : undefined;
      const fulfillment = normalizeFulfillment(row["发货方式"]);

      if (!seenSku.has(sku)) {
        // 首次出现 → 父SKU
        seenSku.add(sku);
        skuMaster.push({
          sku,
          name,
          store,
          price,
          asin,
          msku,
          costFob,
          costStorage,
          fulfillment,
          saleStatus: "active",
        });
      } else {
        // 再次出现 → 子MSKU，用品名作为子SKU标识（唯一化）
        // 如果品名与父SKU相同，拼接ASIN后缀确保唯一
        let childSku = name;
        if (childSku === sku) {
          childSku = asin ? `${sku}__${asin}` : `${sku}__${Date.now()}`;
        }
        // 确保不重复
        let finalChildSku = childSku;
        let suffix = 1;
        while (skuMaster.some(s => s.sku === finalChildSku)) {
          suffix++;
          finalChildSku = `${childSku}_${suffix}`;
        }
        skuMaster.push({
          sku: finalChildSku,
          name,
          store,
          price,
          asin,
          msku,
          costFob,
          groupSku: sku,       // 关联父SKU
          saleStatus: "active",
          fulfillment,
        });
      }
    }
  }

  // ── Step 2: Parse 销量导入 → dailySnapshot ──
  const dailySnapshot: DailySnapshot[] = [];
  const salesSheet = findSheet(wb, ["销量导入", "周销量导入"]);
  if (salesSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(salesSheet, { defval: "" });
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      // 支持"7天销量"(周期总量)自动算日均，也兼容"近7天日均"(直接日均值)
      const sales7dRaw = num(row["7天销量"] ?? row["近7天日均"] ?? row["日销（近七天）"] ?? row["dailySales7d"]);
      const isWeeklyTotal = row["7天销量"] != null; // 如果是"7天销量"列，则除以7算日均
      const daily7d = isWeeklyTotal ? Math.round(sales7dRaw / 7 * 100) / 100 : sales7dRaw;
      const monthlyRaw = num(row["30天销量"] ?? row["近30天销量"] ?? row["月销"] ?? row["monthlySales"]);
      const isMonthlyTotal = row["30天销量"] != null;
      const monthly = isMonthlyTotal ? Math.round(monthlyRaw / 30 * 100) / 100 : monthlyRaw;
      // 可选字段：评分、评论数、广告费比、退货率、退款率
      const rating = num(row["评分"] ?? row["rating"]);
      const reviewCount = num(row["评论数"] ?? row["reviewCount"] ?? row["review_count"]);
      const adRatio = num(row["广告费比"] ?? row["adRatio"]);
      const returnRate = num(row["退货率"] ?? row["returnRate"]);
      const refundRate = num(row["退款率"] ?? row["refundRate"]);
      dailySnapshot.push({
        date: today,
        sku,
        dailySales7d: daily7d,
        monthlySales: monthly,
        stockOnHand: 0,
        stockInTransit: 0,
        daysOfCoverOnHand: daily7d > 0 ? Number((0 / daily7d).toFixed(1)) : 999,
        daysOfCoverWithTransit: daily7d > 0 ? Number((0 / daily7d).toFixed(1)) : 999,
        adSpend: 0,
        adRatio: adRatio || 0,
        profit: 0,
        profitMargin: 0,
        totalCost: 0,
        rating: rating || 0,
        reviewCount: reviewCount > 0 ? reviewCount : undefined,
        returnRate: returnRate || 0,
        refundRate: refundRate > 0 ? refundRate : undefined,
      });
    }
  }

  // ── Step 2.5: Parse 运营数据导入 → update skuMaster + dailySnapshot ──
  const opDataSheet = findSheet(wb, ["运营数据导入"]);
  if (opDataSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(opDataSheet, { defval: "" });
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const store = str(row["店铺"]) || (skuMaster.find(s => s.sku === sku)?.store) || "-";
      const name = str(row["品名"]) || sku;
      const asin = str(row["ASIN"]);
      const rating = num(row["评分"]);
      const reviewCount = num(row["评论数"]);
      const adRatio = num(row["ACoAS"] ?? row["广告费比"]);
      const returnRate = num(row["退货率"]);
      const refundRate = num(row["退款率"]);

      // Update or create SkuMaster
      const existingIdx = skuMaster.findIndex(s => s.sku === sku);
      if (existingIdx >= 0) {
        const m = skuMaster[existingIdx];
        if (store) m.store = store;
        if (name && name !== sku) m.name = name;
        if (asin) m.asin = asin;
      } else {
        skuMaster.push({
          sku, name, store, price: 0,
          saleStatus: "active", fulfillment: "FBM",
          asin: asin || undefined,
        });
      }

      // Merge into existing snapshot (from Step 2 销量导入) if same SKU+date
      const existingIdx_snap = dailySnapshot.findIndex(s => s.sku === sku && s.date === today);
      if (existingIdx_snap >= 0) {
        const existing = dailySnapshot[existingIdx_snap];
        if (adRatio) existing.adRatio = adRatio;
        if (rating) existing.rating = rating;
        if (reviewCount > 0) existing.reviewCount = reviewCount;
        if (returnRate) existing.returnRate = returnRate;
        if (refundRate > 0) existing.refundRate = refundRate;
      } else {
        dailySnapshot.push({
          date: today, sku,
          dailySales7d: 0, monthlySales: 0,
          stockOnHand: 0, stockInTransit: 0,
          daysOfCoverOnHand: 999,
          daysOfCoverWithTransit: 999,
          adSpend: 0, adRatio: adRatio || 0,
          profit: 0, profitMargin: 0, totalCost: 0,
          rating: rating || 0,
          reviewCount: reviewCount > 0 ? reviewCount : undefined,
          returnRate: returnRate || 0,
          refundRate: refundRate > 0 ? refundRate : undefined,
        });
      }
    }
  }

  // ── Step 3: Parse FBA库存明细 → fbaStock map ──
  const fbaMap = new Map<string, number>();
  const fbaSheet = findSheet(wb, ["FBA库存明细", "FBA库存"]);
  if (fbaSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(fbaSheet, { defval: "" });
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      fbaMap.set(sku, num(row["FBA库存"] ?? row["FBA在库"] ?? row["库存"] ?? row["fbaStock"]));
    }
  }

  // ── Step 4: Parse 仓库明细(FBM) → warehouse breakdown ──
  const warehouseMap = new Map<string, { warehouse: string; qty: number }[]>();
  const warehouseSheet = findSheet(wb, ["仓库明细(FBM)", "仓库明细"]);
  if (warehouseSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(warehouseSheet, { defval: "" });
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const warehouse = str(row["仓库"]);
      const qty = num(row["库存"]);
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
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const provider = str(row["承运商"]);
      const dest = str(row["目的仓"]);
      const warehouse = provider && dest ? `${provider}-${dest}` : provider || dest || "在途";
      const batch: TransitBatch = {
        warehouse,
        qty: num(row["件数"]),
        etaDate: str(row["预计到仓"]),
        shipDate: str(row["出港日期"]) || undefined,
        statusText: str(row["在途情况"] ?? row["状态文字"]) || undefined,
        shipMethod: "sea",
        status: mapTransitStatus(str(row["状态文字"])),
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
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const batch: FactoryBatch = {
        factoryName: str(row["工厂名"]),
        qty: num(row["件数"]),
        totalQty: num(row["下单总量"]) || undefined,
        deliveryDate: str(row["交期"]),
        status: mapFactoryStatus(str(row["状态"])),
      };
      const list = factoryBatches.get(sku) ?? [];
      list.push(batch);
      factoryBatches.set(sku, list);
    }
  }

  // ── Step 7: Parse 产品成本更新 → costFob update map ──
  const costFobMap = new Map<string, number>();
  const costSheet = findSheet(wb, ["产品成本更新", "产品成本"]);
  if (costSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(costSheet, { defval: "" });
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const fob = num(row["FOB"] ?? row["产品成本"] ?? row["costFob"]);
      if (fob > 0) costFobMap.set(sku, fob);
    }
  }

  // ── Step 8: Parse 头程更新 → costShipping / costDelivery map ──
  const shippingMap = new Map<string, { shipping: number; delivery: number }>();
  const shipSheet = findSheet(wb, ["头程更新", "头程"]);
  if (shipSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(shipSheet, { defval: "" });
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const shipping = num(row["头程费"] ?? row["头程"] ?? row["costShipping"]);
      const delivery = num(row["配送费"] ?? row["costDelivery"]);
      if (shipping > 0 || delivery > 0) {
        shippingMap.set(sku, { shipping, delivery });
      }
    }
  }

  // ── Merge costFob and shipping into skuMaster ──
  for (const master of skuMaster) {
    const fob = costFobMap.get(master.sku);
    if (fob != null) master.costFob = fob;
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

  return {
    skuMaster,
    dailySnapshot,
    inventoryLayer,
    transitBatches,
    factoryBatches,
    today,
    droppedFields: [],
    addedFields: [],
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