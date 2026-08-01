import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { runDataHealth, HEALTH_CATEGORY_LABELS, type HealthCategory } from "@/domain/dataHealth";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

const CATEGORY_ICON: Record<HealthCategory, string> = {
  missing_cost: "ri-price-tag-3-line",
  missing_inventory: "ri-archive-line",
  abnormal_profit: "ri-money-dollar-circle-line",
  abnormal_sales: "ri-bar-chart-line",
};

const CATEGORY_TONE: Record<HealthCategory, "danger" | "warn" | "secondary" | "primary"> = {
  missing_cost: "warn",
  missing_inventory: "secondary",
  abnormal_profit: "danger",
  abnormal_sales: "primary",
};

const ORDER: HealthCategory[] = ["missing_cost", "missing_inventory", "abnormal_profit", "abnormal_sales"];

export default function DataHealthPage() {
  const { loading, skuMaster, snapshots, inventory } = useOpsData();

  const report = useMemo(
    () => runDataHealth({ skuMaster, snapshots, inventory }),
    [skuMaster, snapshots, inventory]
  );

  if (loading) return <div className="text-sm text-foreground-400">加载中…</div>;

  const healthy = report.total === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-bold text-foreground-950">数据健康检查</h1>
          <p className="mt-1 text-[13px] text-foreground-500">
            导入后先校验数据质量 · 已校验 {report.skuCount} 个在售 SKU
          </p>
        </div>
        <Link
          to="/import"
          className="flex items-center gap-1.5 rounded-[12px] bg-primary-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-700 cursor-pointer"
        >
          <i className="ri-file-excel-2-line" aria-hidden />
          去导入数据
        </Link>
      </div>

      {/* 概览卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ORDER.map((cat) => {
          const count = report.counts[cat];
          return (
            <div key={cat} className="glass-card p-4">
              <div className="flex items-center justify-between">
                <span className={`flex h-9 w-9 items-center justify-center rounded-[12px] text-[17px] ${
                  count > 0 ? "bg-red-50 text-red-500" : "bg-accent-50 text-accent-600"
                }`}>
                  <i className={CATEGORY_ICON[cat]} aria-hidden />
                </span>
                <span className={`mono-num text-[26px] font-bold ${count > 0 ? "text-red-600" : "text-accent-600"}`}>{count}</span>
              </div>
              <div className="mt-2 text-[13px] font-semibold text-foreground-800">{HEALTH_CATEGORY_LABELS[cat]}</div>
              <div className="mt-0.5 text-[11px] text-foreground-400">{count > 0 ? "存在问题" : "正常"}</div>
            </div>
          );
        })}
      </div>

      {healthy ? (
        <EmptyState
          icon="ri-shield-check-line"
          title="数据质量健康"
          desc="未检测到缺失成本 / 缺失库存 / 异常利润 / 异常销量，可以放心使用各项分析"
        />
      ) : (
        <div className="space-y-4">
          {ORDER.map((cat) => {
            const issues = report.byCategory[cat];
            if (issues.length === 0) return null;
            return (
              <Section
                key={cat}
                title={HEALTH_CATEGORY_LABELS[cat]}
                subtitle={`${issues.length} 个 SKU`}
                icon={CATEGORY_ICON[cat]}
                action={<Badge tone={CATEGORY_TONE[cat]}>{issues.length}</Badge>}
              >
                <div className="space-y-2">
                  {issues.map((iss, i) => (
                    <div
                      key={`${iss.sku}-${i}`}
                      className={`flex items-start gap-3 rounded-[12px] border px-3.5 py-2.5 ${
                        iss.severity === "critical" ? "border-red-200 bg-red-50/40" : "border-background-200 bg-background-50/60"
                      }`}
                    >
                      <i className={`mt-0.5 text-[15px] ${iss.severity === "critical" ? "ri-error-warning-line text-red-500" : "ri-information-line text-secondary-600"}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link to={`/sku/${encodeURIComponent(iss.sku)}`} className="text-[13px] font-semibold text-foreground-900 hover:underline">
                            {iss.sku}
                          </Link>
                          {iss.skuName && <span className="text-[11px] text-foreground-400">{iss.skuName}</span>}
                        </div>
                        <div className="mt-0.5 text-[12px] text-foreground-600">{iss.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}
