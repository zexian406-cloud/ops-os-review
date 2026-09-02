import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import AlertList from "@/pages/dashboard/AlertList";
import type { AlertType, AlertSeverity } from "@/domain/types";

const TABS: Array<{ key: string; label: string; icon: string; types: AlertType[] }> = [
  { key: "all", label: "全部", icon: "ri-list-check", types: [] },
  { key: "stock", label: "库存", icon: "ri-archive-line", types: ["stockout", "low_stock", "overstock"] },
  { key: "profit", label: "利润", icon: "ri-money-dollar-circle-line", types: ["profit"] },
  { key: "ad", label: "广告", icon: "ri-megaphone-line", types: ["ad"] },
  { key: "rating", label: "评分", icon: "ri-star-half-line", types: ["rating"] },
  { key: "return", label: "退货", icon: "ri-arrow-go-back-line", types: ["return"] },
  { key: "listing", label: "Listing", icon: "ri-file-edit-line", types: ["listing"] },
];

export default function RiskCenter() {
  const { loading, alerts } = useOpsData();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<string>(params.get("type") ?? "all");
  const [sev, setSev] = useState<"all" | AlertSeverity>("all");

  // 浏览器前进/后退或跨入口跳转时，URL 变化需重新同步选中 tab
  useEffect(() => {
    setTab(params.get("type") ?? "all");
  }, [params]);

  const filtered = useMemo(() => {
    const active = TABS.find((t) => t.key === tab);
    let list = alerts;
    if (active && active.types.length > 0) {
      list = list.filter((a) => active.types.includes(a.type));
    }
    if (sev !== "all") list = list.filter((a) => a.severity === sev);
    return list;
  }, [alerts, tab, sev]);

  const setTabAndUrl = (key: string) => {
    setTab(key);
    const next = new URLSearchParams(params);
    if (key === "all") next.delete("type");
    else next.set("type", key);
    setParams(next);
  };

  if (loading) return <div className="text-sm text-foreground-500">加载中...</div>;

  const criticalCount = filtered.filter((a) => a.severity === "critical").length;
  const warningCount = filtered.filter((a) => a.severity === "warning").length;
  const infoCount = filtered.filter((a) => a.severity === "info").length;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          Risk Center
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">风险中心</h1>
        <p className="text-[13px] text-foreground-500">
          规则引擎自动识别所有异常，按类型和严重度浏览
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const count = t.types.length
            ? alerts.filter((a) => t.types.includes(a.type)).length
            : alerts.length;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTabAndUrl(t.key)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer",
                active
                  ? "border-primary-500 bg-primary-500 text-background-50"
                  : "border-background-300 bg-background-100 text-foreground-700 hover:bg-background-200",
              ].join(" ")}
            >
              <i className={t.icon} aria-hidden />
              {t.label}
              <span
                className={[
                  "mono-num ml-1 rounded-full px-1.5 text-[10px]",
                  active ? "bg-primary-700/40" : "bg-background-200",
                ].join(" ")}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Section
        title={TABS.find((t) => t.key === tab)?.label + " 风险清单"}
        subtitle="逐条查看并处理"
        icon="ri-error-warning-line"
        action={
          <div className="flex items-center gap-2 text-[12px]">
            <Badge tone="danger">Critical {criticalCount}</Badge>
            <Badge tone="warn">Warning {warningCount}</Badge>
            <Badge tone="secondary">Info {infoCount}</Badge>
            <select
              value={sev}
              onChange={(e) => setSev(e.target.value as typeof sev)}
              className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-[12px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="all">全部严重度</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="ri-check-double-line"
            title="没有匹配的风险"
            desc="此类别下暂无异常，继续保持"
          />
        ) : (
          <AlertList alerts={filtered} />
        )}
      </Section>
    </div>
  );
}