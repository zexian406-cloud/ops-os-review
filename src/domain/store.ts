import { useCallback, useEffect, useMemo, useState } from "react";
import {
  db,
  DEFAULT_GLOBAL_CONFIG,
  getGlobalConfig,
  getCurrentSiteId,
  setCurrentSiteId,
  getSiteConfig,
  getAllSites,
  ensureDefaultSites,
  getCrossSiteSummary,
  getAllShops,
} from "./db";
import type {
  Alert,
  Campaign,
  DailySnapshot,
  GlobalConfig,
  InventoryLayer,
  ManualPromotion,
  Promotion,
  SkuMaster,
  Site,
  SiteConfig,
  CrossSiteReport,
  Shop,
} from "./types";
import {
  buildInventoryMap,
  buildSnapshotMap,
  computeAlerts,
  computePromotionAlerts,
  computeShipmentSuggestions,
  computeWowDeltas,
  type WowDelta,
} from "./engine";

const SITE_CHANGE_EVENT = "ops-site-change";
const SHOP_CHANGE_EVENT = "ops-shop-change";

export function useOpsData() {
  const [loading, setLoading] = useState(true);
  const [currentSiteId, setCurrentSiteIdState] = useState<string>("site_us");
  const [currentShopId, setCurrentShopIdState] = useState<string>("all");
  const [sites, setSites] = useState<Site[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);

  const [allSkuMaster, setAllSkuMaster] = useState<SkuMaster[]>([]);
  const [allSnapshots, setAllSnapshots] = useState<DailySnapshot[]>([]);
  const [allInventory, setAllInventory] = useState<InventoryLayer[]>([]);
  const [allManualPromotions, setAllManualPromotions] = useState<ManualPromotion[]>([]);
  const [allPromotions, setAllPromotions] = useState<Promotion[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<GlobalConfig>(DEFAULT_GLOBAL_CONFIG);

  const [reloadKey, setReloadKey] = useState(0);
  const [siteReloadKey, setSiteReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const switchSite = useCallback(async (siteId: string) => {
    await setCurrentSiteId(siteId);
    setCurrentSiteIdState(siteId);
    setCurrentShopIdState("all");
    setSiteReloadKey((k) => k + 1);
  }, []);

  const switchShop = useCallback((shopId: string) => {
    setCurrentShopIdState(shopId);
  }, []);

  useEffect(() => {
    const siteHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const sid = detail?.siteId ?? "site_us";
      setCurrentSiteIdState(sid);
      setCurrentShopIdState("all");
      setSiteReloadKey((k) => k + 1);
    };
    const shopHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCurrentShopIdState(detail?.shopId ?? "all");
    };
    window.addEventListener(SITE_CHANGE_EVENT, siteHandler);
    window.addEventListener(SHOP_CHANGE_EVENT, shopHandler);
    return () => {
      window.removeEventListener(SITE_CHANGE_EVENT, siteHandler);
      window.removeEventListener(SHOP_CHANGE_EVENT, shopHandler);
    };
  }, []);

  useEffect(() => {
    (async () => {
      await ensureDefaultSites();
      const allSites = await getAllSites();
      setSites(allSites);
      const sid = await getCurrentSiteId();
      setCurrentSiteIdState(sid);
      const site = allSites.find((s) => s.id === sid) ?? allSites[0];
      setCurrentSite(site ?? null);
    })();
  }, []);

  useEffect(() => {
    const site = sites.find((s) => s.id === currentSiteId);
    if (site) setCurrentSite(site);
    (async () => {
      const allShops = await getAllShops();
      const siteShops = allShops.filter(s => s.siteId === currentSiteId || !s.siteId);
      setShops(siteShops);
    })();
  }, [currentSiteId, sites]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [sm, snap, inv, camps, promos, manPromos, siteCfg] = await Promise.all([
          db.skuMaster.toArray(),
          db.dailySnapshot.toArray(),
          db.inventoryLayer.toArray(),
          db.campaigns.toArray(),
          db.promotions.toArray(),
          db.manualPromotions.toArray(),
          getSiteConfig(currentSiteId),
        ]);
        if (!mounted) return;
        setAllSkuMaster(sm);
        setAllSnapshots(snap);
        setAllInventory(inv);
        setAllCampaigns(camps);
        setAllPromotions(promos);
        setAllManualPromotions(manPromos);
        setConfig({
          defaultLeadTime: siteCfg.defaultLeadTime,
          defaultSafetyStockDays: siteCfg.defaultSafetyStockDays,
          defaultTargetCoverDays: siteCfg.defaultTargetCoverDays,
          salesBasis: undefined,
          profitMarginThreshold: siteCfg.profitMarginThreshold,
          adRatioThreshold: siteCfg.adRatioThreshold,
          ratingDropThreshold: siteCfg.ratingDropThreshold,
          returnRateThreshold: siteCfg.returnRateThreshold,
          lifecycleNewDays: siteCfg.lifecycleNewDays,
          lifecycleGrowthDays: siteCfg.lifecycleGrowthDays,
        });
      } catch (err) {
        console.error("[ops-store] load failed", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [currentSiteId, siteReloadKey, reloadKey]);

  const siteSkuMaster = useMemo(() => {
    return allSkuMaster.filter(s => (s.siteId ?? "site_us") === currentSiteId);
  }, [allSkuMaster, currentSiteId]);

  const siteSnapshots = useMemo(() => {
    const skuSet = new Set(siteSkuMaster.map(s => s.sku));
    return allSnapshots.filter(s => skuSet.has(s.sku));
  }, [allSnapshots, siteSkuMaster]);

  const siteInventory = useMemo(() => {
    const skuSet = new Set(siteSkuMaster.map(s => s.sku));
    return allInventory.filter(s => skuSet.has(s.sku));
  }, [allInventory, siteSkuMaster]);

  const skuMaster = useMemo(() => {
    if (currentShopId === "all") return siteSkuMaster;
    return siteSkuMaster.filter(s => s.store === currentShopId);
  }, [siteSkuMaster, currentShopId]);

  const snapshots = useMemo(() => {
    if (currentShopId === "all") return siteSnapshots;
    const skuSet = new Set(skuMaster.map(s => s.sku));
    return siteSnapshots.filter(s => skuSet.has(s.sku));
  }, [siteSnapshots, skuMaster, currentShopId]);

  const inventory = useMemo(() => {
    if (currentShopId === "all") return siteInventory;
    const skuSet = new Set(skuMaster.map(s => s.sku));
    return siteInventory.filter(s => skuSet.has(s.sku));
  }, [siteInventory, skuMaster, currentShopId]);

  const campaigns = useMemo(() => {
    return allCampaigns.filter(c => (c.siteId ?? "site_us") === currentSiteId);
  }, [allCampaigns, currentSiteId]);

  const promotions = useMemo(() => {
    return allPromotions.filter(p => (p.siteId ?? "site_us") === currentSiteId);
  }, [allPromotions, currentSiteId]);

  const manualPromotions = useMemo(() => {
    return allManualPromotions.filter(p => (p.siteId ?? "site_us") === currentSiteId);
  }, [allManualPromotions, currentSiteId]);

  const latestSnapshot = useMemo(() => buildSnapshotMap(snapshots), [snapshots]);
  const latestInventory = useMemo(() => buildInventoryMap(inventory), [inventory]);

  const previousSnapshot = useMemo(() => {
    const dates = Array.from(new Set(snapshots.map((s) => s.date))).sort();
    if (dates.length < 2) return undefined;
    const prevDate = dates[dates.length - 2];
    const map = new Map<string, DailySnapshot>();
    snapshots
      .filter((s) => s.date === prevDate)
      .forEach((s) => map.set(s.sku, { ...s, adRatio: Math.abs(s.adRatio) }));
    return map;
  }, [snapshots]);

  const today = useMemo(() => {
    const dates = snapshots.map((s) => s.date);
    return dates.length ? dates.sort().at(-1)! : new Date().toISOString().slice(0, 10);
  }, [snapshots]);

  const activeCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (!c.active) return false;
      return c.startDate <= today && c.endDate >= today;
    });
  }, [campaigns, today]);

  // Global alerts from all data (not filtered)
  const allLatestSnapshot = useMemo(() => buildSnapshotMap(allSnapshots), [allSnapshots]);
  const allLatestInventory = useMemo(() => buildInventoryMap(allInventory), [allInventory]);

  const allPreviousSnapshot = useMemo(() => {
    const dates = Array.from(new Set(allSnapshots.map((s) => s.date))).sort();
    if (dates.length < 2) return undefined;
    const prevDate = dates[dates.length - 2];
    const map = new Map<string, DailySnapshot>();
    allSnapshots
      .filter((s) => s.date === prevDate)
      .forEach((s) => map.set(s.sku, { ...s, adRatio: Math.abs(s.adRatio) }));
    return map;
  }, [allSnapshots]);

  const allToday = useMemo(() => {
    const dates = allSnapshots.map((s) => s.date);
    return dates.length ? dates.sort().at(-1)! : new Date().toISOString().slice(0, 10);
  }, [allSnapshots]);

  const promotionAlerts = useMemo(() => {
    return computePromotionAlerts({ promotions: allPromotions, today: allToday });
  }, [allPromotions, allToday]);

  const computedAlerts = useMemo(() => {
    const base = computeAlerts({
      skuMaster: allSkuMaster,
      latestSnapshot: allLatestSnapshot,
      latestInventory: allLatestInventory,
      manualPromotions: allManualPromotions,
      previousSnapshot: allPreviousSnapshot,
      config,
      today: allToday,
    });
    return [...base, ...promotionAlerts];
  }, [allSkuMaster, allLatestSnapshot, allLatestInventory, allManualPromotions, allPreviousSnapshot, config, allToday, promotionAlerts]);

  useEffect(() => {
    setAlerts(computedAlerts);
  }, [computedAlerts]);

  const shipmentSuggestions = useMemo(() => {
    return computeShipmentSuggestions({
      skuMaster,
      latestSnapshot,
      latestInventory,
      activeCampaigns,
      config,
      today,
    });
  }, [skuMaster, latestSnapshot, latestInventory, activeCampaigns, config, today]);

  const wowDeltas = useMemo((): WowDelta[] => {
    if (!previousSnapshot) return [];
    return computeWowDeltas({
      skuMaster,
      latestSnapshot,
      latestInventory,
      previousSnapshot,
      config,
    });
  }, [skuMaster, latestSnapshot, latestInventory, previousSnapshot, config]);

  return {
    loading,
    currentSiteId,
    currentSite,
    sites,
    switchSite,
    currentShopId,
    shops,
    switchShop,
    skuMaster,
    snapshots,
    inventory,
    campaigns,
    promotions,
    manualPromotions,
    latestSnapshot,
    latestInventory,
    activeCampaigns,
    shipmentSuggestions,
    wowDeltas,
    today,
    alerts,
    config,
    reload,
    setConfig,
  };
}

export function useCrossSiteReport() {
  const [report, setReport] = useState<CrossSiteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await getCrossSiteSummary();
        if (mounted) setReport(r);
      } catch (err) {
        console.error("[cross-site] load failed", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [reloadKey]);

  return { report, loading, reload };
}