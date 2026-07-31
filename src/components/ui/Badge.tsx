import type { ReactNode } from "react";

const toneMap = {
  primary: "bg-primary-100/70 text-primary-800",
  accent: "bg-accent-100/70 text-accent-800",
  secondary: "bg-secondary-100/70 text-secondary-800",
  danger: "bg-red-50 text-red-600",
  warn: "bg-secondary-100/80 text-secondary-800",
  neutral: "bg-white/50 backdrop-blur-md text-foreground-600 border border-white/20",
} as const;

export type BadgeTone = keyof typeof toneMap;

export default function Badge({
  tone = "neutral",
  children,
  icon,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  icon?: string;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        toneMap[tone],
        className,
      ].join(" ")}
    >
      {icon && <i className={icon} aria-hidden />}
      {children}
    </span>
  );
}