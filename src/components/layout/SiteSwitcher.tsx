import { useState, useRef, useEffect, useCallback } from "react";
import { getAllSites, getCurrentSiteId, setCurrentSiteId, updateSite } from "@/domain/db";
import type { Site } from "@/domain/types";

export const SITE_CHANGE_EVENT = "ops-site-change";

export default function SiteSwitcher() {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSiteId, setCurrentSiteIdState] = useState<string>("site_us");
  const [editingRates, setEditingRates] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  const loadSites = useCallback(async () => {
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
        setEditMode(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(async (siteId: string) => {
    if (editMode) return;
    await setCurrentSiteId(siteId);
    setCurrentSiteIdState(siteId);
    window.dispatchEvent(new CustomEvent(SITE_CHANGE_EVENT, { detail: { siteId } }));
    setOpen(false);
  }, [editMode]);

  const handleRateChange = useCallback((siteId: string, value: string) => {
    setEditingRates(prev => ({ ...prev, [siteId]: value }));
  }, []);

  const handleRateSave = useCallback(async (siteId: string) => {
    const rateStr = editingRates[siteId];
    if (!rateStr) return;
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate <= 0) return;
    await updateSite(siteId, { exchangeRateToUsd: rate });
    await loadSites();
    setEditingRates(prev => {
      const next = { ...prev };
      delete next[siteId];
      return next;
    });
  }, [editingRates, loadSites]);

  const current = sites.find((s) => s.id === currentSiteId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-background-300/70 bg-background-50 px-3 py-1.5 text-[13px] text-foreground-700 hover:border-primary-400 hover:bg-background-100 cursor-pointer transition-colors"
      >
        <i className="ri-global-line text-[15px] text-primary-600" aria-hidden />
        <span className="font-medium">{current?.name ?? "选择站点"}</span>
        <span className="text-[11px] font-mono text-foreground-500">{current?.currency}</span>
        <span className="text-[10px] text-foreground-400">1={current?.exchangeRateToUsd}$</span>
        <i className={`ri-arrow-down-s-line text-[13px] text-foreground-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[300px] rounded-xl border border-background-200 bg-background-50 py-1 shadow-lg">
          <div className="flex items-center justify-between border-b border-background-200 px-3 py-1.5">
            <span className="text-[11px] font-medium text-foreground-500">
              {editMode ? "汇率设置（本站货币 = ? USD）" : "站点切换"}
            </span>
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1 text-[11px] text-primary-600 hover:text-primary-700 cursor-pointer"
            >
              <i className={editMode ? "ri-check-line" : "ri-settings-3-line"} style={{ fontSize: "13px" }} aria-hidden />
              {editMode ? "完成" : "汇率设置"}
            </button>
          </div>

          {sites.map((site) => (
            <div
              key={site.id}
              onClick={() => !editMode && handleSelect(site.id)}
              className={`flex w-full items-center justify-between px-3 py-2 text-[13px] ${
                editMode ? "cursor-default" : "hover:bg-background-100 cursor-pointer"
              } ${site.id === currentSiteId && !editMode ? "bg-primary-50 text-primary-700 font-medium" : "text-foreground-700"}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-foreground-400 w-8">{site.marketplace}</span>
                <span>{site.name}</span>
                {!site.isActive && <span className="text-[10px] text-foreground-300">(未启用)</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-foreground-500">{site.currency}</span>
                {editMode ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-foreground-400">1=</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={editingRates[site.id] ?? site.exchangeRateToUsd}
                      onChange={(e) => handleRateChange(site.id, e.target.value)}
                      onBlur={() => handleRateSave(site.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-16 rounded border border-background-300 bg-background-50 px-1.5 py-0.5 text-[11px] text-foreground-700 focus:border-primary-400 focus:outline-none"
                    />
                    <span className="text-[10px] text-foreground-400">USD</span>
                  </div>
                ) : (
                  <>
                    <span className="text-[10px] text-foreground-400">1={site.exchangeRateToUsd}$</span>
                    {site.id === currentSiteId && (
                      <i className="ri-check-line text-[14px] text-primary-600" aria-hidden />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          <div className="border-t border-background-200 px-3 py-1.5 text-[11px] text-foreground-400">
            {editMode ? "修改汇率后按 Enter 或点击其他位置自动保存" : "点击「汇率设置」可修改各站汇率（本站货币 → USD）"}
          </div>
        </div>
      )}
    </div>
  );
}