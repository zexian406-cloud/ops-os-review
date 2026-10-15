import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { addSite, deleteSite, getAllSites, getCurrentSiteId, setCurrentSiteId, updateSite } from "@/domain/db";
import type { Site } from "@/domain/types";
import { SITE_CHANGE_EVENT } from "./SiteSwitcher";

/** 站点列表变更事件：新增/编辑/删除/启停后广播，站点切换器监听刷新 */
export const SITES_LIST_EVENT = "ops-sites-change";

export const COMMON_CURRENCIES = [
  "USD", "CNY", "EUR", "GBP", "JPY", "CAD", "AUD", "MXN", "SEK", "PLN",
  "AED", "SAR", "BRL", "INR", "KRW", "SGD", "HKD", "NZD", "CHF", "TRY",
  "EGP", "ILS", "NGN", "ZAR", "COP", "CLP",
];

export const SYMBOL_MAP: Record<string, string> = {
  USD: "$", CNY: "¥", EUR: "€", GBP: "£", JPY: "¥", CAD: "C$", AUD: "A$",
  MXN: "MX$", SEK: "kr", PLN: "zł", AED: "د.إ", SAR: "﷼", BRL: "R$",
  INR: "₹", KRW: "₩", SGD: "S$", HKD: "HK$", NZD: "NZ$", CHF: "CHF",
  TRY: "₺", EGP: "E£", ILS: "₪", NGN: "₦", ZAR: "R", COP: "COL$", CLP: "CLP$",
};

const inputCls =
  "rounded-md border border-background-300 bg-white px-2 py-1 text-[12px] text-foreground-700 focus:border-primary-400 focus:outline-none";
const inputNumCls = `${inputCls} font-mono text-right`;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SiteManager({ open, onClose }: Props) {
  const [sites, setSites] = useState<Site[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", marketplace: "", currency: "", currencySymbol: "", commissionRate: 15 });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", marketplace: "", currency: "", currencySymbol: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    setSites(await getAllSites());
  }, []);

  useEffect(() => {
    if (open) loadSites();
  }, [open, loadSites]);

  useEffect(() => {
    if (!open) return;
    const handler = () => loadSites();
    window.addEventListener(SITES_LIST_EVENT, handler);
    return () => window.removeEventListener(SITES_LIST_EVENT, handler);
  }, [open, loadSites]);

  const notifyChange = () => window.dispatchEvent(new CustomEvent(SITES_LIST_EVENT));

  const guessSymbol = (currency: string) => SYMBOL_MAP[currency.toUpperCase()] ?? currency.toUpperCase();

  const handleAdd = async () => {
    const name = form.name.trim();
    const marketplace = form.marketplace.trim().toUpperCase();
    const currency = form.currency.trim().toUpperCase();
    if (!name || !marketplace || !currency) {
      setFormError("站点名称、代码、币种均不能为空");
      return;
    }
    setFormError(null);
    const site = await addSite({
      name,
      marketplace,
      currency,
      currencySymbol: form.currencySymbol.trim() || guessSymbol(currency),
      exchangeRateToUsd: 1.0,
      commissionRate: 15,
      vatRate: 0,
      isActive: true,
      sortOrder: (sites.reduce((m, s) => Math.max(m, s.sortOrder), 0) || 0) + 1,
    });
    setForm({ name: "", marketplace: "", currency: "", currencySymbol: "" });
    notifyChange();
    // 新站点自动设为当前站点，方便立即配置汇率
    await setCurrentSiteId(site.id);
    window.dispatchEvent(new CustomEvent(SITE_CHANGE_EVENT, { detail: { siteId: site.id } }));
  };

  const startEdit = (site: Site) => {
    setEditingId(site.id);
    setConfirmDeleteId(null);
    setEditDraft({
      name: site.name,
      marketplace: site.marketplace,
      currency: site.currency,
      currencySymbol: site.currencySymbol,
      commissionRate: site.commissionRate,
    });
  };

  const saveEdit = async (id: string) => {
    const name = editDraft.name.trim();
    const marketplace = editDraft.marketplace.trim().toUpperCase();
    const currency = editDraft.currency.trim().toUpperCase();
    if (!name || !marketplace || !currency) return;
    await updateSite(id, {
      name,
      marketplace,
      currency,
      currencySymbol: editDraft.currencySymbol.trim() || guessSymbol(currency),
      commissionRate: Number.isFinite(editDraft.commissionRate) ? editDraft.commissionRate : 15,
    });
    setEditingId(null);
    notifyChange();
  };

  const toggleActive = async (site: Site) => {
    await updateSite(site.id, { isActive: !site.isActive });
    notifyChange();
  };

  const handleDelete = async (site: Site) => {
    if (confirmDeleteId !== site.id) {
      setConfirmDeleteId(site.id);
      return;
    }
    setConfirmDeleteId(null);
    // 删除的是当前站点时，先切回默认站点再删
    if ((await getCurrentSiteId()) === site.id) {
      await setCurrentSiteId("site_us");
      window.dispatchEvent(new CustomEvent(SITE_CHANGE_EVENT, { detail: { siteId: "site_us" } }));
    }
    await deleteSite(site.id);
    notifyChange();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-background-200 bg-background-50 shadow-xl">
        <div className="flex items-center justify-between border-b border-background-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <i className="ri-global-line text-[18px] text-primary-600" aria-hidden />
            <span className="text-sm font-semibold text-foreground-800">站点管理</span>
            <span className="text-[11px] text-foreground-400">支持自定义冷门站点</span>
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
          {/* 站点列表 */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
              全部站点（{sites.length}）
            </div>
            <div className="space-y-1.5">
              {sites.map((site) => {
                const editing = editingId === site.id;
                const isPreset = site.id === "site_us";
                return (
                  <div key={site.id} className="rounded-lg border border-background-200 bg-white px-3 py-2">
                    {editing ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))}
                            placeholder="站点名称 如 澳大利亚站"
                            className={`${inputCls} w-36`}
                          />
                          <input
                            value={editDraft.marketplace}
                            onChange={(e) => setEditDraft((p) => ({ ...p, marketplace: e.target.value }))}
                            placeholder="代码 如 AU"
                            className={`${inputCls} w-16 font-mono uppercase`}
                          />
                          <input
                            list="stm-currency-list"
                            value={editDraft.currency}
                            onChange={(e) => {
                              const v = e.target.value.toUpperCase();
                              setEditDraft((p) => ({ ...p, currency: v, currencySymbol: guessSymbol(v) }));
                            }}
                            placeholder="币种"
                            className={`${inputCls} w-20 font-mono uppercase`}
                          />
                          <input
                            value={editDraft.currencySymbol}
                            onChange={(e) => setEditDraft((p) => ({ ...p, currencySymbol: e.target.value }))}
                            placeholder="符号"
                            className={`${inputCls} w-14`}
                          />
                          <label className="flex items-center gap-1 text-[11px] text-foreground-500">
                            佣金率%
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={editDraft.commissionRate}
                              onChange={(e) => setEditDraft((p) => ({ ...p, commissionRate: Number(e.target.value) }))}
                              className={`${inputNumCls} w-16`}
                            />
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(site.id)}
                            className="rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-primary-700 cursor-pointer"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-background-300 bg-white px-2.5 py-1 text-[11px] text-foreground-500 hover:text-foreground-700 cursor-pointer"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-[11px] font-mono font-medium text-foreground-500">{site.marketplace}</span>
                        <span className="truncate text-[13px] font-medium text-foreground-800">{site.name}</span>
                        {!site.isActive && <span className="shrink-0 text-[10px] text-foreground-300">未启用</span>}
                        <span className="ml-auto shrink-0 text-[11px] font-mono text-foreground-500">{site.currency} {site.currencySymbol}</span>
                        <button
                          type="button"
                          onClick={() => toggleActive(site)}
                          title={site.isActive ? "点击停用" : "点击启用"}
                          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] cursor-pointer ${
                            site.isActive
                              ? "border-green-200 bg-green-50 text-green-600 hover:bg-green-100"
                              : "border-background-300 bg-background-50 text-foreground-400 hover:text-foreground-600"
                          }`}
                        >
                          {site.isActive ? "已启用" : "未启用"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(site)}
                          title="编辑"
                          className="shrink-0 rounded p-1 text-foreground-300 hover:bg-background-100 hover:text-primary-600 cursor-pointer"
                          aria-label={`编辑 ${site.name}`}
                        >
                          <i className="ri-edit-line text-[14px]" aria-hidden />
                        </button>
                        {!isPreset && (
                          <button
                            type="button"
                            onClick={() => handleDelete(site)}
                            title={confirmDeleteId === site.id ? "再次点击确认删除" : "删除站点（SKU 归入默认站点）"}
                            className={`shrink-0 rounded p-1 cursor-pointer ${
                              confirmDeleteId === site.id
                                ? "bg-red-50 text-red-500"
                                : "text-foreground-300 hover:bg-red-50 hover:text-red-500"
                            }`}
                            aria-label={`删除 ${site.name}`}
                          >
                            <i className={`${confirmDeleteId === site.id ? "ri-alert-line" : "ri-delete-bin-line"} text-[14px]`} aria-hidden />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 text-[10px] text-foreground-400">
              默认站点（美国站）不可删除；删除自定义站点时，其下 SKU 与店铺自动归入默认站点
            </div>
          </section>

          {/* 新增站点 */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
              新增自定义站点
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-white px-3 py-2.5">
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="名称 如 澳大利亚站"
                className={`${inputCls} w-36`}
              />
              <input
                value={form.marketplace}
                onChange={(e) => setForm((p) => ({ ...p, marketplace: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="代码 如 AU"
                className={`${inputCls} w-16 font-mono uppercase`}
              />
              <input
                list="stm-currency-list"
                value={form.currency}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setForm((p) => ({ ...p, currency: v, currencySymbol: guessSymbol(v) }));
                }}
                placeholder="币种 如 AUD"
                className={`${inputCls} w-24 font-mono uppercase`}
              />
              <input
                value={form.currencySymbol}
                onChange={(e) => setForm((p) => ({ ...p, currencySymbol: e.target.value }))}
                placeholder="符号"
                className={`${inputCls} w-14`}
              />
              <button
                type="button"
                onClick={handleAdd}
                className="flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-primary-700 cursor-pointer"
              >
                <i className="ri-add-line text-[14px]" aria-hidden />
                添加
              </button>
            </div>
            {formError && <div className="mt-1 text-[11px] text-red-500">{formError}</div>}
            <div className="mt-1.5 text-[10px] text-foreground-400">
              新站点自动启用并切换为当前站点；初始汇率为 1=1$，请到「汇率管理」配置真实汇率（冷门币种直接输入即可，不必在列表中）
            </div>
            <datalist id="stm-currency-list">
              {COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
