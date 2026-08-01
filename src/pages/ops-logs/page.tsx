import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db, deleteOpsLog, addOpsLog } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { anomalyLabel, ANOMALY_OPTIONS } from "@/domain/anomaly";
import type { OpsLog, SkuMaster, Promotion, AnomalyType } from "@/domain/types";

const ACTION_ICONS: Record<string, string> = {
  "降价": "ri-arrow-down-line",
  "涨价": "ri-arrow-up-line",
  "开广告": "ri-megaphone-line",
  "关广告": "ri-forbid-line",
  "优化Listing": "ri-edit-line",
  "补货": "ri-truck-line",
  "报活动": "ri-flashlight-line",
  "站外推广": "ri-share-line",
  "其他": "ri-more-line",
};

const ACTION_KEYS = Object.keys(ACTION_ICONS);

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

const inputCls = "w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none cursor-pointer";
const labelCls = "mb-1 block text-[12px] font-medium text-foreground-600";

function groupByDate(logs: OpsLog[]): Map<string, OpsLog[]> {
  const groups = new Map<string, OpsLog[]>();
  for (const log of logs) {
    const key = log.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log);
  }
  return groups;
}

/* ────────── 记一笔操作 弹窗 ────────── */
function RecordModal({
  skuMaster,
  promotions,
  onClose,
  onSaved,
}: {
  skuMaster: SkuMaster[];
  promotions: Promotion[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [sku, setSku] = useState("");
  const [promotionId, setPromotionId] = useState("");
  const [msku, setMsku] = useState("");
  const [action, setAction] = useState("");
  const [anomalyType, setAnomalyType] = useState<AnomalyType | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [impact, setImpact] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);

  // 选了 SKU 就过滤出该 SKU 的促销（与促销活动页 SKU↔促销 一致）
  const skuPromotions = useMemo(
    () => (sku ? promotions.filter((p) => p.sku === sku) : []),
    [promotions, sku],
  );

  // 该 SKU 关联的子 MSKU 列表（可选、不必选）：
  // 取 parentSku===sku 或 groupSku===sku 的子行，收集其 msku（无则回退其 sku）；
  // 若该父 SKU 自身带 msku 也一并纳入。
  const skuMskus = useMemo(() => {
    if (!sku) return [];
    const parent = skuMaster.find((s) => s.sku === sku);
    const children = skuMaster.filter((s) => s.sku !== sku && (s.parentSku === sku || s.groupSku === sku));
    const values: string[] = [];
    const push = (v?: string) => { if (v && !values.includes(v)) values.push(v); };
    children.forEach((c) => push(c.msku || c.sku));
    push(parent?.msku);
    return values;
  }, [skuMaster, sku]);

  const selectedSkuName = skuMaster.find((s) => s.sku === sku)?.name;

  const handleSave = async () => {
    if (!sku || !action.trim()) return;
    setSaving(true);
    const promo = promotions.find((p) => p.id === promotionId);
    await addOpsLog(
      sku,
      date,
      action.trim(),
      note.trim() || reason.trim(),
      impact.trim() || undefined,
      msku || undefined,
      selectedSkuName,
      anomalyType || undefined,
      reason.trim() || undefined,
      note.trim() || undefined,
      promo?.id,
      promo?.name,
    );
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-background-50 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-[16px] font-semibold text-foreground-950">记一笔操作</h3>
          <button onClick={onClose} className="text-[18px] text-foreground-400 hover:text-foreground-700 cursor-pointer">
            <i className="ri-close-line" aria-hidden />
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <label className={labelCls}>关联 SKU <span className="text-red-500">*</span></label>
            <select value={sku} onChange={(e) => { setSku(e.target.value); setPromotionId(""); }}
              className={inputCls}>
              <option value="">选择 SKU（必选）</option>
              {skuMaster.map((s) => (
                <option key={s.sku} value={s.sku}>{s.sku}{s.name ? ` · ${s.name}` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>关联促销活动</label>
            <select value={promotionId} onChange={(e) => setPromotionId(e.target.value)}
              disabled={!sku}
              className={inputCls + (sku ? "" : " opacity-50 cursor-not-allowed")}>
              <option value="">{sku ? "选择促销活动（选填）" : "先选择 SKU"}</option>
              {skuPromotions.map((p) => (
                <option key={p.id} value={p.id}>{p.type} · {p.name}</option>
              ))}
            </select>
            {sku && skuPromotions.length === 0 && (
              <div className="mt-1 text-[11px] text-foreground-400">该 SKU 暂无促销活动</div>
            )}
          </div>

          <div>
            <label className={labelCls}>关联 MSKU <span className="text-[11px] font-normal text-foreground-400">（可选）</span></label>
            <select value={msku} onChange={(e) => setMsku(e.target.value)}
              disabled={!sku}
              className={inputCls + (sku ? "" : " opacity-50 cursor-not-allowed")}>
              <option value="">{sku ? "选择 MSKU（选填）" : "先选择 SKU"}</option>
              {skuMskus.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {sku && skuMskus.length === 0 && (
              <div className="mt-1 text-[11px] text-foreground-400">该 SKU 暂无子 MSKU</div>
            )}
          </div>

          <div>
            <label className={labelCls}>处理动作 <span className="text-red-500">*</span></label>
            <select value={action} onChange={(e) => setAction(e.target.value)} className={inputCls}>
              <option value="">选择动作</option>
              {ACTION_KEYS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>异常类型</label>
            <select value={anomalyType} onChange={(e) => setAnomalyType(e.target.value as AnomalyType)}
              className={inputCls}>
              <option value="">无 / 不关联</option>
              {ANOMALY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>原因</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="如：竞品降价导致转化下滑" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" />
          </div>

          <div>
            <label className={labelCls}>备注</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="补充说明（选填）" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" />
          </div>

          <div>
            <label className={labelCls}>影响</label>
            <input value={impact} onChange={(e) => setImpact(e.target.value)}
              placeholder="如：日均销量上涨约30%（选填）" className="w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none" />
          </div>

          <div>
            <label className={labelCls}>日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-background-300 px-4 py-2 text-[13px] text-foreground-600 hover:bg-background-100 cursor-pointer">取消</button>
          <button
            onClick={handleSave}
            disabled={saving || !sku || !action.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-700 cursor-pointer disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存记录"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OpsLogsPage() {
  const [logs, setLogs] = useState<OpsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [skuMaster, setSkuMaster] = useState<SkuMaster[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showModal, setShowModal] = useState(false);

  const loadLogs = () => {
    db.opsLogs.toArray().then((data) => {
      data.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setLogs(data);
    });
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([
      db.opsLogs.toArray(),
      db.skuMaster.toArray(),
      db.promotions.toArray(),
    ]).then(([data, sm, promos]) => {
      if (!mounted) return;
      data.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setLogs(data);
      setSkuMaster(sm);
      setPromotions(promos);
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setLogs([]);
      setSkuMaster([]);
      setPromotions([]);
      setLoading(false);
    });
    return () => { mounted = false; };
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
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-[12px] bg-primary-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-primary-700 cursor-pointer"
        >
          <i className="ri-add-line" aria-hidden />
          记一笔操作
        </button>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon="ri-history-line"
          title="暂无操作记录"
          desc="点击右上角「记一笔操作」，凭空记一笔，或去 SKU 详情页记录"
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
                                {log.promotionId && (
                                  <Link
                                    to="/promotions"
                                    className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 hover:bg-accent-100 cursor-pointer"
                                  >
                                    <i className="ri-flashlight-line" aria-hidden />
                                    关联促销：{log.promotionName ?? log.promotionId}
                                  </Link>
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

      {showModal && (
        <RecordModal
          skuMaster={skuMaster}
          promotions={promotions}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            loadLogs();
          }}
        />
      )}
    </div>
  );
}
