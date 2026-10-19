import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { getAllShops, getCurrentSiteId } from "@/domain/db";
import type { Shop } from "@/domain/types";
import { SITE_CHANGE_EVENT } from "./SiteSwitcher";

export const SHOP_CHANGE_EVENT = "ops-shop-change";

export default function ShopFilter() {
  const [open, setOpen] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [currentShopId, setCurrentShopIdState] = useState<string>("all");
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadShops = useCallback(async () => {
    const [all, siteId] = await Promise.all([getAllShops(), getCurrentSiteId()]);
    // 与 useOpsData 口径一致：只显示当前站点的店铺和全局店铺
    setShops(all.filter((s) => !s.siteId || s.siteId === siteId));
  }, []);

  useEffect(() => {
    loadShops();
    const handler = () => {
      setCurrentShopIdState("all");
      loadShops();
    };
    window.addEventListener(SITE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(SITE_CHANGE_EVENT, handler);
  }, [loadShops]);

  const openPanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPanelPos({ top: rect.bottom + 6, left: rect.left });
    setOpen((v) => !v);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      // 面板经 Portal 渲染在 body 下，不在 ref 容器内，需一并放行
      if (
        ref.current && !ref.current.contains(t) &&
        !(panelRef.current && panelRef.current.contains(t))
      ) {
        setOpen(false);
      }
    }
    function handleScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const handleSelect = useCallback((shopId: string) => {
    setCurrentShopIdState(shopId);
    window.dispatchEvent(new CustomEvent(SHOP_CHANGE_EVENT, { detail: { shopId } }));
    setOpen(false);
  }, []);

  if (shops.length <= 1 && currentShopId === "all") return null;

  const current = shops.find((s) => s.id === currentShopId);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPanel}
        className="flex items-center gap-1.5 rounded-lg border border-background-300/70 bg-background-50 px-2.5 py-1.5 text-[13px] text-foreground-700 hover:border-primary-400 hover:bg-background-100 cursor-pointer transition-colors"
      >
        <i className="ri-store-2-line text-[14px] text-foreground-500" aria-hidden />
        {currentShopId === "all" ? (
          <span className="font-medium">全部店铺</span>
        ) : (
          <span className="font-medium">{current?.name ?? "未知店铺"}</span>
        )}
        <i className={`ri-arrow-down-s-line text-[13px] text-foreground-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 80 }}
            className="min-w-[160px] rounded-xl border border-background-200 bg-background-50 py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => handleSelect("all")}
              className={`flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-background-100 cursor-pointer ${
                currentShopId === "all" ? "bg-primary-50 text-primary-700 font-medium" : "text-foreground-700"
              }`}
            >
              <span>全部店铺</span>
              {currentShopId === "all" && (
                <i className="ri-check-line text-[14px] text-primary-600" aria-hidden />
              )}
            </button>
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                onClick={() => handleSelect(shop.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-background-100 cursor-pointer ${
                  shop.id === currentShopId ? "bg-primary-50 text-primary-700 font-medium" : "text-foreground-700"
                }`}
              >
                <span>{shop.name}</span>
                {shop.id === currentShopId && (
                  <i className="ri-check-line text-[14px] text-primary-600" aria-hidden />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
