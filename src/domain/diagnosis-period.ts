// =========================================================
// 异常诊断 · 对比周期解析
// 核心原则：区间 vs 区间，而不是「最新单日快照 vs 某个历史单日」。
// 快照是按导入批次写入的，单日数据受当天波动影响极大，容易误报。
// =========================================================

import type { DailySnapshot } from "./types";

export type CompareBasis = "import" | "7d" | "14d" | "30d" | "custom" | "range";

export interface ComparisonResult {
  /** 本期（被诊断的区间）聚合快照 */
  current?: DailySnapshot;
  /** 上期（对照的区间）聚合快照 */
  previous?: DailySnapshot;
  currentLabel: string;
  previousLabel: string;
  /** 数据不足以对比时的提示（琥珀色展示） */
  warning?: string;
}

export interface ResolveComparisonInput {
  /** 该 SKU 的全部快照（任意顺序，内部会排序去重） */
  rows: DailySnapshot[];
  basis: CompareBasis;
  customDays?: number;
  rangeStart?: string;
  rangeEnd?: string;
}

/** 本地日期加减天数（YYYY-MM-DD），避免 toISOString 的 UTC 偏移 */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** 闭区间天数：[2026-10-19, 2026-10-25] → 7 */
export function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const a = new Date(sy, sm - 1, sd).getTime();
  const b = new Date(ey, em - 1, ed).getTime();
  return Math.max(1, Math.round(Math.abs(b - a) / 86400000) + 1);
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * 把同一区间内的多条快照聚合成一条「区间快照」：
 * - 率/均值类指标（日均销量、费比、退货率、利润率、评分、花费、利润、成本）取算术均值
 * - 存量类指标（在库、在途、覆盖天数、评论数）取区间内最后一天的快照值
 */
export function aggregateSnapshots(rows: DailySnapshot[]): DailySnapshot | undefined {
  if (!rows.length) return undefined;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];

  const avg = (pick: (r: DailySnapshot) => number | undefined): number => {
    const vals = sorted.map(pick).filter(finite);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };
  const avgOpt = (pick: (r: DailySnapshot) => number | undefined): number | undefined => {
    const vals = sorted.map(pick).filter(finite);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : undefined;
  };
  const lastVal = (pick: (r: DailySnapshot) => number | undefined): number => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const v = pick(sorted[i]);
      if (finite(v)) return v;
    }
    return 0;
  };
  const lastOpt = (pick: (r: DailySnapshot) => number | undefined): number | undefined => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const v = pick(sorted[i]);
      if (finite(v)) return v;
    }
    return undefined;
  };

  // 评分缺失用 0 表示，均值时排除，避免把「没有评分」拉低
  const ratingVals = sorted.map((r) => r.rating).filter((v) => finite(v) && v > 0);

  return {
    ...last,
    date: last.date,
    sku: last.sku,
    siteId: last.siteId,
    dailySales7d: avg((r) => r.dailySales7d),
    dailySales30d: avgOpt((r) => r.dailySales30d),
    monthlySales: avg((r) => r.monthlySales),
    stockOnHand: lastVal((r) => r.stockOnHand),
    stockInTransit: lastVal((r) => r.stockInTransit),
    daysOfCoverOnHand: lastVal((r) => r.daysOfCoverOnHand),
    daysOfCoverWithTransit: lastVal((r) => r.daysOfCoverWithTransit),
    adSpend: avg((r) => r.adSpend),
    adRatio: avg((r) => r.adRatio),
    profit: avg((r) => r.profit),
    profitMargin: avg((r) => r.profitMargin),
    totalCost: avg((r) => r.totalCost),
    rating: ratingVals.length ? ratingVals.reduce((s, v) => s + v, 0) / ratingVals.length : 0,
    reviewCount: lastOpt((r) => r.reviewCount),
    returnRate: avg((r) => r.returnRate),
    refundRate: avgOpt((r) => r.refundRate),
    revenue: avgOpt((r) => r.revenue),
    acos: avgOpt((r) => r.acos),
    refundQty: avgOpt((r) => r.refundQty),
  };
}

/** 同一天可能有多条快照（重复导入），保留最后写入的一条 */
function dedupeByDate(rows: DailySnapshot[]): DailySnapshot[] {
  const map = new Map<string, DailySnapshot>();
  for (const r of rows) map.set(r.date, r);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const windowRows = (rows: DailySnapshot[], start: string, end: string) =>
  rows.filter((r) => r.date >= start && r.date <= end);

const rangeLabel = (start: string, end: string, days: number) =>
  `${start} ~ ${end}（${days} 天均值）`;

/**
 * 解析本期 / 上期两个对比区间。
 *
 * - import：最近两次导入批次（各批次内如有多条同 SKU 记录取均值）
 * - 7d/14d/30d/custom N：本期 = 最新快照日往前 N 天，上期 = 再往前 N 天
 * - range：本期 = 用户指定区间，上期 = 紧邻其前的等长区间
 */
export function resolveComparison(input: ResolveComparisonInput): ComparisonResult {
  const rows = dedupeByDate(input.rows);
  if (!rows.length) {
    return { currentLabel: "无数据", previousLabel: "无数据", warning: "该 SKU 没有任何快照数据" };
  }

  const latest = rows[rows.length - 1].date;

  if (input.basis === "import") {
    const dates = [...new Set(rows.map((r) => r.date))];
    const curDate = dates[dates.length - 1];
    const prevDate = dates.length >= 2 ? dates[dates.length - 2] : undefined;
    const current = aggregateSnapshots(windowRows(rows, curDate, curDate));
    const previous = prevDate ? aggregateSnapshots(windowRows(rows, prevDate, prevDate)) : undefined;
    return {
      current,
      previous,
      currentLabel: `本次导入 ${curDate}`,
      previousLabel: prevDate ? `上次导入 ${prevDate}` : "无上次导入",
      warning: prevDate ? undefined : "只有一次导入记录，无法按导入批次对比，请改用区间环比",
    };
  }

  if (input.basis === "range") {
    if (!input.rangeStart || !input.rangeEnd) {
      return { currentLabel: "—", previousLabel: "—", warning: "请选择要对比的起止日期" };
    }
    const [start, end] = input.rangeStart <= input.rangeEnd
      ? [input.rangeStart, input.rangeEnd]
      : [input.rangeEnd, input.rangeStart];
    const len = daysBetween(start, end);
    const prevEnd = shiftDate(start, -1);
    const prevStart = shiftDate(start, -len);

    const current = aggregateSnapshots(windowRows(rows, start, end));
    const previous = aggregateSnapshots(windowRows(rows, prevStart, prevEnd));

    let warning: string | undefined;
    if (!current) warning = `所选区间 ${start} ~ ${end} 内没有快照`;
    else if (!previous) warning = `上期区间 ${prevStart} ~ ${prevEnd} 内没有快照，无法对比`;

    return {
      current,
      previous,
      currentLabel: rangeLabel(start, end, len),
      previousLabel: rangeLabel(prevStart, prevEnd, len),
      warning,
    };
  }

  const n = input.basis === "7d" ? 7
    : input.basis === "14d" ? 14
      : input.basis === "30d" ? 30
        : Math.max(1, Math.min(730, Math.round(input.customDays ?? 7)));

  const curEnd = latest;
  const curStart = shiftDate(latest, -(n - 1));
  const prevEnd = shiftDate(latest, -n);
  const prevStart = shiftDate(latest, -(2 * n - 1));

  const current = aggregateSnapshots(windowRows(rows, curStart, curEnd));
  const previous = aggregateSnapshots(windowRows(rows, prevStart, prevEnd));

  let warning: string | undefined;
  if (!current) warning = `本期 ${curStart} ~ ${curEnd} 内没有快照`;
  else if (!previous) warning = `上期区间 ${prevStart} ~ ${prevEnd} 内没有快照，无法对比`;

  return {
    current,
    previous,
    currentLabel: rangeLabel(curStart, curEnd, n),
    previousLabel: rangeLabel(prevStart, prevEnd, n),
    warning,
  };
}
