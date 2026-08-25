import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { db, getAllShops, getCurrentSiteId } from "@/domain/db";
import { computeWeeklyPromoCost } from "@/domain/calculator";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { ManualPromotion, ManualPromoType, SkuMaster, DailySnapshot, Shop } from "@/domain/types";

const PROMO_TYPES: { value: ManualPromoType; label: string; icon: string }[] = [
  { value: "coupon", label: "优惠券", icon: "ri-coupon-3-line" },
  { value: "flash_sale", label: "秒杀", icon: "ri-flashlight-line" },
  { value: "offsite_discount", label: "站外折扣", icon: "ri-earth-line" },
  { value: "other", label: "其他", icon: "ri-more-line" },
];

const TYPE_LABEL: Record<ManualPromoType, string> = {
  coupon: "优惠券",
  flash_sale: "秒杀",
  offsite_discount: "站外折扣",
  other: "其他",
};

const TYPE_TONE: Record<ManualPromoType, "primary" | "accent" | "warn" | "secondary"> = {
  coupon: "primary",
  flash_sale: "warn",
  offsite_discount: "accent",
  other: "secondary",
};

const uid = () => Math.random().toString(36).slice(2, 10);

export default function PromoCostPage() {
  const [searchParams] = useSearchParams();
  const prefilledSku = searchParams.get("sku") ?? "";

  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [promos, setPromos] = useState<ManualPromotion[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ManualPromoType | "all">("all");
  const [skuFilter, setSkuFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopFilter, setShopFilter] = useState<string>("all");

  // ── New promo form ──
  const [newPromo, setNewPromo] = useState<{
    sku: string;
    type: ManualPromoType;
    startDate: string;
    endDate: string;
    costMode: "amount" | "rate";
    amount: string;
    rate: string;
    notes: string;
  }>({
    sku: prefilledSku,
    type: "coupon",
    startDate: "",
    endDate: "",
    costMode: "amount",
    amount: "",
    rate: "",
    notes: "",
  });

  // ── Load data ──
  const loadData = useCallback(async () => {
    const siteId = await getCurrentSiteId();
    const [s, snap, mp, allShops] = await Promise.all([
      db.skuMaster.toArray(),
      db.dailySnapshot.toArray(),
      db.manualPromotions.toArray(),
      getAllShops(),
    ]);
    setSkus(s.filter(x => (x.siteId ?? "site_us") === siteId));
    setSnapshots(snap.filter(x => (x.siteId ?? "site_us") === siteId));
    setPromos(mp.filter(x => (x.siteId ?? "site_us") === siteId));
    setShops(allShops.filter(x => (x.siteId ?? "site_us") === siteId || !x.siteId));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Update prefilled SKU when search params change
  useEffect(() => {
    if (prefilledSku) {
      setNewPromo((prev) => ({ ...prev, sku: prefilledSku }));
    }
  }, [prefilledSku]);

  // ── SKU map ──
  const skuMap = useMemo(() => {
    const map = new Map<string, SkuMaster>();
    for (const s of skus) map.set(s.sku, s);
    return map;
  }, [skus]);

  // ── Snapshot map ──
  const snapMap = useMemo(() => {
    const map = new Map<string, DailySnapshot>();
    for (const s of snapshots) {
      const ex = map.get(s.sku);
      if (!ex || s.date > ex.date) map.set(s.sku, s);
    }
    return map;
  }, [snapshots]);

  // ── Shop name ↔ id map ──
  const shopNameMap = useMemo(() => {
    const map = new Map<string, string>();
    shops.forEach((s) => { map.set(s.name, s.id); map.set(s.id, s.name); });
    return map;
  }, [shops]);

  // ── Filters ──
  const filtered = useMemo(() => {
    let list = promos;
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    if (skuFilter) list = list.filter((p) => p.sku.toLowerCase().includes(skuFilter.toLowerCase()));
    if (shopFilter !== "all") {
      const shopId = shopNameMap.get(shopFilter) ?? shopFilter;
      list = list.filter((p) => {
        const sku = skuMap.get(p.sku);
        return sku && sku.store === shopId;
      });
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [promos, typeFilter, skuFilter, shopFilter, shopNameMap, skuMap]);

  // ── Stats ──
  const stats = useMemo(() => {
    const activeTotal = promos.reduce((s, p) => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      const now = new Date();
      // Only count promos that are active/in future in terms of cost impact
      if (end >= now) {
        if (p.costMode === "amount" && p.amount) return s + p.amount;
        if (p.costMode === "rate" && p.rate && p.estimatedCost) return s + p.estimatedCost;
      }
      return s;
    }, 0);

    const now = new Date().toISOString().slice(0, 10);
    const activeNow = promos.filter((p) => p.startDate <= now && p.endDate >= now).length;
    const upcoming = promos.filter((p) => p.startDate > now).length;
    const totalRecords = promos.length;

    return { activeTotal, activeNow, upcoming, totalRecords };
  }, [promos]);

  // ── Add promo ──
  const addPromotion = async () => {
    if (!newPromo.sku || !newPromo.startDate || !newPromo.endDate) {
      setMsg("请填写 SKU / 开始日期 / 结束日期");
      setTimeout(() => setMsg(null), 2800);
      return;
    }
    if (newPromo.costMode === "amount" && (!newPromo.amount || Number(newPromo.amount) <= 0)) {
      setMsg("请填写促销成本金额");
      setTimeout(() => setMsg(null), 2800);
      return;
    }
    if (newPromo.costMode === "rate" && (!newPromo.rate || Number(newPromo.rate) <= 0)) {
      setMsg("请填写折扣率");
      setTimeout(() => setMsg(null), 2800);
      return;
    }

    const found = skus.find((s) => s.sku === newPromo.sku);
    const price = found?.price ?? 0;
    const snap = snapMap.get(newPromo.sku);
    const weeklySales = (snap?.dailySales7d ?? 0) * 7;

    let estimatedCost: number | undefined;
    if (newPromo.costMode === "rate" && newPromo.rate) {
      if (weeklySales > 0 && price > 0) {
        estimatedCost = Number(((Number(newPromo.rate) / 100) * price * weeklySales).toFixed(2));
      }
    }

    const promo: ManualPromotion = {
      id: uid(),
      sku: newPromo.sku,
      skuName: found?.name ?? newPromo.sku,
      type: newPromo.type,
      startDate: newPromo.startDate,
      endDate: newPromo.endDate,
      costMode: newPromo.costMode,
      amount: newPromo.costMode === "amount" ? Number(newPromo.amount) : undefined,
      rate: newPromo.costMode === "rate" ? Number(newPromo.rate) : undefined,
      estimatedCost,
      notes: newPromo.notes || undefined,
      createdAt: new Date().toISOString(),
    };

    await db.manualPromotions.put(promo);
    setPromos((prev) => [...prev, promo]);
    setNewPromo({
      sku: "",
      type: "coupon",
      startDate: "",
      endDate: "",
      costMode: "amount",
      amount: "",
      rate: "",
      notes: "",
    });

    if (estimatedCost != null) {
      setMsg(`已添加促销 · 预估成本 $${estimatedCost.toFixed(2)}（折扣率 ${newPromo.rate}% × 售价 $${price} × 周销量 ${weeklySales.toFixed(0)}）`);
    } else {
      setMsg("已添加促销");
    }
    setTimeout(() => setMsg(null), 3500);
  };

  // ── Delete ──
  const deletePromo = async (id: string) => {
    await db.manualPromotions.delete(id);
    setPromos((prev) => prev.filter((p) => p.id !== id));
    setMsg("已删除");
    setTimeout(() => setMsg(null), 2000);
  };

  // ── Update field ──
  const updateField = async (id: string, patch: Partial<ManualPromotion>) => {
    const cur = promos.find((p) => p.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    await db.manualPromotions.put(next);
    setPromos((prev) => prev.map((p) => (p.id === id ? next : p)));
  };

  // ── Get display cost for a promo ──
  const getDisplayCost = (p: ManualPromotion): string => {
    if (p.costMode === "amount" && p.amount) return `$${p.amount.toFixed(2)}`;
    if (p.costMode === "rate" && p.rate) {
      if (p.estimatedCost) return `$${p.estimatedCost.toFixed(2)} (${p.rate}%)`;
      return `${p.rate}% 折扣率`;
    }
    return "-";
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          Promotion Cost
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">促销成本</h1>
        <p className="text-[13px] text-foreground-500">
          手动添加优惠券/秒杀/站外折扣的促销成本 · 自动汇入总成本公式 · 数据独立存储，不随 Excel 上传覆盖
        </p>
      </div>

      {/* ── Summary KPI ── */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-100 text-[14px] text-accent-700">
              <i className="ri-file-list-3-line" aria-hidden />
            </div>
            <div>
              <div className="text-[11px] text-foreground-500">促销记录总数</div>
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
              <div className="text-[11px] text-foreground-500">当前/未来促销成本</div>
              <div className="font-heading text-[20px] font-bold text-accent-700">${stats.activeTotal.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 新增促销 ── */}
      <Section
        title="新增促销记录"
        icon="ri-add-circle-line"
        subtitle="手动添加优惠券/秒杀/站外折扣的促销成本，自动汇入总成本计算"
      >
        <div className="rounded-xl border border-background-200/70 bg-background-100/50 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {/* SKU */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-foreground-500">SKU（必填）</label>
              <select
                value={newPromo.sku}
                onChange={(e) => setNewPromo({ ...newPromo, sku: e.target.value })}
                className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
              >
                <option value="">选择 SKU</option>
                {skus.map((s) => (
                  <option key={s.sku} value={s.sku}>{s.sku} — {s.name}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-foreground-500">类型</label>
              <select
                value={newPromo.type}
                onChange={(e) => setNewPromo({ ...newPromo, type: e.target.value as ManualPromoType })}
                className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none cursor-pointer"
              >
                {PROMO_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-foreground-500">开始日期</label>
              <input
                type="date"
                value={newPromo.startDate}
                onChange={(e) => setNewPromo({ ...newPromo, startDate: e.target.value })}
                className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-foreground-500">结束日期</label>
              <input
                type="date"
                value={newPromo.endDate}
                onChange={(e) => setNewPromo({ ...newPromo, endDate: e.target.value })}
                className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
              />
            </div>

            {/* Cost Mode */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-foreground-500">成本模式</label>
              <div className="flex rounded-md border border-background-300/70 bg-background-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setNewPromo({ ...newPromo, costMode: "amount", rate: "" })}
                  className={`flex-1 rounded py-1 text-[11px] font-medium cursor-pointer transition-colors ${newPromo.costMode === "amount" ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"}`}
                >
                  金额
                </button>
                <button
                  type="button"
                  onClick={() => setNewPromo({ ...newPromo, costMode: "rate", amount: "" })}
                  className={`flex-1 rounded py-1 text-[11px] font-medium cursor-pointer transition-colors ${newPromo.costMode === "rate" ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"}`}
                >
                  折扣率
                </button>
              </div>
            </div>

            {/* Cost value */}
            {newPromo.costMode === "amount" ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">促销成本金额 ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPromo.amount}
                  onChange={(e) => setNewPromo({ ...newPromo, amount: e.target.value })}
                  placeholder="例如 85.00"
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">折扣率 (%)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={newPromo.rate}
                  onChange={(e) => setNewPromo({ ...newPromo, rate: e.target.value })}
                  placeholder="例如 20"
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
                <div className="mt-0.5 text-[10px] text-foreground-400">
                  系统按 折扣率% × 售价 × 周销量 自动估算
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-foreground-500">备注（选填）</label>
              <input
                value={newPromo.notes}
                onChange={(e) => setNewPromo({ ...newPromo, notes: e.target.value })}
                placeholder="例如：春季大促"
                className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
              />
            </div>

            {/* Add button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={addPromotion}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-1.5 text-[12px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line" aria-hidden /> 添加促销
              </button>
            </div>
          </div>

          {/* Rate mode preview */}
          {newPromo.costMode === "rate" && newPromo.rate && newPromo.sku && (
            <div className="mt-3 rounded-lg border border-accent-200/70 bg-accent-50/60 p-3 text-[12px]">
              <i className="ri-calculator-line mr-1 text-accent-600" aria-hidden />
              <span className="text-foreground-700 font-medium">预估成本：</span>
              {(() => {
                const sku = skuMap.get(newPromo.sku);
                const snap = snapMap.get(newPromo.sku);
                const price = sku?.price ?? 0;
                const weeklySales = (snap?.dailySales7d ?? 0) * 7;
                if (weeklySales <= 0) {
                  return <span className="text-red-600">周销量缺失，请先在数据导入中上传周销量数据</span>;
                }
                const est = (Number(newPromo.rate) / 100) * price * weeklySales;
                return (
                  <span className="mono-num font-semibold text-accent-700">
                    ${est.toFixed(2)}
                    <span className="ml-2 font-normal text-foreground-500">
                      ({newPromo.rate}% × ${price.toFixed(2)} × {weeklySales.toFixed(0)} 件)
                    </span>
                  </span>
                );
              })()}
            </div>
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

      {/* ── 促销时间线 ── */}
      <Section
        title="促销时间线"
        icon="ri-timeline-view"
        subtitle="按起止日期展示所有促销记录 · 帮助理解每周成本异常"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Type filter */}
          <div className="flex items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${typeFilter === "all" ? "bg-primary-500 text-background-50" : "text-foreground-600 hover:text-foreground-900"}`}
            >
              全部 ({promos.length})
            </button>
            {PROMO_TYPES.map((t) => {
              const count = promos.filter((p) => p.type === t.value).length;
              if (count === 0) return null;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTypeFilter(t.value)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${typeFilter === t.value ? "bg-primary-500 text-background-50" : "text-foreground-600 hover:text-foreground-900"}`}
                >
                  {t.label} ({count})
                </button>
              );
            })}
          </div>

          {/* SKU search */}
          <input
            type="text"
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            placeholder="搜索 SKU..."
            className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none w-40"
          />

          {/* Shop filter */}
          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer"
          >
            <option value="all">全部店铺</option>
            {shops.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="ri-coupon-3-line"
            title="暂无促销记录"
            desc="在上方添加第一条促销成本记录"
          />
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
                        <Link to={`/sku/${encodeURIComponent(p.sku)}`} className="hover:text-primary-700 hover:underline cursor-pointer">
                          {p.sku}
                        </Link>
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 font-medium text-foreground-900">
                        {editingId === p.id ? (
                          <input
                            value={p.skuName ?? ""}
                            onChange={(e) => updateField(p.id, { skuName: e.target.value })}
                            className="w-full min-w-[100px] rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[12px] focus:border-primary-500 focus:outline-none"
                          />
                        ) : (
                          p.skuName ?? "-"
                        )}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <select
                            value={p.type}
                            onChange={(e) => updateField(p.id, { type: e.target.value as ManualPromoType })}
                            className="w-24 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer"
                          >
                            {PROMO_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={TYPE_TONE[p.type]}>{TYPE_LABEL[p.type]}</Badge>
                        )}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5">
                        {editingId === p.id ? (
                          <div className="flex flex-col gap-1 text-[11px]">
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
                              className="w-28 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[12px] ${isActive ? "text-accent-700 font-semibold" : "text-foreground-700"}`}>
                              {p.startDate} → {p.endDate}
                            </span>
                            {isActive && <Badge tone="accent">进行中</Badge>}
                            {isUpcoming && <Badge tone="secondary">待开始</Badge>}
                            {isEnded && <span className="text-[10px] text-foreground-400">已结束</span>}
                          </div>
                        )}
                      </td>
                      <td className="border-b border-background-200/70 px-2 py-1.5 text-[12px]">
                        {editingId === p.id ? (
                          <div className="flex flex-col gap-1">
                            <select
                              value={p.costMode}
                              onChange={(e) => updateField(p.id, { costMode: e.target.value as "amount" | "rate" })}
                              className="w-16 rounded-md border border-background-300/70 bg-background-50 px-1 py-0.5 text-[11px] focus:border-primary-500 focus:outline-none cursor-pointer"
                            >
                              <option value="amount">金额</option>
                              <option value="rate">折扣率</option>
                            </select>
                            {p.costMode === "amount" ? (
                              <input
                                type="number"
                                step="0.01"
                                value={p.amount ?? ""}
                                onChange={(e) => updateField(p.id, { amount: Number(e.target.value) || undefined })}
                                className="w-20 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-right text-[11px] focus:border-primary-500 focus:outline-none"
                              />
                            ) : (
                              <input
                                type="number"
                                step="1"
                                value={p.rate ?? ""}
                                onChange={(e) => updateField(p.id, { rate: Number(e.target.value) || undefined })}
                                className="w-16 rounded-md border border-background-300/70 bg-background-50 px-1.5 py-0.5 text-right text-[11px] focus:border-primary-500 focus:outline-none"
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-foreground-500">
                            {p.costMode === "amount" ? "金额" : "折扣率"}
                          </span>
                        )}
                      </td>
                      <td className="mono-num border-b border-background-200/70 px-2 py-1.5 text-right text-[12px] font-semibold text-foreground-900">
                        {editingId === p.id ? (
                          <span className="text-[11px] text-foreground-500">编辑中...</span>
                        ) : (
                          getDisplayCost(p)
                        )}
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
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-500 px-2 text-[11px] font-medium text-background-50 hover:bg-accent-600 cursor-pointer whitespace-nowrap"
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
                            onClick={() => deletePromo(p.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-red-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                            title="删除"
                          >
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
        )}

        <div className="mt-3 flex items-center gap-2 text-[12px] text-foreground-500">
          <Badge tone="accent">提示</Badge>
          <span>促销成本自动按周聚合进总成本公式（总成本 = FOB+头程+尾程+佣金+仓租+广告费+退货费+<strong>促销成本</strong>）。Excel 优惠券列已退出计算，仅作参考。促销记录独立存储，不随 Excel 上传覆盖。</span>
        </div>
      </Section>
    </div>
  );
}