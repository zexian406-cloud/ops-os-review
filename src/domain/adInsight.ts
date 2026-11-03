import type { DailySnapshot, SkuMaster } from "./types";

/** 广告异常单行聚合结果（异常中心「广告异常」Tab 用） */
export interface AdInsight {
  adRatio: number;              // 本期费比 %
  prevAdRatio: number | null;   // 上期费比 %
  deltaPt: number | null;       // 费比变化（百分点）
  target: number;               // 目标费比 %
  adOrderShare: number | null;  // 广告订单数 / 日销（%），未导入为 null
  prevAdOrderShare: number | null;
  overspend: number;            // 估算日超支 $ = (实际费比 − 目标费比) × 售价 × 日销
  severity: "danger" | "warn";  // ≥1.5 倍目标 → danger
  suggestion: string;
}

const num = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : v;

const shareOf = (snap?: DailySnapshot | null): number | null => {
  if (!snap) return null;
  const ads = num(snap.adOrders);
  const daily = num(snap.dailySales7d);
  if (ads == null || daily == null || daily <= 0) return null;
  return (ads / daily) * 100;
};

const pctChange = (cur?: number, prev?: number): number | null =>
  cur != null && prev != null && prev !== 0 ? ((cur - prev) / prev) * 100 : null;

/** 广告异常建议：先看流量端，再看投放动作，否则归为竞价/关键词问题 */
export function buildAdSuggestion(input: {
  sessionsDeltaPct: number | null;
  cvrDeltaPct: number | null;
  adOrderShare: number | null;
  prevAdOrderShare: number | null;
}): string {
  const { sessionsDeltaPct, cvrDeltaPct, adOrderShare, prevAdOrderShare } = input;
  if (sessionsDeltaPct != null && sessionsDeltaPct <= -5) {
    return "流量同步下滑，先查流量端再动广告";
  }
  if (
    adOrderShare != null &&
    prevAdOrderShare != null &&
    adOrderShare - prevAdOrderShare >= 5
  ) {
    return `广告投入加大（广告单占比 ${adOrderShare.toFixed(1)}%），确认是否主动放量`;
  }
  if (
    (sessionsDeltaPct != null && sessionsDeltaPct >= -5) &&
    (cvrDeltaPct == null || Math.abs(cvrDeltaPct) < 5)
  ) {
    return "转化正常，核查竞价与关键词竞争";
  }
  return "转化正常，核查竞价与关键词竞争";
}

/** 按「估算日超支」降序排序（异常中心广告 Tab 的排序口径） */
export function sortAdInsights<T extends { insight: AdInsight }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.insight.overspend - a.insight.overspend);
}

/** 汇总：SKU 数 / 合计估算日超支 / 最严重的一条（已排序时取首行） */
export function summarizeAdInsights<T extends { insight: AdInsight }>(rows: T[]): {
  count: number;
  total: number;
  worst: T | undefined;
} {
  const sorted = sortAdInsights(rows);
  return {
    count: sorted.length,
    total: sorted.reduce((s, r) => s + r.insight.overspend, 0),
    worst: sorted[0],
  };
}

/** 计算单个 SKU 的广告异常指标（本期 vs 上期，均已按区间均值处理） */
export function computeAdInsight(args: {
  sku: SkuMaster;
  current: DailySnapshot;
  previous?: DailySnapshot | null;
  targetAdRatio: number;
}): AdInsight {
  const { sku, current, targetAdRatio } = args;
  // 上期可能只有 Sessions/订单 的稀疏占位行（销量为 0、费比被聚合为 0），
  // 不能拿来算费比变化，否则会凭空出现 +40pt 的假冲高
  const previous = args.previous && (args.previous.dailySales7d ?? 0) > 0 ? args.previous : null;
  const adRatio = current.adRatio ?? 0;
  const prevAdRatio = num(previous?.adRatio);
  const deltaPt = prevAdRatio == null ? null : adRatio - prevAdRatio;
  const adOrderShare = shareOf(current);
  const prevAdOrderShare = shareOf(previous);
  const target = targetAdRatio > 0 ? targetAdRatio : 25;

  const dailySales = num(current.dailySales7d) ?? 0;
  const price = num(sku.price) ?? 0;
  const overspend = Math.max(0, ((adRatio - target) / 100) * price * dailySales);

  const sessionsDeltaPct = pctChange(current.sessions, previous?.sessions);
  const cvrOf = (s?: DailySnapshot | null) =>
    s && s.sessions > 0 ? (s.orders / s.sessions) * 100 : undefined;
  const cvrDeltaPct = pctChange(cvrOf(current), cvrOf(previous));

  return {
    adRatio,
    prevAdRatio,
    deltaPt,
    target,
    adOrderShare,
    prevAdOrderShare,
    overspend,
    severity: adRatio >= target * 1.5 ? "danger" : "warn",
    suggestion: buildAdSuggestion({
      sessionsDeltaPct,
      cvrDeltaPct,
      adOrderShare,
      prevAdOrderShare,
    }),
  };
}
