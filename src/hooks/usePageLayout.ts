import { useState, useCallback } from "react";

/* ────────── 页面布局系统（画布模式） ──────────
 * 移除垂直排序，改为画布式自由拖拽布局
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

export interface GridItemLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ────────── 布局数据校验 ──────────
 * 确保所有布局项满足: w >= 1, h >= 1, x >= 0, y >= 0
 * 非法数据自动回退到默认值，防止卡片宽度为 0 导致挤压
 */
function normalizeLayoutItem(
  item: Partial<GridItemLayout> | undefined,
  fallback: GridItemLayout,
): GridItemLayout {
  const w = Number(item?.w);
  const h = Number(item?.h);
  const x = Number(item?.x);
  const y = Number(item?.y);
  return {
    w: Number.isFinite(w) && w >= 1 ? Math.min(w, 12) : fallback.w,
    h: Number.isFinite(h) && h >= 1 ? h : fallback.h,
    x: Number.isFinite(x) && x >= 0 ? Math.min(x, 12) : fallback.x,
    y: Number.isFinite(y) && y >= 0 ? y : fallback.y,
  };
}

function normalizeGridLayout(
  stored: Record<string, Partial<GridItemLayout>> | undefined,
  defaults: Record<string, GridItemLayout>,
): Record<string, GridItemLayout> {
  if (!stored || typeof stored !== "object") return { ...defaults };
  const result: Record<string, GridItemLayout> = {};
  for (const key of Object.keys(defaults)) {
    result[key] = normalizeLayoutItem(stored[key], defaults[key]);
  }
  for (const key of Object.keys(stored)) {
    if (!result[key]) {
      result[key] = normalizeLayoutItem(stored[key], { x: 0, y: 0, w: 12, h: 6 });
    }
  }
  return result;
}

interface PageLayout {
  visible: string[];
  gridLayout: Record<string, GridItemLayout>;
}

interface LayoutStore {
  pages: Record<PageId, PageLayout>;
}

const STORAGE_KEY = "aos-page-layout-v7";

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
    "summaryCards", "activityTab", "costTab", "timelineTab",
    "activityForm", "activityList", "costKpi", "costForm", "costList",
  ],
};

/* ────────── 各页面默认画布布局 ────────── */
const DEFAULT_GRID_LAYOUTS: Record<string, Record<string, GridItemLayout>> = {
  shipment: {
    summaryKpi:    { x: 0, y: 0, w: 12, h: 4 },
    filters:       { x: 0, y: 4, w: 12, h: 3 },
    shipmentCards: { x: 0, y: 7, w: 12, h: 20 },
  },
  promotions: {
    summaryCards: { x: 0, y: 0, w: 12, h: 4 },
    addForm:      { x: 0, y: 4, w: 6,  h: 10 },
    promoList:    { x: 6, y: 4, w: 6,  h: 16 },
  },
  todo: {
    addForm:  { x: 0, y: 0, w: 5, h: 10 },
    todoList: { x: 5, y: 0, w: 7, h: 20 },
  },
  promoCenter: {
    summaryCards: { x: 0, y: 0,  w: 12, h: 4 },
    activityTab:  { x: 0, y: 4,  w: 6,  h: 8 },
    costTab:      { x: 6, y: 4,  w: 6,  h: 8 },
    timelineTab:  { x: 0, y: 12, w: 12, h: 6 },
    activityForm: { x: 0, y: 18, w: 6,  h: 8 },
    activityList: { x: 6, y: 18, w: 6,  h: 10 },
    costKpi:      { x: 0, y: 28, w: 12, h: 4 },
    costForm:     { x: 0, y: 32, w: 6,  h: 8 },
    costList:     { x: 6, y: 32, w: 6,  h: 10 },
  },
};

function getDefaultGridLayout(pageId: PageId): Record<string, GridItemLayout> {
  const layout = DEFAULT_GRID_LAYOUTS[pageId];
  if (layout) return { ...layout };
  // Fallback: stack vertically with full width
  const sections = DEFAULT_SECTIONS[pageId] ?? [];
  const result: Record<string, GridItemLayout> = {};
  let y = 0;
  for (const s of sections) {
    result[s] = { x: 0, y, w: 12, h: 6 };
    y += 6;
  }
  return result;
}

export const PAGE_LABELS: Record<PageId, string> = {
  dashboard: "运营一览",
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
    activityTab: "活动管理",
    costTab: "促销成本",
    timelineTab: "促销时间线",
    activityForm: "新增活动",
    activityList: "活动列表",
    costKpi: "成本KPI",
    costForm: "成本录入",
    costList: "成本列表",
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
  const defaultGrid = getDefaultGridLayout(pageId);
  if (!existing) {
    return { visible: [...defaults], gridLayout: defaultGrid };
  }
  // 合并新增区块（新功能上线后默认显示）
  const allKeys = new Set([...defaults, ...Object.keys(existing.gridLayout || {})]);
  const visible = Array.from(allKeys).filter((k) => existing.visible.includes(k));
  // Validate all grid layout data — discard corrupted items, fall back to defaults
  const gridLayout = normalizeGridLayout(
    existing.gridLayout as Record<string, Partial<GridItemLayout>> | undefined,
    defaultGrid,
  );
  return { visible, gridLayout };
}

function setPageLayout(pageId: PageId, layout: PageLayout) {
  const store = loadStore();
  store.pages[pageId] = layout;
  saveStore(store);
}

/* ────────── 通用 Hook（画布模式） ────────── */
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

  const setGridLayout = useCallback((layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    setPrefs((prev) => {
      const defaultGrid = getDefaultGridLayout(pageId);
      const gridLayout = { ...prev.gridLayout };
      for (const item of layout) {
        // Normalize: clamp w >= 1, h >= 1, x >= 0, y >= 0 before saving
        const fallback = defaultGrid[item.i] ?? { x: 0, y: 0, w: 12, h: 6 };
        gridLayout[item.i] = normalizeLayoutItem(item, fallback);
      }
      const next = { ...prev, gridLayout };
      setPageLayout(pageId, next);
      return next;
    });
  }, [pageId]);

  const reset = useCallback(() => {
    // Completely overwrite — do not merge with existing (potentially corrupted) data
    const defaults = DEFAULT_SECTIONS[pageId] ?? [];
    const next: PageLayout = { visible: [...defaults], gridLayout: getDefaultGridLayout(pageId) };
    setPageLayout(pageId, next);
    setPrefs(next);
  }, [pageId]);

  const defaultGridLayout = getDefaultGridLayout(pageId);

  const resetItemSize = useCallback((key: string) => {
    setPrefs((prev) => {
      const defaultItem = defaultGridLayout[key];
      if (!defaultItem) return prev;
      const current = prev.gridLayout[key] ?? { x: 0, y: 0, w: 12, h: 6 };
      const gridLayout = { ...prev.gridLayout, [key]: { ...current, w: defaultItem.w, h: defaultItem.h } };
      const next = { ...prev, gridLayout };
      setPageLayout(pageId, next);
      return next;
    });
  }, [pageId, defaultGridLayout]);

  const resetItemPosition = useCallback((key: string) => {
    setPrefs((prev) => {
      const defaultItem = defaultGridLayout[key];
      if (!defaultItem) return prev;
      const current = prev.gridLayout[key] ?? { w: 12, h: 6 };
      const gridLayout = { ...prev.gridLayout, [key]: { ...current, x: defaultItem.x, y: defaultItem.y } };
      const next = { ...prev, gridLayout };
      setPageLayout(pageId, next);
      return next;
    });
  }, [pageId, defaultGridLayout]);

  const visibleKeys = prefs.visible;
  const allKeys = DEFAULT_SECTIONS[pageId] ?? [];
  const gridLayout = prefs.gridLayout;

  return {
    customizing,
    setCustomizing,
    toggleSection,
    setGridLayout,
    gridLayout,
    reset,
    resetItemSize,
    resetItemPosition,
    defaultGridLayout,
    visibleKeys,
    allKeys,
  };
}
