import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ALERT_TYPE_LABELS, ALERT_TYPE_TO_DIAG } from "@/domain/types";
import type { Alert, AlertType, SkuMaster } from "@/domain/types";

const SEVERITY_ORDER: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };

const severityConfig = {
  critical: {
    badge: "CRITICAL",
    badgeClass: "bg-red-50 text-red-600 border-red-200",
    borderClass: "border-red-200/60",
    bgClass: "bg-red-50/40",
    textClass: "text-red-600",
  },
  warning: {
    badge: "WARNING",
    badgeClass: "bg-secondary-100/60 text-secondary-700 border-secondary-200",
    borderClass: "border-secondary-200/60",
    bgClass: "bg-secondary-50/40",
    textClass: "text-secondary-700",
  },
  info: {
    badge: "INFO",
    badgeClass: "bg-background-100 text-foreground-500 border-background-300",
    borderClass: "border-background-300/60",
    bgClass: "bg-background-50",
    textClass: "text-foreground-600",
  },
};

const selectCls =
  "rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer";

export default function AlertList({
  alerts,
  skuMaster,
  limit,
}: {
  alerts: Alert[];
  skuMaster: SkuMaster[];
  limit?: number;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | AlertType>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"severity" | "type" | "sku">("severity");

  // SKU → 店铺映射（告警本身不带店铺，从主档关联）
  const storeMap = useMemo(() => new Map(skuMaster.map((s) => [s.sku, s.store])), [skuMaster]);
  const storeOptions = useMemo(
    () => [...new Set(skuMaster.map((s) => s.store).filter(Boolean))].sort(),
    [skuMaster],
  );
  const presentTypes = useMemo(() => [...new Set(alerts.map((a) => a.type))], [alerts]);

  const visible = useMemo(() => {
    let list = alerts.filter((a) => typeFilter === "all" || a.type === typeFilter);
    if (storeFilter !== "all") list = list.filter((a) => storeMap.get(a.sku) === storeFilter);
    return [...list].sort((x, y) => {
      if (sortBy === "sku") return x.sku.localeCompare(y.sku);
      if (sortBy === "type") return ALERT_TYPE_LABELS[x.type].localeCompare(ALERT_TYPE_LABELS[y.type]);
      return SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity];
    });
  }, [alerts, typeFilter, storeFilter, sortBy, storeMap]);

  const shown = limit != null ? visible.slice(0, limit) : visible;

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {/* 排序与筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className={selectCls}
          aria-label="排序方式"
        >
          <option value="severity">按严重度排序</option>
          <option value="type">按类型排序</option>
          <option value="sku">按 SKU 排序</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className={selectCls}
          aria-label="筛选异常类型"
        >
          <option value="all">全部类型</option>
          {presentTypes.map((t) => (
            <option key={t} value={t}>{ALERT_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className={selectCls}
          aria-label="筛选店铺"
        >
          <option value="all">全部店铺</option>
          {storeOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-[12px] text-foreground-500">
          {visible.length === alerts.length ? `共 ${alerts.length} 条` : `${visible.length} / ${alerts.length} 条`}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[16px] border border-background-200 bg-background-50 p-4 text-center text-[13px] text-foreground-500">
          当前筛选条件下没有异常，试试切换类型或店铺
        </div>
      ) : (
        <>
          {visible.length > shown.length && (
            <div className="text-center text-[12px] text-foreground-400">
              还有 {visible.length - shown.length} 条告警未显示
            </div>
          )}
          {shown.map((a) => {
          const cfg = severityConfig[a.severity];
          const diagType = ALERT_TYPE_TO_DIAG[a.type];
          return (
            <div
              key={a.id}
              className={`rounded-[16px] border ${cfg.borderClass} ${cfg.bgClass} p-4 transition-colors hover:border-background-300`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[13px] font-semibold text-foreground-800">
                  {ALERT_TYPE_LABELS[a.type]}
                </span>
                <span className={`text-[14px] font-bold mono-num ${cfg.textClass}`}>
                  {a.detail}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${cfg.badgeClass}`}>
                  {cfg.badge}
                </span>
                <Link
                  to={`/sku/${encodeURIComponent(a.sku)}`}
                  className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap"
                >
                  [{a.sku}]
                </Link>
                {diagType && (
                  <Link
                    to={`/diagnosis?type=${diagType}&sku=${encodeURIComponent(a.sku)}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary-300/70 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <i className="ri-search-eye-line text-[12px]" aria-hidden />
                    去诊断
                  </Link>
                )}
              </div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-foreground-500">
                {a.suggestion}
              </div>
            </div>
          );
          })}
        </>
      )}
    </div>
  );
}
