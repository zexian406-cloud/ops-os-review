import type { ReactNode } from "react";

export default function EmptyState({
  icon = "ri-inbox-line",
  title,
  desc,
  action,
}: {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-background-300/70 bg-background-100/50 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background-200 text-[26px] text-foreground-500">
        <i className={icon} aria-hidden />
      </div>
      <div className="mt-4 font-heading text-[15px] font-semibold text-foreground-900">
        {title}
      </div>
      {desc && (
        <div className="mt-1 max-w-md text-[13px] text-foreground-500">{desc}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}