import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { snapKey } from "@/domain/engine";
import {
  db,
  getDiagnosisNotes,
  addDiagnosisNote,
  deleteDiagnosisNote,
  DIAGNOSIS_NOTES_EVENT,
} from "@/domain/db";
import {
  diagnoseProfitDecline,
  diagnoseSalesDecline,
  diagnoseRatingDecline,
  diagnoseAdRatioRise,
  type DiagnosisOutput,
} from "@/domain/diagnose";
import {
  resolveComparison,
  shiftDate,
  type CompareBasis,
} from "@/domain/diagnosis-period";
import type { DailySnapshot, DiagnosisNote, DiagnosisType } from "@/domain/types";

const DIAG_TYPES: DiagnosisType[] = ["profit", "sales", "rating", "adRatio"];

const TYPE_META: Record<DiagnosisType, { label: string; icon: string }> = {
  profit: { label: "利润下降", icon: "ri-money-dollar-circle-line" },
  sales: { label: "销量下降", icon: "ri-bar-chart-line" },
  rating: { label: "评分下降", icon: "ri-star-half-line" },
  adRatio: { label: "费比上升", icon: "ri-funds-line" },
};

const BASIS_OPTIONS: Array<{ key: CompareBasis; label: string; hint: string }> = [
  { key: "import", label: "本次 vs 上次导入", hint: "对比最近两次导入批次" },
  { key: "7d", label: "近7天 vs 前7天", hint: "本期 = 最新快照日往前 7 天均值，上期 = 再往前 7 天均值" },
  { key: "14d", label: "近14天 vs 前14天", hint: "按 14 天区间取均值对比，避免单日波动误报" },
  { key: "30d", label: "近30天 vs 前30天", hint: "按 30 天区间取均值对比，适合看月度趋势" },
  { key: "custom", label: "自定义天数", hint: "自定 N 天，本期 = 最近 N 天，上期 = 再往前 N 天" },
  { key: "range", label: "指定日期区间", hint: "选一段历史区间（如 2026-10-19 ~ 2026-10-25），与紧邻其前的等长区间对比" },
];

const isBasis = (v: string | null): v is CompareBasis => BASIS_OPTIONS.some((o) => o.key === v);

const basisDays = (basis: CompareBasis, customDays: number): number =>
  basis === "7d" ? 7
    : basis === "14d" ? 14
      : basis === "30d" ? 30
        : basis === "custom" ? Math.max(1, Math.round(customDays))
          : 0;

const basisLabel = (basis: CompareBasis, customDays: number): string =>
  basis === "import"
    ? "对比本次与上次导入批次"
    : basis === "range"
      ? "指定日期区间 vs 紧邻的等长区间"
      : `近 ${basisDays(basis, customDays)} 天 vs 前 ${basisDays(basis, customDays)} 天`;

/** 兜底默认区间：最新快照日往前 6 天 ~ 最新快照日 */
const defaultRange = (latestDate: string): { from: string; to: string } => ({
  from: shiftDate(latestDate, -6),
  to: latestDate,
});

/** 无害结论（评分稳定 / 费比波动正常）用绿色调，异常结论用红色调 */
const isBenignReason = (reason: string): boolean =>
  reason.includes("稳定") || reason.includes("正常");

const fmtNoteTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 单 SKU 归因分析（异常中心二级下钻）。
 * 状态全部由 URL 承载：/operations?tab=diag&sku=xxx&type=adRatio&basis=...，可直接分享。
 */
export default function DiagnosisView() {
  const { currentSiteId, skuMaster, latestInventory, config, loading } = useOpsData();
  const [searchParams, setSearchParams] = useSearchParams();
  const skuParam = searchParams.get("sku") ?? "";
  const typeParam = searchParams.get("type") ?? "profit";
  const diagType: DiagnosisType = DIAG_TYPES.includes(typeParam as DiagnosisType)
    ? (typeParam as DiagnosisType)
    : "profit";
  const basisParam = searchParams.get("basis");
  const daysParam = Number(searchParams.get("days") ?? "30");
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";

  const [skuInput, setSkuInput] = useState(skuParam);
  const [basis, setBasisState] = useState<CompareBasis>(isBasis(basisParam) ? basisParam : "import");
  const [customDays, setCustomDaysState] = useState<number>(
    Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 730 ? Math.round(daysParam) : 30,
  );
  const [customDaysInput, setCustomDaysInput] = useState(String(customDays));
  const [rangeFrom, setRangeFrom] = useState(fromParam);
  const [rangeTo, setRangeTo] = useState(toParam);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // 站点全量快照：不受顶栏店铺筛选影响，诊断任意 SKU 都能取到完整历史
  const [siteSnapshots, setSiteSnapshots] = useState<DailySnapshot[]>([]);
  useEffect(() => {
    let alive = true;
    db.dailySnapshot.toArray()
      .then((rows) => {
        if (!alive) return;
        setSiteSnapshots(rows.filter((r) => (r.siteId ?? "site_us") === currentSiteId));
      })
      .catch(() => { if (alive) setSiteSnapshots([]); });
    return () => { alive = false; };
  }, [currentSiteId, loading]);

  // 诊断备注（留痕）
  const [notes, setNotes] = useState<DiagnosisNote[]>([]);
  const refreshNotes = useCallback(() => {
    getDiagnosisNotes({ siteId: currentSiteId }).then(setNotes).catch(() => setNotes([]));
  }, [currentSiteId]);
  useEffect(() => {
    refreshNotes();
    const handler = () => refreshNotes();
    window.addEventListener(DIAGNOSIS_NOTES_EVENT, handler);
    return () => window.removeEventListener(DIAGNOSIS_NOTES_EVENT, handler);
  }, [refreshNotes]);

  // 同步 URL 参数到本地状态（浏览器后退/分享链接打开时保持一致）
  useEffect(() => {
    if (skuParam) setSkuInput(skuParam);
    if (isBasis(basisParam)) setBasisState(basisParam);
    if (Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 730) {
      setCustomDaysState(Math.round(daysParam));
      setCustomDaysInput(String(Math.round(daysParam)));
    }
    if (fromParam) setRangeFrom(fromParam);
    if (toParam) setRangeTo(toParam);
  }, [skuParam, basisParam, daysParam, fromParam, toParam]);

  // 当前选中的 SKU 对象（支持按 SKU 或 MSKU 检索）
  const currentSku = useMemo(() => {
    const q = skuInput.trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    return skuMaster.find((s) => s.sku === q)
      ?? skuMaster.find((s) => (s.msku ?? "").toLowerCase() === lower)
      ?? null;
  }, [skuMaster, skuInput]);

  // 该 SKU 的全部历史快照（升序）
  const skuHistory = useMemo(() => {
    if (!currentSku) return [];
    return siteSnapshots
      .filter((s) => s.sku === currentSku.sku)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [siteSnapshots, currentSku]);

  const latestHistoryDate = skuHistory.length ? skuHistory[skuHistory.length - 1].date : "";

  // 选定「指定日期区间」但还没有有效区间时，默认给最近 7 天
  useEffect(() => {
    if (basis !== "range" || (rangeFrom && rangeTo) || !latestHistoryDate) return;
    const d = defaultRange(latestHistoryDate);
    setRangeFrom(d.from);
    setRangeTo(d.to);
  }, [basis, rangeFrom, rangeTo, latestHistoryDate]);

  // 本期 / 上期区间（区间 vs 区间，避免单日快照对比单日快照）
  const comparison = useMemo(() => {
    if (!currentSku) return null;
    return resolveComparison({
      rows: skuHistory,
      basis,
      customDays,
      rangeStart: rangeFrom,
      rangeEnd: rangeTo,
    });
  }, [currentSku, skuHistory, basis, customDays, rangeFrom, rangeTo]);

  // 执行诊断（决策树逻辑在 domain/diagnose.ts，保持不动）
  const diagnosis: DiagnosisOutput | null = useMemo(() => {
    if (!currentSku) return null;
    const key = snapKey(currentSku.sku, currentSiteId);
    const params = {
      sku: currentSku,
      latestSnap: comparison?.current,
      previousSnap: comparison?.previous,
      latestInv: latestInventory.get(key),
      config,
    };
    switch (diagType) {
      case "profit": return diagnoseProfitDecline(params);
      case "sales": return diagnoseSalesDecline(params);
      case "rating": return diagnoseRatingDecline(params);
      case "adRatio": return diagnoseAdRatioRise(params);
      default: return null;
    }
  }, [currentSku, comparison, latestInventory, config, diagType, currentSiteId]);

  const periodLabel = comparison
    ? `${comparison.currentLabel} vs ${comparison.previousLabel}`
    : "未选择对比区间";

  const setSku = (val: string) => {
    setSkuInput(val);
    setStepsOpen(false);
    const next = new URLSearchParams(searchParams);
    if (val) next.set("sku", val);
    else next.delete("sku");
    setSearchParams(next);
  };

  const setType = (t: DiagnosisType) => {
    setStepsOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set("type", t);
    setSearchParams(next);
  };

  const setBasis = (key: CompareBasis) => {
    setBasisState(key);
    const next = new URLSearchParams(searchParams);
    next.set("basis", key);
    if (key === "custom") next.set("days", String(customDays));
    if (key === "range") {
      const d = rangeFrom && rangeTo
        ? { from: rangeFrom, to: rangeTo }
        : defaultRange(latestHistoryDate || new Date().toISOString().slice(0, 10));
      next.set("from", d.from);
      next.set("to", d.to);
      setRangeFrom(d.from);
      setRangeTo(d.to);
    }
    setSearchParams(next);
  };

  /** 提交自定义天数（1-730），写入 URL 支持分享 */
  const commitCustomDays = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 730) {
      setCustomDaysInput(String(customDays));
      return;
    }
    const v = Math.round(n);
    setCustomDaysState(v);
    setCustomDaysInput(String(v));
    const next = new URLSearchParams(searchParams);
    next.set("basis", "custom");
    next.set("days", String(v));
    setBasisState("custom");
    setSearchParams(next);
  };

  /** 提交指定日期区间，写入 URL 支持分享 */
  const commitRange = (from: string, to: string) => {
    if (!from || !to) return;
    setRangeFrom(from);
    setRangeTo(to);
    const next = new URLSearchParams(searchParams);
    next.set("basis", "range");
    next.set("from", from);
    next.set("to", to);
    setBasisState("range");
    setSearchParams(next);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* 剪贴板不可用时忽略 */ }
  };

  if (loading) {
    return <div className="text-[13px] text-foreground-500">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 页头：返回 + SKU 身份 + 分享 */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/operations"
          className="inline-flex items-center gap-1 rounded-lg border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-arrow-left-line" aria-hidden />
          返回异常清单
        </Link>
        {currentSku && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-foreground-900">{currentSku.name}</span>
            <span className="mono-num text-[12px] text-foreground-500">{currentSku.sku}</span>
          </div>
        )}
        <button
          type="button"
          onClick={copyLink}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap"
          title="复制当前诊断链接，分享给同事后打开看到同一结论"
        >
          <i className={copied ? "ri-checkbox-circle-line text-accent-600" : "ri-links-line"} aria-hidden />
          {copied ? "已复制" : "复制诊断链接"}
        </button>
      </div>

      {/* 诊断类型切换 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
        {DIAG_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={[
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap",
              diagType === t
                ? "bg-primary-500 text-background-50"
                : "text-foreground-600 hover:text-foreground-900",
            ].join(" ")}
          >
            <i className={`${TYPE_META[t].icon} mr-1 text-[14px]`} aria-hidden />
            {TYPE_META[t].label}诊断
          </button>
        ))}
      </div>

      {/* 对比口径 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-foreground-600">
            <i className="ri-time-line mr-1 text-[14px] text-primary-600" aria-hidden />对比口径
          </span>
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
            {BASIS_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setBasis(o.key)}
                title={o.hint}
                className={[
                  "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                  basis === o.key
                    ? "bg-foreground-900 text-background-50"
                    : "text-foreground-600 hover:text-foreground-900",
                ].join(" ")}
              >
                {o.label}
              </button>
            ))}
            {basis === "custom" && (
              <span className="flex items-center gap-1 pl-1 pr-2 text-[12px] text-foreground-600">
                回看
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={customDaysInput}
                  onChange={(e) => {
                    setCustomDaysInput(e.target.value);
                    if (/^\d{1,3}$/.test(e.target.value) && Number(e.target.value) >= 1) commitCustomDays(e.target.value);
                  }}
                  onBlur={() => commitCustomDays(customDaysInput)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-14 rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-center text-[12px] text-foreground-800 focus:border-primary-500 focus:outline-none"
                />
                天
              </span>
            )}
            {basis === "range" && (
              <span className="flex flex-wrap items-center gap-1 pl-1 pr-2 text-[12px] text-foreground-600">
                <input
                  type="date"
                  value={rangeFrom}
                  max={rangeTo || undefined}
                  onChange={(e) => { const v = e.target.value; setRangeFrom(v); if (v && rangeTo) commitRange(v, rangeTo); }}
                  className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-[12px] text-foreground-800 focus:border-primary-500 focus:outline-none"
                />
                <span className="text-foreground-400">~</span>
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={(e) => { const v = e.target.value; setRangeTo(v); if (rangeFrom && v) commitRange(rangeFrom, v); }}
                  className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-[12px] text-foreground-800 focus:border-primary-500 focus:outline-none"
                />
              </span>
            )}
          </div>
          {currentSku && comparison && (
            <span className={`text-[11px] ${comparison.warning ? "text-amber-600" : "text-foreground-500"}`}>
              {comparison.warning ?? `本期 ${comparison.currentLabel} · 上期 ${comparison.previousLabel}`}
            </span>
          )}
        </div>
        <div className="text-[11px] leading-relaxed text-foreground-400">
          <i className="ri-information-line mr-1" aria-hidden />
          本期与上期都按「区间均值」对比，不是单日快照对单日快照：销量 / 费比 / 退货率 / 评分取区间内均值，库存 / 在途取区间最后一天，避免单日波动造成误报。
        </div>
      </div>

      {/* 未选 SKU：搜索 + 快速选择引导 */}
      {!currentSku && (
        <div className="space-y-4">
          <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
            <label className="mb-2 block text-[12px] font-medium text-foreground-700">输入要诊断的 SKU 或 MSKU</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={skuInput}
                onChange={(e) => setSku(e.target.value)}
                placeholder="如 BFRS258 或 MSKU 链接号"
                list="diagnosis-sku-list"
                className="flex-1 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[13px] text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              <datalist id="diagnosis-sku-list">
                {skuMaster.slice(0, 200).flatMap((s) => {
                  const opts = [<option key={s.sku} value={s.sku}>{s.name}</option>];
                  if (s.msku && s.msku !== s.sku) {
                    opts.push(<option key={`${s.sku}-msku`} value={s.msku}>{s.name}（MSKU）</option>);
                  }
                  return opts;
                })}
              </datalist>
              {skuInput && (
                <button
                  type="button"
                  onClick={() => setSku("")}
                  className="rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-close-line" aria-hidden /> 清除
                </button>
              )}
            </div>
            {skuInput && !currentSku && (
              <div className="mt-2 text-[12px] text-red-600">
                <i className="ri-error-warning-line mr-1" aria-hidden />
                未找到 SKU「{skuInput}」，请检查输入或前往数据导入页确认
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6 text-center">
            <i className="ri-clipboard-line text-4xl text-foreground-300" aria-hidden />
            <p className="mt-3 text-[14px] font-medium text-foreground-700">从异常清单点「诊断」进入归因分析</p>
            <p className="mt-1 text-[12px] text-foreground-500">
              先在上方 7 类异常清单里看到「哪些 SKU 有问题」，再点对应行的「诊断」下钻到「为什么有问题」；也可直接在上方输入 SKU
            </p>
          </div>
        </div>
      )}

      {/* 诊断结果 */}
      {currentSku && diagnosis && (
        <DiagnosisResultView result={diagnosis} stepsOpen={stepsOpen} onToggleSteps={() => setStepsOpen((v) => !v)} />
      )}

      {/* 诊断备注（留痕） */}
      {currentSku && (
        <DiagnosisNotesPanel
          sku={currentSku.sku}
          skuName={currentSku.name}
          anomalyType={diagType}
          periodLabel={comparison ? periodLabel : undefined}
          notes={notes}
        />
      )}
    </div>
  );
}

/* ────────── 诊断结果：归因结论大字置顶，过程默认折叠 ────────── */
function DiagnosisResultView({
  result, stepsOpen, onToggleSteps,
}: {
  result: DiagnosisOutput;
  stepsOpen: boolean;
  onToggleSteps: () => void;
}) {
  if (!result.hasHistory) {
    return (
      <div className="rounded-2xl border border-secondary-200 bg-secondary-50/60 p-6">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-secondary-800">
          <i className="ri-error-warning-line text-[18px]" aria-hidden />
          {result.reason}
        </div>
        <p className="mt-2 text-[13px] text-foreground-600">
          缺少可对比的基线快照，无法诊断。可切换「对比口径」重试；「本次 vs 上次导入」需至少导入两次数据，「近7/30天环比」需要该时间范围前存在导入快照。
        </p>
        <Link
          to="/import"
          className="mt-3 inline-block rounded-lg bg-primary-500 px-4 py-2 text-[12px] font-medium text-white hover:bg-primary-600"
        >
          前往数据导入
        </Link>
      </div>
    );
  }

  const benign = isBenignReason(result.reason);
  const cardCls = benign
    ? "border-emerald-200/70 bg-emerald-50/40"
    : "border-red-200/70 bg-red-50/40";
  const titleCls = benign ? "text-emerald-700" : "text-red-600";
  const tagCls = benign
    ? "bg-emerald-100 text-emerald-700"
    : "bg-red-100 text-red-700";

  return (
    <div className="space-y-4">
      {/* 归因结论（大字置顶） */}
      <div className={`rounded-2xl border p-6 ${cardCls}`}>
        <div className="flex items-center gap-2">
          <i className={benign ? "ri-shield-check-line text-[16px] text-emerald-600" : "ri-alarm-warning-line text-[16px] text-red-600"} aria-hidden />
          <span className={`text-[11px] font-bold tracking-[0.12em] ${titleCls}`}>
            {benign ? "诊断结论 · 未见异常" : "归因结论"}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tagCls}`}>
            {TYPE_META[result.anomalyType].label}
          </span>
        </div>
        <div className="mt-2 text-[24px] font-bold leading-snug text-foreground-950">
          {result.reason}
        </div>
        <div className="mt-2 text-[13px] font-medium text-foreground-700">{result.summary}</div>
        {result.evidence.length > 0 && (
          <ul className="mt-3 space-y-1">
            {result.evidence.map((e, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[12px] text-foreground-600">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${benign ? "bg-emerald-500" : "bg-red-400"}`} aria-hidden />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 建议动作 */}
      {result.suggestions.length > 0 && (
        <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-5">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-primary-900">
            <i className="ri-checkbox-circle-line text-[16px] text-primary-700" aria-hidden />
            建议动作
          </h3>
          <ul className="mt-3 space-y-1.5">
            {result.suggestions.map((s, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[13px] text-foreground-700">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
                  {idx + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 诊断过程（默认折叠） */}
      {result.steps.length > 0 && (
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-5">
          <button
            type="button"
            onClick={onToggleSteps}
            className="flex w-full items-center gap-2 text-left cursor-pointer"
            aria-expanded={stepsOpen}
          >
            <i className="ri-flow-chart text-[16px] text-primary-600" aria-hidden />
            <span className="text-[14px] font-semibold text-foreground-900">诊断过程 · {result.steps.length} 步对比</span>
            <span className="text-[11px] text-foreground-400">{stepsOpen ? "" : "（默认收起，点开查看每步对比）"}</span>
            <i className={`${stepsOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} ml-auto text-[18px] text-foreground-400`} aria-hidden />
          </button>
          {stepsOpen && (
            <div className="mt-3 space-y-2">
              {result.steps.map((step, idx) => (
                <div
                  key={idx}
                  className={[
                    "flex items-start gap-3 rounded-lg border px-3 py-2 text-[13px]",
                    step.hit
                      ? "border-red-200 bg-red-50/60"
                      : "border-background-200 bg-background-100/40",
                  ].join(" ")}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background-200 text-[11px] font-bold text-foreground-600">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground-900">{step.checkName}</span>
                      <span className="text-foreground-600">
                        {step.before} → {step.after}
                        {step.delta != null && (
                          <span className={`ml-1 ${step.delta > 0 ? "text-red-600" : step.delta < 0 ? "text-accent-600" : "text-foreground-500"}`}>
                            ({step.delta > 0 ? "+" : ""}{step.delta.toFixed(1)}{step.unit})
                          </span>
                        )}
                      </span>
                      {step.hit ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          ✗ 命中
                        </span>
                      ) : (
                        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-bold text-accent-700">
                          ✓ 未命中
                        </span>
                      )}
                    </div>
                    {step.note && (
                      <div className="mt-0.5 text-[12px] text-foreground-500">{step.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 跳转 */}
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/sku/${encodeURIComponent(result.sku)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-arrow-left-right-line" aria-hidden />
          查看 SKU 详情
        </Link>
      </div>
    </div>
  );
}

/* ────────── 诊断备注（留痕） ────────── */

function DiagnosisNotesPanel({
  sku, skuName, anomalyType, periodLabel, notes,
}: {
  sku: string;
  skuName?: string;
  anomalyType: DiagnosisType;
  periodLabel?: string;
  notes: DiagnosisNote[];
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const list = useMemo(
    () => notes.filter((n) => n.sku === sku && n.anomalyType === anomalyType),
    [notes, sku, anomalyType],
  );

  const submit = async () => {
    const content = draft.trim();
    if (!content) {
      setError("请先填写备注内容");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addDiagnosisNote({ sku, skuName, anomalyType, content, periodLabel });
      setDraft("");
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("删除这条备注？")) return;
    try {
      await deleteDiagnosisNote(id);
    } catch {
      setError("删除失败，请重试");
    }
  };

  return (
    <div className="rounded-2xl border border-accent-200/70 bg-accent-50/30 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground-900">
          <i className="ri-sticky-note-line text-[16px] text-accent-600" aria-hidden />
          诊断备注 · 留痕
        </h3>
        <span className="rounded-full border border-accent-200 bg-accent-50 px-2 py-0.5 text-[10px] font-medium text-accent-700">
          {TYPE_META[anomalyType].label}
        </span>
        <span className="text-[11px] text-foreground-500">共 {list.length} 条</span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-foreground-500">
        记录这段时间做了什么（调价 / 加广告 / 改主图 / 断货 / 秒杀…），下次回看异常时能直接对上原因。
      </p>

      <div className="mt-3">
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(""); }}
          rows={2}
          placeholder="例：10/15 起 LD 折扣从 15% 调到 25%，同时 SB 广告加到 $50/天"
          className="w-full resize-y rounded-lg border border-background-300/70 bg-background-50 px-3 py-2 text-[13px] text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-primary-600 disabled:opacity-60 cursor-pointer"
          >
            <i className="ri-save-line" aria-hidden />
            {saving ? "保存中..." : "保存备注"}
          </button>
          {periodLabel && (
            <span className="text-[11px] text-foreground-400">
              自动附带当前口径：{periodLabel}
            </span>
          )}
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </div>
      </div>

      {list.length > 0 && (
        <ul className="mt-4 space-y-2">
          {list.map((n) => (
            <li key={n.id} className="rounded-lg border border-background-200/70 bg-background-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono-num text-[11px] text-foreground-400">{fmtNoteTime(n.createdAt)}</span>
                {n.updatedAt && <span className="text-[10px] text-foreground-300">已编辑</span>}
                {n.periodLabel && (
                  <span className="rounded-full bg-background-100 px-2 py-0.5 text-[10px] text-foreground-500">
                    {n.periodLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] text-foreground-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                  title="删除备注"
                >
                  <i className="ri-delete-bin-6-line" aria-hidden />
                </button>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground-700">{n.content}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
