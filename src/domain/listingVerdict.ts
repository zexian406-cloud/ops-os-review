// =========================================================
// Listing 归因分流 — 流量端（Sessions）vs 转化端（CVR）
// =========================================================
// 销量/转化下降的根因通常分两类：
//   1. 流量端：Sessions 下降 → 可见性问题（排名、广告、Buy Box）
//   2. 转化端：CVR 下降    → 详情页问题（主图、价格、评分、退货）
// 本模块基于两期快照的 sessions / orders 做纯函数判定，不依赖存储。
// 数据缺失（快照无 sessions/orders 字段）时一律返回 "insufficient"，
// 绝不硬造数据；UI 对 insufficient 不渲染标签。

import type { Alert, DailySnapshot, ListingVerdict } from "./types";
import { snapKey } from "./engine";

/** 容忍阈值：相对变化 <2% 视为「稳」，超过 -2% 视为「跌」 */
const TOLERANCE_PCT = 2;

/** 转化率 CVR（%）= 订单数 / 会话数 × 100；输入非法返回 NaN */
export function computeCvr(orders: number | undefined, sessions: number | undefined): number {
  if (!orders || !sessions || sessions <= 0) return NaN;
  return (orders / sessions) * 100;
}

/** 相对变化（%）：prev 为 0/负时返回 NaN（无法计算相对变化） */
function relPct(cur: number, prev: number): number {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return NaN;
  return ((cur - prev) / prev) * 100;
}

/**
 * 判定 Listing 归因分流结论。
 * - 任一输入缺失/非法（NaN）→ "insufficient"（数据不足，不硬造结论）
 * - Sessions 跌、CVR 稳/升  → "visibility"  （流量端：排名/广告/Buy Box 可见性）
 * - Sessions 稳/升、CVR 跌  → "detail_page" （转化端：主图/价格/评分/退货）
 * - 两者都跌               → "both"        （需人工排除下架/类目整体下滑）
 * - 两者都稳/升            → "none"
 */
export function computeListingVerdict(
  sessionsCurrent: number | undefined,
  sessionsPrevious: number | undefined,
  cvrCurrent: number | undefined,
  cvrPrevious: number | undefined,
): ListingVerdict {
  const sDelta = relPct(sessionsCurrent ?? NaN, sessionsPrevious ?? NaN);
  const cDelta = relPct(cvrCurrent ?? NaN, cvrPrevious ?? NaN);
  if (!Number.isFinite(sDelta) || !Number.isFinite(cDelta)) return "insufficient";

  const sDown = sDelta < -TOLERANCE_PCT;
  const cDown = cDelta < -TOLERANCE_PCT;
  if (sDown && cDown) return "both";
  if (sDown) return "visibility";
  if (cDown) return "detail_page";
  return "none";
}

/** 分流结论中文文案（列表 Badge 与诊断归因结论共用） */
export function getVerdictText(verdict: ListingVerdict): string {
  switch (verdict) {
    case "visibility": return "流量端异常";
    case "detail_page": return "转化端异常";
    case "both": return "流量+转化双重异常";
    case "none": return "未见分流异常";
    case "insufficient": return "数据不足";
  }
}

/** 从两期快照提取分流四元组（缺失字段原样返回 undefined，由 verdict 判为 insufficient） */
export function extractListingInput(
  current?: DailySnapshot,
  previous?: DailySnapshot,
): { sessionsCurrent?: number; sessionsPrevious?: number; cvrCurrent?: number; cvrPrevious?: number } {
  if (!current || !previous) return {};
  const cvrCurrent = computeCvr(current.orders, current.sessions);
  const cvrPrevious = computeCvr(previous.orders, previous.sessions);
  return {
    sessionsCurrent: current.sessions,
    sessionsPrevious: previous.sessions,
    cvrCurrent: Number.isFinite(cvrCurrent) ? cvrCurrent : undefined,
    cvrPrevious: Number.isFinite(cvrPrevious) ? cvrPrevious : undefined,
  };
}

/**
 * 批量给告警注入分流结论（展示层动态计算，不改存储数据）。
 * 说明：现有 alerts 来自云端 pull 的存量数据（generateAlerts 目前无调用点），
 * 因此在读取侧按 SKU 关联两期快照现算 verdict，旧数据也能即时获得分流标签。
 * 快照无 sessions/orders 时对应告警不注入（UI 不显示标签，等价 insufficient）。
 */
export function attachListingVerdicts(
  alerts: Alert[],
  latestSnapshot: Map<string, DailySnapshot>,
  previousSnapshot: Map<string, DailySnapshot>,
  fallbackSiteId?: string,
): Alert[] {
  return alerts.map((a) => {
    // 引擎生成的告警可能不带 siteId（全局站点单份快照场景），用当前站点兜底
    const key = snapKey(a.sku, a.siteId ?? fallbackSiteId);
    const input = extractListingInput(latestSnapshot.get(key), previousSnapshot.get(key));
    if (input.cvrCurrent == null && input.sessionsCurrent == null) return a;
    const verdict = computeListingVerdict(
      input.sessionsCurrent, input.sessionsPrevious, input.cvrCurrent, input.cvrPrevious,
    );
    return { ...a, ...input, listingVerdict: verdict };
  });
}
