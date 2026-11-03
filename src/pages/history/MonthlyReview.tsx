// =========================================================
// 月度复盘（/history「月」tab）— 四板块
//   上：促销 ROI · 动作闭环（重点）
//   下：SKU 月度盈亏 · 全店费用趋势（薄）
// =========================================================
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Section from "@/components/ui/Section";
import { useOpsData } from "@/domain/store";
import { db } from "@/domain/db";
import {
  computeActionLoop, computeMonthlyProfit, computePromoRoi, computeStoreFeeTrend,
  type ActionLoopRow, type MonthlyProfitRow, type PromoRoiRow, type StoreFeePoint,
} from "@/domain/monthlyReview";
import type { OpsLog } from "@/domain/types";

const fmt = (v: number | null | undefined, digits = 1): string => {
  if (v == null || !Number.isFinite(v)) return "—";
  return digits === 0 ? Math.round(v).toLocaleString() : v.toFixed(digits);
};
const fmtMoney = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const monthLabel = (m: string): string => {
  const [, mm] = m.split("-");
  return `${parseInt(mm)}月`;
};

/** ROI 配色：<0 红（亏本）· <1 黄（约打平）· 其余正常 */
const roiCls = (roi: number | null): string => {
  if (roi == null) return "text-foreground-400";
  if (roi < 0) return "font-semibold text-red-600";
  if (roi < 1) return "font-semibold text-amber-600";
  return "font-semibold text-accent-600";
};

const TH = "border-b border-background-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-400";
const TD = "border-b border-background-200/50 px-3 py-2";

function RoiTable({ rows }: { rows: PromoRoiRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-foreground-400">暂无已结束的促销活动</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <th className={TH}>活动</th>
            <th className={TH}>SKU</th>
            <th className={`${TH} text-right`}>促销成本</th>
            <th className={`${TH} text-right`}>活动期销量</th>
            <th className={`${TH} text-right`}>增量件数</th>
            <th className={`${TH} text-right`}>毛贡献</th>
            <th className={`${TH} text-right`}>ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((r) => (
            <tr key={r.promoId} className="hover:bg-background-100/50">
              <td className={TD}>
                <div className="font-medium text-foreground-900">{r.name}</div>
                <div className="text-[10px] text-foreground-400">{r.startDate.slice(5)} ~ {r.endDate.slice(5)} · {r.days} 天</div>
              </td>
              <td className={TD}>
                <div className="text-foreground-800">{r.skuName}</div>
                <div className="text-[10px] text-foreground-400">{r.sku}</div>
              </td>
              <td className={`${TD} text-right mono-num`}>{fmtMoney(r.cost)}</td>
              <td className={`${TD} text-right mono-num`}>
                {r.hasData ? fmt(r.periodSales, 0) : <span className="text-[11px] text-amber-600">无快照</span>}
              </td>
              <td className={`${TD} text-right mono-num`}>{fmt(r.liftUnits, 0)}</td>
              <td className={`${TD} text-right mono-num`}>{fmtMoney(r.grossContribution)}</td>
              <td className={`${TD} text-right ${roiCls(r.roi)}`}>{fmtMoney(r.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionLoopTable({ rows }: { rows: ActionLoopRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-foreground-400">暂无操作记录 — 在 SKU 详情页或操作记录页记录动作后，这里自动生成前后对比</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <th className={TH}>日期 / 操作</th>
            <th className={`${TH} text-right`}>前销量</th>
            <th className={`${TH} text-right`}>后销量</th>
            <th className={`${TH} text-right`}>变化</th>
            <th className={`${TH} text-right`}>前净利率</th>
            <th className={`${TH} text-right`}>后净利率</th>
            <th className={`${TH} text-right`}>变化</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((r) => {
            const insufficient = r.beforeSamples === 0 || r.afterSamples === 0;
            const deltaCls = (d: number | null) =>
              d == null ? "text-foreground-400" : d > 0.01 ? "font-semibold text-accent-600" : d < -0.01 ? "font-semibold text-red-500" : "text-foreground-400";
            return (
              <tr key={r.logId} className="hover:bg-background-100/50">
                <td className={TD}>
                  <div className="font-medium text-foreground-900">
                    {r.date.slice(5)} · {r.action}
                    {insufficient && (
                      <span className="ml-1.5 rounded-full bg-background-200 px-1.5 py-0.5 text-[10px] font-medium text-foreground-500">样本不足</span>
                    )}
                  </div>
                  <div className="text-[10px] text-foreground-400">{r.skuName}（{r.sku}）{r.summary !== r.action ? ` · ${r.summary}` : ""}</div>
                </td>
                <td className={`${TD} text-right mono-num`}>{r.beforeSamples === 0 ? <span className="text-[11px] text-foreground-400">样本不足</span> : fmt(r.salesBefore, 1)}</td>
                <td className={`${TD} text-right mono-num`}>{r.afterSamples === 0 ? <span className="text-[11px] text-foreground-400">样本不足</span> : fmt(r.salesAfter, 1)}</td>
                <td className={`${TD} text-right ${deltaCls(r.salesDelta)}`}>{r.salesDelta == null ? "—" : `${r.salesDelta > 0 ? "+" : ""}${fmt(r.salesDelta, 1)}`}</td>
                <td className={`${TD} text-right mono-num`}>{r.beforeSamples === 0 ? "—" : `${fmt(r.marginBefore)}%`}</td>
                <td className={`${TD} text-right mono-num`}>{r.afterSamples === 0 ? "—" : `${fmt(r.marginAfter)}%`}</td>
                <td className={`${TD} text-right ${deltaCls(r.marginDelta)}`}>{r.marginDelta == null ? "—" : `${r.marginDelta > 0 ? "+" : ""}${fmt(r.marginDelta)}pp`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProfitTable({ rows }: { rows: MonthlyProfitRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-foreground-400">本月与上月均无快照数据</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <th className={TH}>SKU</th>
            <th className={`${TH} text-right`}>本月净利</th>
            <th className={`${TH} text-right`}>上月净利</th>
            <th className={`${TH} text-right`}>变化</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((r) => (
            <tr key={r.sku} className={`hover:bg-background-100/50 ${r.bothLoss ? "bg-red-50/60" : ""}`}>
              <td className={TD}>
                <div className={`font-medium ${r.bothLoss ? "text-red-600" : "text-foreground-900"}`}>
                  {r.name}
                  {r.bothLoss && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">连续两月亏损</span>}
                </div>
                <div className="text-[10px] text-foreground-400">{r.sku} · 日销 {fmt(r.curAvgDaily)} × 净利 {fmtMoney(r.unitProfit)}</div>
              </td>
              <td className={`${TD} text-right mono-num font-semibold ${r.curProfit != null && r.curProfit < 0 ? "text-red-600" : "text-foreground-900"}`}>{fmtMoney(r.curProfit)}</td>
              <td className={`${TD} text-right mono-num text-foreground-600`}>{fmtMoney(r.prevProfit)}</td>
              <td className={`${TD} text-right ${r.delta == null ? "text-foreground-400" : r.delta > 0 ? "font-semibold text-accent-600" : r.delta < 0 ? "font-semibold text-red-500" : "text-foreground-400"}`}>
                {r.delta == null ? "—" : `${r.delta > 0 ? "↑" : r.delta < 0 ? "↓" : "→"} ${fmtMoney(Math.abs(r.delta))}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeeTrendCharts({ points }: { points: StoreFeePoint[] }) {
  if (points.length === 0) {
    return <p className="py-6 text-center text-[13px] text-foreground-400">暂无月度数据</p>;
  }
  const data = points.map((p) => ({ ...p, label: monthLabel(p.month) }));
  const tooltipStyle = {
    fontSize: 12, borderRadius: 14,
    border: "1px solid oklch(var(--background-300))",
    background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <div className="mb-1 text-[12px] font-medium text-foreground-700">全店广告费比（Σ广告费 ÷ Σ销售额）</div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-300))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)}%`, "广告费比"]} />
              <Line type="monotone" dataKey="adRatio" stroke="oklch(var(--primary-500))" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[12px] font-medium text-foreground-700">全店退货率（有值 SKU 平均）</div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-300))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(var(--foreground-500))" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)}%`, "退货率"]} />
              <Line type="monotone" dataKey="returnRate" stroke="oklch(var(--secondary-500))" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function MonthlyReview() {
  const { snapshots, skuMaster, promotions, currentSiteId, currentSite, today } = useOpsData();
  const [opsLogs, setOpsLogs] = useState<OpsLog[]>([]);

  // 操作记录不在全局 store，按站点直读 IndexedDB
  useEffect(() => {
    let mounted = true;
    db.opsLogs.toArray().then((all) => {
      if (mounted) setOpsLogs(all.filter((l) => (l.siteId ?? "site_us") === currentSiteId));
    });
    return () => { mounted = false; };
  }, [currentSiteId]);

  const commissionRate = currentSite?.commissionRate;

  // 板块1：促销 ROI（已结束活动）
  const promoRows = useMemo(
    () => computePromoRoi({ promotions, skuMaster, snapshots, today, defaultCommissionRate: commissionRate }),
    [promotions, skuMaster, snapshots, today, commissionRate],
  );

  // 板块2：动作闭环
  const actionRows = useMemo(
    () => computeActionLoop({ logs: opsLogs, skuMaster, snapshots, defaultCommissionRate: commissionRate }),
    [opsLogs, skuMaster, snapshots, commissionRate],
  );

  // 板块3：月度盈亏
  const profit = useMemo(
    () => computeMonthlyProfit({ skuMaster, snapshots, defaultCommissionRate: commissionRate, today }),
    [skuMaster, snapshots, commissionRate, today],
  );

  // 板块4：费用趋势
  const feePoints = useMemo(
    () => computeStoreFeeTrend({ skuMaster, snapshots, today }),
    [skuMaster, snapshots, today],
  );

  const endedCount = promoRows.length;
  const lossCount = profit.rows.filter((r) => r.bothLoss).length;

  return (
    <div className="space-y-6">
      {/* 上排：板块1 + 板块2 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section
          title="促销 ROI"
          icon="ri-coupon-3-line"
          subtitle={endedCount > 0 ? `${endedCount} 个已结束活动` : "仅统计已结束活动"}
        >
          <RoiTable rows={promoRows} />
          <p className="mt-2 text-[11px] leading-relaxed text-foreground-400">
            口径：毛贡献 = 活动期销量 × <span className="font-medium">正常价</span>单件净利（折扣损失不重复扣）；
            增量 = 活动期销量 − 活动前7天日均 × 活动天数；ROI = 毛贡献 − 促销成本。<span className="text-red-500">红 = 亏本</span>、<span className="text-amber-600">黄 ≈ 打平</span>。
          </p>
        </Section>

        <Section
          title="动作闭环"
          icon="ri-loop-left-line"
          subtitle={actionRows.length > 0 ? `${actionRows.length} 条操作 · 前7天 vs 后7天` : "操作前后对比"}
        >
          <ActionLoopTable rows={actionRows} />
          <p className="mt-2 text-[11px] leading-relaxed text-foreground-400">
            仅做前后对比展示，不构成因果结论；窗口内无快照时标记「样本不足」。
          </p>
        </Section>
      </div>

      {/* 下排：板块3 + 板块4 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section
          title={`SKU 月度盈亏（${monthLabel(profit.curMonth)}）`}
          icon="ri-line-chart-line"
          subtitle={lossCount > 0 ? `${lossCount} 个 SKU 连续两月亏损` : "本月 vs 上月"}
        >
          <ProfitTable rows={profit.rows} />
          <p className="mt-2 text-[11px] leading-relaxed text-foreground-400">
            公式：月净利 = 月均日销 × 正常价单件净利 × 当月天数（按快照聚合；{monthLabel(profit.curMonth)}为 {profit.curMonth}，对比 {profit.prevMonth ? monthLabel(profit.prevMonth) : "—"}）。
          </p>
        </Section>

        <Section title="全店费用趋势" icon="ri-funds-line" subtitle="近 6 个月 · 广告费比 / 退货率">
          <FeeTrendCharts points={feePoints} />
        </Section>
      </div>
    </div>
  );
}
