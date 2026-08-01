import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useOpsData } from "@/domain/store";
import { computeWarehouseTotals } from "@/domain/calculator";
import { db, getAllShops } from "@/domain/db";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { AlertType, TodoItem, Shop, OpsLog } from "@/domain/types";
import AlertList from "./AlertList";
import LayoutCustomizer from "@/components/layout/LayoutCustomizer";
import { useDashboardLayout, type DashboardSectionKey, type KpiMetricKey, KPI_METRIC_LABELS, KPI_METRIC_ICONS, KPI_METRIC_TONES } from "@/hooks/useLayoutPrefs";

const deltaArrow = (v: number, inverse = false) => {
  if (Math.abs(v) < 0.01) return <span className="text-foreground-400">→ 0</span>;
  const good = inverse ? v < 0 : v > 0;
  const color = good ? "text-accent-600" : "text-red-500";
  const arrow = v > 0 ? "↑" : "↓";
  return <span className={color}>{arrow} {Math.abs(v).toFixed(1)}</span>;
};

interface WeekCompareItem {
  label: string;
  current: number;
  previous: number;
  unit: string;
}

/* ─────────────────────────────────────── */
export default function Dashboard() {
  const {
    loading, skuMaster, alerts, promotions,
    shipmentSuggestions, wowDeltas, latestSnapshot,
    latestInventory, previousSnapshot, today, healthScores,
  } = useOpsData();

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [opsLogs, setOpsLogs] = useState<OpsLog[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsMap, setShopsMap] = useState<Map<string, string>>(new Map());
  const [promosExpanded, setPromosExpanded] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [shipmentExpanded, setShipmentExpanded] = useState(false);
  const [shopFilter, setShopFilter] = useState<string>("all");

  // 计算“昨天”的日期字符串（用于操作记录的相对日期展示，避免引用未定义变量导致白屏）
  const yesterday = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const loadTodos = async () => {
    const all = await db.todos.toArray();
    setTodos(all.filter((t) => !t.completed).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };
  useEffect(() => { loadTodos(); }, [loading]);
  useEffect(() => {
    db.opsLogs.toArray().then((data) => {
      data.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setOpsLogs(data.slice(0, 10));
    }).catch(() => setOpsLogs([]));
  }, [loading]);

  useEffect(() => {
    getAllShops().then((allShops) => {
      setShops(allShops);
      const map = new Map<string, string>();
      allShops.forEach((s) => { map.set(s.id, s.name); map.set(s.name, s.id); });
      setShopsMap(map);
    });
  }, []);

  const {
    customizing, setCustomizing, toggleSection, moveSection, reset, setKpiSlot,
    visibleKeys, orderedKeys, kpiSlots,
  } = useDashboardLayout();

  // ── 店铺筛选 ──
  const shopFilterId = useMemo(() => {
    if (shopFilter === "all") return "all";
    const id = shopsMap.get(shopFilter) ?? shopFilter;
    return id;
  }, [shopFilter, shopsMap]);

  const filteredSkuMaster = useMemo(() => {
    if (shopFilterId === "all") return skuMaster;
    return skuMaster.filter((s) => s.store === shopFilterId);
  }, [skuMaster, shopFilterId]);

  const filteredPromotions = useMemo(() => {
    if (shopFilterId === "all") return promotions;
    return promotions.filter((p) => p.store === shopFilterId);
  }, [promotions, shopFilterId]);

  const filteredAlerts = useMemo(() => {
    if (shopFilterId === "all") return alerts;
    // Filter alerts by checking if the related SKU belongs to the selected shop
    const shopSkuSet = new Set(filteredSkuMaster.map((s) => s.sku));
    return alerts.filter((a) => {
      if (a.sku && shopSkuSet.has(a.sku)) return true;
      return false;
    });
  }, [alerts, shopFilterId, filteredSkuMaster]);

  const filteredShipmentSuggestions = useMemo(() => {
    if (shopFilterId === "all") return shipmentSuggestions;
    return shipmentSuggestions.filter((s) => {
      const sku = skuMaster.find((sm) => sm.sku === s.sku);
      return sku && sku.store === shopFilterId;
    });
  }, [shipmentSuggestions, shopFilterId, skuMaster]);

  // ── 本周 vs 上周 ──
  const weekCompare = useMemo((): {
    chartData: Array<{ label: string; current: number; previous: number }>;
    items: WeekCompareItem[];
    hasTwoWeeks: boolean;
  } => {
    if (!previousSnapshot || previousSnapshot.size === 0) {
      return { chartData: [], items: [], hasTwoWeeks: false };
    }
    const curSalesSum = Array.from(latestSnapshot.values()).reduce((s, r) => s + r.dailySales7d, 0);
    const prevSalesSum = Array.from(previousSnapshot.values()).reduce((s, r) => s + r.dailySales7d, 0);
    const curAds = Array.from(latestSnapshot.values()).filter((r) => r.adRatio > 0);
    const prevAds = Array.from(previousSnapshot.values()).filter((r) => r.adRatio > 0);
    const curAdRatio = curAds.length > 0 ? curAds.reduce((s, r) => s + r.adRatio, 0) / curAds.length : 0;
    const prevAdRatio = prevAds.length > 0 ? prevAds.reduce((s, r) => s + r.adRatio, 0) / prevAds.length : 0;
    const curReturns = Array.from(latestSnapshot.values());
    const prevReturns = Array.from(previousSnapshot.values());
    const curReturnRate = curReturns.length > 0 ? curReturns.reduce((s, r) => s + r.returnRate, 0) / curReturns.length : 0;
    const prevReturnRate = prevReturns.length > 0 ? prevReturns.reduce((s, r) => s + r.returnRate, 0) / prevReturns.length : 0;
    const curRatings = Array.from(latestSnapshot.values()).filter((r) => r.rating > 0);
    const prevRatings = Array.from(previousSnapshot.values()).filter((r) => r.rating > 0);
    const curRating = curRatings.length > 0 ? curRatings.reduce((s, r) => s + r.rating, 0) / curRatings.length : 0;
    const prevRating = prevRatings.length > 0 ? prevRatings.reduce((s, r) => s + r.rating, 0) / prevRatings.length : 0;

    const items: WeekCompareItem[] = [
      { label: "日均销量", current: curSalesSum, previous: prevSalesSum, unit: "件" },
      { label: "广告费比", current: curAdRatio, previous: prevAdRatio, unit: "%" },
      { label: "退货退款率", current: curReturnRate, previous: prevReturnRate, unit: "%" },
      { label: "评分", current: curRating, previous: prevRating, unit: "" },
    ];
    const chartData = [
      { label: "日均销量", current: Number(curSalesSum.toFixed(1)), previous: Number(prevSalesSum.toFixed(1)) },
      { label: "广告费比", current: Number(curAdRatio.toFixed(1)), previous: Number(prevAdRatio.toFixed(1)) },
      { label: "退货退款率", current: Number(curReturnRate.toFixed(1)), previous: Number(prevReturnRate.toFixed(1)) },
      { label: "评分", current: Number(curRating.toFixed(2)), previous: Number(prevRating.toFixed(2)) },
    ];
    return { chartData, items, hasTwoWeeks: true };
  }, [latestSnapshot, previousSnapshot]);

  const activeProductGroups = useMemo(() => {
    const groups = new Set<string>();
    filteredSkuMaster.forEach((s) => {
      if (s.saleStatus !== "active") return;
      groups.add(s.groupSku || s.sku);
    });
    return groups.size;
  }, [filteredSkuMaster]);

  const activeMskuLinks = useMemo(() => filteredSkuMaster.filter((s) => s.saleStatus === "active").length, [filteredSkuMaster]);

  // ── KPI 指标值池（所有可配指标的计算结果）── 必须放在 loading 检查之前

  const totalStock = useMemo(() => filteredSkuMaster.reduce((s, sku) => {
    const inv = latestInventory.get(sku.sku);
    const wh = computeWarehouseTotals(inv);
    return s + wh.total;
  }, 0), [filteredSkuMaster, latestInventory]);

  const totalDailySales = useMemo(() => Array.from(latestSnapshot.values()).filter((snap) => {
    if (shopFilterId === "all") return true;
    return filteredSkuMaster.some((s) => s.sku === snap.sku);
  }).reduce((s, r) => s + r.dailySales7d, 0), [latestSnapshot, shopFilterId, filteredSkuMaster]);

  const wowTotalSalesDelta = useMemo(() => wowDeltas.reduce((s, d) => s + d.dailySalesDelta, 0), [wowDeltas]);
  const wowTotalStockDelta = useMemo(() => wowDeltas.reduce((s, d) => s + d.stockDelta, 0), [wowDeltas]);

  const kpiValues = useMemo((): Record<KpiMetricKey, { value: string | number; sub: React.ReactNode }> => {
    const avgMarginVal = filteredSkuMaster.filter((s) => s.saleStatus === "active").reduce((sum, s, _, arr) => {
      const cost = (s.costFob ?? 0) + (s.costShipping ?? 0) + (s.costDelivery ?? 0) + (s.costCommission ?? 0) + (s.costStorage ?? 0) + (s.costReturn ?? 0) + (s.costAd ?? 0) + (s.coupon ?? 0);
      return s.price > 0 ? sum + (s.price - cost) / s.price * 100 : sum;
    }, 0) / (filteredSkuMaster.filter((s) => s.saleStatus === "active").length || 1);

    const avgAdRatioVal = Array.from(latestSnapshot.values()).filter((r) => r.adRatio > 0 && (shopFilterId === "all" || filteredSkuMaster.some((s) => s.sku === r.sku))).reduce((sum, r, _, arr) => sum + r.adRatio / arr.length, 0);

    const urgent = filteredAlerts.filter((a) => a.severity !== "info").length;

    return {
      activeSkus: { value: activeProductGroups, sub: `共用 ${activeMskuLinks} 个 MSKU 链接` },
      activeMsku: { value: activeMskuLinks, sub: "所有活跃链接汇总" },
      totalStock: { value: totalStock.toLocaleString(), sub: wowDeltas.length > 0 ? <span className="text-[11px]">{deltaArrow(wowTotalStockDelta)} vs 上期</span> : "四仓在库+在途" },
      dailySales: { value: totalDailySales.toFixed(1), sub: wowDeltas.length > 0 ? <span className="text-[11px]">较上期 {deltaArrow(wowTotalSalesDelta)}</span> : "近 7 天日均汇总" },
      avgMargin: { value: `${avgMarginVal.toFixed(1)}%`, sub: "所有活跃 SKU 均价利润率" },
      avgAdRatio: { value: `${avgAdRatioVal.toFixed(1)}%`, sub: "近 7 天均值 · 广告费÷售价" },
      alertsCount: { value: urgent, sub: `Critical ${filteredAlerts.filter((a) => a.severity === "critical").length} · Warning ${filteredAlerts.filter((a) => a.severity === "warning").length}` },
      shipmentCount: { value: filteredShipmentSuggestions.length, sub: `${filteredShipmentSuggestions.filter((s) => s.priority === "urgent").length} 个紧急` },
      promoCount: { value: filteredPromotions.filter((p) => p.status === "upcoming" || p.status === "active").length, sub: `${filteredPromotions.filter((p) => p.status === "active").length} 个进行中` },
      todoCount: { value: todos.filter((t) => !t.completed).length, sub: `${todos.filter((t) => !t.completed && t.dueDate && t.dueDate < today).length} 个已逾期` },
    };
  }, [activeProductGroups, activeMskuLinks, totalStock, totalDailySales, wowDeltas, wowTotalStockDelta, wowTotalSalesDelta, filteredSkuMaster, latestSnapshot, filteredAlerts, filteredShipmentSuggestions, filteredPromotions, todos, today, shopFilterId]);

  // ── 健康度最低 TOP10 ──
  const healthTop10 = useMemo(() => {
    if (!healthScores || healthScores.size === 0) return [];
    return Array.from(healthScores.entries())
      .map(([sku, hs]) => ({ sku, score: hs.score, level: hs.level, factors: hs.factors }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);
  }, [healthScores]);

  const healthLevelBadge = (level: "健康" | "关注" | "风险") => {
    if (level === "健康") return "bg-accent-50 text-accent-700 border-accent-200";
    if (level === "关注") return "bg-secondary-100 text-secondary-700 border-secondary-200";
    return "bg-red-50 text-red-600 border-red-200";
  };

  if (loading) return <div className="text-sm text-foreground-400">加载中...</div>;

  const avgMarginChange = wowDeltas.length > 0 ? wowDeltas.reduce((s, d) => s + d.profitMarginDelta, 0) / wowDeltas.length : 0;
  const avgRatingChange = wowDeltas.length > 0 ? wowDeltas.reduce((s, d) => s + d.ratingDelta, 0) / wowDeltas.length : 0;

  const criticalCount = filteredAlerts.filter((a) => a.severity === "critical").length;
  const warnCount = filteredAlerts.filter((a) => a.severity === "warning").length;
  const infoCount = filteredAlerts.filter((a) => a.severity === "info").length;
  const urgentAlertCount = criticalCount + warnCount;
  const groupCount = (t: AlertType) => filteredAlerts.filter((a) => a.type === t).length;

  const activePromos = filteredPromotions.filter((p) => p.status === "upcoming" || p.status === "active");

  const buckets: Array<{
    key: string; title: string; icon: string;
    tone: "danger" | "warn" | "primary" | "accent" | "secondary";
    types: AlertType[]; href: string;
  }> = [
    { key: "stock", title: "库存风险", icon: "ri-inbox-2-line", tone: "danger", types: ["stockout", "low_stock", "overstock"], href: "/risk?type=stock" },
    { key: "profit", title: "利润风险", icon: "ri-money-dollar-circle-line", tone: "warn", types: ["profit"], href: "/operations?tab=profit" },
    { key: "ad", title: "广告风险", icon: "ri-megaphone-line", tone: "primary", types: ["ad"], href: "/operations?tab=ad" },
    { key: "rating", title: "评分风险", icon: "ri-star-half-line", tone: "warn", types: ["rating"], href: "/operations?tab=rating" },
    { key: "return", title: "退货风险", icon: "ri-arrow-go-back-line", tone: "secondary", types: ["return", "review"], href: "/operations?tab=return" },
  ];

  // ── Section renderers ──
  const sections: Record<DashboardSectionKey, React.ReactNode> = {
    kpi: (
      <div>
        {customizing && (
          <div className="mb-3 rounded-xl border border-dashed border-accent-200 bg-accent-50/50 px-4 py-2.5 text-[12px] text-accent-800">
            <i className="ri-information-line mr-1" aria-hidden />
            自定义模式下，每张 KPI 卡片可通过下拉框切换展示的指标。设置自动保存。
          </div>
        )}
        <div className="grid grid-cols-4 gap-4">
          {kpiSlots.map((metricKey, idx) => {
            const meta = kpiValues[metricKey];
            if (!meta) return null;
            return (
              <div key={idx} className="relative">
                {customizing && (
                  <select
                    value={metricKey}
                    onChange={(e) => setKpiSlot(idx, e.target.value as KpiMetricKey)}
                    className="absolute -top-1 left-2 z-10 rounded-md border border-accent-300/70 bg-background-50 px-2 py-0.5 text-[10px] font-medium text-foreground-700 focus:border-accent-500 focus:outline-none cursor-pointer max-w-[calc(100%-16px)]"
                  >
                    {Object.entries(KPI_METRIC_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                )}
                <KpiCard
                  label={KPI_METRIC_LABELS[metricKey]}
                  value={meta.value}
                  sub={meta.sub}
                  icon={KPI_METRIC_ICONS[metricKey]}
                  tone={KPI_METRIC_TONES[metricKey]}
                />
              </div>
            );
          })}
        </div>
      </div>
    ),

    todo: todos.length > 0 ? (
      <Section title="我的待办" icon="ri-list-check-3" subtitle={`${todos.length} 条未完成`}
        action={<Link to="/todo" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">管理待办 →</Link>}
      >
        <div className="space-y-2">
          {todos.slice(0, 5).map((item) => {
            const isOverdue = item.dueDate && item.dueDate < today;
            return (
              <div key={item.id} className={`flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5 ${isOverdue ? "border-red-200 bg-red-50/50" : "border-background-200 bg-background-50/60"}`}>
                <i className={`text-[16px] ${isOverdue ? "ri-alert-line text-red-500" : "ri-checkbox-blank-circle-line text-foreground-400"}`} aria-hidden />
                <span className={`flex-1 text-[13px] ${isOverdue ? "text-red-700" : "text-foreground-800"}`}>{item.content}</span>
                {item.relatedSku && (
                  <Link to={`/sku/${encodeURIComponent(item.relatedSku)}`} className="rounded-lg bg-background-100 px-2 py-0.5 text-[11px] font-medium text-foreground-600 hover:bg-background-200 cursor-pointer whitespace-nowrap">
                    {item.relatedSku}
                  </Link>
                )}
                {item.dueDate && (
                  <span className={`text-[11px] whitespace-nowrap ${isOverdue ? "text-red-600 font-medium" : "text-foreground-400"}`}>{item.dueDate}</span>
                )}
              </div>
            );
          })}
          {todos.length > 5 && (
            <div className="text-center text-[12px] text-foreground-400">
              还有 {todos.length - 5} 条，<Link to="/todo" className="text-foreground-600 hover:underline cursor-pointer">查看全部</Link>
            </div>
          )}
        </div>
      </Section>
    ) : null,

    opsLogs: (
      <Section title="近期操作记录" icon="ri-history-line" subtitle={`${opsLogs.length} 条`}
        action={<Link to="/ops-logs" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">查看全部 →</Link>}
      >
        {opsLogs.length === 0 ? (
          <EmptyState icon="ri-history-line" title="暂无操作记录" desc="去 SKU 详情页记录运营操作" />
        ) : (
          <div className="space-y-2">
            {opsLogs.slice(0, 5).map((log) => {
              const dateLabel = log.date === today ? "今天" : log.date === yesterday ? "昨天" : log.date;
              return (
                <Link
                  key={log.id}
                  to={`/sku/${encodeURIComponent(log.sku)}`}
                  className="flex items-start gap-3 rounded-[14px] border border-background-200/70 bg-background-50 px-3.5 py-2.5 transition-all hover:border-background-300 hover:shadow-sm"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-[14px] text-primary-700">
                    <i className="ri-file-edit-line" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground-900">{log.action}</span>
                      {log.msku && <span className="text-[11px] text-foreground-500">{log.msku}</span>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-foreground-600 truncate">{log.detail}</div>
                    <div className="mt-0.5 text-[11px] text-foreground-400">{dateLabel}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Section>
    ),

    weekCompare: (
      <Section title="本周 vs 上周环比对比" icon="ri-bar-chart-grouped-line" subtitle="柱状图对比近7天 vs 上期近7天 · 销量 / 广告费比 / 退货退款率 / 评分">
        {weekCompare.hasTwoWeeks ? (
          <div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekCompare.chartData} barCategoryGap="30%" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-300))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 14, border: "1px solid oklch(var(--background-300))", background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                  <Bar dataKey="current" fill="oklch(var(--foreground-500))" radius={[8, 8, 0, 0]} name="本周" />
                  <Bar dataKey="previous" fill="oklch(var(--background-400))" radius={[8, 8, 0, 0]} name="上周" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {weekCompare.items.map((item) => {
                const delta = item.previous > 0 ? ((item.current - item.previous) / item.previous * 100) : 0;
                const isUp = delta >= 0;
                const isGood = item.label === "广告费比" || item.label === "退货退款率" ? !isUp : isUp;
                return (
                  <div key={item.label} className="glass-card p-4 text-center">
                    <div className="text-[11px] font-medium text-foreground-400">{item.label}</div>
                    <div className="mt-1 flex items-center justify-center gap-1.5">
                      <span className="mono-num text-[15px] font-bold">{item.current.toFixed(item.label === "评分" ? 2 : 1)}{item.unit}</span>
                      <span className={`text-[11px] font-medium ${isGood ? "text-accent-600" : "text-red-500"}`}>
                        {isUp ? "↑" : "↓"}{Math.abs(delta).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="glass-card px-4 py-8 text-center">
            <i className="ri-bar-chart-grouped-line mb-3 block text-[32px] text-foreground-300" aria-hidden />
            <p className="text-[13px] text-foreground-400">暂无上周数据，下周上传后可查看环比</p>
            <Link to="/import" className="apple-btn mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-medium cursor-pointer">
              <i className="ri-upload-cloud-2-line" aria-hidden />
              去导入数据
            </Link>
          </div>
        )}
      </Section>
    ),

    promotions: activePromos.length > 0 ? (
      <Section title="促销活动" icon="ri-calendar-event-line"
        subtitle={activePromos.filter((p) => p.status === "upcoming").length > 0
          ? `即将开始 ${activePromos.filter((p) => p.status === "upcoming").length} 个 · 进行中 ${activePromos.filter((p) => p.status === "active").length} 个`
          : `进行中 ${activePromos.length} 个`}
        action={
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPromosExpanded(!promosExpanded)}
              className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">
              {promosExpanded ? "收起表格" : `展开（${activePromos.length} 个）`}
            </button>
            <Link to="/settings" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">管理促销 →</Link>
          </div>
        }
      >
        {!promosExpanded ? (
          <div className="glass-card px-4 py-3 text-[13px] text-foreground-600">
            <i className="ri-calendar-event-line mr-1.5 text-accent-600" aria-hidden />
            {activePromos.length} 个进行中/待开始 —{" "}
            {activePromos.filter((p) => p.status === "active").slice(0, 2).map((p, i) => (
              <span key={p.id}>{i > 0 && "、"}<Badge tone="accent">{p.type}</Badge> {p.skuName ?? p.sku}</span>
            ))}
            {activePromos.length > 2 && <span className="text-foreground-400"> 等 {activePromos.length - 2} 个活动</span>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-400">
                  <th className="border-b border-background-200 px-3 py-2.5">产品</th>
                  <th className="border-b border-background-200 px-3 py-2.5">店铺</th>
                  <th className="border-b border-background-200 px-3 py-2.5">类型</th>
                  <th className="border-b border-background-200 px-3 py-2.5">活动名称</th>
                  <th className="border-b border-background-200 px-3 py-2.5">开始</th>
                  <th className="border-b border-background-200 px-3 py-2.5">结束</th>
                  <th className="border-b border-background-200 px-3 py-2.5">状态</th>
                </tr>
              </thead>
              <tbody>
                {activePromos.map((p) => {
                  const daysToStart = Math.ceil((new Date(p.startDate).getTime() - new Date(today).getTime()) / 86400000);
                  const daysToEnd = Math.ceil((new Date(p.endDate).getTime() - new Date(today).getTime()) / 86400000);
                  return (
                    <tr key={p.id}>
                      <td className="border-b border-background-200/50 px-3 py-2 font-medium text-foreground-900">{p.skuName ?? p.sku}</td>
                      <td className="mono-num border-b border-background-200/50 px-3 py-2 text-[12px] text-foreground-500">{shopsMap.get(p.store) || p.store}</td>
                      <td className="border-b border-background-200/50 px-3 py-2"><Badge tone={p.type === "BD" ? "primary" : p.type === "LD" ? "danger" : p.type === "7DD" ? "warn" : "accent"}>{p.type}</Badge></td>
                      <td className="border-b border-background-200/50 px-3 py-2 text-foreground-700">{p.name}</td>
                      <td className="mono-num border-b border-background-200/50 px-3 py-2 text-[12px]"><span className="flex items-center gap-1.5">{p.startDate}{p.status === "upcoming" && daysToStart <= 2 && daysToStart >= 0 && <Badge tone="warn">{daysToStart === 0 ? "今天" : `${daysToStart}d`}</Badge>}</span></td>
                      <td className="mono-num border-b border-background-200/50 px-3 py-2 text-[12px]"><span className="flex items-center gap-1.5">{p.endDate}{daysToEnd <= 2 && daysToEnd >= 0 && <Badge tone="danger">{daysToEnd === 0 ? "今天" : `${daysToEnd}d`}</Badge>}</span></td>
                      <td className="border-b border-background-200/50 px-3 py-2">
                        <span className={["rounded-full px-2.5 py-0.5 text-[11px] font-medium", p.status === "active" ? "bg-accent-50 text-accent-700" : "bg-background-100 text-foreground-500"].join(" ")}>
                          {p.status === "active" ? "进行中" : "待开始"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    ) : null,

    riskBuckets: (
      <Section title="今日需要处理的事" subtitle="按类型聚合，点击查看详情" icon="ri-flashlight-line">
        <div className="grid grid-cols-6 gap-3">
          {buckets.map((b) => {
            const count = b.types.reduce((s, t) => s + groupCount(t), 0);
            const badgeBg = b.tone === "danger" ? "bg-red-500" : b.tone === "warn" ? "bg-secondary-500" : b.tone === "primary" ? "bg-foreground-800" : b.tone === "accent" ? "bg-accent-500" : "bg-foreground-400";
            return (
              <Link key={b.key} to={b.href} className="glass-card glass-card-hover group flex flex-col p-4 cursor-pointer">
                <div className="flex items-center justify-between">
                  <span className={["flex h-9 w-9 items-center justify-center rounded-[12px] text-[17px] transition-transform group-hover:scale-110",
                    b.tone === "danger" ? "bg-red-50 text-red-500" : b.tone === "warn" ? "bg-secondary-100 text-secondary-700" : b.tone === "primary" ? "bg-foreground-100 text-foreground-700" : b.tone === "accent" ? "bg-accent-50 text-accent-600" : "bg-background-100 text-foreground-500"
                  ].join(" ")}>
                    <i className={b.icon} aria-hidden />
                  </span>
                  {count > 0 && <span className={`flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${badgeBg}`}>{count}</span>}
                </div>
                <div className="mt-3 text-[13px] font-semibold text-foreground-800">{b.title}</div>
                <div className="mt-0.5 text-[11px] text-foreground-400">{count > 0 ? "点击查看" : "全部正常"}</div>
              </Link>
            );
          })}
        </div>
      </Section>
    ),

    alerts: (
      <Section title="紧急告警" subtitle={`Critical ${criticalCount} · Warning ${warnCount}`} icon="ri-alarm-warning-line"
        className="lg:col-span-2"
        action={
          alerts.length > 5 ? (
            <button type="button" onClick={() => setAlertsExpanded(!alertsExpanded)}
              className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">
              {alertsExpanded ? "收起" : `查看全部（${urgentAlertCount}）`}
            </button>
          ) : (
            <Link to="/risk" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">查看全部 →</Link>
          )
        }
      >
        {alerts.length === 0 ? (
          <EmptyState icon="ri-check-double-line" title="今天一切正常" desc="没有需要处理的异常，可以专注新的运营任务" />
        ) : (
          <>
            <AlertList alerts={[...alerts]
              .filter((a) => a.severity !== "info")
              .sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1))
              .slice(0, alertsExpanded ? urgentAlertCount : 5)} />
            {urgentAlertCount > 5 && !alertsExpanded && (
              <div className="mt-2 text-center text-[12px] text-foreground-400">还有 {urgentAlertCount - 5} 条告警未显示</div>
            )}
          </>
        )}
      </Section>
    ),

    shipment: (
      <Section title="今日发货建议" subtitle={`共 ${shipmentSuggestions.length} 个 SKU`} icon="ri-truck-line"
        action={
          shipmentSuggestions.length > 4 ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShipmentExpanded(!shipmentExpanded)}
                className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">
                {shipmentExpanded ? "收起" : `展开全部（${shipmentSuggestions.length}）`}
              </button>
              <Link to="/shipment" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">决策中心 →</Link>
            </div>
          ) : (
            <Link to="/shipment" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">前往决策中心 →</Link>
          )
        }
      >
        {shipmentSuggestions.length === 0 ? (
          <EmptyState icon="ri-truck-line" title="暂无需要发货" desc="所有 SKU 库存都够覆盖目标天数" />
        ) : (
          <ul className="space-y-2.5">
            {shipmentSuggestions
              .filter((s) => (shipmentExpanded ? true : s.priority === "urgent"))
              .slice(0, shipmentExpanded ? shipmentSuggestions.length : 4)
              .map((s) => (
                <li key={s.sku} className="glass-card-hover glass-card p-3.5 cursor-default">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <Link to={`/sku/${encodeURIComponent(s.sku)}`} className="text-[13px] font-semibold text-foreground-900 hover:text-foreground-600 cursor-pointer">{s.skuName}</Link>
                      <div className="mt-0.5 mono-num text-[11px] text-foreground-400">建议 {s.suggestQty} 件 · 最晚 {s.latestShipDate}</div>
                    </div>
                    {(() => {
                      const days = s.daysOfCoverOnHand;
                      if (days <= 0) return <Badge tone="danger">URGENT</Badge>;
                      if (days <= 3) return <Badge tone="warn">高优</Badge>;
                      if (days <= 7) return <Badge tone="secondary">关注</Badge>;
                      return <Badge tone="accent">正常</Badge>;
                    })()}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Section>
    ),

    wowBar: wowDeltas.length > 0 ? (
      <div className="glass-card flex flex-wrap items-center gap-3 px-5 py-3.5">
        <span className="text-[12px] font-semibold text-foreground-700">上期对比</span>
        <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>日均销量</span>{deltaArrow(wowTotalSalesDelta)}</div>
        <span className="text-foreground-300">·</span>
        <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>库存</span>{deltaArrow(wowTotalStockDelta, true)}</div>
        <span className="text-foreground-300">·</span>
        <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>平均利润率</span>{deltaArrow(avgMarginChange)}</div>
        <span className="text-foreground-300">·</span>
        <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>平均评分</span>{deltaArrow(avgRatingChange)}</div>
        <Link to="/sku" className="ml-auto text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">查看 SKU 列表 →</Link>
      </div>
    ) : null,
  };

  // ── Main render ──
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-heading text-[32px] font-bold leading-tight text-foreground-950 tracking-tight">
              今日运营驾驶舱
            </h1>
            <select
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
              className="rounded-lg border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] font-medium text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="all">全部店铺</option>
              {shops.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
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
        <p className="text-[13px] text-foreground-400">
          {criticalCount} 个需要立即处理 · {warnCount} 个需要关注{infoCount > 0 ? ` · ${infoCount} 个提醒` : ""} ·{" "}
          {filteredShipmentSuggestions.length} 个 SKU 建议发货
          {activePromos.length > 0 && ` · ${activePromos.length} 个促销进行中/待开始`}
        </p>
      </div>

      {/* ── 驾驶舱：每天打开第一眼知道该处理什么 ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Link to="/risk" className="glass-card glass-card-hover group flex flex-col justify-center p-5 cursor-pointer">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-400">今日紧急异常</div>
          <div className={`mono-num mt-2 font-heading text-[44px] font-bold leading-none ${urgentAlertCount > 0 ? "text-red-600" : "text-accent-600"}`}>{urgentAlertCount}</div>
          <div className="mt-2 text-[12px] text-foreground-500">紧急 {criticalCount} · 关注 {warnCount}</div>
        </Link>
        {[
          { title: "库存风险", icon: "ri-inbox-2-line", tone: "danger", count: groupCount("stockout") + groupCount("low_stock") + groupCount("overstock"), href: "/risk?type=stock" },
          { title: "利润风险", icon: "ri-money-dollar-circle-line", tone: "warn", count: groupCount("profit"), href: "/operations?tab=profit" },
          { title: "广告风险", icon: "ri-megaphone-line", tone: "primary", count: groupCount("ad"), href: "/operations?tab=ad" },
          { title: "评分风险", icon: "ri-star-half-line", tone: "warn", count: groupCount("rating"), href: "/operations?tab=rating" },
        ].map((c) => {
          const toneCls = c.tone === "danger"
            ? "bg-red-50 text-red-500"
            : c.tone === "warn"
            ? "bg-secondary-100 text-secondary-700"
            : "bg-foreground-100 text-foreground-700";
          return (
            <Link key={c.title} to={c.href} className="glass-card glass-card-hover group flex flex-col justify-center p-5 cursor-pointer">
              <div className="flex items-center justify-between">
                <span className={`flex h-9 w-9 items-center justify-center rounded-[12px] text-[17px] transition-transform group-hover:scale-110 ${toneCls}`}>
                  <i className={c.icon} aria-hidden />
                </span>
                {c.count > 0 && (
                  <span className={`flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${c.tone === "danger" ? "bg-red-500" : c.tone === "warn" ? "bg-secondary-500" : "bg-foreground-800"}`}>{c.count}</span>
                )}
              </div>
              <div className="mt-3 text-[13px] font-semibold text-foreground-800">{c.title}</div>
              <div className="mt-0.5 text-[11px] text-foreground-400">{c.count > 0 ? "点击查看" : "全部正常"}</div>
            </Link>
          );
        })}
      </div>

      {/* ── 健康度最低 TOP10 ── */}
      {healthTop10.length > 0 && (
        <Section title="健康度最低 TOP10" subtitle="按综合健康分升序，优先处理低分 SKU" icon="ri-heart-pulse-line"
          collapsible
          defaultCollapsed
          action={<Link to="/sku" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">查看全部 SKU →</Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-400">
                  <th className="border-b border-background-200 px-3 py-2.5">排名</th>
                  <th className="border-b border-background-200 px-3 py-2.5">SKU</th>
                  <th className="border-b border-background-200 px-3 py-2.5">健康分</th>
                  <th className="border-b border-background-200 px-3 py-2.5">主要风险因子</th>
                </tr>
              </thead>
              <tbody>
                {healthTop10.map((row, idx) => (
                  <tr key={row.sku} className="group">
                    <td className="border-b border-background-200/50 px-3 py-2.5 text-[12px] text-foreground-400">{idx + 1}</td>
                    <td className="border-b border-background-200/50 px-3 py-2.5">
                      <Link to={`/sku/${encodeURIComponent(row.sku)}`} className="font-medium text-foreground-900 hover:text-primary-700 hover:underline cursor-pointer">
                        {row.sku}
                      </Link>
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5">
                      <span className={`mono-num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${healthLevelBadge(row.level)}`}>
                        {row.score}
                        <span className="text-[11px] font-semibold">{row.level}</span>
                      </span>
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {row.factors.length === 0 ? (
                          <span className="text-[12px] text-foreground-400">无明显风险因子</span>
                        ) : (
                          row.factors.slice(0, 2).map((f) => (
                            <span key={f.key} className="inline-flex items-center rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                              {f.label}
                              <span className="ml-1 text-red-400">-{f.impact}</span>
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Layout Customizer */}
      {customizing && (
        <LayoutCustomizer
          visibleKeys={visibleKeys}
          orderedKeys={orderedKeys}
          allKeys={["kpi", "todo", "opsLogs", "weekCompare", "promotions", "riskBuckets", "alerts", "shipment", "wowBar"]}
          toggle={toggleSection}
          move={moveSection}
          onClose={() => setCustomizing(false)}
          onReset={reset}
        />
      )}

      {/* Sections in custom order */}
      {orderedKeys.map((key) => {
        const node = sections[key];
        if (!node) return null;
        // alerts + shipment side-by-side special layout
        if (key === "alerts") {
          const shipmentNode = orderedKeys.includes("shipment") ? sections.shipment : null;
          if (shipmentNode && orderedKeys.indexOf("shipment") === orderedKeys.indexOf(key) + 1) {
            return (
              <div key="alerts-shipment" className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">{node}</div>
                <div>{shipmentNode}</div>
              </div>
            );
          }
        }
        if (key === "shipment") {
          const alertIdx = orderedKeys.indexOf("alerts");
          const shipIdx = orderedKeys.indexOf("shipment");
          if (alertIdx !== -1 && shipIdx === alertIdx + 1) return null; // rendered together above
        }
        return <div key={key}>{node}</div>;
      })}
    </div>
  );
}