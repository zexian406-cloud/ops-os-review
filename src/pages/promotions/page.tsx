import { useEffect, useMemo, useState, useCallback } from "react";
import { db, getAllShops } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import PageLayoutCustomizer from "@/components/layout/PageLayoutCustomizer";
import CanvasLayout from "@/components/layout/CanvasLayout";
import { type Layout } from "react-grid-layout";
import { usePageLayout, type GridItemLayout } from "@/hooks/usePageLayout";
import type { Promotion, PromotionType, SkuMaster, DailySnapshot, Shop } from "@/domain/types";

const PROMO_TYPES: { value: PromotionType; label: string }[] = [
  { value: "BD", label: "BD (Best Deal)" },
  { value: "LD", label: "LD (Lightning Deal)" },
  { value: "7DD", label: "7DD (7-Day Deal)" },
  { value: "Coupon", label: "Coupon" },
  { value: "other", label: "其他" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

export default function PromotionsPage() {
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Promotion["status"] | "all">("all");
  const [typeFilter, setTypeFilter] = useState<PromotionType | "all">("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const {
    customizing, setCustomizing, toggleSection, reset: resetLayout,
    visibleKeys, allKeys, gridLayout, setGridLayout,
    resetItemSize, resetItemPosition,
  } = usePageLayout("promotions");

  // ── 构建 ReactGridLayout 布局数组 ──
  const rglLayout: Layout[] = useMemo(() => {
    return visibleKeys.map((key) => {
      const item = (gridLayout as Record<string, GridItemLayout>)[key] ?? { x: 0, y: 0, w: 12, h: 6 };
      return {
        i: key,
        x: Math.max(Math.min(item.x, 12), 0),
        y: Math.max(item.y, 0),
        w: Math.min(Math.max(item.w, 2), 12),
        h: Math.max(item.h, 2),
        minW: 2,
        maxW: 12,
        minH: 2,
      };
    });
  }, [visibleKeys, gridLayout]);

  const handleLayoutChange = useCallback((layout: Layout[]) => {
    setGridLayout(layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
  }, [setGridLayout]);

  const [bulkSkus, setBulkSkus] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPromo, setNewPromo] = useState<Partial<Promotion>>({ type: "BD", status: "upcoming" });

  useEffect(() => {
    (async () => {
      const [s, p, snap] = await Promise.all([
        db.skuMaster.toArray(),
        db.promotions.toArray(),
        db.dailySnapshot.toArray(),
      ]);
      setSkus(s);
      setPromos(p);
      setSnapshots(snap);
    })();
  }, []);

  // Latest snapshot per SKU
  const snapMap = useMemo(() => {
    const map = new Map<string, DailySnapshot>();
    for (const s of snapshots) {
      const ex = map.get(s.sku);
      if (!ex || s.date > ex.date) map.set(s.sku, s);
    }
    return map;
  }, [snapshots]);

  // SKU map for quick lookup
  const skuMap = useMemo(() => {
    const map = new Map<string, SkuMaster>();
    for (const s of skus) map.set(s.sku, s);
    return map;
  }, [skus]);

  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    getAllShops().then(setShops);
  }, []);

  const stores = useMemo(() => {
    // Build a map of shopId -> shopName
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    // Collect unique store values from promotions data
    const rawStores = new Set<string>();
    promos.forEach((p) => {
      if (p.store) rawStores.add(p.store);
    });
    // For each raw store value, try to find the shop name, otherwise use the raw value
    const result = new Set<string>();
    for (const raw of rawStores) {
      const name = shopMap.get(raw);
      result.add(name ?? raw);
    }
    return Array.from(result).sort();
  }, [shops, promos]);

  const shopMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shops) {
      map.set(s.name, s.id);
      map.set(s.id, s.id);
    }
    return map;
  }, [shops]);

  const shopNameMap = useMemo(() => {
    const map = new Map<string, string>();
    shops.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [shops]);

  const getShopName = (storeId: string): string => {
    return shopNameMap.get(storeId) ?? storeId;
  };

  const filtered = useMemo(() => {
    let list = promos;
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    if (storeFilter !== "all") {
      const storeId = shopMap.get(storeFilter) ?? storeFilter;
      list = list.filter((p) => p.store === storeId);
    }
    return list.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [promos, statusFilter, typeFilter, storeFilter, shopMap]);

  // Compute profit metrics per promotion
  const promoMetrics = useMemo(() => {
    return new Map(promos.map((p) => {
      const sku = skuMap.get(p.sku);
      const snap = snapMap.get(p.sku);
      const salePrice = p.discountPrice ?? sku?.price ?? 0;

      // Total cost per unit
      const costFob = sku?.costFob ?? 0;
      const costShipping = sku?.costShipping ?? 0;
      const costDelivery = sku?.costDelivery ?? 0;
      const costCommission = sku?.costCommission ?? 0;
      const costStorage = sku?.costStorage ?? 0;
      const costReturn = sku?.costReturn ?? 0;
      const costAd = sku?.costAd ?? 0;
      const coupon = sku?.coupon ?? 0;
      const totalCost = costFob + costShipping + costDelivery + costCommission + costStorage + costReturn + costAd + coupon;

      const profit = salePrice - totalCost;
      const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
      const adRatio = snap?.adRatio;

      return [p.id, { profit, margin, totalCost, adRatio, salePrice }] as const;
    }));
  }, [promos, skuMap, snapMap]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const toggleBulkSku = (sku: string) => {
    setBulkSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const addPromotion = async () => {
    if (!newPromo.sku || !newPromo.name || !newPromo.startDate || !newPromo.endDate) {
      setMsg("请填写 SKU / 活动名称 / 开始日期 / 结束日期");
      setTimeout(() => setMsg(null), 2800);
      return;
    }
    const found = skus.find((s) => s.sku === newPromo.sku);
    const promo: Promotion = {
      id: uid(),
      sku: newPromo.sku!,
      skuName: found?.name ?? newPromo.sku,
      store: newPromo.store ?? found?.store ?? "-",
      type: newPromo.type ?? "BD",
      name: newPromo.name!,
      startDate: newPromo.startDate!,
      endDate: newPromo.endDate!,
      status: newPromo.status ?? "upcoming",
      notes: newPromo.notes,
      multiplier: newPromo.multiplier,
      discountPrice: newPromo.discountPrice,
    };
    await db.promotions.put(promo);
    setPromos((prev) => [...prev, promo]);
    setNewPromo({ type: "BD", status: "upcoming" });
    setMsg("已添加促销");
    setTimeout(() => setMsg(null), 2200);
  };

  const addBulkPromotions = async () => {
    if (!newPromo.name || !newPromo.startDate || !newPromo.endDate || bulkSkus.size === 0) {
      setMsg("请填写活动信息并至少勾选一个 SKU");
      setTimeout(() => setMsg(null), 2800);
      return;
    }
    const newList: Promotion[] = [];
    for (const sku of bulkSkus) {
      const found = skus.find((s) => s.sku === sku);
      newList.push({
        id: uid(),
        sku,
        skuName: found?.name ?? sku,
        store: found?.store ?? "-",
        type: newPromo.type ?? "BD",
        name: newPromo.name!,
        startDate: newPromo.startDate!,
        endDate: newPromo.endDate!,
        status: newPromo.status ?? "upcoming",
        notes: newPromo.notes,
        multiplier: newPromo.multiplier,
        discountPrice: newPromo.discountPrice,
      });
    }
    await db.promotions.bulkPut(newList);
    setPromos((prev) => [...prev, ...newList]);
    setBulkSkus(new Set());
    setNewPromo({ type: "BD", status: "upcoming" });
    setBulkMode(false);
    setMsg(`已批量添加 ${newList.length} 条促销`);
    setTimeout(() => setMsg(null), 2200);
  };

  const updateField = async (id: string, patch: Partial<Promotion>) => {
    const cur = promos.find((p) => p.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    await db.promotions.put(next);
    setPromos((prev) => prev.map((p) => (p.id === id ? next : p)));
  };

  const deletePromotion = async (id: string) => {
    await db.promotions.delete(id);
    setPromos((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const batchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 条促销吗？`)) return;
    await db.promotions.bulkDelete(Array.from(selected));
    setPromos((prev) => prev.filter((p) => !selected.has(p.id)));
    setSelected(new Set());
    setMsg(`已删除 ${selected.size} 条促销`);
    setTimeout(() => setMsg(null), 2200);
  };

  const statusCounts = useMemo(() => {
    const counts = { all: promos.length, upcoming: 0, active: 0, ended: 0 };
    promos.forEach((p) => { if (counts[p.status] !== undefined) counts[p.status]++; });
    return counts;
  }, [promos]);

  const statusTabs: Array<{ key: Promotion["status"] | "all"; label: string }> = [
    { key: "all", label: `全部 (${statusCounts.all})` },
    { key: "upcoming", label: `待开始 (${statusCounts.upcoming})` },
    { key: "active", label: `进行中 (${statusCounts.active})` },
    { key: "ended", label: `已结束 (${statusCounts.ended})` },
  ];

  /* ────────── 汇总统计 ────────── */
  const summaryStats = useMemo(() => {
    const active = filtered.filter((p) => p.status === "active" || p.status === "upcoming");
    let totalProfitEst = 0;
    let count = 0;
    let totalAdRatio = 0;
    let adCount = 0;
    for (const p of active) {
      const m = promoMetrics.get(p.id);
      if (m) {
        totalProfitEst += m.profit;
        count++;
        if (m.adRatio != null) { totalAdRatio += m.adRatio; adCount++; }
      }
    }
    return {
      avgMargin: count > 0 ? (totalProfitEst / count) : 0,
      avgProfit: count > 0 ? totalProfitEst / count : 0,
      avgAdRatio: adCount > 0 ? totalAdRatio / adCount : 0,
    };
  }, [filtered, promoMetrics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
            Promotion Manager
          </div>
          <h1 className="font-heading text-[26px] font-bold text-foreground-950">促销管理</h1>
          <p className="text-[13px] text-foreground-500">
            手动添加 BD / LD / 7DD / Coupon · 自动算利润率 &amp; 广告费比 · 支持批量操作
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCustomizing(!customizing)}
          className="flex items-center gap-1.5 rounded-[12px] border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-800 cursor-pointer"
        >
          <i className={customizing ? "ri-close-line" : "ri-layout-masonry-line"} aria-hidden />
          {customizing ? "关闭设置" : "自定义布局"}
        </button>
      </div>

      {customizing && (
        <PageLayoutCustomizer
          pageId="promotions"
          visibleKeys={visibleKeys}
          allKeys={allKeys}
          toggle={toggleSection}
          onClose={() => setCustomizing(false)}
          onReset={resetLayout}
        />
      )}

      {/* 画布布局 — 全部区块可拖拽定位 */}
      <CanvasLayout
        layout={rglLayout}
        customizing={customizing}
        onLayoutChange={handleLayoutChange}
        onHideItem={toggleSection}
        onResetItemSize={resetItemSize}
        onResetItemPosition={resetItemPosition}
      >

      {/* ── 促销汇总卡片 ── */}
      {visibleKeys.includes("summaryCards") && (
      <div key="summaryCards" className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-3">
          <div className="text-[11px] font-medium text-foreground-500">平均利润率</div>
          <div className={`font-heading text-[22px] font-bold mt-0.5 ${summaryStats.avgMargin >= 10 ? "text-primary-700" : summaryStats.avgMargin >= 0 ? "text-foreground-800" : "text-red-600"}`}>
            {summaryStats.avgMargin.toFixed(1)}%
          </div>
          <div className="text-[10px] text-foreground-500 mt-0.5">按折扣价计算（进行中+待开始）</div>
        </div>
        <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-3">
          <div className="text-[11px] font-medium text-foreground-500">平均单件净利</div>
          <div className={`font-heading text-[22px] font-bold mt-0.5 ${summaryStats.avgProfit >= 2 ? "text-accent-700" : "text-red-600"}`}>
            ${summaryStats.avgProfit.toFixed(2)}
          </div>
          <div className="text-[10px] text-foreground-500 mt-0.5">折扣价 - 总成本（不含Excel优惠券，促销成本在「促销成本」页手动录入）</div>
        </div>
        <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-3">
          <div className="text-[11px] font-medium text-foreground-500">平均广告费比</div>
          <div className={`font-heading text-[22px] font-bold mt-0.5 ${summaryStats.avgAdRatio > 25 ? "text-red-600" : "text-foreground-800"}`}>
            {summaryStats.avgAdRatio.toFixed(1)}%
          </div>
          <div className="text-[10px] text-foreground-500 mt-0.5">近7天快照 ads/rev</div>
        </div>
      </div>
      )}

      {/* ── 新增促销 ── */}
      {visibleKeys.includes("addForm") && (
      <div key="addForm">
      <Section
        title={bulkMode ? "批量添加促销" : "新增促销"}
        icon="ri-add-circle-line"
        subtitle={bulkMode ? "勾选多个 SKU，一次添加同一促销活动" : "选择单个 SKU 添加促销活动，折扣价决定利润率计算"}
        action={
          <button
            type="button"
            onClick={() => { setBulkMode(!bulkMode); setBulkSkus(new Set()); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-700 hover:bg-background-200 cursor-pointer whitespace-nowrap"
          >
            <i className={bulkMode ? "ri-checkbox-indeterminate-line" : "ri-checkbox-multiple-line"} aria-hidden />
            {bulkMode ? "退出批量模式" : "批量添加"}
          </button>
        }
      >
        <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-4">
          {bulkMode ? (
            /* ── 批量模式：勾选 SKU ── */
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
                      bulkSkus.has(s.sku)
                        ? "bg-primary-100 text-primary-900"
                        : "hover:bg-background-100 text-foreground-700",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={bulkSkus.has(s.sku)}
                      onChange={() => toggleBulkSku(s.sku)}
                      className="h-3.5 w-3.5 rounded accent-primary-500 cursor-pointer"
                    />
                    <span className="truncate">{s.sku}</span>
                    <span className="truncate text-foreground-500">{s.name}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">类型</label>
                  <select
                    value={newPromo.type ?? "BD"}
                    onChange={(e) => setNewPromo({ ...newPromo, type: e.target.value as PromotionType })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
                  >
                    {PROMO_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">活动名称</label>
                  <input
                    value={newPromo.name ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, name: e.target.value })}
                    placeholder="例如 Prime Day BD"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">折扣售价</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPromo.discountPrice ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, discountPrice: Number(e.target.value) || undefined })}
                    placeholder="19.99"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">开始日期</label>
                  <input
                    type="date"
                    value={newPromo.startDate ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, startDate: e.target.value })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">结束日期</label>
                  <input
                    type="date"
                    value={newPromo.endDate ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, endDate: e.target.value })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">销量倍率</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newPromo.multiplier ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, multiplier: Number(e.target.value) || undefined })}
                    placeholder="例如 2.5"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={addBulkPromotions}
                    disabled={bulkSkus.size === 0}
                    className="inline-flex items-center gap-1 rounded-md bg-primary-500 px-4 py-1.5 text-[12px] font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-line" aria-hidden /> 批量添加 ({bulkSkus.size})
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── 单条模式 ── */
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">SKU</label>
                  <select
                    value={newPromo.sku ?? ""}
                    onChange={(e) => {
                      const s = skus.find((k) => k.sku === e.target.value);
                      setNewPromo({ ...newPromo, sku: e.target.value, skuName: s?.name, store: s?.store });
                    }}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">选择 SKU</option>
                    {skus.map((s) => (
                      <option key={s.sku} value={s.sku}>{s.sku} — {s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">类型</label>
                  <select
                    value={newPromo.type ?? "BD"}
                    onChange={(e) => setNewPromo({ ...newPromo, type: e.target.value as PromotionType })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
                  >
                    {PROMO_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">活动名称</label>
                  <input
                    value={newPromo.name ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, name: e.target.value })}
                    placeholder="例如 BD Week 31"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">折扣售价</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPromo.discountPrice ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, discountPrice: Number(e.target.value) || undefined })}
                    placeholder="例如 19.99"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">开始日期</label>
                  <input
                    type="date"
                    value={newPromo.startDate ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, startDate: e.target.value })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">结束日期</label>
                  <input
                    type="date"
                    value={newPromo.endDate ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, endDate: e.target.value })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={addPromotion}
                    className="inline-flex items-center gap-1 rounded-md bg-primary-500 px-4 py-1.5 text-[12px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-line" aria-hidden /> 添加
                  </button>
                </div>
              </div>
              {/* Notes & multiplier (single mode extras) */}
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">销量倍率</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newPromo.multiplier ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, multiplier: Number(e.target.value) || undefined })}
                    placeholder="例如 2.0"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">备注</label>
                  <input
                    value={newPromo.notes ?? ""}
                    onChange={(e) => setNewPromo({ ...newPromo, notes: e.target.value })}
                    placeholder="例如：注意库存、提前调广告预算"
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-foreground-500">状态</label>
                  <select
                    value={newPromo.status ?? "upcoming"}
                    onChange={(e) => setNewPromo({ ...newPromo, status: e.target.value as Promotion["status"] })}
                    className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
                  >
                    <option value="upcoming">待开始</option>
                    <option value="active">进行中</option>
                    <option value="ended">已结束</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {msg && (
            <div className={[
              "mt-3 rounded-md px-3 py-1.5 text-[12px]",
              msg.includes("请填写") ? "border border-red-200 bg-red-50 text-red-800" : "border border-accent-200 bg-accent-100/60 text-accent-900",
            ].join(" ")}>
              {msg}
            </div>
          )}
        </div>
      </Section>
      </div>
      )}

      {/* ── 已有促销 ── */}
      {visibleKeys.includes("promoList") && (
      <div key="promoList">
      <Section
        title="已有促销"
        icon="ri-flashlight-line"
        subtitle={`共 ${filtered.length} 条${selected.size > 0 ? ` · 已选 ${selected.size} 条` : ""}`}
        action={
          selected.size > 0 ? (
            <button
              type="button"
              onClick={batchDelete}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-100 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-delete-bin-line" aria-hidden /> 批量删除 ({selected.size})
            </button>
          ) : null
        }
      >
        {/* Status tabs */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
          {statusTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={[
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                statusFilter === t.key
                  ? "bg-primary-500 text-background-50"
                  : "text-foreground-600 hover:text-foreground-900",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}

          <span className="mx-2 h-5 w-px bg-background-300/70" />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as PromotionType | "all")}
            className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1 text-[12px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer"
          >
            <option value="all">全部类型</option>
            {PROMO_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1 text-[12px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer"
          >
            <option value="all">全部店铺</option>
            {stores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                <th className="border-b border-background-200 px-2 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded accent-primary-500 cursor-pointer"
                  />
                </th>
                <th className="border-b border-background-200 px-2 py-2.5">SKU</th>
                <th className="border-b border-background-200 px-2 py-2.5">品名</th>
                <th className="border-b border-background-200 px-2 py-2.5">类型</th>
                <th className="border-b border-background-200 px-2 py-2.5">名称</th>
                <th className="border-b border-background-200 px-2 py-2.5">店铺</th>
                <th className="border-b border-background-200 px-2 py-2.5">日期</th>
                <th className="border-b border-background-200 px-2 py-2.5">状态</th>
                <th className="border-b border-background-200 px-2 py-2.5 text-right">正常价</th>
                <th className="border-b border-background-200 px-2 py-2.5 text-right">折扣价</th>
                <th className="border-b border-background-200 px-2 py-2.5 text-right">利润率</th>
                <th className="border-b border-background-200 px-2 py-2.5 text-right">单件净利</th>
                <th className="border-b border-background-200 px-2 py-2.5 text-right">广告费比</th>
                <th className="border-b border-background-200 px-2 py-2.5">备注</th>
                <th className="border-b border-background-200 px-2 py-2.5 w-20 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-3 py-10 text-center text-[12px] text-foreground-500">
                    暂无促销活动，上方添加第一个
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const m = promoMetrics.get(p.id);
                  const sku = skuMap.get(p.sku);
                  return (
                    <tr
                      key={p.id}
                      className={["hover:bg-background-100/60", selected.has(p.id) ? "bg-primary-50/60" : ""].join(" ")}
                    >
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="h-3.5 w-3.5 rounded accent-primary-500 cursor-pointer"
                        />
                      </td>
                      <td className="mono-num border-b border-background-200/70 px-2 py-1.5 text-[11px] text-foreground-600">{p.sku}</td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 font-medium text-foreground-900">{p.skuName}</td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <select
                            value={p.type}
                            onChange={(e) => updateField(p.id, { type: e.target.value as PromotionType })}
                            className="w-20 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer"
                          >
                            {PROMO_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.value}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[12px] font-medium text-foreground-800">{p.type}</span>
                        )}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <input
                            value={p.name}
                            onChange={(e) => updateField(p.id, { name: e.target.value })}
                            className="w-full min-w-[80px] rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[12px] focus:border-primary-500 focus:outline-none"
                          />
                        ) : (
                          <span className="text-[12px] font-medium text-foreground-800">{p.name}</span>
                        )}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 text-[12px] text-foreground-600">{getShopName(p.store)}</td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <div className="flex flex-col text-[11px]">
                            <input
                              type="date"
                              value={p.startDate}
                              onChange={(e) => updateField(p.id, { startDate: e.target.value })}
                              className="w-28 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none"
                            />
                            <input
                              type="date"
                              value={p.endDate}
                              onChange={(e) => updateField(p.id, { endDate: e.target.value })}
                              className="mt-1 w-28 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none"
                            />
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
                          <select
                            value={p.status}
                            onChange={(e) => updateField(p.id, { status: e.target.value as Promotion["status"] })}
                            className="w-20 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer"
                          >
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
                          <input
                            type="number"
                            step="0.01"
                            value={p.discountPrice ?? ""}
                            onChange={(e) => updateField(p.id, { discountPrice: Number(e.target.value) || undefined })}
                            placeholder="-"
                            className="w-20 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-right text-[12px] focus:border-primary-500 focus:outline-none"
                          />
                        ) : (
                          <span className="mono-num text-[12px] font-medium text-foreground-800">
                            {p.discountPrice != null ? `$${p.discountPrice.toFixed(2)}` : "-"}
                          </span>
                        )}
                      </td>
                      <td className={`mono-num border-b border-background-200/70 px-2 py-1.5 text-right font-semibold text-[12px] ${m && m.margin >= 10 ? 'text-primary-700' : m && m.margin >= 0 ? 'text-foreground-700' : 'text-red-600'}`}>
                        {m ? `${m.margin.toFixed(1)}%` : "-"}
                      </td>
                      <td className={`mono-num border-b border-background-200/70 px-2 py-1.5 text-right text-[12px] ${m && m.profit >= 0 ? 'text-foreground-700' : 'text-red-600'}`}>
                        {m ? `$${m.profit.toFixed(2)}` : "-"}
                      </td>
                      <td className={`mono-num border-b border-background-200/70 px-2 py-1.5 text-right text-[12px] ${m && m.adRatio != null && m.adRatio > 25 ? 'text-red-600' : 'text-foreground-600'}`}>
                        {m?.adRatio != null ? `${m.adRatio.toFixed(1)}%` : "-"}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <input
                            value={p.notes ?? ""}
                            onChange={(e) => updateField(p.id, { notes: e.target.value })}
                            placeholder="备注"
                            className="w-full min-w-[80px] rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none"
                          />
                        ) : (
                          <span className="text-[11px] text-foreground-500">{p.notes || "-"}</span>
                        )}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {editingId === p.id ? (
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-primary-500 px-2 text-[11px] font-medium text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                              title="完成编辑"
                            >
                              <i className="ri-check-line" aria-hidden /> 完成
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingId(p.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-foreground-400 hover:text-primary-600 hover:bg-background-100 cursor-pointer"
                              title="编辑"
                            >
                              <i className="ri-edit-line" aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { if (editingId === p.id) setEditingId(null); deletePromotion(p.id); }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-red-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                            title="删除"
                          >
                            <i className="ri-delete-bin-line" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[12px] text-foreground-500">
          <Badge tone="accent">点编辑后修改</Badge>
          <span>默认只读防误触 · 点击行末铅笔图标进入编辑模式 · 利润率 =（折扣价 − 总成本）÷ 折扣价</span>
        </div>
      </Section>
      </div>
      )}
      </CanvasLayout>
    </div>
  );
}