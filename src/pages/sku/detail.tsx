import React, { useMemo, useState, useCallback, useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { computeAll, computeWeeklyPromoCost, isCostFullyMissing, isReturnRateMissing, formatCoverDays, COVER_NO_SALES_SUB } from "@/domain/calculator";
import { useOpsData } from "@/domain/store";
import { computeDiagnosis, type DiagnosisResult } from "@/domain/diagnosis";
import { upsertSnapshots, db, addOpsLog, deleteOpsLog } from "@/domain/db";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import SkuLayoutCustomizer from "@/components/layout/SkuLayoutCustomizer";
import { useSkuDetailLayout } from "@/hooks/useLayoutPrefs";
import type { WowDelta } from "@/domain/engine";
import type { DailySnapshot, SkuMaster, InventoryLayer, TodoItem, OpsLog } from "@/domain/types";

const lifecycleLabel: Record<string, string> = { new: "新品", growth: "成长", mature: "成熟", clearance: "清货", eol: "停售" };
const saleStatusLabel: Record<string, string> = { active: "在售", clearance: "清货", paused: "暂停", discontinued: "停售" };
const linkTypeLabel: Record<string, string> = { main: "主链接", follow: "跟卖", backup: "备用" };

/** 取某 MSKU 的展示店铺：优先 mskuStores（导入保留的各 MSKU 店铺），否则回退 sku.store。 */
const mskuStoreOf = (sku: SkuMaster, m: string): string =>
  (sku.mskuStores && sku.mskuStores[m]) || sku.store;

// 告警类型 → 诊断页分组 key（与诊断页 tab 类型 profit/sales 对齐）
const DIAGNOSIS_GROUP: Record<string, string> = {
  stockout: "sales",
  low_stock: "sales",
  overstock: "sales",
  profit: "profit",
  ad: "profit",
  rating: "sales",
  return: "sales",
  review: "sales",
  listing: "sales",
};

const deltaArrow = (v: number, inverse = false) => {
  if (Math.abs(v) < 0.01) return <span className="text-foreground-500">→ 0</span>;
  const good = inverse ? v < 0 : v > 0;
  const color = good ? "text-accent-600" : "text-red-500";
  const arrow = v > 0 ? "↑" : "↓";
  return <span className={color}>{arrow} {Math.abs(v).toFixed(1)}</span>;
};

const inputCls = "w-full rounded-md border border-background-200 bg-background-50 px-2.5 py-1.5 text-[13px] text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50";
const selectCls = inputCls + " cursor-pointer";
const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500";

export default function SkuDetail() {
  const { sku: skuId } = useParams<{ sku: string }>();
  const [searchParams] = useSearchParams();
  const focusMsku = searchParams.get("focus") ?? undefined;
  const {
    loading,
    skuMaster,
    snapshots,
    latestInventory = new Map(),
    latestSnapshot = new Map(),
    previousSnapshot = new Map(),
    promotions = [],
    manualPromotions = [],
    shipmentSuggestions = [],
    wowDeltas = [],
    healthScores = new Map(),
    alerts = [],
    config,
    today,
    reload,
  } = useOpsData();

  const sku = useMemo(() => skuMaster.find((s) => s.sku === skuId), [skuMaster, skuId]);
  const parentSkuId = sku?.groupSku;

  // ── focus=MSKU 时（从列表点击 MSKU 跳转而来）自动滚动并高亮对应 MSKU ──
  // 向后兼容：无 focus 参数时完全不触发，详情页默认行为不变。
  useEffect(() => {
    if (!focusMsku) return;
    const el = document.getElementById(`msku-${focusMsku}`);
    if (el && typeof el.scrollIntoView === "function") {
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* jsdom 未实现，忽略 */ }
    }
  }, [focusMsku, sku]);
  const history = useMemo(() => {
    const own = snapshots.filter((s) => s.sku === skuId).sort((a, b) => a.date.localeCompare(b.date));
    if (own.length > 0) return own;
    // 子SKU无快照时继承父SKU数据
    if (parentSkuId) return snapshots.filter((s) => s.sku === parentSkuId).sort((a, b) => a.date.localeCompare(b.date));
    return own;
  }, [snapshots, skuId, parentSkuId]);
  const inv = (latestInventory.get(skuId ?? "") ?? (parentSkuId ? latestInventory.get(parentSkuId) : undefined));
  const curSnap = (latestSnapshot.get(skuId ?? "") ?? (parentSkuId ? latestSnapshot.get(parentSkuId) : undefined));
  // FIX: focus=MSKU 时（从列表点击 MSKU 跳转），用 mskuMetrics 中的独立指标覆盖家族级快照，
  //      这样详情页 KPI 卡片/评分/退货率/退款率/广告费比 都展示该 MSKU 自身的值，
  //      而非家族平均值。无 focus 参数或无 mskuMetrics 时回退到 curSnap（向后兼容）。
  const focusMetric = (sku && focusMsku && sku.mskuMetrics) ? sku.mskuMetrics[focusMsku] : undefined;
  const focusedSnap: DailySnapshot | undefined = (focusMetric && curSnap) ? {
    ...curSnap,
    rating: focusMetric.rating ?? curSnap.rating,
    reviewCount: focusMetric.reviewCount ?? curSnap.reviewCount,
    adRatio: focusMetric.adRatio ?? curSnap.adRatio,
    returnRate: focusMetric.returnRate ?? curSnap.returnRate,
    refundRate: focusMetric.refundRate ?? curSnap.refundRate,
    dailySales7d: focusMetric.sales7d ?? curSnap.dailySales7d,
    dailySales30d: focusMetric.sales30d ?? curSnap.dailySales30d,
    monthlySales: focusMetric.sales30d ?? curSnap.monthlySales,
  } : curSnap;
  // 优先使用 merged 快照（同日多来源导入已合并），避免取到运营导入的 0 值原始记录
  const latest = focusedSnap ?? history.at(-1);
  const prevSnap = (previousSnapshot?.get(skuId ?? "") ?? (parentSkuId ? previousSnapshot?.get(parentSkuId) : undefined));
  const skuPromos = useMemo(() => promotions.filter((p) => p.sku === skuId), [promotions, skuId]);
  const skuManualPromos = useMemo(() => manualPromotions.filter((p) => p.sku === skuId), [manualPromotions, skuId]);

  // Weekly promo cost for current SKU
  const weekPromoCost = useMemo(() => {
    if (!sku || !curSnap) return { total: 0, count: 0 };
    const skuMap = new Map([[sku.sku, sku]]);
    const snapMap = curSnap ? new Map([[sku.sku, curSnap]]) : new Map();
    return computeWeeklyPromoCost(sku.sku, curSnap.date, manualPromotions, skuMap, snapMap);
  }, [sku, curSnap, manualPromotions]);

  const skuShipment = useMemo(() => shipmentSuggestions.find((s) => s.sku === skuId), [shipmentSuggestions, skuId]);
  const skuWow: WowDelta | undefined = useMemo(() => wowDeltas.find((d) => d.sku === skuId), [wowDeltas, skuId]);

  // ── 该 SKU 的活跃告警诊断（复用诊断引擎）──
  const skuDiagnoses = useMemo(() => {
    if (!sku || !curSnap) return [];
    return alerts
      .filter((a) => a.sku === skuId && a.severity !== "info")
      .map((a) => {
        const result = computeDiagnosis({
          type: a.type,
          sku,
          latestSnap: curSnap,
          previousSnap: prevSnap,
          latestInv: inv,
        });
        return { alert: a, result };
      });
  }, [alerts, skuId, curSnap, prevSnap, inv, sku]);

  // ── 历史变化（previous vs latest 快照）──
  const historyCompare = useMemo(() => {
    if (!sku || history.length === 0) return null;
    const prev = history[0];
    const latestSnap = history[history.length - 1];
    const defaultLeadTime = config?.defaultLeadTime ?? 40;
    const defaultSafetyStockDays = config?.defaultSafetyStockDays ?? 30;
    const prevCalc = computeAll({ sku, snap: prev, inv, defaultLeadTime, defaultSafetyStockDays });
    const latestCalc = computeAll({ sku, snap: latestSnap, inv, defaultLeadTime, defaultSafetyStockDays });
    return { prev, latest: latestSnap, prevCalc, latestCalc };
  }, [history, sku, inv, config]);

  const activeOrUpcomingPromo = skuPromos.find((p) => p.status === "active" || p.status === "upcoming");

  // ── Layout customizer ──
  const {
    customizing, setCustomizing, toggleSection, moveSection, reset: resetLayout,
    visibleKeys, orderedKeys, allKeys,
    moveCoreKpiCard, moveCoverageKpiCard, moveQualityKpiCard,
    coreKpiCardOrder, coverageKpiCardOrder, qualityKpiCardOrder,
  } = useSkuDetailLayout();

  // ── 关联待办 ──
  const [relatedTodos, setRelatedTodos] = useState<TodoItem[]>([]);
  useEffect(() => {
    if (!skuId) return;
    db.todos.toArray().then((all) => {
      const related = all
        .filter((t) => t.relatedSku === skuId && !t.completed)
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return b.createdAt.localeCompare(a.createdAt);
        });
      setRelatedTodos(related);
    });
  }, [skuId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  // ── 运营操作记录 ──
  const [opsLogs, setOpsLogs] = useState<OpsLog[]>([]);
  const [newLogDate, setNewLogDate] = useState(todayStr);
  const [newLogAction, setNewLogAction] = useState("");
  const [newLogDetail, setNewLogDetail] = useState("");
  const [newLogImpact, setNewLogImpact] = useState("");
  const [newLogMsku, setNewLogMsku] = useState("");

  useEffect(() => {
    if (!skuId) return;
    db.opsLogs.where("sku").equals(skuId).reverse().sortBy("createdAt").then(setOpsLogs);
  }, [skuId]);

  const handleAddLog = async () => {
    if (!skuId || !newLogAction || !newLogDetail) return;
    const id = await addOpsLog(skuId, newLogDate, newLogAction, newLogDetail, newLogImpact || undefined, newLogMsku || undefined, sku?.name);
    setOpsLogs((prev) => [{ id, sku: skuId, msku: newLogMsku || undefined, skuName: sku?.name, date: newLogDate, action: newLogAction, detail: newLogDetail, impact: newLogImpact || undefined, createdAt: new Date().toISOString() }, ...prev]);
    setNewLogAction("");
    setNewLogDetail("");
    setNewLogImpact("");
    setNewLogMsku("");
  };

  const handleDeleteLog = async (id: string) => {
    await deleteOpsLog(id);
    setOpsLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const toggleTodo = async (todo: TodoItem) => {
    const updated = { ...todo, completed: true, completedAt: new Date().toISOString() };
    await db.todos.put(updated);
    setRelatedTodos((prev) => prev.filter((t) => t.id !== todo.id));
  };

  // ── 三个可编辑区域的状态 ──
  const [editOpen, setEditOpen] = useState(false);      // 运营数据
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  // 新建 SKU 没有快照时给默认值，防止编辑区卡住
  const emptySnapshot: DailySnapshot = {
    date: today,
    sku: skuId ?? "",
    dailySales7d: 0,
    monthlySales: 0,
    stockOnHand: 0,
    stockInTransit: 0,
    adSpend: 0,
    adRatio: 0,
    profit: 0,
    profitMargin: 0,
    totalCost: 0,
    rating: 0,
    returnRate: 0,
    refundRate: 0,
    daysOfCoverOnHand: 0,
    daysOfCoverWithTransit: 0,
  };
  const latestForEdit = latest ?? emptySnapshot;

  const [editProduct, setEditProduct] = useState(false);   // 产品信息
  const [editPackage, setEditPackage] = useState(false);   // 包裹参数
  const [editListing, setEditListing] = useState(false);   // Listing 优化
  const [skuSaving, setSkuSaving] = useState(false);
  const [skuMsg, setSkuMsg] = useState<string | null>(null);

  // ── 编辑用的本地 SKU 数据 ──
  const [editSku, setEditSku] = useState<SkuMaster | null>(null);

  // 当 sku 加载完成后同步到编辑状态
  useEffect(() => { if (sku) setEditSku({ ...sku }); }, [sku]);

  const updateEditSku = useCallback((patch: Partial<SkuMaster>) => {
    setEditSku((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const saveSkuEdit = useCallback(async () => {
    if (!editSku) return;
    setSkuSaving(true);
    setSkuMsg(null);
    try {
      await db.skuMaster.put(editSku);
      setSkuMsg("已保存");
      setTimeout(() => { setSkuMsg(null); reload(); }, 600);
    } catch (err) {
      setSkuMsg(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSkuSaving(false);
    }
  }, [editSku, reload]);

  // 费率（广告费比/退款率）改动 → 立即联动重算总成本/利润/利润率并写入 IndexedDB（无需点保存）
  const commitRateEdit = useCallback(async (field: "adRatio" | "refundRate", value: number) => {
    if (!curSnap) return;
    const base: DailySnapshot = { ...curSnap, [field]: value };
    const c = computeAll({
      sku,
      snap: base,
      inv,
      defaultLeadTime: config?.defaultLeadTime ?? 40,
      defaultSafetyStockDays: config?.defaultSafetyStockDays ?? 30,
    });
    const updated: DailySnapshot = {
      ...base,
      totalCost: c.totalCost,
      profit: sku.price > 0 ? c.grossProfit : base.profit,
      profitMargin: sku.price > 0 ? c.grossMargin : base.profitMargin,
      profitSource: c.profitSource,
    };
    try {
      await upsertSnapshots([updated]);
      setEditMsg(`已自动保存并联动重算（来源：${c.profitSource === "CALCULATED" ? "计算" : "估算"}）`);
      setTimeout(() => setEditMsg(null), 1800);
      reload();
    } catch (err) {
      setEditMsg(`自动保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [curSnap, sku, inv, config, reload]);

  // ── 按周聚合历史数据 ──
  const weeklyData = useMemo(() => {
    const map = new Map<string, DailySnapshot>();
    for (const s of history) {
      const d = new Date(s.date);
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = mon.toISOString().slice(0, 10);
      const existing = map.get(key);
      if (!existing || s.date > existing.date) map.set(key, s);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, snap]) => {
        const d = new Date(weekStart);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        return {
          weekLabel: label,
          weeklySales: Math.round(snap.dailySales7d * 7),
          weeklyProfit: Number((snap.profit * snap.dailySales7d * 7).toFixed(2)),
          weeklyAdSpend: Number((snap.adSpend).toFixed(2)),
          profitMargin: Number(snap.profitMargin.toFixed(2)),
          adRatio: Number(snap.adRatio.toFixed(2)),
          rating: Number(snap.rating.toFixed(2)),
          returnRate: Number(snap.returnRate.toFixed(2)),
          stockOnHand: snap.stockOnHand,
          stockInTransit: snap.stockInTransit,
        };
      });
  }, [history]);

  // ── 使用统一计算引擎 computeAll，覆盖全部13条规则 ──
  // FIX: 用 focusedSnap（含 MSKU 独立指标覆盖）而非 curSnap，保证 focus=MSKU 时 KPI 显示该 MSKU 自身值
  const calc = useMemo(() => {
    if (!sku) return null;
    return computeAll({
      sku,
      snap: focusedSnap,
      inv,
      activePromo: activeOrUpcomingPromo,
      defaultLeadTime: config?.defaultLeadTime ?? 40,
      defaultSafetyStockDays: config?.defaultSafetyStockDays ?? 30,
      promoCost: weekPromoCost.total,
    });
  }, [sku, focusedSnap, inv, activeOrUpcomingPromo, config, weekPromoCost]);

  if (loading) return <div className="text-sm text-foreground-500">加载中...</div>;

  if (!sku || !editSku) return (
    <EmptyState
      icon="ri-search-line"
      title="没找到这个 SKU"
      desc="请返回 SKU 列表选择"
      action={
        <Link to="/sku" className="rounded-[9px] bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap">返回 SKU 列表</Link>
      }
    />
  );

  // 兜底：calc 不应为 null，但万一出错时防止白屏
  if (!calc) {
    console.error("[SkuDetail] calc is null unexpectedly", { sku, editSku, curSnap, inv });
    return (
      <EmptyState
        icon="ri-error-warning-line"
        title="数据计算异常"
        desc="该 SKU 数据有误，无法计算利润。请尝试重新导入数据或检查控制台日志。"
        action={
          <Link to="/sku" className="rounded-[9px] bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap">返回 SKU 列表</Link>
        }
      />
    );
  }

  // 兼容旧变量名
  const {
    totalCost, grossProfit, grossMargin, isAdInferred, isReturnInferred, isCommissionInferred,
    isDiscountAdInferred, isDiscountReturnInferred,
    discountTotalCost, discountProfit, discountMargin,
    discountCostCommission, discountCostAd, discountCostReturn, discountCostRefundLoss, discountCostCoupon,
    discountAdEstimated, discountReturnFeeEstimated,
    costFob, costShipping, costDelivery, costCommission, costStorage, costAd, costReturn, costRefundLoss, costCoupon, costPromo,
    returnFee30d, adRatio: calcAdRatio, returnRate: calcReturnRate, refundRate: calcRefundRate,
    inStockTotal, inTransitTotal, totalStock,
    daysOfCoverOnHand, daysOfCoverWithTransit,
    fbaReplenish, fbmReplenish,
  } = calc;

  // 成本全缺失 → 利润率/退货率失真（算成 100%/0），界面标注「缺失/成本缺失」而非 0
  const costMissing = isCostFullyMissing(sku);
  // 退款率(refundRate)对所有履约方式生效；缺失时展示「缺失」而非误导性的 0%
  const refundMissing = isReturnRateMissing({
    fulfillment: sku.fulfillment,
    costMissing,
    refundRate: latest?.refundRate,
  });

  // 兼容旧变量
  const allStock = inStockTotal;
  const allTransit = inTransitTotal;
  const allAvailable = totalStock;
  // 覆盖天数展示统一走 formatCoverDays（无销量时为 ∞）
  const dailySales = curSnap?.dailySales7d ?? 0;
  const coverDays = dailySales > 0 ? Math.round(totalStock / dailySales) : Infinity;
  const stockSalesRatio = curSnap && curSnap.monthlySales > 0 ? (totalStock / curSnap.monthlySales).toFixed(1) : "N/A";
  const returnFee = returnFee30d;
  const dailySales30d = curSnap ? curSnap.monthlySales / 30 : 0;
  const salesDelta = dailySales > 0 && dailySales30d > 0 ? ((dailySales - dailySales30d) / dailySales30d * 100) : 0;

  // 仓库区域明细
  const eastStock = (inv?.eastStock ?? 0);
  const westStock = (inv?.westStock ?? 0);
  const southeastStock = (inv?.southeastStock ?? 0);
  const southcentralStock = (inv?.southcentralStock ?? 0);
  const eastTransitNew = (inv?.eastTransit ?? 0);
  const westTransitNew = (inv?.westTransit ?? 0);
  const southeastTransit = (inv?.southeastTransit ?? 0);
  const southcentralTransit = (inv?.southcentralTransit ?? 0);

  return (
    <div className="space-y-6">
      {/* ═══════ 1. 头部信息 ═══════ */}
      {visibleKeys.includes("header") && (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/sku" className="text-[12px] text-foreground-400 hover:text-foreground-700 cursor-pointer">← 返回 SKU 列表</Link>
          <h1 className="mt-1 font-heading text-[28px] font-bold leading-tight text-foreground-950">{sku.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="mono-num rounded-[10px] bg-background-100 px-2.5 py-0.5 text-foreground-700">{sku.sku}</span>
            {sku.msku && sku.msku !== sku.sku && (() => {
              const allMs = sku.msku.split(/[,\s，、·]+/).map((m) => m.trim()).filter(Boolean);
              // 当 focus=MSKU 时，仅展示焦点 MSKU，避免一长串无关 MSKU 干扰
              const list = focusMsku ? allMs.filter((m) => m === focusMsku) : allMs;
              return list.map((m) => (
                <span key={m} id={`msku-${m}`}
                  className={`mono-num rounded-[10px] px-2.5 py-0.5 text-foreground-500 ${focusMsku && m === focusMsku ? "bg-primary-50 ring-2 ring-primary-400" : "bg-background-100"}`}>
                  MSKU: {m}
                  <span className="ml-1 text-[10px] text-foreground-400">{mskuStoreOf(sku, m)}</span>
                </span>
              ));
            })()}
            {sku.asin && <span className="mono-num text-foreground-500">{sku.asin}</span>}
            {sku.marketplace && <Badge tone="secondary">{sku.marketplace}</Badge>}
            <Badge tone="primary">{sku.store}</Badge>
            <Badge tone="accent">{sku.fulfillment}</Badge>
            <Badge tone={sku.saleStatus === "active" ? "primary" : sku.saleStatus === "clearance" ? "warn" : "secondary"}>{saleStatusLabel[sku.saleStatus]}</Badge>
            {sku.linkType && <Badge tone="secondary">{linkTypeLabel[sku.linkType]}</Badge>}
            {sku.lifecycle && <Badge tone={sku.lifecycle === "new" ? "primary" : sku.lifecycle === "growth" ? "accent" : sku.lifecycle === "clearance" ? "warn" : "secondary"}>{lifecycleLabel[sku.lifecycle]}</Badge>}
            {sku.category && <Badge tone="secondary">{sku.category}</Badge>}
            {sku.aPlus === "todo" && <Badge tone="warn">A+ 未完成</Badge>}
            {sku.aPlus === "done" && <Badge tone="accent">A+ 已完成</Badge>}
            {sku.launchDate && <span className="text-foreground-400">上架 {sku.launchDate}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCustomizing(!customizing)}
            className="flex items-center gap-1.5 rounded-[9px] border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-800 cursor-pointer"
          >
            <i className={customizing ? "ri-close-line" : "ri-layout-masonry-line"} aria-hidden />
            {customizing ? "关闭设置" : "自定义布局"}
          </button>
          <Link to={`/promo-cost?sku=${encodeURIComponent(sku.sku)}`}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-accent-200 bg-accent-50 px-3 py-1.5 text-[12px] font-medium text-accent-700 hover:bg-accent-100 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-coupon-3-line" aria-hidden /> 添加促销成本
          </Link>
          {sku.productUrl && (
            <a href={safeHref(sku.productUrl)} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-[9px] border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap">
              <i className="ri-external-link-line" aria-hidden /> 在 Amazon 打开
            </a>
          )}
        </div>
      </div>
      )}

      {/* ═══════ 健康评分卡 ═══════ */}
      {(() => {
        const hs = healthScores.get(skuId ?? "");
        if (!hs) return null;
        const cardCls =
          hs.level === "健康"
            ? "border-accent-200 bg-accent-50/50"
            : hs.level === "关注"
            ? "border-secondary-200 bg-secondary-50/50"
            : "border-red-200 bg-red-50/50";
        const badgeCls =
          hs.level === "健康"
            ? "bg-accent-500 text-white"
            : hs.level === "关注"
            ? "bg-secondary-500 text-white"
            : "bg-red-500 text-white";
        const ringCls =
          hs.level === "健康"
            ? "text-accent-600"
            : hs.level === "关注"
            ? "text-secondary-600"
            : "text-red-600";
        return (
          <div className={`flex flex-wrap items-center gap-4 rounded-2xl border p-4 ${cardCls}`}>
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 ${ringCls} border-current/20 bg-background-50`}>
              <span className={`mono-num text-[26px] font-bold ${ringCls}`}>{hs.score}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${badgeCls}`}>{hs.level}</span>
                <span className="text-[12px] text-foreground-500">综合健康分（100 满分）</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-foreground-400">主要风险因子：</span>
                {hs.factors.length === 0 ? (
                  <span className="text-[12px] text-accent-700">无明显风险因子</span>
                ) : (
                  hs.factors.slice(0, 3).map((f) => (
                    <span key={f.key} className="inline-flex items-center rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                      {f.label}
                      <span className="ml-1 text-red-400">-{f.impact}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 布局自定义 */}
      {customizing && (
        <SkuLayoutCustomizer
          visibleKeys={visibleKeys}
          orderedKeys={orderedKeys}
          allKeys={allKeys}
          toggle={toggleSection}
          moveSection={moveSection}
          moveCoreKpiCard={moveCoreKpiCard}
          moveCoverageKpiCard={moveCoverageKpiCard}
          moveQualityKpiCard={moveQualityKpiCard}
          coreKpiCardOrder={coreKpiCardOrder}
          coverageKpiCardOrder={coverageKpiCardOrder}
          qualityKpiCardOrder={qualityKpiCardOrder}
          onClose={() => setCustomizing(false)}
          onReset={resetLayout}
        />
      )}

      {/* ═══════ 2. 核心 KPI 区 ═══════ */}
      {latest && (
        <>
          {/* ── 折扣利润率横幅 ── */}
          {visibleKeys.includes("discountBanner") && activeOrUpcomingPromo?.discountPrice && activeOrUpcomingPromo.discountPrice > 0 && (
            <div className="rounded-[14px] border-2 border-accent-500 bg-accent-50/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-[18px] text-accent-700">
                  <i className="ri-coupon-3-line" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-foreground-900">
                      <Badge tone={activeOrUpcomingPromo.status === "active" ? "accent" : "secondary"}>{activeOrUpcomingPromo.type}</Badge>
                      <span className="ml-1.5">{activeOrUpcomingPromo.name}</span>
                    </span>
                    <span className="text-[12px] text-foreground-500">
                      {activeOrUpcomingPromo.startDate} → {activeOrUpcomingPromo.endDate}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-4 text-[13px]">
                    <span className="text-foreground-500">
                      正常价 <strong className="mono-num text-foreground-900">${sku.price.toFixed(2)}</strong>
                      <span className="mx-1 text-foreground-400">→</span>
                      折扣价 <strong className="mono-num text-accent-700">${activeOrUpcomingPromo.discountPrice.toFixed(2)}</strong>
                    </span>
                    <span className="h-5 w-px bg-background-300/70" />
                    <span className="text-foreground-500">
                      折扣后净利润 <strong className={`mono-num ${discountProfit >= 0 ? "text-accent-700" : "text-red-600"}`}>${discountProfit.toFixed(2)}</strong>
                    </span>
                    <span className="text-foreground-500">
                      折扣后利润率 <strong className={`mono-num ${discountMargin >= 0 ? "text-accent-700" : "text-red-600"}`}>{discountMargin.toFixed(1)}%</strong>
                    </span>
                    <span className="h-5 w-px bg-background-300/70" />
                    <span className="text-foreground-500">
                      正常利润率 <strong className={`mono-num ${grossMargin >= 0 ? "text-foreground-900" : "text-red-600"}`}>{grossMargin.toFixed(1)}%</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {visibleKeys.includes("kpiCards") && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {coreKpiCardOrder.map((key) => {
              switch (key) {
                case "dailySales7d": {
                  const _7dTotal = latest.dailySales7d * 7;
                  const _7dDaily = latest.dailySales7d;
                  console.log("[销量卡片] 7天销量", { sku: skuId, dailySales7d原始值: latest.dailySales7d, 主值_7天总量: _7dTotal, 小字_日均: _7dDaily, monthlySales原始值: latest.monthlySales, 数据来源: latest.date, focusMsku });
                  return <KpiCard key={key} label="7天销量" value={_7dTotal.toFixed(0)} sub={`日均 ${_7dDaily.toFixed(1)} 件 · 近7天累计`} icon="ri-shopping-cart-2-line" tone={salesDelta > 10 ? "primary" : salesDelta < -10 ? "warn" : "primary"} />;
                }
                case "monthlySales": {
                  const _30dTotal = latest.monthlySales;
                  const _30dDaily = latest.monthlySales / 30;
                  console.log("[销量卡片] 30天销量", { sku: skuId, monthlySales原始值: latest.monthlySales, 主值_30天总量: _30dTotal, 小字_日均: _30dDaily, 数据来源: latest.date, focusMsku });
                  return <KpiCard key={key} label="30天销量" value={_30dTotal.toLocaleString()} sub={`日均 ${_30dDaily.toFixed(1)} 件 · 近30天累计`} icon="ri-bar-chart-2-line" />;
                }
                case "inStock": return <KpiCard key={key} label="在库库存" value={allStock.toLocaleString()} sub={`美东${eastStock} + 美西${westStock} + 东南${southeastStock} + 中南${southcentralStock}`} icon="ri-archive-drawer-line" tooltip="公式: 美东在库 + 美西在库 + 东南在库 + 中南在库" />;
                case "inTransit": return <KpiCard key={key} label="在途库存" value={allTransit.toLocaleString()} sub={`美东${eastTransitNew}+美西${westTransitNew}+东南${southeastTransit}+中南${southcentralTransit}`} icon="ri-ship-line" tone="secondary" tooltip="公式: 美东在途 + 美西在途 + 东南在途 + 中南在途" />;
                case "totalStock": return <KpiCard key={key} label="总库存" value={allAvailable.toLocaleString()} sub={`在库${allStock}+在途${allTransit}，自动汇总`} icon="ri-archive-line" tone="accent" tooltip="公式: 在库库存 + 在途库存" />;
                case "stockSalesRatio": return <KpiCard key={key} label="存销比" value={String(stockSalesRatio)} sub="总库存/月销" icon="ri-pie-chart-box-line" tooltip="公式: 总库存 ÷ 月销量" />;
                default: return null;
              }
            })}
          </div>
          )}

          {visibleKeys.includes("kpiCards") && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {coverageKpiCardOrder.map((key) => {
              switch (key) {
                case "coverDays": {
                  const noSales = !Number.isFinite(coverDays);
                  return <KpiCard key={key} label="综合覆盖" value={`${formatCoverDays(coverDays)} 天`} sub={noSales ? COVER_NO_SALES_SUB : `日均${dailySales.toFixed(1)}`} icon="ri-timer-line" tone={noSales ? "secondary" : (coverDays < 60 ? "warn" : "accent")} tooltip="公式: 总库存 ÷ 日均销量" />;
                }
                case "coverOnHand": return <KpiCard key={key} label="在库覆盖" value={`${formatCoverDays(daysOfCoverOnHand)} 天`} sub={Number.isFinite(daysOfCoverOnHand) ? "仅算在库" : COVER_NO_SALES_SUB} icon="ri-archive-drawer-line" tooltip="公式: 在库库存 ÷ 日均销量" />;
                case "coverWithTransit": return <KpiCard key={key} label="含在途覆盖" value={`${formatCoverDays(daysOfCoverWithTransit)} 天`} sub={Number.isFinite(daysOfCoverWithTransit) ? "含在途" : COVER_NO_SALES_SUB} icon="ri-ship-line" tone="secondary" tooltip="公式: (在库+在途) ÷ 日均销量" />;
                case "leadTime": return <KpiCard key={key} label="Lead Time" value={`${sku.leadTimeDays ?? 40} 天`} sub={`安全库存 ${sku.safetyStockDays ?? 30} 天`} icon="ri-time-line" tone="secondary" tooltip={`安全库存公式: LeadTime × 日均 × ${sku.fulfillment === "FBM" ? "50%(FBM)" : "20%(FBA)"}`} />;
                default: return null;
              }
            })}
          </div>
          )}

          {visibleKeys.includes("kpiCards") && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {qualityKpiCardOrder.map((key) => {
              switch (key) {
                case "rating": return <KpiCard key={key} label="评分" value={latest.rating > 0 ? latest.rating.toFixed(1) : "N/A"} sub={skuWow ? deltaArrow(skuWow.ratingDelta) : "目标 4.0+"} icon="ri-star-line" tone={latest.rating > 0 && latest.rating < 3.8 ? "danger" : latest.rating > 0 && latest.rating < 4.0 ? "warn" : "accent"} />;
                case "reviewCount": return <KpiCard key={key} label="Review 数" value={latest.reviewCount != null ? latest.reviewCount.toLocaleString() : "N/A"} sub="累计" icon="ri-chat-3-line" />;
                case "returnRate": return sku.fulfillment === "mixed" ? (
                  <React.Fragment key={key}>
                    <KpiCard label="退款率" value={refundMissing ? "缺失" : `${(latest.refundRate ?? 0).toFixed(1)}%`} sub={refundMissing ? "未导入" : ((latest.refundRate ?? 0) > 5 ? "⚠ 需关注" : "正常")} icon="ri-refund-2-line" tone={refundMissing ? "secondary" : ((latest.refundRate ?? 0) > 8 ? "danger" : (latest.refundRate ?? 0) > 5 ? "warn" : "accent")} />
                    <KpiCard label="FBA退货率" value={costMissing ? "缺失" : `${calcReturnRate.toFixed(1)}%`} sub={costMissing ? "成本缺失" : (calcReturnRate > 5 ? "⚠ 需关注" : "正常")} icon="ri-arrow-go-back-line" tone={costMissing ? "secondary" : (calcReturnRate > 8 ? "danger" : calcReturnRate > 5 ? "warn" : "accent")} />
                  </React.Fragment>
                ) : (
                  <KpiCard key={key} label="退款率" value={refundMissing ? "缺失" : `${(latest.refundRate ?? 0).toFixed(1)}%`} sub={refundMissing ? "未导入" : ((latest.refundRate ?? 0) > 5 ? "⚠ 需关注" : "正常")} icon="ri-refund-2-line" tone={refundMissing ? "secondary" : ((latest.refundRate ?? 0) > 8 ? "danger" : (latest.refundRate ?? 0) > 5 ? "warn" : "accent")} />
                );
                case "adRatio": return <KpiCard key={key} label="广告费比" value={`${latest.adRatio.toFixed(1)}%`} sub={skuWow ? deltaArrow(skuWow.adRatioDelta, true) : `阈值 ${config?.adRatioThreshold ?? 10}%`} icon="ri-megaphone-line" tone={latest.adRatio > (config?.adRatioThreshold ?? 10) * 2 ? "danger" : latest.adRatio > (config?.adRatioThreshold ?? 10) ? "warn" : "accent"} />;
                case "refundFee": return <KpiCard key={key} label="退款费" value={`${returnFee.toFixed(2)}`} sub="近30天估算" icon="ri-refund-2-line" />;
                default: return null;
              }
            })}
          </div>
          )}

          {/* 自然订单 / 广告订单占比 */}
          {visibleKeys.includes("kpiCards") && (() => {
            const ad = latest.adRatio;
            const organic = Math.max(0, Math.min(100, 100 - ad));
            return (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  label="自然订单占比"
                  value={`${organic.toFixed(1)}%`}
                  sub={`广告占比 ${ad.toFixed(1)}% · 基于广告费比推导`}
                  icon="ri-leaf-line"
                  tone={organic > 70 ? "accent" : organic > 40 ? "primary" : "warn"}
                  tooltip="近似推导：自然订单占比 ≈ 100% − 广告费比（adRatio）。实际效果受转化归因影响，供趋势参考。"
                />
                <KpiCard
                  label="广告订单占比"
                  value={`${ad.toFixed(1)}%`}
                  sub={`自然占比 ${organic.toFixed(1)}% · 阈值 ${config?.adRatioThreshold ?? 10}%`}
                  icon="ri-megaphone-line"
                  tone={ad > (config?.adRatioThreshold ?? 10) * 2 ? "danger" : ad > (config?.adRatioThreshold ?? 10) ? "warn" : "accent"}
                  tooltip="近似推导：广告订单占比 ≈ 广告费比（adRatio），即广告投入 / 总营收。"
                />
                <div className="rounded-[14px] border border-background-200/70 bg-background-50/60 p-3 flex flex-col justify-center">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-foreground-500 tracking-wide uppercase">订单结构可视化</span>
                    <span className="text-[11px] text-foreground-400">自然 vs 广告</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-background-200 overflow-hidden flex">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${organic}%`, background: "linear-gradient(90deg,#0ea5e9,#22c55e)" }}
                      title={`自然订单 ${organic.toFixed(1)}%`}
                    />
                    <div
                      className="h-full transition-all"
                      style={{ width: `${Math.max(0, 100 - organic)}%`, background: "linear-gradient(90deg,#f59e0b,#ef4444)" }}
                      title={`广告订单 ${ad.toFixed(1)}%`}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="inline-flex items-center gap-1 text-foreground-500">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />自然 {organic.toFixed(0)}%
                    </span>
                    <span className="inline-flex items-center gap-1 text-foreground-500">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />广告 {ad.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ═══════ 运营数据编辑 ═══════ */}
      {visibleKeys.includes("editData") && (
      <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
        <button
          type="button"
          onClick={() => { setEditOpen(!editOpen); setEditMsg(null); }}
          className="flex w-full items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700">
              <i className="ri-edit-line" aria-hidden />
            </div>
            <span className="text-[13px] font-semibold text-foreground-900">编辑运营数据</span>
            <span className="text-[11px] text-foreground-500">广告费 · 销量 · 利润率 · 评分 · 退货率等可直接修改</span>
          </div>
          <i className={`${editOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-[16px] text-foreground-500`} aria-hidden />
        </button>

        {editOpen && latestForEdit && (
          <div className="mt-4 border-t border-background-200/70 pt-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditSaving(true);
                setEditMsg(null);
                try {
                  const formEl = e.currentTarget;
                  const fd = new FormData(formEl);

                  const newDailySales7d = Number(fd.get("dailySales7d")) || latestForEdit.dailySales7d;
                  const newMonthlySales = Number(fd.get("monthlySales")) || latestForEdit.monthlySales;

                  // ── 根据 fulfillment 类型读取不同的库存字段 ──
                  let newStockOnHand: number;
                  let newStockInTransit: number;
                  if (sku.fulfillment === "FBA" || sku.fulfillment === "mixed") {
                    newStockOnHand = Number(fd.get("fbaStockField")) || (inv?.fbaStock ?? 0);
                    newStockInTransit = Number(fd.get("fbaTransitField")) || 0;
                  } else {
                    // FBM: from region stock sum
                    const eS = Number(fd.get("eastStock")) || (inv?.eastStock ?? 0);
                    const wS = Number(fd.get("westStock")) || (inv?.westStock ?? 0);
                    const seS = Number(fd.get("southeastStock")) || (inv?.southeastStock ?? 0);
                    const scS = Number(fd.get("southcentralStock")) || (inv?.southcentralStock ?? 0);
                    newStockOnHand = eS + wS + seS + scS;
                    const eT = Number(fd.get("eastTransit")) || (inv?.eastTransit ?? 0);
                    const wT = Number(fd.get("westTransit")) || (inv?.westTransit ?? 0);
                    const seT = Number(fd.get("southeastTransit")) || (inv?.southeastTransit ?? 0);
                    const scT = Number(fd.get("southcentralTransit")) || (inv?.southcentralTransit ?? 0);
                    newStockInTransit = eT + wT + seT + scT;
                  }

                  const newAdSpend = Number(fd.get("adSpend")) || latestForEdit.adSpend;
                  const newAdRatio = Number(fd.get("adRatio")) || latestForEdit.adRatio;
                  const newRating = Number(fd.get("rating")) || latestForEdit.rating;
                  const newReturnRate = Number(fd.get("returnRate")) || latestForEdit.returnRate;
                  const newRefundRate = Number(fd.get("refundRate")) || (latestForEdit.refundRate ?? 0);

                  // 用统一计算引擎 computeAll 得到总成本（优惠券已计入总成本，口径一致）
                  const editSnap: DailySnapshot = {
                    ...latestForEdit,
                    dailySales7d: newDailySales7d,
                    monthlySales: newMonthlySales,
                    stockOnHand: newStockOnHand,
                    stockInTransit: newStockInTransit,
                    adSpend: newAdSpend,
                    adRatio: newAdRatio,
                    rating: newRating,
                    returnRate: newReturnRate,
                    refundRate: newRefundRate,
                    daysOfCoverOnHand: newDailySales7d > 0 ? Number((newStockOnHand / newDailySales7d).toFixed(1)) : Infinity,
                    daysOfCoverWithTransit: newDailySales7d > 0 ? Number(((newStockOnHand + newStockInTransit) / newDailySales7d).toFixed(1)) : Infinity,
                  };
                  const editCalc = computeAll({ sku, snap: editSnap, inv });
                  const totalCostCalc = editCalc.totalCost;

                  // 利润/利润率一律由系统联动计算，不采用人工输入值
                  const newProfit = sku.price > 0 ? sku.price - totalCostCalc : latestForEdit.profit;
                  const newMargin = sku.price > 0 ? (newProfit / sku.price) * 100 : latestForEdit.profitMargin;

                  const updated: DailySnapshot = {
                    ...editSnap,
                    totalCost: totalCostCalc,
                    profit: newProfit,
                    profitMargin: newMargin,
                    profitSource: editCalc.profitSource,
                  };

                  // ── 读取区域库存字段 ──
                  const eastStockVal = Number(fd.get("eastStock")) || (inv?.eastStock ?? 0);
                  const eastTransitVal = Number(fd.get("eastTransit")) || (inv?.eastTransit ?? 0);
                  const westStockVal = Number(fd.get("westStock")) || (inv?.westStock ?? 0);
                  const westTransitVal = Number(fd.get("westTransit")) || (inv?.westTransit ?? 0);
                  const seStockVal = Number(fd.get("southeastStock")) || (inv?.southeastStock ?? 0);
                  const seTransitVal = Number(fd.get("southeastTransit")) || (inv?.southeastTransit ?? 0);
                  const scStockVal = Number(fd.get("southcentralStock")) || (inv?.southcentralStock ?? 0);
                  const scTransitVal = Number(fd.get("southcentralTransit")) || (inv?.southcentralTransit ?? 0);

                  // ── 保存 DailySnapshot ──
                  await upsertSnapshots([updated]);

                  // ── 保存 InventoryLayer（区域库存），根据 fulfillment 区分 ──
                  const fbaStockFromForm = (sku.fulfillment === "FBA" || sku.fulfillment === "mixed")
                    ? (Number(fd.get("fbaStockField")) || (inv?.fbaStock ?? 0))
                    : (inv?.fbaStock ?? 0);

                  const invLayer: InventoryLayer = {
                    date: inv?.date ?? latestForEdit.date,
                    sku: latestForEdit.sku,
                    fbaStock: fbaStockFromForm,
                    fbmStock: inv?.fbmStock ?? 0,
                    factoryStock: inv?.factoryStock ?? 0,
                    eastTransit: eastTransitVal,
                    westTransit: westTransitVal,
                    southeast: inv?.southeast ?? 0,
                    southcentral: inv?.southcentral ?? 0,
                    eastStock: eastStockVal,
                    westStock: westStockVal,
                    southeastStock: seStockVal,
                    southcentralStock: scStockVal,
                    southeastTransit: seTransitVal,
                    southcentralTransit: scTransitVal,
                  };
                  if (inv?.id != null) {
                    await db.inventoryLayer.put({ ...invLayer, id: inv.id });
                  } else {
                    await db.inventoryLayer.add(invLayer);
                  }

                  setEditMsg("保存成功，刷新中...");
                  setTimeout(() => { reload(); setEditMsg(null); }, 600);
                } catch (err) {
                  setEditMsg(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
                } finally {
                  setEditSaving(false);
                }
              }}
            >
              {/* 货件类型提示 */}
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-background-200/70 bg-background-50 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">货件类型</span>
                <div className="flex gap-1.5">
                  {(["FBA", "FBM", "mixed"] as const).map((m) => (
                    <span
                      key={m}
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                        sku.fulfillment === m
                          ? "bg-primary-500 text-background-50"
                          : "bg-background-200 text-foreground-400"
                      }`}
                    >
                      {m === "mixed" ? "混卖" : m}
                    </span>
                  ))}
                </div>
                <span className="text-[11px] text-foreground-500">在产品信息编辑中修改配送方式</span>
              </div>

              {/* ── 当前货件类型：FBA → 显示 FBA 库存字段；FBM → 显示区域库存；混卖 → 都显示 ── */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                <EditableField label="7天日均销量" name="dailySales7d" defaultValue={latestForEdit.dailySales7d} step="0.1" />
                <EditableField label="月销量" name="monthlySales" defaultValue={latestForEdit.monthlySales} step="1" />
                {(sku.fulfillment === "FBA" || sku.fulfillment === "mixed") && (
                  <>
                    <EditableField label="在库库存(FBA)" name="fbaStockField" defaultValue={inv?.fbaStock ?? 0} step="1" />
                    <EditableField label="在途库存" name="fbaTransitField" defaultValue={inv?.eastTransit ?? 0} step="1" />
                  </>
                )}
                {sku.fulfillment === "FBM" && (
                  <>
                    <EditableField label="区域在库合计" name="regionStockSum" defaultValue={(inv?.eastStock ?? 0) + (inv?.westStock ?? 0) + (inv?.southeastStock ?? 0) + (inv?.southcentralStock ?? 0)} step="1" disabled />
                  </>
                )}
                <EditableField label="广告费(30天) $" name="adSpend" defaultValue={latestForEdit.adSpend} step="0.01" />
                <EditableField
                  label="广告费比 %（改后自动重算利润）"
                  name="adRatio"
                  defaultValue={latestForEdit.adRatio}
                  step="0.1"
                  onCommit={(v) => commitRateEdit("adRatio", v)}
                />
                {/* 利润/利润率由系统联动计算，不手填 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-foreground-500">单件利润 $（自动算）</span>
                  <div className="w-full rounded-md border border-background-200 bg-background-100 px-2 py-1.5 text-[12px] text-foreground-900">{grossProfit.toFixed(2)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-foreground-500">利润率 %（自动算）</span>
                  <div className="w-full rounded-md border border-background-200 bg-background-100 px-2 py-1.5 text-[12px] text-foreground-900">{grossMargin.toFixed(1)}%</div>
                </div>
                <EditableField label="评分" name="rating" defaultValue={latestForEdit.rating} step="0.1" />
                {(sku.fulfillment === "FBA" || sku.fulfillment === "mixed") && (
                  <EditableField label="退货率 % (FBA)" name="returnRate" defaultValue={latestForEdit.returnRate} step="0.1" />
                )}
                {(sku.fulfillment === "FBM" || sku.fulfillment === "mixed") && (
                  <EditableField
                    label="退款率 % (FBM，改后自动重算利润)"
                    name="refundRate"
                    defaultValue={latestForEdit.refundRate ?? 0}
                    step="0.1"
                    onCommit={(v) => commitRateEdit("refundRate", v)}
                  />
                )}
              </div>

              {/* ── 区域库存区块：仅 FBM 或 混卖 时显示 ── */}
              {(sku.fulfillment === "FBM" || sku.fulfillment === "mixed") && (
                <>
                  <div className="mt-3 rounded-lg border border-accent-200/70 bg-accent-50/50 px-3 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-600">
                      <i className="ri-archive-drawer-line mr-1 text-accent-600" aria-hidden />
                      区域库存（在库 + 在途）
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <EditableField label="美东在库" name="eastStock" defaultValue={inv?.eastStock ?? 0} step="1" />
                    <EditableField label="美东在途" name="eastTransit" defaultValue={inv?.eastTransit ?? 0} step="1" />
                    <EditableField label="美西在库" name="westStock" defaultValue={inv?.westStock ?? 0} step="1" />
                    <EditableField label="美西在途" name="westTransit" defaultValue={inv?.westTransit ?? 0} step="1" />
                    <EditableField label="东南在库" name="southeastStock" defaultValue={inv?.southeastStock ?? 0} step="1" />
                    <EditableField label="东南在途" name="southeastTransit" defaultValue={inv?.southeastTransit ?? 0} step="1" />
                    <EditableField label="中南在库" name="southcentralStock" defaultValue={inv?.southcentralStock ?? 0} step="1" />
                    <EditableField label="中南在途" name="southcentralTransit" defaultValue={inv?.southcentralTransit ?? 0} step="1" />
                  </div>
                </>
              )}

              {/* ── FBA 库存区块：仅 FBA 或 混卖 时提示 ── */}
              {sku.fulfillment === "FBA" && (
                <div className="mt-3 rounded-lg border border-primary-200/70 bg-primary-50/40 px-3 py-2 text-[11px] text-foreground-500">
                  <i className="ri-archive-line mr-1 text-primary-600" aria-hidden />
                  FBA 模式下库存由亚马逊管理，FBA 在库 =「在库库存(FBA)」字段，如需添加在途请修改「在途库存」字段。
                </div>
              )}

              <div className="mt-3 rounded-lg border border-accent-200/70 bg-accent-50/60 px-3 py-2 text-[11px] text-foreground-500">
                <i className="ri-magic-line mr-1 text-accent-600" aria-hidden />
                <strong className="text-foreground-700">自动计算规则</strong>：单件利润 = 售价 − （FOB+头程+尾程+佣金+仓租+广告费+退货费+优惠券）。如需覆盖自动计算，手动填写利润即可。区域库存修改后会自动更新顶部汇总卡片。
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={editSaving}
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <i className={editSaving ? "ri-loader-4-line animate-spin" : "ri-save-line"} aria-hidden />
                  {editSaving ? "保存中..." : "保存修改"}
                </button>
                {editMsg && (
                  <span className={`text-[12px] ${editMsg.includes("失败") ? "text-red-600" : "text-accent-700"}`}>
                    {editMsg}
                  </span>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
      )}

      {/* ═══════ 3. 盈利分析 ═══════ */}
      {visibleKeys.includes("profitAnalysis") && (
      <Section title="盈利分析" icon="ri-funds-box-line" subtitle="正常售价 vs 折扣售价 · 全部成本一目了然">
        {costMissing && (
          <div className="mb-3 rounded-[12px] border border-secondary-200 bg-secondary-50/60 px-3.5 py-2.5 text-[12px] text-foreground-600">
            <i className="ri-information-line text-secondary-700 mr-1" aria-hidden />
            成本字段（FOB/头程/配送/佣金/仓储/广告/退货费）全部缺失，利润率与退货率无法计算，当前显示「成本缺失 / 缺失」为占位、非真实值。要得真实利润率与退货率，请在 SKU 主档或「SKU 标识符」导入中补全成本：退货率需填 costReturn，FBM 退款率需在「运营数据」导入带退款率列。
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ── 正常盈利 ── */}
          <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700">
                <i className="ri-price-tag-3-line" aria-hidden />
              </div>
              <span className="text-[13px] font-semibold text-foreground-900">销售总价</span>
              <span className="ml-auto flex flex-col items-end leading-tight">
                {(() => {
                  // FIX: focus=MSKU 时优先使用 mskuMetrics 中该 MSKU 自身的售价/运费/销售总价
                  const mPrice = focusMetric?.price ?? sku.price;
                  const mListPrice = focusMetric?.listPrice ?? sku.listPrice;
                  const mShipping = focusMetric?.shippingFee ?? ((mListPrice != null && mPrice != null) ? (mListPrice - mPrice) : 0);
                  const displayTotal = mListPrice ?? mPrice;
                  return (
                    <>
                      <span className="mono-num text-[13px] font-bold text-foreground-950">${displayTotal.toFixed(2)}</span>
                      {mShipping > 0 && (
                        <span className="mono-num text-[10px] text-foreground-400">${mPrice.toFixed(2)} + ${mShipping.toFixed(2)}</span>
                      )}
                    </>
                  );
                })()}
              </span>
            </div>
            <div className="space-y-1 text-[13px]">
              <ProfitRow label="售价" value={`$${sku.price.toFixed(2)}`} highlight />
              <div className="my-1.5 h-px bg-background-200/50" />
              <ProfitRow label="FOB" value={`-$${(sku.costFob ?? 0).toFixed(2)}`} />
              <ProfitRow label="头程" value={`-$${(sku.costShipping ?? 0).toFixed(2)}`} />
              <ProfitRow label="尾程(配送费)" value={`-$${(sku.costDelivery ?? 0).toFixed(2)}`} />
              <ProfitRow label="佣金" value={`-$${costCommission.toFixed(2)}`} inferred={isCommissionInferred} />
              <ProfitRow label="仓租" value={`-$${(sku.costStorage ?? 0).toFixed(2)}`} />
              <ProfitRow label="广告费" value={`-$${costAd.toFixed(2)}`} inferred={isAdInferred} />
              <ProfitRow label="退货损失" value={`-$${costRefundLoss.toFixed(2)}`} />
              {costCoupon > 0 && <ProfitRow label="优惠券(历史)" value={`($${costCoupon.toFixed(2)})`} />}
              {costPromo > 0 && <ProfitRow label="促销成本(手动)" value={`-$${costPromo.toFixed(2)}`} />}
              {weekPromoCost.count > 0 && (
                <div className="text-[11px] text-accent-600 italic text-right">{weekPromoCost.count} 条促销 · 含促销 ${costPromo.toFixed(2)}</div>
              )}
              <div className="my-1.5 h-px bg-background-200/50" />
              <ProfitRow label="总成本" value={`$${totalCost.toFixed(2)}`} bold />
              <ProfitRow label="单件净利" value={`$${grossProfit.toFixed(2)}`} bold tone={grossProfit < 0 ? "text-red-600" : "text-accent-700"} />
              <ProfitRow label="净利率" value={costMissing ? "成本缺失" : `${grossMargin.toFixed(1)}%`} bold tone={costMissing ? "text-foreground-400" : (grossMargin < 0 ? "text-red-600" : grossMargin < 5 ? "text-secondary-700" : "text-accent-700")} />
              <div className="my-1.5 h-px bg-background-200/50" />
              <ProfitRow label="广告费比" value={`${latest ? latest.adRatio.toFixed(1) : "0"}%`} />
              <ProfitRow label="退货率" value={costMissing ? "缺失" : `${calcReturnRate.toFixed(1)}%`} />
              <ProfitRow label="退款率" value={refundMissing ? "缺失" : `${calcRefundRate.toFixed(1)}%`} />
            </div>
          </div>

          {/* ── 折扣盈利 ── */}
          <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-100 text-[14px] text-accent-700">
                <i className="ri-coupon-3-line" aria-hidden />
              </div>
              <span className="text-[13px] font-semibold text-foreground-900">折扣售价</span>
              {activeOrUpcomingPromo ? (
                <span className="ml-auto flex items-center gap-1.5">
                  <Badge tone={activeOrUpcomingPromo.status === "active" ? "accent" : "secondary"}>{activeOrUpcomingPromo.type}</Badge>
                  <span className="mono-num text-[13px] font-bold text-foreground-950">${activeOrUpcomingPromo.discountPrice?.toFixed(2) ?? "-"}</span>
                </span>
              ) : (
                <span className="ml-auto text-[12px] text-foreground-500">暂无折扣活动</span>
              )}
            </div>
            {activeOrUpcomingPromo?.discountPrice ? (
              <div className="space-y-1 text-[13px]">
                <ProfitRow label="折扣价格" value={`$${activeOrUpcomingPromo.discountPrice.toFixed(2)}`} highlight />
                <div className="my-1.5 h-px bg-background-200/50" />
                <ProfitRow label="FOB" value={`-$${(sku.costFob ?? 0).toFixed(2)}`} />
                <ProfitRow label="头程" value={`-$${(sku.costShipping ?? 0).toFixed(2)}`} />
                <ProfitRow label="尾程(配送费)" value={`-$${(sku.costDelivery ?? 0).toFixed(2)}`} />
                <ProfitRow label="折扣佣金" value={`-$${discountCostCommission.toFixed(2)}`} inferred={isCommissionInferred} />
                <ProfitRow label="仓租" value={`-$${(sku.costStorage ?? 0).toFixed(2)}`} />
                <ProfitRow label="折扣广告费" value={`-$${discountCostAd.toFixed(2)}`} inferred={isDiscountAdInferred} />
                <ProfitRow label="折扣退货损失" value={`-$${discountCostRefundLoss.toFixed(2)}`} />
                <ProfitRow label="优惠券" value={`(${discountCostCoupon.toFixed(2)})`} />
                <div className="my-1.5 h-px bg-background-200/50" />
                <ProfitRow label="折扣总成本" value={`$${discountTotalCost.toFixed(2)}`} bold />
                <ProfitRow label="折扣净利" value={`$${discountProfit.toFixed(2)}`} bold tone={discountProfit < 0 ? "text-red-600" : "text-accent-700"} />
                <ProfitRow label="折扣利润率" value={costMissing ? "成本缺失" : `${discountMargin.toFixed(1)}%`} bold tone={costMissing ? "text-foreground-400" : (discountMargin < 0 ? "text-red-600" : discountMargin < 5 ? "text-secondary-700" : "text-accent-700")} />
                <div className="my-1.5 h-px bg-background-200/50" />
                <ProfitRow label="折扣费比" value={`${latest ? latest.adRatio.toFixed(1) : "0"}%`} />
                <ProfitRow label="折扣广告费(估)" value={`$${discountAdEstimated.toFixed(2)}`} />
                <ProfitRow label="折扣退款率" value={`${(calcReturnRate ?? 0).toFixed(1)}%`} />
                <ProfitRow label="折扣退款费(估)" value={`$${discountReturnFeeEstimated.toFixed(2)}`} />
              </div>
            ) : (
              <div className="py-8 text-center text-[13px] text-foreground-500">
                <i className="ri-coupon-3-line mb-2 block text-[24px] text-foreground-300" aria-hidden />
                当前无促销或 Deal 活动，未产生折扣售价数据
              </div>
            )}
          </div>
        </div>
      </Section>
      )}

      {/* ═══════ 4. 成本结构瀑布 ═══════ */}
      {visibleKeys.includes("costWaterfall") && (
      <Section title="成本结构瀑布" icon="ri-water-flash-line" subtitle="售价 → 逐项扣减 → 净利">
        <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
          <div className="space-y-3">
            <CostWaterfall label="售价" value={sku.price} color="bg-primary-500" isStart />
            {costFob ? <CostWaterfall label="FOB (产品成本)" value={-costFob} color="bg-secondary-400" /> : null}
            {costShipping ? <CostWaterfall label="头程费" value={-costShipping} color="bg-secondary-400" /> : null}
            {costDelivery ? <CostWaterfall label="尾程(配送费)" value={-costDelivery} color="bg-secondary-400" /> : null}
            {costCommission > 0 ? <CostWaterfall label="佣金" value={-costCommission} color="bg-secondary-400" /> : null}
            {costStorage > 0 ? <CostWaterfall label="仓租" value={-costStorage} color="bg-secondary-300" /> : null}
            {costAd > 0 ? <CostWaterfall label="广告费" value={-costAd} color="bg-secondary-300" /> : null}
            {costRefundLoss > 0 ? <CostWaterfall label="退货损失" value={-costRefundLoss} color="bg-secondary-300" /> : null}
            {costPromo > 0 ? <CostWaterfall label="促销成本(手动)" value={-costPromo} color="bg-secondary-300" /> : null}
            {costCoupon > 0 ? <CostWaterfall label="优惠券" value={-costCoupon} color="bg-secondary-300" /> : null}
            <div className="my-2 h-px bg-background-200/70" />
            <CostWaterfall label="单件净利" value={grossProfit} color={grossProfit >= 0 ? "bg-accent-500" : "bg-red-500"} isEnd />
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-foreground-500">毛利率</span>
              <span className={`mono-num font-semibold ${grossMargin >= 0 ? "text-accent-700" : "text-red-600"}`}>{grossMargin.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </Section>
      )}

      {/* ═══════ 5. 促销折扣 + 发货建议 ═══════ */}
      {visibleKeys.includes("promoShipment") && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {skuPromos.length > 0 && (
          <Section title="促销活动" subtitle={`${skuPromos.length} 个`} icon="ri-flashlight-line"
            action={<Link to="/promotions" className="text-[12px] font-medium text-primary-700 hover:underline cursor-pointer whitespace-nowrap">管理促销 →</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                    <th className="border-b border-background-200 px-2 py-2">类型</th>
                    <th className="border-b border-background-200 px-2 py-2">名称</th>
                    <th className="border-b border-background-200 px-2 py-2">开始</th>
                    <th className="border-b border-background-200 px-2 py-2">结束</th>
                    <th className="border-b border-background-200 px-2 py-2">状态</th>
                    <th className="border-b border-background-200 px-2 py-2">折扣价</th>
                    <th className="border-b border-background-200 px-2 py-2">倍率</th>
                  </tr>
                </thead>
                <tbody>
                  {skuPromos.map((p) => {
                    const daysToStart = Math.ceil((new Date(p.startDate).getTime() - new Date(today).getTime()) / 86400000);
                    const daysToEnd = Math.ceil((new Date(p.endDate).getTime() - new Date(today).getTime()) / 86400000);
                    return (
                      <tr key={p.id}>
                        <td className="border-b border-background-200/70 px-2 py-2">
                          <Badge tone={p.type === "BD" ? "primary" : p.type === "LD" ? "danger" : p.type === "7DD" ? "warn" : "accent"}>{p.type}</Badge>
                        </td>
                        <td className="border-b border-background-200/70 px-2 py-2 font-medium text-foreground-900">{p.name}</td>
                        <td className="mono-num border-b border-background-200/70 px-2 py-2 text-[12px]">
                          <span className="flex items-center gap-1">{p.startDate} {p.status === "upcoming" && daysToStart <= 2 && daysToStart >= 0 && <Badge tone="warn">{daysToStart === 0 ? "今天" : `${daysToStart}d`}</Badge>}</span>
                        </td>
                        <td className="mono-num border-b border-background-200/70 px-2 py-2 text-[12px]">
                          <span className="flex items-center gap-1">{p.endDate} {daysToEnd <= 2 && daysToEnd >= 0 && <Badge tone="danger">{daysToEnd === 0 ? "今天" : `${daysToEnd}d`}</Badge>}</span>
                        </td>
                        <td className="border-b border-background-200/70 px-2 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.status === "active" ? "bg-accent-100 text-accent-800" : p.status === "ended" ? "bg-background-200 text-foreground-500" : "bg-secondary-100 text-secondary-800"}`}>
                            {p.status === "active" ? "进行中" : p.status === "ended" ? "已结束" : "待开始"}
                          </span>
                        </td>
                        <td className="mono-num border-b border-background-200/70 px-2 py-2 text-[12px]">{p.discountPrice != null ? `$${p.discountPrice.toFixed(2)}` : "-"}</td>
                        <td className="border-b border-background-200/70 px-2 py-2 text-[12px]">{p.multiplier != null ? `×${p.multiplier}` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {skuShipment && (
          <Section
            title="发货建议"
            icon="ri-truck-line"
            subtitle={`${skuShipment.priority === "urgent" ? "Urgent" : skuShipment.priority === "high" ? "Priority" : "Normal"} · Ship ${skuShipment.suggestQty} units`}
            action={<Link to="/shipment" className="text-[12px] font-medium text-primary-700 hover:underline cursor-pointer whitespace-nowrap">前往决策中心 →</Link>}
          >
            <div className="grid grid-cols-2 gap-3">
              <DataTile label="建议数量" value={skuShipment.suggestQty.toLocaleString()} />
              <DataTile label="最晚发货日" value={skuShipment.latestShipDate} />
              <DataTile label="当前覆盖" value={`${formatCoverDays(skuShipment.daysOfCoverWithTransit)} 天`} sub={`目标 ${skuShipment.targetCoverDays} 天`} />
              <DataTile label="原因" value={skuShipment.reason} />
            </div>
            {skuShipment.campaignBoost && <Badge tone="warn" className="mt-2">{skuShipment.campaignBoost}</Badge>}
          </Section>
        )}
      </div>
      )}

      {/* ═══════ 混卖补货建议 ═══════ */}
      {visibleKeys.includes("mixedReplenish") && sku.fulfillment === "mixed" && (fbaReplenish || fbmReplenish) && (
        <Section title="混卖补货建议" icon="ri-truck-line" subtitle="FBA / FBM 独立计算安全库存和建议补货量">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {fbaReplenish && (
              <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700">
                    <i className="ri-archive-drawer-line" aria-hidden />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground-900">FBA 补货</span>
                  <Badge tone="primary">FBA</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DataTile label="日均销量" value={fbaReplenish.dailySales.toFixed(1)} sub="FBA 渠道" />
                  <DataTile label="现有库存" value={fbaReplenish.stockOnHand.toLocaleString()} />
                  <DataTile label="在途库存" value={fbaReplenish.stockInTransit.toLocaleString()} />
                  <DataTile label="Lead Time" value={fbaReplenish.leadTimeDays + " 天"} />
                  <DataTile label="安全库存" value={fbaReplenish.safetyStockDays + " 天"} sub={`≈ ${fbaReplenish.safetyStock.toFixed(0)} 件`} />
                  <DataTile label="在库覆盖" value={formatCoverDays(fbaReplenish.coverDays) + " 天"} />
                </div>
                <div className="mt-3 rounded-lg border border-accent-200/70 bg-accent-50/60 p-3">
                  <span className="text-[12px] font-semibold text-foreground-700">建议补货量</span>
                  <span className="ml-2 mono-num text-[20px] font-bold text-accent-700">{fbaReplenish.suggestQty > 0 ? fbaReplenish.suggestQty.toLocaleString() + " 件" : "暂不需要"}</span>
                  <div className="mt-1 text-[11px] text-foreground-500">FBA安全库存 = Lead Time × 日均销量 × 20%</div>
                </div>
              </div>
            )}
            {fbmReplenish && (
              <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary-100 text-[14px] text-secondary-700">
                    <i className="ri-box-3-line" aria-hidden />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground-900">FBM 补货</span>
                  <Badge tone="secondary">FBM</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <DataTile label="日均销量" value={fbmReplenish.dailySales.toFixed(1)} sub="FBM 渠道" />
                  <DataTile label="现有库存" value={fbmReplenish.stockOnHand.toLocaleString()} />
                  <DataTile label="在途库存" value={fbmReplenish.stockInTransit.toLocaleString()} />
                  <DataTile label="Lead Time" value={fbmReplenish.leadTimeDays + " 天"} />
                  <DataTile label="安全库存" value={fbmReplenish.safetyStockDays + " 天"} sub={`≈ ${fbmReplenish.safetyStock.toFixed(0)} 件`} />
                  <DataTile label="在库覆盖" value={formatCoverDays(fbmReplenish.coverDays) + " 天"} />
                </div>
                <div className="mt-3 rounded-lg border border-secondary-200/70 bg-secondary-50/60 p-3">
                  <span className="text-[12px] font-semibold text-foreground-700">建议补货量</span>
                  <span className="ml-2 mono-num text-[20px] font-bold text-secondary-800">{fbmReplenish.suggestQty > 0 ? fbmReplenish.suggestQty.toLocaleString() + " 件" : "暂不需要"}</span>
                  <div className="mt-1 text-[11px] text-foreground-500">FBM安全库存 = Lead Time × 日均销量 × 50%</div>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ═══════ 6. 库存分析 ═══════ */}
      {visibleKeys.includes("inventory") && (
      <Section title="库存分析" icon="ri-archive-2-line" subtitle={`在库 ${allStock} 件 · 在途 ${allTransit} 件 · 可用 ${allAvailable} 件 · 存销比 ${stockSalesRatio}`}>
        {/* 地区库存拆分 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            { label: "美东在库", qty: eastStock, transit: eastTransitNew },
            { label: "美西在库", qty: westStock, transit: westTransitNew },
            { label: "东南在库", qty: southeastStock, transit: southeastTransit },
            { label: "中南在库", qty: southcentralStock, transit: southcentralTransit },
          ] as const).map(({ label, qty, transit }) => (
            <div key={label} className="rounded-lg border border-background-200/70 bg-background-100/50 p-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-foreground-500">{label}</div>
              <div className="mono-num mt-1 font-heading text-[18px] font-bold text-foreground-900">{qty.toLocaleString()}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-foreground-500">
                <i className="ri-ship-line" aria-hidden />
                <span>在途 {transit.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
        {/* 小计行 */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-primary-200/70 bg-primary-50/60 p-3">
            <div className="text-[11px] text-foreground-500">在库合计</div>
            <div className="mono-num mt-1 font-heading text-[18px] font-bold text-foreground-950">{allStock.toLocaleString()}</div>
            <div className="text-[11px] text-foreground-500">美东+美西+东南+中南</div>
          </div>
          <div className="rounded-lg border border-secondary-200/70 bg-secondary-50/60 p-3">
            <div className="text-[11px] text-foreground-500">在途合计</div>
            <div className="mono-num mt-1 font-heading text-[18px] font-bold text-foreground-950">{allTransit.toLocaleString()}</div>
            <div className="text-[11px] text-foreground-500">四仓在途汇总</div>
          </div>
          <div className="rounded-lg border border-accent-200/70 bg-accent-50/60 p-3">
            <div className="text-[11px] text-foreground-500">总库存（自动汇总）</div>
            <div className="mono-num mt-1 font-heading text-[18px] font-bold text-accent-700">{allAvailable.toLocaleString()}</div>
            <div className="text-[11px] text-foreground-500">在库{allStock} + 在途{allTransit}</div>
          </div>
        </div>
        {latest && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DataTile label="7天销量" value={latest.dailySales7d.toFixed(1)} sub="日均" />
            <DataTile label="30天销量" value={latest.monthlySales.toLocaleString()} />
            <DataTile label="存销比" value={String(stockSalesRatio)} />
            <DataTile label="在库可售天数" value={`${formatCoverDays(daysOfCoverOnHand)} 天`} />
          </div>
        )}
      </Section>
      )}

      {/* ═══════ 7. Listing 优化 & 基础数据 ═══════ */}
      {visibleKeys.includes("listing") && (
      <Section title="Listing 优化 & 基础数据" icon="ri-file-list-3-line" subtitle="SKU 主档信息 · 包裹参数 · Listing 状态 — 点击「编辑」可直接修改">
        {/* ── 全局保存提示 ── */}
        {skuMsg && (
          <div className={`mb-3 text-[13px] font-medium ${skuMsg.includes("失败") ? "text-red-600" : "text-accent-700"}`}>
            <i className={skuMsg.includes("失败") ? "ri-close-line" : "ri-check-line"} aria-hidden /> {skuMsg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ── 产品信息（可编辑） ── */}
          <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700"><i className="ri-id-card-line" aria-hidden /></div>
                <span className="text-[13px] font-semibold text-foreground-900">产品信息</span>
              </div>
              <button
                type="button"
                onClick={() => { setEditProduct(!editProduct); setEditPackage(false); setEditListing(false); }}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${editProduct ? "bg-primary-500 text-background-50" : "border border-background-200 text-foreground-500 hover:text-primary-700"}`}
              >
                <i className={editProduct ? "ri-close-line" : "ri-edit-line"} aria-hidden />
                {editProduct ? "关闭" : "编辑"}
              </button>
            </div>
            {editProduct ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>SKU</label>
                    <input className={inputCls} value={editSku.sku} onChange={(e) => updateEditSku({ sku: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>品名</label>
                    <input className={inputCls} value={editSku.name} onChange={(e) => updateEditSku({ name: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>MSKU</label>
                    <input className={inputCls} value={editSku.msku ?? ""} onChange={(e) => updateEditSku({ msku: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>ASIN</label>
                    <input className={inputCls} value={editSku.asin ?? ""} onChange={(e) => updateEditSku({ asin: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>UPC</label>
                    <input className={inputCls} value={editSku.upc ?? ""} onChange={(e) => updateEditSku({ upc: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>父体 ASIN</label>
                    <input className={inputCls} value={editSku.parentAsin ?? ""} onChange={(e) => updateEditSku({ parentAsin: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>父体 SKU</label>
                    <input className={inputCls} value={editSku.parentSku ?? ""} onChange={(e) => updateEditSku({ parentSku: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>站点</label>
                    <select className={selectCls} value={editSku.marketplace ?? "US"} onChange={(e) => updateEditSku({ marketplace: e.target.value })}>
                      <option value="US">美国 US</option><option value="UK">英国 UK</option><option value="DE">德国 DE</option><option value="JP">日本 JP</option><option value="CA">加拿大 CA</option><option value="AU">澳大利亚 AU</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>店铺</label>
                    <input className={inputCls} value={editSku.store} onChange={(e) => updateEditSku({ store: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>配送方式</label>
                    <div className="flex rounded-md border border-background-200 bg-background-50 p-1">
                      {(["FBA", "FBM", "mixed"] as const).map((m) => (
                        <button key={m} type="button" onClick={() => updateEditSku({ fulfillment: m })}
                          className={["flex-1 rounded py-1 text-xs font-semibold cursor-pointer", editSku.fulfillment === m ? "bg-primary-500 text-background-50" : "text-foreground-500"].join(" ")}>
                          {m === "mixed" ? "混卖" : m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>链接类型</label>
                    <select className={selectCls} value={editSku.linkType ?? "main"} onChange={(e) => updateEditSku({ linkType: e.target.value as SkuMaster["linkType"] })}>
                      <option value="main">主链接</option><option value="follow">跟卖</option><option value="backup">备用</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>在售状态</label>
                    <select className={selectCls} value={editSku.saleStatus} onChange={(e) => updateEditSku({ saleStatus: e.target.value as SkuMaster["saleStatus"] })}>
                      <option value="active">在售</option><option value="clearance">清货</option><option value="paused">暂停</option><option value="discontinued">停售</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>生命周期</label>
                    <select className={selectCls} value={editSku.lifecycle ?? "mature"} onChange={(e) => updateEditSku({ lifecycle: e.target.value as SkuMaster["lifecycle"] })}>
                      <option value="new">新品</option><option value="growth">成长</option><option value="mature">成熟</option><option value="clearance">清货</option><option value="eol">停售</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>品类</label>
                    <input className={inputCls} value={editSku.category ?? ""} onChange={(e) => updateEditSku({ category: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>上架日期</label>
                    <input type="date" className={inputCls} value={editSku.launchDate ?? ""} onChange={(e) => updateEditSku({ launchDate: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>销售总价</label>
                    <input type="number" step="0.01" className={inputCls} value={editSku.listPrice ?? ""} onChange={(e) => updateEditSku({ listPrice: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>优惠券</label>
                    <input type="number" step="0.01" className={inputCls} value={editSku.coupon ?? ""} onChange={(e) => updateEditSku({ coupon: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>产品链接</label>
                    <input className={inputCls} value={editSku.productUrl ?? ""} onChange={(e) => updateEditSku({ productUrl: e.target.value })} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-[13px]">
                <InfoRow label="SKU" value={sku.sku} />
                <InfoRow label="品名" value={sku.name} />
                <InfoRow label="MSKU" value={
                  sku.msku
                    ? (() => {
                        const allMs = sku.msku.split(/[,\s，、·]+/).map((m) => m.trim()).filter(Boolean);
                        const list = focusMsku ? allMs.filter((m) => m === focusMsku) : allMs;
                        return list.map((m) => (
                          <span key={m}
                            className={`mono-num mr-1 inline-block rounded-[8px] px-2 py-0.5 text-[12px] text-foreground-600 ${focusMsku && m === focusMsku ? "bg-primary-50 ring-2 ring-primary-400" : "bg-background-100"}`}>
                            {m}
                            <span className="ml-1 text-[10px] text-foreground-400">{mskuStoreOf(sku, m)}</span>
                          </span>
                        ));
                      })()
                    : "-"
                } />
                <InfoRow label="ASIN" value={sku.asin ?? "-"} />
                <InfoRow label="UPC" value={sku.upc ?? "-"} />
                <InfoRow label="父体 ASIN" value={sku.parentAsin ?? "-"} />
                <InfoRow label="父体 SKU" value={sku.parentSku ?? "-"} />
                <InfoRow label="站点" value={sku.marketplace ?? "US"} />
                <InfoRow label="店铺" value={sku.store} />
                <InfoRow label="配送方式" value={sku.fulfillment} />
                <InfoRow label="链接类型" value={sku.linkType ? linkTypeLabel[sku.linkType] : "-"} />
                <InfoRow label="在售情况" value={saleStatusLabel[sku.saleStatus]} />
                <InfoRow label="生命周期" value={sku.lifecycle ? lifecycleLabel[sku.lifecycle] : "-"} />
                <InfoRow label="品类" value={sku.category ?? "-"} />
                <InfoRow label="上架日期" value={sku.launchDate ?? "-"} />
                <InfoRow label="销售总价" value={sku.listPrice != null ? `$${sku.listPrice.toFixed(2)}` : "-"} />
                <InfoRow label="优惠券" value={sku.coupon != null ? `$${sku.coupon.toFixed(2)}` : "-"} />
              </div>
            )}
          </div>

          {/* ── 包裹参数（可编辑） ── */}
          <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-100 text-[14px] text-accent-700"><i className="ri-box-3-line" aria-hidden /></div>
                <span className="text-[13px] font-semibold text-foreground-900">包裹参数</span>
              </div>
              <button
                type="button"
                onClick={() => { setEditPackage(!editPackage); setEditProduct(false); setEditListing(false); }}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${editPackage ? "bg-primary-500 text-background-50" : "border border-background-200 text-foreground-500 hover:text-primary-700"}`}
              >
                <i className={editPackage ? "ri-close-line" : "ri-edit-line"} aria-hidden />
                {editPackage ? "关闭" : "编辑"}
              </button>
            </div>
            {editPackage ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { k: "packageLength" as const, l: "长 (cm)" },
                    { k: "packageWidth" as const, l: "宽 (cm)" },
                    { k: "packageHeight" as const, l: "高 (cm)" },
                  ]).map(({ k, l }) => (
                    <div key={k}>
                      <label className={labelCls}>{l}</label>
                      <input type="number" step="0.1" className={inputCls} value={editSku[k] ?? ""} onChange={(e) => updateEditSku({ [k]: Number(e.target.value) })} />
                    </div>
                  ))}
                  <div>
                    <label className={labelCls}>单箱数</label>
                    <input type="number" step="1" className={inputCls} value={editSku.unitsPerBox ?? ""} onChange={(e) => updateEditSku({ unitsPerBox: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>重量 (kg)</label>
                    <input type="number" step="0.01" className={inputCls} value={editSku.packageWeight ?? ""} onChange={(e) => updateEditSku({ packageWeight: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>Lead Time (天)</label>
                    <input type="number" step="1" className={inputCls} value={editSku.leadTimeDays ?? 40} onChange={(e) => updateEditSku({ leadTimeDays: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>安全库存 (天)</label>
                    <input type="number" step="1" className={inputCls} value={editSku.safetyStockDays ?? 30} onChange={(e) => updateEditSku({ safetyStockDays: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>售价 (USD)</label>
                    <input type="number" step="0.01" className={inputCls} value={editSku.price} onChange={(e) => updateEditSku({ price: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-[13px]">
                <InfoRow label="包裹长" value={sku.packageLength != null ? `${sku.packageLength} cm` : "-"} />
                <InfoRow label="包裹宽" value={sku.packageWidth != null ? `${sku.packageWidth} cm` : "-"} />
                <InfoRow label="包裹高" value={sku.packageHeight != null ? `${sku.packageHeight} cm` : "-"} />
                <InfoRow label="单箱数" value={sku.unitsPerBox != null ? `${sku.unitsPerBox} 件` : "-"} />
                <InfoRow label="包裹重" value={sku.packageWeight != null ? `${sku.packageWeight} kg` : "-"} />
                <div className="my-2 h-px bg-background-200/70" />
                <InfoRow label="Lead Time" value={`${sku.leadTimeDays ?? 40} 天`} />
                <InfoRow label="安全库存天数" value={`${sku.safetyStockDays ?? 30} 天`} />
              </div>
            )}
          </div>

          {/* ── Listing 优化（可编辑） ── */}
          <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary-100 text-[14px] text-secondary-700"><i className="ri-image-edit-line" aria-hidden /></div>
                <span className="text-[13px] font-semibold text-foreground-900">Listing 优化</span>
              </div>
              <button
                type="button"
                onClick={() => { setEditListing(!editListing); setEditProduct(false); setEditPackage(false); }}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${editListing ? "bg-primary-500 text-background-50" : "border border-background-200 text-foreground-500 hover:text-primary-700"}`}
              >
                <i className={editListing ? "ri-close-line" : "ri-edit-line"} aria-hidden />
                {editListing ? "关闭" : "编辑"}
              </button>
            </div>
            {editListing ? (
              <div className="space-y-3">
                {([
                  { k: "aPlus" as const, l: "A+ 页面" },
                  { k: "aPlusAdvanced" as const, l: "高级 A+" },
                  { k: "installVideo" as const, l: "安装视频" },
                ]).map(({ k, l }) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border border-background-200/70 px-3 py-2.5">
                    <span className="text-[13px] font-medium text-foreground-800">{l}</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => updateEditSku({ [k]: "done" })}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${editSku[k] === "done" ? "bg-accent-500 text-background-50" : "bg-background-100 text-foreground-500"}`}>
                        <i className="ri-check-line mr-0.5" aria-hidden />已完成
                      </button>
                      <button type="button" onClick={() => updateEditSku({ [k]: "todo" })}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${editSku[k] === "todo" ? "bg-secondary-500 text-background-50" : "bg-background-100 text-foreground-500"}`}>
                        <i className="ri-time-line mr-0.5" aria-hidden />未完成
                      </button>
                    </div>
                  </div>
                ))}
                <div>
                  <label className={labelCls}>透明计划</label>
                  <input className={inputCls} value={editSku.transparentPlan ?? ""} onChange={(e) => updateEditSku({ transparentPlan: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>产品链接</label>
                  <input className={inputCls} value={editSku.productUrl ?? ""} onChange={(e) => updateEditSku({ productUrl: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-[13px]">
                <ListingStatusRow label="A+ 页面" status={sku.aPlus} />
                <ListingStatusRow label="高级 A+" status={sku.aPlusAdvanced} />
                <ListingStatusRow label="安装视频" status={sku.installVideo} />
                <InfoRow label="透明计划" value={sku.transparentPlan ?? "-"} />
                {sku.productUrl && (
                  <div className="pt-1">
                    <a href={safeHref(sku.productUrl)} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-primary-700 hover:underline cursor-pointer break-all">
                      <i className="ri-external-link-line shrink-0" aria-hidden /> 产品链接
                    </a>
                  </div>
                )}
                {sku.competitorUrls && sku.competitorUrls.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[12px] text-foreground-500">竞品链接</span>
                    {sku.competitorUrls.map((url, i) => (
                      <a key={i} href={safeHref(url)} target="_blank" rel="nofollow noopener noreferrer" className="block truncate text-[12px] text-primary-700 hover:underline cursor-pointer">
                        竞品 {i + 1} · {url.slice(0, 50)}...
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 三个编辑区域共用保存按钮 ── */}
        {(editProduct || editPackage || editListing) && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={saveSkuEdit}
              disabled={skuSaving}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <i className={skuSaving ? "ri-loader-4-line animate-spin" : "ri-save-line"} aria-hidden />
              {skuSaving ? "保存中..." : "保存修改"}
            </button>
            {skuMsg && (
              <span className={`text-[12px] ${skuMsg.includes("失败") ? "text-red-600" : "text-accent-700"}`}>
                {skuMsg}
              </span>
            )}
          </div>
        )}
      </Section>
      )}

      {/* ═══════ 8. 上期对比 ═══════ */}
      {visibleKeys.includes("weekOverWeek") && skuWow && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-background-200/70 bg-background-100/60 px-4 py-3">
          <span className="text-[12px] font-semibold text-foreground-700">上期对比</span>
          <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>日均销量</span>{deltaArrow(skuWow.dailySalesDelta)}</div>
          <span className="text-foreground-300">·</span>
          <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>库存</span>{deltaArrow(skuWow.stockDelta, true)}</div>
          <span className="text-foreground-300">·</span>
          <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>利润率</span>{deltaArrow(skuWow.profitMarginDelta)}</div>
          <span className="text-foreground-300">·</span>
          <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>费比</span>{deltaArrow(skuWow.adRatioDelta, true)}</div>
          <span className="text-foreground-300">·</span>
          <div className="flex items-center gap-1.5 text-[12px] text-foreground-600"><span>评分</span>{deltaArrow(skuWow.ratingDelta)}</div>
        </div>
      )}

      {/* ═══════ 本周 vs 上周对比 ═══════ */}
      {latest && prevSnap ? (
        <Section title="本周 vs 上周环比" icon="ri-bar-chart-grouped-line" subtitle="近7天数据对比">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 周销量对比 */}
            <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-[14px] text-primary-700">
                  <i className="ri-shopping-cart-2-line" aria-hidden />
                </div>
                <span className="text-[13px] font-semibold text-foreground-900">周销量对比</span>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg bg-background-100/70 px-3 py-2.5">
                  <div className="text-[11px] text-foreground-500">本周（近7天日均）</div>
                  <div className="mono-num mt-0.5 text-[22px] font-bold text-foreground-950">{latest.dailySales7d.toFixed(1)}</div>
                </div>
                <div className="rounded-lg bg-background-100/50 px-3 py-2.5">
                  <div className="text-[11px] text-foreground-500">上周（近7天日均）</div>
                  <div className="mono-num mt-0.5 text-[22px] font-bold text-foreground-900">{prevSnap.dailySales7d.toFixed(1)}</div>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-foreground-500">变化</span>
                  <span className={`mono-num font-semibold ${(latest.dailySales7d - prevSnap.dailySales7d) >= 0 ? 'text-accent-600' : 'text-red-500'}`}>
                    {(latest.dailySales7d - prevSnap.dailySales7d) >= 0 ? '↑' : '↓'} {Math.abs(latest.dailySales7d - prevSnap.dailySales7d).toFixed(1)}
                  </span>
                  <span className={`mono-num font-semibold ${(latest.dailySales7d - prevSnap.dailySales7d) >= 0 ? 'text-accent-600' : 'text-red-500'}`}>
                    ({prevSnap.dailySales7d > 0 ? (((latest.dailySales7d - prevSnap.dailySales7d) / prevSnap.dailySales7d) * 100).toFixed(1) : '—'}%)
                  </span>
                </div>
              </div>
            </div>

            {/* 周利润对比 */}
            <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-100 text-[14px] text-accent-700">
                  <i className="ri-funds-line" aria-hidden />
                </div>
                <span className="text-[13px] font-semibold text-foreground-900">周利润对比</span>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg bg-background-100/70 px-3 py-2.5">
                  <div className="text-[11px] text-foreground-500">本周单件净利</div>
                  <div className={`mono-num mt-0.5 text-[22px] font-bold ${latest.profit >= 0 ? 'text-accent-700' : 'text-red-600'}`}>${latest.profit.toFixed(2)}</div>
                </div>
                <div className="rounded-lg bg-background-100/50 px-3 py-2.5">
                  <div className="text-[11px] text-foreground-500">上周单件净利</div>
                  <div className={`mono-num mt-0.5 text-[22px] font-bold ${prevSnap.profit >= 0 ? 'text-foreground-900' : 'text-red-600'}`}>${prevSnap.profit.toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-foreground-500">变化</span>
                  <span className={`mono-num font-semibold ${(latest.profit - prevSnap.profit) >= 0 ? 'text-accent-600' : 'text-red-500'}`}>
                    {(latest.profit - prevSnap.profit) >= 0 ? '↑' : '↓'} ${Math.abs(latest.profit - prevSnap.profit).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* 利润率 & 费比 */}
            <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary-100 text-[14px] text-secondary-700">
                  <i className="ri-percent-line" aria-hidden />
                </div>
                <span className="text-[13px] font-semibold text-foreground-900">利润率 &amp; 费比</span>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg bg-background-100/70 px-3 py-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-foreground-500">本周净利率</span>
                    <span className={`mono-num font-semibold ${latest.profitMargin >= 0 ? 'text-accent-700' : 'text-red-600'}`}>{latest.profitMargin.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-foreground-500">广告费比</span>
                    <span className="mono-num font-semibold text-foreground-900">{latest.adRatio.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="rounded-lg bg-background-100/50 px-3 py-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-foreground-500">上周净利率</span>
                    <span className={`mono-num font-semibold ${prevSnap.profitMargin >= 0 ? 'text-foreground-900' : 'text-red-600'}`}>{prevSnap.profitMargin.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-foreground-500">广告费比</span>
                    <span className="mono-num font-semibold text-foreground-700">{prevSnap.adRatio.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-foreground-500">净利率变化</span>
                  <span className={`mono-num font-semibold ${(latest.profitMargin - prevSnap.profitMargin) >= 0 ? 'text-accent-600' : 'text-red-500'}`}>
                    {(latest.profitMargin - prevSnap.profitMargin) >= 0 ? '↑' : '↓'} {Math.abs(latest.profitMargin - prevSnap.profitMargin).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Section>
      ) : (
        <div className="rounded-[14px] border border-background-200/70 bg-background-100/60 px-4 py-6 text-center text-[13px] text-foreground-500">
          <i className="ri-bar-chart-grouped-line mb-2 block text-[28px] text-foreground-300" aria-hidden />
          暂无上周数据，下次上传后可查看周环比
        </div>
      )}

      {/* ======= 关联待办 ======= */}
      {visibleKeys.includes("relatedTodos") && (
        <Section
          title="关联待办"
          icon="ri-checkbox-circle-line"
          subtitle={relatedTodos.length > 0 ? `${relatedTodos.length} 个未完成` : "暂无待办"}
          action={
            <Link to="/todo" className="text-[12px] font-medium text-primary-700 hover:underline cursor-pointer whitespace-nowrap">
              管理待办 &rarr;
            </Link>
          }
        >
          {relatedTodos.length === 0 ? (
            <EmptyState
              icon="ri-checkbox-blank-circle-line"
              title="暂无关联待办"
              desc="在『我的待办』中新增待办并关联此 SKU"
              action={<Link to="/todo" className="rounded-[9px] bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap">去添加待办</Link>}
            />
          ) : (
            <div className="space-y-2">
              {relatedTodos.map((todo) => {
                const isOverdue = todo.dueDate && todo.dueDate < todayStr;
                return (
                  <div key={todo.id} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                    isOverdue ? "border-red-200 bg-red-50/60" : "border-background-200/70 bg-background-50"
                  }`}>
                    <button type="button" onClick={() => toggleTodo(todo)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-background-300 hover:border-primary-400 cursor-pointer transition-colors">
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-foreground-900">{todo.content}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                        {todo.dueDate && (
                          <span className={isOverdue ? "text-red-600 font-medium" : "text-foreground-500"}>
                            <i className={`${isOverdue ? "ri-alert-line" : "ri-calendar-line"} mr-0.5`} aria-hidden />
                            {todo.dueDate}{isOverdue ? " (已过期)" : ""}
                          </span>
                        )}
                        <span className="text-foreground-400">
                          创建 {new Date(todo.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] text-foreground-400 whitespace-nowrap">点击勾选已完成</span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ======= 异常原因拆解 ======= */}
      {skuDiagnoses.length > 0 && (
        <Section title="异常原因拆解" icon="ri-search-eye-line" subtitle={`共 ${skuDiagnoses.length} 条活跃告警`}>
          <div className="space-y-4">
            {skuDiagnoses.map(({ alert, result }) => (
              <div key={alert.id} className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    alert.severity === "critical" ? "bg-red-50 text-red-600" : "bg-secondary-100 text-secondary-700"
                  }`}>{alert.severity === "critical" ? "紧急" : "关注"}</span>
                  <span className="text-[13px] font-semibold text-foreground-900">{alert.title}</span>
                  <Link to={`/diagnosis?type=${DIAGNOSIS_GROUP[alert.type] ?? alert.type}&sku=${encodeURIComponent(alert.sku)}`} className="ml-auto text-[11px] font-medium text-primary-600 hover:underline cursor-pointer">
                    去诊断页 →
                  </Link>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-foreground-700">{result.summary}</p>
                <DiagnosisFactorsInline result={result} />
                {result.suggestion && (
                  <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-accent-50/50 px-3 py-2">
                    <i className="ri-lightbulb-line mt-0.5 text-[14px] text-accent-700" aria-hidden />
                    <span className="text-[12px] text-foreground-700"><span className="font-semibold">建议动作：</span>{result.suggestion}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ======= 历史变化表 ======= */}
      {historyCompare && (
        <Section title="历史变化" icon="ri-history-line" subtitle={`${historyCompare.prev.date} → ${historyCompare.latest.date}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-400">
                  <th className="border-b border-background-200 px-3 py-2.5">指标</th>
                  <th className="border-b border-background-200 px-3 py-2.5">上期</th>
                  <th className="border-b border-background-200 px-3 py-2.5">最新</th>
                  <th className="border-b border-background-200 px-3 py-2.5">变化</th>
                </tr>
              </thead>
              <tbody>
                <HistoryRow label="日均销量" prev={historyCompare.prev.dailySales7d} cur={historyCompare.latest.dailySales7d} unit="" digits={1} goodDir="up" />
                <HistoryRow label="库存(总)" prev={historyCompare.prevCalc.inStockTotal} cur={historyCompare.latestCalc.inStockTotal} unit="" digits={0} goodDir="up" />
                <HistoryRow label="利润率" prev={historyCompare.prevCalc.grossMargin} cur={historyCompare.latestCalc.grossMargin} unit="%" digits={1} goodDir="up" />
                <HistoryRow label="评分" prev={historyCompare.prev.rating} cur={historyCompare.latest.rating} unit="" digits={1} goodDir="up" />
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ======= 运营操作记录 ======= */}
      {(
        <Section
          title="运营操作记录"
          icon="ri-history-line"
          subtitle={opsLogs.length > 0 ? `${opsLogs.length} 条记录` : "暂无记录"}
        >
          <div className="space-y-3">
            {/* 新增记录表单 */}
            <div className="rounded-lg border border-background-200/70 bg-background-100/50 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className={labelCls}>操作日期</label>
                  <input
                    type="date"
                    value={newLogDate}
                    onChange={(e) => setNewLogDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>操作类型</label>
                  <select
                    value={newLogAction}
                    onChange={(e) => setNewLogAction(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">选择操作</option>
                    <option value="降价">降价</option>
                    <option value="涨价">涨价</option>
                    <option value="开广告">开广告</option>
                    <option value="关广告">关广告</option>
                    <option value="优化Listing">优化Listing</option>
                    <option value="补货">补货</option>
                    <option value="报活动">报活动</option>
                    <option value="站外推广">站外推广</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>MSKU</label>
                  <input
                    type="text"
                    value={newLogMsku}
                    onChange={(e) => setNewLogMsku(e.target.value)}
                    placeholder={sku?.msku ? `默认 ${sku.msku}` : "关联 MSKU"}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>详细说明</label>
                  <input
                    type="text"
                    value={newLogDetail}
                    onChange={(e) => setNewLogDetail(e.target.value)}
                    placeholder="如：降低售价至$29.99"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="text"
                  value={newLogImpact}
                  onChange={(e) => setNewLogImpact(e.target.value)}
                  placeholder="对销量/数据的影响（选填，如：日均销量上涨约30%）"
                  className={inputCls + " flex-1"}
                />
                <button
                  type="button"
                  onClick={handleAddLog}
                  disabled={!newLogAction || !newLogDetail}
                  className="shrink-0 rounded-[9px] bg-primary-500 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-primary-600 disabled:opacity-40 cursor-pointer"
                >
                  记录
                </button>
              </div>
            </div>

            {/* 记录列表 */}
            {opsLogs.length === 0 ? (
              <EmptyState icon="ri-history-line" title="暂无操作记录" desc="记录你对该SKU做过的运营操作，方便后续汇报和复盘" />
            ) : (
              <div className="space-y-2">
                {opsLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-lg border border-background-200/70 bg-background-50 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[14px] text-primary-700">
                      <i className="ri-file-edit-line" aria-hidden />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone="secondary">{log.action}</Badge>
                        <span className="text-[11px] text-foreground-400">{log.date}</span>
                      </div>
                      <div className="mt-1 text-[13px] text-foreground-900">{log.detail}</div>
                      {log.impact && (
                        <div className="mt-0.5 flex items-center gap-1 text-[12px] text-accent-700">
                          <i className="ri-bar-chart-line text-[13px]" aria-hidden />
                          {log.impact}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteLog(log.id!)}
                      className="shrink-0 text-[14px] text-foreground-400 hover:text-red-500 cursor-pointer"
                    >
                      <i className="ri-delete-bin-line" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ────────── 子组件 ────────── */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="shrink-0 text-[12px] text-foreground-500">{label}</span>
      <span className="mono-num text-right text-[13px] font-medium text-foreground-900">{value}</span>
    </div>
  );
}

function ProfitRow({ label, value, bold, tone, highlight, inferred }: { label: string; value: React.ReactNode; bold?: boolean; tone?: string; highlight?: boolean; inferred?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="shrink-0 text-[12px] text-foreground-500">
        {label}
        {inferred && <span className="ml-1 rounded bg-accent-50 px-1 text-[10px] font-medium text-accent-700">估</span>}
      </span>
      <span className={`mono-num text-right text-[13px] ${bold ? "font-semibold" : "font-medium"} ${tone ?? "text-foreground-900"} ${highlight ? "rounded bg-primary-50 px-1.5 py-0.5" : ""}`}>{value}</span>
    </div>
  );
}

function ListingStatusRow({ label, status }: { label: string; status?: "done" | "todo" }) {
  const done = status === "done";
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="shrink-0 text-[12px] text-foreground-500">{label}</span>
      <span className={`text-[12px] font-medium ${done ? "text-accent-700" : "text-secondary-700"}`}>
        {done ? "✅ 已完成" : status === "todo" ? "⚠️ 未完成" : "-"}
      </span>
    </div>
  );
}

function DataTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-background-200/70 bg-background-100/60 p-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-foreground-500">{label}</div>
      <div className="mt-1 font-heading text-[18px] font-bold text-foreground-950">{value}</div>
      {sub && <div className="text-[11px] text-foreground-500">{sub}</div>}
    </div>
  );
}

/* ────────── 诊断因子拆解（复用诊断引擎结果） ────────── */
function DiagnosisFactorsInline({ result }: { result: DiagnosisResult }) {
  if (result.factors.length === 0) {
    return <div className="mt-3 text-[12px] text-foreground-400">暂无结构化拆解。</div>;
  }
  const impactMeta = (impact?: string) => {
    if (impact === "up_bad" || impact === "down_bad") return "text-red-600";
    if (impact === "up_good" || impact === "down_good") return "text-accent-600";
    return "text-foreground-500";
  };
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-400">
            <th className="border-b border-background-200 px-2 py-1.5">归因项</th>
            <th className="border-b border-background-200 px-2 py-1.5 text-right">上期</th>
            <th className="border-b border-background-200 px-2 py-1.5 text-right">本期</th>
            <th className="border-b border-background-200 px-2 py-1.5 text-right">变化</th>
          </tr>
        </thead>
        <tbody>
          {result.factors.map((f) => {
            const deltaText =
              f.delta != null
                ? `${f.delta > 0 ? "↑" : f.delta < 0 ? "↓" : "→"}${Math.abs(f.delta)}${f.unit ?? ""}`
                : f.after != null && f.before == null
                ? `${f.after}`
                : "—";
            return (
              <tr key={f.key} className="align-top">
                <td className="border-b border-background-200/50 px-2 py-2 font-medium text-foreground-800">
                  {f.label}
                  {f.note && <div className="mt-0.5 text-[10px] font-normal text-foreground-400">{f.note}</div>}
                </td>
                <td className="mono-num border-b border-background-200/50 px-2 py-2 text-right text-foreground-500">{f.before ?? "—"}</td>
                <td className="mono-num border-b border-background-200/50 px-2 py-2 text-right text-foreground-900">{f.after ?? "—"}</td>
                <td className={`mono-num border-b border-background-200/50 px-2 py-2 text-right font-semibold ${impactMeta(f.impact)}`}>{deltaText}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────── 历史变化行 ────────── */
function HistoryRow({ label, prev, cur, unit, digits, goodDir }: {
  label: string;
  prev: number;
  cur: number;
  unit: string;
  digits: number;
  goodDir: "up" | "down";
}) {
  const fmt = (v: number) => (digits === 0 ? Math.round(v).toLocaleString() : v.toFixed(digits));
  const same = prev === cur;
  const up = cur > prev;
  const good = goodDir === "up" ? up : !up;
  const color = same ? "text-foreground-400" : good ? "text-accent-600" : "text-red-500";
  const arrow = same ? "→" : up ? "↑" : "↓";
  return (
    <tr>
      <td className="border-b border-background-200/50 px-3 py-2.5 text-[12px] font-medium text-foreground-600">{label}</td>
      <td className="mono-num border-b border-background-200/50 px-3 py-2.5 text-foreground-700">{fmt(prev)}{unit}</td>
      <td className="mono-num border-b border-background-200/50 px-3 py-2.5 font-semibold text-foreground-900">{fmt(cur)}{unit}</td>
      <td className={`mono-num border-b border-background-200/50 px-3 py-2.5 font-semibold ${color}`}>{arrow} {fmt(Math.abs(cur - prev))}{unit}</td>
    </tr>
  );
}

function CostWaterfall({ label, value, color, isStart, isEnd }: { label: string; value: number; color: string; isStart?: boolean; isEnd?: boolean }) {
  const absVal = Math.abs(value);
  const isNeg = value < 0;
  return (
    <div className="flex items-center gap-3">
      <div className={`h-6 w-1 rounded-full ${color}`} />
      <span className="w-28 shrink-0 text-[13px] text-foreground-500">{label}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-background-200/70">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(5, (absVal / 200) * 100))}%` }} />
          </div>
          <span className={`mono-num w-20 text-right text-[13px] font-semibold ${isEnd ? (value >= 0 ? "text-accent-700" : "text-red-600") : isNeg ? "text-foreground-700" : "text-foreground-900"}`}>
            {isNeg ? "-" : ""}${absVal.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 仅允许 http/https 协议的链接，其他（javascript:/data:/file: 等）一律返回 '#'，防存储型 XSS。 */
function safeHref(url: string): string {
  if (!url) return "#";
  const lower = url.trim().toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return url;
  return "#";
}

/* ────────── 周对比柱状图组件 ────────── */
interface WeekRow {
  weekLabel: string;
  weeklySales: number;
  weeklyProfit: number;
  weeklyAdSpend: number;
  profitMargin: number;
  adRatio: number;
  rating: number;
  returnRate: number;
  stockOnHand: number;
  stockInTransit: number;
}

function WeekBarCard({
  title,
  icon,
  data,
  dataKey,
  color,
  unit,
  secondaryKey,
  secondaryLabel,
  secondaryColor,
}: {
  title: string;
  icon: string;
  data: WeekRow[];
  dataKey: keyof WeekRow;
  color: "primary" | "accent" | "warn";
  unit?: string;
  secondaryKey?: keyof WeekRow;
  secondaryLabel?: string;
  secondaryColor?: "primary" | "accent" | "warn";
}) {
  const fillMap = {
    primary: "oklch(var(--primary-500))",
    accent: "oklch(var(--accent-500))",
    warn: "oklch(var(--secondary-500))",
  };
  const secFillMap = {
    primary: "oklch(var(--primary-300))",
    accent: "oklch(var(--accent-300))",
    warn: "oklch(var(--secondary-300))",
  };
  const hasSecondary = secondaryKey != null;

  return (
    <Section title={title} icon={icon}>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.008 80)" vertical={false} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: "oklch(0.5 0.012 60)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.012 60)" }} unit={unit} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid oklch(0.85 0.01 80)" }}
              formatter={(value: number, name: string) => [`${value}${unit ?? ""}`, name === String(dataKey) ? title.replace("对比", "") : secondaryLabel ?? String(secondaryKey)]}
            />
            <Bar dataKey={String(dataKey)} fill={fillMap[color]} radius={[4, 4, 0, 0]} name={title.replace("对比", "")} />
            {hasSecondary && <Bar dataKey={String(secondaryKey)} fill={secFillMap[secondaryColor ?? "warn"]} radius={[4, 4, 0, 0]} name={secondaryLabel ?? String(secondaryKey)} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

function EditableField({
  label,
  name,
  defaultValue,
  step = "1",
  disabled,
  onCommit,
}: {
  label: string;
  name: string;
  defaultValue: number;
  step?: string;
  disabled?: boolean;
  onCommit?: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-foreground-500">{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        defaultValue={defaultValue}
        disabled={disabled}
        onBlur={(e) => { if (onCommit) { const v = Number(e.target.value); onCommit(Number.isFinite(v) ? v : 0); } }}
        className={`w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] text-foreground-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      />
    </label>
  );
}