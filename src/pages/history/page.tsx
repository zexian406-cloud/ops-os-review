import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { computeAll } from "@/domain/calculator";
import Section from "@/components/ui/Section";
import EmptyState from "@/components/ui/EmptyState";

type GoodDir = "up" | "down";
type Level = "good" | "bad" | "neutral";

interface MetricView {
  cur: number;
  prev: number | undefined;
  goodDir: GoodDir;
  unit: string;
  digits: number;
}

/** 计算单个指标的方向与着色（纯规则，不做 AI） */
function metricLevel(m: MetricView): Level {
  if (m.prev == null || m.cur === m.prev) return "neutral";
  const up = m.cur > m.prev;
  const good = m.goodDir === "up" ? up : !up;
  return good ? "good" : "bad";
}

function MetricCell({ m }: { m: MetricView }) {
  const level = metricLevel(m);
  const arrow = m.prev == null || m.cur === m.prev ? "→" : m.cur > m.prev ? "↑" : "↓";
  const color = level === "good" ? "text-accent-600" : level === "bad" ? "text-red-500" : "text-foreground-400";
  const fmt = (v: number) => (m.digits === 0 ? Math.round(v).toLocaleString() : v.toFixed(m.digits));
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="mono-num text-[13px] font-semibold text-foreground-900">{fmt(m.cur)}{m.unit}</span>
      {m.prev != null && (
        <span className={`text-[11px] font-medium ${color}`}>{arrow} {fmt(Math.abs(m.cur - m.prev))}{m.unit}</span>
      )}
    </div>
  );
}

interface Row {
  sku: string;
  skuName: string;
  sales: MetricView;
  stock: MetricView;
  margin: MetricView;
  tacos: MetricView;
  rating: MetricView;
  anomaly: boolean;
}

export default function HistoryPage() {
  const { loading, skuMaster, latestSnapshot, previousSnapshot, latestInventory, config } = useOpsData();

  const rows = useMemo<Row[]>(() => {
    if (!previousSnapshot || previousSnapshot.size === 0) return [];
    const defaultLeadTime = config?.defaultLeadTime ?? 40;
    const defaultSafetyStockDays = config?.defaultSafetyStockDays ?? 30;

    const result: Row[] = [];
    for (const sku of skuMaster) {
      if (sku.saleStatus === "discontinued") continue;
      const cur = latestSnapshot.get(sku.sku);
      const prev = previousSnapshot.get(sku.sku);
      if (!cur) continue;

      const inv = latestInventory.get(sku.sku);
      const curCalc = computeAll({ sku, snap: cur, inv, defaultLeadTime, defaultSafetyStockDays });
      const prevCalc = prev
        ? computeAll({ sku, snap: prev, inv, defaultLeadTime, defaultSafetyStockDays })
        : null;

      const sales: MetricView = {
        cur: cur.dailySales7d,
        prev: prev?.dailySales7d,
        goodDir: "up",
        unit: "",
        digits: 1,
      };
      const stock: MetricView = {
        cur: curCalc.inStockTotal,
        prev: prevCalc?.inStockTotal,
        goodDir: "up",
        unit: "",
        digits: 0,
      };
      const margin: MetricView = {
        cur: curCalc.grossMargin,
        prev: prevCalc?.grossMargin,
        goodDir: "up",
        unit: "%",
        digits: 1,
      };
      const tacos: MetricView = {
        cur: cur.adRatio,
        prev: prev?.adRatio,
        goodDir: "down",
        unit: "%",
        digits: 1,
      };
      const rating: MetricView = {
        cur: cur.rating,
        prev: prev?.rating,
        goodDir: "up",
        unit: "",
        digits: 1,
      };

      const anomaly = curCalc.grossMargin < 0 || curCalc.inStockTotal < 0;

      result.push({ sku: sku.sku, skuName: sku.name, sales, stock, margin, tacos, rating, anomaly });
    }
    return result;
  }, [skuMaster, latestSnapshot, previousSnapshot, latestInventory, config]);

  if (loading) return <div className="text-sm text-foreground-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          History Compare
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">历史对比</h1>
        <p className="text-[13px] text-foreground-500">
          本周（最新导入）对比上周（上次导入）· 上升↑ 绿 / 下降↓ 红 · ⚠ 表示异常（利润率转负、库存转负）
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="ri-git-compare-line"
          title="暂无上次导入数据"
          desc="请下周导入后查看本周 vs 上周对比"
          action={
            <Link to="/import" className="rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap">
              去导入数据
            </Link>
          }
        />
      ) : (
        <Section title="本周 vs 上周" subtitle={`共 ${rows.length} 个 SKU`} icon="ri-git-compare-line">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-400">
                  <th className="border-b border-background-200 px-3 py-2.5">SKU</th>
                  <th className="border-b border-background-200 px-3 py-2.5">销量(日均)</th>
                  <th className="border-b border-background-200 px-3 py-2.5">库存</th>
                  <th className="border-b border-background-200 px-3 py-2.5">利润率</th>
                  <th className="border-b border-background-200 px-3 py-2.5">TACOS</th>
                  <th className="border-b border-background-200 px-3 py-2.5">评分</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sku} className="group">
                    <td className="border-b border-background-200/50 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {row.anomaly && (
                          <i className="ri-alert-line text-[13px] text-red-500" title="异常：利润率转负或库存转负" aria-hidden />
                        )}
                        <Link to={`/sku/${encodeURIComponent(row.sku)}`} className="font-medium text-foreground-900 hover:text-primary-700 hover:underline cursor-pointer">
                          {row.sku}
                        </Link>
                      </div>
                      {row.skuName && <div className="text-[11px] text-foreground-400">{row.skuName}</div>}
                    </td>
                    <td className="border-b border-background-200/50 px-3 py-2.5"><MetricCell m={row.sales} /></td>
                    <td className="border-b border-background-200/50 px-3 py-2.5"><MetricCell m={row.stock} /></td>
                    <td className="border-b border-background-200/50 px-3 py-2.5"><MetricCell m={row.margin} /></td>
                    <td className="border-b border-background-200/50 px-3 py-2.5"><MetricCell m={row.tacos} /></td>
                    <td className="border-b border-background-200/50 px-3 py-2.5"><MetricCell m={row.rating} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
