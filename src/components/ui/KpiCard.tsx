import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: string;
  tone?: "default" | "primary" | "accent" | "secondary" | "warn" | "danger";
  trend?: number;
  spark?: ReactNode;
  tooltip?: string;
}

const toneMap = {
  default: { icon: "bg-white/70 backdrop-blur-md text-foreground-500 border border-white/25", value: "text-foreground-950" },
  primary: { icon: "bg-primary-100/70 text-primary-700", value: "text-foreground-950" },
  accent: { icon: "bg-accent-100/70 text-accent-700", value: "text-foreground-950" },
  secondary: { icon: "bg-secondary-100/70 text-secondary-700", value: "text-foreground-950" },
  warn: { icon: "bg-secondary-100/80 text-secondary-700", value: "text-foreground-800" },
  danger: { icon: "bg-red-50 text-red-500", value: "text-red-600" },
} as const;

export default function KpiCard({ label, value, sub, icon, tone = "default", trend, spark, tooltip }: KpiCardProps) {
  const t = toneMap[tone];
  return (
    <div className="glass-card glass-card-hover group relative overflow-hidden p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-400">
          {label}
          {tooltip && (
            <span className="ml-1 cursor-help" title={tooltip}>
              <i className="ri-information-line text-[10px] text-foreground-300" aria-hidden />
            </span>
          )}
        </div>
        {icon && (
          <div className={["flex h-9 w-9 items-center justify-center rounded-[12px] text-[18px] transition-transform duration-300 group-hover:scale-110", t.icon].join(" ")}>
            <i className={icon} aria-hidden />
          </div>
        )}
      </div>
      {spark && <div className="mt-2">{spark}</div>}
      <div className={["mono-num mt-4 font-heading text-[36px] font-bold leading-none tracking-tight", t.value].join(" ")}>
        {value}
      </div>
      {(sub || trend != null) && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-foreground-500">
          {trend != null && (
            <span className={["inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", trend >= 0 ? "bg-accent-100/60 text-accent-700" : "bg-red-50 text-red-600"].join(" ")}>
              <i className={trend >= 0 ? "ri-arrow-up-line" : "ri-arrow-down-line"} aria-hidden />
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  );
}