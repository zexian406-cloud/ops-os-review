import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { snapKey } from "@/domain/engine";
import { diagnoseProfitDecline, diagnoseSalesDecline, type DiagnosisOutput } from "@/domain/diagnose";
import type { AlertType } from "@/domain/types";

const TABS: Array<{ key: "profit" | "sales"; label: string; icon: string; alertTypes: AlertType[] }> = [
  { key: "profit", label: "利润下降诊断", icon: "ri-money-dollar-circle-line", alertTypes: ["profit"] },
  { key: "sales", label: "销量下降诊断", icon: "ri-bar-chart-line", alertTypes: ["stockout", "low_stock"] },
];

export default function DiagnosisPage() {
  const { currentSiteId, skuMaster, latestSnapshot, previousSnapshot, latestInventory, config, loading } = useOpsData();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = (searchParams.get("type") ?? "profit") as "profit" | "sales";
  const skuParam = searchParams.get("sku") ?? "";

  const [skuInput, setSkuInput] = useState(skuParam);
  const [activeTab, setActiveTab] = useState<"profit" | "sales">(
    TABS.some((t) => t.key === type) ? type : "profit",
  );

  // 同步 URL 参数到本地状态（仅在 URL 参数变化时触发）
  useEffect(() => {
    if (skuParam) setSkuInput(skuParam);
    if (type === "profit" || type === "sales") setActiveTab(type);
  }, [skuParam, type]);

  // 当前选中的 SKU 对象
  const currentSku = useMemo(() => {
    if (!skuInput.trim()) return null;
    return skuMaster.find((s) => s.sku === skuInput.trim()) ?? null;
  }, [skuMaster, skuInput]);

  // 执行诊断
  const diagnosis: DiagnosisOutput | null = useMemo(() => {
    if (!currentSku) return null;
    const params = {
      sku: currentSku,
      latestSnap: latestSnapshot.get(snapKey(currentSku.sku, currentSiteId)),
      previousSnap: previousSnapshot?.get(snapKey(currentSku.sku, currentSiteId)),
      latestInv: latestInventory.get(snapKey(currentSku.sku, currentSiteId)),
      config,
    };
    return activeTab === "profit" ? diagnoseProfitDecline(params) : diagnoseSalesDecline(params);
  }, [currentSku, latestSnapshot, previousSnapshot, latestInventory, config, activeTab]);

  const setTab = (key: "profit" | "sales") => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    next.set("type", key);
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
          <p className="text-[13px] text-foreground-500">基于预设规则的根因分析 · 对比本次与上次导入数据</p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
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
          缺少历史数据，无法诊断。请至少导入两次数据后再查看 —— 系统需要对比上次导入的快照才能定位异常根因。
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
