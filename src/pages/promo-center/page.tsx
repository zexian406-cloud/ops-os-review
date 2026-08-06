import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams, Navigate } from "react-router-dom";
import { db, getAllShops } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import PageLayoutCustomizer from "@/components/layout/PageLayoutCustomizer";
import { usePageLayout } from "@/hooks/usePageLayout";
import { computeAll, getEffectivePromoCost, aggregateWeeklyCosts } from "@/domain/calculator";
import type {
  ManualPromotion, ManualPromoType, Promotion, PromotionType, Shop, SkuMaster, DailySnapshot,
} from "@/domain/types";

/* ──────────────────────────────────────────── */
/* 常量 & 工具函数                              */
/* ──────────────────────────────────────────── */

const PROMO_TYPES: { value: PromotionType; label: string }[] = [
  { value: "BD", label: "BD (Best Deal)" },
  { value: "LD", label: "LD (Lightning Deal)" },
  { value: "Coupon", label: "Coupon" },
  { value: "Price Discount", label: "Price Discount" },
  { value: "Promotion", label: "Promotion" },
  { value: "custom", label: "自定义" },
];

const promoTypeLabel = (t: PromotionType, customName?: string): string => {
  if (t === "custom") return customName?.trim() || "自定义";
  return PROMO_TYPES.find((p) => p.value === t)?.label ?? t;
};

const MANUAL_TYPES: { value: ManualPromoType; label: string; icon: string }[] = [
  { value: "coupon", label: "优惠券", icon: "ri-coupon-3-line" },
  { value: "flash_sale", label: "秒杀", icon: "ri-flashlight-line" },
  { value: "offsite_discount", label: "站外折扣", icon: "ri-earth-line" },
  { value: "other", label: "其他", icon: "ri-more-line" },
];

const MANUAL_TYPE_LABEL: Record<ManualPromoType, string> = {
  coupon: "优惠券", flash_sale: "秒杀", offsite_discount: "站外折扣", other: "其他",
};

const MANUAL_TYPE_TONE: Record<ManualPromoType, "primary" | "accent" | "warn" | "secondary"> = {
  coupon: "primary", flash_sale: "warn", offsite_discount: "accent", other: "secondary",
};

const uid = () => Math.random().toString(36).slice(2, 10);

type Tab = "activity" | "cost" | "timeline";

/* ──────────────────────────────────────────── */
/* 主页面组件                                   */
/* ──────────────────────────────────────────── */

export default function PromoCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefilledSku = searchParams.get("sku") ?? "";

  // 兼容旧路由：/promotions 和 /promo-cost 带 ?tab= 参数时自动切换
  const initialTab = (searchParams.get("tab") as Tab) ?? "activity";
  const [tab, setTabState] = useState<Tab>(initialTab);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // 自定义布局
  const {
    customizing, setCustomizing, toggleSection, moveSection, reset: resetLayout,
    visibleKeys, orderedKeys, allKeys,
  } = usePageLayout("promo-center");

  // 数据
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [manualPromotions, setManualPromotions] = useState<ManualPromotion[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [s, p, mp, snap, allShops] = await Promise.all([
      db.skuMaster.toArray(),
      db.promotions.toArray(),
      db.manualPromotions.toArray(),
      db.dailySnapshot.toArray(),
      getAllShops(),
    ]);
    setSkus(s);
    setPromotions(p);
    setManualPromotions(mp);
    setSnapshots(snap);
    setShops(allShops);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // SKU / 快照 / 店铺 map
  const skuMap = useMemo(() => new Map(skus.map((s) => [s.sku, s])), [skus]);
  const snapMap = useMemo(() => {
    const map = new Map<string, DailySnapshot>();
    for (const s of snapshots) {
      const ex = map.get(s.sku);
      if (!ex || s.date > ex.date) map.set(s.sku, s);
    }
    return map;
  }, [snapshots]);

  const shopNameMap = useMemo(() => {
    const map = new Map<string, string>();
    shops.forEach((s) => { map.set(s.id, s.name); map.set(s.name, s.id); });
    return map;
  }, [shops]);

  const getShopName = (storeId: string): string => shopNameMap.get(storeId) ?? storeId;

  const flash = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); }, []);
  const reload = useCallback(() => loadData(), [loadData]);

  // 汇总 KPI
  const summary = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const active = promotions.filter((p) => p.status === "active").length;
    const upcoming = promotions.filter((p) => p.status === "upcoming").length;
    const now = new Date();
    let thisWeekCost = 0;
    const allPromoCosts: Array<{ startDate: string; endDate: string; cost: number }> = [];
    for (const p of promotions) {
      const pc = getEffectivePromoCost(p, skuMap.get(p.sku), snapMap.get(p.sku));
      if (pc > 0) {
        allPromoCosts.push({ startDate: p.startDate, endDate: p.endDate, cost: pc });
        const s = new Date(p.startDate);
        const e = new Date(p.endDate);
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        if (!(e < weekStart || s > weekEnd)) thisWeekCost += pc;
      }
    }
    for (const m of manualPromotions) {
      const cost = m.costMode === "amount" ? (m.amount ?? 0) : (m.estimatedCost ?? 0);
      if (cost > 0) {
        allPromoCosts.push({ startDate: m.startDate, endDate: m.endDate, cost });
        const s = new Date(m.startDate);
        const e = new Date(m.endDate);
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        if (!(e < weekStart || s > weekEnd)) thisWeekCost += cost;
      }
    }
    const avgMarginActive = (() => {
      const actives = promotions.filter((p) => p.status === "active" || p.status === "upcoming");
      if (actives.length === 0) return 0;
      let totalMargin = 0;
      let count = 0;
      for (const p of actives) {
        const sku = skuMap.get(p.sku);
        const snap = snapMap.get(p.sku);
        if (!sku || !snap) continue;
        const pc = getEffectivePromoCost(p, sku, snap);
        const calc = computeAll({ sku, snap, activePromo: p, promoCost: pc });
        totalMargin += calc.grossMargin;
        count++;
      }
      return count > 0 ? totalMargin / count : 0;
    })();

    return { activeCount: active, upcomingCount: upcoming, thisWeekCost, avgMarginActive, totalRecords: promotions.length + manualPromotions.length };
  }, [promotions, manualPromotions, skuMap, snapMap]);

  // 周成本时间线数据
  const weeklyBuckets = useMemo(() => aggregateWeeklyCosts(promotions, manualPromotions, skuMap, snapMap), [promotions, manualPromotions, skuMap, snapMap]);

  // 自然订单/广告订单 占比（来自 DailySnapshot 的 adRatio 推导）
  // adRatio = adSpend / revenue; 假设自然订单占比 ≈ (1 - adRatio/100) 的近似指标，或直接展示 adRatio 作为广告贡献
  // 若后续有显式 organicOrder / adOrder 列，则按实际数据展示。

  return (
    <div className="space-y-6">
      {/* ── 标题 & 操作栏 ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
            Promotion Operation Center
          </div>
          <h1 className="font-heading text-[26px] font-bold text-foreground-950">促销运营中心</h1>
          <p className="text-[13px] text-foreground-500">
            活动管理 · 成本录入 · 时间线一览 — 一次录入，全局联动，自动汇入总成本公式
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCustomizing(!customizing)}
          className="flex items-center gap-1.5 rounded-[9px] border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-800 cursor-pointer"
        >
          <i className={customizing ? "ri-close-line" : "ri-layout-masonry-line"} aria-hidden />
          {customizing ? "关闭设置" : "自定义布局"}
        </button>
      </div>

      {customizing && (
        <PageLayoutCustomizer
          pageId="promo-center"
          visibleKeys={visibleKeys}
          orderedKeys={orderedKeys}
          allKeys={allKeys}
          toggle={toggleSection}
          move={moveSection}
          onClose={() => setCustomizing(false)}
          onReset={resetLayout}
        />
      )}

      {/* ── KPI 汇总卡片 ── */}
      {(visibleKeys.length === 0 || visibleKeys.includes("summaryCards")) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700">
                <i className="ri-flashlight-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">进行中活动</div>
                <div className="font-heading text-[20px] font-bold text-foreground-950">{summary.activeCount}</div>
              </div>
            </div>
          </div>
          <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-100 text-[14px] text-accent-700">
                <i className="ri-calendar-event-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">待开始活动</div>
                <div className="font-heading text-[20px] font-bold text-foreground-950">{summary.upcomingCount}</div>
              </div>
            </div>
          </div>
          <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary-100 text-[14px] text-secondary-700">
                <i className="ri-money-dollar-circle-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">本周促销成本</div>
                <div className="font-heading text-[20px] font-bold text-accent-700">${summary.thisWeekCost.toFixed(2)}</div>
              </div>
            </div>
          </div>
          <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700">
                <i className="ri-line-chart-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">平均利润率(含成本)</div>
                <div className={`font-heading text-[20px] font-bold ${summary.avgMarginActive >= 10 ? "text-primary-700" : summary.avgMarginActive >= 0 ? "text-foreground-800" : "text-red-600"}`}>
                  {summary.avgMarginActive.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div className={[
          "rounded-md px-3 py-1.5 text-[12px]",
          msg.includes("请填写") || msg.includes("缺失") ? "border border-red-200 bg-red-50 text-red-800" : "border border-accent-200 bg-accent-100/60 text-accent-900",
        ].join(" ")}>
          {msg}
        </div>
      )}

      {/* ── Tab 切换 ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
        {[
          { key: "activity" as Tab, label: "活动管理", icon: "ri-flashlight-line" },
          { key: "cost" as Tab, label: "促销成本", icon: "ri-coupon-3-line" },
          { key: "timeline" as Tab, label: "促销时间线", icon: "ri-timeline-view" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
              tab === t.key
                ? "bg-primary-500 text-background-50"
                : "text-foreground-600 hover:text-foreground-900",
            ].join(" ")}
          >
            <i className={t.icon} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: 活动管理 ── */}
      {tab === "activity" && (visibleKeys.length === 0 || visibleKeys.includes("activityTab")) && (
        <ActivitySection
          promotions={promotions}
          skus={skus}
          skuMap={skuMap}
          snapMap={snapMap}
          shops={shops}
          shopNameMap={shopNameMap}
          getShopName={getShopName}
          prefilledSku={prefilledSku}
          reload={reload}
          flash={flash}
          visibleKeys={visibleKeys}
        />
      )}

      {/* ── Tab 2: 促销成本 ── */}
      {tab === "cost" && (visibleKeys.length === 0 || visibleKeys.includes("costTab")) && (
        <CostSection
          manualPromotions={manualPromotions}
          promotions={promotions}
          skus={skus}
          skuMap={skuMap}
          snapMap={snapMap}
          shops={shops}
          shopNameMap={shopNameMap}
          prefilledSku={prefilledSku}
          reload={reload}
          flash={flash}
          visibleKeys={visibleKeys}
        />
      )}

      {/* ── Tab 3: 促销时间线 ── */}
      {tab === "timeline" && (visibleKeys.length === 0 || visibleKeys.includes("timelineTab")) && (
        <TimelineSection
          buckets={weeklyBuckets}
          promotions={promotions}
          manualPromotions={manualPromotions}
          skuMap={skuMap}
          snapMap={snapMap}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────── */
/* Tab 1: 活动管理（内嵌成本字段）              */
/* ──────────────────────────────────────────── */

function ActivitySection(props: {
  promotions: Promotion[];
  skus: SkuMaster[];
  skuMap: Map<string, SkuMaster>;
  snapMap: Map<string, DailySnapshot>;
  shops: Shop[];
  shopNameMap: Map<string, string>;
  getShopName: (s: string) => string;
  prefilledSku: string;
  reload: () => void;
  flash: (m: string) => void;
  visibleKeys: string[];
}) {
  const { promotions, skus, skuMap, snapMap, prefilledSku, reload, flash, getShopName } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Promotion["status"] | "all">("all");
  const [typeFilter, setTypeFilter] = useState<PromotionType | "all">("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSkus, setBulkSkus] = useState<Set<string>>(new Set());
  /** 批量模式下每个 SKU 的独立覆盖项（折扣价/MSKU），key = sku */
  const [bulkOverrides, setBulkOverrides] = useState<Record<string, { discountPrice?: number; msku?: string }>>({});

  const stores = useMemo(() => {
    const shopMap = new Map(props.shops.map((s) => [s.id, s.name]));
    const rawStores = new Set<string>();
    promotions.forEach((p) => { if (p.store) rawStores.add(p.store); });
    const result = new Set<string>();
    for (const raw of rawStores) {
      const name = shopMap.get(raw);
      result.add(name ?? raw);
    }
    return Array.from(result).sort();
  }, [props.shops, promotions]);

  const [form, setForm] = useState<Partial<Promotion> & { costMode?: "amount" | "rate"; amount?: number; rate?: number }>({
    type: "BD", status: "upcoming", sku: prefilledSku, costMode: "amount",
  });

  const filtered = useMemo(() => {
    let list = promotions;
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    if (storeFilter !== "all") {
      const storeId = props.shopNameMap.get(storeFilter) ?? storeFilter;
      list = list.filter((p) => p.store === storeId);
    }
    return list.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [promotions, statusFilter, typeFilter, storeFilter, props.shopNameMap]);

  const metrics = useMemo(() => {
    const m = new Map<string, { margin: number; profit: number; adRatio: number; promoCost: number }>();
    for (const p of promotions) {
      const sku = skuMap.get(p.sku);
      const snap = snapMap.get(p.sku);
      if (!sku || !snap) continue;
      const pc = getEffectivePromoCost(p, sku, snap);
      const calc = computeAll({ sku, snap, activePromo: p, promoCost: pc });
      m.set(p.id, { margin: calc.grossMargin, profit: calc.grossProfit, adRatio: calc.adRatio, promoCost: pc });
    }
    return m;
  }, [promotions, skuMap, snapMap]);

  const rateEstimate = useMemo(() => {
    if (form.costMode !== "rate" || !form.sku || !form.rate) return null;
    const sku = skuMap.get(form.sku);
    const snap = snapMap.get(form.sku);
    if (!sku) return null;
    const weeklySales = (snap?.dailySales7d ?? 0) * 7;
    if (weeklySales <= 0) return { cost: null as number | null, hint: "周销量缺失，无法预估" };
    return { cost: Number(((form.rate / 100) * sku.price * weeklySales).toFixed(2)), hint: "" };
  }, [form.costMode, form.sku, form.rate, skuMap, snapMap]);

  const submit = async () => {
    // 逐项校验，明确提示缺失字段
    const missing: string[] = [];
    if (bulkMode) {
      if (bulkSkus.size === 0) missing.push("至少勾选一个 SKU");
    } else {
      if (!form.sku) missing.push("SKU");
    }
    if (!form.startDate) missing.push("开始日期");
    if (!form.endDate) missing.push("结束日期");
    if (missing.length > 0) {
      flash(`请填写：${missing.join("、")}`);
      return;
    }
    const sku = skuMap.get(form.sku);
    if (editingId) {
      const existing = promotions.find((p) => p.id === editingId);
      if (existing) {
        await db.promotions.put({
          ...existing, ...form,
          skuName: sku?.name ?? existing.skuName,
          store: sku?.store ?? existing.store,
          customTypeName: form.type === "custom" ? form.customTypeName : undefined,
          msku: form.msku,
        } as Promotion);
        flash("活动已更新");
      }
    } else if (bulkMode && bulkSkus.size > 0) {
      const rows: Promotion[] = [];
      for (const s of bulkSkus) {
        const sk = skuMap.get(s);
        const ov = bulkOverrides[s] ?? {};
        rows.push({
          id: uid(),
          sku: s, skuName: sk?.name, store: sk?.store ?? "-",
          type: form.type ?? "BD",
          customTypeName: form.type === "custom" ? form.customTypeName : undefined,
          name: form.name?.trim() || `${form.type ?? "BD"} ${s}`,
          startDate: form.startDate!, endDate: form.endDate!,
          status: form.status ?? "upcoming", notes: form.notes,
          msku: ov.msku,
          multiplier: form.multiplier,
          discountPrice: ov.discountPrice,
          costMode: form.costMode,
          amount: form.costMode === "amount" ? form.amount : undefined,
          rate: form.costMode === "rate" ? form.rate : undefined,
          estimatedCost: form.costMode === "rate" && sk ? Number(((form.rate! / 100) * sk.price * ((snapMap.get(s)?.dailySales7d ?? 0) * 7)).toFixed(2)) : undefined,
        });
      }
      await db.promotions.bulkPut(rows);
      flash(`已批量添加 ${rows.length} 条活动`);
      setBulkSkus(new Set());
      setBulkMode(false);
    } else {
      await db.promotions.put({
        id: uid(),
        sku: form.sku!, skuName: sku?.name, store: sku?.store ?? "-",
        type: form.type ?? "BD",
        customTypeName: form.type === "custom" ? form.customTypeName : undefined,
        name: form.name?.trim() || `${form.type ?? "BD"} ${form.sku}`, startDate: form.startDate!, endDate: form.endDate!,
        status: form.status ?? "upcoming", notes: form.notes,
        msku: form.msku,
        multiplier: form.multiplier, discountPrice: form.discountPrice,
        costMode: form.costMode,
        amount: form.costMode === "amount" ? form.amount : undefined,
        rate: form.costMode === "rate" ? form.rate : undefined,
        estimatedCost: form.costMode === "rate" && sku ? Number(((form.rate! / 100) * sku.price * ((snap?.dailySales7d ?? 0) * 7)).toFixed(2)) : undefined,
      } as Promotion);
      flash("活动已添加");
    }
    setEditingId(null);
    setForm({ type: "BD", status: "upcoming", costMode: "amount", sku: "" });
    reload();
  };

  const edit = (p: Promotion) => {
    setEditingId(p.id);
    setForm({ ...p, costMode: p.costMode ?? "amount", amount: p.amount, rate: p.rate });
  };
  const del = async (id: string) => {
    await db.promotions.delete(id);
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    flash("已删除");
    reload();
  };
  const batchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 条活动吗？`)) return;
    await db.promotions.bulkDelete(Array.from(selected));
    setSelected(new Set());
    flash(`已批量删除`);
    reload();
  };
  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };
  const toggleBulkSku = (sku: string) => {
    setBulkSkus((prev) => {
      const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n;
    });
    setBulkOverrides((prev) => {
      const n = { ...prev };
      if (n[sku]) delete n[sku];
      return n;
    });
  };

  const statusCounts = useMemo(() => {
    const counts = { all: promotions.length, upcoming: 0, active: 0, ended: 0 };
    promotions.forEach((p) => { if (counts[p.status] !== undefined) counts[p.status]++; });
    return counts;
  }, [promotions]);

  const snap = form.sku ? snapMap.get(form.sku) : undefined;

  return (
    <div className="space-y-5">
      {/* 新增/编辑活动 */}
      {(props.visibleKeys.length === 0 || props.visibleKeys.includes("activityForm")) && (
        <Section
          title={editingId ? "编辑活动" : bulkMode ? "批量添加活动" : "新增活动"}
          icon="ri-add-circle-line"
          subtitle={bulkMode ? "勾选多个 SKU，一次添加同一促销活动" : "选择单个 SKU 添加促销活动，折扣价决定利润率计算，成本字段自动汇入总成本公式"}
          action={
            <button
              type="button"
              onClick={() => { setBulkMode(!bulkMode); setBulkSkus(new Set()); setEditingId(null); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-700 hover:bg-background-200 cursor-pointer whitespace-nowrap"
            >
              <i className={bulkMode ? "ri-checkbox-indeterminate-line" : "ri-checkbox-multiple-line"} aria-hidden />
              {bulkMode ? "退出批量模式" : "批量添加"}
            </button>
          }
        >
          <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
            {bulkMode && (
              <>
                <div className="mb-3 text-[13px] font-semibold text-foreground-800">
                  选择要参加促销的 SKU（已选 {bulkSkus.size} 个）
                </div>
                <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-background-200/70 bg-background-50 p-3 md:grid-cols-3 lg:grid-cols-4">
                  {skus.map((s) => (
                    <label
                      key={s.sku}
                      className={[
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors",
                        bulkSkus.has(s.sku) ? "bg-primary-100 text-primary-900" : "hover:bg-background-100 text-foreground-700",
                      ].join(" ")}
                    >
                      <input type="checkbox" checked={bulkSkus.has(s.sku)} onChange={() => toggleBulkSku(s.sku)} className="h-3.5 w-3.5 rounded accent-primary-500 cursor-pointer" />
                      <span className="truncate">{s.sku}</span>
                      <span className="truncate text-foreground-500">{s.name}</span>
                    </label>
                  ))}
                </div>
                {/* 选中 SKU 的独立配置：每个 SKU 可单独填折扣价和选择 MSKU */}
                {bulkSkus.size > 0 && (
                  <div className="mt-3 rounded-lg border border-background-200/70 bg-background-50 p-3">
                    <div className="mb-2 text-[12px] font-medium text-foreground-700">
                      各 SKU 独立配置（折扣售价、MSKU 可不同）
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-background-200 text-left text-[11px] text-foreground-500">
                            <th className="py-1.5 pr-2 font-medium">SKU</th>
                            <th className="py-1.5 pr-2 font-medium">原售价</th>
                            <th className="py-1.5 pr-2 font-medium">折扣售价</th>
                            <th className="py-1.5 pr-2 font-medium">MSKU</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(bulkSkus).map((s) => {
                            const sk = skuMap.get(s);
                            const ov = bulkOverrides[s] ?? {};
                            const mskuKeys = sk?.mskuMetrics ? Object.keys(sk.mskuMetrics) : [];
                            return (
                              <tr key={s} className="border-b border-background-200/50">
                                <td className="py-1.5 pr-2 font-medium text-foreground-800">{s}</td>
                                <td className="py-1.5 pr-2 text-foreground-500">${sk?.price?.toFixed(2) ?? "-"}</td>
                                <td className="py-1.5 pr-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="可选"
                                    value={ov.discountPrice ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value ? Number(e.target.value) : undefined;
                                      setBulkOverrides((prev) => ({ ...prev, [s]: { ...prev[s], discountPrice: v }}));
                                    }}
                                    className="w-24 rounded border border-background-300/70 bg-background-50 px-2 py-1 text-[12px] focus:border-primary-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-1.5 pr-2">
                                  {mskuKeys.length > 0 ? (
                                    <select
                                      value={ov.msku ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value || undefined;
                                        setBulkOverrides((prev) => ({ ...prev, [s]: { ...prev[s], msku: v }}));
                                      }}
                                      className="rounded border border-background-300/70 bg-background-50 px-2 py-1 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer"
                                    >
                                      <option value="">全部</option>
                                      {mskuKeys.map((m) => (<option key={m} value={m}>{m}</option>))}
                                    </select>
                                  ) : (
                                    <span className="text-foreground-300">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className={`${bulkMode ? "mt-4" : ""} grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7`}>
              {!bulkMode && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">SKU <span className="text-red-500">*</span></label>
                  <select
                    value={form.sku ?? ""}
                    onChange={(e) => {
                      const s = skus.find((k) => k.sku === e.target.value);
                      setForm({ ...form, sku: e.target.value, skuName: s?.name, store: s?.store, msku: undefined });
                    }}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">选择 SKU</option>
                    {skus.map((s) => (<option key={s.sku} value={s.sku}>{s.sku} — {s.name}</option>))}
                  </select>
                  {/* MSKU 子链接选择：仅当选中的 SKU 有 mskuMetrics 时显示 */}
                  {(() => {
                    const sku = skus.find((k) => k.sku === form.sku);
                    const mskuKeys = sku?.mskuMetrics ? Object.keys(sku.mskuMetrics) : [];
                    if (mskuKeys.length === 0) return null;
                    return (
                      <div className="mt-1">
                        <label className="block text-[10px] font-medium text-foreground-500">MSKU (可选，针对子链接促销)</label>
                        <select
                          value={form.msku ?? ""}
                          onChange={(e) => setForm({ ...form, msku: e.target.value || undefined })}
                          className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">全部 (父 SKU)</option>
                          {mskuKeys.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">类型</label>
                <select
                  value={form.type ?? "BD"}
                  onChange={(e) => setForm({ ...form, type: e.target.value as PromotionType })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
                >
                  {PROMO_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </select>
                {form.type === "custom" && (
                  <input
                    className="mt-1 w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-[11px] focus:border-primary-500 focus:outline-none"
                    value={form.customTypeName ?? ""}
                    onChange={(e) => setForm({ ...form, customTypeName: e.target.value })}
                    placeholder="自定义类型名，如 7DD / DOTD"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">活动名称</label>
                <input
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如 Prime Day BD"
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
              </div>
              {!bulkMode && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">折扣售价 ($)</label>
                  <input
                    type="number" step="0.01"
                    value={form.discountPrice ?? ""}
                    onChange={(e) => setForm({ ...form, discountPrice: Number(e.target.value) || undefined })}
                    placeholder="19.99"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">开始日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.startDate ?? ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">结束日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.endDate ?? ""} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button" onClick={submit}
                  disabled={bulkMode && bulkSkus.size === 0 && !editingId}
                  className="inline-flex items-center gap-1 rounded-[9px] bg-primary-500 px-4 py-1.5 text-[12px] font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line" aria-hidden />
                  {editingId ? "保存修改" : bulkMode ? `批量添加 (${bulkSkus.size})` : "添加活动"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setForm({ type: "BD", status: "upcoming", costMode: "amount", sku: "" }); }}
                    className="rounded-[9px] border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] text-foreground-600 hover:bg-background-100 cursor-pointer"
                  >取消</button>
                )}
              </div>
            </div>

            {/* 成本 + 附加字段 */}
            <div className="mt-4 pt-3 border-t border-background-200/70">
              <div className="text-[11px] font-medium text-foreground-500 mb-2">促销成本 · 自动汇入总成本公式</div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">成本模式</label>
                  <div className="flex rounded-md border border-background-300/70 bg-background-50 p-0.5">
                    <button type="button" onClick={() => setForm({ ...form, costMode: "amount", rate: undefined })}
                      className={`flex-1 rounded py-1 text-[11px] font-medium cursor-pointer transition-colors ${form.costMode === "amount" || !form.costMode ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"}`}>金额</button>
                    <button type="button" onClick={() => setForm({ ...form, costMode: "rate", amount: undefined })}
                      className={`flex-1 rounded py-1 text-[11px] font-medium cursor-pointer transition-colors ${form.costMode === "rate" ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"}`}>折扣率</button>
                  </div>
                </div>
                {form.costMode === "rate" ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground-500">折扣率 (%)</label>
                    <input type="number" step="1" min="0" max="100" value={form.rate ?? ""}
                      onChange={(e) => setForm({ ...form, rate: Number(e.target.value) || undefined })}
                      placeholder="如 20"
                      className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
                    <div className="mt-0.5 text-[10px] text-foreground-400">按 折扣率% × 售价 × 周销量 估算</div>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground-500">促销成本 ($)</label>
                    <input type="number" step="0.01" min="0" value={form.amount ?? ""}
                      onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || undefined })}
                      placeholder="如 85.00"
                      className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
                  </div>
                )}
                {form.costMode === "rate" && rateEstimate && (
                  <div className="md:col-span-2 flex items-end">
                    <div className="text-[12px]">
                      {rateEstimate.cost != null ? (
                        <span className="text-foreground-700">预估周成本：<b className="font-semibold text-accent-700">${rateEstimate.cost}</b>
                          <span className="ml-1 text-foreground-500">（{form.rate}% × ${(skuMap.get(form.sku!)?.price ?? 0).toFixed(2)} × {Math.round((snap?.dailySales7d ?? 0) * 7)} 件）</span>
                        </span>
                      ) : (
                        <span className="text-red-600">{rateEstimate.hint}</span>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">销量倍率</label>
                  <input type="number" step="0.1" value={form.multiplier ?? ""}
                    onChange={(e) => setForm({ ...form, multiplier: Number(e.target.value) || undefined })}
                    placeholder="如 2.5"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">状态</label>
                  <select value={form.status ?? "upcoming"}
                    onChange={(e) => setForm({ ...form, status: e.target.value as Promotion["status"] })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
                  >
                    <option value="upcoming">待开始</option>
                    <option value="active">进行中</option>
                    <option value="ended">已结束</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">备注</label>
                  <input value={form.notes ?? ""}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="如：注意库存、提前调广告预算"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* 已有活动列表 */}
      {(props.visibleKeys.length === 0 || props.visibleKeys.includes("activityList")) && (
        <Section
          title="已有促销活动"
          icon="ri-flashlight-line"
          subtitle={`共 ${filtered.length} 条${selected.size > 0 ? ` · 已选 ${selected.size} 条` : ""}`}
          action={selected.size > 0 ? (
            <button type="button" onClick={batchDelete}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-100 cursor-pointer whitespace-nowrap">
              <i className="ri-delete-bin-line" aria-hidden /> 批量删除 ({selected.size})
            </button>
          ) : null}
        >
          {/* 状态 + 类型 + 店铺 filter */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
            {[
              { key: "all" as const, label: `全部 (${statusCounts.all})` },
              { key: "upcoming" as const, label: `待开始 (${statusCounts.upcoming})` },
              { key: "active" as const, label: `进行中 (${statusCounts.active})` },
              { key: "ended" as const, label: `已结束 (${statusCounts.ended})` },
            ].map((t) => (
              <button key={t.key} type="button" onClick={() => setStatusFilter(t.key)}
                className={[
                  "rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                  statusFilter === t.key ? "bg-primary-500 text-background-50" : "text-foreground-600 hover:text-foreground-900",
                ].join(" ")}>
                {t.label}
              </button>
            ))}
            <span className="mx-2 h-5 w-px bg-background-300/70" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as PromotionType | "all")}
              className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1 text-[12px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="all">全部类型</option>
              {PROMO_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}
              className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1 text-[12px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="all">全部店铺</option>
              {stores.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                  <th className="border-b border-background-200 px-2 py-2.5 w-8">
                    <input type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded accent-primary-500 cursor-pointer" />
                  </th>
                  <th className="border-b border-background-200 px-2 py-2.5">SKU</th>
                  <th className="border-b border-background-200 px-2 py-2.5">MSKU</th>
                  <th className="border-b border-background-200 px-2 py-2.5">品名</th>
                  <th className="border-b border-background-200 px-2 py-2.5">类型</th>
                  <th className="border-b border-background-200 px-2 py-2.5">名称</th>
                  <th className="border-b border-background-200 px-2 py-2.5">店铺</th>
                  <th className="border-b border-background-200 px-2 py-2.5">日期</th>
                  <th className="border-b border-background-200 px-2 py-2.5">状态</th>
                  <th className="border-b border-background-200 px-2 py-2.5 text-right">正常价</th>
                  <th className="border-b border-background-200 px-2 py-2.5 text-right">折扣价</th>
                  <th className="border-b border-background-200 px-2 py-2.5 text-right">促销成本</th>
                  <th className="border-b border-background-200 px-2 py-2.5 text-right">利润率</th>
                  <th className="border-b border-background-200 px-2 py-2.5 text-right">广告费比</th>
                  <th className="border-b border-background-200 px-2 py-2.5">备注</th>
                  <th className="border-b border-background-200 px-2 py-2.5 w-20 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-3 py-10 text-center text-[12px] text-foreground-500">暂无促销活动，上方添加第一个</td>
                  </tr>
                ) : filtered.map((p) => {
                  const m = metrics.get(p.id);
                  const sku = skuMap.get(p.sku);
                  return (
                    <tr key={p.id}
                      className={["hover:bg-background-100/60", selected.has(p.id) ? "bg-primary-50/60" : ""].join(" ")}>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)}
                          className="h-3.5 w-3.5 rounded accent-primary-500 cursor-pointer" />
                      </td>
                      <td className="mono-num border-b border-background-200/70 px-2 py-1.5 text-[11px] text-foreground-600">
                        <Link to={`/sku/${encodeURIComponent(p.sku)}`} className="hover:text-primary-700 hover:underline cursor-pointer">{p.sku}</Link>
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 text-[11px] text-foreground-600">
                        {p.msku ? <span className="rounded bg-primary-100 px-1.5 py-0.5 text-primary-700">{p.msku}</span> : <span className="text-foreground-300">—</span>}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 font-medium text-foreground-900">{p.skuName}</td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <>
                            <select value={p.type}
                              onChange={(e) => db.promotions.put({ ...p, type: e.target.value as PromotionType, customTypeName: e.target.value === "custom" ? p.customTypeName : undefined }).then(() => reload())}
                              className="w-20 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer">
                              {PROMO_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.value}</option>))}
                            </select>
                            {p.type === "custom" && (
                              <input value={p.customTypeName ?? ""}
                                onChange={(e) => db.promotions.put({ ...p, customTypeName: e.target.value }).then(() => reload())}
                                className="mt-1 w-20 rounded-md border border-background-300/70 bg-background-50 px-1 py-0.5 text-[10px]" />
                            )}
                          </>
                        ) : <span className="text-[12px] font-medium text-foreground-800">{promoTypeLabel(p.type, p.customTypeName)}</span>}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <input value={p.name}
                            onChange={(e) => db.promotions.put({ ...p, name: e.target.value }).then(() => reload())}
                            className="w-full min-w-[80px] rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[12px] focus:border-primary-500 focus:outline-none" />
                        ) : <span className="text-[12px] font-medium text-foreground-800">{p.name}</span>}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 text-[12px] text-foreground-600">{getShopName(p.store)}</td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <div className="flex flex-col text-[11px]">
                            <input type="date" value={p.startDate}
                              onChange={(e) => db.promotions.put({ ...p, startDate: e.target.value }).then(() => reload())}
                              className="w-28 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none" />
                            <input type="date" value={p.endDate}
                              onChange={(e) => db.promotions.put({ ...p, endDate: e.target.value }).then(() => reload())}
                              className="mt-1 w-28 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none" />
                          </div>
                        ) : (
                          <div className="flex flex-col text-[11px] text-foreground-700">
                            <span>{p.startDate}</span>
                            <span className="text-foreground-500">至 {p.endDate}</span>
                          </div>
                        )}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <select value={p.status}
                            onChange={(e) => db.promotions.put({ ...p, status: e.target.value as Promotion["status"] }).then(() => reload())}
                            className="w-20 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer">
                            <option value="upcoming">待开始</option>
                            <option value="active">进行中</option>
                            <option value="ended">已结束</option>
                          </select>
                        ) : (
                          <Badge tone={p.status === "active" ? "accent" : p.status === "upcoming" ? "primary" : "secondary"}>
                            {p.status === "active" ? "进行中" : p.status === "upcoming" ? "待开始" : "已结束"}
                          </Badge>
                        )}
                      </td>
                      <td className="mono-num border-b border-background-200/70 px-2 py-1.5 text-right text-[12px] text-foreground-600">
                        ${(sku?.price ?? 0).toFixed(2)}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 text-right">
                        {editingId === p.id ? (
                          <input type="number" step="0.01" value={p.discountPrice ?? ""}
                            onChange={(e) => db.promotions.put({ ...p, discountPrice: Number(e.target.value) || undefined }).then(() => reload())}
                            placeholder="-"
                            className="w-20 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-right text-[12px] focus:border-primary-500 focus:outline-none" />
                        ) : (
                          <span className="mono-num text-[12px] font-medium text-foreground-800">
                            {p.discountPrice != null ? `$${p.discountPrice.toFixed(2)}` : "-"}
                          </span>
                        )}
                      </td>
                      <td className="mono-num border-b border-background-200/70 px-2 py-1.5 text-right text-[12px]">
                        {editingId === p.id ? (
                          <select value={p.costMode ?? "amount"}
                            onChange={(e) => db.promotions.put({ ...p, costMode: e.target.value as "amount" | "rate" }).then(() => reload())}
                            className="w-16 rounded-md border border-background-300/70 bg-background-50 px-1 py-0.5 text-[10px] cursor-pointer">
                            <option value="amount">金额</option>
                            <option value="rate">折扣率</option>
                          </select>
                        ) : (
                          <span className={m && m.promoCost > 0 ? "text-secondary-700 font-semibold" : "text-foreground-500"}>
                            {p.costMode === "amount" && p.amount ? `$${p.amount.toFixed(2)}` : p.costMode === "rate" && p.rate ? `${p.rate}%` : m && m.promoCost > 0 ? `$${m.promoCost.toFixed(2)}` : "-"}
                          </span>
                        )}
                      </td>
                      <td className={`mono-num border-b border-background-200/70 px-2 py-1.5 text-right font-semibold text-[12px] ${m && m.margin >= 10 ? 'text-primary-700' : m && m.margin >= 0 ? 'text-foreground-700' : 'text-red-600'}`}>
                        {m ? `${m.margin.toFixed(1)}%` : "-"}
                      </td>
                      <td className={`mono-num border-b border-background-200/70 px-2 py-1.5 text-right text-[12px] ${m && m.adRatio > 25 ? 'text-red-600' : 'text-foreground-600'}`}>
                        {m ? `${m.adRatio.toFixed(1)}%` : "-"}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <input value={p.notes ?? ""}
                            onChange={(e) => db.promotions.put({ ...p, notes: e.target.value }).then(() => reload())}
                            placeholder="备注"
                            className="w-full min-w-[80px] rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none" />
                        ) : <span className="text-[11px] text-foreground-500">{p.notes || "-"}</span>}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {editingId === p.id ? (
                            <button type="button" onClick={() => setEditingId(null)}
                              className="inline-flex h-7 items-center gap-1 rounded-[9px] bg-primary-500 px-2 text-[11px] font-medium text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                              title="完成编辑">
                              <i className="ri-check-line" aria-hidden /> 完成
                            </button>
                          ) : (
                            <button type="button" onClick={() => edit(p)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-foreground-400 hover:text-primary-600 hover:bg-background-100 cursor-pointer"
                              title="编辑">
                              <i className="ri-edit-line" aria-hidden />
                            </button>
                          )}
                          <button type="button" onClick={() => { if (editingId === p.id) setEditingId(null); del(p.id); }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-red-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                            title="删除">
                            <i className="ri-delete-bin-line" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-foreground-500">
            <Badge tone="accent">点编辑后修改</Badge>
            <span>默认只读防误触 · 点击行末铅笔图标进入编辑模式 · 利润率 =（折扣价 − 总成本 − 促销成本）÷ 折扣价</span>
          </div>
        </Section>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────── */
/* Tab 2: 促销成本（ManualPromotion + 内嵌成本） */
/* ──────────────────────────────────────────── */

function CostSection(props: {
  manualPromotions: ManualPromotion[];
  promotions: Promotion[];
  skus: SkuMaster[];
  skuMap: Map<string, SkuMaster>;
  snapMap: Map<string, DailySnapshot>;
  shops: Shop[];
  shopNameMap: Map<string, string>;
  prefilledSku: string;
  reload: () => void;
  flash: (m: string) => void;
  visibleKeys: string[];
}) {
  const { manualPromotions, promotions, skus, skuMap, snapMap, prefilledSku, reload, flash } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ManualPromoType | "all">("all");
  const [skuFilter, setSkuFilter] = useState("");
  const [shopFilter, setShopFilter] = useState<string>("all");

  const shops = useMemo(() => {
    const result = new Set<string>();
    for (const s of props.shops) result.add(s.name);
    return Array.from(result).sort();
  }, [props.shops]);

  const [form, setForm] = useState<{
    sku: string; type: ManualPromoType; startDate: string; endDate: string;
    costMode: "amount" | "rate"; amount: string; rate: string; notes: string;
  }>({
    sku: prefilledSku, type: "coupon", startDate: "", endDate: "",
    costMode: "amount", amount: "", rate: "", notes: "",
  });

  const filtered = useMemo(() => {
    let list = manualPromotions;
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    if (skuFilter) list = list.filter((p) => p.sku.toLowerCase().includes(skuFilter.toLowerCase()));
    if (shopFilter !== "all") {
      const shopId = props.shopNameMap.get(shopFilter) ?? shopFilter;
      list = list.filter((p) => { const sku = skuMap.get(p.sku); return sku && sku.store === shopId; });
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [manualPromotions, typeFilter, skuFilter, shopFilter, props.shopNameMap, skuMap]);

  // 统计 KPI
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeNow = manualPromotions.filter((p) => p.startDate <= todayStr && p.endDate >= todayStr).length;
    const upcoming = manualPromotions.filter((p) => p.startDate > todayStr).length;
    let activeTotal = 0;
    const now = new Date();
    for (const p of manualPromotions) {
      const start = new Date(p.startDate), end = new Date(p.endDate);
      if (end >= now) {
        if (p.costMode === "amount" && p.amount) activeTotal += p.amount;
        else if (p.costMode === "rate" && p.estimatedCost) activeTotal += p.estimatedCost;
      }
    }
    // 加上 promotions 内嵌成本
    for (const p of promotions) {
      const sku = skuMap.get(p.sku); const snap = snapMap.get(p.sku);
      const pc = getEffectivePromoCost(p, sku, snap);
      if (pc > 0) {
        const s = new Date(p.startDate), e = new Date(p.endDate);
        if (e >= now) activeTotal += pc;
      }
    }
    return { activeNow, upcoming, totalRecords: manualPromotions.length, activeTotal };
  }, [manualPromotions, promotions, skuMap, snapMap]);

  const addPromotion = async () => {
    if (!form.sku || !form.startDate || !form.endDate) { flash("请填写 SKU / 开始日期 / 结束日期"); return; }
    if (form.costMode === "amount" && (!form.amount || Number(form.amount) <= 0)) { flash("请填写促销成本金额"); return; }
    if (form.costMode === "rate" && (!form.rate || Number(form.rate) <= 0)) { flash("请填写折扣率"); return; }
    const found = skuMap.get(form.sku);
    const price = found?.price ?? 0;
    const snap = snapMap.get(form.sku);
    const weeklySales = (snap?.dailySales7d ?? 0) * 7;
    let estimatedCost: number | undefined;
    if (form.costMode === "rate" && form.rate && weeklySales > 0 && price > 0) {
      estimatedCost = Number(((Number(form.rate) / 100) * price * weeklySales).toFixed(2));
    }
    await db.manualPromotions.put({
      id: uid(), sku: form.sku, skuName: found?.name ?? form.sku,
      type: form.type, startDate: form.startDate, endDate: form.endDate,
      costMode: form.costMode,
      amount: form.costMode === "amount" ? Number(form.amount) : undefined,
      rate: form.costMode === "rate" ? Number(form.rate) : undefined,
      estimatedCost, notes: form.notes || undefined,
      createdAt: new Date().toISOString(),
    });
    flash(estimatedCost != null ? `已添加 · 预估成本 $${estimatedCost.toFixed(2)}` : "已添加");
    reload();
    setForm({ sku: "", type: "coupon", startDate: "", endDate: "", costMode: "amount", amount: "", rate: "", notes: "" });
  };

  const edit = (m: ManualPromotion) => {
    setEditingId(m.id);
    setForm({
      sku: m.sku, type: m.type, startDate: m.startDate, endDate: m.endDate,
      costMode: m.costMode, amount: m.amount?.toString() ?? "", rate: m.rate?.toString() ?? "", notes: m.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const cur = manualPromotions.find((m) => m.id === editingId);
    if (!cur) return;
    const next: ManualPromotion = {
      ...cur, ...form,
      amount: form.costMode === "amount" ? Number(form.amount) || undefined : undefined,
      rate: form.costMode === "rate" ? Number(form.rate) || undefined : undefined,
      updatedAt: new Date().toISOString(),
    };
    await db.manualPromotions.put(next);
    flash("已更新");
    setEditingId(null);
    reload();
    setForm({ sku: "", type: "coupon", startDate: "", endDate: "", costMode: "amount", amount: "", rate: "", notes: "" });
  };

  const del = async (id: string) => {
    await db.manualPromotions.delete(id);
    flash("已删除");
    reload();
  };

  const rateEstimate = useMemo(() => {
    if (form.costMode !== "rate" || !form.sku || !form.rate) return null;
    const sku = skuMap.get(form.sku); const snap = snapMap.get(form.sku);
    if (!sku) return null;
    const weeklySales = (snap?.dailySales7d ?? 0) * 7;
    if (weeklySales <= 0) return { cost: null as number | null, hint: "周销量缺失，无法预估" };
    return { cost: Number(((Number(form.rate) / 100) * sku.price * weeklySales).toFixed(2)), hint: "" };
  }, [form.costMode, form.sku, form.rate, skuMap, snapMap]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const getDisplayCost = (p: ManualPromotion): string => {
    if (p.costMode === "amount" && p.amount) return `$${p.amount.toFixed(2)}`;
    if (p.costMode === "rate" && p.rate) {
      if (p.estimatedCost) return `$${p.estimatedCost.toFixed(2)} (${p.rate}%)`;
      return `${p.rate}% 折扣率`;
    }
    return "-";
  };

  return (
    <div className="space-y-5">
      {/* KPI 汇总 */}
      {(props.visibleKeys.length === 0 || props.visibleKeys.includes("costKpi")) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-100 text-[14px] text-accent-700">
                <i className="ri-file-list-3-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">促销成本记录</div>
                <div className="font-heading text-[20px] font-bold text-foreground-950">{stats.totalRecords}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700">
                <i className="ri-flashlight-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">进行中</div>
                <div className="font-heading text-[20px] font-bold text-foreground-950">{stats.activeNow}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary-100 text-[14px] text-secondary-700">
                <i className="ri-calendar-event-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">待开始</div>
                <div className="font-heading text-[20px] font-bold text-foreground-950">{stats.upcoming}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-100 text-[14px] text-accent-700">
                <i className="ri-money-dollar-circle-line" aria-hidden />
              </div>
              <div>
                <div className="text-[11px] text-foreground-500">当前/未来成本合计</div>
                <div className="font-heading text-[20px] font-bold text-accent-700">${stats.activeTotal.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新增/编辑表单 */}
      {(props.visibleKeys.length === 0 || props.visibleKeys.includes("costForm")) && (
        <Section
          title={editingId ? "编辑促销成本" : "新增促销成本"}
          icon="ri-add-circle-line"
          subtitle="手动添加优惠券/秒杀/站外折扣等零散促销成本，自动汇入总成本公式。注：已内嵌至活动中的促销成本会在「活动管理」Tab 统一管理，无需重复录入。"
        >
          <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">SKU（必填）</label>
                <select value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer">
                  <option value="">选择 SKU</option>
                  {skus.map((s) => (<option key={s.sku} value={s.sku}>{s.sku} — {s.name}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">类型</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ManualPromoType })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer">
                  {MANUAL_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">开始日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">结束日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">成本模式</label>
                <div className="flex rounded-md border border-background-300/70 bg-background-50 p-0.5">
                  <button type="button" onClick={() => setForm({ ...form, costMode: "amount", rate: "" })}
                    className={`flex-1 rounded py-1 text-[11px] font-medium cursor-pointer transition-colors ${form.costMode === "amount" ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"}`}>金额</button>
                  <button type="button" onClick={() => setForm({ ...form, costMode: "rate", amount: "" })}
                    className={`flex-1 rounded py-1 text-[11px] font-medium cursor-pointer transition-colors ${form.costMode === "rate" ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"}`}>折扣率</button>
                </div>
              </div>
              {form.costMode === "amount" ? (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">促销成本金额 ($)</label>
                  <input type="number" step="0.01" min="0" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="例如 85.00"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">折扣率 (%)</label>
                  <input type="number" step="1" min="0" max="100" value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="例如 20"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
                  <div className="mt-0.5 text-[10px] text-foreground-400">按 折扣率% × 售价 × 周销量 自动估算</div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">备注（选填）</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="例如：春季大促"
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none" />
              </div>
              <div className="flex items-end gap-2">
                {editingId ? (
                  <>
                    <button type="button" onClick={saveEdit}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-1.5 text-[12px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap">
                      <i className="ri-check-line" aria-hidden /> 保存修改
                    </button>
                    <button type="button" onClick={() => { setEditingId(null); setForm({ sku: "", type: "coupon", startDate: "", endDate: "", costMode: "amount", amount: "", rate: "", notes: "" }); }}
                      className="rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] text-foreground-600 hover:bg-background-100 cursor-pointer">取消</button>
                  </>
                ) : (
                  <button type="button" onClick={addPromotion}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-1.5 text-[12px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap">
                    <i className="ri-add-line" aria-hidden /> 添加促销
                  </button>
                )}
              </div>
            </div>

            {form.costMode === "rate" && rateEstimate && form.sku && (
              <div className="mt-3 rounded-lg border border-accent-200/70 bg-accent-50/60 p-3 text-[12px]">
                <i className="ri-calculator-line mr-1 text-accent-600" aria-hidden />
                <span className="text-foreground-700 font-medium">预估成本：</span>
                {rateEstimate.cost != null ? (
                  <span className="mono-num font-semibold text-accent-700">
                    ${rateEstimate.cost}
                    <span className="ml-2 font-normal text-foreground-500">
                      ({form.rate}% × ${(skuMap.get(form.sku)?.price ?? 0).toFixed(2)} × {Math.round(((snapMap.get(form.sku)?.dailySales7d ?? 0) * 7))} 件)
                    </span>
                  </span>
                ) : <span className="text-red-600">{rateEstimate.hint}</span>}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 列表 */}
      {(props.visibleKeys.length === 0 || props.visibleKeys.includes("costList")) && (
        <Section
          title="促销成本记录"
          icon="ri-timeline-view"
          subtitle="按起止日期展示所有促销成本记录 · 包含手动录入 + 活动内嵌成本"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
              <button type="button" onClick={() => setTypeFilter("all")}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${typeFilter === "all" ? "bg-primary-500 text-background-50" : "text-foreground-600 hover:text-foreground-900"}`}>
                全部 ({manualPromotions.length})
              </button>
              {MANUAL_TYPES.map((t) => {
                const count = manualPromotions.filter((p) => p.type === t.value).length;
                if (count === 0) return null;
                return (
                  <button key={t.value} type="button" onClick={() => setTypeFilter(t.value)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${typeFilter === t.value ? "bg-primary-500 text-background-50" : "text-foreground-600 hover:text-foreground-900"}`}>
                    {t.label} ({count})
                  </button>
                );
              })}
            </div>
            <input type="text" value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)}
              placeholder="搜索 SKU..."
              className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none w-40" />
            <select value={shopFilter} onChange={(e) => setShopFilter(e.target.value)}
              className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer">
              <option value="all">全部店铺</option>
              {shops.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="ri-coupon-3-line" title="暂无促销成本记录" desc="在上方添加第一条促销成本记录，或在「活动管理」Tab 内嵌成本" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                    <th className="border-b border-background-200 px-2 py-2.5">SKU</th>
                    <th className="border-b border-background-200 px-2 py-2.5">品名</th>
                    <th className="border-b border-background-200 px-2 py-2.5">类型</th>
                    <th className="border-b border-background-200 px-2 py-2.5">时间</th>
                    <th className="border-b border-background-200 px-2 py-2.5">模式</th>
                    <th className="border-b border-background-200 px-2 py-2.5 text-right">成本</th>
                    <th className="border-b border-background-200 px-2 py-2.5">备注</th>
                    <th className="border-b border-background-200 px-2 py-2.5 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const isActive = p.startDate <= todayStr && p.endDate >= todayStr;
                    const isUpcoming = p.startDate > todayStr;
                    const isEnded = p.endDate < todayStr;
                    return (
                      <tr key={p.id} className="hover:bg-background-100/60">
                        <td className="mono-num border-b border-background-200/70 px-2 py-1.5 text-[11px] text-foreground-600">
                          <Link to={`/sku/${encodeURIComponent(p.sku)}`} className="hover:text-primary-700 hover:underline cursor-pointer">{p.sku}</Link>
                        </td>
                        <td className="border-b border-background-200/70 px-2 py-1.5 font-medium text-foreground-900">{p.skuName ?? "-"}</td>
                        <td className="border-b border-background-200/70 px-2 py-1.5">
                          <Badge tone={MANUAL_TYPE_TONE[p.type]}>{MANUAL_TYPE_LABEL[p.type]}</Badge>
                        </td>
                        <td className="border-b border-background-200/70 px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[12px] ${isActive ? "text-accent-700 font-semibold" : "text-foreground-700"}`}>
                              {p.startDate} → {p.endDate}
                            </span>
                            {isActive && <Badge tone="accent">进行中</Badge>}
                            {isUpcoming && <Badge tone="secondary">待开始</Badge>}
                            {isEnded && <span className="text-[10px] text-foreground-400">已结束</span>}
                          </div>
                        </td>
                        <td className="border-b border-background-200/70 px-2 py-1.5 text-[12px] text-foreground-500">
                          {p.costMode === "amount" ? "金额" : "折扣率"}
                        </td>
                        <td className="mono-num border-b border-background-200/70 px-2 py-1.5 text-right text-[12px] font-semibold text-foreground-900">
                          {getDisplayCost(p)}
                        </td>
                        <td className="border-b border-background-200/70 px-2 py-1.5 text-[11px] text-foreground-500">{p.notes || "-"}</td>
                        <td className="border-b border-background-200/70 px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            {editingId === p.id ? (
                              <span className="text-[11px] text-foreground-500">编辑中...</span>
                            ) : (
                              <>
                                <button type="button" onClick={() => edit(p)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-foreground-400 hover:text-primary-600 hover:bg-background-100 cursor-pointer" title="编辑">
                                  <i className="ri-edit-line" aria-hidden />
                                </button>
                                <button type="button" onClick={() => del(p.id)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-red-400 hover:text-red-500 hover:bg-red-50 cursor-pointer" title="删除">
                                  <i className="ri-delete-bin-line" aria-hidden />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-[12px] text-foreground-500">
            <Badge tone="accent">提示</Badge>
            <span>促销成本自动按周聚合进总成本公式（总成本 = FOB+头程+尾程+佣金+仓租+广告费+退货费+<strong>促销成本</strong>）。记录独立存储，不随 Excel 上传覆盖。</span>
          </div>
        </Section>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────── */
/* Tab 3: 促销时间线（按 SKU 展示促销时间段+价格+成本） */
/* ──────────────────────────────────────────── */

function TimelineSection(props: {
  buckets: ReturnType<typeof aggregateWeeklyCosts>;
  promotions: Promotion[];
  manualPromotions: ManualPromotion[];
  skuMap: Map<string, SkuMaster>;
  snapMap: Map<string, DailySnapshot>;
}) {
  const { buckets, promotions, manualPromotions, skuMap, snapMap } = props;
  const [selectedSku, setSelectedSku] = useState<string>("all");

  // 构建 SKU 维度的促销时间线数据（每个 SKU 下按时间排序的所有活动 + 其当时价格 + 成本）
  const skuTimeline = useMemo(() => {
    const map = new Map<string, Array<{
      id: string; type: "promo" | "manual";
      label: string; subType: string;
      startDate: string; endDate: string;
      price: number | null; discountPrice: number | null;
      cost: number | null;
      status: "active" | "upcoming" | "ended";
      statusStr: string;
    }>>();
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const p of promotions) {
      if (!map.has(p.sku)) map.set(p.sku, []);
      const sku = skuMap.get(p.sku);
      const snap = snapMap.get(p.sku);
      const pc = getEffectivePromoCost(p, sku, snap);
      const status: "active" | "upcoming" | "ended" =
        p.startDate <= todayStr && p.endDate >= todayStr ? "active" :
        p.startDate > todayStr ? "upcoming" : "ended";
      map.get(p.sku)!.push({
        id: p.id, type: "promo",
        label: p.name, subType: promoTypeLabel(p.type, p.customTypeName),
        startDate: p.startDate, endDate: p.endDate,
        price: sku?.price ?? null,
        discountPrice: p.discountPrice ?? null,
        cost: pc > 0 ? pc : null,
        status,
        statusStr: status === "active" ? "进行中" : status === "upcoming" ? "待开始" : "已结束",
      });
    }
    for (const m of manualPromotions) {
      if (!map.has(m.sku)) map.set(m.sku, []);
      const cost = m.costMode === "amount" ? (m.amount ?? null) : (m.estimatedCost ?? null);
      const sku = skuMap.get(m.sku);
      const status: "active" | "upcoming" | "ended" =
        m.startDate <= todayStr && m.endDate >= todayStr ? "active" :
        m.startDate > todayStr ? "upcoming" : "ended";
      map.get(m.sku)!.push({
        id: m.id, type: "manual",
        label: MANUAL_TYPE_LABEL[m.type], subType: m.notes ?? "促销成本",
        startDate: m.startDate, endDate: m.endDate,
        price: sku?.price ?? null, discountPrice: null,
        cost,
        status,
        statusStr: status === "active" ? "进行中" : status === "upcoming" ? "待开始" : "已结束",
      });
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return map;
  }, [promotions, manualPromotions, skuMap, snapMap]);

  const skuList = useMemo(() => {
    const set = new Set<string>();
    promotions.forEach((p) => set.add(p.sku));
    manualPromotions.forEach((m) => set.add(m.sku));
    return Array.from(set).sort();
  }, [promotions, manualPromotions]);

  const displaySkus = selectedSku === "all" ? skuList : [selectedSku];

  // 周时间线图表数据
  const chartBuckets = useMemo(() => {
    return buckets.map((b) => ({
      week: b.weekStart.slice(5),
      weekStart: b.weekStart,
      活动成本: Number(b.promoCost.toFixed(2)),
      其他成本: Number(b.otherCost.toFixed(2)),
      合计: Number(b.total.toFixed(2)),
      记录数: b.count,
    }));
  }, [buckets]);

  // 计算时间段在时间轴上的位置（用于 Gantt 式横向条显示）
  const renderTimelineBars = (items: ReturnType<typeof skuTimeline.get> extends infer T ? T : never) => {
    if (!items || items.length === 0) return null;
    // 计算时间轴范围：最早 - 最晚，两端各扩 5 天
    const dates = items.flatMap((i) => [i.startDate, i.endDate]);
    const minDate = dates.reduce((a, b) => a < b ? a : b);
    const maxDate = dates.reduce((a, b) => a > b ? a : b);
    const min = new Date(minDate); min.setDate(min.getDate() - 7);
    const max = new Date(maxDate); max.setDate(max.getDate() + 7);
    const totalMs = max.getTime() - min.getTime();

    return (
      <div className="mt-2">
        <div className="h-6 relative mb-1 border-b border-background-200/70">
          {(() => {
            // 生成 6 个刻度标签
            const ticks: Date[] = [];
            for (let i = 0; i <= 5; i++) {
              const d = new Date(min.getTime() + (totalMs * i / 5));
              ticks.push(d);
            }
            return ticks.map((t, i) => (
              <div key={i} className="absolute top-0 text-[9px] text-foreground-400"
                style={{ left: `${(t.getTime() - min.getTime()) / totalMs * 100}%`, transform: "translateX(-50%)" }}>
                {t.toISOString().slice(5, 10)}
              </div>
            ));
          })()}
        </div>
        {items.map((it, idx) => {
          const s = new Date(it.startDate).getTime();
          const e = new Date(it.endDate).getTime();
          const leftPct = Math.max(0, (s - min.getTime()) / totalMs * 100);
          const widthPct = Math.min(100 - leftPct, Math.max(1, (e - s) / totalMs * 100));
          const bgClass = it.status === "active" ? "bg-accent-500" : it.status === "upcoming" ? "bg-primary-400" : "bg-background-300";
          return (
            <div key={it.id} className="h-6 relative flex items-center mb-1.5">
              <div className="w-[140px] shrink-0 text-[10px] text-foreground-600 pr-2 truncate" title={`${it.subType} · ${it.label}`}>
                <span className="font-semibold">{it.subType}</span> {it.label}
              </div>
              <div className="flex-1 relative h-4">
                <div className={`absolute top-0 h-full rounded ${bgClass} opacity-80`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  title={`${it.startDate} → ${it.endDate}  ${it.statusStr}${it.discountPrice ? `  折扣价 $${it.discountPrice}` : ""}${it.cost ? `  成本 $${it.cost.toFixed(2)}` : ""}`}>
                </div>
                {/* 状态小圆点 */}
                {it.status === "active" && (
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-2 w-2 rounded-full bg-white border border-accent-600" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* SKU 筛选器 */}
      <Section
        title="SKU 促销时间线（按 SKU 查看各促销时间段 · 当时促销价格 · 促销成本）"
        icon="ri-timeline-view"
        subtitle="如需查看促销销量，请在「数据导入」中导入促销销量列"
        action={
          <select value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)}
            className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer max-w-[220px]">
            <option value="all">全部 SKU ({skuList.length})</option>
            {skuList.map((s) => (<option key={s} value={s}>{s} — {skuMap.get(s)?.name ?? ""}</option>))}
          </select>
        }
      >
        {skuList.length === 0 ? (
          <EmptyState icon="ri-calendar-event-line" title="暂无促销记录" desc="先在「活动管理」或「促销成本」Tab 添加记录" />
        ) : (
          <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
            {displaySkus.map((sku) => {
              const items = skuTimeline.get(sku) ?? [];
              const skuInfo = skuMap.get(sku);
              const currentPrice = skuInfo?.price ?? null;
              const currentAdRatio = snapMap.get(sku)?.adRatio;
              // 自然/广告占比近似推导：adRatio 越高表示广告驱动越强
              const organicPct = currentAdRatio != null ? Math.max(10, Math.min(90, 100 - currentAdRatio)) : null;
              const adPct = currentAdRatio != null ? 100 - (organicPct ?? 0) : null;
              return (
                <div key={sku} className="rounded-[12px] border border-background-200/70 bg-background-50/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-heading font-semibold text-[14px] text-foreground-900 flex items-center gap-2">
                        <i className="ri-price-tag-3-line text-primary-600" aria-hidden />
                        <Link to={`/sku/${encodeURIComponent(sku)}`} className="hover:underline cursor-pointer">{sku}</Link>
                        <span className="text-[12px] font-normal text-foreground-500">{skuInfo?.name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-foreground-500">
                        {currentPrice != null && <span><span className="text-foreground-400">当前售价</span> <b className="text-foreground-800">${currentPrice.toFixed(2)}</b></span>}
                        {currentAdRatio != null && <span><span className="text-foreground-400">广告费比</span> <b className={currentAdRatio > 25 ? "text-red-600" : "text-foreground-800"}>{currentAdRatio.toFixed(1)}%</b></span>}
                        {organicPct != null && adPct != null && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-foreground-400">自然/广告占比</span>
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-background-100 px-2 py-0.5 border border-background-200/70">
                              <span className="font-semibold" style={{ color: "#0ea5e9" }}>{organicPct.toFixed(0)}%</span>
                              <span className="text-foreground-300">/</span>
                              <span className="font-semibold" style={{ color: "#f59e0b" }}>{adPct.toFixed(0)}%</span>
                            </span>
                            <span className="text-foreground-400 text-[10px]">（≈广告费比推导，实际以业务数据为准）</span>
                          </span>
                        )}
                        <span className="text-foreground-400">共 {items.length} 条记录</span>
                      </div>
                    </div>
                  </div>
                  {/* 时间轴甘特条 */}
                  {renderTimelineBars(items)}
                  {/* 明细表格 */}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-400 border-b border-background-200/70">
                          <th className="py-1.5 px-2">类型</th>
                          <th className="py-1.5 px-2">活动/说明</th>
                          <th className="py-1.5 px-2">时间段</th>
                          <th className="py-1.5 px-2">状态</th>
                          <th className="py-1.5 px-2 text-right">当时售价</th>
                          <th className="py-1.5 px-2 text-right">促销价</th>
                          <th className="py-1.5 px-2 text-right">促销成本</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.id} className="border-b border-background-100/80 hover:bg-background-100/40">
                            <td className="py-1.5 px-2">
                              <Badge tone={it.type === "promo" ? "primary" : "warn"}>{it.subType}</Badge>
                            </td>
                            <td className="py-1.5 px-2 text-foreground-800">{it.label}</td>
                            <td className="py-1.5 px-2 text-[11px] text-foreground-600">
                              {it.startDate} → {it.endDate}
                            </td>
                            <td className="py-1.5 px-2">
                              <Badge tone={it.status === "active" ? "accent" : it.status === "upcoming" ? "primary" : "secondary"}>{it.statusStr}</Badge>
                            </td>
                            <td className="py-1.5 px-2 text-right mono-num">
                              {it.price ? `$${it.price.toFixed(2)}` : "-"}
                            </td>
                            <td className="py-1.5 px-2 text-right mono-num">
                              {it.discountPrice ? (
                                <span className="text-primary-700 font-semibold">${it.discountPrice.toFixed(2)}</span>
                              ) : (
                                <span className="text-foreground-400">-</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right mono-num">
                              {it.cost != null ? <span className="text-secondary-700 font-semibold">${it.cost.toFixed(2)}</span> : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 周成本聚合图 + 表 */}
      <Section title="促销成本时间线（按周聚合，最近 8 周）" icon="ri-bar-chart-grouped-line"
        subtitle="活动成本 = 活动内嵌成本 · 其他成本 = 手动录入的优惠券/秒杀/站外折扣等 · amount 模式跨周均摊 · rate 模式每周独立">
        {chartBuckets.length === 0 ? (
          <EmptyState icon="ri-bar-chart-line" title="暂无成本时间线" desc="添加活动或促销成本后，时间线自动生成" />
        ) : (
          <>
            <div className="h-72 overflow-x-auto">
              <div style={{ minWidth: Math.max(600, chartBuckets.length * 80), width: "100%", height: "100%" }}>
                {/* 纯 DOM 柱状图（避免 recharts 未加载时报错，样式化堆叠柱） */}
                <div className="w-full h-full flex flex-col">
                  <div className="flex-1 flex items-end gap-2 px-2">
                    {chartBuckets.map((b, i) => {
                      const max = Math.max(...chartBuckets.map((x) => x.合计), 1);
                      const promoH = (b.活动成本 / max) * 100;
                      const otherH = (b.其他成本 / max) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col justify-end items-center group relative" title={`${b.weekStart}  活动成本 $${b.活动成本} · 其他成本 $${b.其他成本} · 合计 $${b.合计} · ${b.记录数}条`}>
                          <div className="w-full max-w-[40px] flex flex-col justify-end" style={{ height: "100%" }}>
                            {b.其他成本 > 0 && <div className="w-full rounded-t-sm transition-all" style={{ height: `${otherH}%`, background: "#f59e0b" }} />}
                            {b.活动成本 > 0 && <div className="w-full rounded-t-sm transition-all" style={{ height: `${promoH}%`, background: "#3b82f6" }} />}
                          </div>
                          <div className="mt-1 text-[10px] text-foreground-500 font-medium">{b.week}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 pt-2 pb-1 text-[11px] text-foreground-500">
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#3b82f6" }} /> 活动成本</span>
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> 其他成本</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-400 border-b border-background-200/70">
                    <th className="py-2 px-2">周起始</th>
                    <th className="py-2 px-2">周结束</th>
                    <th className="py-2 px-2 text-right">活动成本</th>
                    <th className="py-2 px-2 text-right">其他成本</th>
                    <th className="py-2 px-2 text-right">合计</th>
                    <th className="py-2 px-2 text-right">记录数</th>
                  </tr>
                </thead>
                <tbody>
                  {chartBuckets.map((b, i) => (
                    <tr key={i} className="border-b border-background-100/80 hover:bg-background-100/40">
                      <td className="py-1.5 px-2 text-foreground-600 mono-num text-[11px]">{b.weekStart}</td>
                      <td className="py-1.5 px-2 text-foreground-600 mono-num text-[11px]">{buckets[i]?.weekEnd}</td>
                      <td className="py-1.5 px-2 text-right mono-num">${b.活动成本.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right mono-num">${b.其他成本.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right mono-num font-semibold text-foreground-900">${b.合计.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right mono-num text-foreground-500">{b.记录数}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

/* 旧路由兼容：访问 /promotions 或 /promo-cost 时，若带 ?legacy=1 则重定向到新页面 */
export function LegacyPromotionsRedirect() {
  return <Navigate to="/promo-center?tab=activity" replace />;
}
export function LegacyPromoCostRedirect() {
  return <Navigate to="/promo-center?tab=cost" replace />;
}
