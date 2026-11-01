import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, getCurrentSiteId } from "@/domain/db";
import { ALERT_TYPE_LABELS, resolveAlertDiagType } from "@/domain/types";
import type { Alert, AlertType, ListingVerdict, SkuMaster, TodoItem } from "@/domain/types";
import { getVerdictText } from "@/domain/listingVerdict";

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

/** 分流结论 Badge 配色：仅在数据明确（visibility/detail_page/both）时展示 */
const VERDICT_BADGE: Partial<Record<ListingVerdict, string>> = {
  visibility: "bg-red-100/80 text-red-700 border-red-200",
  detail_page: "bg-violet-100/80 text-violet-700 border-violet-200",
  both: "bg-red-100/80 text-red-700 border-red-200",
};

/** 每条告警的诊断摘要：对比值 + 归因结论（异常中心「全部异常」清单使用） */
export interface AlertDiagnostic {
  compare?: string;
  reason?: string;
}

export default function AlertList({
  alerts,
  skuMaster,
  limit,
  diagnostics,
}: {
  alerts: Alert[];
  skuMaster: SkuMaster[];
  limit?: number;
  diagnostics?: Record<string, AlertDiagnostic>;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | AlertType>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"severity" | "type" | "sku">("severity");
  // 已加入待办的告警 id（本次会话内，按钮变「已在待办」）
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [todoToast, setTodoToast] = useState<string | null>(null);

  /** 把异常一键转为待办：自动带 SKU + 类型 + 判定结论，人工决定是否跟进 */
  const handleAddTodo = async (a: Alert) => {
    const siteId = await getCurrentSiteId();
    const content = `${a.sku} ${ALERT_TYPE_LABELS[a.type]}：${a.title}${a.suggestion ? `（${a.suggestion}）` : ""}`;
    // 防重复：同一站点下相同内容且未完成的待办只保留一条
    const dupCount = await db.todos
      .filter((t) => !t.completed && t.content === content && (t.siteId ?? "site_us") === siteId)
      .count();
    if (dupCount > 0) {
      setTodoToast("该异常已在待办中，无需重复添加");
    } else {
      const item: TodoItem = {
        id: Math.random().toString(36).slice(2, 10),
        siteId,
        content,
        relatedSku: a.sku,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      await db.todos.put(item);
      setTodoToast("已加入待办，可在「我的待办」中跟进");
    }
    setAddedIds((prev) => new Set(prev).add(a.id));
    setTimeout(() => setTodoToast(null), 2400);
  };

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
          const diagType = resolveAlertDiagType(a);
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
                {a.listingVerdict && VERDICT_BADGE[a.listingVerdict] && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${VERDICT_BADGE[a.listingVerdict]}`}
                    title={`Sessions ${a.sessionsPrevious ?? "-"} → ${a.sessionsCurrent ?? "-"} · CVR ${(a.cvrPrevious ?? 0).toFixed(1)}% → ${(a.cvrCurrent ?? 0).toFixed(1)}%`}
                  >
                    {getVerdictText(a.listingVerdict)}
                  </span>
                )}
                <Link
                  to={`/sku/${encodeURIComponent(a.sku)}`}
                  className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 hover:underline cursor-pointer whitespace-nowrap"
                >
                  [{a.sku}]
                </Link>
                {diagType && (
                  <Link
                    to={`/operations?tab=diag&type=${diagType}&sku=${encodeURIComponent(a.sku)}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary-300/70 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <i className="ri-search-eye-line text-[12px]" aria-hidden />
                    去诊断
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => handleAddTodo(a)}
                  disabled={addedIds.has(a.id)}
                  title="把这条异常加入我的待办"
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors disabled:cursor-default ${
                    addedIds.has(a.id)
                      ? "border-accent-300 bg-accent-50 text-accent-700"
                      : "border-secondary-200/70 bg-secondary-50 text-secondary-700 hover:bg-secondary-100"
                  } ${diagType ? "" : "ml-auto"}`}
                >
                  <i className={addedIds.has(a.id) ? "ri-check-line text-[12px]" : "ri-list-check-3 text-[12px]"} aria-hidden />
                  {addedIds.has(a.id) ? "已在待办" : "加入待办"}
                </button>
              </div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-foreground-500">
                {a.suggestion}
              </div>
              {diagnostics?.[a.id] && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-background-200/60 pt-2">
                  {diagnostics[a.id].compare && (
                    <span className="mono-num rounded-md bg-background-50 px-2 py-0.5 text-[11px] font-medium text-foreground-600">
                      {diagnostics[a.id].compare}
                    </span>
                  )}
                  {diagnostics[a.id].reason && (
                    <span className="text-[12px] leading-relaxed text-foreground-800">
                      <span className="font-semibold text-primary-700">归因：</span>
                      {diagnostics[a.id].reason}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
          })}
        </>
      )}

      {todoToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          {todoToast}
        </div>
      )}
    </div>
  );
}
