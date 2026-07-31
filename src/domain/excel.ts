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
  if (lower.includes("ready") || lower.includes("完成") || lower.includes("备齐")) return "ready";
  return "producing";
};

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
 * Now contains 3 sheets only:
 *   Sheet 1: 仓库明细 — SKU · 仓库 · 库存
 *   Sheet 2: 在途明细 — SKU · 承运商 · 目的仓 · 件数 · 预计到仓
 *   Sheet 3: 工厂明细 — SKU · 工厂名 · 件数 · 交期 · 状态
 */
export function parseOperationExcel(buffer: ArrayBuffer): ImportResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const today = new Date().toISOString().slice(0, 10);

  // ── Sheet 1: 仓库明细 — SKU · 仓库 · 库存 ──
  const warehouseSheet = wb.Sheets["仓库明细"];
  const inventoryLayer: InventoryLayer[] = [];
  if (warehouseSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(warehouseSheet, { defval: "" });
    const skuWarehouses = new Map<string, { warehouse: string; qty: number }[]>();
    for (const row of rows) {
      const sku = str(row["SKU"]);
      if (!sku) continue;
      const warehouse = str(row["仓库"]);
      const qty = num(row["库存"]);
      if (!warehouse) continue;
      const list = skuWarehouses.get(sku) ?? [];
      list.push({ warehouse, qty });
      skuWarehouses.set(sku, list);
    }
    for (const [sku, warehouses] of skuWarehouses) {
      inventoryLayer.push({
        date: today,
        sku,
        fbaStock: 0,
        fbmStock: warehouses.reduce((s, w) => s + w.qty, 0),
        factoryStock: 0,
        eastTransit: 0,
        westTransit: 0,
        southeast: 0,
        southcentral: 0,
        warehouseBreakdown: warehouses.map((w) => ({
          warehouse: w.warehouse,
          qty: w.qty,
          daysOfCover: 0,
        })),
      });
    }
  }

  // ── Sheet 2: 在途明细 — SKU · 承运商 · 目的仓 · 件数 · 预计到仓 ──
  const transitSheet = wb.Sheets["在途明细"];
  const transitBatches = new Map<string, TransitBatch[]>();
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
        statusText: str(row["状态文字"]) || undefined,
        shipMethod: "sea",
        status: mapTransitStatus(str(row["状态文字"])),
      };
      const list = transitBatches.get(sku) ?? [];
      list.push(batch);
      transitBatches.set(sku, list);
    }
  }

  // ── Sheet 3: 工厂明细 — SKU · 工厂名 · 件数 · 交期 · 状态 ──
  const factorySheet = wb.Sheets["工厂明细"];
  const factoryBatches = new Map<string, FactoryBatch[]>();
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

  // Merge batches into inventoryLayer
  for (const layer of inventoryLayer) {
    const tb = transitBatches.get(layer.sku);
    if (tb && tb.length > 0) layer.transitBatches = tb;
    const fb = factoryBatches.get(layer.sku);
    if (fb && fb.length > 0) layer.factoryBatches = fb;
  }

  // Create inventoryLayer entries for SKUs that only have transit/factory batches
  const coveredSkus = new Set(inventoryLayer.map((l) => l.sku));
  const allBatchSkus = new Set([...transitBatches.keys(), ...factoryBatches.keys()]);
  for (const sku of allBatchSkus) {
    if (!coveredSkus.has(sku)) {
      const tb = transitBatches.get(sku);
      const fb = factoryBatches.get(sku);
      inventoryLayer.push({
        date: today,
        sku,
        fbaStock: 0,
        fbmStock: 0,
        factoryStock: fb ? fb.reduce((s, b) => s + b.qty, 0) : 0,
        eastTransit: 0,
        westTransit: 0,
        southeast: 0,
        southcentral: 0,
        ...(tb && tb.length > 0 ? { transitBatches: tb } : {}),
        ...(fb && fb.length > 0 ? { factoryBatches: fb } : {}),
      });
    }
  }

  return {
    skuMaster: [],
    dailySnapshot: [],
    inventoryLayer,
    transitBatches,
    factoryBatches,
    today,
    droppedFields: [],
    addedFields: [],
  };
}