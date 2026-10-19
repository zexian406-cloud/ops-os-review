import { useState, useRef, useEffect, useCallback } from "react";
import { getAllSites, getCurrentSiteId, setCurrentSiteId, ensureDefaultSites } from "@/domain/db";
import type { Site } from "@/domain/types";
import { useCurrency } from "@/hooks/useCurrency";
import ExchangeRateManager from "./ExchangeRateManager";
import SiteManager, { SITES_LIST_EVENT } from "./SiteManager";

export const SITE_CHANGE_EVENT = "ops-site-change";

export default function SiteSwitcher() {
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [siteManagerOpen, setSiteManagerOpen] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSiteId, setCurrentSiteIdState] = useState<string>("site_us");
  const ref = useRef<HTMLDivElement>(null);
  const { convert } = useCurrency();

  const loadSites = useCallback(async () => {
    await ensureDefaultSites();
    const all = await getAllSites();
    setSites(all);
  }, []);

  useEffect(() => {
    (async () => {
      await loadSites();
      const sid = await getCurrentSiteId();
      setCurrentSiteIdState(sid);
    })();
  }, [loadSites]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handler = () => loadSites();
    window.addEventListener(SITES_LIST_EVENT, handler);
    return () => window.removeEventListener(SITES_LIST_EVENT, handler);
  }, [loadSites]);

  // 站点管理弹窗内也会切换当前站点（如新增后自动切换、删除当前站点回退默认），需同步顶栏显示
  useEffect(() => {
    const handler = (e: Event) => {
      const siteId = (e as CustomEvent<{ siteId?: string }>).detail?.siteId;
      if (siteId) setCurrentSiteIdState(siteId);
    };
    window.addEventListener(SITE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(SITE_CHANGE_EVENT, handler);
  }, []);

  const handleSelect = useCallback(async (siteId: string) => {
    await setCurrentSiteId(siteId);
    setCurrentSiteIdState(siteId);
    window.dispatchEvent(new CustomEvent(SITE_CHANGE_EVENT, { detail: { siteId } }));
    setOpen(false);
  }, []);

  /** 站点货币 → USD 汇率：优先走全局汇率图（支持任意中转），无路径时回退站点旧字段 */
  const rateToUsd = useCallback(
    (site: Site) => convert(1, site.currency, "USD") ?? site.exchangeRateToUsd,
    [convert]
  );

  const current = sites.find((s) => s.id === currentSiteId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="点击切换站点 · 汇率支持任意货币对自定义（含非 USD 中转换算）"
        className="flex items-center gap-2 rounded-lg border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] text-foreground-700 hover:border-primary-400 hover:bg-background-100 cursor-pointer transition-colors"
      >
        <i className="ri-global-line text-[15px] text-primary-600" aria-hidden />
        <span className="font-medium">{current?.name ?? "选择站点"}</span>
        {current?.id === "site_demo" && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">演示</span>
        )}
        <span className="text-[11px] font-mono text-foreground-500">{current?.currency}</span>
        {current && <span className="text-[10px] text-foreground-400">1={rateToUsd(current)}$</span>}
        <i className={`ri-arrow-down-s-line text-[13px] text-foreground-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[300px] rounded-xl border border-background-200 bg-background-50 py-1 shadow-lg">
          <div className="flex items-center justify-between border-b border-background-200 px-3 py-1.5">
            <span className="text-[11px] font-medium text-foreground-500">站点切换</span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSiteManagerOpen(true);
                }}
                className="flex items-center gap-1 text-[11px] text-primary-600 hover:text-primary-700 cursor-pointer"
              >
                <i className="ri-add-circle-line" style={{ fontSize: "13px" }} aria-hidden />
                站点管理
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setManagerOpen(true);
                }}
                className="flex items-center gap-1 text-[11px] text-primary-600 hover:text-primary-700 cursor-pointer"
              >
                <i className="ri-settings-3-line" style={{ fontSize: "13px" }} aria-hidden />
                汇率管理
              </button>
            </div>
          </div>

          {sites.map((site) => (
            <div
              key={site.id}
              onClick={() => handleSelect(site.id)}
              className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-[13px] hover:bg-background-100"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-foreground-400 w-8">{site.marketplace}</span>
                <span className={site.id === currentSiteId ? "text-primary-700 font-medium" : "text-foreground-700"}>{site.name}</span>
                {!site.isActive && <span className="text-[10px] text-foreground-300">(未启用)</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-foreground-500">{site.currency}</span>
                <span className="text-[10px] text-foreground-400">1={rateToUsd(site)}$</span>
                {site.id === currentSiteId && (
                  <i className="ri-check-line text-[14px] text-primary-600" aria-hidden />
                )}
              </div>
            </div>
          ))}

          <div className="border-t border-background-200 px-3 py-1.5 text-[11px] text-foreground-400">
            冷门站点可在「站点管理」中自定义新增；「汇率管理」支持任意货币对（非 USD 中转换算）
          </div>
        </div>
      )}

      <ExchangeRateManager open={managerOpen} onClose={() => setManagerOpen(false)} />
      <SiteManager open={siteManagerOpen} onClose={() => setSiteManagerOpen(false)} />
    </div>
  );
}
