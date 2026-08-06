import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AlertType } from "@/domain/types";

interface AlertItem {
  id: string;
  sku: string;
  skuName?: string;
  type: AlertType;
  severity: "critical" | "warning" | "info";
  value: string;
  suggestion: string;
}

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
  promo_start: "促销即将开始",
  promo_end: "促销即将到期",
};

/** 告警类型 → 诊断类型映射（无映射的告警类型不显示诊断按钮） */
const diagnosisTypeMap: Partial<Record<AlertType, "profit" | "sales">> = {
  profit: "profit",
  ad: "profit",
  stockout: "sales",
  low_stock: "sales",
  overstock: "sales",
};

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

export default function AlertList({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {alerts.map((a) => {
        const cfg = severityConfig[a.severity];
        const diagType = diagnosisTypeMap[a.type];
        return (
          <div
            key={a.id}
            className={`rounded-[16px] border ${cfg.borderClass} ${cfg.bgClass} p-4 transition-colors hover:border-background-300`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[13px] font-semibold text-foreground-800">
                {typeLabels[a.type]}
              </span>
              <span className={`text-[14px] font-bold mono-num ${cfg.textClass}`}>
                {a.value}
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
    </div>
  );
}