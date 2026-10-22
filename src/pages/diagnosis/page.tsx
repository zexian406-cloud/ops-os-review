import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
import { ALERT_TYPE_LABELS, ALERT_TYPE_TO_DIAG } from "@/domain/types";
import type { Alert, AlertType, DailySnapshot, DiagnosisNote, DiagnosisType, SkuMaster } from "@/domain/types";

type DiagTab = DiagnosisType;
type TabKey = "overview" | DiagTab;

const TABS: Array<{ key: DiagTab; label: string; icon: string }> = [
  { key: "profit", label: "利润下降诊断", icon: "ri-money-dollar-circle-line" },
  { key: "sales", label: "销量下降诊断", icon: "ri-bar-chart-line" },
  { key: "rating", label: "评分下降诊断", icon: "ri-star-half-line" },
  { key: "adRatio", label: "费比上升诊断", icon: "ri-funds-line" },
];

const TAB_LABELS: Record<DiagTab, string> = {
  profit: "利润下降",
  sales: "销量下降",
  rating: "评分下降",
  adRatio: "费比上升",
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

export default function DiagnosisPage() {
  const { currentSiteId, skuMaster, latestInventory, config, alerts, loading } = useOpsData();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = (searchParams.get("type") ?? "overview") as TabKey;
  const skuParam = searchParams.get("sku") ?? "";
  const basisParam = searchParams.get("basis");
  const daysParam = Number(searchParams.get("days") ?? "30");
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";

  const [skuInput, setSkuInput] = useState(skuParam);
  const [activeTab, setActiveTab] = useState<TabKey>(
    TABS.some((t) => t.key === type) || type === "overview" ? type : "overview",
  );
  const [basis, setBasisState] = useState<CompareBasis>(isBasis(basisParam) ? basisParam : "import");
  // 自定义天数（1-730），输入框用字符串过渡避免输入中间态被强转
  const [customDays, setCustomDaysState] = useState<number>(
    Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 730 ? Math.round(daysParam) : 30,
  );
  const [customDaysInput, setCustomDaysInput] = useState(String(customDays));
  const [rangeFrom, setRangeFrom] = useState(fromParam);
  const [rangeTo, setRangeTo] = useState(toParam);

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

  // 诊断备注：概览列表、各诊断 Tab、结果面板共用一份
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
    if (TABS.some((t) => t.key === type) || type === "overview") setActiveTab(type);
    if (isBasis(basisParam)) setBasisState(basisParam);
    if (Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 730) {
      setCustomDaysState(Math.round(daysParam));
      setCustomDaysInput(String(Math.round(daysParam)));
    }
    if (fromParam) setRangeFrom(fromParam);
    if (toParam) setRangeTo(toParam);
  }, [skuParam, type, basisParam, daysParam, fromParam, toParam]);

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

  // 执行诊断
  const diagnosis: DiagnosisOutput | null = useMemo(() => {
    if (!currentSku || activeTab === "overview") return null;
    const key = snapKey(currentSku.sku, currentSiteId);
    const params = {
      sku: currentSku,
      latestSnap: comparison?.current,
      previousSnap: comparison?.previous,
      latestInv: latestInventory.get(key),
      config,
    };
    switch (activeTab) {
      case "profit": return diagnoseProfitDecline(params);
      case "sales": return diagnoseSalesDecline(params);
      case "rating": return diagnoseRatingDecline(params);
      case "adRatio": return diagnoseAdRatioRise(params);
      default: return null;
    }
  }, [currentSku, comparison, latestInventory, config, activeTab, currentSiteId]);

  const setTab = (key: TabKey) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set("type", key);
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
      setCustomDaysInput(String(customDays)); // 非法输入回滚为当前生效值
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

  const setSku = (val: string) => {
    setSkuInput(val);
    const next = new URLSearchParams(searchParams);
    if (val) next.set("sku", val);
    else next.delete("sku");
    setSearchParams(next);
  };

  const periodLabel = comparison
    ? `${comparison.currentLabel} vs ${comparison.previousLabel}`
    : "未选择对比区间";

  /** 从问题总览跳到单品诊断时携带的口径参数，保持对比区间一致 */
  const diagQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("basis", basis);
    if (basis === "custom") p.set("days", String(customDays));
    if (basis === "range" && rangeFrom && rangeTo) {
      p.set("from", rangeFrom);
      p.set("to", rangeTo);
    }
    return p.toString();
  }, [basis, customDays, rangeFrom, rangeTo]);

  if (loading) {
    return <div className="text-[13px] text-foreground-500">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <i className="ri-search-eye-line text-xl" />
        </div>
        <div>
          <h1 className="font-heading text-[26px] font-bold text-foreground-950">异常诊断</h1>
          <p className="text-[13px] text-foreground-500">
            基于预设规则的根因分析 · {activeTab === "overview" ? "全站扫描汇总" : basisLabel(basis, customDays)}
          </p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
        <button
          type="button"
          onClick={() => setTab("overview")}
          title="全量扫描所有 SKU 的本次 vs 上次导入对比，汇总哪些 SKU 有问题"
          className={[
            "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap",
            activeTab === "overview"
              ? "bg-primary-500 text-background-50"
              : "text-foreground-600 hover:text-foreground-900",
          ].join(" ")}
        >
          <i className="ri-dashboard-3-line mr-1 text-[14px]" aria-hidden />
          问题总览
          {alerts.length > 0 && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === "overview" ? "bg-background-50/25 text-background-50" : "bg-red-100 text-red-600"}`}>
              {alerts.length}
            </span>
          )}
        </button>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap",
              activeTab === t.key
                ? "bg-primary-500 text-background-50"
                : "text-foreground-600 hover:text-foreground-900",
            ].join(" ")}
          >
            <i className={`${t.icon} mr-1 text-[14px]`} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* 对比口径（时间维度，仅单品诊断需要） */}
      {activeTab !== "overview" && (
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
      )}

      {/* 主体：问题总览 / 单品诊断 */}
      {activeTab === "overview" ? (
        <OverviewPanel alerts={alerts} skuMaster={skuMaster} notes={notes} diagQuery={diagQuery} />
      ) : (
      <>
      {/* 该类问题清单：问题总览按类型分流到四个诊断 Tab */}
      <AlertsPanel
        alerts={alerts}
        skuMaster={skuMaster}
        notes={notes}
        diagFilter={activeTab}
        diagQuery={diagQuery}
        onPickSku={setSku}
        limit={5}
      />

      {/* SKU 搜索 */}
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
        {currentSku && (
          <div className="mt-2 text-[12px] text-foreground-600">
            <i className="ri-checkbox-circle-line mr-1 text-accent-600" aria-hidden />
            已选中：{currentSku.sku} · {currentSku.name} · {currentSku.store}
          </div>
        )}
      </div>

      {/* 诊断结果 */}
      {diagnosis && <DiagnosisResultView result={diagnosis} />}

      {/* 诊断备注（留痕） */}
      {currentSku && (
        <DiagnosisNotesPanel
          sku={currentSku.sku}
          skuName={currentSku.name}
          anomalyType={activeTab}
          periodLabel={comparison ? periodLabel : undefined}
          notes={notes}
        />
      )}

      {/* 无 SKU 输入时的引导 */}
      {!currentSku && (
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6">
          <div className="text-center py-8">
            <i className="ri-clipboard-line text-4xl text-foreground-300" />
            <p className="mt-3 text-[14px] font-medium text-foreground-700">输入 SKU 开始诊断</p>
            <p className="mt-1 text-[12px] text-foreground-500">
              诊断逻辑基于预设规则决策树，对比本次与上次导入的快照数据，自动定位利润/销量下降的根因
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {skuMaster.slice(0, 8).map((s) => (
                <button
                  key={s.sku}
                  type="button"
                  onClick={() => setSku(s.sku)}
                  className="rounded-full border border-background-300/70 bg-background-100 px-3 py-1 text-[12px] text-foreground-700 hover:bg-background-200 cursor-pointer transition-colors whitespace-nowrap"
                >
                  {s.sku}
                </button>
              ))}
            </div>
            {skuMaster.length > 8 && (
              <div className="mt-2 text-[11px] text-foreground-400">
                共 {skuMaster.length} 个 SKU，可在上方输入框中搜索
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ────────── 问题清单（问题总览 / 四个诊断 Tab 分流共用） ────────── */

const SEVERITY_ORDER: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };

const severityBadge: Record<Alert["severity"], { label: string; badgeCls: string }> = {
  critical: { label: "严重", badgeCls: "bg-red-50 text-red-600 border-red-200" },
  warning: { label: "警告", badgeCls: "bg-secondary-100/60 text-secondary-700 border-secondary-200" },
  info: { label: "提示", badgeCls: "bg-background-100 text-foreground-500 border-background-300" },
};

const selectCls =
  "rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer";

const diagBtnCls =
  "ml-auto inline-flex items-center gap-1 rounded-full border border-primary-300/70 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 cursor-pointer whitespace-nowrap transition-colors";

const fmtNoteTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface AlertsPanelProps {
  alerts: Alert[];
  skuMaster: SkuMaster[];
  notes: DiagnosisNote[];
  /** 传入后只显示映射到该诊断类型的问题（问题总览分流到四个诊断 Tab） */
  diagFilter?: DiagTab;
  /** 跳转诊断 Tab 时携带的对比口径参数 */
  diagQuery: string;
  /** 传入后「去诊断」在当前页切换 SKU，而不是跳转 */
  onPickSku?: (sku: string) => void;
  /** 收起时最多展示条数，超出显示「还有 N 条」 */
  limit?: number;
}

function AlertsPanel({
  alerts, skuMaster, notes, diagFilter, diagQuery, onPickSku, limit,
}: AlertsPanelProps) {
  const [typeFilter, setTypeFilter] = useState<"all" | AlertType>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"severity" | "type" | "sku">("severity");

  // 告警不带店铺信息，从 SKU 主档关联
  const storeMap = useMemo(() => new Map(skuMaster.map((s) => [s.sku, s.store])), [skuMaster]);
  const storeOptions = useMemo(
    () => [...new Set(skuMaster.map((s) => s.store).filter(Boolean))].sort(),
    [skuMaster],
  );

  // 分流：只看映射到当前诊断类型的问题
  const scoped = useMemo(
    () => (diagFilter ? alerts.filter((a) => ALERT_TYPE_TO_DIAG[a.type] === diagFilter) : alerts),
    [alerts, diagFilter],
  );
  const presentTypes = useMemo(() => [...new Set(scoped.map((a) => a.type))], [scoped]);

  const notesBySku = useMemo(() => {
    const map = new Map<string, DiagnosisNote[]>();
    for (const n of notes) {
      if (diagFilter && n.anomalyType !== diagFilter) continue;
      const arr = map.get(n.sku) ?? [];
      arr.push(n);
      map.set(n.sku, arr);
    }
    return map;
  }, [notes, diagFilter]);

  const visible = useMemo(() => {
    let list = scoped.filter((a) => typeFilter === "all" || a.type === typeFilter);
    if (storeFilter !== "all") list = list.filter((a) => storeMap.get(a.sku) === storeFilter);
    return [...list].sort((x, y) => {
      if (sortBy === "sku") return x.sku.localeCompare(y.sku);
      if (sortBy === "type") return ALERT_TYPE_LABELS[x.type].localeCompare(ALERT_TYPE_LABELS[y.type]);
      return SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity];
    });
  }, [scoped, typeFilter, storeFilter, sortBy, storeMap]);

  const shown = limit != null ? visible.slice(0, limit) : visible;

  const counts = {
    critical: scoped.filter((a) => a.severity === "critical").length,
    warning: scoped.filter((a) => a.severity === "warning").length,
    info: scoped.filter((a) => a.severity === "info").length,
  };

  if (scoped.length === 0) {
    return (
      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6 text-center">
        <i className="ri-shield-check-line text-4xl text-emerald-500" aria-hidden />
        <p className="mt-3 text-[14px] font-medium text-foreground-700">
          {diagFilter ? `本类（${TAB_LABELS[diagFilter]}）暂无问题项` : "未发现问题项"}
        </p>
        <p className="mt-1 text-[12px] text-foreground-500">
          {diagFilter
            ? "问题总览里没有映射到该诊断类型的告警；可在下方直接输入 SKU 做深度诊断"
            : "当前站点所有 SKU 的本次 vs 上次导入对比均正常；可切上方诊断 Tab 对单个 SKU 深度诊断"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 分流说明（仅四个诊断 Tab） */}
      {diagFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-foreground-700">
            <i className="ri-git-branch-line mr-1 text-primary-600" aria-hidden />
            本类问题清单 · {scoped.length} 条
          </span>
          <span className="text-[11px] text-foreground-400">
            来自问题总览中映射到「{TAB_LABELS[diagFilter]}」的告警，点 SKU 直接切换诊断对象
          </span>
        </div>
      )}

      {/* 统计条 + 筛选排序 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-600">严重 {counts.critical}</span>
          <span className="rounded-full border border-secondary-200 bg-secondary-50 px-2.5 py-0.5 text-[11px] font-bold text-secondary-700">警告 {counts.warning}</span>
          {counts.info > 0 && (
            <span className="rounded-full border border-background-300 bg-background-100 px-2.5 py-0.5 text-[11px] font-bold text-foreground-500">提示 {counts.info}</span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
          {presentTypes.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className={selectCls}
              aria-label="筛选问题类型"
            >
              <option value="all">全部类型</option>
              {presentTypes.map((t) => (
                <option key={t} value={t}>{ALERT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          )}
          {storeOptions.length > 1 && (
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
          )}
        </div>
      </div>

      {/* 问题清单 */}
      {visible.length === 0 ? (
        <div className="rounded-[16px] border border-background-200 bg-background-50 p-4 text-center text-[13px] text-foreground-500">
          当前筛选条件下没有问题项，试试切换类型或店铺
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((a) => {
            const cfg = severityBadge[a.severity];
            const diagType = ALERT_TYPE_TO_DIAG[a.type];
            const store = storeMap.get(a.sku);
            const rowNotes = notesBySku.get(a.sku) ?? [];
            const latestNote = rowNotes[0];
            return (
              <div
                key={a.id}
                className="rounded-[16px] border border-background-200/70 bg-background-50 p-4 transition-colors hover:border-background-300"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-[13px] font-semibold text-foreground-800">{ALERT_TYPE_LABELS[a.type]}</span>
                  <span className="mono-num text-[13px] font-bold text-foreground-900">{a.detail}</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${cfg.badgeCls}`}>
                    {cfg.label}
                  </span>
                  <span className="text-[12px] text-foreground-500">
                    <Link to={`/sku/${encodeURIComponent(a.sku)}`} className="font-medium text-foreground-600 hover:text-foreground-900 hover:underline cursor-pointer">
                      [{a.sku}]
                    </Link>
                    {a.skuName && ` ${a.skuName}`}
                    {store && ` · ${store}`}
                  </span>
                  {rowNotes.length > 0 && (
                    <span
                      className="rounded-full border border-accent-200 bg-accent-50 px-2 py-0.5 text-[10px] font-medium text-accent-700"
                      title={latestNote?.content}
                    >
                      <i className="ri-sticky-note-line mr-0.5" aria-hidden />备注 {rowNotes.length}
                    </span>
                  )}
                  {diagType && (
                    onPickSku ? (
                      <button type="button" onClick={() => onPickSku(a.sku)} className={diagBtnCls}>
                        <i className="ri-search-eye-line text-[12px]" aria-hidden />
                        去诊断
                      </button>
                    ) : (
                      <Link
                        to={`/diagnosis?type=${diagType}&sku=${encodeURIComponent(a.sku)}&${diagQuery}`}
                        className={diagBtnCls}
                      >
                        <i className="ri-search-eye-line text-[12px]" aria-hidden />
                        去诊断
                      </Link>
                    )
                  )}
                </div>
                {a.suggestion && (
                  <div className="mt-1.5 text-[12px] leading-relaxed text-foreground-500">{a.suggestion}</div>
                )}
                {latestNote && (
                  <div className="mt-1.5 rounded-lg border border-accent-200/60 bg-accent-50/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-accent-800">
                    <i className="ri-sticky-note-line mr-1" aria-hidden />
                    留痕：{latestNote.content}
                    <span className="ml-1 text-accent-600/70">（{fmtNoteTime(latestNote.createdAt)}）</span>
                  </div>
                )}
              </div>
            );
          })}
          {limit != null && visible.length > limit && (
            <div className="text-center text-[11px] text-foreground-400">
              还有 {visible.length - limit} 条未显示，可在问题总览查看完整清单
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────── 问题总览（全量扫描汇总） ────────── */

function OverviewPanel(props: Omit<AlertsPanelProps, "diagFilter" | "onPickSku" | "limit">) {
  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 px-4 py-3 text-[12px] leading-relaxed text-foreground-600">
        <i className="ri-git-branch-line mr-1 text-primary-600" aria-hidden />
        问题总览按类型分流到四个诊断 Tab：利润异常 → 利润下降诊断；断货 / 库存类 → 销量下降诊断；评分 / 退货 / 差评 → 评分下降诊断；广告异常 → 费比上升诊断。点「去诊断」会沿用当前对比口径。
      </div>
      <AlertsPanel {...props} />
    </div>
  );
}

/* ────────── 诊断结果展示 ────────── */
function DiagnosisResultView({ result }: { result: DiagnosisOutput }) {
  if (!result.hasHistory) {
    return (
      <div className="rounded-2xl border border-secondary-200 bg-secondary-50/60 p-6">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-secondary-800">
          <i className="ri-error-warning-line text-[18px]" aria-hidden />
          {result.reason}
        </div>
        <p className="mt-2 text-[13px] text-foreground-600">
          缺少可对比的基线快照，无法诊断。可切换上方「对比口径」重试；「本次 vs 上次导入」需至少导入两次数据，「近7/30天环比」需要该时间范围前存在导入快照。
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

  const tone = result.anomalyType === "profit" ? "text-red-600" : "text-secondary-700";

  return (
    <div className="space-y-4">
      {/* 异常概要 */}
      <div className="rounded-2xl border border-red-200/70 bg-red-50/40 p-5">
        <div className="flex items-center gap-2">
          <i className="ri-alarm-warning-line text-[20px] text-red-600" aria-hidden />
          <h2 className={`text-[16px] font-bold ${tone}`}>{result.summary}</h2>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[13px]">
          <span className="text-foreground-600">主要病因：</span>
          <span className="font-semibold text-foreground-900">{result.reason}</span>
        </div>
      </div>

      {/* 诊断过程（决策树每一层检查） */}
      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-5">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground-900">
          <i className="ri-flow-chart text-[16px] text-primary-600" aria-hidden />
          诊断过程
        </h3>
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
                <div className="flex items-center gap-2">
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
      </div>

      {/* 主要病因 + 证据 */}
      {result.evidence.length > 0 && (
        <div className="rounded-2xl border border-background-200/70 bg-background-50 p-5">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground-900">
            <i className="ri-lightbulb-line text-[16px] text-accent-600" aria-hidden />
            主要病因与证据
          </h3>
          <ul className="mt-3 space-y-1.5">
            {result.evidence.map((e, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[13px] text-foreground-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {/* 跳转链接 */}
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/sku/${encodeURIComponent(result.sku)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-arrow-left-right-line" aria-hidden />
          查看 SKU 详情
        </Link>
        <Link
          to="/risk"
          className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[12px] font-medium text-foreground-700 hover:bg-background-100 cursor-pointer whitespace-nowrap"
        >
          <i className="ri-error-warning-line" aria-hidden />
          返回风险中心
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
  anomalyType: DiagTab;
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
          {TAB_LABELS[anomalyType]}
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
