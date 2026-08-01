import { Link } from "react-router-dom";
import type { Alert, AlertType } from "@/domain/types";

const typeLabels: Record<AlertType, string> = {
  stockout: "断货风险",
  low_stock: "库存紧张",
  overstock: "库存积压",
  profit: "利润异常",
  ad: "广告异常",
  rating: "评分下降",
  return: "退货异常",
  review: "差评激增",
  listing: "Listing 待优化",
};

// 告警类型 → 诊断页分组 key（与诊断页过滤 map 对齐）
const DIAGNOSIS_GROUP: Partial<Record<AlertType, string>> = {
  stockout: "stock",
  low_stock: "stock",
  overstock: "stock",
  profit: "profit",
  ad: "ad",
  rating: "rating",
  return: "return",
  review: "return",
  listing: "listing",
};

const severityConfig = {
  critical: {
    badge: "紧急",
    badgeClass: "bg-red-50 text-red-600 border-red-200",
    borderClass: "border-red-200/60",
    bgClass: "bg-red-50/40",
    textClass: "text-red-600",
  },
  warning: {
    badge: "关注",
    badgeClass: "bg-secondary-100/60 text-secondary-700 border-secondary-200",
    borderClass: "border-secondary-200/60",
    bgClass: "bg-secondary-50/40",
    textClass: "text-secondary-700",
  },
  info: {
    badge: "提醒",
    badgeClass: "bg-background-100 text-foreground-500 border-background-300",
    borderClass: "border-background-300/60",
    bgClass: "bg-background-50",
    textClass: "text-foreground-600",
  },
};

export default function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {alerts.map((a) => {
        const cfg = severityConfig[a.severity];
        const metricText =
          a.metric != null ? (a.type === "rating" || a.type === "profit" || a.type === "ad"
            ? `${a.metric}%`
            : `${a.metric}`) : undefined;
        return (
          <div
            key={a.id}
            className={`rounded-[16px] border ${cfg.borderClass} ${cfg.bgClass} p-4 transition-colors hover:border-background-300`}
          >
            {/* 第一行：问题 + 数值 + 严重度 + SKU */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[13px] font-semibold text-foreground-800">
                {a.title || typeLabels[a.type]}
              </span>
              {metricText && (
                <span className={`text-[14px] font-bold mono-num ${cfg.textClass}`}>{metricText}</span>
              )}
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${cfg.badgeClass}`}>
                {cfg.badge}
              </span>
              <Link
                to={`/sku/${encodeURIComponent(a.sku)}`}
                className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap"
              >
                [{a.sku}]
              </Link>
              {a.skuName && (
                <span className="text-[11px] text-foreground-400">{a.skuName}</span>
              )}
            </div>

            {/* 第二行：影响 + 建议动作（结构化） */}
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-[10px] bg-background-50/70 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-400">影响</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-foreground-600">{a.detail}</div>
              </div>
              <div className="rounded-[10px] bg-accent-50/50 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-700">建议动作</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-foreground-700">{a.suggestion}</div>
              </div>
            </div>

            {/* 第三行：诊断深链 */}
            {DIAGNOSIS_GROUP[a.type] && (
              <div className="flex justify-end">
                <Link
                  to={`/diagnosis?type=${DIAGNOSIS_GROUP[a.type]}&sku=${encodeURIComponent(a.sku)}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 hover:underline cursor-pointer"
                >
                  <i className="ri-search-eye-line" aria-hidden />
                  查看诊断原因
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
