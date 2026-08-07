import { useState, useEffect, useCallback } from "react";

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

/* ────────── SKU 详情页 KPI 卡片 Key ────────── */
export type CoreKpiCardKey = "dailySales7d" | "monthlySales" | "inStock" | "inTransit" | "totalStock" | "stockSalesRatio";
export type CoverageKpiCardKey = "coverDays" | "coverOnHand" | "coverWithTransit" | "leadTime";
export type QualityKpiCardKey = "rating" | "reviewCount" | "returnRate" | "adRatio" | "refundFee";

export const CORE_KPI_CARD_LABELS: Record<CoreKpiCardKey, string> = {
  dailySales7d: "7天日均销量",
  monthlySales: "30天销量",
  inStock: "在库库存",
  inTransit: "在途库存",
  totalStock: "总库存",
  stockSalesRatio: "存销比",
};

export const COVERAGE_KPI_CARD_LABELS: Record<CoverageKpiCardKey, string> = {
  coverDays: "综合覆盖",
  coverOnHand: "在库覆盖",
  coverWithTransit: "含在途覆盖",
  leadTime: "Lead Time",
};

export const QUALITY_KPI_CARD_LABELS: Record<QualityKpiCardKey, string> = {
  rating: "评分",
  reviewCount: "Review 数",
  returnRate: "退货率/退款率",
  adRatio: "广告费比",
  refundFee: "退款费",
};

export const DEFAULT_CORE_KPI_CARDS: CoreKpiCardKey[] = ["dailySales7d", "monthlySales", "inStock", "inTransit", "totalStock", "stockSalesRatio"];
export const DEFAULT_COVERAGE_KPI_CARDS: CoverageKpiCardKey[] = ["coverDays", "coverOnHand", "coverWithTransit", "leadTime"];
export const DEFAULT_QUALITY_KPI_CARDS: QualityKpiCardKey[] = ["rating", "reviewCount", "returnRate", "adRatio", "refundFee"];

/* ────────── 统一 KPI 卡片（合并所有） ────────── */
export type AllKpiCardKey = CoreKpiCardKey | CoverageKpiCardKey | QualityKpiCardKey;

export const ALL_KPI_CARD_LABELS: Record<AllKpiCardKey, string> = {
  ...CORE_KPI_CARD_LABELS,
  ...COVERAGE_KPI_CARD_LABELS,
  ...QUALITY_KPI_CARD_LABELS,
};

export const DEFAULT_ALL_KPI_CARDS: AllKpiCardKey[] = [
  ...DEFAULT_CORE_KPI_CARDS,
  ...DEFAULT_COVERAGE_KPI_CARDS,
  ...DEFAULT_QUALITY_KPI_CARDS,
];

/* ────────── 网格布局项 ────────── */
export interface GridItemLayout {
  x: number;
  y: number;
  w: number;
  h: number;
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

interface LayoutPrefs {
  dashboard: {
    visible: DashboardSectionKey[];
    order: DashboardSectionKey[];
    kpiSlots: KpiMetricKey[];
  };
  skuDetail: {
    visible: SkuDetailSectionKey[];
    order: SkuDetailSectionKey[];
    kpiCardOrder: AllKpiCardKey[];
    gridLayout: Record<string, GridItemLayout>;
  };
  shipment: {
    kpiSlots: ShipmentKpiMetricKey[];
  };
}

const DEFAULT_DASHBOARD_ORDER: DashboardSectionKey[] = [
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

const DEFAULT_SKU_ORDER: SkuDetailSectionKey[] = [
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

const STORAGE_KEY = "aos-layout-prefs-v3";

function loadPrefs(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
      return {
        dashboard: {
          visible: parsed.dashboard?.visible ?? DEFAULT_DASHBOARD_ORDER,
          order: parsed.dashboard?.order ?? DEFAULT_DASHBOARD_ORDER,
          kpiSlots: parsed.dashboard?.kpiSlots ?? [...DEFAULT_KPI_SLOTS],
        },
        skuDetail: {
          visible: parsed.skuDetail?.visible ?? DEFAULT_SKU_ORDER,
          order: parsed.skuDetail?.order ?? DEFAULT_SKU_ORDER,
          kpiCardOrder: parsed.skuDetail?.kpiCardOrder ?? [...DEFAULT_ALL_KPI_CARDS],
          gridLayout: parsed.skuDetail?.gridLayout ?? { ...DEFAULT_SKU_GRID_LAYOUT },
        },
        shipment: {
          kpiSlots: parsed.shipment?.kpiSlots ?? [...DEFAULT_SHIPMENT_KPI_SLOTS],
        },
      };
    }
  } catch { /* ignore */ }
  return {
    dashboard: { visible: [...DEFAULT_DASHBOARD_ORDER], order: [...DEFAULT_DASHBOARD_ORDER], kpiSlots: [...DEFAULT_KPI_SLOTS] },
    skuDetail: { visible: [...DEFAULT_SKU_ORDER], order: [...DEFAULT_SKU_ORDER], kpiCardOrder: [...DEFAULT_ALL_KPI_CARDS], gridLayout: { ...DEFAULT_SKU_GRID_LAYOUT } },
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

  const moveSection = useCallback((key: DashboardSectionKey, direction: "up" | "down") => {
    setPrefs((prev) => {
      const order = [...prev.dashboard.order];
      const idx = order.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
      if (newIdx === idx) return prev;
      const [removed] = order.splice(idx, 1);
      order.splice(newIdx, 0, removed);
      const next = { ...prev, dashboard: { ...prev.dashboard, order } };
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

  const reset = useCallback(() => {
    const next: LayoutPrefs = {
      ...prefs,
      dashboard: { visible: [...DEFAULT_DASHBOARD_ORDER], order: [...DEFAULT_DASHBOARD_ORDER], kpiSlots: [...DEFAULT_KPI_SLOTS] },
    };
    savePrefs(next);
    setPrefs(next);
  }, [prefs]);

  const visibleKeys = prefs.dashboard.visible;
  const orderedKeys = prefs.dashboard.order.filter((k) => visibleKeys.includes(k));
  const kpiSlots = prefs.dashboard.kpiSlots;

  return {
    customizing,
    setCustomizing,
    toggleSection,
    moveSection,
    setKpiSlot,
    reset,
    visibleKeys,
    orderedKeys,
    kpiSlots,
    allKeys: DEFAULT_DASHBOARD_ORDER,
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

  const moveSection = useCallback((key: SkuDetailSectionKey, direction: "up" | "down") => {
    setPrefs((prev) => {
      const order = [...prev.skuDetail.order];
      const idx = order.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
      if (newIdx === idx) return prev;
      const [removed] = order.splice(idx, 1);
      order.splice(newIdx, 0, removed);
      const next = { ...prev, skuDetail: { ...prev.skuDetail, order } };
      savePrefs(next);
      return next;
    });
  }, []);

  // ── 统一 KPI 卡片排序 ──
  const moveKpiCard = useCallback((key: AllKpiCardKey, direction: "left" | "right") => {
    setPrefs((prev) => {
      const cards = [...prev.skuDetail.kpiCardOrder];
      const idx = cards.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = direction === "left" ? Math.max(0, idx - 1) : Math.min(cards.length - 1, idx + 1);
      if (newIdx === idx) return prev;
      const [removed] = cards.splice(idx, 1);
      cards.splice(newIdx, 0, removed);
      const next = { ...prev, skuDetail: { ...prev.skuDetail, kpiCardOrder: cards } };
      savePrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next: LayoutPrefs = {
      ...prefs,
      skuDetail: { visible: [...DEFAULT_SKU_ORDER], order: [...DEFAULT_SKU_ORDER], kpiCardOrder: [...DEFAULT_ALL_KPI_CARDS], gridLayout: { ...DEFAULT_SKU_GRID_LAYOUT } },
    };
    savePrefs(next);
    setPrefs(next);
  }, [prefs]);

  // ── 网格布局更新（react-grid-layout 拖拽/缩放后回调） ──
  const setGridLayout = useCallback((layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    setPrefs((prev) => {
      const gridLayout = { ...prev.skuDetail.gridLayout };
      for (const item of layout) {
        gridLayout[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
      }
      const next = { ...prev, skuDetail: { ...prev.skuDetail, gridLayout } };
      savePrefs(next);
      return next;
    });
  }, []);

  const visibleKeys = prefs.skuDetail.visible;
  const orderedKeys = prefs.skuDetail.order.filter((k) => visibleKeys.includes(k));
  const gridLayout = prefs.skuDetail.gridLayout;

  // 从统一数组拆分为3个独立数组（兼容SkuLayoutCustomizer接口）
  const allCards = prefs.skuDetail.kpiCardOrder;
  const coreKpiCardOrder = allCards.filter((k): k is CoreKpiCardKey =>
    ["dailySales7d", "monthlySales", "inStock", "inTransit", "totalStock", "stockSalesRatio"].includes(k)
  );
  const coverageKpiCardOrder = allCards.filter((k): k is CoverageKpiCardKey =>
    ["coverDays", "coverOnHand", "coverWithTransit", "leadTime"].includes(k)
  );
  const qualityKpiCardOrder = allCards.filter((k): k is QualityKpiCardKey =>
    ["rating", "reviewCount", "returnRate", "adRatio", "refundFee"].includes(k)
  );

  const moveCoreKpiCard = useCallback((key: CoreKpiCardKey, direction: "left" | "right") => {
    moveKpiCard(key, direction);
  }, [moveKpiCard]);
  const moveCoverageKpiCard = useCallback((key: CoverageKpiCardKey, direction: "left" | "right") => {
    moveKpiCard(key, direction);
  }, [moveKpiCard]);
  const moveQualityKpiCard = useCallback((key: QualityKpiCardKey, direction: "left" | "right") => {
    moveKpiCard(key, direction);
  }, [moveKpiCard]);

  return {
    customizing,
    setCustomizing,
    toggleSection,
    moveSection,
    moveKpiCard,
    moveCoreKpiCard,
    moveCoverageKpiCard,
    moveQualityKpiCard,
    setGridLayout,
    gridLayout,
    reset,
    visibleKeys,
    orderedKeys,
    kpiCardOrder: allCards,
    coreKpiCardOrder,
    coverageKpiCardOrder,
    qualityKpiCardOrder,
    allKeys: DEFAULT_SKU_ORDER,
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