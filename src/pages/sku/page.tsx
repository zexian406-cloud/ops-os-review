import { useMemo, useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { db, getAllShops, ensureDefaultShops, getCurrentSiteId, getAllSites } from "@/domain/db";
import { computeAll, computeWarehouseTotals, isCostFullyMissing, isReturnRateMissing } from "@/domain/calculator";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { SkuMaster, DailySnapshot, Promotion, InventoryLayer, Shop, Site } from "@/domain/types";
import { SITE_CHANGE_EVENT } from "@/components/layout/SiteSwitcher";

const lifecycleLabel: Record<string, string> = {
  new: "新品",
  growth: "成长",
  mature: "成熟",
  clearance: "清货",
  eol: "停售",
};
const saleStatusLabel: Record<string, string> = {
  active: "在售",
  clearance: "清货",
  paused: "暂停",
  discontinued: "停售",
};

interface SkuGroupChild extends SkuMaster {
  /** 视图层合成的虚拟 MSKU 子项（来自父记录逗号拼接的 msku），非数据库记录 */
  isVirtualMsku?: boolean;
}

interface SkuGroup {
  parent: SkuMaster;
  children: SkuGroupChild[];
  totalChildren: number;
}

function computeMskuProfit(sku: SkuMaster, snap?: DailySnapshot, inv?: InventoryLayer) {
  const calc = computeAll({ sku, snap, inv });
  return { profit: calc.grossProfit, margin: calc.grossMargin, totalCost: calc.totalCost, adRatio: Math.abs(calc.adRatio), returnRate: calc.returnRate, refundRate: calc.refundRate };
}

function marginColorClass(margin: number): string {
  if (margin < 0) return "text-red-600";
  if (margin < 5) return "text-secondary-700";
  return "text-accent-700";
}

function adRatioColorClass(ratio: number): string {
  if (ratio > 30) return "text-red-600";
  if (ratio > 20) return "text-secondary-700";
  return "text-accent-700";
}

function returnRateColorClass(rate: number): string {
  if (rate > 8) return "text-red-600";
  if (rate > 5) return "text-secondary-700";
  return "text-accent-700";
}

/**
 * 解析子项（虚拟/真实 MSKU）展示与筛选用的店铺：
 * 优先取 MSKU 级 mskuStores（导入时按行保留的各 MSKU 店铺），
 * 缺失则回退父级 store。向后兼容：旧数据无 mskuStores 时一律用父级 store。
 */
function resolveChildStore(child: SkuGroupChild): string {
  if (child.mskuStores && child.msku && child.mskuStores[child.msku]) {
    return child.mskuStores[child.msku];
  }
  return child.store;
}

/* ────────── 新建 SKU 表单默认值 ────────── */
const emptySkuForm = (): Partial<SkuMaster> => ({
  sku: "",
  name: "",
  msku: "",
  asin: "",
  store: "",
  marketplace: "US",
  fulfillment: "FBA",
  saleStatus: "active",
  linkType: "main",
  lifecycle: "new",
  category: "",
  price: 0,
  listPrice: 0,
  coupon: 0,
  costFob: 0,
  costShipping: 0,
  costDelivery: 0,
  costCommission: 0,
  costStorage: 0,
  costReturn: 0,
  costAd: 0,
  packageLength: 0,
  packageWidth: 0,
  packageHeight: 0,
  packageWeight: 0,
  unitsPerBox: 1,
  leadTimeDays: 40,
  safetyStockDays: 30,
  aPlus: undefined,
  aPlusAdvanced: undefined,
  installVideo: undefined,
  transparentPlan: "",
  upc: "",
  parentAsin: "",
  parentSku: "",
  productUrl: "",
  launchDate: new Date().toISOString().slice(0, 10),
});

const STORAGE_MSKU_ORDER_KEY = "aos-msku-order-v1";

function loadMskuOrder(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_MSKU_ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveMskuOrder(order: Record<string, string[]>) {
  try { localStorage.setItem(STORAGE_MSKU_ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}

export default function SkuList() {
  const { loading, skuMaster, latestSnapshot, latestInventory, promotions, reload } = useOpsData();
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(() => searchParams.get("q") ?? "");
  const [store, setStore] = useState("all");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shops, setShops] = useState<Shop[]>([]);
  const [currentCurrency, setCurrentCurrency] = useState("USD");

  /* ── 新建 SKU 弹窗 ── */
  const [createOpen, setCreateOpen] = useState(false);
  const [createTab, setCreateTab] = useState<"basic" | "cost" | "listing">("basic");
  const [createForm, setCreateForm] = useState<Partial<SkuMaster>>(emptySkuForm());
  const [createSaving, setCreateSaving] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSiteId, setCurrentSiteId] = useState("site_us");
  const [copySourceSiteId, setCopySourceSiteId] = useState("");
  const [copySourceSkus, setCopySourceSkus] = useState<SkuMaster[]>([]);
  const [copySourceSkuId, setCopySourceSkuId] = useState("");
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyOpts, setCopyOpts] = useState({
    price: true,
    costFob: true,
    logistics: true,
    costOther: false,
    costAd: false,
    costReturn: false,
    costCommission: false,
    moq: false,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sid = await getCurrentSiteId();
        if (mounted) setCurrentSiteId(sid);
        const sites = await getAllSites();
        if (mounted) setSites(sites);
        const site = sites.find(s => s.id === sid);
        if (site && mounted) setCurrentCurrency(site.currency || "USD");
      } catch { /* site not available */ }
    })();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.siteId) {
        getAllSites().then(sites => {
          if (mounted) { setSites(sites); setCurrentSiteId(detail.siteId); }
          const site = sites.find(s => s.id === detail.siteId);
          if (site && mounted) setCurrentCurrency(site.currency || "USD");
        }).catch(() => {});
      }
    };
    window.addEventListener(SITE_CHANGE_EVENT, handler);
    return () => {
      mounted = false;
      window.removeEventListener(SITE_CHANGE_EVENT, handler);
    };
  }, []);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: "group" | "msku" | "batch";
    sku: string;
    name: string;
    parentSku?: string;
    count?: number;
  } | null>(null);

  /* ── 批量删除 ── */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

  /* ── 批量转移店铺 ── */
  const [batchShopModal, setBatchShopModal] = useState(false);
  const [batchShopTarget, setBatchShopTarget] = useState<string>("");
  const [batchShopSaving, setBatchShopSaving] = useState(false);

  const toggleSelect = (sku: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const selectAllInGroup = (groupSku: string, childSkus: string[]) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      for (const s of childSkus) next.add(s);
      return next;
    });
  };

  const deselectAllInGroup = (childSkus: string[]) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      for (const s of childSkus) next.delete(s);
      return next;
    });
  };

  const allSelectedInGroup = (childSkus: string[]): boolean => {
    return childSkus.length > 0 && childSkus.every((s) => selectedSkus.has(s));
  };

  const handleBatchDelete = async () => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;
    setDeleteConfirm({ open: true, type: "batch", sku: "", name: "", count: skus.length });
  };

  const executeBatchDelete = async () => {
    const skus = Array.from(selectedSkus);
    try {
      await db.skuMaster.bulkDelete(skus);
      setSelectedSkus(new Set());
      setDeleteConfirm(null);
      reload();
    } catch (err) {
      alert(`批量删除失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /* ── 批量转移 MSKU 店铺：把选中 SKU 下所有 MSKU 的店铺转移到目标 ── */
  const executeBatchShopTransfer = async () => {
    if (!batchShopTarget) return;
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;
    setBatchShopSaving(true);
    try {
      const records = await db.skuMaster.bulkGet(skus);
      let mskuCount = 0;
      const updates = records
        .filter((r): r is SkuMaster => !!r)
        .map((r) => {
          if (!r.msku) return null; // 没有 MSKU 的跳过
          const allMs = r.msku.split(/[,\s，、·]+/).map((m: string) => m.trim()).filter(Boolean);
          if (allMs.length === 0) return null;
          const newStores = { ...(r.mskuStores ?? {}) };
          for (const m of allMs) {
            newStores[m] = batchShopTarget;
          }
          mskuCount += allMs.length;
          return { ...r, mskuStores: newStores };
        })
        .filter((r): r is SkuMaster => r !== null);
      if (updates.length === 0) {
        alert("选中的 SKU 都没有 MSKU，无法转移店铺。\n\nMSKU 店铺转移仅针对有 MSKU 的 SKU，父 SKU 店铺保持不变。");
        setBatchShopSaving(false);
        return;
      }
      await db.skuMaster.bulkPut(updates);
      setSelectedSkus(new Set());
      setSelectionMode(false);
      setBatchShopModal(false);
      setBatchShopTarget("");
      reload();
    } catch (err) {
      alert(`转移失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBatchShopSaving(false);
    }
  };

  const openCreate = async () => {
    setCreateForm(emptySkuForm());
    setCreateTab("basic");
    setCreateMsg(null);
    setCopySourceSiteId("");
    setCopySourceSkus([]);
    setCopySourceSkuId("");
    setCopyOpts({ price: true, costFob: true, logistics: true, costOther: false, costAd: false, costReturn: false, costCommission: false, moq: false });
    // Auto-set marketplace based on current site currency
    try {
      const sid = await getCurrentSiteId();
      const sites = await getAllSites();
      const site = sites.find(s => s.id === sid);
      if (site) {
        setCreateForm(prev => ({ ...prev, marketplace: site.marketplace }));
      }
    } catch { /* ignore */ }
    setCreateOpen(true);
  };

  const updateCreateField = (patch: Partial<SkuMaster>) => {
    setCreateForm((prev) => ({ ...prev, ...patch }));
  };

  const loadSourceSiteSkus = async (siteId: string) => {
    setCopySourceSiteId(siteId);
    setCopySourceSkus([]);
    setCopySourceSkuId("");
    if (!siteId) return;
    setCopyLoading(true);
    try {
      // Query all SKUs and filter: include those with matching siteId OR no siteId (legacy data)
      const allSkus = await db.skuMaster.toArray();
      const skus = allSkus.filter(s => !s.siteId || s.siteId === "" || s.siteId === siteId);
      setCopySourceSkus(skus);
    } catch { /* ignore */ }
    setCopyLoading(false);
  };

  const toggleCopyOpt = (key: keyof typeof copyOpts) => {
    setCopyOpts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyFromSourceSku = () => {
    const source = copySourceSkus.find(s => s.sku === copySourceSkuId);
    if (!source) return;
    const sourceSiteName = sites.find(s => s.id === copySourceSiteId)?.name || copySourceSiteId;
    const patch: Partial<SkuMaster> = {
      // Basic info always copied
      sku: source.sku,
      name: source.name,
      msku: source.msku ?? "",
      asin: source.asin ?? "",
      upc: source.upc ?? "",
      parentAsin: source.parentAsin ?? "",
      parentSku: source.parentSku ?? "",
      productUrl: source.productUrl ?? "",
      category: source.category ?? "",
      fulfillment: source.fulfillment ?? "FBA",
      linkType: source.linkType ?? "main",
      aPlus: source.aPlus,
      aPlusAdvanced: source.aPlusAdvanced,
      installVideo: source.installVideo,
      transparentPlan: source.transparentPlan ?? "",
      packageLength: source.packageLength ?? 0,
      packageWidth: source.packageWidth ?? 0,
      packageHeight: source.packageHeight ?? 0,
      packageWeight: source.packageWeight ?? 0,
      unitsPerBox: source.unitsPerBox ?? 1,
    };
    // Helper: only copy if source has actual value
    const copyIf = (val: number | undefined | null) => val != null && !isNaN(val) ? val : undefined;
    // Selectable fields - only set if source has actual data
    if (copyOpts.price) {
      if (source.price != null) patch.price = source.price;
      if (source.listPrice != null) patch.listPrice = source.listPrice;
      if (source.coupon != null) patch.coupon = source.coupon;
    }
    if (copyOpts.costFob) {
      const v = copyIf(source.costFob);
      if (v !== undefined) patch.costFob = v;
    }
    if (copyOpts.logistics) {
      if (source.leadTimeDays != null) patch.leadTimeDays = source.leadTimeDays;
      if (source.safetyStockDays != null) patch.safetyStockDays = source.safetyStockDays;
    }
    if (copyOpts.costOther) {
      const vs = copyIf(source.costShipping); if (vs !== undefined) patch.costShipping = vs;
      const vd = copyIf(source.costDelivery); if (vd !== undefined) patch.costDelivery = vd;
      const vt = copyIf(source.costStorage); if (vt !== undefined) patch.costStorage = vt;
    }
    if (copyOpts.costAd) {
      const v = copyIf(source.costAd); if (v !== undefined) patch.costAd = v;
    }
    if (copyOpts.costReturn) {
      const v = copyIf(source.costReturn); if (v !== undefined) patch.costReturn = v;
    }
    if (copyOpts.costCommission) {
      const v = copyIf(source.costCommission); if (v !== undefined) patch.costCommission = v;
    }
    if (copyOpts.moq) {
      if (source.moq != null) patch.moq = source.moq;
    }
    setCreateForm(prev => ({ ...prev, ...patch }));
    // Build message with actual values for debugging
    const parts: string[] = ["基础信息"];
    if (copyOpts.price && source.price != null) parts.push("售价(" + source.price + ")");
    else if (copyOpts.price) parts.push("售价(无数据)");
    if (copyOpts.costFob && source.costFob != null) parts.push("FOB成本(" + source.costFob + ")");
    else if (copyOpts.costFob) parts.push("FOB成本(无数据)");
    if (copyOpts.logistics && source.leadTimeDays != null) parts.push("交货" + source.leadTimeDays + "天");
    if (copyOpts.costOther) parts.push(source.costShipping != null ? "运费(" + source.costShipping + ")" : "运费(无)");
    if (copyOpts.costAd) parts.push(source.costAd != null ? "广告(" + source.costAd + ")" : "广告(无)");
    if (copyOpts.costReturn) parts.push(source.costReturn != null ? "退货(" + source.costReturn + ")" : "退货(无)");
    if (copyOpts.costCommission) parts.push(source.costCommission != null ? "佣金(" + source.costCommission + ")" : "佣金(无)");
    if (copyOpts.moq) parts.push(source.moq != null ? "起订(" + source.moq + ")" : "起订(无)");
    setCreateMsg({ ok: true, msg: "已从" + sourceSiteName + "复制: " + parts.join("、") });
  };

  const handleCreate = async () => {
    if (!createForm.sku?.trim() || !createForm.name?.trim()) {
      setCreateMsg({ ok: false, msg: "SKU 和品名不能为空" });
      return;
    }
    if (!createForm.store?.trim()) {
      setCreateMsg({ ok: false, msg: "请填写所属店铺" });
      return;
    }
    setCreateSaving(true);
    setCreateMsg(null);
    try {
      // Read current siteId directly from DB to avoid state sync issues
      const activeSiteId = await getCurrentSiteId();
      const parentSku = createForm.sku.trim();
      const mskuVal = createForm.msku?.trim() || undefined;
      // Check for duplicates only within the same site (allow same SKU on different sites)
      const existingParent = (await db.skuMaster.toArray()).find(s => s.sku === parentSku && (s.siteId ?? "site_us") === activeSiteId);
      let finalSku = parentSku;
      let groupSku: string | undefined;

      // ── 智能 MSKU 追加：父SKU已存在 + 填了不同MSKU → 追加子记录 ──
      if (existingParent && mskuVal && mskuVal !== parentSku) {
        let candidate = mskuVal;
        const existingChild = await db.skuMaster.get(candidate);
        if (existingChild) {
          let suffix = 2;
          while (await db.skuMaster.get(`${candidate}-${suffix}`)) suffix++;
          candidate = `${candidate}-${suffix}`;
        }
        finalSku = candidate;
        groupSku = parentSku;
      } else if (existingParent && (!mskuVal || mskuVal === parentSku)) {
        setCreateMsg({ ok: false, msg: `SKU ${parentSku} 已存在。如需新增子MSKU，请在MSKU字段填写不同的值（如 ${parentSku}-1），系统会自动追加到该SKU下` });
        setCreateSaving(false);
        return;
      }

      // ── 如果新SKU已存在且没走上面的分支 → 重复SKU ──
      if (!groupSku) {
        const dup = await db.skuMaster.get(finalSku);
        if (dup) {
          setCreateMsg({ ok: false, msg: `SKU ${finalSku} 已存在。请换一个SKU编号，或填写MSKU字段追加到现有父SKU下` });
          setCreateSaving(false);
          return;
        }
      }

      const row: SkuMaster = {
        siteId: activeSiteId,
        sku: finalSku,
        name: createForm.name.trim(),
        msku: mskuVal,
        asin: createForm.asin?.trim() || undefined,
        upc: createForm.upc?.trim() || undefined,
        parentAsin: createForm.parentAsin?.trim() || undefined,
        parentSku: createForm.parentSku?.trim() || undefined,
        groupSku,
        store: createForm.store.trim(),
        marketplace: createForm.marketplace || "US",
        fulfillment: createForm.fulfillment || "FBA",
        linkType: createForm.linkType,
        saleStatus: createForm.saleStatus || "active",
        lifecycle: createForm.lifecycle,
        category: createForm.category?.trim() || undefined,
        launchDate: createForm.launchDate || undefined,
        price: createForm.price ?? 0,
        listPrice: createForm.listPrice ?? undefined,
        coupon: createForm.coupon ?? undefined,
        costFob: createForm.costFob ?? undefined,
        costShipping: createForm.costShipping ?? undefined,
        costDelivery: createForm.costDelivery ?? undefined,
        costCommission: createForm.costCommission ?? undefined,
        costStorage: createForm.costStorage ?? undefined,
        costReturn: createForm.costReturn ?? undefined,
        costAd: createForm.costAd ?? undefined,
        packageLength: createForm.packageLength ?? undefined,
        packageWidth: createForm.packageWidth ?? undefined,
        packageHeight: createForm.packageHeight ?? undefined,
        packageWeight: createForm.packageWeight ?? undefined,
        unitsPerBox: createForm.unitsPerBox ?? undefined,
        leadTimeDays: createForm.leadTimeDays ?? 40,
        safetyStockDays: createForm.safetyStockDays ?? 30,
        aPlus: createForm.aPlus,
        aPlusAdvanced: createForm.aPlusAdvanced,
        installVideo: createForm.installVideo,
        transparentPlan: createForm.transparentPlan?.trim() || undefined,
        productUrl: createForm.productUrl?.trim() || undefined,
      };
      await db.skuMaster.put(row);
      const msgText = groupSku
        ? `已追加 MSKU ${finalSku} 到 ${parentSku} 下`
        : `已创建 ${finalSku}`;
      setCreateMsg({ ok: true, msg: msgText });
      setTimeout(() => {
        setCreateOpen(false);
        reload();
      }, 800);
    } catch (err) {
      setCreateMsg({ ok: false, msg: `创建失败: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setCreateSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === "group") {
        // 删除父 SKU 及所有子 SKU
        const children = skuMaster.filter((s) => s.groupSku === deleteConfirm.sku).map((s) => s.sku);
        await db.skuMaster.bulkDelete([deleteConfirm.sku, ...children]);
      } else if (deleteConfirm.type === "batch") {
        await executeBatchDelete();
        return;
      } else {
        await db.skuMaster.delete(deleteConfirm.sku);
      }
      setDeleteConfirm(null);
      reload();
    } catch (err) {
      alert(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /* ── 构建分组 ── */
  const groups = useMemo((): SkuGroup[] => {
    const groupSkus = new Set<string>();
    skuMaster.forEach((s) => {
      const gs = s.groupSku || "";
      if (gs) groupSkus.add(gs);
      else groupSkus.add(s.sku);
    });

    return Array.from(groupSkus)
      .map((groupSku) => {
        const parent = skuMaster.find((s) => s.sku === groupSku);
        if (!parent) return null;
        const children = skuMaster.filter((s) => {
          const gs = s.groupSku || "";
          if (gs) return gs === groupSku;
          return s.sku === groupSku;
        });
        // 真实子记录（排除父记录自身）
        const realChildren = children.filter((c) => c.sku !== parent.sku);
        // 无真实子记录、且父记录 msku 为逗号拼接多值时，
        // 在「视图层」合成虚拟 MSKU 子项（不写数据库；库存/销量仍以家族 sku 为主键关联）。
        if (realChildren.length === 0) {
          const seen = new Set<string>();
          const tokens = (parent.msku ?? "")
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean)
            .filter((m) => (seen.has(m) ? false : (seen.add(m), true)));
          if (tokens.length >= 2) {
            const virtualChildren: SkuGroupChild[] = tokens.map((m) => ({
              ...parent,
              sku: m,
              msku: m,
              groupSku: parent.sku,
              isVirtualMsku: true,
            }));
            return { parent, children: virtualChildren, totalChildren: virtualChildren.length };
          }
        }
        return { parent, children, totalChildren: children.length };
      })
      .filter((g): g is SkuGroup => g !== null);
  }, [skuMaster]);

  /* ── 默认展开 ── */
  useEffect(() => {
    const defaults = new Set<string>();
    groups.forEach((g) => {
      if (g.totalChildren === 1) defaults.add(g.parent.sku);
    });
    setExpanded(defaults);
  }, [groups]);

  /* ── 筛选 ── */
  const shopMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shops) {
      map.set(s.name, s.id);
      map.set(s.id, s.id); // Also Map by ID
    }
    return map;
  }, [shops]);

  const [mskuOrder, setMskuOrder] = useState<Record<string, string[]>>(loadMskuOrder);
  const [parentOrder, setParentOrder] = useState<string[]>(loadParentOrder);
  const [dragOverSku, setDragOverSku] = useState<string | null>(null);
  const dragSkuRef = useRef<string | null>(null);

  const handleDragStart = useCallback((sku: string) => {
    dragSkuRef.current = sku;
  }, []);

  const handleDragOver = useCallback((e: DragEvent, sku: string) => {
    e.preventDefault();
    setDragOverSku(sku);
  }, []);

  const filteredGroups = useMemo((): SkuGroup[] => {
    const storeId = shopMap.get(store) ?? store;
    return groups
      .map((group) => {
        const filteredChildren = group.children.filter((child) => {
          if (store !== "all" && resolveChildStore(child) !== storeId) return false;
          if (status !== "all" && child.saleStatus !== status) return false;
          if (keyword.trim()) {
            const kw = keyword.trim().toLowerCase();
            const childHit =
              child.sku.toLowerCase().includes(kw) ||
              child.name.toLowerCase().includes(kw) ||
              (child.msku ?? "").toLowerCase().includes(kw) ||
              (child.asin ?? "").toLowerCase().includes(kw);
            if (childHit) return true;
            // 家族 SKU / 品名命中 → 整组保留（虚拟 MSKU 项也随之可检索）
            const p = group.parent;
            return (
              p.sku.toLowerCase().includes(kw) || p.name.toLowerCase().includes(kw)
            );
          }
          return true;
        });
        if (filteredChildren.length === 0) return null;
        return { ...group, children: filteredChildren };
      })
      .filter((g): g is SkuGroup => g !== null)
      // 按自定义顺序排序
      .sort((a, b) => {
        const ai = parentOrder.indexOf(a.parent.sku);
        const bi = parentOrder.indexOf(b.parent.sku);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return 0;
      });
  }, [groups, store, status, keyword, parentOrder, shopMap]);

  const stores = useMemo(() => {
    // Build a map of shopId -> shopName
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    // Collect unique store values from skuMaster data
    const rawStores = new Set<string>();
    skuMaster.forEach((s) => {
      if (s.store) rawStores.add(s.store);
      // 纳入各 MSKU 独立店铺，使其可在筛选下拉中出现
      if (s.mskuStores) {
        for (const st of Object.values(s.mskuStores)) {
          if (st && st !== "-") rawStores.add(st);
        }
      }
    });
    // For each raw store value, try to find the shop name, otherwise use the raw value
    const result = new Set<string>();
    for (const raw of rawStores) {
      const name = shopMap.get(raw);
      result.add(name ?? raw);
    }
    return Array.from(result).sort();
  }, [shops, skuMaster]);

  // Load shops on mount — ensure default shops exist first
  useEffect(() => {
    ensureDefaultShops().then(() => getAllShops().then(setShops));
  }, []);

  const shopNameMap = useMemo(() => {
    const map = new Map<string, string>();
    shops.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [shops]);

  const getShopName = (storeId: string): string => {
    return shopNameMap.get(storeId) ?? storeId;
  };

  const totalMskus = useMemo(
    () => filteredGroups.reduce((sum, g) => sum + g.children.length, 0),
    [filteredGroups]
  );

  // 可单独勾选/删除的真实子记录数（虚拟 MSKU 项不可单独删除，不计入）
  const totalSelectable = useMemo(
    () =>
      filteredGroups.reduce(
        (sum, g) => sum + g.children.filter((c) => !c.isVirtualMsku).length,
        0,
      ),
    [filteredGroups]
  );

  const handleDrop = useCallback(() => {
    const from = dragSkuRef.current;
    const to = dragOverSku;
    if (!from || !to || from === to) {
      setDragOverSku(null);
      return;
    }
    setParentOrder((prev) => {
      let order = prev.length > 0 ? [...prev] : filteredGroups.map((g) => g.parent.sku);
      const fromIdx = order.indexOf(from);
      const toIdx = order.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [removed] = order.splice(fromIdx, 1);
      order.splice(toIdx, 0, removed);
      saveParentOrder(order);
      return order;
    });
    setDragOverSku(null);
    dragSkuRef.current = null;
  }, [dragOverSku, filteredGroups]);

  const handleDragEnd = useCallback(() => {
    dragSkuRef.current = null;
    setDragOverSku(null);
  }, []);

  const toggleExpand = (sku: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const moveChild = useCallback((groupSku: string, childSku: string, direction: "up" | "down") => {
    setMskuOrder((prev) => {
      const currentOrder = prev[groupSku] || [];
      const idx = currentOrder.indexOf(childSku);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? Math.max(0, idx - 1) : Math.min(currentOrder.length - 1, idx + 1);
      if (newIdx === idx) return prev;
      const newOrder = [...currentOrder];
      const [removed] = newOrder.splice(idx, 1);
      newOrder.splice(newIdx, 0, removed);
      const next = { ...prev, [groupSku]: newOrder };
      saveMskuOrder(next);
      return next;
    });
  }, []);

  const moveGroup = useCallback((groupSku: string, direction: "up" | "down") => {
    setParentOrder((prev) => {
      let order = prev.length > 0 ? [...prev] : filteredGroups.map((g) => g.parent.sku);
      const idx = order.indexOf(groupSku);
      if (idx === -1) {
        // 不在列表中，追加并移动
        order = [...order, groupSku];
        const newIdx = direction === "up" ? Math.max(0, order.length - 2) : order.length - 1;
        const [removed] = order.splice(order.length - 1, 1);
        order.splice(newIdx, 0, removed);
      } else {
        const newIdx = direction === "up" ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
        if (newIdx === idx) return prev;
        const [removed] = order.splice(idx, 1);
        order.splice(newIdx, 0, removed);
      }
      saveParentOrder(order);
      return order;
    });
  }, [filteredGroups]);

  const [showFobDiag, setShowFobDiag] = useState(false);
  const [fobDiag, setFobDiag] = useState<string>("");
  const [fobInRmb, setFobInRmb] = useState(false);
  const [fobRmb, setFobRmb] = useState<string>("");
  const currentSite = sites.find(s => s.id === currentSiteId);

  if (loading)
    return <div className="text-sm text-foreground-500">加载中...</div>;

  const inputCls =
    "w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50";
  const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500";

  const cnyRate = currentSite?.cnyToUsdRate ?? 7.25;
  const siteRate = currentSite?.exchangeRateToUsd ?? 1.0;

  const convertFobRmb = (rmb: number) => {
    const usd = rmb / cnyRate;
    const siteCurrency = usd / siteRate;
    return Math.round(siteCurrency * 100) / 100;
  };

  const handleFobRmbChange = (val: string) => {
    setFobRmb(val);
    const rmb = parseFloat(val);
    if (!isNaN(rmb) && rmb > 0) {
      const converted = convertFobRmb(rmb);
      updateCreateField({ costFob: converted });
    }
  };

  const checkFobStatus = async () => {
    setShowFobDiag(true);
    setFobDiag("Loading...");
    try {
      const all = await db.skuMaster.toArray();
      const withFob = all.filter(s => s.costFob != null);
      const withoutFob = all.filter(s => s.costFob == null);
      const msg = [
        "Total SKUs: " + all.length,
        "With costFob: " + withFob.length,
        "Without costFob: " + withoutFob.length,
        "",
        "All SKUs:",
        ...all.map(s => "  " + s.sku + " => costFob=" + (s.costFob ?? "undefined") + ", siteId=" + (s.siteId ?? "none")),
      ].join("\n");
      setFobDiag(msg);
    } catch (e) {
      setFobDiag("Error: " + String(e));
    }
  };

  return (
    <div className="space-y-6">
      {showFobDiag && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowFobDiag(false)}>
          <div className="max-w-2xl w-full mx-4 rounded-xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">FOB Cost Diagnostic</h3>
              <button onClick={() => setShowFobDiag(false)} className="text-foreground-400 hover:text-foreground-700"><i className="ri-close-line text-xl" /></button>
            </div>
            <pre className="text-xs bg-background-50 rounded-lg p-4 overflow-auto max-h-[70vh] whitespace-pre-wrap font-mono">{fobDiag}</pre>
          </div>
        </div>
      )}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          SKU Catalog
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-heading text-[26px] font-bold text-foreground-950">
              SKU 详情
            </h1>
            <p className="text-[13px] text-foreground-500">
              点击展开查看各 MSKU 数据，点击 MSKU 名称进入详情页
            </p>
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={checkFobStatus}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-background-200 bg-white px-3 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50"
          >
            <i className="ri-stethoscope-line" aria-hidden />
            诊断FOB
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-primary-500 px-4 py-2.5 text-sm font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap transition-colors shadow-sm"
          >
            <i className="ri-add-line" aria-hidden />
            新建 SKU
          </button>
          </div>
        </div>
      </div>

      <Section
        title="SKU 列表"
        subtitle={
          <span className="flex items-center gap-3">
            <span>共 {filteredGroups.length} 个产品组，{totalMskus} 个 MSKU</span>
            {!selectionMode ? (
              <button
                type="button"
                onClick={() => {
                  setSelectionMode(true);
                  const all = new Set<string>();
                  filteredGroups.forEach((g) =>
                    g.children.forEach((c) => {
                      if (!c.isVirtualMsku) all.add(c.sku);
                    }),
                  );
                  setSelectedSkus(all);
                  setExpanded(new Set(filteredGroups.map((g) => g.parent.sku)));
                }}
                className="text-[12px] text-foreground-500 hover:text-foreground-700 cursor-pointer"
              >
                全选
              </button>
            ) : (
              <label className="flex items-center gap-1.5 text-[12px] text-foreground-500 cursor-pointer select-none hover:text-foreground-700">
                <input
                  type="checkbox"
                  checked={selectedSkus.size > 0 && selectedSkus.size === totalSelectable}
                  onChange={() => {
                    if (selectedSkus.size === totalSelectable) {
                      setSelectedSkus(new Set());
                    } else {
                      const all = new Set<string>();
                      filteredGroups.forEach((g) =>
                        g.children.forEach((c) => {
                          if (!c.isVirtualMsku) all.add(c.sku);
                        }),
                      );
                      setSelectedSkus(all);
                    }
                  }}
                  className="h-3.5 w-3.5 rounded border-background-300 cursor-pointer accent-primary-500"
                />
                全选
              </label>
            )}
            {selectedSkus.size > 0 && (
              <span className="text-[12px] font-medium text-red-600">
                已选 {selectedSkus.size} 个
              </span>
            )}
          </span>
        }
        icon="ri-price-tag-3-line"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <i
                className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-foreground-500"
                aria-hidden
              />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索 SKU / 品名 / ASIN"
                className="w-52 rounded-md border border-background-300/70 bg-background-50 py-1.5 pl-7 pr-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-sm text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="all">全部店铺</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-sm text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="all">全部状态</option>
              <option value="active">在售</option>
              <option value="clearance">清货</option>
              <option value="paused">暂停</option>
              <option value="discontinued">停售</option>
            </select>
            {selectedSkus.size > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-1.5 border border-primary-200">
                <span className="text-[12px] font-medium text-primary-700">
                  已选 {selectedSkus.size} 个
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBatchShopTarget(shops.length > 0 ? shops[0].id : "");
                    setBatchShopModal(true);
                  }}
                  className="rounded-[9px] bg-primary-500 px-3 py-1 text-[12px] font-semibold text-white hover:bg-primary-600 cursor-pointer transition-colors"
                >
                  MSKU转移店铺
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="rounded-[9px] bg-red-500 px-3 py-1 text-[12px] font-semibold text-white hover:bg-red-600 cursor-pointer transition-colors"
                >
                  批量删除
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedSkus(new Set()); setSelectionMode(false); }}
                  className="text-[12px] text-primary-500 hover:text-primary-700 cursor-pointer"
                >
                  取消选择
                </button>
              </div>
            )}
          </div>
        }
      >
        {filteredGroups.length === 0 ? (
          <EmptyState
            icon="ri-search-line"
            title="未找到匹配的 SKU"
            desc="请调整筛选条件或搜索关键词"
          />
        ) : (
          <div className="space-y-2">
            {filteredGroups.map((group) => (
              <SkuGroupCard
                key={group.parent.sku}
                group={group}
                selectionMode={selectionMode}
                expanded={expanded.has(group.parent.sku)}
                onToggle={() => toggleExpand(group.parent.sku)}
                latestSnapshot={latestSnapshot}
                latestInventory={latestInventory}
                promotions={promotions}
                onDeleteGroup={(sku, name) => setDeleteConfirm({ open: true, type: "group", sku, name })}
                onDeleteMsku={(sku, name, parentSku) => setDeleteConfirm({ open: true, type: "msku", sku, name, parentSku })}
                onMoveGroupUp={(sku) => moveGroup(sku, "up")}
                onMoveGroupDown={(sku) => moveGroup(sku, "down")}
                mskuOrder={mskuOrder[group.parent.sku] || []}
                onMoveChild={moveChild}
                getShopName={getShopName}
                selectedSkus={selectedSkus}
                onToggleSelect={toggleSelect}
                onSelectAll={() => selectAllInGroup(group.parent.sku, group.children.filter((c) => !c.isVirtualMsku).map((c) => c.sku))}
                onDeselectAll={() => deselectAllInGroup(group.children.filter((c) => !c.isVirtualMsku).map((c) => c.sku))}
                allSelected={allSelectedInGroup(group.children.filter((c) => !c.isVirtualMsku).map((c) => c.sku))}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ═══════ 新建 SKU 弹窗 ═══════ */}
      {createOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-background-50 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-foreground-950">新建 SKU</h2>
                <p className="text-[12px] text-foreground-500">手动填写产品信息，也可以后续用 Excel 模板批量导入</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-background-100 text-foreground-500 cursor-pointer"
              >
                <i className="ri-close-line text-lg" aria-hidden />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex mb-5 rounded-lg border border-background-200/70 bg-background-100/50 p-1">
              {([
                { key: "basic" as const, label: "基本信息", icon: "ri-information-line" },
                { key: "cost" as const, label: "成本与物流", icon: "ri-money-cny-circle-line" },
                { key: "listing" as const, label: "Listing 优化", icon: "ri-image-edit-line" },
              ]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setCreateTab(t.key)}
                  className={[
                    "flex-1 rounded-md py-2 text-[12px] font-semibold cursor-pointer transition-colors",
                    createTab === t.key
                      ? "bg-primary-500 text-background-50"
                      : "text-foreground-500 hover:text-foreground-800",
                  ].join(" ")}
                >
                  <i className={`${t.icon} mr-1`} aria-hidden />{t.label}
                </button>
              ))}
            </div>

            {/* Tab: 基本信息 */}
            {createTab === "basic" && (
              <div className="space-y-4">
                {/* 从其他站点复制 */}
                <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <i className="ri-file-copy-line text-primary-600 text-sm" />
                    <span className="text-[11px] font-semibold text-primary-700">从其他站点复制</span>
                    <span className="text-[10px] text-foreground-400">（勾选要复制的数据）</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                    {[
                      { key: "price", label: "售价/标价/优惠券" },
                      { key: "costFob", label: "FOB成本" },
                      { key: "logistics", label: "交货/安全库存" },
                      { key: "costOther", label: "运费/配送/仓储" },
                      { key: "costAd", label: "广告费" },
                      { key: "costReturn", label: "退货费" },
                      { key: "costCommission", label: "佣金" },
                      { key: "moq", label: "起订量" },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                        <input type="checkbox" checked={copyOpts[opt.key as keyof typeof copyOpts]} onChange={() => toggleCopyOpt(opt.key as keyof typeof copyOpts)} className="w-3 h-3 accent-primary-500" />
                        <span className="text-foreground-600">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className={labelCls}>源站点</label>
                      <select className={inputCls + " cursor-pointer"} value={copySourceSiteId} onChange={(e) => loadSourceSiteSkus(e.target.value)}>
                        <option value="">选择站点</option>
                        {sites.filter(s => s.id !== currentSiteId).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>源 SKU</label>
                      <select className={inputCls + " cursor-pointer"} value={copySourceSkuId} onChange={(e) => setCopySourceSkuId(e.target.value)} disabled={!copySourceSiteId || copyLoading}>
                        <option value="">{copyLoading ? "加载中..." : "选择 SKU"}</option>
                        {copySourceSkus.map(s => (
                          <option key={s.sku} value={s.sku}>{s.sku} - {s.name}</option>
                        ))}
                      </select>
                    </div>
                    <button type="button" onClick={copyFromSourceSku} disabled={!copySourceSkuId}
                      className="rounded-md bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                      <i className="ri-file-copy-line mr-1" />复制基础信息
                    </button>
                  </div>
                  {copySourceSkuId && copySourceSkus.find(s => s.sku === copySourceSkuId) && (
                    <div className="mt-2 rounded border border-background-200 bg-background-50 p-2 text-[10px] text-foreground-500">
                      <span className="font-semibold">源数据预览: </span>
                      {(() => {
                        const s = copySourceSkus.find(s => s.sku === copySourceSkuId)!;
                        const fields = [
                          ["售价", s.price],
                          ["FOB成本", s.costFob],
                          ["运费", s.costShipping],
                          ["配送费", s.costDelivery],
                          ["佣金", s.costCommission],
                          ["仓储费", s.costStorage],
                          ["退货费", s.costReturn],
                          ["广告费", s.costAd],
                          ["交货天数", s.leadTimeDays],
                          ["安全库存", s.safetyStockDays],
                        ];
                        return fields.map(([label, val]) => (
                          <span key={label as string} className="ml-2">
                            {label as string}: <span className={val != null ? "text-foreground-700 font-medium" : "text-foreground-300"}>
                              {val != null ? String(val) : "无"}
                            </span>
                          </span>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>SKU *</label>
                    <input className={inputCls} value={createForm.sku ?? ""} onChange={(e) => updateCreateField({ sku: e.target.value })} placeholder="例如：BFRS258" />
                  </div>
                  <div>
                    <label className={labelCls}>品名 *</label>
                    <input className={inputCls} value={createForm.name ?? ""} onChange={(e) => updateCreateField({ name: e.target.value })} placeholder="例如：钢化玻璃灶" />
                  </div>
                  <div>
                    <label className={labelCls}>MSKU</label>
                    <input className={inputCls} value={createForm.msku ?? ""} onChange={(e) => updateCreateField({ msku: e.target.value })} placeholder="默认同 SKU" />
                  </div>
                  <div>
                    <label className={labelCls}>ASIN</label>
                    <input className={inputCls} value={createForm.asin ?? ""} onChange={(e) => updateCreateField({ asin: e.target.value })} placeholder="B0XXXXXXXX" />
                  </div>
                  <div>
                    <label className={labelCls}>UPC</label>
                    <input className={inputCls} value={createForm.upc ?? ""} onChange={(e) => updateCreateField({ upc: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>所属店铺 *</label>
                    <select className={inputCls + " cursor-pointer"} value={createForm.store ?? ""} onChange={(e) => updateCreateField({ store: e.target.value })}>
                      <option value="">请选择店铺</option>
                      {shops.length === 0 && <option value="__manual__">（暂无店铺数据，手动输入）</option>}
                      {shops.map(shop => (
                        <option key={shop.id} value={shop.name}>{shop.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>站点</label>
                    <select className={inputCls + " cursor-pointer"} value={createForm.marketplace ?? "US"} onChange={(e) => updateCreateField({ marketplace: e.target.value })}>
                      <option value="US">美国 US</option><option value="UK">英国 UK</option><option value="DE">德国 DE</option><option value="JP">日本 JP</option><option value="CA">加拿大 CA</option><option value="AU">澳大利亚 AU</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>品类</label>
                    <input className={inputCls} value={createForm.category ?? ""} onChange={(e) => updateCreateField({ category: e.target.value })} placeholder="例如：炉头配件" />
                  </div>
                  <div>
                    <label className={labelCls}>配送方式</label>
                    <div className="flex rounded-md border border-background-200 bg-background-50 p-1">
                      {(["FBA", "FBM", "mixed"] as const).map((m) => (
                        <button key={m} type="button" onClick={() => updateCreateField({ fulfillment: m })}
                          className={["flex-1 rounded py-1 text-xs font-semibold cursor-pointer", createForm.fulfillment === m ? "bg-primary-500 text-background-50" : "text-foreground-500"].join(" ")}>
                          {m === "mixed" ? "混卖" : m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>链接类型</label>
                    <select className={inputCls + " cursor-pointer"} value={createForm.linkType ?? "main"} onChange={(e) => updateCreateField({ linkType: e.target.value as SkuMaster["linkType"] })}>
                      <option value="main">主链接</option><option value="follow">跟卖</option><option value="backup">备用</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>在售状态</label>
                    <select className={inputCls + " cursor-pointer"} value={createForm.saleStatus ?? "active"} onChange={(e) => updateCreateField({ saleStatus: e.target.value as SkuMaster["saleStatus"] })}>
                      <option value="active">在售</option><option value="clearance">清货</option><option value="paused">暂停</option><option value="discontinued">停售</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>生命周期</label>
                    <select className={inputCls + " cursor-pointer"} value={createForm.lifecycle ?? "new"} onChange={(e) => updateCreateField({ lifecycle: e.target.value as SkuMaster["lifecycle"] })}>
                      <option value="new">新品</option><option value="growth">成长</option><option value="mature">成熟</option><option value="clearance">清货</option><option value="eol">停售</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>上架日期</label>
                    <input type="date" className={inputCls} value={createForm.launchDate ?? ""} onChange={(e) => updateCreateField({ launchDate: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>售价 ({currentCurrency})</label>
                    <input type="number" step="0.01" className={inputCls} value={createForm.price ?? ""} onChange={(e) => updateCreateField({ price: Number(e.target.value) })} placeholder="0.00" />
                  </div>
                  <div>
                    <label className={labelCls}>List Price</label>
                    <input type="number" step="0.01" className={inputCls} value={createForm.listPrice ?? ""} onChange={(e) => updateCreateField({ listPrice: Number(e.target.value) })} placeholder="0.00" />
                  </div>
                  <div>
                    <label className={labelCls}>优惠券</label>
                    <input type="number" step="0.01" className={inputCls} value={createForm.coupon ?? ""} onChange={(e) => updateCreateField({ coupon: Number(e.target.value) })} placeholder="0.00" />
                  </div>
                  <div>
                    <label className={labelCls}>父体 ASIN</label>
                    <input className={inputCls} value={createForm.parentAsin ?? ""} onChange={(e) => updateCreateField({ parentAsin: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>父体 SKU</label>
                    <input className={inputCls} value={createForm.parentSku ?? ""} onChange={(e) => updateCreateField({ parentSku: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>产品链接</label>
                    <input className={inputCls} value={createForm.productUrl ?? ""} onChange={(e) => updateCreateField({ productUrl: e.target.value })} placeholder="https://amazon.com/..." />
                  </div>
                </div>
              </div>
            )}

            {/* Tab: 成本与物流 */}
            {createTab === "cost" && (
              <div className="space-y-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">成本构成</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="mb-3 flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm text-foreground-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fobInRmb}
                        onChange={(e) => {
                          setFobInRmb(e.target.checked);
                          if (!e.target.checked) { setFobRmb(""); }
                        }}
                        className="w-3.5 h-3.5 accent-primary-500"
                      />
                      <span className="font-medium">FOB以人民币输入</span>
                    </label>
                    {fobInRmb && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={fobRmb}
                          onChange={(e) => handleFobRmbChange(e.target.value)}
                          placeholder="人民币金额"
                          className="w-32 rounded-md border border-background-300 bg-white px-2 py-1 text-sm text-foreground-700 focus:border-primary-400 focus:outline-none"
                        />
                        <span className="text-xs text-foreground-500">RMB</span>
                        {fobRmb && !isNaN(parseFloat(fobRmb)) && (
                          <span className="text-xs text-primary-600 font-medium">
                            = {convertFobRmb(parseFloat(fobRmb))} {currentCurrency}
                          </span>
                        )}
                        <span className="text-[10px] text-foreground-400">
                          (汇率: 1USD = {cnyRate}RMB)
                        </span>
                      </div>
                    )}
                  </div>
                  {[
                    { k: "costFob", l: "FOB 成本 (" + currentCurrency + ")" },
                    { k: "costShipping", l: "头程运费 (" + currentCurrency + ")" },
                    { k: "costDelivery", l: "尾程/配送费 (" + currentCurrency + ")" },
                    { k: "costCommission", l: "佣金 (" + currentCurrency + ")" },
                    { k: "costStorage", l: "仓储费 (" + currentCurrency + ")" },
                    { k: "costReturn", l: "退货费 (" + currentCurrency + ")" },
                    { k: "costAd", l: "广告费 (" + currentCurrency + ")" },
                  ].map(({ k, l }) => (
                    <div key={k}>
                      <label className={labelCls}>{l}</label>
                      <input type="number" step="0.01" className={inputCls} value={(createForm as any)[k] ?? ""} onChange={(e) => updateCreateField({ [k]: Number(e.target.value) } as any)} placeholder="0.00" />
                    </div>
                  ))}
                </div>

                <div className="border-t border-background-200/70 pt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">包裹参数</div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {[
                      { k: "packageLength", l: "长 (cm)" },
                      { k: "packageWidth", l: "宽 (cm)" },
                      { k: "packageHeight", l: "高 (cm)" },
                    ].map(({ k, l }) => (
                      <div key={k}>
                        <label className={labelCls}>{l}</label>
                        <input type="number" step="0.1" className={inputCls} value={(createForm as any)[k] ?? ""} onChange={(e) => updateCreateField({ [k]: Number(e.target.value) } as any)} placeholder="0" />
                      </div>
                    ))}
                    <div>
                      <label className={labelCls}>重量 (kg)</label>
                      <input type="number" step="0.01" className={inputCls} value={createForm.packageWeight ?? ""} onChange={(e) => updateCreateField({ packageWeight: Number(e.target.value) })} placeholder="0" />
                    </div>
                    <div>
                      <label className={labelCls}>单箱数</label>
                      <input type="number" step="1" className={inputCls} value={createForm.unitsPerBox ?? ""} onChange={(e) => updateCreateField({ unitsPerBox: Number(e.target.value) })} placeholder="1" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-background-200/70 pt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">库存参数</div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className={labelCls}>Lead Time (天)</label>
                      <input type="number" step="1" className={inputCls} value={createForm.leadTimeDays ?? 40} onChange={(e) => updateCreateField({ leadTimeDays: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className={labelCls}>安全库存 (天)</label>
                      <input type="number" step="1" className={inputCls} value={createForm.safetyStockDays ?? 30} onChange={(e) => updateCreateField({ safetyStockDays: Number(e.target.value) })} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Listing 优化 */}
            {createTab === "listing" && (
              <div className="space-y-4">
                {([
                  { k: "aPlus", l: "A+ 页面" },
                  { k: "aPlusAdvanced", l: "高级 A+" },
                  { k: "installVideo", l: "安装视频" },
                ] as const).map(({ k, l }) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border border-background-200/70 bg-background-50 px-4 py-3">
                    <span className="text-[13px] font-medium text-foreground-800">{l}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateCreateField({ [k]: "done" } as any)}
                        className={["rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors", (createForm as any)[k] === "done" ? "bg-accent-500 text-background-50" : "bg-background-100 text-foreground-500"].join(" ")}
                      >
                        <i className="ri-check-line mr-1" aria-hidden />已完成
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCreateField({ [k]: "todo" } as any)}
                        className={["rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors", (createForm as any)[k] === "todo" ? "bg-secondary-100 text-secondary-800" : "bg-background-100 text-foreground-500"].join(" ")}
                      >
                        <i className="ri-time-line mr-1" aria-hidden />未完成
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCreateField({ [k]: undefined } as any)}
                        className={["rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors", (createForm as any)[k] == null ? "bg-background-200 text-foreground-700" : "bg-background-100 text-foreground-500"].join(" ")}
                      >
                        不设
                      </button>
                    </div>
                  </div>
                ))}
                <div>
                  <label className={labelCls}>透明计划</label>
                  <select className={inputCls + " cursor-pointer"} value={createForm.transparentPlan ?? ""} onChange={(e) => updateCreateField({ transparentPlan: e.target.value || undefined })}>
                    <option value="">未设置</option>
                    <option value="已加入">已加入</option>
                    <option value="未加入">未加入</option>
                    <option value="申请中">申请中</option>
                  </select>
                </div>
              </div>
            )}

            {/* 底部按钮 */}
            <div className="mt-6 flex items-center justify-between border-t border-background-200/70 pt-4">
              <div className="flex items-center gap-2">
                {createMsg && (
                  <span className={`text-[13px] font-medium ${createMsg.ok ? "text-accent-700" : "text-red-600"}`}>
                    <i className={createMsg.ok ? "ri-check-line" : "ri-close-line"} aria-hidden /> {createMsg.msg}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-background-200 px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-100 cursor-pointer">
                  取消
                </button>
                <button type="button" onClick={handleCreate} disabled={createSaving}
                  className="rounded-[9px] bg-primary-500 px-5 py-2 text-sm font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap transition-colors shadow-sm">
                  <i className={createSaving ? "ri-loader-4-line animate-spin" : "ri-add-circle-line"} aria-hidden />
                  {createSaving ? "创建中..." : "创建 SKU"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 删除确认对话框 ═══════ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-background-50 p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mx-auto">
              <i className="ri-delete-bin-line text-[22px] text-red-500" aria-hidden />
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-[16px] font-bold text-foreground-950">
                {deleteConfirm.type === "group" ? "删除整个产品组" : deleteConfirm.type === "batch" ? "批量删除 MSKU" : "删除 MSKU"}
              </h3>
              <p className="mt-2 text-[13px] text-foreground-600">
                {deleteConfirm.type === "batch" ? (
                  <>确定要批量删除选中的 <strong className="text-foreground-950">{deleteConfirm.count}</strong> 个 MSKU 吗？</>
                ) : (
                  <>确定要删除 <strong className="text-foreground-950">{deleteConfirm.name}</strong> 吗？</>
                )}
                {deleteConfirm.type === "group" && (
                  <span className="block mt-1 text-[12px] text-red-600">这将同时删除该产品组下的所有 MSKU 及关联数据。</span>
                )}
                <span className="block mt-1 text-[12px] text-foreground-500">此操作不可恢复。</span>
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg border border-background-200 py-2 text-[13px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="flex-1 rounded-[9px] bg-red-500 py-2 text-[13px] font-semibold text-white hover:bg-red-600 cursor-pointer whitespace-nowrap"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 批量转移店铺对话框 ═══════ */}
      {batchShopModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !batchShopSaving && setBatchShopModal(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-background-50 p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 mx-auto">
              <i className="ri-store-2-line text-[24px] text-primary-600" aria-hidden />
            </div>
            <h3 className="mt-3 text-center text-[15px] font-bold text-foreground-950">MSKU 转移店铺</h3>
            <p className="mt-1 text-center text-[13px] text-foreground-500">
              将选中的 <strong className="text-foreground-800">{selectedSkus.size}</strong> 个 SKU 下所有 MSKU 转移到：
            </p>
            <p className="mt-0.5 text-center text-[11px] text-foreground-400">
              父 SKU 店铺不受影响，仅修改 MSKU 店铺
            </p>
            <select
              value={batchShopTarget}
              onChange={(e) => setBatchShopTarget(e.target.value)}
              className="mt-4 w-full rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-800 focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>请选择目标店铺…</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </select>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setBatchShopModal(false)}
                disabled={batchShopSaving}
                className="flex-1 rounded-lg border border-background-200 py-2 text-[13px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={executeBatchShopTransfer}
                disabled={batchShopSaving || !batchShopTarget}
                className="flex-1 rounded-[9px] bg-primary-500 py-2 text-[13px] font-semibold text-white hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {batchShopSaving ? "转移中..." : "确认转移"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────── SkuGroupCard ────────── */

function SkuGroupCard({
  group,
  selectionMode,
  expanded,
  onToggle,
  latestSnapshot,
  latestInventory,
  promotions,
  onDeleteGroup,
  onDeleteMsku,
  onMoveGroupUp,
  onMoveGroupDown,
  mskuOrder,
  onMoveChild,
  getShopName,
  selectedSkus,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  allSelected,
}: {
  group: SkuGroup;
  selectionMode: boolean;
  expanded: boolean;
  onToggle: () => void;
  latestSnapshot: Map<string, DailySnapshot>;
  latestInventory: Map<string, InventoryLayer>;
  promotions: Promotion[];
  onDeleteGroup?: (sku: string, name: string) => void;
  onDeleteMsku?: (sku: string, name: string, parentSku?: string) => void;
  onMoveGroupUp?: (sku: string) => void;
  onMoveGroupDown?: (sku: string) => void;
  mskuOrder?: string[];
  onMoveChild?: (groupSku: string, childSku: string, direction: "up" | "down") => void;
  getShopName: (storeId: string) => string;
  selectedSkus: Set<string>;
  onToggleSelect: (sku: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  allSelected: boolean;
}) {
  const { parent, children: rawChildren, totalChildren } = group;

  const isMultiChild = totalChildren > 1;

  // Sort children by custom order, falling back to original order
  const children = useMemo(() => {
    if (!mskuOrder || mskuOrder.length === 0) return rawChildren;
    const orderMap = new Map(mskuOrder.map((sku, i) => [sku, i]));
    const sorted = [...rawChildren].sort((a, b) => {
      const ai = orderMap.get(a.sku);
      const bi = orderMap.get(b.sku);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return 0;
    });
    return sorted;
  }, [rawChildren, mskuOrder]);

  // 虚拟MSKU项（来自父记录逗号拼接 msku）没有独立库存/快照，
  // 一律回退到家族(父)记录；合计时只计一次，避免重复累加。
  const isVirtualGroup =
    children.length > 0 && children.every((c) => c.isVirtualMsku);
  const resolveInv = (c: SkuGroupChild): InventoryLayer | undefined =>
    c.isVirtualMsku ? latestInventory.get(parent.sku) : latestInventory.get(c.sku);
  const resolveSnap = (c: SkuGroupChild): DailySnapshot | undefined =>
    c.isVirtualMsku ? latestSnapshot.get(parent.sku) : latestSnapshot.get(c.sku);

  // Total stock: use 4-region warehouse totals
  const totalStock = isVirtualGroup
    ? computeWarehouseTotals(latestInventory.get(parent.sku)).total
    : children.reduce((sum, c) => {
        const wh = computeWarehouseTotals(resolveInv(c));
        return sum + wh.total;
      }, 0);

  // FIX: 月销/7天日均均显示总销量(各 MSKU/子链接合计)，而非只取主链接。
  //   虚拟组(父SKU msku逗号拼接)：所有虚拟MSKU回退到父快照，只计一次避免重复累加。
  //   真实多子链接组：各子链接快照求和，得到 SKU 总月销/总日均。
  const mainChild = children[0];
  const totalMonthlySales = isVirtualGroup
    ? (resolveSnap(mainChild)?.monthlySales ?? 0)
    : children.reduce((sum, c) => sum + (resolveSnap(c)?.monthlySales ?? 0), 0);

  const totalDailySales7d = isVirtualGroup
    ? (resolveSnap(mainChild)?.dailySales7d ?? 0)
    : children.reduce((sum, c) => sum + (resolveSnap(c)?.dailySales7d ?? 0), 0);

  const ratings = isVirtualGroup
    ? (() => {
        const r = latestSnapshot.get(parent.sku)?.rating ?? 0;
        return r > 0 ? [r] : [];
      })()
    : children
        .map((c) => resolveSnap(c)?.rating ?? 0)
        .filter((r) => r > 0);
  const avgRating =
    ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

  return (
    <div className="rounded-[14px] border border-background-200/70 overflow-hidden">
      <div
        className={`flex items-center justify-between px-4 py-3 ${
          isMultiChild
            ? "bg-background-100/80 border-l-2 border-l-primary-400"
            : "bg-background-50"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isMultiChild && selectionMode && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={allSelected ? onDeselectAll : onSelectAll}
              className="h-3.5 w-3.5 rounded border-background-300 cursor-pointer accent-primary-500 shrink-0"
              title="全选本组MSKU"
            />
          )}
          {isMultiChild ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? "收起产品组" : "展开产品组"}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-background-200 cursor-pointer shrink-0"
            >
              <i
                className={`${
                  expanded
                    ? "ri-arrow-down-s-line"
                    : "ri-arrow-right-s-line"
                } text-[16px] text-foreground-500`}
                aria-hidden
              />
            </button>
          ) : (
            <div className="w-6 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/sku/${encodeURIComponent(parent.sku)}`}
                className="text-[14px] font-semibold text-foreground-900 hover:text-primary-700 truncate cursor-pointer"
              >
                {parent.name}
              </Link>
              <span className="mono-num text-[11px] text-foreground-500 shrink-0">
                {parent.sku}
              </span>
              <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[11px] font-medium text-secondary-800 shrink-0">
                {totalChildren}个链接
              </span>
              {parent.lifecycle && (
                <Badge
                  tone={
                    parent.lifecycle === "new"
                      ? "primary"
                      : parent.lifecycle === "growth"
                        ? "accent"
                        : parent.lifecycle === "clearance"
                          ? "warn"
                          : "secondary"
                  }
                >
                  {lifecycleLabel[parent.lifecycle]}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-foreground-600 shrink-0 ml-4">
          <span>
            总库存{" "}
            <span className="mono-num font-medium text-foreground-900">
              {totalStock.toLocaleString()}
            </span>
          </span>
          <span>
            月销{" "}
            <span className="mono-num font-medium text-foreground-900">
              {totalMonthlySales.toLocaleString()}
            </span>
          </span>
          <span>
            7天日均{" "}
            <span className="mono-num font-medium text-foreground-900">
              {totalDailySales7d.toFixed(1)}
            </span>
          </span>
          {isMultiChild && (
            <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-700">
              以上为{totalChildren}个链接合计
            </span>
          )}
          {avgRating > 0 && (
            <span className="flex items-center gap-1">
              <i
                className="ri-star-fill text-[10px] text-accent-500"
                aria-hidden
              />
              <span className="mono-num font-medium text-foreground-900">
                {avgRating.toFixed(1)}
              </span>
            </span>
          )}
          {onDeleteGroup && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onMoveGroupUp?.(parent.sku)}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-background-200 text-foreground-400 hover:text-foreground-700 cursor-pointer shrink-0"
                title="上移"
              >
                <i className="ri-arrow-up-s-line text-[14px]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onMoveGroupDown?.(parent.sku)}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-background-200 text-foreground-400 hover:text-foreground-700 cursor-pointer shrink-0"
                title="下移"
              >
                <i className="ri-arrow-down-s-line text-[14px]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onDeleteGroup(parent.sku, parent.name)}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-50 text-foreground-400 hover:text-red-500 cursor-pointer shrink-0"
                title="删除分组"
              >
                <i className="ri-delete-bin-line text-[14px]" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>

      {(!isMultiChild || expanded) && (
        <div className="bg-background-50">
          {/* ── 桌面表格（全宽展示） ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-500 border-b border-background-200/70">
                  {selectionMode && (
                    <th className="px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={allSelected ? onDeselectAll : onSelectAll}
                        className="h-3.5 w-3.5 rounded border-background-300 cursor-pointer accent-primary-500"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 whitespace-nowrap">在售</th>
                  <th className="px-3 py-2 whitespace-nowrap">MSKU / ASIN</th>
                  <th className="px-3 py-2 whitespace-nowrap">店铺</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">星级</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">销售总价</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">净利</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">净利率</th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">促销</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">广告费比</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">退款率</th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {children.map((child, idx) => (
                  <ChildRow
                    key={child.sku}
                    child={child}
                    parentSku={parent.sku}
                    selectionMode={selectionMode}
                    snap={resolveSnap(child)}
                    inv={resolveInv(child)}
                    isVirtualMsku={child.isVirtualMsku}
                    promotions={promotions}
                    onDelete={(sku, name, parentSku) => onDeleteMsku?.(sku, name, parentSku)}
                    isFirst={idx === 0}
                    isLast={idx === children.length - 1}
                    onMoveUp={() => onMoveChild?.(parent.sku, child.sku, "up")}
                    onMoveDown={() => onMoveChild?.(parent.sku, child.sku, "down")}
                    canMove={totalChildren > 1}
                    getShopName={getShopName}
                    selected={selectedSkus.has(child.sku)}
                    onToggleSelect={() => onToggleSelect(child.sku)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────── ChildRow ────────── */

function ChildRow({
  child,
  parentSku,
  snap,
  inv,
  promotions,
  onDelete,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  canMove,
  getShopName,
  selected,
  onToggleSelect,
  selectionMode,
  isVirtualMsku,
}: {
  child: SkuGroupChild;
  parentSku?: string;
  snap: DailySnapshot | undefined;
  inv: InventoryLayer | undefined;
  promotions: Promotion[];
  onDelete?: (sku: string, name: string, parentSku?: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMove?: boolean;
  getShopName: (storeId: string) => string;
  selected: boolean;
  onToggleSelect: () => void;
  selectionMode: boolean;
  isVirtualMsku?: boolean;
}) {
  // FIX: 所有子项（真实/虚拟 MSKU）均优先使用 mskuMetrics 中的独立指标
  //      修复"展开列表显示相同数据"——各 MSKU 的退款率/退货率/广告费比/星级差异化展示
  const mskuMetricByMsku = child.msku ? child.mskuMetrics?.[child.msku] : undefined;
  const mskuMetricByAsin = !mskuMetricByMsku && child.asin ? child.mskuMetrics?.[child.asin] : undefined;
  const mskuMetric = mskuMetricByMsku || mskuMetricByAsin;
  const mskuSnap: DailySnapshot | undefined = mskuMetric && snap ? {
    ...snap,
    rating: mskuMetric.rating || snap.rating,
    reviewCount: mskuMetric.reviewCount ?? snap.reviewCount,
    adRatio: mskuMetric.adRatio || snap.adRatio,
    returnRate: mskuMetric.returnRate || snap.returnRate,
    refundRate: mskuMetric.refundRate ?? snap.refundRate,
    dailySales7d: mskuMetric.sales7d || snap.dailySales7d,
    // sales30d 存的是30天总量 → monthlySales 用总量，dailySales30d 用总量/30
    dailySales30d: mskuMetric.sales30d ? Math.round((mskuMetric.sales30d / 30) * 100) / 100 : snap.dailySales30d,
    monthlySales: mskuMetric.sales30d || snap.monthlySales,
  } : snap;
  // FIX: 利润计算用 MSKU 自身售价（若有），否则回退到家族级 price
  const childForCalc = mskuMetric?.price != null
    ? { ...child, price: mskuMetric.price, listPrice: mskuMetric.listPrice ?? child.listPrice }
    : child;
  const { profit, margin, adRatio, returnRate, refundRate } = computeMskuProfit(childForCalc, mskuSnap, inv);
  // 成本全缺失 → 利润率失真（算成 100%），应标注「成本缺失」而非 0
  const costMissing = isCostFullyMissing(child);
  // 退货率/退款率底层数据缺失 → 标注「缺失」而非误导性的 0%
  const rateMissing = isReturnRateMissing({
    fulfillment: child.fulfillment,
    costMissing,
    refundRate: mskuSnap?.refundRate,
  });
  const childPromos = promotions.filter((p) => p.sku === child.sku);
  const activeOrUpcoming = childPromos.find(
    (p) => p.status === "active" || p.status === "upcoming"
  );

  return (
    <tr className={`hover:bg-background-100/50 ${selected ? 'bg-primary-50/50' : ''}`}>
      {selectionMode && (
        <td className="px-2 py-2 border-b border-background-200/40 w-8">
          {isVirtualMsku ? (
            <input
              type="checkbox"
              disabled
              title="虚拟MSKU（视图展开）不可单独勾选"
              className="h-3.5 w-3.5 rounded border-background-300 cursor-not-allowed opacity-40"
            />
          ) : (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 rounded border-background-300 cursor-pointer accent-primary-500"
            />
          )}
        </td>
      )}
      <td className="px-3 py-2 border-b border-background-200/40">
        <Badge
          tone={
            child.saleStatus === "active"
              ? "primary"
              : child.saleStatus === "clearance"
                ? "warn"
                : "secondary"
          }
        >
          {saleStatusLabel[child.saleStatus]}
        </Badge>
      </td>
      <td className="px-3 py-2 border-b border-background-200/40">
        <div className="flex items-center gap-1">
          {canMove && !isVirtualMsku && (
            <div className="flex flex-col -space-y-px mr-0.5 shrink-0">
              <button
                type="button"
                disabled={isFirst}
                onClick={onMoveUp}
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-t text-[10px] leading-none ${
                  isFirst ? "text-foreground-300 cursor-default" : "text-foreground-500 hover:text-foreground-800 hover:bg-background-200 cursor-pointer"
                }`}
                title="上移"
              >
                <i className="ri-arrow-up-s-line" aria-hidden />
              </button>
              <button
                type="button"
                disabled={isLast}
                onClick={onMoveDown}
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-b text-[10px] leading-none ${
                  isLast ? "text-foreground-300 cursor-default" : "text-foreground-500 hover:text-foreground-800 hover:bg-background-200 cursor-pointer"
                }`}
                title="下移"
              >
                <i className="ri-arrow-down-s-line" aria-hidden />
              </button>
            </div>
          )}
          {isVirtualMsku ? (
            <Link
              to={`/sku/${encodeURIComponent(parentSku ?? child.groupSku ?? child.sku)}?focus=${encodeURIComponent(child.msku || child.sku)}`}
              className="font-medium text-foreground-900 hover:text-primary-700 cursor-pointer whitespace-nowrap"
            >
              {child.msku || child.sku}
            </Link>
          ) : (
            <Link
              to={`/sku/${encodeURIComponent(child.sku)}`}
              className="font-medium text-foreground-900 hover:text-primary-700 cursor-pointer whitespace-nowrap"
            >
              {child.msku || child.sku}
            </Link>
          )}
          {(() => {
            // 优先取 mskuAsins 中该 MSKU 对应的独立 ASIN
            // 仅跟卖链接（linkType=follow）回退到父级 asin；非跟卖不回退，避免误判为跟卖
            const individual = child.msku && child.mskuAsins?.[child.msku];
            const displayAsin = individual || (child.linkType === "follow" ? child.asin : undefined);
            return displayAsin ? (
              <div className="mono-num text-[10px] text-foreground-400 leading-tight">{displayAsin}</div>
            ) : null;
          })()}
        </div>
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-foreground-600 whitespace-nowrap">
        {getShopName(resolveChildStore(child))}
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-right whitespace-nowrap">
        {mskuSnap && mskuSnap.rating > 0 ? (
          <span className="flex items-center justify-end gap-1">
            <span className="mono-num font-medium">{mskuSnap.rating.toFixed(1)}</span>
            <i
              className="ri-star-fill text-[10px] text-accent-500"
              aria-hidden
            />
          </span>
        ) : (
          <span className="text-foreground-400">-</span>
        )}
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-right whitespace-nowrap">
        <div className="flex flex-col items-end leading-tight">
          {(() => {
            // FIX: 优先使用 mskuMetrics 中该 MSKU 自身的售价/运费/销售总价
            const mPrice = mskuMetric?.price ?? child.price;
            const mListPrice = mskuMetric?.listPrice ?? child.listPrice;
            const mShipping = mskuMetric?.shippingFee ?? ((mListPrice != null && mPrice != null) ? (mListPrice - mPrice) : 0);
            const displayTotal = mListPrice ?? mPrice;
            return (
              <>
                <span className="mono-num font-semibold text-foreground-900">
                  ${displayTotal.toFixed(2)}
                </span>
                {mShipping > 0 && (
                  <span className="mono-num text-[10px] text-foreground-400">
                    ${mPrice.toFixed(2)} + ${mShipping.toFixed(2)}
                  </span>
                )}
              </>
            );
          })()}
        </div>
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-right whitespace-nowrap">
        <span
          className={`mono-num font-medium ${
            profit < 0 ? "text-red-600" : "text-foreground-900"
          }`}
        >
          ${profit.toFixed(2)}
        </span>
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-right whitespace-nowrap">
        {costMissing ? (
          <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[11px] font-medium text-secondary-700">成本缺失</span>
        ) : (
          <span
            className={`mono-num font-medium ${marginColorClass(margin)}`}
          >
            {margin.toFixed(1)}%
          </span>
        )}
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-center whitespace-nowrap">
        {activeOrUpcoming ? (
          <Badge
            tone={
              activeOrUpcoming.status === "active" ? "accent" : "secondary"
            }
          >
            {activeOrUpcoming.type}
          </Badge>
        ) : (
          <span className="text-foreground-400">-</span>
        )}
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-right whitespace-nowrap">
        {snap ? (
          <span
            className={`mono-num font-medium ${adRatioColorClass(adRatio)}`}
          >
            {Math.abs(adRatio).toFixed(1)}%
          </span>
        ) : (
          <span className="text-foreground-400">-</span>
        )}
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-right whitespace-nowrap">
        {snap ? (
          rateMissing ? (
            <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[11px] font-medium text-secondary-700">缺失</span>
          ) : (
            <span
              className={`mono-num font-medium ${returnRateColorClass(refundRate)}`}
            >
              {refundRate.toFixed(1)}%
            </span>
          )
        ) : (
          <span className="text-foreground-400">-</span>
        )}
      </td>
      <td className="px-3 py-2 border-b border-background-200/40 text-center whitespace-nowrap">
        {!isVirtualMsku && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(child.sku, child.msku || child.sku, child.groupSku)}
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-red-50 text-foreground-400 hover:text-red-500 cursor-pointer"
            title="删除 MSKU"
          >
            <i className="ri-delete-bin-line text-[13px]" aria-hidden />
          </button>
        )}
      </td>
    </tr>
  );
}
const STORAGE_PARENT_ORDER_KEY = "aos-parent-order-v1";
function loadParentOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PARENT_ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}
function saveParentOrder(order: string[]) {
  try { localStorage.setItem(STORAGE_PARENT_ORDER_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}