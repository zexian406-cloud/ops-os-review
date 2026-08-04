import { useState, useEffect, useCallback } from "react";

/* ────────── 页面布局系统 ──────────
 * 支持任意页面的区块显隐 + 排序自定义
 * 每个页面有独立的 localStorage 存储
 */

export type PageId =
  | "dashboard"
  | "skuDetail"
  | "shipment"
  | "promotions"
  | "todo"
  | "calculator"
  | "operations"
  | "risk"
  | "season"
  | "settings"
  | "import" | "promo-center";

interface PageLayout {
  visible: string[];
  order: string[];
}

interface LayoutStore {
  pages: Record<PageId, PageLayout>;
}

const STORAGE_KEY = "aos-page-layout-v2";

/* ────────── 各页面默认区块 ────────── */
export const DEFAULT_SECTIONS: Record<PageId, string[]> = {
  dashboard: [
    "kpi", "todo", "weekCompare", "promotions", "riskBuckets",
    "alerts", "shipment", "wowBar",
  ],
  skuDetail: [
    "header", "discountBanner", "coreKpi", "coverageKpi", "qualityKpi",
    "editData", "profitAnalysis", "costWaterfall", "promoShipment",
    "mixedReplenish", "inventory", "listing", "weekOverWeek", "historyCharts",
    "relatedTodos",
  ],
  shipment: ["summaryKpi", "filters", "shipmentCards"],
  promotions: ["summaryCards", "addForm", "promoList"],
  todo: ["addForm", "todoList"],
  calculator: ["globalParams", "productCards", "providerConfig"],
  operations: [],
  risk: [],
  season: [],
  settings: [],
  import: [],
  promoCenter: [
    "summaryCards", "addForm", "promoList", "manualCost", "timeline",
  ],
};

export const PAGE_LABELS: Record<PageId, string> = {
  dashboard: "总览",
  skuDetail: "SKU 详情",
  shipment: "发货决策",
  promotions: "促销管理",
  todo: "我的待办",
  calculator: "新品测算",
  operations: "运营中心",
  risk: "风险中心",
  season: "旺季模拟",
  settings: "参数中心",
  import: "数据导入",
  promoCenter: "促销运营中心",
};

export const SECTION_LABELS: Record<string, Record<string, string>> = {
  dashboard: {
    kpi: "核心指标",
    todo: "我的待办",
    weekCompare: "本周 vs 上周",
    promotions: "促销活动",
    riskBuckets: "今日待处理",
    alerts: "紧急告警",
    shipment: "发货建议",
    wowBar: "上期对比条",
  },
  skuDetail: {
    header: "头部信息",
    discountBanner: "促销横幅",
    coreKpi: "核心 KPI",
    coverageKpi: "库存覆盖 KPI",
    qualityKpi: "质量/广告 KPI",
    editData: "编辑运营数据",
    profitAnalysis: "盈利分析",
    costWaterfall: "成本瀑布",
    promoShipment: "促销 & 发货",
    mixedReplenish: "混卖补货",
    inventory: "库存分析",
    listing: "Listing & 基础数据",
    weekOverWeek: "上期对比",
    historyCharts: "历史图表",
    relatedTodos: "关联待办",
  },
  shipment: {
    summaryKpi: "汇总 KPI",
    filters: "筛选与排序",
    shipmentCards: "发货建议卡片",
  },
  promotions: {
    summaryCards: "汇总统计",
    addForm: "新增促销",
    promoList: "已有促销列表",
  },
  todo: {
    addForm: "新增待办",
    todoList: "待办列表",
  },
  calculator: {
    globalParams: "全局参数",
    productCards: "产品测算卡片",
    providerConfig: "服务商配置",
  },
  promoCenter: {
    summaryCards: "汇总统计",
    addForm: "新增促销",
    promoList: "促销列表",
    manualCost: "手动成本",
    timeline: "促销时间线",
  },
};

/* ────────── 本地存储读写 ────────── */
function loadStore(): LayoutStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LayoutStore;
  } catch { /* ignore */ }
  return { pages: {} };
}

function saveStore(store: LayoutStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

function getPageLayout(pageId: PageId): PageLayout {
  const store = loadStore();
  const existing = store.pages[pageId];
  const defaults = DEFAULT_SECTIONS[pageId] ?? [];
  if (!existing) {
    return { visible: [...defaults], order: [...defaults] };
  }
  // 合并新增区块（新功能上线后默认显示）
  const allKeys = new Set([...defaults, ...existing.order]);
  const order = Array.from(allKeys).filter((k) => existing.order.includes(k) || !existing.visible || existing.visible.includes(k));
  const visible = Array.from(allKeys).filter((k) => existing.visible.includes(k));
  return { visible, order };
}

function setPageLayout(pageId: PageId, layout: PageLayout) {
  const store = loadStore();
  store.pages[pageId] = layout;
  saveStore(store);
}

/* ────────── 通用 Hook ────────── */
export function usePageLayout(pageId: PageId) {
  const [prefs, setPrefs] = useState<PageLayout>(() => getPageLayout(pageId));
  const [customizing, setCustomizing] = useState(false);

  const toggleSection = useCallback((key: string) => {
    setPrefs((prev) => {
      const visible = new Set(prev.visible);
      if (visible.has(key)) visible.delete(key);
      else visible.add(key);
      const next = { ...prev, visible: Array.from(visible) };
      setPageLayout(pageId, next);
      return next;
    });
  }, [pageId]);

  const moveSection = useCallback((key: string, direction: "up" | "down") => {
    setPrefs((prev) => {
      const order = [...prev.order];
      const idx = order.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
      if (newIdx === idx) return prev;
      const [removed] = order.splice(idx, 1);
      order.splice(newIdx, 0, removed);
      const next = { ...prev, order };
      setPageLayout(pageId, next);
      return next;
    });
  }, [pageId]);

  const reset = useCallback(() => {
    const defaults = DEFAULT_SECTIONS[pageId] ?? [];
    const next: PageLayout = { visible: [...defaults], order: [...defaults] };
    setPageLayout(pageId, next);
    setPrefs(next);
  }, [pageId]);

  const visibleKeys = prefs.visible;
  const orderedKeys = prefs.order.filter((k) => visibleKeys.includes(k));
  const allKeys = DEFAULT_SECTIONS[pageId] ?? [];

  return {
    customizing,
    setCustomizing,
    toggleSection,
    moveSection,
    reset,
    visibleKeys,
    orderedKeys,
    allKeys,
  };
}

/* ────────── 向后兼容：旧版 Dashboard / SKU Detail 迁移 ────────── */
export function migrateLegacyLayoutPrefs() {
  try {
    const legacy = localStorage.getItem("aos-layout-prefs-v1");
    if (!legacy) return;
    const parsed = JSON.parse(legacy) as {
      dashboard?: { visible?: string[]; order?: string[] };
      skuDetail?: { visible?: string[]; order?: string[] };
    };
    const store = loadStore();
    if (parsed.dashboard) {
      store.pages.dashboard = {
        visible: parsed.dashboard.visible ?? DEFAULT_SECTIONS.dashboard,
        order: parsed.dashboard.order ?? DEFAULT_SECTIONS.dashboard,
      };
    }
    if (parsed.skuDetail) {
      store.pages.skuDetail = {
        visible: parsed.skuDetail.visible ?? DEFAULT_SECTIONS.skuDetail,
        order: parsed.skuDetail.order ?? DEFAULT_SECTIONS.skuDetail,
      };
    }
    saveStore(store);
    localStorage.removeItem("aos-layout-prefs-v1");
  } catch { /* ignore */ }
}