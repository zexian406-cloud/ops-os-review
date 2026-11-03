// =========================================================
// 月度复盘领域计算 — 纯函数，供 /history「月」tab 四板块使用
//   1. 促销 ROI：已结束活动 · 毛贡献 = 活动期销量 × 正常价单件净利（不用折扣价，避免与促销成本重复扣）
//   2. 动作闭环：操作前7天 vs 后7天 日均销量/净利率对比（仅展示，不做因果结论）
//   3. SKU 月度盈亏：月净利 = 月均日销 × 单件净利 × 当月天数
//   4. 全店费用趋势：广告费比（Σ广告费/Σ销售额）与退货率近6个月
// =========================================================
import { computeAll } from "./calculator";
import type { DailySnapshot, OpsLog, Promotion, SkuMaster } from "./types";

const safe = (v: number | undefined | null): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** YYYY-MM-DD 日期加减天数（手动拼 Y-M-D，避免 toISOString 的 UTC 偏移错一天） */
export function shiftDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** 两个 YYYY-MM-DD 的天数差（a − b） */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, (am || 1) - 1, ad || 1) - Date.UTC(by, (bm || 1) - 1, bd || 1)) / 86400000);
}

/** 当月天数（monthKey = "YYYY-MM"） */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

const inRange = (d: string, from: string, to: string): boolean => d >= from && d <= to;

/** 按索引快照分桶（跳过稀疏行：仅含上期流量、销量为 0 的行不参与销量/利润统计） */
function bucketBySku(snapshots: DailySnapshot[]): Map<string, DailySnapshot[]> {
  const bySku = new Map<string, DailySnapshot[]>();
  for (const s of snapshots) {
    if (safe(s.dailySales7d) <= 0) continue;
    const arr = bySku.get(s.sku) ?? [];
    arr.push(s);
    bySku.set(s.sku, arr);
  }
  for (const arr of bySku.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return bySku;
}

/** 正常价单件净利（computeAll 用主档售价与成本，折扣价不参与） */
function unitProfitOf(master: SkuMaster, snap: DailySnapshot, defaultCommissionRate?: number): number | null {
  if (!master || !master.price || master.price <= 0) return null;
  try {
    const calc = computeAll({ sku: master, snap, defaultCommissionRate });
    return Number.isFinite(calc.grossProfit) ? calc.grossProfit : null;
  } catch {
    return null;
  }
}

/** 正常价净利率（%） */
function unitMarginOf(master: SkuMaster, snap: DailySnapshot, defaultCommissionRate?: number): number | null {
  if (!master || !master.price || master.price <= 0) return null;
  try {
    const calc = computeAll({ sku: master, snap, defaultCommissionRate });
    return Number.isFinite(calc.grossMargin) ? calc.grossMargin : null;
  } catch {
    return null;
  }
}

/* ═══════════ 板块1 · 促销 ROI ═══════════ */

export interface PromoRoiRow {
  promoId: string;
  name: string;
  sku: string;
  skuName: string;
  startDate: string;
  endDate: string;
  days: number;
  /** 促销成本（金额模式直取；折扣率模式用估算值或缺省估算） */
  cost: number;
  /** 活动期销量 = 活动期日均 × 活动天数 */
  periodSales: number;
  /** 活动前7天日均（null = 无基期快照） */
  baseDaily: number | null;
  /** 增量件数 = 活动期销量 − 前7天日均 × 活动天数（null = 无基期） */
  liftUnits: number | null;
  /** 正常价单件净利（null = 主档无售价/成本） */
  unitProfit: number | null;
  /** 毛贡献 = 活动期销量 × 正常价单件净利 */
  grossContribution: number | null;
  /** ROI = 毛贡献 − 促销成本 */
  roi: number | null;
  /** 活动期是否有快照数据 */
  hasData: boolean;
}

export function computePromoRoi(input: {
  promotions: Promotion[];
  skuMaster: SkuMaster[];
  snapshots: DailySnapshot[];
  today: string;
  defaultCommissionRate?: number;
}): PromoRoiRow[] {
  const { promotions, snapshots, today, defaultCommissionRate } = input;
  const skuMap = new Map(input.skuMaster.map((s) => [s.sku, s]));
  const bySku = bucketBySku(snapshots);

  const rows: PromoRoiRow[] = [];
  for (const p of promotions) {
    // 仅统计已结束：状态标记，或结束日已过（状态未及时更新的兜底）
    const ended = p.status === "ended" || (!!p.endDate && p.endDate <= today);
    if (!ended) continue;
    const master = skuMap.get(p.sku);
    const snaps = bySku.get(p.sku) ?? [];
    const days = Math.min(Math.max(diffDays(p.endDate, p.startDate) + 1, 1), 31);
    const periodSnaps = snaps.filter((s) => inRange(s.date, p.startDate, p.endDate));
    const hasData = periodSnaps.length > 0;
    const periodDaily = hasData
      ? periodSnaps.reduce((t, s) => t + safe(s.dailySales7d), 0) / periodSnaps.length
      : 0;
    const periodSales = periodDaily * days;
    const beforeSnaps = snaps.filter((s) =>
      inRange(s.date, shiftDate(p.startDate, -7), shiftDate(p.startDate, -1)),
    );
    const baseDaily = beforeSnaps.length > 0
      ? beforeSnaps.reduce((t, s) => t + safe(s.dailySales7d), 0) / beforeSnaps.length
      : null;
    const liftUnits = baseDaily != null ? periodSales - baseDaily * days : null;
    // 正常价单件净利：参考活动期最新快照（成本字段来自主档，与折扣价无关）
    const refSnap = periodSnaps[periodSnaps.length - 1] ?? snaps[snaps.length - 1];
    const unitProfit = master && refSnap ? unitProfitOf(master, refSnap, defaultCommissionRate) : null;
    const grossContribution = unitProfit != null ? periodSales * unitProfit : null;
    // 促销成本：amount 直取；rate 用已估值，缺省按 率% × 正常价 × 活动期销量 估算；未录成本视为 0
    let cost = 0;
    if (p.costMode === "amount") {
      cost = safe(p.amount);
    } else if (p.costMode === "rate") {
      cost = safe(p.estimatedCost) > 0
        ? safe(p.estimatedCost)
        : master && master.price > 0
          ? (safe(p.rate) / 100) * master.price * periodSales
          : 0;
    }
    const roi = grossContribution != null ? grossContribution - cost : null;
    rows.push({
      promoId: p.id,
      name: p.name,
      sku: p.sku,
      skuName: p.skuName || master?.name || p.sku,
      startDate: p.startDate,
      endDate: p.endDate,
      days,
      cost,
      periodSales,
      baseDaily,
      liftUnits,
      unitProfit,
      grossContribution,
      roi,
      hasData,
    });
  }
  rows.sort((a, b) => b.endDate.localeCompare(a.endDate));
  return rows;
}

/* ═══════════ 板块2 · 动作闭环 ═══════════ */

export interface ActionLoopRow {
  logId: string;
  sku: string;
  skuName: string;
  date: string;
  action: string;
  summary: string;
  /** 前7天日均销量（null = 窗口内无快照 → 样本不足） */
  salesBefore: number | null;
  /** 后7天日均销量（窗口含操作当天） */
  salesAfter: number | null;
  salesDelta: number | null;
  marginBefore: number | null;
  marginAfter: number | null;
  marginDelta: number | null;
  beforeSamples: number;
  afterSamples: number;
}

export function computeActionLoop(input: {
  logs: OpsLog[];
  skuMaster: SkuMaster[];
  snapshots: DailySnapshot[];
  defaultCommissionRate?: number;
}): ActionLoopRow[] {
  const { logs, snapshots, defaultCommissionRate } = input;
  const skuMap = new Map(input.skuMaster.map((s) => [s.sku, s]));
  const bySku = bucketBySku(snapshots);
  // MSKU → 父SKU：操作记录可能记在子链接上
  const mskuToSku = new Map<string, string>();
  for (const s of input.skuMaster) {
    if (!s.msku) continue;
    for (const m of s.msku.split(",")) {
      const t = m.trim();
      if (t) mskuToSku.set(t, s.sku);
    }
  }

  const rows: ActionLoopRow[] = [];
  for (const log of logs) {
    const skuKey = skuMap.has(log.sku) ? log.sku : (mskuToSku.get(log.sku) ?? log.sku);
    const master = skuMap.get(skuKey);
    const snaps = bySku.get(skuKey) ?? [];
    const before = snaps.filter((s) => inRange(s.date, shiftDate(log.date, -7), shiftDate(log.date, -1)));
    const after = snaps.filter((s) => inRange(s.date, log.date, shiftDate(log.date, 6)));
    const avgSales = (list: DailySnapshot[]): number | null =>
      list.length > 0 ? list.reduce((t, s) => t + safe(s.dailySales7d), 0) / list.length : null;
    const avgMargin = (list: DailySnapshot[]): number | null => {
      const vals = list
        .map((s) => unitMarginOf(master, s, defaultCommissionRate))
        .filter((v): v is number => v != null);
      return vals.length > 0 ? vals.reduce((t, v) => t + v, 0) / vals.length : null;
    };
    const salesBefore = avgSales(before);
    const salesAfter = avgSales(after);
    const marginBefore = avgMargin(before);
    const marginAfter = avgMargin(after);
    const summary = [log.action, log.detail || log.reason || log.note || ""].filter(Boolean).join("：");
    rows.push({
      logId: log.id ?? `${log.sku}__${log.date}__${log.createdAt}`,
      sku: skuKey,
      skuName: log.skuName || master?.name || skuKey,
      date: log.date,
      action: log.action,
      summary: summary.length > 60 ? `${summary.slice(0, 60)}…` : summary,
      salesBefore,
      salesAfter,
      salesDelta: salesBefore != null && salesAfter != null ? salesAfter - salesBefore : null,
      marginBefore,
      marginAfter,
      marginDelta: marginBefore != null && marginAfter != null ? marginAfter - marginBefore : null,
      beforeSamples: before.length,
      afterSamples: after.length,
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

/* ═══════════ 板块3 · SKU 月度盈亏 ═══════════ */

export interface MonthlyProfitRow {
  sku: string;
  name: string;
  /** 本月净利 = 本月日均销量 × 正常价单件净利 × 当月天数 */
  curProfit: number | null;
  prevProfit: number | null;
  delta: number | null;
  /** 连续两月亏损（本月<0 且 上月<0）→ 标红 */
  bothLoss: boolean;
  curAvgDaily: number | null;
  prevAvgDaily: number | null;
  unitProfit: number | null;
}

export interface MonthlyProfitResult {
  rows: MonthlyProfitRow[];
  curMonth: string;
  prevMonth: string;
}

export function computeMonthlyProfit(input: {
  skuMaster: SkuMaster[];
  snapshots: DailySnapshot[];
  defaultCommissionRate?: number;
  today: string;
}): MonthlyProfitResult {
  const { snapshots, defaultCommissionRate, today } = input;
  const skuMap = new Map(input.skuMaster.map((s) => [s.sku, s]));
  const bySku = bucketBySku(snapshots);

  const months = Array.from(new Set(snapshots.map((s) => s.date.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
  const curMonth = months.includes(today.slice(0, 7)) ? today.slice(0, 7) : (months[0] ?? today.slice(0, 7));
  const curIdx = months.indexOf(curMonth);
  const prevMonth = curIdx >= 0 && curIdx < months.length - 1 ? months[curIdx + 1] : "";

  const rows: MonthlyProfitRow[] = [];
  const skus = new Set<string>();
  for (const [sku, snaps] of bySku) {
    if (snaps.some((s) => s.date.slice(0, 7) === curMonth) || (prevMonth && snaps.some((s) => s.date.slice(0, 7) === prevMonth))) {
      skus.add(sku);
    }
  }
  const monthAvgDaily = (snaps: DailySnapshot[], month: string): number | null => {
    const list = snaps.filter((s) => s.date.slice(0, 7) === month);
    return list.length > 0 ? list.reduce((t, s) => t + safe(s.dailySales7d), 0) / list.length : null;
  };
  for (const sku of skus) {
    const snaps = bySku.get(sku)!;
    const master = skuMap.get(sku);
    const curAvgDaily = monthAvgDaily(snaps, curMonth);
    const prevAvgDaily = prevMonth ? monthAvgDaily(snaps, prevMonth) : null;
    // 单件净利：优先本月最新快照，回退上月
    const refSnap = [...snaps].reverse().find((s) => s.date.slice(0, 7) === curMonth)
      ?? (prevMonth ? [...snaps].reverse().find((s) => s.date.slice(0, 7) === prevMonth) : undefined);
    const unitProfit = master && refSnap ? unitProfitOf(master, refSnap, defaultCommissionRate) : null;
    const curProfit = curAvgDaily != null && unitProfit != null ? curAvgDaily * unitProfit * daysInMonth(curMonth) : null;
    const prevProfit = prevMonth && prevAvgDaily != null && unitProfit != null ? prevAvgDaily * unitProfit * daysInMonth(prevMonth) : null;
    rows.push({
      sku,
      name: master?.name ?? sku,
      curProfit,
      prevProfit,
      delta: curProfit != null && prevProfit != null ? curProfit - prevProfit : null,
      bothLoss: curProfit != null && curProfit < 0 && prevProfit != null && prevProfit < 0,
      curAvgDaily,
      prevAvgDaily,
      unitProfit,
    });
  }
  rows.sort((a, b) => (b.curProfit ?? -Infinity) - (a.curProfit ?? -Infinity));
  return { rows, curMonth, prevMonth };
}

/* ═══════════ 板块4 · 全店费用趋势 ═══════════ */

export interface StoreFeePoint {
  month: string;
  /** 全店广告费比（%）= Σ广告费 / Σ销售额；无广告花费时按各 SKU 费比按销售额加权估算 */
  adRatio: number | null;
  /** 全店退货率（%）= 有值 SKU 的平均 */
  returnRate: number | null;
}

export function computeStoreFeeTrend(input: {
  skuMaster: SkuMaster[];
  snapshots: DailySnapshot[];
  today: string;
  /** 取最近 N 个月（默认 6） */
  months?: number;
}): StoreFeePoint[] {
  const { snapshots, today } = input;
  const skuMap = new Map(input.skuMaster.map((s) => [s.sku, s]));
  const n = input.months ?? 6;
  const all = Array.from(new Set(snapshots.map((s) => s.date.slice(0, 7)))).sort((a, b) => a.localeCompare(b));
  const months = all.slice(-n);

  const points: StoreFeePoint[] = months.map((month) => {
    const list = snapshots.filter((s) => s.date.slice(0, 7) === month && safe(s.dailySales7d) > 0);
    let totalRev = 0;
    let totalAd = 0;
    for (const s of list) {
      const master = skuMap.get(s.sku);
      const price = master && master.price > 0 ? master.price : 0;
      const rev = price > 0 ? safe(s.dailySales7d) * price : 0;
      totalRev += rev;
      if (safe(s.adSpend) > 0) {
        totalAd += safe(s.adSpend);
      } else if (rev > 0 && safe(s.adRatio) > 0) {
        totalAd += (safe(s.adRatio) / 100) * rev; // 无花费记录 → 按费比反推
      }
    }
    const rets = list.map((s) => safe(s.returnRate)).filter((v) => v > 0);
    return {
      month,
      adRatio: totalRev > 0 ? (totalAd / totalRev) * 100 : null,
      returnRate: rets.length > 0 ? rets.reduce((t, v) => t + v, 0) / rets.length : null,
    };
  });
  void today;
  return points;
}
