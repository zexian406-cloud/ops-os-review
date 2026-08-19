import { useState, useRef, useEffect, useCallback } from "react";
import { getAllShops } from "@/domain/db";
import type { Shop } from "@/domain/types";
import { SITE_CHANGE_EVENT } from "./SiteSwitcher";

export const SHOP_CHANGE_EVENT = "ops-shop-change";

export default function ShopFilter() {
  const [open, setOpen] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [currentShopId, setCurrentShopIdState] = useState<string>("all");
  const ref = useRef<HTMLDivElement>(null);

  const loadShops = useCallback(async () => {
    const all = await getAllShops();
    setShops(all);
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        type="button"
        onClick={() => setOpen(!open)}
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

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-background-200 bg-background-50 py-1 shadow-lg">
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
        </div>
      )}
    </div>
  );
}