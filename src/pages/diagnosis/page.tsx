import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { computeDiagnosis, type DiagnosisResult, type Impact } from "@/domain/diagnosis";
import { addOpsLog } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { Alert, AlertType, AnomalyType, SkuMaster, Promotion } from "@/domain/types";
import { ANOMALY_OPTIONS } from "@/domain/anomaly";

const impactMeta = (impact?: Impact) => {
  switch (impact) {
    case "up_bad":
    case "down_bad":
      return { cls: "text-red-600", arrow: impact === "up_bad" ? "↑" : "↓" };
    case "up_good":
    case "down_good":
      return { cls: "text-accent-600", arrow: impact === "up_good" ? "↑" : "↓" };
    default:
      return { cls: "text-foreground-500", arrow: "" };
  }
};

function DiagnosisFactors({ result }: { result: DiagnosisResult }) {
  if (result.factors.length === 0) {
    return <div className="text-[12px] text-foreground-400">暂无结构化拆解。</div>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-400">
            <th className="border-b border-background-200 px-2 py-1.5">归因项</th>
            <th className="border-b border-background-200 px-2 py-1.5 text-right">上期</th>
            <th className="border-b border-background-200 px-2 py-1.5 text-right">本期</th>
            <th className="border-b border-background-200 px-2 py-1.5 text-right">变化</th>
          </tr>
        </thead>
        <tbody>
          {result.factors.map((f) => {
            const m = impactMeta(f.impact);
            const deltaText =
              f.delta != null
                ? `${m.arrow}${Math.abs(f.delta)}${f.unit ?? ""}`
                : f.after != null && f.before == null
                ? `${f.after}`
                : "—";
            return (
              <tr key={f.key} className="align-top">
                <td className="border-b border-background-200/50 px-2 py-2 font-medium text-foreground-800">
                  {f.label}
                  {f.note && <div className="mt-0.5 text-[10px] font-normal text-foreground-400">{f.note}</div>}
                </td>
                <td className="mono-num border-b border-background-200/50 px-2 py-2 text-right text-foreground-500">{f.before ?? "—"}</td>
                <td className="mono-num border-b border-background-200/50 px-2 py-2 text-right text-foreground-900">{f.after ?? "—"}</td>
                <td className={`mono-num border-b border-background-200/50 px-2 py-2 text-right font-semibold ${m.cls}`}>{deltaText}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecordModal({
  alert,
  skuName,
  promotions,
  onClose,
  onSaved,
}: {
  alert: Alert;
  skuName?: string;
  promotions: Promotion[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [anomalyType, setAnomalyType] = useState<AnomalyType>((alert.type as AnomalyType) ?? "other");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [promotionId, setPromotionId] = useState("");
  const [saving, setSaving] = useState(false);

  // 选了 SKU（此处固定为告警 SKU）就过滤出该 SKU 的促销（与促销活动页一致）
  const skuPromotions = promotions.filter((p) => p.sku === alert.sku);

  const handleSave = async () => {
    if (!action.trim()) return;
    setSaving(true);
    const promo = promotions.find((p) => p.id === promotionId);
    await addOpsLog(
      alert.sku,
      date,
      action.trim(),
      note.trim() || reason.trim(),
      undefined,
      undefined,
      skuName,
      anomalyType,
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
          <h3 className="font-heading text-[16px] font-semibold text-foreground-950">记录处理 · {alert.sku}</h3>
          <button onClick={onClose} className="text-[18px] text-foreground-400 hover:text-foreground-700 cursor-pointer">
            <i className="ri-close-line" aria-hidden />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[12px] font-medium text-foreground-600">异常类型</label>
            <select
              value={anomalyType}
              onChange={(e) => setAnomalyType(e.target.value as AnomalyType)}
              className="mt-1 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none"
            >
              {ANOMALY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-foreground-600">关联促销活动</label>
            <select
              value={promotionId}
              onChange={(e) => setPromotionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none cursor-pointer"
            >
              <option value="">不关联（选填）</option>
              {skuPromotions.map((p) => (
                <option key={p.id} value={p.id}>{p.type} · {p.name}</option>
              ))}
            </select>
            {skuPromotions.length === 0 && (
              <div className="mt-1 text-[11px] text-foreground-400">该 SKU 暂无促销活动</div>
            )}
          </div>
          <div>
            <label className="text-[12px] font-medium text-foreground-600">原因</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：竞品降价导致转化下滑"
              className="mt-1 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-foreground-600">处理动作 <span className="text-red-500">*</span></label>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="如：降低出价 10%、联系买家"
              className="mt-1 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-foreground-600">备注</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="补充说明（选填）"
              className="mt-1 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-foreground-600">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-background-300 px-4 py-2 text-[13px] text-foreground-600 hover:bg-background-100 cursor-pointer">取消</button>
          <button
            onClick={handleSave}
            disabled={saving || !action.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-700 cursor-pointer disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存记录"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DiagnosisPage() {
  const { loading, alerts, skuMaster, latestSnapshot, previousSnapshot, latestInventory, promotions } = useOpsData();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState<"all" | "critical" | "warning">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recordFor, setRecordFor] = useState<Alert | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const skuMap = useMemo(() => new Map<string, SkuMaster>(skuMaster.map((s) => [s.sku, s])), [skuMaster]);

  const actionable = useMemo(() => alerts.filter((a) => a.severity !== "info"), [alerts]);

  const filtered = useMemo(() => {
    const list = actionable.filter((a) => {
      if (filter === "all") return true;
      return a.severity === filter;
    });
    const t = searchParams.get("type");
    if (t) {
      const map: Record<string, AlertType[]> = {
        stock: ["stockout", "low_stock", "overstock"],
        profit: ["profit"],
        ad: ["ad"],
        rating: ["rating"],
        return: ["return", "review"],
      };
      const types = map[t];
      if (types) return list.filter((a) => types.includes(a.type));
    }
    return list;
  }, [actionable, filter, searchParams]);

  const diagnoses = useMemo(() => {
    return filtered
      .map((a) => {
        const sku = skuMap.get(a.sku);
        if (!sku) return null;
        const latest = latestSnapshot.get(a.sku);
        if (!latest) return null;
        const result = computeDiagnosis({
          type: a.type,
          sku,
          latestSnap: latest,
          previousSnap: previousSnapshot?.get(a.sku),
          latestInv: latestInventory.get(a.sku),
        });
        return { alert: a, result };
      })
      .filter((x): x is { alert: Alert; result: DiagnosisResult } => x !== null);
  }, [filtered, skuMap, latestSnapshot, previousSnapshot, latestInventory]);

  if (loading) return <div className="text-sm text-foreground-400">加载中…</div>;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[22px] font-bold text-foreground-950">异常诊断详情</h1>
          <p className="mt-1 text-[13px] text-foreground-500">
            不只看异常，更看根因拆解 · 共 {diagnoses.length} 条待诊断异常
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-background-200 bg-background-50 p-1">
          {(["all", "critical", "warning"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium cursor-pointer ${
                filter === f ? "bg-primary-600 text-white" : "text-foreground-500 hover:text-foreground-800"
              }`}
            >
              {f === "all" ? "全部" : f === "critical" ? "紧急" : "关注"}
            </button>
          ))}
        </div>
      </div>

      {diagnoses.length === 0 ? (
        <EmptyState icon="ri-check-double-line" title="没有待诊断的异常" desc="当前筛选条件下一切正常，或尚未导入数据" />
      ) : (
        <div className="space-y-3">
          {diagnoses.map(({ alert, result }) => {
            const isOpen = expanded.has(alert.id);
            const sevBadge = alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warn" : "neutral";
            return (
              <Section
                key={alert.id}
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{alert.title}</span>
                    <Badge tone={sevBadge}>{alert.severity === "critical" ? "紧急" : alert.severity === "warning" ? "关注" : "提醒"}</Badge>
                    <Link to={`/sku/${encodeURIComponent(alert.sku)}`} className="text-[12px] font-medium text-foreground-500 hover:underline">
                      [{alert.sku}]
                    </Link>
                  </div>
                }
                subtitle={`${alert.skuName ?? ""} · ${result.title}`}
                action={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggle(alert.id)}
                      className="text-[12px] font-medium text-foreground-500 hover:text-foreground-900 cursor-pointer"
                    >
                      {isOpen ? "收起诊断" : "查看诊断"}
                    </button>
                    <button
                      onClick={() => setRecordFor(alert)}
                      className="rounded-lg bg-accent-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-700 cursor-pointer"
                    >
                      记录处理
                    </button>
                  </div>
                }
              >
                <p className="text-[13px] leading-relaxed text-foreground-700">{result.summary}</p>
                {isOpen && (
                  <>
                    <DiagnosisFactors result={result} />
                    {result.suggestion && (
                      <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-accent-50/50 px-3 py-2">
                        <i className="ri-lightbulb-line mt-0.5 text-[14px] text-accent-700" aria-hidden />
                        <span className="text-[12px] text-foreground-700"><span className="font-semibold">建议动作：</span>{result.suggestion}</span>
                      </div>
                    )}
                  </>
                )}
              </Section>
            );
          })}
        </div>
      )}

      {justSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-5 py-2.5 text-[13px] font-medium text-white shadow-lg">
          已记录处理，可在「操作记录」查看
        </div>
      )}

      {recordFor && (
        <RecordModal
          alert={recordFor}
          skuName={recordFor.skuName}
          promotions={promotions}
          onClose={() => setRecordFor(null)}
          onSaved={() => {
            setRecordFor(null);
            setJustSaved(recordFor.sku);
            setTimeout(() => setJustSaved(null), 2500);
          }}
        />
      )}
    </div>
  );
}
