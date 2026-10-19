import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { snapKey } from "@/domain/engine";
import {
  diagnoseProfitDecline,
  diagnoseSalesDecline,
  diagnoseRatingDecline,
  diagnoseAdRatioRise,
  type DiagnosisOutput,
} from "@/domain/diagnose";
import { ALERT_TYPE_LABELS, ALERT_TYPE_TO_DIAG } from "@/domain/types";
import type { Alert, AlertType, DailySnapshot, SkuMaster } from "@/domain/types";

type DiagTab = "profit" | "sales" | "rating" | "adRatio";
type TabKey = "overview" | DiagTab;

const TABS: Array<{ key: DiagTab; label: string; icon: string }> = [
  { key: "profit", label: "利润下降诊断", icon: "ri-money-dollar-circle-line" },
  { key: "sales", label: "销量下降诊断", icon: "ri-bar-chart-line" },
  { key: "rating", label: "评分下降诊断", icon: "ri-star-half-line" },
  { key: "adRatio", label: "费比上升诊断", icon: "ri-funds-line" },
];

type Basis = "import" | "7d" | "14d" | "30d" | "custom";

const BASIS_OPTIONS: Array<{ key: Basis; label: string }> = [
  { key: "import", label: "本次 vs 上次导入" },
  { key: "7d", label: "近7天环比" },
  { key: "14d", label: "近14天环比" },
  { key: "30d", label: "近30天环比" },
  { key: "custom", label: "自定义天数" },
];

/** 各口径对应的回看天数（import 无固定天数） */
const daysOfBasis = (basis: Basis, customDays: number): number =>
  basis === "7d" ? 7 : basis === "14d" ? 14 : basis === "30d" ? 30 : basis === "custom" ? Math.max(1, Math.round(customDays)) : 0;

const basisLabelOf = (basis: Basis, days: number): string =>
  basis === "import" ? "本次 vs 上次导入" : `近${days}天环比`;

/** 本地日期加减天数（YYYY-MM-DD），避免 toISOString 的 UTC 偏移 */
const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

export default function DiagnosisPage() {
  const { currentSiteId, skuMaster, snapshots, latestSnapshot, previousSnapshot, latestInventory, config, alerts, loading } = useOpsData();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = (searchParams.get("type") ?? "overview") as TabKey;
  const skuParam = searchParams.get("sku") ?? "";
  const basisParam = (searchParams.get("basis") ?? "import") as Basis;
  const daysParam = Number(searchParams.get("days") ?? "90");

  const [skuInput, setSkuInput] = useState(skuParam);
  const [activeTab, setActiveTab] = useState<TabKey>(
    TABS.some((t) => t.key === type) || type === "overview" ? type : "overview",
  );
  const [basis, setBasisState] = useState<Basis>(
    BASIS_OPTIONS.some((o) => o.key === basisParam) ? basisParam : "import",
  );
  // 自定义天数（1-730），输入框用字符串过渡避免输入中间态被强转
  const [customDays, setCustomDaysState] = useState<number>(
    Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 730 ? Math.round(daysParam) : 90,
  );
  const [customDaysInput, setCustomDaysInput] = useState(String(customDays));

  // 同步 URL 参数到本地状态（浏览器后退/分享链接打开时保持一致）
  useEffect(() => {
    if (skuParam) setSkuInput(skuParam);
    if (TABS.some((t) => t.key === type) || type === "overview") setActiveTab(type);
    if (BASIS_OPTIONS.some((o) => o.key === basisParam)) setBasisState(basisParam);
    if (Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 730) {
      setCustomDaysState(Math.round(daysParam));
      setCustomDaysInput(String(Math.round(daysParam)));
    }
  }, [skuParam, type, basisParam, daysParam]);

  // 当前选中的 SKU 对象
  const currentSku = useMemo(() => {
    if (!skuInput.trim()) return null;
    return skuMaster.find((s) => s.sku === skuInput.trim()) ?? null;
  }, [skuMaster, skuInput]);

  // 时间维度下的基线快照：目标日期 = 最新快照日期 - N 天，取 ≤ 目标日期中最近的一条
  const baselineInfo = useMemo<{ snap?: DailySnapshot; label: string }>(() => {
    if (basis === "import") return { label: "上次导入" };
    const days = daysOfBasis(basis, customDays);
    const basisLabel = basisLabelOf(basis, days);
    const key = snapKey(skuInput.trim(), currentSiteId);
    const latestSnap = latestSnapshot.get(key);
    if (!latestSnap) return { label: `${basisLabel} · 无快照` };
    const target = shiftDate(latestSnap.date, -days);
    let prior: DailySnapshot | undefined;
    for (const s of snapshots) {
      if (s.sku === currentSku?.sku && s.date <= target && (!prior || s.date > prior.date)) prior = s;
    }
    return prior
      ? { snap: prior, label: `${basisLabel} · 基线 ${prior.date}` }
      : { label: `${basisLabel} · 目标基线 ${target} 前无快照` };
  }, [basis, skuInput, currentSku, currentSiteId, snapshots, latestSnapshot, customDays]);

  // 执行诊断
  const diagnosis: DiagnosisOutput | null = useMemo(() => {
    if (!currentSku || activeTab === "overview") return null;
    const key = snapKey(currentSku.sku, currentSiteId);
    const params = {
      sku: currentSku,
      latestSnap: latestSnapshot.get(key),
      previousSnap: basis === "import" ? previousSnapshot?.get(key) : baselineInfo.snap,
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
  }, [currentSku, latestSnapshot, previousSnapshot, latestInventory, config, activeTab, basis, baselineInfo]);

  const setTab = (key: TabKey) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set("type", key);
    setSearchParams(next);
  };

  const setBasis = (key: Basis) => {
    setBasisState(key);
    const next = new URLSearchParams(searchParams);
    next.set("basis", key);
    if (key === "custom") next.set("days", String(customDays));
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

  const setSku = (val: string) => {
    setSkuInput(val);
    const next = new URLSearchParams(searchParams);
    if (val) next.set("sku", val);
    else next.delete("sku");
    setSearchParams(next);
  };

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
            基于预设规则的根因分析 · {basis === "import" ? "对比本次与上次导入数据" : `近${daysOfBasis(basis, customDays)}天环比口径`}
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
              title={o.key === "import" ? "对比最新导入批次与上一次导入批次" : `以最新快照为终点，与 ${o.key === "custom" ? "自定义 N" : String(daysOfBasis(o.key, 0))} 天前的快照对比（自动取 ≤ 目标日期的最近快照）`}
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
        </div>
        {currentSku && basis !== "import" && (
          <span className={`text-[11px] ${baselineInfo.snap ? "text-foreground-500" : "text-amber-600"}`}>
            {baselineInfo.label}
          </span>
        )}
      </div>
      )}

      {/* 主体：问题总览 / 单品诊断 */}
      {activeTab === "overview" ? (
        <OverviewPanel alerts={alerts} skuMaster={skuMaster} />
      ) : (
      <>
      {/* SKU 搜索 */}
      <div className="rounded-[14px] border border-background-200/70 bg-background-100/50 p-4">
        <label className="mb-2 block text-[12px] font-medium text-foreground-700">输入要诊断的 SKU</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={skuInput}
            onChange={(e) => setSku(e.target.value)}
            placeholder="如 BFRS258"
            list="diagnosis-sku-list"
            className="flex-1 rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-[13px] text-foreground-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <datalist id="diagnosis-sku-list">
            {skuMaster.slice(0, 200).map((s) => (
              <option key={s.sku} value={s.sku}>
                {s.name}
              </option>
            ))}
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

/* ────────── 问题总览（全量扫描汇总） ────────── */

const SEVERITY_ORDER: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };

const severityBadge: Record<Alert["severity"], { label: string; badgeCls: string }> = {
  critical: { label: "严重", badgeCls: "bg-red-50 text-red-600 border-red-200" },
  warning: { label: "警告", badgeCls: "bg-secondary-100/60 text-secondary-700 border-secondary-200" },
  info: { label: "提示", badgeCls: "bg-background-100 text-foreground-500 border-background-300" },
};

const selectCls =
  "rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer";

function OverviewPanel({ alerts, skuMaster }: { alerts: Alert[]; skuMaster: SkuMaster[] }) {
  const [typeFilter, setTypeFilter] = useState<"all" | AlertType>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"severity" | "type" | "sku">("severity");

  // 告警不带店铺信息，从 SKU 主档关联
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

  const counts = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-background-200/70 bg-background-50 p-6 text-center">
        <i className="ri-shield-check-line text-4xl text-emerald-500" aria-hidden />
        <p className="mt-3 text-[14px] font-medium text-foreground-700">未发现问题项</p>
        <p className="mt-1 text-[12px] text-foreground-500">
          当前站点所有 SKU 的本次 vs 上次导入对比均正常；可切上方诊断 Tab 对单个 SKU 深度诊断
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        </div>
      </div>

      {/* 问题清单 */}
      {visible.length === 0 ? (
        <div className="rounded-[16px] border border-background-200 bg-background-50 p-4 text-center text-[13px] text-foreground-500">
          当前筛选条件下没有问题项，试试切换类型或店铺
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((a) => {
            const cfg = severityBadge[a.severity];
            const diagType = ALERT_TYPE_TO_DIAG[a.type];
            const store = storeMap.get(a.sku);
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
                    {store && ` · ${store}`}
                  </span>
                  {diagType && (
                    <Link
                      to={`/diagnosis?type=${diagType}&sku=${encodeURIComponent(a.sku)}`}
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary-300/70 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      <i className="ri-search-eye-line text-[12px]" aria-hidden />
                      去诊断
                    </Link>
                  )}
                </div>
                {a.suggestion && (
                  <div className="mt-1.5 text-[12px] leading-relaxed text-foreground-500">{a.suggestion}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
