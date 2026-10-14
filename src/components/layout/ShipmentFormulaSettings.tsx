import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_GLOBAL_CONFIG,
  getGlobalConfig,
  getShipmentFormulaConfig,
  setGlobalConfig,
  setShipmentFormulaConfig,
} from "@/domain/db";
import { DEFAULT_SHIPMENT_FORMULA } from "@/domain/types";
import type { ShipmentFormulaConfig, ShipmentRounding, ShipmentThresholdMode } from "@/domain/types";

const ROUNDING_LABELS: Record<ShipmentRounding, string> = {
  ceil: "向上取整（补足）",
  floor: "向下取整（保守）",
  round: "四舍五入",
};

const THRESHOLD_LABELS: Record<ShipmentThresholdMode, string> = {
  lt_safety: "Lead Time + 安全库存",
  lt_only: "仅 Lead Time",
  safety_only: "仅安全库存",
  custom_days: "自定义天数",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (formula: ShipmentFormulaConfig) => void;
}

export default function ShipmentFormulaSettings({ open, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<ShipmentFormulaConfig>(DEFAULT_SHIPMENT_FORMULA);
  const [targetDays, setTargetDays] = useState(DEFAULT_GLOBAL_CONFIG.defaultTargetCoverDays);
  const [leadTime, setLeadTime] = useState(DEFAULT_GLOBAL_CONFIG.defaultLeadTime);
  const [safetyDays, setSafetyDays] = useState(DEFAULT_GLOBAL_CONFIG.defaultSafetyStockDays);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [f, g] = await Promise.all([getShipmentFormulaConfig(), getGlobalConfig()]);
      setDraft(f);
      setTargetDays(g.defaultTargetCoverDays);
      setLeadTime(g.defaultLeadTime);
      setSafetyDays(g.defaultSafetyStockDays);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const thresholdText = draft.thresholdMode === "lt_only" ? `Lead Time（${leadTime} 天）`
    : draft.thresholdMode === "safety_only" ? `安全库存（${safetyDays} 天）`
    : draft.thresholdMode === "custom_days" ? `自定义阈值（${draft.customThresholdDays} 天）`
    : `Lead Time + 安全库存（${leadTime} + ${safetyDays} = ${leadTime + safetyDays} 天）`;

  const handleSave = async () => {
    setSaving(true);
    try {
      await setShipmentFormulaConfig(draft);
      const g = await getGlobalConfig();
      await setGlobalConfig({
        ...g,
        defaultTargetCoverDays: targetDays,
        defaultLeadTime: leadTime,
        defaultSafetyStockDays: safetyDays,
      });
      onSaved(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_SHIPMENT_FORMULA);
    setTargetDays(DEFAULT_GLOBAL_CONFIG.defaultTargetCoverDays);
    setLeadTime(DEFAULT_GLOBAL_CONFIG.defaultLeadTime);
    setSafetyDays(DEFAULT_GLOBAL_CONFIG.defaultSafetyStockDays);
  };

  const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-foreground-500";
  const fieldCls = "rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[12px] text-foreground-800 focus:border-primary-400 focus:outline-none";

  // Topbar 有 backdrop-blur，fixed 后代的包含块会变成顶栏而非视口，必须用 Portal 渲染到 body
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-background-200 bg-background-50 shadow-xl">
        <div className="flex items-center justify-between border-b border-background-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <i className="ri-calculator-line text-[18px] text-primary-600" aria-hidden />
            <span className="text-sm font-semibold text-foreground-800">补货公式设置</span>
            <span className="text-[11px] text-foreground-400">全参数自定义</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-foreground-400 hover:bg-background-100 hover:text-foreground-700 cursor-pointer"
            aria-label="关闭"
          >
            <i className="ri-close-line text-[18px]" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section>
            <div className={labelCls}>日均销量口径（默认）</div>
            <div className="mt-1.5 flex gap-1.5">
              {(["7d", "30d"] as const).map((b) => (
                <button key={b} type="button" onClick={() => setDraft({ ...draft, salesBasis: b })}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                    draft.salesBasis === b ? "bg-primary-500 text-white" : "border border-background-300 bg-white text-foreground-600 hover:text-foreground-900"
                  }`}>
                  {b === "7d" ? "近 7 天日销" : "近 30 天日销"}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className={labelCls}>触发阈值方式（覆盖天数低于阈值才提示补货）</div>
            <select
              value={draft.thresholdMode}
              onChange={(e) => setDraft({ ...draft, thresholdMode: e.target.value as ShipmentThresholdMode })}
              className={`mt-1.5 w-full ${fieldCls}`}
            >
              {(Object.keys(THRESHOLD_LABELS) as ShipmentThresholdMode[]).map((k) => (
                <option key={k} value={k}>{THRESHOLD_LABELS[k]}</option>
              ))}
            </select>
            {draft.thresholdMode === "custom_days" && (
              <label className="mt-2 flex items-center gap-2 text-[12px] text-foreground-600">
                自定义阈值天数
                <input type="number" min={1} value={draft.customThresholdDays}
                  onChange={(e) => setDraft({ ...draft, customThresholdDays: Math.max(1, Number(e.target.value) || 1) })}
                  className={`${fieldCls} w-24 text-right font-mono`} />
              </label>
            )}
          </section>

          <section>
            <div className={labelCls}>三个系数（天）</div>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              <label className="text-[11px] text-foreground-500">
                目标覆盖天数
                <input type="number" min={1} value={targetDays}
                  onChange={(e) => setTargetDays(Math.max(1, Number(e.target.value) || 1))}
                  className={`${fieldCls} mt-1 w-full text-right font-mono`} />
              </label>
              <label className="text-[11px] text-foreground-500">
                Lead Time
                <input type="number" min={0} value={leadTime}
                  onChange={(e) => setLeadTime(Math.max(0, Number(e.target.value) || 0))}
                  className={`${fieldCls} mt-1 w-full text-right font-mono`} />
              </label>
              <label className="text-[11px] text-foreground-500">
                安全库存
                <input type="number" min={0} value={safetyDays}
                  onChange={(e) => setSafetyDays(Math.max(0, Number(e.target.value) || 0))}
                  className={`${fieldCls} mt-1 w-full text-right font-mono`} />
              </label>
            </div>
            <div className="mt-1 text-[10px] text-foreground-400">
              与「参数中心 → 全局阈值」共用同一份数据；SKU 级单独设置过的 Lead Time / 安全库存优先于这里
            </div>
          </section>

          <section>
            <div className={labelCls}>活动倍率</div>
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[12px] text-foreground-700">
              <input type="checkbox" checked={draft.promoMultiplierEnabled}
                onChange={(e) => setDraft({ ...draft, promoMultiplierEnabled: e.target.checked })}
                className="accent-primary-600" />
              活动期间按销量倍率加备库存（取当前最高活动倍率）
            </label>
            {draft.promoMultiplierEnabled && (
              <label className="mt-2 flex items-center gap-2 text-[12px] text-foreground-600">
                活动额外天数（目标天数 +
                <input type="number" min={0} value={draft.promoExtraDays}
                  onChange={(e) => setDraft({ ...draft, promoExtraDays: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${fieldCls} w-20 text-right font-mono`} />
                天）
              </label>
            )}
          </section>

          <section>
            <div className={labelCls}>建议量取整方式</div>
            <select
              value={draft.rounding}
              onChange={(e) => setDraft({ ...draft, rounding: e.target.value as ShipmentRounding })}
              className={`mt-1.5 w-full ${fieldCls}`}
            >
              {(Object.keys(ROUNDING_LABELS) as ShipmentRounding[]).map((k) => (
                <option key={k} value={k}>{ROUNDING_LABELS[k]}</option>
              ))}
            </select>
          </section>

          <section className="rounded-lg bg-primary-50/60 p-3">
            <div className="text-[11px] font-semibold text-primary-700">当前公式预览</div>
            <div className="mt-1.5 space-y-1 font-mono text-[11px] leading-relaxed text-foreground-700">
              <div>触发条件：含在途覆盖天数 &lt; {thresholdText}</div>
              <div>
                建议量 = (目标 {targetDays}
                {draft.promoMultiplierEnabled && ` + 活动 ${draft.promoExtraDays}`} + LT {leadTime} + 安全 {safetyDays} − 覆盖天数)
                × 日均销量{draft.promoMultiplierEnabled ? " × 活动倍率" : ""}
                {" → "}{ROUNDING_LABELS[draft.rounding].split("（")[0]}
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-background-200 px-4 py-3">
          <button type="button" onClick={handleReset}
            className="rounded-md px-2.5 py-1.5 text-[12px] text-foreground-500 hover:text-foreground-800 cursor-pointer">
            恢复默认
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="rounded-md border border-background-300 bg-white px-3 py-1.5 text-[12px] text-foreground-600 hover:bg-background-100 cursor-pointer">
              取消
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="rounded-md bg-primary-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-primary-700 disabled:opacity-60 cursor-pointer">
              {saving ? "保存中…" : "保存公式"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
