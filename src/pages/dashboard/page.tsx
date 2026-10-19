import { useMemo, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { type LayoutItem } from "react-grid-layout";
import { useOpsData } from "@/domain/store";
import { computeAll, computeWarehouseTotals } from "@/domain/calculator";
import { snapKey } from "@/domain/engine";
import { db } from "@/domain/db";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import CanvasLayout, { CanvasItem } from "@/components/layout/CanvasLayout";
import type { AlertType, TodoItem, OpsLog, SkuMaster } from "@/domain/types";
import AlertList from "./AlertList";
import LayoutCustomizer from "@/components/layout/LayoutCustomizer";
import { useDashboardLayout, type DashboardSectionKey, type KpiMetricKey, KPI_METRIC_LABELS, KPI_METRIC_ICONS, KPI_METRIC_TONES, type GridItemLayout } from "@/hooks/useLayoutPrefs";

const deltaArrow = (v: number, inverse = false) => {
  if (Math.abs(v) < 0.01) return <span className="text-foreground-400">→ 0</span>;
  const good = inverse ? v < 0 : v > 0;
  const color = good ? "text-accent-600" : "text-red-500";
  const arrow = v > 0 ? "↑" : "↓";
  return <span className={color}>{arrow} {Math.abs(v).toFixed(1)}</span>;
};

/* ── 近 14 天分日走势：可切换指标 ── */
const WEEK_METRICS = [
  { key: "sales", label: "销量", unit: " 件", color: "#3b82f6", goodWhenUp: true },
  { key: "adRatio", label: "广告费比", unit: "%", color: "#f59e0b", goodWhenUp: false },
  { key: "returnRate", label: "退货率", unit: "%", color: "#ef4444", goodWhenUp: false },
  { key: "rating", label: "评分", unit: "", color: "#10b981", goodWhenUp: true },
] as const;
type WeekMetricKey = (typeof WEEK_METRICS)[number]["key"];

/** ISO 日期 → 相对今天的人话：今天 / 明天 / 后天 / N 天后 / 已过 N 天 */
const relativeDayLabel = (date: string, today: string) => {
  const n = Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / 86400000);
  if (n === 0) return "今天";
  if (n === 1) return "明天";
  if (n === 2) return "后天";
  if (n < 0) return `已过 ${-n} 天`;
  return `${n} 天后`;
};

/* ─────────────────────────────────────── */
export default function Dashboard() {
  const {
    loading, skuMaster, alerts, promotions,
    shipmentSuggestions, wowDeltas, latestSnapshot,
    latestInventory, today, currentSite,
    currentShopId, shops, snapshots,
  } = useOpsData();

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [opsLogs, setOpsLogs] = useState<OpsLog[]>([]);
  const [promosExpanded, setPromosExpanded] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [shipmentExpanded, setShipmentExpanded] = useState(false);
  const [weekMetric, setWeekMetric] = useState<WeekMetricKey>("sales");

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

  const shopsMap = useMemo(() => {
    const map = new Map<string, string>();
    shops.forEach((s) => { map.set(s.id, s.name); });
    return map;
  }, [shops]);

  const {
    customizing, setCustomizing, toggleSection, reset, setKpiSlot,
    visibleKeys, kpiSlots, gridLayout, setGridLayout, allKeys,
    resetItemSize, resetItemPosition,
  } = useDashboardLayout();

  // ── 构建 ReactGridLayout 布局数组 ──
  const rglLayout: LayoutItem[] = useMemo(() => {
    return visibleKeys.map((key) => {
      const item = (gridLayout as Record<string, GridItemLayout>)[key] ?? { x: 0, y: 0, w: 12, h: 6 };
      // Clamp all values to prevent 0-width/height cards from corrupting the layout
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

  const handleLayoutChange = useCallback((layout: LayoutItem[]) => {
    setGridLayout(layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
  }, [setGridLayout]);

  // ── 近 14 天分日聚合（店铺/站点过滤已在 useOpsData 内完成）──
  const dailySeries = useMemo(() => {
    const byDate = new Map<string, { sales: number; adSum: number; adN: number; retSum: number; retN: number; ratSum: number; ratN: number }>();
    for (const s of snapshots) {
      let d = byDate.get(s.date);
      if (!d) {
        d = { sales: 0, adSum: 0, adN: 0, retSum: 0, retN: 0, ratSum: 0, ratN: 0 };
        byDate.set(s.date, d);
      }
      d.sales += s.dailySales7d;
      if (s.adRatio > 0) { d.adSum += s.adRatio; d.adN += 1; }
      if (s.returnRate > 0) { d.retSum += s.returnRate; d.retN += 1; }
      if (s.rating > 0) { d.ratSum += s.rating; d.ratN += 1; }
    }
    return [...byDate.keys()].sort().slice(-14).map((date) => {
      const d = byDate.get(date)!;
      return {
        date,
        label: date.slice(5),
        sales: Number(d.sales.toFixed(1)),
        adRatio: d.adN > 0 ? Number((d.adSum / d.adN).toFixed(1)) : 0,
        returnRate: d.retN > 0 ? Number((d.retSum / d.retN).toFixed(1)) : 0,
        rating: d.ratN > 0 ? Number((d.ratSum / d.ratN).toFixed(2)) : 0,
      };
    });
  }, [snapshots]);

  // 本期（近 7 天）vs 上期（再前 7 天）均值，用于卡片与参考线
  const weekCompare = useMemo((): {
    current: Record<WeekMetricKey, number>;
    previous: Record<WeekMetricKey, number> | null;
  } => {
    const s = dailySeries;
    const calc = (rows: typeof s): Record<WeekMetricKey, number> => {
      const avg = (f: (d: (typeof s)[number]) => number) =>
        rows.length > 0 ? rows.reduce((sum, d) => sum + f(d), 0) / rows.length : 0;
      return {
        sales: avg((d) => d.sales),
        adRatio: avg((d) => d.adRatio),
        returnRate: avg((d) => d.returnRate),
        rating: avg((d) => d.rating),
      };
    };
    const cur = s.slice(-7);
    const prev = s.length >= 8 ? s.slice(Math.max(0, s.length - 14), s.length - 7) : [];
    return { current: calc(cur), previous: prev.length > 0 ? calc(prev) : null };
  }, [dailySeries]);

  const activeProductGroups = useMemo(() => {
    const groups = new Set<string>();
    skuMaster.forEach((s) => {
      if (s.saleStatus !== "active") return;
      groups.add(s.groupSku || s.sku);
    });
    return groups.size;
  }, [skuMaster]);

  const activeMskuLinks = useMemo(() => skuMaster.filter((s) => s.saleStatus === "active").length, [skuMaster]);

  // ── KPI 指标值池（所有可配指标的计算结果）── 必须放在 loading 检查之前

  const totalStock = useMemo(() => skuMaster.reduce((s, sku) => {
    const inv = latestInventory.get(snapKey(sku.sku, sku.siteId));
    const wh = computeWarehouseTotals(inv);
    return s + wh.total;
  }, 0), [skuMaster, latestInventory]);

  const totalDailySales = useMemo(() => skuMaster.reduce((s, sku) => {
    const snap = latestSnapshot.get(snapKey(sku.sku, sku.siteId));
    return s + (snap?.dailySales7d ?? 0);
  }, 0), [skuMaster, latestSnapshot]);

  const wowTotalSalesDelta = useMemo(() => wowDeltas.reduce((s, d) => s + d.dailySalesDelta, 0), [wowDeltas]);
  const wowTotalStockDelta = useMemo(() => wowDeltas.reduce((s, d) => s + d.stockDelta, 0), [wowDeltas]);

  const kpiValues = useMemo((): Record<KpiMetricKey, { value: string | number; sub: React.ReactNode }> => {
    const activeSkusList = skuMaster.filter((s) => s.saleStatus === "active");
    const avgMarginVal = activeSkusList.reduce((sum, s) => {
      const key = snapKey(s.sku, s.siteId);
      const snap = latestSnapshot.get(key);
      const inv = latestInventory.get(key);
      const calc = computeAll({ sku: s, snap, inv, defaultCommissionRate: currentSite?.commissionRate });
      return sum + calc.grossMargin;
    }, 0) / (activeSkusList.length || 1);

    const adSnaps = Array.from(latestSnapshot.values()).filter((r) => r.adRatio > 0);
    const avgAdRatioVal = adSnaps.length ? adSnaps.reduce((sum, r) => sum + r.adRatio, 0) / adSnaps.length : 0;

    const urgent = alerts.filter((a) => a.severity !== "info").length;

    return {
      activeSkus: { value: activeProductGroups, sub: `共用 ${activeMskuLinks} 个 MSKU 链接` },
      activeMsku: { value: activeMskuLinks, sub: "所有活跃链接汇总" },
      totalStock: { value: totalStock.toLocaleString(), sub: wowDeltas.length > 0 ? <span className="text-[11px]">{deltaArrow(wowTotalStockDelta)} vs 上期</span> : "四仓在库+在途" },
      dailySales: { value: totalDailySales.toFixed(1), sub: wowDeltas.length > 0 ? <span className="text-[11px]">较上期 {deltaArrow(wowTotalSalesDelta)}</span> : "近 7 天日均汇总" },
      avgMargin: { value: `${avgMarginVal.toFixed(1)}%`, sub: "所有活跃 SKU 均价利润率" },
      avgAdRatio: { value: `${avgAdRatioVal.toFixed(1)}%`, sub: "近 7 天均值 · 广告费÷售价" },
      alertsCount: { value: urgent, sub: `Critical ${alerts.filter((a) => a.severity === "critical").length} · Warning ${alerts.filter((a) => a.severity === "warning").length}` },
      shipmentCount: { value: shipmentSuggestions.length, sub: `${shipmentSuggestions.filter((s) => s.priority === "urgent").length} 个紧急` },
      promoCount: { value: promotions.filter((p) => p.status === "upcoming" || p.status === "active").length, sub: `${promotions.filter((p) => p.status === "active").length} 个进行中` },
      todoCount: { value: todos.filter((t) => !t.completed).length, sub: `${todos.filter((t) => !t.completed && t.dueDate && t.dueDate < today).length} 个已逾期` },
    };
  }, [activeProductGroups, activeMskuLinks, totalStock, totalDailySales, wowDeltas, wowTotalStockDelta, wowTotalSalesDelta, skuMaster, latestSnapshot, latestInventory, currentSite, alerts, shipmentSuggestions, promotions, todos, today]);

  if (loading) return <div className="text-sm text-foreground-400">加载中...</div>;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const avgMarginChange = wowDeltas.length > 0 ? wowDeltas.reduce((s, d) => s + d.profitMarginDelta, 0) / wowDeltas.length : 0;
  const avgRatingChange = wowDeltas.length > 0 ? wowDeltas.reduce((s, d) => s + d.ratingDelta, 0) / wowDeltas.length : 0;

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warnCount = alerts.filter((a) => a.severity === "warning").length;
  const infoCount = alerts.filter((a) => a.severity === "info").length;
  const urgentAlertCount = criticalCount + warnCount;
  const groupCount = (t: AlertType) => alerts.filter((a) => a.type === t).length;

  const activePromos = promotions.filter((p) => p.status === "upcoming" || p.status === "active");

  const buckets: Array<{
    key: string; title: string; icon: string;
    tone: "danger" | "warn" | "primary" | "accent" | "secondary";
    types: AlertType[]; href: string;
  }> = [
    { key: "stock", title: "库存风险", icon: "ri-inbox-2-line", tone: "danger", types: ["stockout", "low_stock", "overstock"], href: "/risk?type=stock" },
    { key: "profit", title: "利润异常", icon: "ri-money-dollar-circle-line", tone: "warn", types: ["profit"], href: "/operations?tab=profit" },
    { key: "ad", title: "广告异常", icon: "ri-megaphone-line", tone: "primary", types: ["ad"], href: "/operations?tab=ad" },
    { key: "rating", title: "评分下降", icon: "ri-star-half-line", tone: "warn", types: ["rating"], href: "/operations?tab=rating" },
    { key: "return", title: "退货异常", icon: "ri-arrow-go-back-line", tone: "secondary", types: ["return", "review"], href: "/operations?tab=return" },
    { key: "listing", title: "Listing 待优化", icon: "ri-file-edit-line", tone: "accent", types: ["listing"], href: "/operations?tab=listing" },
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

    todo: (
      <Section title="我的待办" icon="ri-list-check-3" subtitle={todos.length > 0 ? `${todos.length} 条未完成` : "暂无待办"}
        action={<Link to="/todo" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">管理待办 →</Link>}
      >
        {todos.length > 0 ? (
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
        ) : (
          <EmptyState icon="ri-checkbox-circle-line" title="暂无待办" desc="所有任务已完成" />
        )}
      </Section>
    ),

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
      <Section title="指标走势 · 本期 vs 上期" icon="ri-bar-chart-grouped-line" subtitle="近 14 天分日走势，虚线为上期（前 7 天）均值 · 点击卡片切换指标">
        {dailySeries.length === 0 ? (
          <div className="glass-card px-4 py-8 text-center">
            <i className="ri-bar-chart-grouped-line mb-3 block text-[32px] text-foreground-300" aria-hidden />
            <p className="text-[13px] text-foreground-400">暂无快照数据，上传后可查看走势</p>
            <Link to="/import" className="apple-btn mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-medium cursor-pointer">
              <i className="ri-upload-cloud-2-line" aria-hidden />
              去导入数据
            </Link>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {WEEK_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setWeekMetric(m.key)}
                  className={["rounded-full border px-3 py-1 text-[12px] font-medium transition-all cursor-pointer",
                    weekMetric === m.key ? "border-transparent text-white shadow-sm" : "border-background-300/70 bg-background-50 text-foreground-600 hover:bg-background-100"].join(" ")}
                  style={weekMetric === m.key ? { backgroundColor: m.color } : undefined}
                >
                  {m.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-foreground-400">每天一个点，哪天掉量 / 飙费比一眼定位</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySeries} margin={{ top: 12, right: 16, bottom: 0, left: -8 }}>
                  <defs>
                    <linearGradient id={`grad-${weekMetric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={WEEK_METRICS.find((m) => m.key === weekMetric)!.color} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={WEEK_METRICS.find((m) => m.key === weekMetric)!.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-300))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }}
                    axisLine={false} tickLine={false}
                    domain={weekMetric === "rating" ? ["dataMin - 0.5", 5] : ["auto", "auto"]}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 14, border: "1px solid oklch(var(--background-300))", background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                  {weekCompare.previous && (
                    <ReferenceLine
                      y={Number(weekCompare.previous[weekMetric].toFixed(2))}
                      stroke="#94a3b8" strokeDasharray="5 5"
                      label={{ value: `上期均值 ${weekCompare.previous[weekMetric].toFixed(1)}${WEEK_METRICS.find((m) => m.key === weekMetric)!.unit}`, position: "insideTopRight", fontSize: 11, fill: "#64748b" }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey={weekMetric}
                    name={WEEK_METRICS.find((m) => m.key === weekMetric)!.label}
                    stroke={WEEK_METRICS.find((m) => m.key === weekMetric)!.color}
                    strokeWidth={2}
                    fill={`url(#grad-${weekMetric})`}
                    dot={{ r: 2.5, strokeWidth: 0, fill: WEEK_METRICS.find((m) => m.key === weekMetric)!.color }}
                    activeDot={{ r: 4.5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {WEEK_METRICS.map((m) => {
                const cur = weekCompare.current[m.key];
                const prev = weekCompare.previous?.[m.key];
                const delta = prev != null && prev > 0 ? ((cur - prev) / prev) * 100 : null;
                const isUp = (delta ?? 0) >= 0;
                const isGood = m.goodWhenUp ? isUp : !isUp;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setWeekMetric(m.key)}
                    className="glass-card p-4 text-center cursor-pointer transition-shadow hover:shadow-md"
                    style={weekMetric === m.key ? { boxShadow: `0 0 0 2px ${m.color}66` } : undefined}
                  >
                    <div className="text-[11px] font-medium text-foreground-400">{m.label} · 近 7 天均值</div>
                    <div className="mt-1 flex items-center justify-center gap-1.5">
                      <span className="mono-num text-[15px] font-bold">{cur.toFixed(m.key === "rating" ? 2 : 1)}{m.unit}</span>
                      {delta != null ? (
                        <span className={`text-[11px] font-medium ${isGood ? "text-accent-600" : "text-red-500"}`}>
                          {isUp ? "↑" : "↓"}{Math.abs(delta).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-foreground-400">暂无上期</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Section>
    ),

    promotions: (
      <Section title="促销活动" icon="ri-calendar-event-line"
        subtitle={activePromos.length > 0
          ? (activePromos.filter((p) => p.status === "upcoming").length > 0
            ? `即将开始 ${activePromos.filter((p) => p.status === "upcoming").length} 个 · 进行中 ${activePromos.filter((p) => p.status === "active").length} 个`
            : `进行中 ${activePromos.length} 个`)
          : "暂无进行中的促销"}
        action={
          activePromos.length > 0 ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPromosExpanded(!promosExpanded)}
                className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">
                {promosExpanded ? "收起表格" : `展开（${activePromos.length} 个）`}
              </button>
              <Link to="/settings" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">管理促销 →</Link>
            </div>
          ) : (
            <Link to="/settings" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">管理促销 →</Link>
          )
        }
      >
        {activePromos.length > 0 ? (
          !promosExpanded ? (
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
                        <td className="border-b border-background-200/50 px-3 py-2"><Badge tone={p.type === "BD" ? "primary" : p.type === "LD" ? "danger" : p.type === "Promotion" ? "warn" : "accent"}>{p.type}</Badge></td>
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
          )
        ) : (
          <EmptyState icon="ri-calendar-event-line" title="暂无促销活动" desc="当前没有进行中或待开始的促销" />
        )}
      </Section>
    ),

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
          urgentAlertCount > 5 ? (
            <button type="button" onClick={() => setAlertsExpanded(!alertsExpanded)}
              className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">
              {alertsExpanded ? "收起" : `展开全部（${urgentAlertCount}）`}
            </button>
          ) : (
            <Link to="/risk" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">查看全部 →</Link>
          )
        }
      >
        {urgentAlertCount === 0 ? (
          <EmptyState icon="ri-check-double-line" title="今天一切正常" desc="没有需要处理的异常，可以专注新的运营任务" />
        ) : (
          <AlertList
            alerts={alerts.filter((a) => a.severity !== "info")}
            skuMaster={skuMaster}
            // 收起时保证 Critical 全部露出，不被截断成「对不上」的数字
            limit={alertsExpanded ? undefined : Math.max(5, criticalCount)}
          />
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
              .map((s) => {
                const isUrgent = s.daysOfCoverOnHand <= 0;
                return (
                  <li key={s.sku} className={`glass-card-hover glass-card p-3.5 cursor-default ${isUrgent ? "border-red-300/80 bg-red-50/40" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <Link to={`/sku/${encodeURIComponent(s.sku)}`} className="text-[13px] font-semibold text-foreground-900 hover:text-foreground-600 cursor-pointer">{s.skuName}</Link>
                        <div className="mt-0.5 mono-num text-[11px] text-foreground-400">
                          建议 {s.suggestQty} 件 · 最晚 {s.latestShipDate.slice(5)}（{relativeDayLabel(s.latestShipDate, today)}）
                        </div>
                      </div>
                      {(() => {
                        const days = s.daysOfCoverOnHand;
                        if (days <= 0) return <Badge tone="danger" className="animate-pulse font-bold">URGENT</Badge>;
                        if (days <= 3) return <Badge tone="warn">高优</Badge>;
                        if (days <= 7) return <Badge tone="secondary">关注</Badge>;
                        return <Badge tone="accent">正常</Badge>;
                      })()}
                    </div>
                  </li>
                );
              })}
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
    ) : (
      <div className="glass-card flex items-center gap-3 px-5 py-3.5">
        <span className="text-[12px] font-semibold text-foreground-700">上期对比</span>
        <span className="text-[12px] text-foreground-400">暂无上期数据，下周上传后可查看环比</span>
        <Link to="/import" className="ml-auto text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer">导入数据 →</Link>
      </div>
    ),

    mskuDemo: (() => {
      const groups = new Map<string, SkuMaster[]>();
      for (const s of skuMaster) {
        const g = s.groupSku || s.sku;
        const arr = groups.get(g) ?? [];
        arr.push(s);
        groups.set(g, arr);
      }
      let best: SkuMaster[] = [];
      groups.forEach((arr) => {
        if (arr.length > best.length) best = arr;
      });
      const parent = best.find((x) => !x.groupSku) ?? best[0];
      const links = [...best].sort((a, b) => (a.groupSku ? 1 : 0) - (b.groupSku ? 1 : 0));
      const hasGroup = best.length > 1;
      return (
        <Section title="一品多链接" icon="ri-links-line"
          subtitle={hasGroup
            ? `示例：${parent?.name ?? parent?.sku} — 1 个产品建了 ${best.length} 条 MSKU 链接`
            : "同一产品在多个店铺/站点的链接聚合"}
          action={<Link to="/sku" className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap">在 SKU 列表查看 →</Link>}
        >
          {hasGroup ? (
            <div>
              <div className="space-y-2">
                {links.map((l) => {
                  const key = snapKey(l.sku, l.siteId);
                  const snap = latestSnapshot.get(key);
                  const inv = latestInventory.get(key);
                  const stock = inv ? computeWarehouseTotals(inv).total : (snap?.stockOnHand ?? 0);
                  return (
                    <div key={l.sku} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[14px] border border-background-200/70 bg-background-50/60 px-3.5 py-2.5">
                      <Link to={`/sku/${encodeURIComponent(l.sku)}`} className="text-[13px] font-semibold text-foreground-900 hover:text-foreground-600 cursor-pointer">{l.name}</Link>
                      <span className="mono-num text-[11px] text-foreground-400">{l.msku ?? l.sku}</span>
                      <Badge tone={l.groupSku ? "neutral" : "primary"}>{l.groupSku ? "子链接" : "父 SKU"}</Badge>
                      <span className="text-[11px] text-foreground-500">{shopsMap.get(l.store) ?? l.store}</span>
                      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-foreground-600">
                        <span>近 7 天日均 <b className="mono-num text-foreground-800">{(snap?.dailySales7d ?? 0).toFixed(1)}</b> 件</span>
                        <span>在库 <b className="mono-num text-foreground-800">{stock.toLocaleString()}</b> 件</span>
                        <span>费比 <b className="mono-num text-foreground-800">{(snap?.adRatio ?? 0).toFixed(1)}%</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 text-[11px] leading-relaxed text-foreground-400">
                <i className="ri-lightbulb-line mr-1" aria-hidden />
                同一父 SKU 下的链接共享成本基准与备货池：在 SKU 页把多条 MSKU 挂到同一父 SKU 后，库存与发货建议按「品」聚合，避免重复备货；告警与诊断仍精确到每条链接。
              </div>
            </div>
          ) : (
            <EmptyState icon="ri-links-line" title="暂无多链接产品" desc="在 SKU 页为产品添加子 MSKU 链接后，这里会展示一品多链接聚合视图" />
          )}
        </Section>
      );
    })(),
  };

  // ── Main render ──
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
          <h1 className="font-heading text-[32px] font-bold leading-tight text-foreground-950 tracking-tight">
            运营一览
          </h1>
          <span className="hidden items-center gap-1 text-[12px] text-foreground-400 md:inline-flex">
            <i className="ri-store-2-line text-[13px]" aria-hidden />
            数据范围：{currentShopId === "all" ? "全部店铺" : shopsMap.get(currentShopId) ?? currentShopId}
            <span className="text-foreground-300">·</span>
            <span>顶栏可切换店铺</span>
          </span>
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
          {shipmentSuggestions.length} 个 SKU 建议发货
          {activePromos.length > 0 && ` · ${activePromos.length} 个促销进行中/待开始`}
        </p>
      </div>

      {/* Layout Customizer */}
      {customizing && (
        <LayoutCustomizer
          visibleKeys={visibleKeys}
          allKeys={allKeys}
          toggle={toggleSection}
          onClose={() => setCustomizing(false)}
          onReset={reset}
        />
      )}

      {/* Canvas Layout — Notion Dashboard 风格画布 */}
      <CanvasLayout
        layout={rglLayout}
        customizing={customizing}
        onLayoutChange={handleLayoutChange}
        onHideItem={toggleSection}
        onResetItemSize={resetItemSize}
        onResetItemPosition={resetItemPosition}
      >
        {visibleKeys.map((key) => {
          const node = sections[key as DashboardSectionKey];
          if (!node) return null;
          return (
            <CanvasItem key={key} itemKey={key}>
              {node}
            </CanvasItem>
          );
        })}
      </CanvasLayout>
    </div>
  );
}