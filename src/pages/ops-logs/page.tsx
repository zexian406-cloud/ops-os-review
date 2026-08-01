import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db, deleteOpsLog } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { anomalyLabel } from "@/domain/anomaly";
import type { OpsLog } from "@/domain/types";

const ACTION_ICONS: Record<string, string> = {
  "降价": "ri-arrow-down-line",
  "涨价": "ri-arrow-up-line",
  "开广告": "ri-megaphone-line",
  "关广告": "ri-megaphone-off-line",
  "优化Listing": "ri-edit-line",
  "补货": "ri-truck-line",
  "报活动": "ri-flashlight-line",
  "站外推广": "ri-share-line",
  "其他": "ri-more-line",
};

const ACTION_TONES: Record<string, string> = {
  "降价": "text-green-600 bg-green-50",
  "涨价": "text-orange-600 bg-orange-50",
  "开广告": "text-blue-600 bg-blue-50",
  "关广告": "text-foreground-600 bg-foreground-50",
  "优化Listing": "text-purple-600 bg-purple-50",
  "补货": "text-indigo-600 bg-indigo-50",
  "报活动": "text-amber-600 bg-amber-50",
  "站外推广": "text-cyan-600 bg-cyan-50",
  "其他": "text-foreground-500 bg-foreground-50",
};

const ANOMALY_TONES: Record<string, string> = {
  "stockout": "text-red-700 bg-red-50",
  "low_stock": "text-orange-700 bg-orange-50",
  "overstock": "text-amber-700 bg-amber-50",
  "profit": "text-rose-700 bg-rose-50",
  "ad": "text-blue-700 bg-blue-50",
  "rating": "text-purple-700 bg-purple-50",
  "return": "text-pink-700 bg-pink-50",
  "listing": "text-cyan-700 bg-cyan-50",
  "other": "text-foreground-600 bg-foreground-50",
};

function groupByDate(logs: OpsLog[]): Map<string, OpsLog[]> {
  const groups = new Map<string, OpsLog[]>();
  for (const log of logs) {
    const key = log.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log);
  }
  return groups;
}

export default function OpsLogsPage() {
  const [logs, setLogs] = useState<OpsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    db.opsLogs
      .toArray()
      .then((data) => {
        data.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        setLogs(data);
        setLoading(false);
      })
      .catch(() => {
        setLogs([]);
        setLoading(false);
      });
  }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await deleteOpsLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setDeleting(null);
  };

  const grouped = useMemo(() => groupByDate(logs), [logs]);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-foreground-400">
        <i className="ri-loader-4-line animate-spin text-[20px]" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-bold text-foreground-950">运营操作记录</h1>
          <p className="mt-1 text-[13px] text-foreground-500">
            共 {logs.length} 条记录，按日期倒序排列
          </p>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon="ri-history-line"
          title="暂无操作记录"
          desc="去 SKU 详情页记录你做的运营操作，方便后续汇报和复盘"
        />
      ) : (
        <div className="relative">
          {/* 时间线 */}
          <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-background-200/80" />

          <div className="space-y-8">
            {Array.from(grouped.entries()).map(([date, dayLogs]) => {
              const dateLabel = date === today ? "今天" : date === yesterday ? "昨天" : date;
              const dayTotal = dayLogs.reduce((sum, l) => sum + 1, 0);
              return (
                <div key={date}>
                  {/* 日期标题 */}
                  <div className="mb-4 flex items-center gap-3">
                    <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-[14px] text-primary-700 shadow-sm">
                      <i className="ri-calendar-line" aria-hidden />
                    </div>
                    <div>
                      <span className="text-[14px] font-semibold text-foreground-900">{dateLabel}</span>
                      <span className="ml-2 text-[12px] text-foreground-400">
                        {dayTotal} 条操作
                      </span>
                    </div>
                  </div>

                  {/* 当日记录 */}
                  <div className="ml-12 space-y-3">
                    {dayLogs.map((log) => {
                      const toneCls = ACTION_TONES[log.action] ?? "text-foreground-500 bg-foreground-50";
                      return (
                        <div
                          key={log.id}
                          className="group relative rounded-xl border border-background-200/70 bg-background-50 px-4 py-3.5 transition-all hover:border-background-300 hover:shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneCls}`}>
                              <i className={`${ACTION_ICONS[log.action] ?? "ri-file-edit-line"} text-[15px]`} aria-hidden />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge tone="secondary">{log.action}</Badge>
                                {log.anomalyType && (
                                  <span
                                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                      ANOMALY_TONES[log.anomalyType] ?? "text-foreground-600 bg-foreground-50"
                                    }`}
                                  >
                                    {anomalyLabel(log.anomalyType)}
                                  </span>
                                )}
                                {log.msku ? (
                                  <Link
                                    to={`/sku/${encodeURIComponent(log.sku)}`}
                                    className="text-[11px] font-medium text-primary-600 hover:underline"
                                  >
                                    {log.msku}
                                  </Link>
                                ) : (
                                  <Link
                                    to={`/sku/${encodeURIComponent(log.sku)}`}
                                    className="text-[11px] font-medium text-foreground-500 hover:underline"
                                  >
                                    {log.sku}
                                  </Link>
                                )}
                                {log.skuName && (
                                  <span className="text-[11px] text-foreground-400">{log.skuName}</span>
                                )}
                              </div>
                              {log.detail && (
                                <div className="mt-1 text-[13px] text-foreground-900">{log.detail}</div>
                              )}
                              {log.reason && log.reason !== log.detail && (
                                <div className="mt-1 text-[12px] text-foreground-600">
                                  <span className="font-medium text-foreground-400">原因：</span>
                                  {log.reason}
                                </div>
                              )}
                              {log.note && log.note !== log.detail && (
                                <div className="mt-0.5 text-[12px] text-foreground-500">
                                  <span className="font-medium text-foreground-400">备注：</span>
                                  {log.note}
                                </div>
                              )}
                              {log.impact && (
                                <div className="mt-1 flex items-center gap-1 text-[12px] text-accent-700">
                                  <i className="ri-bar-chart-line text-[13px]" aria-hidden />
                                  {log.impact}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDelete(log.id!)}
                              disabled={deleting === log.id}
                              className="shrink-0 text-[14px] text-foreground-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all cursor-pointer disabled:opacity-30"
                            >
                              <i className="ri-delete-bin-line" aria-hidden />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}