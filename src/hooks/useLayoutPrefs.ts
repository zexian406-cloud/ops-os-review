import { useState, useCallback } from "react";

/* ────────── Dashboard 布局偏好 ────────── */
export type DashboardSectionKey =
  | "kpi"
  | "todo"
  | "opsLogs"
  | "weekCompare"
  | "promotions"
  | "riskBuckets"
  | "alerts"
  | "shipment"
  | "wowBar";

export type SkuDetailSectionKey =
  | "header"
  | "discountBanner"
  | "kpiCards"
  | "editData"
  | "profitAnalysis"
  | "costWaterfall"
  | "promoShipment"
  | "mixedReplenish"
  | "inventory"
  | "listing"
  | "weekOverWeek"
  | "historyCharts"
  | "relatedTodos";

/* ────────── KPI 卡片可配指标 ────────── */
export type KpiMetricKey =
  | "activeSkus"
  | "activeMsku"
  | "totalStock"
  | "dailySales"
  | "avgMargin"
  | "avgAdRatio"
  | "alertsCount"
  | "shipmentCount"
  | "promoCount"
  | "todoCount";

export const KPI_METRIC_LABELS: Record<KpiMetricKey, string> = {
  activeSkus: "在售 SKU（产品）",
  activeMsku: "在售 MSKU（链接）",
  totalStock: "全站库存",
  dailySales: "日均销量",
  avgMargin: "平均利润率",
  avgAdRatio: "平均广告费比",
  alertsCount: "告警数量",
  shipmentCount: "发货建议数",
  promoCount: "促销活动数",
  todoCount: "待办数量",
};

export const KPI_METRIC_ICONS: Record<KpiMetricKey, string> = {
  activeSkus: "ri-price-tag-3-line",
  activeMsku: "ri-link",
  totalStock: "ri-archive-line",
  dailySales: "ri-shopping-cart-2-line",
  avgMargin: "ri-money-dollar-circle-line",
  avgAdRatio: "ri-megaphone-line",
  alertsCount: "ri-alarm-warning-line",
  shipmentCount: "ri-truck-line",
  promoCount: "ri-calendar-event-line",
  todoCount: "ri-list-check-3",
};

export const KPI_METRIC_TONES: Record<KpiMetricKey, "primary" | "accent" | "warn" | "danger"> = {
  activeSkus: "primary",
  activeMsku: "primary",
  totalStock: "primary",
  dailySales: "accent",
  avgMargin: "accent",
  avgAdRatio: "warn",
  alertsCount: "danger",
  shipmentCount: "primary",
  promoCount: "accent",
  todoCount: "primary",
};

export const DEFAULT_KPI_SLOTS: KpiMetricKey[] = ["activeSkus", "activeMsku", "totalStock", "dailySales"];

/* ────────── 发货页 KPI 可配指标 ────────── */
export type ShipmentKpiMetricKey =
  | "pendingSkus"
  | "urgentSkus"
  | "suggestQty"
  | "fobCost"
  | "campaigns"
  | "totalTransit"
  | "totalOverseas"
  | "totalFactory"
  | "minCoverDays"
  | "avgCoverDays";

export const SHIPMENT_KPI_METRIC_LABELS: Record<ShipmentKpiMetricKey, string> = {
  pendingSkus: "待发 SKU 数",
  urgentSkus: "紧急 SKU 数",
  suggestQty: "建议发货总量",
  fobCost: "预估 FOB 成本",
  campaigns: "活动加成数",
  totalTransit: "在途库存总量",
  totalOverseas: "海外仓库存",
  totalFactory: "工厂库存",
  minCoverDays: "最低覆盖天数",
  avgCoverDays: "平均覆盖天数",
};

export const SHIPMENT_KPI_METRIC_ICONS: Record<ShipmentKpiMetricKey, string> = {
  pendingSkus: "ri-truck-line",
  urgentSkus: "ri-alarm-warning-line",
  suggestQty: "ri-archive-line",
  fobCost: "ri-money-dollar-circle-line",
  campaigns: "ri-calendar-event-line",
  totalTransit: "ri-ship-line",
  totalOverseas: "ri-earth-line",
  totalFactory: "ri-building-2-line",
  minCoverDays: "ri-timer-flash-line",
  avgCoverDays: "ri-bar-chart-line",
};

export const SHIPMENT_KPI_METRIC_TONES: Record<ShipmentKpiMetricKey, "default" | "primary" | "accent" | "warn" | "danger"> = {
  pendingSkus: "primary",
  urgentSkus: "danger",
  suggestQty: "primary",
  fobCost: "accent",
  campaigns: "accent",
  totalTransit: "primary",
  totalOverseas: "primary",
  totalFactory: "primary",
  minCoverDays: "warn",
  avgCoverDays: "primary",
};

export const DEFAULT_SHIPMENT_KPI_SLOTS: ShipmentKpiMetricKey[] = ["pendingSkus", "suggestQty", "fobCost", "campaigns"];

/* ────────── 网格布局项 ────────── */
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
const MIN_W = 1;
const MIN_H = 1;

function normalizeLayoutItem(
  item: Partial<GridItemLayout> | undefined,
  fallback: GridItemLayout,
): GridItemLayout {
  const w = Number(item?.w);
  const h = Number(item?.h);
  const x = Number(item?.x);
  const y = Number(item?.y);
  return {
    w: Number.isFinite(w) && w >= MIN_W ? Math.min(w, 12) : fallback.w,
    h: Number.isFinite(h) && h >= MIN_H ? h : fallback.h,
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
  // Validate all stored items against defaults
  for (const key of Object.keys(defaults)) {
    const fallback = defaults[key];
    const storedItem = stored[key];
    result[key] = normalizeLayoutItem(storedItem, fallback);
  }
  // Also keep any extra keys that exist in stored but not in defaults
  for (const key of Object.keys(stored)) {
    if (!result[key]) {
      result[key] = normalizeLayoutItem(stored[key], { x: 0, y: 0, w: 12, h: 6 });
    }
  }
  return result;
}

export const SKU_LABELS: Record<SkuDetailSectionKey, string> = {
  header: "头部信息",
  discountBanner: "折扣横幅",
  kpiCards: "KPI 卡片",
  editData: "数据编辑",
  profitAnalysis: "利润分析",
  costWaterfall: "成本瀑布图",
  promoShipment: "促销发货",
  mixedReplenish: "混卖补货",
  inventory: "库存分析",
  listing: "Listing 优化",
  weekOverWeek: "周环比",
  historyCharts: "历史趋势",
  relatedTodos: "关联待办",
};

/** 默认网格布局：12列自由画布，compactType=null 不自动压缩
 *  h 值基于 rowHeight=40px + margin=12px，内容溢出可滚动，用户可拖拽调整
 *  默认布局混合全宽 + 左右并排，避免纯竖版 */
const DEFAULT_SKU_GRID_LAYOUT: Record<SkuDetailSectionKey, GridItemLayout> = {
  header:         { x: 0, y: 0,  w: 12, h: 4 },
  discountBanner: { x: 0, y: 4,  w: 12, h: 2 },
  kpiCards:       { x: 0, y: 6,  w: 12, h: 10 },
  editData:       { x: 0, y: 16, w: 6,  h: 8 },
  profitAnalysis: { x: 6, y: 16, w: 6,  h: 8 },
  costWaterfall:  { x: 0, y: 24, w: 6,  h: 10 },
  promoShipment:  { x: 6, y: 24, w: 6,  h: 10 },
  mixedReplenish: { x: 0, y: 34, w: 6,  h: 8 },
  inventory:      { x: 6, y: 34, w: 6,  h: 8 },
  listing:        { x: 0, y: 42, w: 12, h: 20 },
  weekOverWeek:   { x: 0, y: 62, w: 6,  h: 4 },
  historyCharts:  { x: 6, y: 62, w: 6,  h: 8 },
  relatedTodos:   { x: 0, y: 70, w: 12, h: 6 },
};

/* ────────── Dashboard 默认画布布局 ──────────
 * 紧凑布局：三列并排 + 宽窄搭配，不遮挡视野 */
const DEFAULT_DASHBOARD_GRID_LAYOUT: Record<DashboardSectionKey, GridItemLayout> = {
  kpi:         { x: 0, y: 0,  w: 12, h: 4 },
  todo:        { x: 0, y: 4,  w: 4,  h: 8 },
  opsLogs:     { x: 4, y: 4,  w: 4,  h: 8 },
  riskBuckets: { x: 8, y: 4,  w: 4,  h: 8 },
  weekCompare: { x: 0, y: 12, w: 8,  h: 7 },
  alerts:      { x: 8, y: 12, w: 4,  h: 7 },
  promotions:  { x: 0, y: 19, w: 6,  h: 7 },
  shipment:    { x: 6, y: 19, w: 6,  h: 7 },
  wowBar:      { x: 0, y: 26, w: 12, h: 3 },
};

interface LayoutPrefs {
  dashboard: {
    visible: DashboardSectionKey[];
    kpiSlots: KpiMetricKey[];
    gridLayout: Record<string, GridItemLayout>;
  };
  skuDetail: {
    visible: SkuDetailSectionKey[];
    gridLayout: Record<string, GridItemLayout>;
  };
  shipment: {
    kpiSlots: ShipmentKpiMetricKey[];
  };
}

const DEFAULT_DASHBOARD_VISIBLE: DashboardSectionKey[] = [
  "kpi",
  "todo",
  "opsLogs",
  "weekCompare",
  "promotions",
  "riskBuckets",
  "alerts",
  "shipment",
  "wowBar",
];

const DEFAULT_SKU_VISIBLE: SkuDetailSectionKey[] = [
  "header",
  "discountBanner",
  "kpiCards",
  "editData",
  "profitAnalysis",
  "costWaterfall",
  "promoShipment",
  "mixedReplenish",
  "inventory",
  "listing",
  "weekOverWeek",
  "historyCharts",
  "relatedTodos",
];

const STORAGE_KEY = "aos-layout-prefs-v9";

function loadPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
      // Validate all grid layout data — discard corrupted items, fall back to defaults
      const dashboardGrid = normalizeGridLayout(
        parsed.dashboard?.gridLayout as Record<string, Partial<GridItemLayout>> | undefined,
        DEFAULT_DASHBOARD_GRID_LAYOUT,
      );
      const skuGrid = normalizeGridLayout(
        parsed.skuDetail?.gridLayout as Record<string, Partial<GridItemLayout>> | undefined,
        DEFAULT_SKU_GRID_LAYOUT,
      );
      return {
        dashboard: {
          visible: parsed.dashboard?.visible ?? DEFAULT_DASHBOARD_VISIBLE,
          kpiSlots: parsed.dashboard?.kpiSlots ?? [...DEFAULT_KPI_SLOTS],
          gridLayout: dashboardGrid,
        },
        skuDetail: {
          visible: parsed.skuDetail?.visible ?? DEFAULT_SKU_VISIBLE,
          gridLayout: skuGrid,
        },
        shipment: {
          kpiSlots: parsed.shipment?.kpiSlots ?? [...DEFAULT_SHIPMENT_KPI_SLOTS],
        },
      };
    }
  } catch { /* ignore */ }
  return {
    dashboard: { visible: [...DEFAULT_DASHBOARD_VISIBLE], kpiSlots: [...DEFAULT_KPI_SLOTS], gridLayout: { ...DEFAULT_DASHBOARD_GRID_LAYOUT } },
    skuDetail: { visible: [...DEFAULT_SKU_VISIBLE], gridLayout: { ...DEFAULT_SKU_GRID_LAYOUT } },
    shipment: { kpiSlots: [...DEFAULT_SHIPMENT_KPI_SLOTS] },
  };
}

function savePrefs(prefs: LayoutPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/* ────────── Dashboard Hook ────────── */
export function useDashboardLayout() {
  const [prefs, setPrefs] = useState<LayoutPrefs>(loadPrefs);
  const [customizing, setCustomizing] = useState(false);

  const toggleSection = useCallback((key: DashboardSectionKey) => {
    setPrefs((prev) => {
      const visible = new Set(prev.dashboard.visible);
      if (visible.has(key)) visible.delete(key);
      else visible.add(key);
      const next = {
        ...prev,
        dashboard: { ...prev.dashboard, visible: Array.from(visible) },
      };
      savePrefs(next);
      return next;
    });
  }, []);

  const setKpiSlot = useCallback((index: number, key: KpiMetricKey) => {
    setPrefs((prev) => {
      const slots = [...prev.dashboard.kpiSlots];
      if (index >= 0 && index < slots.length) {
        slots[index] = key;
      }
      const next = { ...prev, dashboard: { ...prev.dashboard, kpiSlots: slots } };
      savePrefs(next);
      return next;
    });
  }, []);

  const setGridLayout = useCallback((layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    setPrefs((prev) => {
      const gridLayout = { ...prev.dashboard.gridLayout };
      for (const item of layout) {
        // Normalize: clamp w >= 1, h >= 1, x >= 0, y >= 0 before saving
        const fallback = DEFAULT_DASHBOARD_GRID_LAYOUT[item.i as DashboardSectionKey] ?? { x: 0, y: 0, w: 12, h: 6 };
        gridLayout[item.i] = normalizeLayoutItem(item, fallback);
      }
      const next = { ...prev, dashboard: { ...prev.dashboard, gridLayout } };
      savePrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    // Completely overwrite — do not merge with existing (potentially corrupted) data
    const next: LayoutPrefs = {
      dashboard: { visible: [...DEFAULT_DASHBOARD_VISIBLE], kpiSlots: [...DEFAULT_KPI_SLOTS], gridLayout: { ...DEFAULT_DASHBOARD_GRID_LAYOUT } },
      skuDetail: { ...loadPrefs().skuDetail },
      shipment: { ...loadPrefs().shipment },
    };
    savePrefs(next);
    setPrefs(next);
  }, []);

  const resetItemSize = useCallback((key: string) => {
    setPrefs((prev) => {
      const defaultItem = DEFAULT_DASHBOARD_GRID_LAYOUT[key as DashboardSectionKey];
      if (!defaultItem) return prev;
      const current = prev.dashboard.gridLayout[key] ?? { x: 0, y: 0, w: 12, h: 6 };
      const gridLayout = { ...prev.dashboard.gridLayout, [key]: { ...current, w: defaultItem.w, h: defaultItem.h } };
      const next = { ...prev, dashboard: { ...prev.dashboard, gridLayout } };
      savePrefs(next);
      return next;
    });
  }, []);

  const resetItemPosition = useCallback((key: string) => {
    setPrefs((prev) => {
      const defaultItem = DEFAULT_DASHBOARD_GRID_LAYOUT[key as DashboardSectionKey];
      if (!defaultItem) return prev;
      const current = prev.dashboard.gridLayout[key] ?? { w: 12, h: 6 };
      const gridLayout = { ...prev.dashboard.gridLayout, [key]: { ...current, x: defaultItem.x, y: defaultItem.y } };
      const next = { ...prev, dashboard: { ...prev.dashboard, gridLayout } };
      savePrefs(next);
      return next;
    });
  }, []);

  const visibleKeys = prefs.dashboard.visible;
  const kpiSlots = prefs.dashboard.kpiSlots;
  const gridLayout = prefs.dashboard.gridLayout;

  return {
    customizing,
    setCustomizing,
    toggleSection,
    setKpiSlot,
    setGridLayout,
    gridLayout,
    reset,
    resetItemSize,
    resetItemPosition,
    defaultGridLayout: DEFAULT_DASHBOARD_GRID_LAYOUT,
    visibleKeys,
    kpiSlots,
    allKeys: DEFAULT_DASHBOARD_VISIBLE,
  };
}

/* ────────── SKU Detail Hook ────────── */
export function useSkuDetailLayout() {
  const [prefs, setPrefs] = useState<LayoutPrefs>(loadPrefs);
  const [customizing, setCustomizing] = useState(false);

  const toggleSection = useCallback((key: SkuDetailSectionKey) => {
    setPrefs((prev) => {
      const visible = new Set(prev.skuDetail.visible);
      if (visible.has(key)) visible.delete(key);
      else visible.add(key);
      const next = {
        ...prev,
        skuDetail: { ...prev.skuDetail, visible: Array.from(visible) },
      };
      savePrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    // Completely overwrite — do not merge with existing (potentially corrupted) data
    const next: LayoutPrefs = {
      dashboard: { ...loadPrefs().dashboard },
      skuDetail: { visible: [...DEFAULT_SKU_VISIBLE], gridLayout: { ...DEFAULT_SKU_GRID_LAYOUT } },
      shipment: { ...loadPrefs().shipment },
    };
    savePrefs(next);
    setPrefs(next);
  }, []);

  const setGridLayout = useCallback((layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    setPrefs((prev) => {
      const gridLayout = { ...prev.skuDetail.gridLayout };
      for (const item of layout) {
        // Normalize: clamp w >= 1, h >= 1, x >= 0, y >= 0 before saving
        const fallback = DEFAULT_SKU_GRID_LAYOUT[item.i as SkuDetailSectionKey] ?? { x: 0, y: 0, w: 12, h: 6 };
        gridLayout[item.i] = normalizeLayoutItem(item, fallback);
      }
      const next = { ...prev, skuDetail: { ...prev.skuDetail, gridLayout } };
      savePrefs(next);
      return next;
    });
  }, []);

  const visibleKeys = prefs.skuDetail.visible;
  const gridLayout = prefs.skuDetail.gridLayout;

  const resetItemSize = useCallback((key: string) => {
    setPrefs((prev) => {
      const defaultItem = DEFAULT_SKU_GRID_LAYOUT[key as SkuDetailSectionKey];
      if (!defaultItem) return prev;
      const current = prev.skuDetail.gridLayout[key] ?? { x: 0, y: 0, w: 12, h: 6 };
      const gridLayout = { ...prev.skuDetail.gridLayout, [key]: { ...current, w: defaultItem.w, h: defaultItem.h } };
      const next = { ...prev, skuDetail: { ...prev.skuDetail, gridLayout } };
      savePrefs(next);
      return next;
    });
  }, []);

  const resetItemPosition = useCallback((key: string) => {
    setPrefs((prev) => {
      const defaultItem = DEFAULT_SKU_GRID_LAYOUT[key as SkuDetailSectionKey];
      if (!defaultItem) return prev;
      const current = prev.skuDetail.gridLayout[key] ?? { w: 12, h: 6 };
      const gridLayout = { ...prev.skuDetail.gridLayout, [key]: { ...current, x: defaultItem.x, y: defaultItem.y } };
      const next = { ...prev, skuDetail: { ...prev.skuDetail, gridLayout } };
      savePrefs(next);
      return next;
    });
  }, []);

  return {
    customizing,
    setCustomizing,
    toggleSection,
    setGridLayout,
    gridLayout,
    reset,
    resetItemSize,
    resetItemPosition,
    defaultGridLayout: DEFAULT_SKU_GRID_LAYOUT,
    visibleKeys,
    allKeys: DEFAULT_SKU_VISIBLE,
  };
}

/* ────────── 发货页 KPI Hook ────────── */
export function useShipmentKpiLayout() {
  const [prefs, setPrefs] = useState<LayoutPrefs>(loadPrefs);
  const [customizingKpi, setCustomizingKpi] = useState(false);

  const setKpiSlot = useCallback((slotIndex: number, key: ShipmentKpiMetricKey) => {
    setPrefs((prev) => {
      const slots = [...prev.shipment.kpiSlots];
      if (slotIndex >= 0 && slotIndex < slots.length) {
        slots[slotIndex] = key;
      }
      const next = { ...prev, shipment: { ...prev.shipment, kpiSlots: slots } };
      savePrefs(next);
      return next;
    });
  }, []);

  const resetKpi = useCallback(() => {
    setPrefs((prev) => {
      const next = { ...prev, shipment: { ...prev.shipment, kpiSlots: [...DEFAULT_SHIPMENT_KPI_SLOTS] } };
      savePrefs(next);
      return next;
    });
  }, []);

  const kpiSlots = prefs.shipment.kpiSlots;

  return { customizingKpi, setCustomizingKpi, setKpiSlot, resetKpi, kpiSlots };
}

/* ────────── Labels ────────── */
export const DASHBOARD_LABELS: Record<DashboardSectionKey, string> = {
  kpi: "核心指标",
  todo: "我的待办",
  opsLogs: "操作记录",
  weekCompare: "本周 vs 上周",
  promotions: "促销活动",
  riskBuckets: "今日待处理",
  alerts: "紧急告警",
  shipment: "发货建议",
  wowBar: "上期对比条",
};
