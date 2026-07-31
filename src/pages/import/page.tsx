import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import { parseOperationExcel, type ImportResult } from "@/domain/excel";
import {
  clearAllData,
  db,
  getCloudConfig,
  getAllShops,
  setCloudConfig,
  upsertSkuMaster,
  upsertInventoryLayers,
  upsertSnapshots,
} from "@/domain/db";
import { pullFromGitHub, pushToGitHub, verifyGitHubConfig } from "@/domain/cloud";
import type { CloudConfig, DailySnapshot, InventoryLayer, SkuMaster, Shop, TransitBatch, FactoryBatch } from "@/domain/types";

const APP_VERSION = "4958334";

/* ────────── 工具函数 ────────── */
const num = (v: unknown, fallback = 0): number => {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ""): string =>
  v == null ? fallback : String(v).trim();

/* ────────── 模板生成 ────────── */
const autoCols = (headers: string[]) => headers.map((h) => ({ wch: Math.max(10, Math.min(28, h.length * 2.2 + 2)) }));

const downloadTemplate = (name: string, headers: string[], exampleRow: (string | number)[], dataValidations?: Record<string, unknown>[]) => {
  const sheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  if (dataValidations) sheet["!dataValidations"] = dataValidations;
  sheet["!cols"] = autoCols(headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  XLSX.writeFile(wb, `【模板】${name}.xlsx`);
};

/* ────────── 略 ────────── */

const tmplSales = () => downloadTemplate("周销量导入", ["ASIN", "SKU", "店铺", "7天销量", "30天销量"], ["B0GC3HFWHP", "BFRS258", "BIFULISAN Store", 24, 102]);
const tmplFba = () => downloadTemplate("FBA库存明细", ["ASIN", "SKU", "FBA库存"], ["B0GC3HFWHP", "BFRS258", 186]);
const tmplWarehouse = () => downloadTemplate("仓库明细(FBM)", ["SKU", "仓库", "库存"], ["BFRS258", "美西", 180]);
const tmplTransitDetail = () => downloadTemplate("在途明细", ["SKU", "承运商", "目的仓", "件数", "预计到仓"], ["BFRS258", "乐歌", "美西", 80, "2026-08-05"]);
const tmplFactory = () => downloadTemplate("工厂明细", ["SKU", "工厂名", "件数", "交期", "状态"], ["BFRS258", "东莞美联", 120, "2026-08-25", "producing"]);
const tmplProductCost = () => downloadTemplate("产品成本更新", ["SKU", "FOB"], ["BFRS258", 28.5]);
const tmplShipping = () => downloadTemplate("头程更新", ["SKU", "头程费", "配送费"], ["BFRS258", 12.3, 4.56]);

const tmplBundle = () => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: 销量导入
  const s1 = XLSX.utils.aoa_to_sheet([["ASIN", "SKU", "店铺", "7天销量", "30天销量"], ["B0GC3HFWHP", "BFRS258", "BIFULISAN Store", 24, 102]]);
  s1["!cols"] = autoCols(["ASIN", "SKU", "店铺", "7天销量", "30天销量"]);
  XLSX.utils.book_append_sheet(wb, s1, "销量导入");

  // Sheet 2: 运营数据导入
  const s2 = XLSX.utils.aoa_to_sheet([["ASIN", "店铺", "品名", "SKU", "退款率", "评分", "评论数", "退货率", "ACoAS"], ["B0GC3HFWHP", "BIFULISAN Store", "BF卡式炉", "BFRS258", 0.05, 4.2, 156, 0.08, 0.12]]);
  s2["!cols"] = autoCols(["ASIN", "店铺", "品名", "SKU", "退款率", "评分", "评论数", "退货率", "ACoAS"]);
  XLSX.utils.book_append_sheet(wb, s2, "运营数据导入");

  // Sheet 3: FBA库存明细
  const s3 = XLSX.utils.aoa_to_sheet([["ASIN", "SKU", "FBA库存"], ["B0GC3HFWHP", "BFRS258", 186]]);
  s3["!cols"] = autoCols(["ASIN", "SKU", "FBA库存"]);
  XLSX.utils.book_append_sheet(wb, s3, "FBA库存明细");

  // Sheet 4: 仓库明细(FBM)
  const s4 = XLSX.utils.aoa_to_sheet([["SKU", "仓库", "库存"], ["BFRS258", "美西", 180]]);
  s4["!cols"] = autoCols(["SKU", "仓库", "库存"]);
  XLSX.utils.book_append_sheet(wb, s4, "仓库明细(FBM)");

  // Sheet 5: 在途明细
  const s5 = XLSX.utils.aoa_to_sheet([["SKU", "承运商", "目的仓", "件数", "预计到仓"], ["BFRS258", "乐歌", "美西", 80, "2026-08-05"]]);
  s5["!cols"] = autoCols(["SKU", "承运商", "目的仓", "件数", "预计到仓"]);
  XLSX.utils.book_append_sheet(wb, s5, "在途明细");

  // Sheet 6: 工厂明细
  const s6 = XLSX.utils.aoa_to_sheet([["SKU", "工厂名", "件数", "交期", "状态"], ["BFRS258", "东莞美联", 120, "2026-08-25", "producing"]]);
  s6["!cols"] = autoCols(["SKU", "工厂名", "件数", "交期", "状态"]);
  XLSX.utils.book_append_sheet(wb, s6, "工厂明细");

  // Sheet 7: 产品成本更新
  const s7 = XLSX.utils.aoa_to_sheet([["SKU", "FOB"], ["BFRS258", 28.5]]);
  s7["!cols"] = autoCols(["SKU", "FOB"]);
  XLSX.utils.book_append_sheet(wb, s7, "产品成本更新");

  // Sheet 8: 头程更新
  const s8 = XLSX.utils.aoa_to_sheet([["SKU", "头程费", "配送费"], ["BFRS258", 12.3, 4.56]]);
  s8["!cols"] = autoCols(["SKU", "头程费", "配送费"]);
  XLSX.utils.book_append_sheet(wb, s8, "头程更新");

  // Sheet 9: SKU标识符(一次性迁移)
  const s9 = XLSX.utils.aoa_to_sheet([["店铺", "SKU", "品名", "MSKU", "ASIN", "售价（总价）", "FOB", "仓租", "发货方式"], ["BIFULISAN Store", "BFRS258", "BF卡式炉", "BFRS258-GM", "B0GC3HFWHP", 39.99, 28.5, 0.8, "FBA"]]);
  s9["!dataValidations"] = [{ type: "list", formula1: '"FBA,FBM,混发"', sqref: "I2:I101" }];
  s9["!cols"] = autoCols(["店铺", "SKU", "品名", "MSKU", "ASIN", "售价（总价）", "FOB", "仓租", "发货方式"]);
  XLSX.utils.book_append_sheet(wb, s9, "SKU标识符");

  XLSX.writeFile(wb, "【模板】综合运营表.xlsx");
};

const tmplBundleCsv = () => {
  const headers = ["SKU", "近7天日均", "近30天销量", "FBA在库", "仓库", "FBM库存", "承运商", "目的仓", "件数", "预计到仓", "工厂名", "交期", "状态", "FOB", "头程费", "配送费", "店铺", "MSKU", "ASIN", "售价（总价）"];
  const example = ["BFRS258", 3.42, 102, 186, "美西", 180, "乐歌", "美西", 80, "2026-08-05", "东莞美联", "2026-08-25", "producing", 28.5, 12.3, 4.56, "BIFULISAN Store", "BFRS258-GM", "B0GC3HFWHP", 39.99];
  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = autoCols(headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "综合运营表");
  XLSX.writeFile(wb, "【模板】综合运营表.csv", { bookType: "csv" });
};

const tmplSalesRating = () => downloadTemplate("运营数据导入", ["ASIN", "店铺", "品名", "SKU", "退款率", "评分", "评论数", "退货率", "ACoAS"], ["B0GC3HFWHP", "BIFULISAN Store", "BF卡式炉", "BFRS258", 0.05, 4.2, 156, 0.08, 0.12]);

const tmplIdentifiers = () =>
  downloadTemplate("SKU标识符(一次性迁移)", ["店铺", "SKU", "品名", "MSKU", "ASIN", "售价（总价）", "FOB", "仓租", "发货方式"], ["BIFULISAN Store", "BFRS258", "BF卡式炉", "BFRS258-GM", "B0GC3HFWHP", 39.99, 28.5, 0.8, "FBA"], [
    { type: "list", formula1: '"FBA,FBM,混发"', sqref: "I2:I101" },
  ]);

/* ────────── 标签页配置 ────────── */
const tabDefs = [
  { key: "bundle", label: "综合运营表", icon: "ri-file-excel-2-line", freq: "首次", desc: "一键下载全部 9 个 Sheet · 运营数据 / 周销量 / FBA / 仓库 / 在途 / 工厂 / 成本 / 头程 / SKU", tmpl: tmplBundle },
  { key: "sales", label: "周销量", icon: "ri-bar-chart-line", freq: "每周", desc: "ASIN · SKU · 店铺 · 7天销量 · 30天销量（自动算日均）", tmpl: tmplSales },
  { key: "operation_data", label: "运营数据", icon: "ri-database-2-line", freq: "每周", desc: "ASIN · 店铺 · 品名 · SKU · 退款率 · 评分 · 评论数 · 退货率 · ACoAS", tmpl: tmplSalesRating },
  { key: "fba", label: "FBA 库存明细", icon: "ri-archive-line", freq: "每周", desc: "ASIN · SKU · FBA库存", tmpl: tmplFba },
  { key: "warehouse", label: "仓库明细(FBM)", icon: "ri-store-2-line", freq: "每周", desc: "SKU · 仓库 · 库存（各海外仓拆分）", tmpl: tmplWarehouse },
  { key: "transit_detail", label: "在途明细", icon: "ri-ship-line", freq: "每周", desc: "SKU · 承运商 · 目的仓 · 件数 · 预计到仓", tmpl: tmplTransitDetail },
  { key: "factory", label: "工厂明细", icon: "ri-factory-line", freq: "按需", desc: "SKU · 工厂名 · 件数 · 交期", tmpl: tmplFactory },
  { key: "cost", label: "产品成本", icon: "ri-price-tag-3-line", freq: "每月/手动", desc: "更新各 SKU 的 FOB 产品成本", tmpl: tmplProductCost },
  { key: "shipping", label: "头程更新", icon: "ri-ship-2-line", freq: "每月/手动", desc: "更新头程费 + 配送费", tmpl: tmplShipping },
  { key: "identifiers", label: "SKU 标识符", icon: "ri-barcode-line", freq: "一次性迁移", desc: "店铺 · SKU · 品名 · MSKU · ASIN · 售价 · FOB · 仓租 · 发货方式", tmpl: tmplIdentifiers },
] as const;

type TabKey = (typeof tabDefs)[number]["key"];

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");

  const [importing, setImporting] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [importCounts, setImportCounts] = useState<Record<string, number>>({});

  /* 导入模式选择 */
  const [modeModal, setModeModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [cloud, setCloud] = useState<CloudConfig | null>(null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("bundle");

  const [form, setForm] = useState<CloudConfig>({
    provider: "github",
    token: "",
    owner: "",
    repo: "",
    branch: "main",
    path: "amz-ops-os/data.json",
  });

  const [guideOpen, setGuideOpen] = useState(false);

  const [clearModal, setClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  useEffect(() => {
    getCloudConfig().then((c) => {
      if (c) {
        setCloud(c);
        setForm(c);
      }
    });
    db.dailySnapshot.count().then((n) => setImportCounts((prev) => ({ ...prev, snapshots: n })));
    db.inventoryLayer.count().then((n) => setImportCounts((prev) => ({ ...prev, inventory: n })));
    getAllShops().then((allShops) => {
      setShops(allShops);
      if (allShops.length > 0) {
        setSelectedShopId(allShops[0].id);
      }
    });
  }, []);

  /* ────────── 通用 Excel 解析 ────────── */
  const parseExcelFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  };

  /* ────────── 综合运营表导入 ────────── */
  const handleBundle = async (file: File, mode: "overwrite" | "partial" = "overwrite") => {
    setModeModal(false);
    setPendingFile(null);
    setError(null);
    setResult(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseOperationExcel(buf);

      // ── 合并批次数据到 inventoryLayer ──
      const today = parsed.today;
      const mergedLayers = parsed.inventoryLayer.map((layer) => {
        const tb = parsed.transitBatches.get(layer.sku);
        const fb = parsed.factoryBatches.get(layer.sku);
        return {
          ...layer,
          ...(tb && tb.length > 0 ? { transitBatches: tb } : {}),
          ...(fb && fb.length > 0 ? { factoryBatches: fb } : {}),
        };
      });

      // 补充只有批次没有库存的 SKU
      const coveredSkus = new Set(parsed.inventoryLayer.map((l) => l.sku));
      const allBatchSkus = new Set([...parsed.transitBatches.keys(), ...parsed.factoryBatches.keys()]);
      for (const sku of allBatchSkus) {
        if (!coveredSkus.has(sku)) {
          const tb = parsed.transitBatches.get(sku);
          const fb = parsed.factoryBatches.get(sku);
          mergedLayers.push({
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

      // 保存 SKU 主档
      if (parsed.skuMaster.length > 0) {
        await upsertSkuMaster(parsed.skuMaster);
      }
      // 保存销量快照
      if (parsed.dailySnapshot.length > 0) {
        await upsertSnapshots(parsed.dailySnapshot);
      }
      // 保存分仓库存
      await upsertInventoryLayers(mergedLayers);
      setResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  };

  /* ────────── 周销量导入 ────────── */
  const handleSalesImport = async (file: File) => {
    setImportMsg(null);
    setImporting("sales");
    try {
      const rows = await parseExcelFile(file);
      const today = new Date().toISOString().slice(0, 10);
      const snapshots: Omit<DailySnapshot, "id">[] = [];

      for (const row of rows) {
        const sku = str(row["SKU"]);
        if (!sku) continue;

        const existing = await db.skuMaster.get(sku);
        const prevSnapshot = existing ? await db.dailySnapshot.where({ sku }).reverse().first() : undefined;

        // 支持"7天销量"(周期总量)自动算日均，也兼容"近7天日均"(直接日均值)
        const sales7dRaw = num(row["7天销量"] ?? row["近7天日均"] ?? row["日销（近七天）"] ?? row["dailySales7d"]);
        const isWeeklyTotal = row["7天销量"] != null;
        const dailySales7d = isWeeklyTotal ? Math.round(sales7dRaw / 7 * 100) / 100 : sales7dRaw;
        const monthlyRaw = num(row["30天销量"] ?? row["近30天销量"] ?? row["月销"] ?? row["monthlySales"]);
        const isMonthlyTotal = row["30天销量"] != null;
        const monthlySales = isMonthlyTotal ? Math.round(monthlyRaw / 30 * 100) / 100 : monthlyRaw;

        // 可选字段：评分、评论数、广告费比、退货率、退款率
        const rating = num(row["评分"] ?? row["rating"]);
        const reviewCount = num(row["评论数"] ?? row["reviewCount"] ?? row["review_count"]);
        const adRatio = num(row["广告费比"] ?? row["adRatio"]);
        const returnRate = num(row["退货率"] ?? row["returnRate"]);
        const refundRate = num(row["退款率"] ?? row["refundRate"]);

        const snap: Omit<DailySnapshot, "id"> = {
          date: today,
          sku,
          dailySales7d,
          monthlySales,
          stockOnHand: prevSnapshot?.stockOnHand ?? 0,
          stockInTransit: prevSnapshot?.stockInTransit ?? 0,
          daysOfCoverOnHand: 0,
          daysOfCoverWithTransit: 0,
          adSpend: prevSnapshot?.adSpend ?? 0,
          adRatio: adRatio || (prevSnapshot?.adRatio ?? 0),
          profit: prevSnapshot?.profit ?? 0,
          profitMargin: prevSnapshot?.profitMargin ?? 0,
          totalCost: prevSnapshot?.totalCost ?? 0,
          rating: rating || (prevSnapshot?.rating ?? 0),
          reviewCount: reviewCount > 0 ? reviewCount : prevSnapshot?.reviewCount,
          returnRate: returnRate || (prevSnapshot?.returnRate ?? 0),
          refundRate: refundRate > 0 ? refundRate : prevSnapshot?.refundRate,
        };
        snap.daysOfCoverOnHand = snap.dailySales7d > 0 ? Number((snap.stockOnHand / snap.dailySales7d).toFixed(1)) : 999;
        snap.daysOfCoverWithTransit = snap.dailySales7d > 0 ? Number(((snap.stockOnHand + snap.stockInTransit) / snap.dailySales7d).toFixed(1)) : 999;
        snapshots.push(snap);
      }

      await upsertSnapshots(snapshots);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${snapshots.length} 条销量快照（${today}）` });
      setImportCounts((prev) => ({ ...prev, snapshots: (prev.snapshots ?? 0) + snapshots.length }));
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  /* ────────── 运营数据导入 ────────── */
  const handleOperationDataImport = async (file: File) => {
    setImportMsg(null);
    setImporting("operation_data");
    try {
      const rows = await parseExcelFile(file);
      const today = new Date().toISOString().slice(0, 10);
      let skuCreated = 0;
      let skuUpdated = 0;
      const snapshots: Omit<DailySnapshot, "id">[] = [];

      for (const row of rows) {
        const sku = str(row["SKU"]);
        if (!sku) continue;
        const existing = await db.skuMaster.get(sku);
        const store = str(row["店铺"]) || existing?.store || selectedShopId || "-";
        const name = str(row["品名"]) || sku;
        const asin = str(row["ASIN"]);

        // 更新/创建 SkuMaster
        if (existing) {
          const updates: Partial<SkuMaster> = {};
          if (store) updates.store = store;
          if (name && name !== sku) updates.name = name;
          if (asin) updates.asin = asin;
          if (Object.keys(updates).length > 0) {
            await db.skuMaster.put({ ...existing, ...updates });
            skuUpdated++;
          }
        } else {
          const master: SkuMaster = {
            sku,
            name,
            store,
            price: 0,
            saleStatus: "active",
            fulfillment: "FBM",
            asin: asin || undefined,
          };
          await db.skuMaster.put(master);
          skuCreated++;
        }

        // 评分/评论数/退款率/退货率/ACoAS
        const rating = num(row["评分"]);
        const reviewCount = num(row["评论数"]);
        const adRatio = num(row["ACoAS"] ?? row["广告费比"]);
        const returnRate = num(row["退货率"]);
        const refundRate = num(row["退款率"]);

        const prevSnapshot = await db.dailySnapshot.where({ sku }).reverse().first();
        const snap: Omit<DailySnapshot, "id"> = {
          date: today,
          sku,
          dailySales7d: 0,
          monthlySales: 0,
          stockOnHand: prevSnapshot?.stockOnHand ?? 0,
          stockInTransit: prevSnapshot?.stockInTransit ?? 0,
          daysOfCoverOnHand: 999,
          daysOfCoverWithTransit: 999,
          adSpend: prevSnapshot?.adSpend ?? 0,
          adRatio: adRatio || (prevSnapshot?.adRatio ?? 0),
          profit: prevSnapshot?.profit ?? 0,
          profitMargin: prevSnapshot?.profitMargin ?? 0,
          totalCost: prevSnapshot?.totalCost ?? 0,
          rating: rating || (prevSnapshot?.rating ?? 0),
          reviewCount: reviewCount > 0 ? reviewCount : prevSnapshot?.reviewCount,
          returnRate: returnRate || (prevSnapshot?.returnRate ?? 0),
          refundRate: refundRate > 0 ? refundRate : prevSnapshot?.refundRate,
        };
        snapshots.push(snap);
      }

      await upsertSnapshots(snapshots);
      const parts = [];
      if (skuCreated > 0) parts.push(`新建SKU ${skuCreated} 个`);
      if (skuUpdated > 0) parts.push(`更新SKU ${skuUpdated} 个`);
      parts.push(`快照 ${snapshots.length} 条`);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${parts.join(" · ")}（${today}）` });
      setImportCounts((prev) => ({ ...prev, snapshots: (prev.snapshots ?? 0) + snapshots.length }));
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  /* ────────── FBA / FBM / 在途 库存导入 ────────── */
  const handleFbaImport = async (file: File) => {
    setImportMsg(null);
    setImporting("fba");
    try {
      const rows = await parseExcelFile(file);
      const today = new Date().toISOString().slice(0, 10);
      const layers: Omit<InventoryLayer, "id">[] = [];
      for (const row of rows) {
        const sku = str(row["SKU"]);
        if (!sku) continue;
        const existing = await db.inventoryLayer.where({ sku, date: today }).first();
        layers.push({
          date: today, sku,
          fbaStock: num(row["FBA库存"] ?? row["FBA在库"] ?? row["库存"] ?? row["fbaStock"]),
          fbmStock: existing?.fbmStock ?? 0,
          factoryStock: existing?.factoryStock ?? 0,
          eastTransit: existing?.eastTransit ?? 0,
          westTransit: existing?.westTransit ?? 0,
          southeast: existing?.southeast ?? 0,
          southcentral: existing?.southcentral ?? 0,
        });
      }
      await upsertInventoryLayers(layers);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${layers.length} 条 FBA 库存明细（${today}）` });
      setImportCounts((prev) => ({ ...prev, inventory: (prev.inventory ?? 0) + layers.length }));
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  const handleWarehouseImport = async (file: File) => {
    setImportMsg(null);
    setImporting("warehouse");
    try {
      const rows = await parseExcelFile(file);
      const today = new Date().toISOString().slice(0, 10);
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

      const layers: Omit<InventoryLayer, "id">[] = [];
      for (const [sku, warehouses] of skuWarehouses) {
        const existing = await db.inventoryLayer.where({ sku, date: today }).first();
        layers.push({
          date: today, sku,
          fbaStock: existing?.fbaStock ?? 0,
          fbmStock: warehouses.reduce((s, w) => s + w.qty, 0),
          factoryStock: existing?.factoryStock ?? 0,
          eastTransit: existing?.eastTransit ?? 0,
          westTransit: existing?.westTransit ?? 0,
          southeast: existing?.southeast ?? 0,
          southcentral: existing?.southcentral ?? 0,
          warehouseBreakdown: warehouses.map((w) => ({
            warehouse: w.warehouse,
            qty: w.qty,
            daysOfCover: 0,
          })),
        });
      }
      await upsertInventoryLayers(layers);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${layers.length} 个 SKU 的仓库明细（${today}）` });
      setImportCounts((prev) => ({ ...prev, inventory: (prev.inventory ?? 0) + layers.length }));
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  const handleTransitDetailImport = async (file: File) => {
    setImportMsg(null);
    setImporting("transit_detail");
    try {
      const rows = await parseExcelFile(file);
      const today = new Date().toISOString().slice(0, 10);
      const skuBatches = new Map<string, TransitBatch[]>();
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
          status: "in_transit",
        };
        const list = skuBatches.get(sku) ?? [];
        list.push(batch);
        skuBatches.set(sku, list);
      }

      // Merge into inventoryLayer
      const layers: Omit<InventoryLayer, "id">[] = [];
      for (const [sku, batches] of skuBatches) {
        const existing = await db.inventoryLayer.where({ sku, date: today }).first();
        if (existing) {
          layers.push({ ...existing, transitBatches: batches });
        } else {
          layers.push({
            date: today, sku,
            fbaStock: 0, fbmStock: 0, factoryStock: 0,
            eastTransit: 0, westTransit: 0, southeast: 0, southcentral: 0,
            transitBatches: batches,
          });
        }
      }
      await upsertInventoryLayers(layers);
      const totalBatches = [...skuBatches.values()].reduce((s, b) => s + b.length, 0);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${skuBatches.size} 个 SKU · ${totalBatches} 条在途批次（${today}）` });
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  const handleFactoryImport = async (file: File) => {
    setImportMsg(null);
    setImporting("factory");
    try {
      const rows = await parseExcelFile(file);
      const today = new Date().toISOString().slice(0, 10);
      const skuBatches = new Map<string, FactoryBatch[]>();
      for (const row of rows) {
        const sku = str(row["SKU"]);
        if (!sku) continue;
        const batch: FactoryBatch = {
          factoryName: str(row["工厂名"]),
          qty: num(row["件数"]),
          totalQty: num(row["下单总量"]) || undefined,
          deliveryDate: str(row["交期"]),
          status: "producing",
        };
        const list = skuBatches.get(sku) ?? [];
        list.push(batch);
        skuBatches.set(sku, list);
      }

      // Merge into inventoryLayer
      const layers: Omit<InventoryLayer, "id">[] = [];
      for (const [sku, batches] of skuBatches) {
        const existing = await db.inventoryLayer.where({ sku, date: today }).first();
        const factoryQty = batches.reduce((s, b) => s + b.qty, 0);
        if (existing) {
          layers.push({ ...existing, factoryStock: factoryQty, factoryBatches: batches });
        } else {
          layers.push({
            date: today, sku,
            fbaStock: 0, fbmStock: 0, factoryStock: factoryQty,
            eastTransit: 0, westTransit: 0, southeast: 0, southcentral: 0,
            factoryBatches: batches,
          });
        }
      }
      await upsertInventoryLayers(layers);
      const totalBatches = [...skuBatches.values()].reduce((s, b) => s + b.length, 0);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${skuBatches.size} 个 SKU · ${totalBatches} 条工厂批次（${today}）` });
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  /* ────────── 产品成本更新（FOB） ────────── */
  const handleProductCostImport = async (file: File) => {
    setImportMsg(null);
    setImporting("cost");
    try {
      const rows = await parseExcelFile(file);
      let updated = 0;
      for (const row of rows) {
        const sku = str(row["SKU"]);
        if (!sku) continue;
        const master = await db.skuMaster.get(sku);
        if (!master) continue;
        const costFob = num(row["FOB"] ?? row["产品成本"] ?? row["costFob"]);
        if (costFob > 0) {
          await db.skuMaster.put({ ...master, costFob });
          updated++;
        }
      }
      setImportMsg({ tone: "ok", msg: `导入成功 · 更新了 ${updated} 个 SKU 的产品成本（FOB）` });
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  /* ────────── 头程更新（头程费 + 配送费） ────────── */
  const handleShippingImport = async (file: File) => {
    setImportMsg(null);
    setImporting("shipping");
    try {
      const rows = await parseExcelFile(file);
      let updated = 0;
      for (const row of rows) {
        const sku = str(row["SKU"]);
        if (!sku) continue;
        const master = await db.skuMaster.get(sku);
        if (!master) continue;

        const updates: Partial<SkuMaster> = {};
        const shipping = num(row["头程费"] ?? row["头程"] ?? row["costShipping"]);
        const delivery = num(row["配送费"] ?? row["costDelivery"]);
        if (shipping > 0) updates.costShipping = shipping;
        if (delivery > 0) updates.costDelivery = delivery;

        if (Object.keys(updates).length > 0) {
          await db.skuMaster.put({ ...master, ...updates });
          updated++;
        }
      }
      setImportMsg({ tone: "ok", msg: `导入成功 · 更新了 ${updated} 个 SKU 的头程数据` });
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  /* ────────── SKU 标识符导入 ────────── */
  const handleIdentifiersImport = async (file: File) => {
    setImportMsg(null);
    setImporting("identifiers");
    try {
      const rows = await parseExcelFile(file);
      let created = 0;
      let updated = 0;
      const seenSku = new Set<string>(); // 追踪已出现的父SKU
      for (const row of rows) {
        const sku = str(row["SKU"]);
        if (!sku) continue;
        const store = str(row["店铺"]) || selectedShopId || "-";
        const name = str(row["品名"]) || sku;
        const msku = str(row["MSKU"]);
        const asin = str(row["ASIN"]);
        const price = num(row["售价（总价）"] ?? row["售价"]);
        const costFob = num(row["FOB"]);
        const costStorage = num(row["仓租"]);
        const fulfillment = (() => {
            const v = str(row["发货方式"]);
            if (v === "FBA") return "FBA" as const;
            if (v === "FBM") return "FBM" as const;
            if (v === "mixed" || v === "混发" || v === "混卖") return "mixed" as const;
            return "FBM" as const;
          })();

        if (!seenSku.has(sku)) {
          // 首次出现 → 父SKU
          seenSku.add(sku);
          const existing = await db.skuMaster.get(sku);
          if (existing) {
            const updates: Partial<SkuMaster> = {};
            if (store) updates.store = store;
            if (name && name !== sku) updates.name = name;
            if (msku) updates.msku = msku;
            if (asin) updates.asin = asin;
            if (price > 0) updates.price = price;
            if (costFob > 0) updates.costFob = costFob;
            if (costStorage > 0) updates.costStorage = costStorage;
            if (["FBA", "FBM", "mixed"].includes(fulfillment)) updates.fulfillment = fulfillment as "FBA" | "FBM" | "mixed";
            if (Object.keys(updates).length > 0) {
              await db.skuMaster.put({ ...existing, ...updates });
              updated++;
            }
          } else {
            const master: SkuMaster = {
              sku,
              name: name || sku,
              store,
              price: price || 0,
              saleStatus: "active",
              fulfillment: ["FBA", "FBM", "mixed"].includes(fulfillment) ? fulfillment as "FBA" | "FBM" | "mixed" : "FBM",
              msku: msku || undefined,
              asin: asin || undefined,
              costFob: costFob > 0 ? costFob : undefined,
              costStorage: costStorage > 0 ? costStorage : undefined,
              marketplace: "US",
            };
            await db.skuMaster.put(master);
            created++;
          }
        } else {
          // 再次出现 → 子MSKU
          // 用品名作为子SKU标识，唯一化
          let childSku = name;
          if (childSku === sku) {
            childSku = asin ? `${sku}__${asin}` : `${sku}__${Date.now()}`;
          }
          let finalChildSku = childSku;
          let suffix = 1;
          while (await db.skuMaster.get(finalChildSku)) {
            suffix++;
            finalChildSku = `${childSku}_${suffix}`;
          }
          const child: SkuMaster = {
            sku: finalChildSku,
            name: name || sku,
            store,
            price: price || 0,
            saleStatus: "active",
            fulfillment,
            msku: msku || undefined,
            asin: asin || undefined,
            costFob: costFob > 0 ? costFob : undefined,
            groupSku: sku,
            marketplace: "US",
          };
          await db.skuMaster.put(child);
          created++;
        }
      }
      setImportMsg({ tone: "ok", msg: `导入成功 · 新建 ${created} 个 · 更新 ${updated} 个 SKU` });
    } catch (err) {
      setImportMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(null);
    }
  };

  /* ────────── 清空 & 云端同步 ────────── */
  const handleClear = async () => {
    setClearing(true);
    setClearMsg(null);
    try {
      // 1. 先清空所有表数据（inline 方式，不依赖 clearAllData 函数）
      await db.transaction("rw",
        db.skuMaster, db.dailySnapshot, db.inventoryLayer,
        db.campaigns, db.promotions, db.manualPromotions,
        db.alerts, db.config, db.warehouseProviders,
        db.estimates, db.todos, db.calculationRecords, db.shops,
        async () => {
          await db.skuMaster.clear();
          await db.dailySnapshot.clear();
          await db.inventoryLayer.clear();
          await db.campaigns.clear();
          await db.promotions.clear();
          await db.manualPromotions.clear();
          await db.alerts.clear();
          await db.config.clear();
          await db.warehouseProviders.clear();
          await db.estimates.clear();
          await db.todos.clear();
          await db.calculationRecords.clear();
          await db.shops.clear();
        }
      );
      // 2. 设置种子数据标记，防止刷新后自动填充演示数据
      await db.config.put({ key: "seeded_v9", value: true });
      // 3. 关闭 Dexie 连接
      db.close();
      // 3. 尝试删除数据库（可能被其他标签页阻塞，但不影响结果）
      try {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase('amazon-ops-os');
          req.onsuccess = () => resolve();
          req.onerror = () => reject(new Error(req.error?.message ?? '删除失败'));
          req.onblocked = () => setTimeout(() => reject(new Error('blocked')), 300);
        });
      } catch {
        // 即使 deleteDatabase 被阻塞，clearAllData 已经清空了所有数据
      }
      // 4. 刷新页面（数据已清空，刷新后用户看到空状态）
      setClearMsg("已清空全部数据，即将刷新...");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      // clearAllData 本身失败时的兜底方案
      try {
        db.close();
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase('amazon-ops-os');
          req.onsuccess = () => resolve();
          req.onerror = () => reject(new Error(req.error?.message ?? '删除失败'));
          req.onblocked = () => setTimeout(() => reject(new Error('blocked')), 300);
        });
        setClearMsg("已清空全部数据，即将刷新...");
        setTimeout(() => window.location.reload(), 500);
      } catch (e) {
        setClearMsg(`清空失败: ${e instanceof Error ? e.message : String(e)}`);
        setClearing(false);
      }
    }
  };

  const handleSaveCloudConfig = async () => {
    setCloudMsg(null);
    if (!form.token || !form.owner || !form.repo) {
      setCloudMsg({ tone: "err", msg: "请填写 Token / Owner / Repo" });
      return;
    }
    setCloudSaving(true);
    try {
      const ok = await verifyGitHubConfig(form);
      if (!ok) throw new Error("Token / Owner / Repo 校验失败");
      await setCloudConfig(form);
      setCloud(form);
      setCloudMsg({ tone: "ok", msg: "云端配置已保存并校验通过" });
    } catch (err) {
      setCloudMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setCloudSaving(false);
    }
  };

  const handlePush = async () => {
    if (!cloud) return;
    setCloudSaving(true);
    setCloudMsg(null);
    try {
      await pushToGitHub(cloud);
      const updated = await getCloudConfig();
      setCloud(updated);
      setCloudMsg({ tone: "ok", msg: "已保存到 GitHub 云端" });
    } catch (err) {
      setCloudMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setCloudSaving(false);
    }
  };

  const handlePull = async () => {
    if (!cloud) return;
    if (!confirm("从云端拉取会覆盖本地数据，确定继续吗？")) return;
    setCloudSaving(true);
    setCloudMsg(null);
    try {
      const res = await pullFromGitHub(cloud);
      setCloudMsg({ tone: res.ok ? "ok" : "err", msg: res.message });
      if (res.ok) setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setCloudMsg({ tone: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setCloudSaving(false);
    }
  };

  /* ────────── 通用导入卡片 ────────── */
  const renderImportCard = (
    statusKey: string,
    onFile: (f: File) => Promise<void>,
    acceptLabel: string
  ) => (
    <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-[18px] text-primary-700">
          <i className={tabDefs.find((t) => t.key === activeTab)?.icon ?? "ri-upload-cloud-2-line"} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-foreground-900">
            {tabDefs.find((t) => t.key === activeTab)?.label}
          </div>
          <div className="mt-0.5 text-[12px] text-foreground-500">
            {tabDefs.find((t) => t.key === activeTab)?.desc}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary-500 px-3 py-2 text-[12px] font-semibold text-background-50 hover:bg-primary-600 whitespace-nowrap">
          <i className={importing === statusKey ? "ri-loader-4-line animate-spin" : "ri-upload-cloud-2-line"} aria-hidden />
          {importing === statusKey ? "导入中..." : acceptLabel}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => tabDefs.find((t) => t.key === activeTab)?.tmpl()}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-200 whitespace-nowrap"
        >
          <i className="ri-download-line" aria-hidden />
          下载 Excel 模板
        </button>
      </div>
      {importMsg && importing === statusKey && (
        <div
          className={[
            "mt-3 rounded-md border px-3 py-2 text-[12px]",
            importMsg.tone === "ok"
              ? "border-accent-200 bg-accent-100/60 text-accent-900"
              : "border-red-200 bg-red-50 text-red-800",
          ].join(" ")}
        >
          {importMsg.msg}
        </div>
      )}
    </div>
  );

  const currentTab = tabDefs.find((t) => t.key === activeTab)!;

  return (
    <div className="space-y-6">
      {/* ── 页头 ── */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">Data Ingest</div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">数据导入</h1>
        <p className="text-[13px] text-foreground-500">
          按节奏分别导入 · 历史数据自动保留 · 本周 vs 上周对比自动生成
        </p>
      </div>

      {/* ── 店铺选择器 ── */}
      <div className="flex items-center gap-3 rounded-xl border border-background-200/70 bg-background-100/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <i className="ri-store-2-line text-[16px] text-foreground-500" aria-hidden />
          <span className="text-[13px] font-medium text-foreground-700">导入到店铺：</span>
        </div>
        <select
          value={selectedShopId}
          onChange={(e) => setSelectedShopId(e.target.value)}
          className="rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
        >
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>{shop.name}</option>
          ))}
        </select>
        <span className="text-[11px] text-foreground-400">
          导入的数据将关联到该店铺（Excel 中的"所属店铺"字段将被忽略）
        </span>
      </div>

      {/* ── Tab 切换器 ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
        {tabDefs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setActiveTab(t.key);
              setImportMsg(null);
            }}
            className={[
              "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
              activeTab === t.key
                ? "bg-primary-500 text-background-50"
                : "text-foreground-600 hover:text-foreground-900",
            ].join(" ")}
          >
            <i className={`${t.icon} mr-1 text-[13px]`} aria-hidden />
            {t.label}
            <span className="ml-1 text-[10px] opacity-70">{t.freq}</span>
          </button>
        ))}
        {/* 使用说明切换按钮 */}
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="ml-auto mr-1 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-foreground-600 hover:text-foreground-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className={`${guideOpen ? "ri-book-open-line" : "ri-book-line"} mr-1 text-[13px]`} aria-hidden />
          使用说明
          <i className={guideOpen ? "ri-arrow-up-s-line ml-0.5 text-[10px]" : "ri-arrow-down-s-line ml-0.5 text-[10px]"} aria-hidden />
        </button>
      </div>

      {/* ── 使用说明 ── */}
      {guideOpen && (
        <Section title="导入使用说明" icon="ri-information-line" subtitle="建议按此节奏操作，历史数据不会相互覆盖">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              {
                icon: "ri-file-excel-2-line",
                title: "1. SKU 标识符（一次性迁移）",
                body: "首次使用系统时，从领星产品管理导出店铺/SKU/品名/MSKU/ASIN/售价，补上 FOB 后通过「SKU 标识符」入口导入。之后新增 SKU 也可通过此入口批量补充。",
              },
              {
                icon: "ri-bar-chart-line",
                title: "2. 周销量（每周一）",
                body: "从 Amazon 后台导出近7天日均销量和近30天销量，导入即可。系统会自动创建新的日期快照，上周数据不会覆盖——Dashboard 自动算本周 vs 上周的环比变化。",
              },
              {
                icon: "ri-archive-line",
                title: "3. FBA 库存明细（每周一）",
                body: "从 Amazon 后台导出 FBA 库存报表。同一天的各数据会合并到同一条记录，不会互相覆盖。",
              },
              {
                icon: "ri-store-2-line",
                title: "4. 仓库明细(FBM)（每周一）",
                body: "按 SKU 拆分明细，每个 SKU 每行一个仓库+库存。仓库名可自定义，随时可改成美西/美东/美中南/美东南或其他名称。",
              },
              {
                icon: "ri-ship-line",
                title: "5. 在途明细（每周一）",
                body: "批次级导入：SKU · 承运商 · 目的仓 · 件数 · 预计到仓。数据直接从同事给的表格复制粘贴过来即可。",
              },
              {
                icon: "ri-factory-line",
                title: "6. 工厂明细（按需）",
                body: "SKU · 工厂名 · 件数 · 交期。工厂生产进度或新批次下单时更新。",
              },
              {
                icon: "ri-price-tag-3-line",
                title: "7. 产品成本 · 头程更新（每月/变动时）",
                body: "FOB 和头程费是两个独立入口。大部分情况下 FOB 不会频繁变化，头程费则可能随船运波动。配送费在「头程更新」模板里一起改。也支持在「参数中心 → SKU 供应链参数」手动修改。",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 rounded-lg border border-background-200/70 bg-background-50 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-100 text-[16px] text-accent-700">
                  <i className={item.icon} aria-hidden />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-foreground-900">{item.title}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-foreground-600">{item.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-background-200/70 bg-background-100/60 p-4 text-[13px] text-foreground-700 leading-relaxed">
            <div className="font-semibold text-foreground-900">
              <i className="ri-lightbulb-line mr-1 text-accent-600" aria-hidden /> 每周操作清单（建议）
            </div>
            <ul className="mt-2 space-y-1.5 pl-5 text-[12px]">
              <li><strong>周一上午：</strong>依次导入「周销量」「FBA 库存明细」「仓库明细」「在途明细」（各点一次上传即可）</li>
              <li><strong>每月初或头程变动时：</strong>导入「产品成本」或「头程更新」</li>
              <li><strong>促销报名后：</strong>去「参数中心 → 促销管理」手动添加促销活动，Dashboard 会自动在开始/到期前 2 天提醒你</li>
              <li><strong>日常：</strong>打开 Dashboard 看今天需要处理的事，风险中心看异常，发货决策中心看补货建议</li>
              <li><strong>需要备份：</strong>在下方 GitHub 配置里点「保存到 GitHub 云端」</li>
            </ul>
          </div>
        </Section>
      )}

      {/* ── Bundle（综合运营表） ── */}
      {activeTab === "bundle" && (
        <>
          <Section
            title="导入综合运营表"
            icon="ri-file-excel-2-line"
            subtitle="包含「仓库明细」「在途明细」「工厂明细」三个 Sheet，一次性导入全量数据"
          >
            <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-background-300/80 bg-background-100/50 px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-[26px] text-primary-700">
                <i className="ri-upload-cloud-2-line" aria-hidden />
              </div>
              <div className="mt-4 font-heading text-[15px] font-semibold text-foreground-900">
                拖拽 .xlsx 文件或点击选择
              </div>
              <div className="mt-1 max-w-md text-[12px] text-foreground-500">
                自动解析「仓库明细」「在途明细」「工厂明细」三个 Sheet，一次全部导入：分仓库存+海外仓拆分+在途批次+工厂批次
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setPendingFile(f);
                    setModeModal(true);
                  }
                  e.target.value = "";
                }}
              />
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <i className={parsing ? "ri-loader-4-line animate-spin" : "ri-folder-upload-line"} aria-hidden />
                  {parsing ? "解析中..." : "选择 Excel 文件"}
                </button>
                <button
                  type="button"
                  onClick={tmplBundle}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-4 py-2 text-[13px] font-medium text-foreground-700 hover:bg-background-200 whitespace-nowrap"
                >
                  <i className="ri-download-line" aria-hidden />
                  下载 Excel 模板
                </button>
                <button
                  type="button"
                  onClick={tmplBundleCsv}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-4 py-2 text-[13px] font-medium text-foreground-700 hover:bg-background-200 whitespace-nowrap"
                >
                  <i className="ri-file-text-line" aria-hidden />
                  下载 CSV 模板
                </button>
                <button
                  type="button"
                  onClick={() => setClearModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-4 py-2 text-[13px] font-medium text-foreground-700 hover:bg-background-200 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-delete-bin-line" aria-hidden />
                  清空本地数据
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
                <i className="ri-error-warning-line mr-1" aria-hidden />
                {error}
              </div>
            )}
            {result && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-accent-200 bg-accent-100/60 px-4 py-3 text-[13px] text-accent-900">
                  <div className="font-semibold">✓ 导入成功（{result.today}）</div>
                  <div className="mt-1 text-[12px]">
                    SKU {result.skuMaster.length} 个 · 快照 {result.dailySnapshot.length} 条 · 分仓 {result.inventoryLayer.length} 条
                    {result.transitBatches.size > 0 && ` · 在途批次 ${[...result.transitBatches.values()].reduce((s, b) => s + b.length, 0)} 条`}
                    {result.factoryBatches.size > 0 && ` · 工厂批次 ${[...result.factoryBatches.values()].reduce((s, b) => s + b.length, 0)} 条`}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-background-200/70 bg-background-50 p-3">
                    <div className="text-[12px] font-semibold text-foreground-800">已忽略字段</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.droppedFields.map((f) => (
                        <Badge key={f} tone="secondary">{f}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-background-200/70 bg-background-50 p-3">
                    <div className="text-[12px] font-semibold text-foreground-800">建议补充字段</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.addedFields.map((f) => (
                        <Badge key={f} tone="primary">{f}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      {/* ── 分项导入：销量 / FBA / FBM / 在途 / 成本 / 头程 ── */}
      {activeTab !== "bundle" && (
        <Section
          title={`导入${currentTab.label}`}
          icon={currentTab.icon}
          subtitle={currentTab.desc}
        >
          {renderImportCard(
            activeTab,
            activeTab === "sales"
              ? handleSalesImport
              : activeTab === "operation_data"
                ? handleOperationDataImport
                : activeTab === "fba"
                ? handleFbaImport
                : activeTab === "warehouse"
                  ? handleWarehouseImport
                  : activeTab === "transit_detail"
                    ? handleTransitDetailImport
                    : activeTab === "factory"
                      ? handleFactoryImport
                      : activeTab === "cost"
                        ? handleProductCostImport
                        : activeTab === "shipping"
                          ? handleShippingImport
                          : handleIdentifiersImport,
            `上传${currentTab.label} Excel`
          )}

          {activeTab === "sales" || activeTab === "operation_data" && (
            <div className="mt-3 rounded-lg bg-background-100/60 p-3 text-[12px] text-foreground-600">
              <i className="ri-information-line mr-1 text-accent-600" aria-hidden />
              每次导入会创建新的日期快照，历史数据不会覆盖。Dashboard 会自动显示本周 vs 上周的环比变化。
              当前快照总数：{importCounts.snapshots ?? 0} 条
            </div>
          )}
          {(activeTab === "fba" || activeTab === "warehouse" || activeTab === "transit_detail" || activeTab === "factory") && (
            <div className="mt-3 rounded-lg bg-background-100/60 p-3 text-[12px] text-foreground-600">
              <i className="ri-information-line mr-1 text-accent-600" aria-hidden />
              同一天的 FBA + FBM + 在途会合并到同一条分仓记录。当前分仓记录总数：{importCounts.inventory ?? 0} 条
            </div>
          )}
          {activeTab === "cost" && (
            <div className="mt-3 rounded-lg bg-background-100/60 p-3 text-[12px] text-foreground-600">
              <i className="ri-information-line mr-1 text-accent-600" aria-hidden />
              只更新 FOB（产品成本），覆盖已有值。也可以在「参数中心 → SKU 供应链参数」逐条手动修改。
            </div>
          )}
          {activeTab === "shipping" && (
            <div className="mt-3 rounded-lg bg-background-100/60 p-3 text-[12px] text-foreground-600">
              <i className="ri-information-line mr-1 text-accent-600" aria-hidden />
              同时更新头程费和配送费，覆盖已有值。也可以逐条在「参数中心 → SKU 供应链参数」手动修改。
            </div>
          )}
          {activeTab === "identifiers" && (
            <div className="mt-3 rounded-lg bg-background-100/60 p-3 text-[12px] text-foreground-600">
              <i className="ri-information-line mr-1 text-accent-600" aria-hidden />
              更新已有 SKU 的 MSKU / ASIN / UPC / 父体信息，不存在的 SKU 会自动新建。也可以逐条在「参数中心 → SKU 供应链参数」手动修改。
            </div>
          )}
        </Section>
      )}

      {/* ── GitHub 云端同步 ── */}
      <Section
        title="GitHub 云端同步（手动保存）"
        icon="ri-github-line"
        subtitle="本地默认 IndexedDB 存储；点击「保存到云端」把数据写入你的 GitHub 仓库"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Personal Access Token" hint="仓库读写权限，仅存本地">
            <input
              type="password"
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              placeholder="ghp_xxxx"
              autoComplete="off"
              className="w-full rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </Field>
          <Field label="仓库路径 (owner / repo)">
            <div className="flex gap-2">
              <input
                type="text"
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                placeholder="your-github"
                className="w-1/2 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              <input
                type="text"
                value={form.repo}
                onChange={(e) => setForm({ ...form, repo: e.target.value })}
                placeholder="repo-name"
                className="w-1/2 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
          </Field>
          <Field label="分支">
            <input
              type="text"
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              className="w-full rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </Field>
          <Field label="文件路径">
            <input
              type="text"
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              className="w-full rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveCloudConfig}
            disabled={cloudSaving}
            className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-100 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-200 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-save-line" aria-hidden />
            保存并校验配置
          </button>
          <button
            type="button"
            onClick={handlePush}
            disabled={!cloud || cloudSaving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-3 py-2 text-[12px] font-medium text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <i className={cloudSaving ? "ri-loader-4-line animate-spin" : "ri-cloud-line"} aria-hidden />
            保存到 GitHub 云端
          </button>
          <button
            type="button"
            onClick={handlePull}
            disabled={!cloud || cloudSaving}
            className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-200 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-download-cloud-2-line" aria-hidden />
            从 GitHub 拉取
          </button>
          {cloud?.lastSyncAt && (
            <span className="text-[11px] text-foreground-500">
              上次同步：{new Date(cloud.lastSyncAt).toLocaleString()}
            </span>
          )}
        </div>

        {cloudMsg && (
          <div
            className={[
              "mt-3 rounded-md border px-3 py-2 text-[12px]",
              cloudMsg.tone === "ok"
                ? "border-accent-200 bg-accent-100/60 text-accent-900"
                : "border-red-200 bg-red-50 text-red-800",
            ].join(" ")}
          >
            {cloudMsg.msg}
          </div>
        )}

        <div className="mt-4 rounded-lg bg-background-100/60 p-3 text-[12px] text-foreground-600">
          <i className="ri-shield-check-line mr-1 text-accent-600" aria-hidden />
          Token 只保存在本地 IndexedDB，不会通过任何服务器中转
        </div>
      </Section>

      {/* ── 清空数据确认弹窗 ── */}
      {clearModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!clearing) setClearModal(false); }} />
          <div className="relative w-full max-w-sm rounded-2xl bg-background-50 p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mx-auto">
              <i className="ri-delete-bin-line text-[22px] text-red-500" aria-hidden />
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-[16px] font-bold text-foreground-950">确定清空所有本地数据？</h3>
              <p className="mt-2 text-[13px] text-foreground-600">
                此操作不可恢复，将清除：<br />
                <strong className="text-foreground-900">SKU主档 · 库存快照(历史) · 分仓库存 · 在途批次 · 工厂批次 · 促销活动 · 运营参数 · 海外仓配置 · 新品测算 · 待办事项</strong>
              </p>
              {clearMsg && (
                <div className={`mt-3 rounded-md border px-3 py-2 text-[12px] ${clearMsg.includes("失败") ? "border-red-200 bg-red-50 text-red-800" : "border-accent-200 bg-accent-100/60 text-accent-900"}`}>
                  {clearMsg}
                </div>
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={clearing}
                onClick={() => setClearModal(false)}
                className="flex-1 rounded-lg border border-background-200 py-2 text-[13px] font-medium text-foreground-600 hover:bg-background-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={handleClear}
                className="flex-1 rounded-lg bg-red-500 py-2 text-[13px] font-semibold text-white hover:bg-red-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <i className={clearing ? "ri-loader-4-line animate-spin mr-1" : "ri-delete-bin-line mr-1"} aria-hidden />
                {clearing ? "清空中..." : "确认清空"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 导入模式选择弹窗 ── */}
      {modeModal && pendingFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setModeModal(false); setPendingFile(null); }} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="flex h-12 w-12 items-center justify-center mx-auto rounded-full bg-primary-100 text-[22px] text-primary-700">
                <i className="ri-file-excel-2-line" aria-hidden />
              </div>
              <h3 className="mt-3 text-lg font-bold text-foreground-950">选择导入方式</h3>
              <p className="mt-1 text-sm text-foreground-500">
                文件：{pendingFile.name}
              </p>
            </div>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => handleBundle(pendingFile, "overwrite")}
                className="w-full rounded-xl border-2 border-primary-500 bg-primary-50 px-4 py-3.5 text-left hover:bg-primary-100 cursor-pointer transition-colors"
              >
                <div className="text-sm font-bold text-primary-800">
                  <i className="ri-refresh-line mr-1.5" aria-hidden /> 覆盖导入
                </div>
                <div className="mt-0.5 text-xs text-foreground-500">
                  完全覆盖：Excel 所有字段直接写入，空单元格会清空已有数据。适合「全量更新」场景。
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleBundle(pendingFile, "partial")}
                className="w-full rounded-xl border-2 border-accent-500 bg-accent-50 px-4 py-3.5 text-left hover:bg-accent-100 cursor-pointer transition-colors"
              >
                <div className="text-sm font-bold text-accent-800">
                  <i className="ri-edit-circle-line mr-1.5" aria-hidden /> 部分更新
                </div>
                <div className="mt-0.5 text-xs text-foreground-500">
                  仅更新有值字段：Excel 中空单元格不覆盖已有数据。适合「只改部分参数」场景。
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setModeModal(false); setPendingFile(null); }}
                className="w-full rounded-xl border border-background-300 bg-background-50 px-4 py-2.5 text-sm text-foreground-500 hover:bg-background-100 cursor-pointer transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 版本号 ── */}
      <div className="border-t border-background-200 pt-3 text-center text-[11px] text-foreground-400">
        v{APP_VERSION}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-baseline justify-between text-[12px] font-medium text-foreground-700">
        <span>{label}</span>
        {hint && <span className="text-[11px] text-foreground-500">{hint}</span>}
      </label>
      {children}
    </div>
  );
}