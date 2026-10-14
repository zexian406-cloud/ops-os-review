import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_FOB_CURRENCY,
  deleteExchangeRate,
  getCurrentSiteId,
  getSite,
  normalizeCurrencyCode,
  setFobSourceCurrency,
  upsertExchangeRate,
} from "@/domain/db";
import { useCurrency } from "@/hooks/useCurrency";

const COMMON_CURRENCIES = [
  "USD", "CNY", "EUR", "GBP", "JPY", "CAD", "AUD", "MXN", "SEK", "PLN",
  "AED", "SAR", "BRL", "INR", "KRW", "SGD", "HKD", "NZD", "CHF", "TRY",
];

const inputCls =
  "rounded-md border border-background-300 bg-white px-2 py-1 text-[12px] text-foreground-700 focus:border-primary-400 focus:outline-none";
const inputNumCls = `${inputCls} font-mono text-right`;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ExchangeRateManager({ open, onClose }: Props) {
  const { rates, currencies, fobCurrency, convert } = useCurrency();

  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newRate, setNewRate] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [fobDraft, setFobDraft] = useState(fobCurrency);
  const [convAmount, setConvAmount] = useState("100");
  const [convFrom, setConvFrom] = useState("USD");
  const [convTo, setConvTo] = useState(DEFAULT_FOB_CURRENCY);
  const [siteCurrency, setSiteCurrency] = useState("USD");

  useEffect(() => {
    if (open) {
      setRateDrafts({});
      setRowError({});
      setFobDraft(fobCurrency);
      getCurrentSiteId()
        .then((id) => getSite(id))
        .then((site) => setSiteCurrency(site?.currency || "USD"))
        .catch(() => setSiteCurrency("USD"));
    }
  }, [open, fobCurrency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const knownCurrencies = useMemo(() => {
    const set = new Set<string>([...currencies, ...COMMON_CURRENCIES]);
    return [...set].sort();
  }, [currencies]);

  const convResult = useMemo(() => {
    const amount = parseFloat(convAmount);
    if (!Number.isFinite(amount)) return null;
    return convert(amount, convFrom, convTo);
  }, [convAmount, convFrom, convTo, convert]);

  const fobRateToSite = useMemo(() => convert(1, fobCurrency, siteCurrency), [convert, fobCurrency, siteCurrency]);

  if (!open) return null;

  const handleRateSave = async (id: string, from: string, to: string) => {
    const draft = rateDrafts[id];
    if (draft === undefined) return;
    const rate = parseFloat(draft);
    if (!Number.isFinite(rate) || rate <= 0) {
      setRowError((p) => ({ ...p, [id]: "汇率必须为正数" }));
      return;
    }
    try {
      await upsertExchangeRate(from, to, rate);
      setRateDrafts((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      setRowError((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    } catch (e) {
      setRowError((p) => ({ ...p, [id]: e instanceof Error ? e.message : String(e) }));
    }
  };

  const handleAdd = async () => {
    setAddError(null);
    const f = normalizeCurrencyCode(newFrom);
    const t = normalizeCurrencyCode(newTo);
    const rate = parseFloat(newRate);
    if (!f || !t) { setAddError("请填写源货币与目标货币代码"); return; }
    if (f === t) { setAddError("源货币与目标货币不能相同"); return; }
    if (!Number.isFinite(rate) || rate <= 0) { setAddError("请填写正数汇率"); return; }
    try {
      await upsertExchangeRate(f, t, rate);
      setNewFrom("");
      setNewTo("");
      setNewRate("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`确定删除汇率对 ${label} 吗？依赖该路径的换算将无法进行。`)) return;
    await deleteExchangeRate(id);
  };

  const handleFobSave = async () => {
    const v = normalizeCurrencyCode(fobDraft);
    if (!v) return;
    try {
      await setFobSourceCurrency(v);
    } catch {
      // 无效输入时回显当前值
      setFobDraft(fobCurrency);
    }
  };

  // Topbar 有 backdrop-blur，会让 fixed 后代的包含块变成 52px 高的顶栏而非视口，
  // 导致弹窗标题栏被截出屏幕；必须用 Portal 渲染到 body 才能真正相对视口定位
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-background-200 bg-background-50 shadow-xl">
        <div className="flex items-center justify-between border-b border-background-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <i className="ri-money-dollar-circle-line text-[18px] text-primary-600" aria-hidden />
            <span className="text-sm font-semibold text-foreground-800">汇率管理</span>
            <span className="text-[11px] text-foreground-400">任意货币对 · 全自定义</span>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* 汇率对列表 */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
              汇率对（1 源货币 = ? 目标货币）
            </div>
            {rates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-background-300 px-3 py-4 text-center text-[12px] text-foreground-400">
                暂无汇率对，请在下方添加
              </div>
            ) : (
              <div className="space-y-1.5">
                {rates.map((r) => {
                  const id = r.id;
                  const label = `${r.from} → ${r.to}`;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-lg border border-background-200 bg-white px-3 py-2"
                    >
                      <span className="w-24 shrink-0 text-[12px] font-mono font-medium text-foreground-700">
                        {r.from} → {r.to}
                      </span>
                      <span className="shrink-0 text-[11px] text-foreground-400">1=</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={rateDrafts[id] ?? String(r.rate)}
                        onChange={(e) => setRateDrafts((p) => ({ ...p, [id]: e.target.value }))}
                        onBlur={() => handleRateSave(id, r.from, r.to)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className={`${inputNumCls} w-28`}
                      />
                      <span className="shrink-0 text-[11px] text-foreground-400">{r.to}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-foreground-300">
                        {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(id, label)}
                        className="shrink-0 rounded p-1 text-foreground-300 hover:bg-red-50 hover:text-red-500 cursor-pointer"
                        aria-label={`删除 ${label}`}
                      >
                        <i className="ri-delete-bin-line text-[14px]" aria-hidden />
                      </button>
                      {rowError[id] && (
                        <span className="w-full text-[10px] text-red-500">{rowError[id]}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-1.5 text-[10px] text-foreground-400">
              修改后按 Enter 或点击其他位置自动保存
            </div>
          </section>

          {/* 添加汇率对 */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
              添加汇率对
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-white px-3 py-2.5">
              <input
                list="erc-currency-list"
                value={newFrom}
                onChange={(e) => setNewFrom(e.target.value)}
                placeholder="源货币 如 GBP"
                className={`${inputCls} w-32 font-mono uppercase`}
              />
              <i className="ri-arrow-right-line text-[13px] text-foreground-300" aria-hidden />
              <input
                list="erc-currency-list"
                value={newTo}
                onChange={(e) => setNewTo(e.target.value)}
                placeholder="目标货币 如 CNY"
                className={`${inputCls} w-32 font-mono uppercase`}
              />
              <span className="text-[11px] text-foreground-400">1=</span>
              <input
                type="number"
                step="any"
                min="0"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="汇率"
                className={`${inputNumCls} w-24`}
              />
              <button
                type="button"
                onClick={handleAdd}
                className="flex items-center gap-1 rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary-600 cursor-pointer"
              >
                <i className="ri-add-line text-[14px]" aria-hidden />
                添加
              </button>
              {addError && <div className="w-full text-[11px] text-red-500">{addError}</div>}
            </div>
            <datalist id="erc-currency-list">
              {knownCurrencies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="mt-1.5 text-[10px] text-foreground-400">
              货币代码可自由输入（不限于常用币种）；换算支持自动中转，例如仅有 GBP→USD 与 USD→CNY 时，GBP→CNY 也可换算
            </div>
          </section>

          {/* 快捷换算 */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
              快捷换算
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-white px-3 py-2.5">
              <input
                type="number"
                step="any"
                value={convAmount}
                onChange={(e) => setConvAmount(e.target.value)}
                className={`${inputNumCls} w-24`}
              />
              <input
                list="erc-currency-list"
                value={convFrom}
                onChange={(e) => setConvFrom(e.target.value.toUpperCase())}
                className={`${inputCls} w-20 font-mono uppercase`}
              />
              <i className="ri-arrow-right-line text-[13px] text-foreground-300" aria-hidden />
              <input
                list="erc-currency-list"
                value={convTo}
                onChange={(e) => setConvTo(e.target.value.toUpperCase())}
                className={`${inputCls} w-20 font-mono uppercase`}
              />
              <span className="text-[13px] font-semibold text-primary-600">
                = {convResult != null ? Number(convResult.toPrecision(8)) : "无可用路径"}
              </span>
            </div>
          </section>

          {/* FOB 录入币种 */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
              FOB 成本录入币种
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-white px-3 py-2.5">
              <span className="text-[12px] text-foreground-600">SKU 页 FOB 成本以</span>
              <input
                list="erc-currency-list"
                value={fobDraft}
                onChange={(e) => setFobDraft(e.target.value)}
                onBlur={handleFobSave}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`${inputCls} w-24 font-mono uppercase`}
              />
              <span className="text-[12px] text-foreground-600">录入，自动换算为站点货币（当前 {siteCurrency}）</span>
              {fobCurrency === siteCurrency ? (
                <span className="text-[11px] text-foreground-500">（与站点货币相同，无需换算）</span>
              ) : fobRateToSite != null ? (
                <span className="text-[11px] text-primary-600 font-medium">
                  （当前 1 {fobCurrency} = {Number(fobRateToSite.toPrecision(8))} {siteCurrency}）
                </span>
              ) : (
                <span className="text-[11px] text-amber-600">
                  （暂无 {fobCurrency} → {siteCurrency} 换算路径，可在上方添加货币对）
                </span>
              )}
            </div>
          </section>
        </div>

        <div className="border-t border-background-200 px-4 py-2.5 text-[11px] text-foreground-400">
          汇率按货币对存储，换算沿最短路径自动中转；删除货币对可能中断部分换算
        </div>
      </div>
    </div>,
    document.body
  );
}
