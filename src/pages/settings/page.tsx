import { useEffect, useState, useRef } from "react";
import { db, DEFAULT_GLOBAL_CONFIG, getGlobalConfig, setGlobalConfig, getCurrentSiteId, getProfitFormulaConfig, setProfitFormulaConfig } from "@/domain/db";
import { setProfitFormulaCache } from "@/domain/calculator";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import type { GlobalConfig, SkuMaster, WarehouseProvider, RateTier, ProfitFormulaConfig, ProfitFormulaKey } from "@/domain/types";
import { DEFAULT_PROFIT_FORMULA, PROFIT_FORMULA_META } from "@/domain/types";
import { compileFormula, FormulaEvalError } from "@/domain/formulaEval";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * 可内联编辑的数字单元格 — 本地字符串状态 + onBlur 写 DB。
 * 避免 onChange 每次按键写 DB 导致无法输入小数（"5." → Number("5.")=5 → 丢小数点）。
 */
function EditableNumCell({
  value,
  onCommit,
  placeholder,
  step = "0.01",
  className,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  placeholder?: string;
  step?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");
  const focused = useRef(false);

  // 外部数据变更时同步（仅在未聚焦时）
  useEffect(() => {
    if (!focused.current) {
      setLocal(value != null ? String(value) : "");
    }
  }, [value]);

  return (
    <input
      type="number"
      step={step}
      value={local}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        focused.current = false;
        const num = local.trim() === "" ? undefined : Number(local);
        onCommit(Number.isNaN(num as number) ? undefined : num);
        setLocal(num != null ? String(num) : "");
      }}
      className={className}
    />
  );
}

// ── 真实费率数据 ──
const SEED_PROVIDERS: WarehouseProvider[] = [
  {
    id: uid(),
    name: "无忧达",
    billingMode: "days_tier",
    unit: "cbm_per_day",
    tiers: [
      { min: 1, max: 45, rate: 0.00 },
      { min: 46, max: 60, rate: 0.00 },
      { min: 61, max: 90, rate: 0.30 },
      { min: 91, max: 120, rate: 0.60 },
      { min: 121, max: 180, rate: 0.70 },
      { min: 181, max: 270, rate: 1.00 },
      { min: 271, max: 360, rate: 1.20 },
      { min: 361, rate: 2.00 },
    ],
  },
  {
    id: uid(),
    name: "乐歌",
    billingMode: "longest_edge_tier",
    unit: "cbm_per_day",
    tiers: [
      { min: 1, max: 30, rate: 0.60 },
      { min: 31, max: 60, rate: 0.60 },
      { min: 61, max: 120, rate: 0.60 },
      { min: 121, max: 180, rate: 0.80 },
      { min: 181, max: 270, rate: 1.10 },
      { min: 271, max: 360, rate: 1.40 },
      { min: 361, rate: 1.50 },
    ],
  },
];

export default function Settings() {
  const [cfg, setCfg] = useState<GlobalConfig>(DEFAULT_GLOBAL_CONFIG);
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"global" | "sku" | "warehouse" | "profit">("global");

  // ── 海外仓费率 ──
  const [providers, setProviders] = useState<WarehouseProvider[]>([]);

  // ── 利润公式 ──
  const [profitFormula, setProfitFormula] = useState<ProfitFormulaConfig>(DEFAULT_PROFIT_FORMULA);
  const [profitMsg, setProfitMsg] = useState<string | null>(null);
  const [profitErr, setProfitErr] = useState<string | null>(null);
  const [showCurrentFormulas, setShowCurrentFormulas] = useState(false);
  const [showAdvancedFormulas, setShowAdvancedFormulas] = useState(false);

  useEffect(() => { getProfitFormulaConfig().then(setProfitFormula); }, []);

  const saveProfitFormula = async () => {
    // 非法表达式不允许入库（引擎虽有默认公式兜底，但不留脏配置）
    for (const [k, expr] of Object.entries(profitFormula.formulas)) {
      if (!expr?.trim()) continue;
      try {
        compileFormula(expr);
      } catch (e) {
        const label = PROFIT_FORMULA_META[k as ProfitFormulaKey]?.label ?? k;
        const reason = e instanceof FormulaEvalError ? e.message : "表达式错误";
        setProfitErr(`「${label}」公式无效：${reason}，请修正后再保存`);
        setTimeout(() => setProfitErr(null), 5000);
        return;
      }
    }
    setProfitErr(null);
    await setProfitFormulaConfig(profitFormula);
    setProfitFormulaCache(profitFormula);
    setProfitMsg("利润公式已保存，全站生效");
    setTimeout(() => setProfitMsg(null), 2600);
  };

  const toggleCostItem = (key: keyof ProfitFormulaConfig["costItems"], on: boolean) => {
    setProfitFormula((p) => ({ ...p, costItems: { ...p.costItems, [key]: on } }));
  };

  useEffect(() => {
    (async () => {
      const siteId = await getCurrentSiteId();
      const [c, s, p] = await Promise.all([
        getGlobalConfig(),
        db.skuMaster.toArray(),
        db.warehouseProviders.toArray(),
      ]);
      setCfg(c);
      setSkus(s.filter(x => (x.siteId ?? "site_us") === siteId));
      if (p.length === 0) {
        // Seed two providers with real rates
        const [wy, lg] = SEED_PROVIDERS;
        await db.warehouseProviders.bulkPut([wy, lg]);
        setProviders([wy, lg]);
      } else {
        setProviders(p);
      }
    })();
  }, []);

  const saveCfg = async () => {
    await setGlobalConfig(cfg);
    setMsg("已保存全局参数");
    setTimeout(() => setMsg(null), 2200);
  };

  const updateSkuField = async (sku: string, patch: Partial<SkuMaster>) => {
    const siteId = await getCurrentSiteId();
    const cur = await db.skuMaster.get([sku, siteId]);
    if (!cur) return;
    await db.skuMaster.put({ ...cur, ...patch });
    setSkus((prev) => prev.map((r) => (r.sku === sku ? { ...r, ...patch } : r)));
  };

  // ── 海外仓操作 ──
  const addProvider = async () => {
    const name = prompt("输入服务商名称：");
    if (!name?.trim()) return;
    const provider: WarehouseProvider = { id: uid(), name: name.trim(), tiers: [], billingMode: "days_tier", unit: "cbm_per_day" };
    await db.warehouseProviders.put(provider);
    setProviders((prev) => [...prev, provider]);
  };

  const deleteProvider = async (id: string) => {
    await db.warehouseProviders.delete(id);
    setProviders((prev) => prev.filter((p) => p.id !== id));
  };

  const deleteTier = async (providerId: string, tierIdx: number) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    if (provider.tiers.length <= 1) return;
    const newTiers = provider.tiers.filter((_, i) => i !== tierIdx);
    // Recalculate mins from tierIdx onwards
    for (let i = tierIdx; i < newTiers.length; i++) {
      const prevMax = i > 0 ? newTiers[i - 1]?.max : 0;
      newTiers[i] = { ...newTiers[i], min: (prevMax ?? 0) + 1 };
    }
    await db.warehouseProviders.put({ ...provider, tiers: newTiers });
    setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, tiers: newTiers } : p)));
  };

  const updateProviderTiers = async (providerId: string, newTiers: RateTier[]) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    await db.warehouseProviders.put({ ...provider, tiers: newTiers });
    setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, tiers: newTiers } : p)));
  };

  const updateTier = async (providerId: string, tierIdx: number, patch: Partial<RateTier>) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    const newTiers = provider.tiers.map((t, i) => (i === tierIdx ? { ...t, ...patch } : t));
    await updateProviderTiers(providerId, newTiers);
  };

  const addNewTier = async (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    const lastIdx = provider.tiers.length - 1;
    const last = provider.tiers[lastIdx];
    const hasUnlimited = last && last.max == null;
    const prevBounded = hasUnlimited ? provider.tiers[lastIdx - 1] : last;
    const newMin = (prevBounded?.max ?? 0) + 1;
    const newTier: RateTier = { min: newMin, rate: 0.6 };
    const newTiers = hasUnlimited
      ? [...provider.tiers.slice(0, lastIdx), newTier, last]
      : [...provider.tiers, newTier];
    await updateProviderTiers(providerId, newTiers);
  };

  const tabs = [
    { key: "global" as const, label: "全局阈值", icon: "ri-tools-line" },
    { key: "sku" as const, label: "SKU 参数", icon: "ri-truck-line" },
    { key: "warehouse" as const, label: "海外仓费率", icon: "ri-building-2-line" },
    { key: "profit" as const, label: "利润公式", icon: "ri-funds-line" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          Configuration
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">参数中心</h1>
        <p className="text-[13px] text-foreground-500">
          全局阈值 · 供应链参数 · 海外仓费率 · 费比与退货率提醒阈值可自定义
        </p>
      </div>

      {/* Tab bar */}
      <div className="inline-flex rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setMsg(null); }}
            className={[
              "rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
              tab === t.key
                ? "bg-primary-500 text-background-50"
                : "text-foreground-600 hover:text-foreground-900",
            ].join(" ")}
          >
            <i className={`${t.icon} mr-1 text-[13px]`} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {/* Alerts info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-accent-200 bg-accent-50/60 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[14px] text-accent-700">
          <i className="ri-alert-line" aria-hidden />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-foreground-900">阈值提醒规则</div>
          <div className="mt-0.5 text-[12px] text-foreground-600">
            当广告费比 &gt; <strong>{cfg.adRatioThreshold}%</strong> 或 退货率 &gt; <strong>{cfg.returnRateThreshold}%</strong> 时，Dashboard 和 SKU 详情页会显示警告提醒。
            下方可自定义两个阈值，修改后保存即可生效。
          </div>
        </div>
      </div>

      {/* Global */}
      {tab === "global" && (
        <Section title="全局阈值" icon="ri-tools-line" subtitle="所有模块的判断标准，修改后立即影响提醒规则">
          <div className="space-y-6">
            <div className="rounded-xl border-2 border-background-200/70 bg-background-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-[14px] text-red-600">
                  <i className="ri-alert-line" aria-hidden />
                </div>
                <span className="text-[13px] font-semibold text-foreground-900">提醒阈值</span>
                <span className="text-[11px] text-foreground-500">超过即触发 Dashboard 告警</span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <NumField label="广告费比阈值 (%)" value={cfg.adRatioThreshold} onChange={(v) => setCfg({ ...cfg, adRatioThreshold: v })} />
                <NumField label="退货率阈值 (%)" value={cfg.returnRateThreshold} onChange={(v) => setCfg({ ...cfg, returnRateThreshold: v })} />
                <NumField label="利润率阈值 (%)" value={cfg.profitMarginThreshold} onChange={(v) => setCfg({ ...cfg, profitMarginThreshold: v })} />
                <NumField label="评分下降阈值" value={cfg.ratingDropThreshold} step={0.1} onChange={(v) => setCfg({ ...cfg, ratingDropThreshold: v })} />
              </div>
            </div>

            <div className="rounded-xl border border-background-200/70 bg-background-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary-100 text-[14px] text-secondary-700">
                  <i className="ri-ship-line" aria-hidden />
                </div>
                <span className="text-[13px] font-semibold text-foreground-900">供应链默认值</span>
                <span className="text-[11px] text-foreground-500">新建 SKU 时的默认参数</span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <NumField label="默认 Lead Time (天)" value={cfg.defaultLeadTime} onChange={(v) => setCfg({ ...cfg, defaultLeadTime: v })} />
                <NumField label="安全库存 (天)" value={cfg.defaultSafetyStockDays} onChange={(v) => setCfg({ ...cfg, defaultSafetyStockDays: v })} />
                <NumField label="目标库存 (天)" value={cfg.defaultTargetCoverDays} onChange={(v) => setCfg({ ...cfg, defaultTargetCoverDays: v })} />
                <NumField label="新品期 (天)" value={cfg.lifecycleNewDays} onChange={(v) => setCfg({ ...cfg, lifecycleNewDays: v })} />
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={saveCfg}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-save-line" aria-hidden /> 保存全局参数
            </button>
            {msg && <span className="text-[12px] text-accent-700">{msg}</span>}
          </div>
        </Section>
      )}

      {/* SKU params */}
      {tab === "sku" && (
        <Section title="SKU 供应链参数" icon="ri-truck-line" subtitle="Lead Time / 安全库存 / 生命周期">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                  <th className="border-b border-background-200 px-3 py-2.5">SKU</th>
                  <th className="border-b border-background-200 px-3 py-2.5">品名</th>
                  <th className="border-b border-background-200 px-3 py-2.5">品类</th>
                  <th className="border-b border-background-200 px-3 py-2.5">生命周期</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">Lead Time</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">安全库存</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">头程 / 配送费 / 产品成本</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((s) => (
                  <tr key={s.sku}>
                    <td className="mono-num border-b border-background-200/70 px-3 py-2 text-[12px]">{s.sku}</td>
                    <td className="border-b border-background-200/70 px-3 py-2">{s.name}</td>
                    <td className="border-b border-background-200/70 px-3 py-2">
                      <input
                        value={s.category ?? ""}
                        onChange={(e) => updateSkuField(s.sku, { category: e.target.value })}
                        placeholder="-"
                        className="w-24 rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
                      />
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2">
                      <select
                        value={s.lifecycle ?? "mature"}
                        onChange={(e) => updateSkuField(s.sku, { lifecycle: e.target.value as SkuMaster["lifecycle"] })}
                        className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none cursor-pointer"
                      >
                        <option value="new">新品</option>
                        <option value="growth">成长</option>
                        <option value="mature">成熟</option>
                        <option value="clearance">清货</option>
                        <option value="eol">停售</option>
                      </select>
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2 text-right">
                      <input
                        type="number"
                        value={s.leadTimeDays ?? 40}
                        onChange={(e) => updateSkuField(s.sku, { leadTimeDays: Number(e.target.value) })}
                        className="w-16 rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none"
                      />
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2 text-right">
                      <input
                        type="number"
                        value={s.safetyStockDays ?? 30}
                        onChange={(e) => updateSkuField(s.sku, { safetyStockDays: Number(e.target.value) })}
                        className="w-16 rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none"
                      />
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 text-[11px] text-foreground-500">
                        <EditableNumCell
                          value={s.costShipping}
                          onCommit={(v) => updateSkuField(s.sku, { costShipping: v })}
                          placeholder="头程"
                          className="w-14 rounded-md border border-background-300/70 bg-background-50 px-1 py-1 text-right text-[11px] focus:border-primary-500 focus:outline-none"
                        />
                        <span className="text-foreground-400">/</span>
                        <EditableNumCell
                          value={s.costDelivery}
                          onCommit={(v) => updateSkuField(s.sku, { costDelivery: v })}
                          placeholder="配送"
                          className="w-14 rounded-md border border-background-300/70 bg-background-50 px-1 py-1 text-right text-[11px] focus:border-primary-500 focus:outline-none"
                        />
                        <span className="text-foreground-400">/</span>
                        <EditableNumCell
                          value={s.costFob}
                          onCommit={(v) => updateSkuField(s.sku, { costFob: v })}
                          placeholder="成本"
                          className="w-14 rounded-md border border-background-300/70 bg-background-50 px-1 py-1 text-right text-[11px] focus:border-primary-500 focus:outline-none"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-foreground-500">
            <Badge tone="accent">自动保存</Badge>
            <span>修改后立即写入本地</span>
          </div>
        </Section>
      )}

      {/* 海外仓费率 */}
      {tab === "warehouse" && (
        <Section title="海外仓费率配置" icon="ri-building-2-line" subtitle="管理海外仓服务商、仓库及分段费率 · 新品测算中自动调用">
          {providers.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-foreground-500">
              <i className="ri-building-2-line mb-2 block text-[28px] text-foreground-300" aria-hidden />
              暂无服务商
            </div>
          ) : (
            <div className="space-y-5">
              {providers.map((provider) => (
                <div key={provider.id} className="rounded-xl border border-background-200/70 bg-background-50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-100 text-[16px] text-primary-700">
                        <i className="ri-building-2-line" aria-hidden />
                      </div>
                      <span className="text-[15px] font-bold text-foreground-900">{provider.name}</span>
                      <select
                        value={provider.billingMode}
                        onChange={async (e) => {
                          const val = e.target.value as WarehouseProvider["billingMode"];
                          await db.warehouseProviders.put({ ...provider, billingMode: val });
                          setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, billingMode: val } : p)));
                        }}
                        className="rounded border border-background-200 bg-background-50 px-1.5 py-0.5 text-[11px] cursor-pointer"
                      >
                        <option value="days_tier">天数阶梯</option>
                        <option value="longest_edge_tier">最长边阶梯</option>
                      </select>
                      <select
                        value={provider.unit}
                        onChange={async (e) => {
                          const val = e.target.value as WarehouseProvider["unit"];
                          await db.warehouseProviders.put({ ...provider, unit: val });
                          setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, unit: val } : p)));
                        }}
                        className="rounded border border-background-200 bg-background-50 px-1.5 py-0.5 text-[11px] cursor-pointer"
                      >
                        <option value="cbm_per_day">USD/m³/天</option>
                        <option value="cft_per_day">USD/ft³/天</option>
                      </select>
                      <Badge tone="accent">{provider.tiers.length} 个费率档位</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addProvider()}
                        className="rounded-md border border-background-200 px-2.5 py-1.5 text-[11px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-add-line mr-1" aria-hidden />添加服务商
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProvider(provider.id)}
                        className="flex h-7 w-7 items-center justify-center rounded hover:bg-red-50 text-foreground-400 hover:text-red-500 cursor-pointer"
                        title="删除服务商"
                      >
                        <i className="ri-delete-bin-line text-[14px]" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {/* Rate tiers */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-500">
                          <th className="border-b border-background-200/70 py-1.5 px-2">范围 (自动计算)</th>
                          <th className="border-b border-background-200/70 py-1.5 px-2 text-right">上界 (填数字)</th>
                          <th className="border-b border-background-200/70 py-1.5 px-2 text-right">费率 $</th>
                          <th className="border-b border-background-200/70 py-1.5 px-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {provider.tiers.map((tier, idx) => {
                          const prevMax = idx > 0 ? provider.tiers[idx - 1]?.max : 0;
                          const rangeLabel = tier.max != null
                            ? `${prevMax} ＜ X ≤ ${tier.max}`
                            : `＞ ${prevMax}`;
                          return (
                          <tr key={idx}>
                            <td className="border-b border-background-200/40 py-1 px-2">
                              <span className="mono-num text-[11px] text-foreground-600">{rangeLabel}</span>
                            </td>
                            <td className="border-b border-background-200/40 py-1 px-2 text-right">
                              {tier.max != null ? (
                                <input
                                  type="number"
                                  step="1"
                                  value={tier.max}
                                  onChange={(e) => {
                                    const newMax = Number(e.target.value);
                                    const prov = providers.find((pp) => pp.id === provider.id);
                                    if (!prov) return;
                                    const newTiers = prov.tiers.map((t, i) => {
                                      if (i === idx) return { ...t, max: newMax };
                                      if (i === idx + 1) return { ...t, min: newMax + 1 };
                                      return t;
                                    });
                                    updateProviderTiers(provider.id, newTiers);
                                  }}
                                  className="w-16 rounded border border-background-200 bg-background-50 px-1 py-0.5 text-right text-[11px]"
                                />
                              ) : (
                                <span className="rounded bg-accent-50 px-2 py-0.5 text-[10px] font-medium text-accent-700">无上限</span>
                              )}
                            </td>
                            <td className="border-b border-background-200/40 py-1 px-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={tier.rate}
                                onChange={(e) => updateTier(provider.id, idx, { rate: Number(e.target.value) })}
                                className="w-16 rounded border border-background-200 bg-background-50 px-1 py-0.5 text-right text-[11px]"
                              />
                            </td>
                            <td className="border-b border-background-200/40 py-1 px-2">
                              <div className="flex items-center gap-0.5">
                                {tier.max != null && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Set this tier to no upper limit (move max to undefined)
                                      updateTier(provider.id, idx, { max: undefined });
                                    }}
                                    className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent-50 text-foreground-300 hover:text-accent-600 cursor-pointer"
                                    title="设为无上限"
                                  >
                                    <i className="ri-arrow-up-double-line text-[10px]" aria-hidden />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => deleteTier(provider.id, idx)}
                                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-red-50 text-foreground-300 hover:text-red-400 cursor-pointer"
                                >
                                  <i className="ri-close-line text-[12px]" aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => addNewTier(provider.id)}
                    className="mt-2 text-[11px] font-medium text-primary-700 hover:underline cursor-pointer"
                  >
                    <i className="ri-add-line mr-0.5" aria-hidden />添加费率档位
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addProvider}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-background-300 px-4 py-2.5 text-[13px] font-medium text-foreground-500 hover:border-primary-400 hover:text-primary-700 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line" aria-hidden /> 添加服务商
              </button>
            </div>
          )}
        </Section>
      )}

      {/* 利润公式 */}
      {tab === "profit" && (
        <Section title="利润计算公式" icon="ri-funds-line" subtitle="改成本项开关和系数即可 · 高级公式表达式按需展开">
          <div className="space-y-5">
            {/* 默认公式展示（默认收起，含自定义生效标记） */}
            <div>
              <button
                type="button"
                onClick={() => setShowCurrentFormulas((v) => !v)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-background-200 bg-primary-50/60 px-3 py-2.5 text-left hover:border-primary-300"
              >
                <i className="ri-function-line text-[15px] text-primary-700" aria-hidden />
                <span className="text-[13px] font-semibold text-foreground-800">当前生效公式</span>
                {(() => {
                  const n = Object.values(profitFormula.formulas).filter((v) => v?.trim()).length;
                  return n > 0 ? (
                    <span className="rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700">
                      已自定义 {n} 条
                    </span>
                  ) : (
                    <span className="text-[11px] text-foreground-400">使用内置默认</span>
                  );
                })()}
                <i className={`${showCurrentFormulas ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} ml-auto text-[16px] text-foreground-400`} aria-hidden />
              </button>
              {showCurrentFormulas && (
                <div className="mt-2 rounded-lg bg-primary-50/60 p-4">
                  <div className="space-y-1 font-mono text-[12px] leading-relaxed text-foreground-700">
                    {(Object.entries(PROFIT_FORMULA_META) as Array<[ProfitFormulaKey, (typeof PROFIT_FORMULA_META)[ProfitFormulaKey]]>)
                      .filter(([key]) => key !== "discountTotalCost")
                      .map(([key, meta]) => {
                        const custom = profitFormula.formulas[key]?.trim();
                        return (
                          <div key={key}>
                            {meta.label} = {custom || meta.defaultExpr}
                            {custom && (
                              <span className="ml-1.5 inline-block rounded bg-accent-100 px-1.5 py-0.5 align-middle font-sans text-[10px] font-semibold text-accent-700">
                                已自定义
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-2 text-[11px] leading-relaxed text-foreground-500">
                    佣金：显式填写的佣金优先 → 无则按佣金率 × 售价 → 再无则按默认佣金率（当前 {profitFormula.defaultCommissionRate}%，下方可修改）估算；广告费缺失时按费比 × 售价反推。
                  </div>
                </div>
              )}
            </div>

            {/* 成本项开关 */}
            <div>
              <div className="mb-2 text-[13px] font-semibold text-foreground-900">成本项计入开关</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {([
                  ["fob", "FOB 产品成本"],
                  ["shipping", "头程运费"],
                  ["delivery", "配送费"],
                  ["commission", "佣金"],
                  ["storage", "仓储费"],
                  ["ad", "广告费"],
                  ["refundLoss", "退货损失（退款率×售价）"],
                  ["promoCost", "促销成本"],
                  ["coupon", "优惠券"],
                ] as Array<[keyof ProfitFormulaConfig["costItems"], string]>).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-[12px] text-foreground-700 hover:border-primary-300">
                    <input
                      type="checkbox"
                      checked={profitFormula.costItems[key]}
                      onChange={(e) => toggleCostItem(key, e.target.checked)}
                      className="accent-primary-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* 默认佣金率 */}
            <div>
              <div className="mb-2 text-[13px] font-semibold text-foreground-900">默认佣金率（%）</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <NumField
                  label="SKU 未填佣金且未填佣金率时按此估算（默认 15）"
                  value={profitFormula.defaultCommissionRate}
                  onChange={(v) => setProfitFormula((p) => ({ ...p, defaultCommissionRate: v }))}
                />
              </div>
            </div>

            {/* 折扣预估上浮率 */}
            <div>
              <div className="mb-1 text-[13px] font-semibold text-foreground-900">折扣预估上浮率（%）</div>
              <p className="mb-2 text-[12px] text-foreground-400">SKU 详情页「折扣广告费(估)」「折扣退款费(估)」两个参考行的兜底估算：折扣口径有真实数据时不生效，不参与折扣净利计算，平时保持默认 10 即可。</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <NumField
                  label="折扣广告费上浮率（默认 10 = ×1.1）"
                  value={profitFormula.discountAdUplift}
                  onChange={(v) => setProfitFormula((p) => ({ ...p, discountAdUplift: v }))}
                />
                <NumField
                  label="折扣退款费上浮率（默认 10 = ×1.1）"
                  value={profitFormula.discountReturnUplift}
                  onChange={(v) => setProfitFormula((p) => ({ ...p, discountReturnUplift: v }))}
                />
              </div>
            </div>

            {/* 自定义公式（高级，默认收起） */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedFormulas((v) => !v)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-background-200 bg-background-50 px-3 py-2.5 text-left hover:border-primary-300"
              >
                <span className="text-[13px] font-semibold text-foreground-800">自定义公式表达式</span>
                <span className="text-[11px] text-foreground-400">高级 · 一般无需修改，改开关和系数就够了</span>
                {(() => {
                  const n = Object.values(profitFormula.formulas).filter((v) => v?.trim()).length;
                  return n > 0 ? (
                    <span className="rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700">
                      已自定义 {n} 条
                    </span>
                  ) : null;
                })()}
                <i className={`${showAdvancedFormulas ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} ml-auto text-[16px] text-foreground-400`} aria-hidden />
              </button>
              {showAdvancedFormulas && (
                <div className="mt-2">
                  <div className="mb-2 text-[11px] text-foreground-400">
                    逐条改写计算表达式，留空 = 使用内置默认公式；支持中文变量、四则运算和 min/max/round/floor/ceil/abs 函数，写错会实时标红且保存时拦截。
                  </div>
                  <div className="space-y-2.5">
                    {(Object.keys(PROFIT_FORMULA_META) as ProfitFormulaKey[]).map((key) => (
                      <FormulaField
                        key={key}
                        metaKey={key}
                        value={profitFormula.formulas[key] ?? ""}
                        onChange={(v) =>
                          setProfitFormula((p) => {
                            const next = { ...p.formulas };
                            if (v.trim()) next[key] = v.trim();
                            else delete next[key];
                            return { ...p, formulas: next };
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setProfitFormula(DEFAULT_PROFIT_FORMULA)}
                className="rounded-md px-3 py-2 text-[13px] text-foreground-500 hover:text-foreground-800 cursor-pointer"
              >
                恢复默认
              </button>
              <button
                type="button"
                onClick={saveProfitFormula}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-save-line" aria-hidden /> 保存利润公式
              </button>
              {profitMsg && <span className="text-[12px] text-accent-700">{profitMsg}</span>}
              {profitErr && <span className="text-[12px] font-medium text-danger-600">{profitErr}</span>}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-foreground-700">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-background-300/70 bg-background-50 px-3 py-2 text-sm text-foreground-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
    </label>
  );
}

/** 单条自定义公式输入：实时语法校验 + 默认公式/可用变量提示 */
function FormulaField({
  metaKey,
  value,
  onChange,
}: {
  metaKey: ProfitFormulaKey;
  value: string;
  onChange: (v: string) => void;
}) {
  const meta = PROFIT_FORMULA_META[metaKey];
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  const trimmed = local.trim();
  let checkOk = true;
  let checkMsg = "留空 = 使用内置默认公式";
  if (trimmed) {
    try {
      compileFormula(trimmed);
      checkMsg = "✓ 语法正确，保存后全站生效";
    } catch (e) {
      checkOk = false;
      checkMsg = e instanceof FormulaEvalError ? e.message : "表达式无效";
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${checkOk ? "border-background-200 bg-background-50" : "border-danger-300 bg-danger-50/40"}`}>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[12px] font-semibold text-foreground-800">{meta.label}</span>
        <span className="font-mono text-[11px] text-foreground-400">默认：{meta.defaultExpr}</span>
      </div>
      <input
        type="text"
        value={local}
        placeholder={`留空 = 默认（${meta.defaultExpr}）`}
        onFocus={() => { focused.current = true; }}
        onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }}
        onBlur={() => { focused.current = false; }}
        spellCheck={false}
        className="w-full rounded-md border border-background-300/70 bg-white px-2.5 py-1.5 font-mono text-[12px] text-foreground-900 placeholder:font-sans placeholder:text-foreground-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />
      <div className={`mt-1 text-[11px] leading-relaxed ${checkOk ? "text-foreground-400" : "text-danger-600"}`}>
        {checkMsg} · 可用变量：{meta.vars}
        {meta.hint ? ` · ${meta.hint}` : ""}
      </div>
    </div>
  );
}