import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import * as XLSX from "xlsx";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import HealthReport from "@/components/health/HealthReport";
import { parseOperationExcel, type ImportResult } from "@/domain/excel";
import { validateImportData, type ValidationResult } from "@/domain/data-health";
import { buildColumnMap, headersOf, matchColumn, pickCell } from "@/domain/columnMatcher";
import { applyIncrementalCostUpdate } from "@/domain/cost-merge";
import {
  clearAllData,
  db,
  ensureDefaultShops,
  getCloudConfig,
  getAllShops,
  getOrCreateShopByName,
  setCloudConfig,
  setLatestHealthReport,
  upsertSkuMaster,
  upsertInventoryLayers,
  upsertSnapshots,
  getWarehouseRegionMap,
  guessRegion,
  upsertWarehouseMapping,
  getAllWarehouseMappings,
  deleteWarehouseMapping,
  reapplyWarehouseMappings,
} from "@/domain/db";
import { pullFromGitHub, pushToGitHub, verifyGitHubConfig } from "@/domain/cloud";
import type { CloudConfig, DailySnapshot, InventoryLayer, SkuMaster, Shop, TransitBatch, FactoryBatch, WarehouseMapping, WarehouseRegion } from "@/domain/types";

const APP_VERSION = "4958334";

/* ────────── 工具函数 ────────── */
const num = (v: unknown, fallback = 0): number => {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ""): string =>
  v == null ? fallback : String(v).trim();

/** 统一发货方式：支持中文"混发"→"mixed"，默认FBM */
const normalizeFulfillment = (v: unknown): "FBA" | "FBM" | "mixed" => {
  const val = str(v);
  if (val === "FBA") return "FBA";
  if (val === "FBM") return "FBM";
  if (val === "mixed" || val === "混发" || val === "混卖") return "mixed";
  return "FBM"; // 用户主要做FBM
};

/**
 * 导入页「字段识别结果」展示顺序（规则 H）：逻辑字段 → 实际列名。
 * 只展示用户关心的核心字段，避免信息过载。
 */
const RECOGNITION_FIELDS: { key: string; label: string }[] = [
  { key: "sku", label: "SKU" },
  { key: "msku", label: "MSKU" },
  { key: "fob", label: "FOB 成本" },
  { key: "price", label: "售价" },
  { key: "store", label: "店铺" },
  { key: "sales7d", label: "近7天销量" },
  { key: "sales30d", label: "近30天销量" },
  { key: "fulfillment", label: "发货方式" },
  { key: "costStorage", label: "仓租" },
  { key: "asin", label: "ASIN" },
];

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

const tmplSales = () => downloadTemplate("周销量导入", ["ASIN", "SKU", "品名", "MSKU", "店铺", "7天销量", "30天销量", "评分", "评论数", "广告费比", "退货率", "退款率"], ["B0GC3HFWHP", "BFRS258", "BF卡式炉", "BFRS258-GM", "BIFULISAN Store", 24, 102, 4.2, 156, 12.5, 3.2, 5.1]);
const tmplFba = () => downloadTemplate("FBA库存明细", ["ASIN", "SKU", "FBA库存"], ["B0GC3HFWHP", "BFRS258", 186]);
const tmplWarehouse = () => downloadTemplate("仓库明细(FBM)", ["SKU", "仓库", "库存"], ["BFRS258", "美西", 180]);
const tmplTransitDetail = () => downloadTemplate("在途明细", ["SKU", "承运商", "目的仓", "件数", "预计到仓"], ["BFRS258", "乐歌", "美西", 80, "2026-08-05"]);
const tmplFactory = () => downloadTemplate("工厂明细", ["SKU", "工厂名", "件数", "交期", "状态"], ["BFRS258", "东莞美联", 120, "2026-08-25", "producing"]);
const tmplShipping = () => downloadTemplate("头程尾程更新", ["SKU", "头程费", "配送费"], ["BFRS258", 12.3, 4.56]);

const tmplBundle = () => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: 销量导入（合并原运营数据导入字段：品名 + MSKU级指标）
  const s1Headers = ["ASIN", "SKU", "品名", "MSKU", "店铺", "7天销量", "30天销量", "评分", "评论数", "广告费比", "退货率", "退款率"];
  const s1 = XLSX.utils.aoa_to_sheet([s1Headers, ["B0GC3HFWHP", "BFRS258", "BF卡式炉", "BFRS258-GM", "BIFULISAN Store", 24, 102, 4.2, 156, 12.5, 3.2, 5.1]]);
  s1["!cols"] = autoCols(s1Headers);
  XLSX.utils.book_append_sheet(wb, s1, "销量导入");

  // Sheet 2: FBA库存明细
  const s3 = XLSX.utils.aoa_to_sheet([["ASIN", "SKU", "FBA库存"], ["B0GC3HFWHP", "BFRS258", 186]]);
  s3["!cols"] = autoCols(["ASIN", "SKU", "FBA库存"]);
  XLSX.utils.book_append_sheet(wb, s3, "FBA库存明细");

  // Sheet 3: 仓库明细(FBM)
  const s4 = XLSX.utils.aoa_to_sheet([["SKU", "仓库", "库存"], ["BFRS258", "美西", 180]]);
  s4["!cols"] = autoCols(["SKU", "仓库", "库存"]);
  XLSX.utils.book_append_sheet(wb, s4, "仓库明细(FBM)");

  // Sheet 4: 在途明细
  const s5 = XLSX.utils.aoa_to_sheet([["SKU", "承运商", "目的仓", "件数", "预计到仓"], ["BFRS258", "乐歌", "美西", 80, "2026-08-05"]]);
  s5["!cols"] = autoCols(["SKU", "承运商", "目的仓", "件数", "预计到仓"]);
  XLSX.utils.book_append_sheet(wb, s5, "在途明细");

  // Sheet 5: 工厂明细
  const s6 = XLSX.utils.aoa_to_sheet([["SKU", "工厂名", "件数", "交期", "状态"], ["BFRS258", "东莞美联", 120, "2026-08-25", "producing"]]);
  s6["!cols"] = autoCols(["SKU", "工厂名", "件数", "交期", "状态"]);
  XLSX.utils.book_append_sheet(wb, s6, "工厂明细");

  // Sheet 6: 头程尾程更新
  const s7 = XLSX.utils.aoa_to_sheet([["SKU", "头程费", "配送费"], ["BFRS258", 12.3, 4.56]]);
  s7["!cols"] = autoCols(["SKU", "头程费", "配送费"]);
  XLSX.utils.book_append_sheet(wb, s7, "头程尾程更新");

  // Sheet 7: SKU标识符(一次性迁移)（含产品链接 + 竞品链接）
  const s8Headers = ["店铺", "SKU", "品名", "MSKU", "ASIN", "UPC", "品类", "上架日期", "售价", "运费", "FOB", "仓租", "发货方式", "包裹长cm", "包裹宽cm", "包裹高cm", "包裹重kg", "单箱数", "产品链接", "竞品链接"];
  const s8 = XLSX.utils.aoa_to_sheet([s8Headers, ["BIFULISAN Store", "BFRS258", "BF卡式炉", "BFRS258-GM", "B0GC3HFWHP", "4901234567890", "户外炉具", "2026-01-15", 39.99, 0, 28.5, 0.8, "FBA", 30, 25, 20, 1.2, 10, "https://www.amazon.com/dp/B0GC3HFWHP", "https://www.amazon.com/dp/B0XXXXXXXX\nhttps://www.amazon.com/dp/B0YYYYYYYY"]]);
  s8["!dataValidations"] = [{ type: "list", formula1: '"FBA,FBM,混发"', sqref: "M2:M101" }];
  s8["!cols"] = autoCols(s8Headers);
  XLSX.utils.book_append_sheet(wb, s8, "SKU标识符");

  XLSX.writeFile(wb, "【模板】综合运营表.xlsx");
};

const tmplBundleCsv = () => {
  const headers = ["SKU", "MSKU", "近7天日均", "近30天销量", "评分", "评论数", "广告费比", "退货率", "退款率", "FBA在库", "仓库", "FBM库存", "承运商", "目的仓", "件数", "预计到仓", "工厂名", "交期", "状态", "FOB", "头程费", "配送费", "店铺", "ASIN", "售价", "运费"];
  const example = ["BFRS258", "BFRS258-GM", 3.42, 102, 4.2, 156, 12.5, 3.2, 5.1, 186, "美西", 180, "乐歌", "美西", 80, "2026-08-05", "东莞美联", "2026-08-25", "producing", 28.5, 12.3, 4.56, "BIFULISAN Store", "B0GC3HFWHP", 39.99, 5.99];
  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = autoCols(headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "综合运营表");
  XLSX.writeFile(wb, "【模板】综合运营表.csv", { bookType: "csv" });
};

const tmplIdentifiers = () =>
  downloadTemplate("SKU标识符(一次性迁移)", ["店铺", "SKU", "品名", "MSKU", "ASIN", "UPC", "品类", "上架日期", "售价", "运费", "FOB", "仓租", "发货方式", "包裹长cm", "包裹宽cm", "包裹高cm", "包裹重kg", "单箱数", "产品链接", "竞品链接"], ["BIFULISAN Store", "BFRS258", "BF卡式炉", "BFRS258-GM", "B0GC3HFWHP", "4901234567890", "户外炉具", "2026-01-15", 39.99, 5.99, 28.5, 0.8, "FBA", 30, 25, 20, 1.2, 10, "https://www.amazon.com/dp/B0GC3HFWHP", "https://www.amazon.com/dp/B0XXXXXXXX\nhttps://www.amazon.com/dp/B0YYYYYYYY"], [
    { type: "list", formula1: '"FBA,FBM,混发"', sqref: "M2:M101" },
  ]);

/* ────────── 标签页配置 ────────── */
const tabDefs = [
  { key: "bundle", label: "\u7efc\u5408\u8fd0\u8425\u8868", icon: "ri-file-excel-2-line", freq: "\u9996\u6b21", desc: "\u4e00\u952e\u4e0b\u8f7d\u5168\u90e8 7 \u4e2a Sheet \u00b7 \u5468\u9500\u91cf(\u542b\u54c1\u540d/\u94fe\u63a5) / FBA / \u4ed3\u5e93 / \u5728\u9014 / \u5de5\u5382 / \u5934\u7a0b / SKU", tmpl: tmplBundle },
  { key: "warehouse_mapping", label: "\u4ed3\u5e93\u6620\u5c04", icon: "ri-map-2-line", freq: "\u914d\u7f6e", desc: "\u4ed3\u5e93\u540d\u79f0 \u2192 \u533a\u57df\u6620\u5c04\uff08\u7f8e\u4e1c/\u7f8e\u897f/\u4e1c\u5357/\u4e2d\u5357\uff09\uff0c\u5bfc\u5165\u65f6\u81ea\u52a8\u5339\u914d" },
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

  /* 导入日期范围（用户可指定数据对应的日期，默认今天） */
  const todayStr = () => new Date().toISOString().slice(0, 10);

  /* 计算周一日期：getDay() 返回 0=周日..6=周六，统一换算到周一 */
  const getMonday = (base: Date): Date => {
    const d = new Date(base);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // 周日回到上一个周一，其他天回到本周一
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const fmtDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  /* 本周：周一 ~ 周日 */
  const thisWeekRange = (): [string, string] => {
    const mon = getMonday(new Date());
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return [fmtDate(mon), fmtDate(sun)];
  };

  /* 上周：上周一 ~ 上周日 */
  const lastWeekRange = (): [string, string] => {
    const mon = getMonday(new Date());
    mon.setDate(mon.getDate() - 7);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return [fmtDate(mon), fmtDate(sun)];
  };

  const [importDateStart, setImportDateStart] = useState(todayStr);
  const [importDateEnd, setImportDateEnd] = useState(todayStr);
  const importDateLabel = importDateStart === importDateEnd ? importDateStart : `${importDateStart} ~ ${importDateEnd}`;

  /* 日期冲突检测：检查所选日期是否已有快照数据 */
  const [existingDates, setExistingDates] = useState<Set<string>>(new Set());
  const [dateConflict, setDateConflict] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);

  /* 导入模式选择 */
  const [modeModal, setModeModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  /* 数据健康报告（写入 IndexedDB 前的安检，必须由用户「确认并继续」） */
  const [healthReport, setHealthReport] = useState<ValidationResult | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    parsed: ImportResult;
    validation: ValidationResult;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  /* 加载已有快照日期，用于冲突检测 */
  const loadExistingDates = useCallback(async () => {
    const snaps = await db.dailySnapshot.toArray();
    const dates = new Set(snaps.map((s) => s.date));
    setExistingDates(dates);
    return dates;
  }, []);

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
    loadExistingDates();
  }, []);

  /* 日期变更时检查冲突：直接查询数据库，不依赖 existingDates 状态（避免空 Set 导致无限循环） */
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const count = await db.dailySnapshot.where("date").equals(importDateStart).count();
        if (cancelled) return;
        if (count > 0) {
          setDateConflict(true);
          setConflictCount(count);
        } else {
          setDateConflict(false);
          setConflictCount(0);
        }
      } catch {
        // date 索引不存在时静默跳过
      }
    };
    check();
    return () => { cancelled = true; };
  }, [importDateStart]);

  // 导入完成后自动同步店铺记录 + 刷新已有日期
  const prevImporting = useRef<string | null>(null);
  useEffect(() => {
    if (prevImporting.current !== null && importing === null) {
      ensureDefaultShops().then(() => {
        getAllShops().then(setShops);
      });
      loadExistingDates();
      db.dailySnapshot.count().then((n) => setImportCounts((prev) => ({ ...prev, snapshots: n })));
    }
    prevImporting.current = importing;
  }, [importing, loadExistingDates]);

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
      const parsed = parseOperationExcel(buf, importDateStart);

      // 字段识别结果先展示（即使被阻断也展示，供用户确认规则 H 的匹配情况）
      setResult(parsed);

      // 关键字段缺失 → 阻断导入（规则 H：未识别到 SKU / 销量则阻止导入，不静默导入空数据）
      if (parsed.missingCritical.length > 0) {
        const labelMap: Record<string, string> = { sku: "SKU 列", sales: "销量列" };
        const missing = parsed.missingCritical.map((f) => labelMap[f] ?? f).join(" / ");
        setError(
          `未识别到${missing}，已阻断导入。请检查表头列名（已支持模糊匹配：FOB / 采购价 / 产品成本 / 含税成本 均可识别为成本；SKU / 产品SKU / SKU码 等均可识别为 SKU）。`,
        );
        setParsing(false);
        return;
      }

      // ── 数据健康校验（写入 IndexedDB 之前） ──
      // 按 9 条规则逐行校验：错误→跳过 / 警告→自动修正 / 提示→标记
      // 校验通过后弹出「数据健康报告」面板，用户必须点「确认并继续」才写入
      const validation = validateImportData(parsed);
      setHealthReport(validation);
      setPendingImport({ parsed, validation });
      setParsing(false);
      // 不直接写入，等待用户确认
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setParsing(false);
    }
  };

  /* ────────── 用户点击「确认并继续」→ 实际写入 IndexedDB ────────── */
  const confirmImport = async () => {
    if (!pendingImport) return;
    const { parsed, validation } = pendingImport;
    setConfirming(true);
    setError(null);
    try {
      // 使用校验后的有效数据（已自动修正警告项，已过滤错误行）
      const validSkuMaster = validation.validRows.skuMaster;
      const validSnapshots = validation.validRows.dailySnapshot;
      const validInventory = validation.validRows.inventoryLayer;

      // ── 店铺联动：综合运营表导入时把「店铺」列自动同步到店铺管理 ──
      // parseOperationExcel 是同步函数，店铺名还是原始字符串，这里统一解析成 shop id
      // （getOrCreateShopByName 会按名查找，不存在则自动创建，与另外两个导入入口一致）
      const storeNameToId = new Map<string, string>();
      for (const m of validSkuMaster) {
        const name = (m.store || "").trim();
        // 跳过空值、占位符、以及已经是 shop_xxx id 的情况（避免重复建店铺）
        if (!name || name === "-" || name.startsWith("shop_")) continue;
        if (!storeNameToId.has(name)) {
          storeNameToId.set(name, await getOrCreateShopByName(name));
        }
      }
      if (storeNameToId.size > 0) {
        for (let i = 0; i < validSkuMaster.length; i++) {
          const name = (validSkuMaster[i].store || "").trim();
          const id = storeNameToId.get(name);
          if (id) validSkuMaster[i] = { ...validSkuMaster[i], store: id };
        }
      }

      // ── 合并批次数据到 inventoryLayer ──
      const today = parsed.today;

      // 获取仓库映射并自动猜测未映射的仓库
      const regionMap = await getWarehouseRegionMap();
      for (const layer of validInventory) {
        if (layer.warehouseBreakdown) {
          for (const wb of layer.warehouseBreakdown) {
            if (!regionMap.has(wb.warehouse)) {
              const guessed = guessRegion(wb.warehouse);
              if (guessed) {
                await upsertWarehouseMapping(wb.warehouse, guessed);
                regionMap.set(wb.warehouse, guessed);
              }
            }
          }
        }
      }

      const mergedLayers = validInventory.map((layer) => {
        const tb = parsed.transitBatches.get(layer.sku);
        const fb = parsed.factoryBatches.get(layer.sku);
        // 按区域汇总在库库存
        let eastStock = 0, westStock = 0, southeastStock = 0, southcentralStock = 0;
        if (layer.warehouseBreakdown) {
          for (const wb of layer.warehouseBreakdown) {
            const region = regionMap.get(wb.warehouse);
            switch (region) {
              case "east": eastStock += wb.qty; break;
              case "west": westStock += wb.qty; break;
              case "southeast": southeastStock += wb.qty; break;
              case "southcentral": southcentralStock += wb.qty; break;
            }
          }
        }
        return {
          ...layer,
          eastStock,
          westStock,
          southeastStock,
          southcentralStock,
          ...(tb && tb.length > 0 ? { transitBatches: tb } : {}),
          ...(fb && fb.length > 0 ? { factoryBatches: fb } : {}),
        };
      });

      // 补充只有批次没有库存的 SKU（仅在未被校验过滤的情况下保留批次数据）
      const coveredSkus = new Set(validInventory.map((l) => l.sku));
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
            eastStock: 0,
            westStock: 0,
            southeastStock: 0,
            southcentralStock: 0,
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
      if (validSkuMaster.length > 0) {
        await upsertSkuMaster(validSkuMaster);
      }
      // 增量成本更新：单表「头程更新」场景，skuMaster 为空，
      // 需按 SKU 回写现有 skuMaster 的 costShipping/costDelivery（见 cost-merge.ts）
      if (validSkuMaster.length === 0 && parsed.shippingMap.size > 0) {
        await applyIncrementalCostUpdate(parsed.shippingMap);
      }
      // 保存销量快照
      if (validSnapshots.length > 0) {
        await upsertSnapshots(validSnapshots);
      }
      // 保存分仓库存
      await upsertInventoryLayers(mergedLayers);

      // 保存数据健康报告（供「数据健康」页查看最近一次导入结果）
      await setLatestHealthReport(validation);

      // 更新展示结果为实际入库的有效数据
      setResult({
        ...parsed,
        skuMaster: validSkuMaster,
        dailySnapshot: validSnapshots,
        inventoryLayer: validInventory,
      });
      setHealthReport(null);
      setPendingImport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  /** 用户点击「取消导入」→ 放弃本次导入 */
  const cancelImport = () => {
    setHealthReport(null);
    setPendingImport(null);
    setResult(null);
  };

  /* ────────── 周销量导入（合并原运营数据导入功能：品名/店铺/ASIN/链接）────────── */
  const handleSalesImport = async (file: File) => {
    setImportMsg(null);
    setImporting("sales");
    try {
      const rows = await parseExcelFile(file);
      const today = importDateStart;
      // 合并原运营数据导入字段：msku/asin/store/name/productUrl/competitorUrls
      const cm = buildColumnMap(
        ["sku", "msku", "asin", "store", "name", "sales7d", "sales30d", "rating", "reviewCount", "adRatio", "returnRate", "refundRate", "productUrl", "competitorUrls"],
        headersOf(rows),
      );
      // 匹配口径：支持 SKU 或 ASIN 或 MSKU（与综合运营表 Step 2 一致）
      if (!cm.sku && !cm.asin && !cm.msku) {
        setImportMsg({ tone: "err", msg: "未识别到 SKU / ASIN / MSKU 列，已阻断导入。销量导入支持以 ASIN 或 MSKU 为口径匹配。" });
        setImporting(null);
        return;
      }
      if (!cm.sales7d && !cm.sales30d) {
        setImportMsg({ tone: "err", msg: "未识别到销量列（7天/30天销量），已阻断导入。请检查表头（近7天销量 / 30天销量 / 周销量 等均可识别）。" });
        setImporting(null);
        return;
      }
      const snapshots: Omit<DailySnapshot, "id">[] = [];
      let skuCreated = 0;
      let skuUpdated = 0;

      // ASIN → SKU / MSKU → SKU 查找表（当表中无直接 SKU 列时用）
      const asinToSkuMap = new Map<string, string>();
      const mskuToSkuMap = new Map<string, string>();
      if (!cm.sku) {
        const allSkus = await db.skuMaster.toArray();
        for (const s of allSkus) {
          if (s.asin) asinToSkuMap.set(s.asin, s.sku);
          if (s.msku) {
            for (const m of s.msku.split(",")) {
              const trimmed = m.trim();
              if (trimmed) mskuToSkuMap.set(trimmed, s.sku);
            }
          }
          if (s.mskuStores) {
            for (const ms of s.mskuStores) {
              if (ms.msku) mskuToSkuMap.set(ms.msku, s.sku);
            }
          }
        }
      }

      for (const row of rows) {
        let sku = cm.sku ? str(pickCell(row, cm.sku)) : "";
        // 以 ASIN 为口径
        if (!sku && cm.asin) {
          const asinVal = str(pickCell(row, cm.asin));
          sku = asinToSkuMap.get(asinVal) ?? "";
        }
        // 以 MSKU 为口径
        if (!sku && cm.msku) {
          const mskuVal = str(pickCell(row, cm.msku));
          sku = mskuToSkuMap.get(mskuVal) ?? "";
        }
        if (!sku) continue;

        const existing = await db.skuMaster.get(sku);
        const prevSnapshot = existing ? await db.dailySnapshot.where({ sku }).reverse().first() : undefined;

        // 合并原运营数据导入：品名/店铺/ASIN/链接 → 更新或创建 SkuMaster
        const storeName = str(pickCell(row, cm.store));
        const storeVal = storeName ? await getOrCreateShopByName(storeName) : (existing?.store || selectedShopId || "-");
        const nameVal = str(pickCell(row, cm.name)) || sku;
        const asinVal = str(pickCell(row, cm.asin));
        const productUrlRaw = str(pickCell(row, cm.productUrl)) || undefined;
        const compRaw = str(pickCell(row, cm.competitorUrls));
        const compUrls = compRaw ? compRaw.split(/[\n;；|]+/).map((s) => s.trim()).filter(Boolean) : undefined;

        // 更新/创建 SkuMaster（first-wins 策略，新建时填值，已存在时仅补空）
        if (existing) {
          const updates: Partial<SkuMaster> = {};
          if (storeVal && storeVal !== "-") updates.store = storeVal;
          if (nameVal && nameVal !== sku && !existing.name) updates.name = nameVal;
          if (asinVal && !existing.asin) updates.asin = asinVal;
          if (!existing.productUrl && productUrlRaw) updates.productUrl = productUrlRaw;
          if ((!existing.competitorUrls || existing.competitorUrls.length === 0) && compUrls && compUrls.length > 0) {
            updates.competitorUrls = compUrls;
          }
          if (Object.keys(updates).length > 0) {
            await db.skuMaster.put({ ...existing, ...updates });
            skuUpdated++;
          }
        } else {
          const master: SkuMaster = {
            sku,
            name: nameVal || sku,
            store: storeVal,
            price: 0,
            saleStatus: "active",
            fulfillment: "FBM",
            asin: asinVal || undefined,
            productUrl: productUrlRaw,
            competitorUrls: compUrls && compUrls.length > 0 ? compUrls : undefined,
          };
          await db.skuMaster.put(master);
          skuCreated++;
        }

        // 支持"7天销量"(周期总量)自动算日均，也兼容"近7天日均"(直接日均值)
        const sales7dRaw = num(pickCell(row, cm.sales7d));
        const isWeeklyTotal = cm.sales7d != null && !/日均|日销量|daily/i.test(cm.sales7d);
        const dailySales7d = isWeeklyTotal ? Math.round(sales7dRaw / 7 * 100) / 100 : sales7dRaw;
        const monthlyRaw = num(pickCell(row, cm.sales30d));
        const isMonthlyTotal = cm.sales30d != null;
        const monthlySales = isMonthlyTotal ? Math.round(monthlyRaw / 30 * 100) / 100 : monthlyRaw;

        // 可选字段：评分、评论数、广告费比、退货率、退款率
        const rating = num(pickCell(row, cm.rating));
        const reviewCount = num(pickCell(row, cm.reviewCount));
        const adRatio = num(pickCell(row, cm.adRatio));
        const returnRate = num(pickCell(row, cm.returnRate));
        const refundRate = num(pickCell(row, cm.refundRate));

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
        snap.daysOfCoverOnHand = snap.dailySales7d > 0 ? Number((snap.stockOnHand / snap.dailySales7d).toFixed(1)) : Infinity;
        snap.daysOfCoverWithTransit = snap.dailySales7d > 0 ? Number(((snap.stockOnHand + snap.stockInTransit) / snap.dailySales7d).toFixed(1)) : Infinity;
        snapshots.push(snap);
      }

      await upsertSnapshots(snapshots);
      const parts = [];
      if (skuCreated > 0) parts.push(`新建SKU ${skuCreated} 个`);
      if (skuUpdated > 0) parts.push(`更新SKU ${skuUpdated} 个`);
      parts.push(`快照 ${snapshots.length} 条`);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${parts.join(" · ")}（${importDateLabel}）` });
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
      const today = importDateStart;
      const cm = buildColumnMap(["sku", "fbaStock"], headersOf(rows));
      if (!cm.sku) {
        setImportMsg({ tone: "err", msg: "未识别到 SKU 列，已阻断导入。请检查表头（SKU / 产品SKU / SKU码 均可识别）。" });
        setImporting(null);
        return;
      }
      const layers: Omit<InventoryLayer, "id">[] = [];
      for (const row of rows) {
        const sku = str(pickCell(row, cm.sku));
        if (!sku) continue;
        const existing = await db.inventoryLayer.where({ sku, date: today }).first();
        layers.push({
          date: today, sku,
          fbaStock: num(pickCell(row, cm.fbaStock)),
          fbmStock: existing?.fbmStock ?? 0,
          factoryStock: existing?.factoryStock ?? 0,
          eastTransit: existing?.eastTransit ?? 0,
          westTransit: existing?.westTransit ?? 0,
          southeast: existing?.southeast ?? 0,
          southcentral: existing?.southcentral ?? 0,
        });
      }
      await upsertInventoryLayers(layers);
      setImportMsg({ tone: "ok", msg: `导入成功 · ${layers.length} 条 FBA 库存明细（${importDateLabel}）` });
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
      const today = importDateStart;
      const cm = buildColumnMap(["sku", "warehouse", "qty"], headersOf(rows));
      if (!cm.sku) {
        setImportMsg({ tone: "err", msg: "未识别到 SKU 列，已阻断导入。请检查表头（SKU / 产品SKU / SKU码 均可识别）。" });
        setImporting(null);
        return;
      }
      const skuWarehouses = new Map<string, { warehouse: string; qty: number }[]>();
      for (const row of rows) {
        const sku = str(pickCell(row, cm.sku));
        if (!sku) continue;
        const warehouse = str(pickCell(row, cm.warehouse));
        const qty = num(pickCell(row, cm.qty));
        if (!warehouse) continue;
        const list = skuWarehouses.get(sku) ?? [];
        list.push({ warehouse, qty });
        skuWarehouses.set(sku, list);
      }

      // 获取仓库映射，并为未映射的仓库自动猜测并保存
      const regionMap = await getWarehouseRegionMap();
      const unmapped = new Set<string>();
      for (const warehouses of skuWarehouses.values()) {
        for (const w of warehouses) {
          if (!regionMap.has(w.warehouse)) {
            const guessed = guessRegion(w.warehouse);
            if (guessed) {
              await upsertWarehouseMapping(w.warehouse, guessed);
              regionMap.set(w.warehouse, guessed);
            } else {
              unmapped.add(w.warehouse);
            }
          }
        }
      }

      const layers: Omit<InventoryLayer, "id">[] = [];
      for (const [sku, warehouses] of skuWarehouses) {
        const existing = await db.inventoryLayer.where({ sku, date: today }).first();
        // 按区域汇总在库库存
        let eastStock = 0, westStock = 0, southeastStock = 0, southcentralStock = 0;
        for (const w of warehouses) {
          const region = regionMap.get(w.warehouse);
          switch (region) {
            case "east": eastStock += w.qty; break;
            case "west": westStock += w.qty; break;
            case "southeast": southeastStock += w.qty; break;
            case "southcentral": southcentralStock += w.qty; break;
          }
        }
        layers.push({
          date: today, sku,
          fbaStock: existing?.fbaStock ?? 0,
          fbmStock: warehouses.reduce((s, w) => s + w.qty, 0),
          factoryStock: existing?.factoryStock ?? 0,
          eastTransit: existing?.eastTransit ?? 0,
          westTransit: existing?.westTransit ?? 0,
          southeast: existing?.southeast ?? 0,
          southcentral: existing?.southcentral ?? 0,
          eastStock,
          westStock,
          southeastStock,
          southcentralStock,
          warehouseBreakdown: warehouses.map((w) => ({
            warehouse: w.warehouse,
            qty: w.qty,
            daysOfCover: 0,
          })),
        });
      }
      await upsertInventoryLayers(layers);
      const unmappedMsg = unmapped.size > 0
        ? `（${unmapped.size} 个仓库未识别区域，请在「仓库映射」标签页配置）`
        : "";
      setImportMsg({ tone: "ok", msg: `导入成功 · ${layers.length} 个 SKU 的仓库明细（${importDateLabel}）${unmappedMsg}` });
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
      const today = importDateStart;
      const cm = buildColumnMap(["sku", "provider", "dest", "etaDate", "shipDate", "qty", "statusText"], headersOf(rows));
      if (!cm.sku) {
        setImportMsg({ tone: "err", msg: "未识别到 SKU 列，已阻断导入。请检查表头（SKU / 产品SKU / SKU码 均可识别）。" });
        setImporting(null);
        return;
      }
      const skuBatches = new Map<string, TransitBatch[]>();
      for (const row of rows) {
        const sku = str(pickCell(row, cm.sku));
        if (!sku) continue;
        const provider = str(pickCell(row, cm.provider));
        const dest = str(pickCell(row, cm.dest));
        const warehouse = provider && dest ? `${provider}-${dest}` : provider || dest || "在途";
        const batch: TransitBatch = {
          warehouse,
          qty: num(pickCell(row, cm.qty)),
          etaDate: str(pickCell(row, cm.etaDate)),
          shipDate: str(pickCell(row, cm.shipDate)) || undefined,
          statusText: str(pickCell(row, cm.statusText)) || undefined,
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
      setImportMsg({ tone: "ok", msg: `导入成功 · ${skuBatches.size} 个 SKU · ${totalBatches} 条在途批次（${importDateLabel}）` });
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
      const today = importDateStart;
      const cm = buildColumnMap(["sku", "factoryName", "qty", "totalQty", "deliveryDate", "factoryStatus"], headersOf(rows));
      if (!cm.sku) {
        setImportMsg({ tone: "err", msg: "未识别到 SKU 列，已阻断导入。请检查表头（SKU / 产品SKU / SKU码 均可识别）。" });
        setImporting(null);
        return;
      }
      const skuBatches = new Map<string, FactoryBatch[]>();
      for (const row of rows) {
        const sku = str(pickCell(row, cm.sku));
        if (!sku) continue;
        const batch: FactoryBatch = {
          factoryName: str(pickCell(row, cm.factoryName)),
          qty: num(pickCell(row, cm.qty)),
          totalQty: num(pickCell(row, cm.totalQty)) || undefined,
          deliveryDate: str(pickCell(row, cm.deliveryDate)),
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
      setImportMsg({ tone: "ok", msg: `导入成功 · ${skuBatches.size} 个 SKU · ${totalBatches} 条工厂批次（${importDateLabel}）` });
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
      const cm = buildColumnMap(["sku", "shipping", "delivery"], headersOf(rows));
      if (!cm.sku) {
        setImportMsg({ tone: "err", msg: "未识别到 SKU 列，已阻断导入。请检查表头（SKU / 产品SKU / SKU码 均可识别）。" });
        setImporting(null);
        return;
      }
      let updated = 0;
      for (const row of rows) {
        const sku = str(pickCell(row, cm.sku));
        if (!sku) continue;
        const master = await db.skuMaster.get(sku);
        if (!master) continue;

        const updates: Partial<SkuMaster> = {};
        const shipping = num(pickCell(row, cm.shipping));
        const delivery = num(pickCell(row, cm.delivery));
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
      const cm = buildColumnMap(
        ["sku", "store", "name", "msku", "asin", "price", "fob", "costStorage", "fulfillment"],
        headersOf(rows),
      );
      if (!cm.sku) {
        setImportMsg({ tone: "err", msg: "未识别到 SKU 列，已阻断导入。请检查表头（SKU / 产品SKU / SKU码 均可识别）。" });
        setImporting(null);
        return;
      }
      let created = 0;
      let updated = 0;
      const seenSku = new Set<string>(); // 追踪已出现的父SKU
      for (const row of rows) {
        const sku = str(pickCell(row, cm.sku));
        if (!sku) continue;
        const storeName = str(pickCell(row, cm.store));
        const store = storeName ? await getOrCreateShopByName(storeName) : (selectedShopId || "-");
        const name = str(pickCell(row, cm.name)) || sku;
        const msku = str(pickCell(row, cm.msku));
        const asin = str(pickCell(row, cm.asin));
        const price = num(pickCell(row, cm.price));
        // 列名模糊匹配（规则 H）：FOB / fob / FOB成本 / 采购价 / 产品成本 / 含税成本 等均可识别
        const costFob = num(pickCell(row, cm.fob));
        const costStorage = num(pickCell(row, cm.costStorage));
        const fulfillment = normalizeFulfillment(pickCell(row, cm.fulfillment));

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
      await db.transaction("rw", [
        db.skuMaster, db.dailySnapshot, db.inventoryLayer,
        db.campaigns, db.promotions, db.manualPromotions,
        db.alerts, db.config, db.warehouseProviders,
        db.estimates, db.todos, db.calculationRecords, db.shops,
      ], async () => {
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
    <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-5">
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
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] bg-primary-500 px-3 py-2 text-[12px] font-semibold text-background-50 hover:bg-primary-600 whitespace-nowrap">
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
          onClick={() => { const t = tabDefs.find((x) => x.key === activeTab); if (t && "tmpl" in t) t.tmpl(); }}
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
      <div className="flex items-center gap-3 rounded-[14px] border border-background-200/70 bg-background-100/50 px-4 py-3">
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
          导入时使用 Excel「店铺」列；若该店铺在店铺管理中不存在，将自动创建。
        </span>
      </div>

      {/* ── 数据日期选择器 ── */}
      <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <i className="ri-calendar-range-line text-[16px] text-foreground-500" aria-hidden />
            <span className="text-[13px] font-medium text-foreground-700">数据日期：</span>
          </div>
          <input
            type="date"
            value={importDateStart}
            onChange={(e) => setImportDateStart(e.target.value)}
            className="rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
          />
          <span className="text-[11px] text-foreground-400">至</span>
          <input
            type="date"
            value={importDateEnd}
            onChange={(e) => setImportDateEnd(e.target.value)}
            className="rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
          />
          {/* 快速选择按钮 */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { const [s, e] = thisWeekRange(); setImportDateStart(s); setImportDateEnd(e); }}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors ${
                importDateStart === thisWeekRange()[0]
                  ? "bg-primary-500 text-white"
                  : "border border-background-300/70 bg-background-50 text-foreground-500 hover:bg-background-100 hover:text-foreground-800"
              }`}
            >
              本周
            </button>
            <button
              type="button"
              onClick={() => { const [s, e] = lastWeekRange(); setImportDateStart(s); setImportDateEnd(e); }}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors ${
                importDateStart === lastWeekRange()[0]
                  ? "bg-accent-500 text-white"
                  : "border border-background-300/70 bg-background-50 text-foreground-500 hover:bg-background-100 hover:text-foreground-800"
              }`}
            >
              上周
            </button>
          </div>
        </div>
        {/* 日期冲突警告 */}
        {dateConflict ? (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-secondary-300 bg-secondary-50 px-3 py-2">
            <i className="ri-error-warning-line mt-0.5 text-[14px] text-secondary-700" aria-hidden />
            <div className="flex-1 text-[12px]">
              <span className="font-semibold text-secondary-800">该日期已有 {conflictCount} 条快照数据。</span>
              <span className="text-secondary-600"> 继续导入将与现有数据合并（新值覆盖旧值）。如需导入上周数据，请点击「上周」按钮选择上周日期，避免覆盖本周数据。</span>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-foreground-400">
            <i className="ri-information-line" aria-hidden />
            <span>快照和库存记录将标记为起始日期。<strong className="text-foreground-600">导入上周数据时请选择上周的日期</strong>，否则会与本周数据合并覆盖。</span>
          </div>
        )}
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
                body: "首次使用系统时，从领星产品管理导出店铺/SKU/品名/MSKU/ASIN/售价，补上 FOB 后通过「SKU 标识符」入口导入。模板已含产品链接和竞品链接列（多个竞品用换行分隔），导入后可在 SKU 详情页直接点击跳转。之后新增 SKU 也可通过此入口批量补充。",
              },
              {
                icon: "ri-bar-chart-line",
                title: "2. 周销量（每周一，合并原运营数据导入）",
                body: "从 Amazon 后台导出近7天日均销量和近30天销量，导入即可。系统会自动创建新的日期快照，上周数据不会覆盖——Dashboard 自动算本周 vs 上周的环比变化。注意：导入前请确认「数据日期」选择正确——本周数据选「本周」，上周数据选「上周」，否则同一天的数据会合并覆盖。模板已含 ASIN/品名/MSKU/店铺/评分/评论数/广告费比/退货率/退款率/产品链接/竞品链接，按 MSKU 行填写可展示各变体独立指标和自然/广告订单占比；不写 SKU 时可直接以 ASIN 或 MSKU 匹配；品名/店铺/链接等信息会自动写入 SKU 主档（已存在则仅补空），竞品链接多个用换行分隔。",
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
                icon: "ri-building-line",
                title: "6. 工厂明细（按需）",
                body: "SKU · 工厂名 · 件数 · 交期。工厂生产进度或新批次下单时更新。",
              },
              {
                icon: "ri-ship-2-line",
                title: "7. 头程更新（每月/变动时）",
                body: "头程费与配送费在此更新，覆盖已有值。FOB 产品成本请在「SKU 标识符」表里一并维护（不再有独立入口）。也可在「参数中心 → SKU 供应链参数」手动修改。",
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
              <li><strong>数据日期选择：</strong>导入本周数据点「本周」按钮，补导上周数据点「上周」按钮——日期不同则数据独立保存、不会覆盖，Dashboard 自动生成环比对比</li>
              <li><strong>周销量模板已含 MSKU 级指标：</strong>同一 SKU 的不同 MSKU 各占一行，填写各自的评分/广告费比/退货率/退款率，系统自动按 MSKU 独立存储，不再串用</li>
              <li><strong>每月初或头程变动时：</strong>导入「头程更新」；FOB 变动请在「SKU 标识符」表里更新</li>
              <li><strong>产品链接/竞品链接：</strong>在「SKU 标识符」或「周销量」表中填写，竞品链接多个用换行分隔，导入后 SKU 详情页可点击跳转</li>
              <li><strong>促销报名后：</strong>去「促销运营中心」添加促销活动并录入成本，促销时间线自动生成</li>
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
            <div
              className="flex flex-col items-center rounded-[14px] border-2 border-dashed border-background-300/80 bg-background-100/50 px-6 py-10 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/30"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary-500", "bg-primary-50/50"); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary-500", "bg-primary-50/50"); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-primary-500", "bg-primary-50/50");
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setPendingFile(f);
                  setModeModal(true);
                }
              }}
            >
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
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
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
                {/* 字段识别结果（规则 H）：逻辑字段 → 实际列名，供用户确认 */}
                <div className="rounded-lg border border-background-200/70 bg-background-50 p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground-800">
                    <i className="ri-boolean-operation-line text-primary-600" aria-hidden />
                    字段识别结果
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {RECOGNITION_FIELDS.map((f) => {
                      const actual = result.columnMap[f.key];
                      return actual ? (
                        <Badge key={f.key} tone="accent">{f.label} → {actual}</Badge>
                      ) : (
                        <Badge key={f.key} tone="danger">{f.label} ✗ 未识别</Badge>
                      );
                    })}
                  </div>
                </div>
                {!error && (
                  <div className="rounded-lg border border-accent-200 bg-accent-100/60 px-4 py-3 text-[13px] text-accent-900">
                    <div className="font-semibold">✓ 导入成功（{importDateLabel}）</div>
                    <div className="mt-1 text-[12px]">
                      SKU {result.skuMaster.length} 个 · 快照 {result.dailySnapshot.length} 条 · 分仓 {result.inventoryLayer.length} 条
                      {result.transitBatches.size > 0 && ` · 在途批次 ${[...result.transitBatches.values()].reduce((s, b) => s + b.length, 0)} 条`}
                      {result.factoryBatches.size > 0 && ` · 工厂批次 ${[...result.factoryBatches.values()].reduce((s, b) => s + b.length, 0)} 条`}
                    </div>
                  </div>
                )}
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
              : activeTab === "fba"
              ? handleFbaImport
              : activeTab === "warehouse"
                ? handleWarehouseImport
                : activeTab === "transit_detail"
                  ? handleTransitDetailImport
                  : activeTab === "factory"
                    ? handleFactoryImport
                    : activeTab === "shipping"
                      ? handleShippingImport
                      : handleIdentifiersImport,
            `上传${currentTab.label} Excel`
          )}

          {activeTab === "sales" && (
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

      {/* ── 仓库映射配置 ── */}
      {activeTab === "warehouse_mapping" && (
        <Section
          title="仓库区域映射"
          icon="ri-map-2-line"
          subtitle="将领星下载的仓库名称映射到美东/美西/东南/中南，导入仓库明细时自动匹配"
        >
          <WarehouseMappingPanel />
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
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-primary-500 px-3 py-2 text-[12px] font-medium text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
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
                className="flex-1 rounded-[9px] bg-red-500 py-2 text-[13px] font-semibold text-white hover:bg-red-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
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
              <p className="mt-0.5 text-[12px] text-foreground-400">
                数据日期：<span className="font-medium text-foreground-600">{importDateLabel}</span>
              </p>
            </div>
            {/* 日期冲突警告 */}
            {dateConflict && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-secondary-300 bg-secondary-50 px-3 py-2">
                <i className="ri-error-warning-line mt-0.5 text-[14px] text-secondary-700" aria-hidden />
                <div className="flex-1 text-[12px] text-secondary-700">
                  <span className="font-semibold">警告：该日期已有 {conflictCount} 条数据。</span>
                  继续导入将合并覆盖。如要导入上周数据，请先关闭此弹窗，点击「上周」按钮选择正确日期。
                </div>
              </div>
            )}
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => handleBundle(pendingFile, "overwrite")}
                className="w-full rounded-[14px] border-2 border-primary-500 bg-primary-50 px-4 py-3.5 text-left hover:bg-primary-100 cursor-pointer transition-colors"
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
                className="w-full rounded-[14px] border-2 border-accent-500 bg-accent-50 px-4 py-3.5 text-left hover:bg-accent-100 cursor-pointer transition-colors"
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
                className="w-full rounded-[14px] border border-background-300 bg-background-50 px-4 py-2.5 text-sm text-foreground-500 hover:bg-background-100 cursor-pointer transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 数据健康报告弹窗（不可跳过，必须「确认并继续」） ── */}
      {healthReport && pendingImport && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-background-50 p-6 shadow-2xl">
            <HealthReport
              result={healthReport}
              modal
              confirming={confirming}
              onConfirm={confirmImport}
              onCancel={cancelImport}
            />
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
  children: ReactNode;
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

// ────────── 仓库映射管理面板 ──────────
function WarehouseMappingPanel() {
  const [mappings, setMappings] = useState<WarehouseMapping[]>([]);
  const [newName, setNewName] = useState("");
  const [newRegion, setNewRegion] = useState<WarehouseRegion>("east");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const all = await getAllWarehouseMappings();
    all.sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
    setMappings(all);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const regionLabel: Record<WarehouseRegion, string> = {
    east: "美东",
    west: "美西",
    southeast: "东南",
    southcentral: "中南",
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await upsertWarehouseMapping(newName.trim(), newRegion);
    setNewName("");
    reload();
  };

  const handleUpdate = async (name: string, region: WarehouseRegion) => {
    await upsertWarehouseMapping(name, region);
    reload();
  };

  const handleDelete = async (id: number) => {
    await deleteWarehouseMapping(id);
    reload();
  };

  const [reapplyMsg, setReapplyMsg] = useState<string | null>(null);
  const handleReapply = async () => {
    const count = await reapplyWarehouseMappings();
    setReapplyMsg(`已重新计算 ${count} 条库存记录的区域字段`);
    setTimeout(() => setReapplyMsg(null), 4000);
  };

  // 从已有的 warehouseBreakdown 中收集所有出现过的仓库名
  const [knownWarehouses, setKnownWarehouses] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const allInv = await db.inventoryLayer.toArray();
      const names = new Set<string>();
      allInv.forEach(inv => {
        inv.warehouseBreakdown?.forEach(wb => names.add(wb.warehouse));
      });
      setKnownWarehouses([...names].sort());
    })();
  }, []);

  if (loading) return <div className="text-[13px] text-foreground-500">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-primary-50/60 p-3 text-[12px] text-foreground-700">
        <i className="ri-information-line mr-1 text-primary-600" aria-hidden />
        导入仓库明细时，系统会自动按仓库名匹配区域并填入美东/美西/东南/中南字段。
        匹配不到的仓库名会在这里显示，你可以手动指定区域。仓库编码换了只需改这里。
        修改映射后系统会自动重算已有库存数据的区域字段，无需重新导入。
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleReapply}
          className="rounded-[9px] bg-primary-600 px-3 py-1.5 text-[12px] text-white hover:bg-primary-700 cursor-pointer transition-colors"
        >
          <i className="ri-refresh-line mr-1" aria-hidden />
          重新应用映射
        </button>
        {reapplyMsg && (
          <span className="text-[12px] text-accent-600">{reapplyMsg}</span>
        )}
      </div>

      {/* 已有映射列表 */}
      {mappings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-background-200 text-left text-[11px] text-foreground-500 uppercase tracking-wider">
                <th className="py-2 pr-3 font-medium">仓库名称</th>
                <th className="py-2 pr-3 font-medium">映射区域</th>
                <th className="py-2 pr-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} className="border-b border-background-100/60 hover:bg-background-50/50">
                  <td className="py-2 pr-3 font-mono text-[12px]">{m.warehouseName}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={m.region}
                      onChange={(e) => handleUpdate(m.warehouseName, e.target.value as WarehouseRegion)}
                      className="rounded-md border border-background-300 bg-white px-2 py-1 text-[12px] text-foreground-800 focus:border-primary-400 focus:outline-none"
                    >
                      <option value="east">美东</option>
                      <option value="west">美西</option>
                      <option value="southeast">东南</option>
                      <option value="southcentral">中南</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => handleDelete(m.id!)}
                      className="text-[11px] text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-[12px] text-foreground-400 italic">
          还没有映射记录。导入仓库明细时会自动猜测区域，猜不到的在这里手动添加。
        </div>
      )}

      {/* 未映射的仓库名提示 */}
      {knownWarehouses.length > 0 && (
        <div className="rounded-lg border border-background-200 p-3">
          <div className="mb-2 text-[12px] font-medium text-foreground-700">
            已导入数据中出现过的仓库名（{knownWarehouses.length} 个）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {knownWarehouses.map(name => {
              const mapped = mappings.find(m => m.warehouseName === name);
              return (
                <span
                  key={name}
                  className={`mono-num rounded-md px-2 py-0.5 text-[11px] ${
                    mapped ? "bg-accent-100 text-accent-700" : "bg-secondary-100 text-secondary-700"
                  }`}
                  title={mapped ? `已映射: ${regionLabel[mapped.region]}` : "未映射"}
                >
                  {name} {mapped ? `→ ${regionLabel[mapped.region]}` : "⚠️ 未映射"}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 手动添加映射 */}
      <div className="flex items-end gap-2 rounded-lg border border-background-200 p-3">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] font-medium text-foreground-600">仓库名称</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="如：乐歌(新) CAP"
            list="warehouse-suggestions"
            className="w-full rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-primary-400 focus:outline-none"
          />
          <datalist id="warehouse-suggestions">
            {knownWarehouses.map(w => <option key={w} value={w} />)}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-foreground-600">区域</label>
          <select
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value as WarehouseRegion)}
            className="rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-primary-400 focus:outline-none"
          >
            <option value="east">美东</option>
            <option value="west">美西</option>
            <option value="southeast">东南</option>
            <option value="southcentral">中南</option>
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="rounded-[9px] bg-primary-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          添加映射
        </button>
      </div>
    </div>
  );
}
