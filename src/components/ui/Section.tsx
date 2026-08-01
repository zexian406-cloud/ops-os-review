import { useState } from "react";
import type { ReactNode } from "react";

interface SectionProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export default function Section({
  title,
  subtitle,
  icon,
  action,
  children,
  className = "",
  padded = true,
  collapsible = false,
  defaultCollapsed = false,
}: SectionProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <section className={["glass-card overflow-hidden", className].join(" ")}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-background-200/40 px-5 py-4 md:px-6 md:py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              {icon && (
                <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-background-100 text-[15px] text-foreground-500">
                  <i className={icon} aria-hidden />
                </span>
              )}
              <h2 className="font-heading text-[15px] font-semibold leading-tight text-foreground-950 tracking-tight">
                {title}
              </h2>
            </div>
            {subtitle && <div className="mt-1 text-[12px] text-foreground-400">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {collapsible && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={open ? "收起" : "展开"}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700"
              >
                <i className={open ? "ri-arrow-down-s-line" : "ri-arrow-right-s-line"} aria-hidden />
              </button>
            )}
          </div>
        </header>
      )}
      {open && <div className={padded ? "p-5 md:p-6" : ""}>{children}</div>}
    </section>
  );
}