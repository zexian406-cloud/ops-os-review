import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db, deleteOpsLog, addOpsLog } from "@/domain/db";
import { useOpsData } from "@/domain/store";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { OpsLog, SkuMaster } from "@/domain/types";

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

const ACTION_OPTIONS = ["降价", "涨价", "开广告", "关广告", "优化Listing", "补货", "报活动", "站外推广", "其他"];

const todayStr = () => new Date().toISOString().slice(0, 10);

/** 获取某 SKU 下所有 MSKU 选项 */
function getMskuOptions(sku?: SkuMaster): string[] {
  if (!sku) return [];
  const set = new Set<string>();
  if (sku.msku) {
    for (const t of sku.msku.split(/[,\s，、·]+/).map((s) => s.trim()).filter(Boolean)) {
      set.add(t);
    }
  }
  if (sku.mskuMetrics) {
    for (const k of Object.keys(sku.mskuMetrics)) set.add(k);
  }
  return Array.from(set);
}

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
  const { skuMaster, currentSiteId } = useOpsData();
  const [logs, setLogs] = useState<OpsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // 新增表单状态
  const [newDate, setNewDate] = useState(todayStr());
  const [newSku, setNewSku] = useState("");
  const [newMsku, setNewMsku] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newImpact, setNewImpact] = useState("");

  const selectedSkuObj = useMemo(
    () => skuMaster.find((s) => s.sku === newSku),
    [skuMaster, newSku],
  );
  const mskuOptions = useMemo(() => getMskuOptions(selectedSkuObj), [selectedSkuObj]);

  const loadLogs = async () => {
    db.opsLogs
      .toArray()
      .then((data) => {
        const filtered = data.filter((l) => (l.siteId ?? "site_us") === currentSiteId);
        filtered.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        setLogs(filtered);
        setLoading(false);
      })
      .catch(() => {
        setLogs([]);
        setLoading(false);
      });
  };

  useEffect(() => { loadLogs(); }, [currentSiteId]);

  const handleAdd = async () => {
    if (!newSku || !newAction || !newDetail) return;
    const skuObj = skuMaster.find((s) => s.sku === newSku);
    const id = await addOpsLog(
      newSku,
      newDate,
      newAction,
      newDetail,
      newImpact || undefined,
      newMsku || undefined,
      skuObj?.name,
      currentSiteId,
    );
    setLogs((prev) => [{ id, siteId: currentSiteId, sku: newSku, msku: newMsku || undefined, skuName: skuObj?.name, date: newDate, action: newAction, detail: newDetail, impact: newImpact || undefined, createdAt: new Date().toISOString() }, ...prev]);
    setNewSku(""); setNewMsku(""); setNewAction(""); setNewDetail(""); setNewImpact("");
    setToast({ msg: "已添加操作记录", ok: true });
    setTimeout(() => setToast(null), 2000);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await deleteOpsLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setDeleting(null);
  };

  const grouped = useMemo(() => groupByDate(logs), [logs]);

  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const inputCls = "w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50";

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
            共 {logs.length} 条记录 · 完成待办自动归档至此 · 按日期倒序排列
          </p>
        </div>
      </div>

      {/* 新增操作记录 */}
      <Section title="新增操作记录" icon="ri-add-circle-line">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">日期</label>
            <input type="date" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">关联 SKU *</label>
            <select className={inputCls + " cursor-pointer"} value={newSku} onChange={(e) => { setNewSku(e.target.value); setNewMsku(""); }}>
              <option value="">选择 SKU</option>
              {skuMaster.map((s) => (
                <option key={s.sku} value={s.sku}>{s.sku} - {s.name}</option>
              ))}
            </select>
          </div>
          {mskuOptions.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">关联 MSKU</label>
              <select className={inputCls + " cursor-pointer"} value={newMsku} onChange={(e) => setNewMsku(e.target.value)}>
                <option value="">不指定</option>
                {mskuOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">操作类型 *</label>
            <select className={inputCls + " cursor-pointer"} value={newAction} onChange={(e) => setNewAction(e.target.value)}>
              <option value="">选择类型</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">操作内容 *</label>
            <input className={inputCls} value={newDetail} onChange={(e) => setNewDetail(e.target.value)} placeholder="例如：降价到 $35.99" onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">效果备注 (选填)</label>
            <input className={inputCls} value={newImpact} onChange={(e) => setNewImpact(e.target.value)} placeholder="例如：销量上涨约30%" onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newSku || !newAction || !newDetail}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-add-line" aria-hidden /> 添加记录
          </button>
        </div>
      </Section>

      {/* 时间线列表 */}
      {logs.length === 0 ? (
        <EmptyState
          icon="ri-history-line"
          title="暂无操作记录"
          desc="在上方添加操作记录，或在待办页面完成待办后自动归档至此"
        />
      ) : (
        <div className="relative">
          {/* 时间线 */}
          <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-background-200/80" />

          <div className="space-y-8">
            {Array.from(grouped.entries()).map(([date, dayLogs]) => {
              const dateLabel = date === today ? "今天" : date === yesterday ? "昨天" : date;
              const dayTotal = dayLogs.length;
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
                                {log.msku ? (
                                  <Link
                                    to={`/sku/${encodeURIComponent(log.sku)}?focus=${encodeURIComponent(log.msku)}`}
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
                              <div className="mt-1 text-[13px] text-foreground-900">{log.detail}</div>
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

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl px-5 py-2.5 text-sm font-medium shadow-lg z-50 ${toast.ok ? "bg-accent-600 text-background-50" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
