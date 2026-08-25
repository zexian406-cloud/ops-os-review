import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useOpsData } from "@/domain/store";
import { db, getCurrentSiteId } from "@/domain/db";
import { computeAll } from "@/domain/calculator";
import type { DailySnapshot, SkuMaster } from "@/domain/types";

/* ────────── 工具函数 ────────── */
const safeNum = (v: number | undefined | null): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

const fmt = (v: number, digits = 1) => {
  if (!Number.isFinite(v)) return "—";
  return digits === 0 ? Math.round(v).toLocaleString() : v.toFixed(digits);
};

const fmtPct = (v: number, digits = 1) => `${fmt(v, digits)}%`;

const deltaArrow = (cur: number, prev: number, inverse = false) => {
  const d = cur - prev;
  if (Math.abs(d) < 0.01) return <span className="text-foreground-400">→ 0</span>;
  const good = inverse ? d < 0 : d > 0;
  const color = good ? "text-accent-600" : "text-red-500";
  const arrow = d > 0 ? "↑" : "↓";
  return <span className={`font-semibold ${color}`}>{arrow} {fmt(Math.abs(d))}</span>;
};

/* ────────── 时间维度工具 ────────── */
type Dimension = "date" | "week" | "month";

/** 获取 ISO 周号：返回 "YYYY-Www" 格式 */
function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // 周一=0
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3); // 定位到本周四
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((tmp.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** 获取月号：返回 "YYYY-MM" 格式 */
function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** 根据维度获取分组 key */
function getPeriodKey(dateStr: string, dim: Dimension): string {
  if (dim === "week") return getWeekKey(dateStr);
  if (dim === "month") return getMonthKey(dateStr);
  return dateStr;
}

/** 获取周期的可读标签 */
function getPeriodLabel(key: string, dim: Dimension): string {
  if (dim === "date") return key;
  if (dim === "month") {
    const [y, m] = key.split("-");
    return `${y}年${parseInt(m)}月`;
  }
  // week: "2026-W32" → "2026 第32周"
  const [y, w] = key.split("-W");
  return `${y} 第${parseInt(w)}周`;
}

/** 获取周期包含的日期范围标签 */
function getPeriodRange(key: string, dim: Dimension, datesInPeriod: string[]): string {
  if (dim === "date") return key;
  if (datesInPeriod.length === 0) return "";
  const sorted = [...datesInPeriod].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return first;
  // 格式化为 MM/DD
  const fmtMd = (d: string) => {
    const [, m, dd] = d.split("-");
    return `${parseInt(m)}/${parseInt(dd)}`;
  };
  return `${fmtMd(first)} ~ ${fmtMd(last)}`;
}

/* ────────── 聚合计算 ────────── */
interface AggMetrics {
  salesSum: number;       // 日均销量总和
  salesCount: number;     // 有销量数据的SKU数
  avgAdRatio: number;     // 平均广告费比
  avgRating: number;      // 平均评分
  avgReturnRate: number;  // 平均退货率
  avgProfitMargin: number;// 平均利润率
  totalStock: number;     // 总库存
  totalAdSpend: number;   // 总广告费
  skuCount: number;       // SKU总数
}

/** 聚合多个日期的快照数据。
 *  对于周/月维度，同一 SKU 在不同日期的快照取最新一条。
 */
function aggregateSnapshots(
  snapshots: DailySnapshot[],
  datesInPeriod: string[],
): Map<string, DailySnapshot> {
  // 按 SKU 分组，每个 SKU 取该周期内最新日期的快照
  const dateSet = new Set(datesInPeriod);
  const bySku = new Map<string, DailySnapshot[]>();
  for (const s of snapshots) {
    if (!dateSet.has(s.date)) continue;
    const arr = bySku.get(s.sku) ?? [];
    arr.push(s);
    bySku.set(s.sku, arr);
  }
  const result = new Map<string, DailySnapshot>();
  for (const [sku, arr] of bySku) {
    // 取最新日期的快照
    arr.sort((a, b) => b.date.localeCompare(a.date));
    result.set(sku, arr[0]);
  }
  return result;
}

function aggregate(snapMap: Map<string, DailySnapshot>, skuMap?: Map<string, SkuMaster>): AggMetrics {
  const vals = Array.from(snapMap.values());
  if (vals.length === 0) {
    return { salesSum: 0, salesCount: 0, avgAdRatio: 0, avgRating: 0, avgReturnRate: 0, avgProfitMargin: 0, totalStock: 0, totalAdSpend: 0, skuCount: 0 };
  }
  const salesSum = vals.reduce((s, r) => s + safeNum(r.dailySales7d), 0);
  const salesCount = vals.filter((r) => safeNum(r.dailySales7d) > 0).length;
  const adVals = vals.filter((r) => safeNum(r.adRatio) > 0);
  const avgAdRatio = adVals.length > 0 ? adVals.reduce((s, r) => s + safeNum(r.adRatio), 0) / adVals.length : 0;
  const ratingVals = vals.filter((r) => safeNum(r.rating) > 0);
  const avgRating = ratingVals.length > 0 ? ratingVals.reduce((s, r) => s + safeNum(r.rating), 0) / ratingVals.length : 0;
  const returnVals = vals.filter((r) => safeNum(r.returnRate) > 0);
  const avgReturnRate = returnVals.length > 0 ? returnVals.reduce((s, r) => s + safeNum(r.returnRate), 0) / returnVals.length : 0;
  // FIX: 利润率不从快照读取（导入时存为0），改为用 computeAll 实时计算
  const marginVals: number[] = [];
  if (skuMap) {
    for (const [sku, snap] of snapMap) {
      const master = skuMap.get(sku);
      if (!master || !master.price || master.price <= 0) continue;
      try {
        const calc = computeAll({ sku: master, snap });
        if (Number.isFinite(calc.grossMargin)) {
          marginVals.push(calc.grossMargin);
        }
      } catch { /* 计算出错跳过 */ }
    }
  }
  const avgProfitMargin = marginVals.length > 0 ? marginVals.reduce((s, v) => s + v, 0) / marginVals.length : 0;
  const totalStock = vals.reduce((s, r) => s + safeNum(r.stockOnHand) + safeNum(r.stockInTransit), 0);
  const totalAdSpend = vals.reduce((s, r) => s + safeNum(r.adSpend), 0);
  return { salesSum, salesCount, avgAdRatio, avgRating, avgReturnRate, avgProfitMargin, totalStock, totalAdSpend, skuCount: vals.length };
}

/* ────────── 指标卡片 ────────── */
function MetricCard({
  label, cur, prev, unit, digits, inverse, isCurrency,
}: {
  label: string;
  cur: number;
  prev: number;
  unit: string;
  digits: number;
  inverse?: boolean;
  isCurrency?: boolean;
}) {
  const delta = cur - prev;
  const good = inverse ? delta < 0 : delta > 0;
  const same = Math.abs(delta) < 0.01;
  const color = same ? "text-foreground-400" : good ? "text-accent-600" : "text-red-500";
  const arrow = same ? "→" : delta > 0 ? "↑" : "↓";
  const fmtVal = (v: number) => {
    if (!Number.isFinite(v)) return "—";
    if (isCurrency) return `$${v.toFixed(2)}`;
    return digits === 0 ? Math.round(v).toLocaleString() : v.toFixed(digits);
  };
  return (
    <div className="rounded-[14px] border border-background-200/70 bg-background-50 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-foreground-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="mono-num text-[22px] font-bold text-foreground-950">{fmtVal(cur)}{!isCurrency && unit}</span>
      </div>
      <div className="mt-1 text-[11px] text-foreground-400">上期 {fmtVal(prev)}{!isCurrency && unit}</div>
      <div className={`mt-1.5 text-[12px] font-semibold ${color}`}>
        {arrow} {fmtVal(Math.abs(delta))}{!isCurrency && unit}
        {!same && prev > 0 && (
          <span className="ml-1 text-foreground-400">({((delta / prev) * 100).toFixed(1)}%)</span>
        )}
      </div>
    </div>
  );
}

/* ────────── 主页面 ────────── */
export default function HistoryPage() {
  const { snapshots, skuMaster, loading, reload } = useOpsData();

  // 时间维度：单日 / 按周 / 按月
  const [dimension, setDimension] = useState<Dimension>("date");

  // 获取所有唯一日期（降序）
  const allDates = useMemo(() => {
    const dates = Array.from(new Set(snapshots.map((s) => s.date))).sort((a, b) => b.localeCompare(a));
    return dates;
  }, [snapshots]);

  // 按维度分组的周期
  const periods = useMemo(() => {
    const grouped = new Map<string, string[]>(); // key → dates in this period
    for (const d of allDates) {
      const key = getPeriodKey(d, dimension);
      const arr = grouped.get(key) ?? [];
      arr.push(d);
      grouped.set(key, arr);
    }
    // 按周期 key 降序排列
    const sorted = Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return sorted;
  }, [allDates, dimension]);

  // 选中的两个周期
  const [curPeriod, setCurPeriod] = useState<string>("");
  const [prevPeriod, setPrevPeriod] = useState<string>("");
  // SKU查找表
  const [skuMap, setSkuMap] = useState<Map<string, SkuMaster>>(new Map());
  // 搜索关键词
  const [search, setSearch] = useState("");

  // 维度切换时重置选择
  useEffect(() => {
    setCurPeriod("");
    setPrevPeriod("");
  }, [dimension]);

  // 初始化默认周期：最新两个
  useEffect(() => {
    if (periods.length >= 2 && !curPeriod && !prevPeriod) {
      setCurPeriod(periods[0][0]);
      setPrevPeriod(periods[1][0]);
    } else if (periods.length >= 1 && !curPeriod) {
      setCurPeriod(periods[0][0]);
    }
  }, [periods, curPeriod, prevPeriod]);

  // 加载SKU主档
  useEffect(() => {
    (async () => {
      const siteId = await getCurrentSiteId();
      const all = await db.skuMaster.toArray();
      setSkuMap(new Map(all.filter(s => (s.siteId ?? "site_us") === siteId).map((s) => [s.sku, s])));
    })();
  }, []);

  // 当前周期和上期的日期列表
  const curDates = useMemo(() => periods.find(([k]) => k === curPeriod)?.[1] ?? [], [periods, curPeriod]);
  const prevDates = useMemo(() => periods.find(([k]) => k === prevPeriod)?.[1] ?? [], [periods, prevPeriod]);

  // 按周期聚合快照
  const curSnapshots = useMemo(() => aggregateSnapshots(snapshots, curDates), [snapshots, curDates]);
  const prevSnapshots = useMemo(() => aggregateSnapshots(snapshots, prevDates), [snapshots, prevDates]);

  // 聚合指标
  const curAgg = useMemo(() => aggregate(curSnapshots, skuMap), [curSnapshots, skuMap]);
  const prevAgg = useMemo(() => aggregate(prevSnapshots, skuMap), [prevSnapshots, skuMap]);

  // 图表数据
  const chartData = useMemo(() => {
    return [
      { label: "日均销量", current: Number(curAgg.salesSum.toFixed(1)), previous: Number(prevAgg.salesSum.toFixed(1)) },
      { label: "广告费比", current: Number(curAgg.avgAdRatio.toFixed(1)), previous: Number(prevAgg.avgAdRatio.toFixed(1)) },
      { label: "退货率", current: Number(curAgg.avgReturnRate.toFixed(1)), previous: Number(prevAgg.avgReturnRate.toFixed(1)) },
      { label: "评分", current: Number(curAgg.avgRating.toFixed(2)), previous: Number(prevAgg.avgRating.toFixed(2)) },
      { label: "利润率", current: Number(curAgg.avgProfitMargin.toFixed(1)), previous: Number(prevAgg.avgProfitMargin.toFixed(1)) },
    ];
  }, [curAgg, prevAgg]);

  // SKU级别对比数据
  const skuCompareData = useMemo(() => {
    const allSkus = new Set([...curSnapshots.keys(), ...prevSnapshots.keys()]);
    const rows: Array<{
      sku: string;
      name: string;
      curSales: number;
      prevSales: number;
      curAdRatio: number;
      prevAdRatio: number;
      curRating: number;
      prevRating: number;
      curMargin: number;
      prevMargin: number;
      curStock: number;
      prevStock: number;
      salesDelta: number;
    }> = [];
    for (const sku of allSkus) {
      const cur = curSnapshots.get(sku);
      const prev = prevSnapshots.get(sku);
      const master = skuMap.get(sku);
      const curSales = safeNum(cur?.dailySales7d);
      const prevSales = safeNum(prev?.dailySales7d);
      // FIX: 利润率不从快照读取（导入时存为0），改为用 computeAll 实时计算
      const calcMargin = (snap?: DailySnapshot): number => {
        if (!master || !master.price || master.price <= 0 || !snap) return 0;
        try {
          const calc = computeAll({ sku: master, snap });
          return Number.isFinite(calc.grossMargin) ? calc.grossMargin : 0;
        } catch { return 0; }
      };
      rows.push({
        sku,
        name: master?.name ?? sku,
        curSales,
        prevSales,
        curAdRatio: safeNum(cur?.adRatio),
        prevAdRatio: safeNum(prev?.adRatio),
        curRating: safeNum(cur?.rating),
        prevRating: safeNum(prev?.rating),
        curMargin: calcMargin(cur),
        prevMargin: calcMargin(prev),
        curStock: safeNum(cur?.stockOnHand) + safeNum(cur?.stockInTransit),
        prevStock: safeNum(prev?.stockOnHand) + safeNum(prev?.stockInTransit),
        salesDelta: curSales - prevSales,
      });
    }
    // 按销量变化绝对值降序
    rows.sort((a, b) => Math.abs(b.salesDelta) - Math.abs(a.salesDelta));
    return rows;
  }, [curSnapshots, prevSnapshots, skuMap]);

  // 过滤搜索
  const filteredRows = useMemo(() => {
    if (!search.trim()) return skuCompareData;
    const q = search.toLowerCase();
    return skuCompareData.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [skuCompareData, search]);

  // 加载中
  if (loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-foreground-500">加载中...</div>;
  }

  // 无数据
  if (allDates.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
            <i className="ri-history-line text-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground-950">历史对比</h1>
            <p className="text-sm text-foreground-500">支持按日/周/月维度对比运营数据</p>
          </div>
        </div>
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
          <div className="text-center py-12">
            <i className="ri-bar-chart-box-line text-4xl text-foreground-300" />
            <p className="mt-4 text-foreground-600">暂无快照数据</p>
            <p className="mt-2 text-sm text-foreground-400">请先导入运营数据，系统会按日期自动保存快照</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link to="/import" className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600">
                前往数据导入
              </Link>
              <Link to="/operations" className="rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100">
                返回运营中心
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const dimLabels: Record<Dimension, string> = { date: "单日", week: "按周", month: "按月" };

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* 标题 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <i className="ri-history-line text-xl" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground-950">历史对比</h1>
          <p className="text-sm text-foreground-500">选择时间维度和周期，对比全站运营指标变化</p>
        </div>
        <Link to="/operations" className="rounded-lg border border-background-300 bg-background-50 px-3 py-1.5 text-[13px] font-medium text-foreground-700 hover:bg-background-100">
          <i className="ri-arrow-left-line mr-1" />返回
        </Link>
      </div>

      {/* 维度切换 + 周期选择器 */}
      <div className="mb-6 rounded-2xl border border-background-200/70 bg-background-50 p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* 维度切换 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">时间维度</label>
            <div className="flex rounded-lg border border-background-200 bg-white p-0.5">
              {(Object.keys(dimLabels) as Dimension[]).map((dim) => (
                <button
                  key={dim}
                  type="button"
                  onClick={() => setDimension(dim)}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    dimension === dim
                      ? "bg-primary-500 text-white"
                      : "text-foreground-600 hover:bg-background-100"
                  }`}
                >
                  {dimLabels[dim]}
                </button>
              ))}
            </div>
          </div>

          {/* 本期选择 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">本期</label>
            <select
              value={curPeriod}
              onChange={(e) => setCurPeriod(e.target.value)}
              className="rounded-lg border border-background-200 bg-white px-3 py-2 text-[13px] text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50"
            >
              {periods.map(([key, dates]) => (
                <option key={key} value={key}>
                  {getPeriodLabel(key, dimension)}
                  {dimension !== "date" && dates.length > 1 ? `（${dates.length}次导入，${getPeriodRange(key, dimension, dates)}）` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 上期选择 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">上期（对比基准）</label>
            <select
              value={prevPeriod}
              onChange={(e) => setPrevPeriod(e.target.value)}
              className="rounded-lg border border-background-200 bg-white px-3 py-2 text-[13px] text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50"
            >
              {periods.map(([key, dates]) => (
                <option key={key} value={key}>
                  {getPeriodLabel(key, dimension)}
                  {dimension !== "date" && dates.length > 1 ? `（${dates.length}次导入，${getPeriodRange(key, dimension, dates)}）` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <div className="text-[12px] text-foreground-500">
            共 {periods.length} 个{dimLabels[dimension]}周期 · {allDates.length} 次导入 · {skuCompareData.length} 个 SKU
          </div>
        </div>
        {curPeriod && prevPeriod && curPeriod === prevPeriod && (
          <div className="mt-3 rounded-lg bg-secondary-50 px-3 py-2 text-[12px] text-secondary-700">
            <i className="ri-information-line mr-1" />本期和上期选择了相同周期，对比结果将全部为 0。请选择不同的周期。
          </div>
        )}
        {dimension !== "date" && curDates.length > 0 && (
          <div className="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-[12px] text-primary-700">
            <i className="ri-information-line mr-1" />
            {dimLabels[dimension]}维度下，同一 SKU 在该周期内多次导入的数据取最新一条快照进行对比。
            本期含 {curDates.length} 次导入（{getPeriodRange(curPeriod, dimension, curDates)}），上期含 {prevDates.length} 次导入{prevDates.length > 0 ? `（${getPeriodRange(prevPeriod, dimension, prevDates)}）` : ""}。
          </div>
        )}
      </div>

      {/* 聚合指标卡片 */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="日均销量" cur={curAgg.salesSum} prev={prevAgg.salesSum} unit="件" digits={1} />
        <MetricCard label="总库存" cur={curAgg.totalStock} prev={prevAgg.totalStock} unit="" digits={0} />
        <MetricCard label="平均利润率" cur={curAgg.avgProfitMargin} prev={prevAgg.avgProfitMargin} unit="%" digits={1} />
        <MetricCard label="平均广告费比" cur={curAgg.avgAdRatio} prev={prevAgg.avgAdRatio} unit="%" digits={1} inverse />
        <MetricCard label="平均评分" cur={curAgg.avgRating} prev={prevAgg.avgRating} unit="" digits={2} />
        <MetricCard label="平均退货率" cur={curAgg.avgReturnRate} prev={prevAgg.avgReturnRate} unit="%" digits={1} inverse />
      </div>

      {/* 柱状图对比 */}
      <div className="mb-6 rounded-2xl border border-background-200/70 bg-background-50 p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-foreground-900">指标对比图</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-300))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 14,
                  border: "1px solid oklch(var(--background-300))",
                  background: "#fff",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                }}
              />
              <Bar dataKey="current" fill="oklch(var(--primary-500))" radius={[8, 8, 0, 0]} name="本期" />
              <Bar dataKey="previous" fill="oklch(var(--background-400))" radius={[8, 8, 0, 0]} name="上期" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center justify-center gap-6 text-[12px]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-primary-500" />本期 ({curPeriod ? getPeriodLabel(curPeriod, dimension) : "—"})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-background-400" />上期 ({prevPeriod ? getPeriodLabel(prevPeriod, dimension) : "—"})
          </span>
        </div>
      </div>

      {/* SKU 级别对比表 */}
      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-foreground-900">SKU 明细对比</h2>
          <div className="relative">
            <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-foreground-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 SKU 或品名..."
              className="w-56 rounded-lg border border-background-200 bg-white py-1.5 pl-8 pr-3 text-[12px] text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-400">
                <th className="border-b border-background-200 px-3 py-2.5">SKU / 品名</th>
                <th className="border-b border-background-200 px-3 py-2.5 text-right">日均销量</th>
                <th className="border-b border-background-200 px-3 py-2.5 text-right">总库存</th>
                <th className="border-b border-background-200 px-3 py-2.5 text-right">利润率</th>
                <th className="border-b border-background-200 px-3 py-2.5 text-right">广告费比</th>
                <th className="border-b border-background-200 px-3 py-2.5 text-right">评分</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-foreground-400">
                    {search ? "未找到匹配的 SKU" : "暂无对比数据"}
                  </td>
                </tr>
              ) : (
                filteredRows.slice(0, 100).map((row) => (
                  <tr key={row.sku} className="hover:bg-background-100/50">
                    <td className="border-b border-background-200/50 px-3 py-2.5">
                      <div className="font-medium text-foreground-900">{row.name}</div>
                      <div className="text-[10px] text-foreground-400">{row.sku}</div>
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5 text-right">
                      <div className="mono-num font-semibold text-foreground-900">{fmt(row.curSales, 1)}</div>
                      <div className="text-[10px] text-foreground-400">上期 {fmt(row.prevSales, 1)}</div>
                      <div className="text-[10px]">{deltaArrow(row.curSales, row.prevSales)}</div>
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5 text-right">
                      <div className="mono-num font-semibold text-foreground-900">{fmt(row.curStock, 0)}</div>
                      <div className="text-[10px] text-foreground-400">上期 {fmt(row.prevStock, 0)}</div>
                      <div className="text-[10px]">{deltaArrow(row.curStock, row.prevStock)}</div>
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5 text-right">
                      <div className="mono-num font-semibold text-foreground-900">{fmtPct(row.curMargin)}</div>
                      <div className="text-[10px] text-foreground-400">上期 {fmtPct(row.prevMargin)}</div>
                      <div className="text-[10px]">{deltaArrow(row.curMargin, row.prevMargin)}</div>
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5 text-right">
                      <div className="mono-num font-semibold text-foreground-900">{fmtPct(row.curAdRatio)}</div>
                      <div className="text-[10px] text-foreground-400">上期 {fmtPct(row.prevAdRatio)}</div>
                      <div className="text-[10px]">{deltaArrow(row.curAdRatio, row.prevAdRatio, true)}</div>
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5 text-right">
                      <div className="mono-num font-semibold text-foreground-900">{fmt(row.curRating, 2)}</div>
                      <div className="text-[10px] text-foreground-400">上期 {fmt(row.prevRating, 2)}</div>
                      <div className="text-[10px]">{deltaArrow(row.curRating, row.prevRating)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 100 && (
          <div className="mt-3 text-center text-[11px] text-foreground-400">
            显示前 100 条（共 {filteredRows.length} 条），请使用搜索缩小范围
          </div>
        )}
      </div>
    </div>
  );
}
