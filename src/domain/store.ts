import { useCallback, useEffect, useMemo, useState } from "react";
import {
  db,
  DEFAULT_GLOBAL_CONFIG,
  getGlobalConfig,
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
import {
  computeHealthScores,
  type HealthScore,
} from "./healthScore";

/**
 * Central hook. Every module (Dashboard, Shipment, Risk, SKU detail,
 * Operations, Season sim) consumes this — data is loaded once, shared
 * everywhere; nothing is duplicated.
 */
export function useOpsData() {
  const [loading, setLoading] = useState(true);
  const [skuMaster, setSkuMaster] = useState<SkuMaster[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [inventory, setInventory] = useState<InventoryLayer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [manualPromotions, setManualPromotions] = useState<ManualPromotion[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<GlobalConfig>(DEFAULT_GLOBAL_CONFIG);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [sm, snap, inv, camps, promos, manPromos, cfg] = await Promise.all([
          db.skuMaster.toArray(),
          db.dailySnapshot.toArray(),
          db.inventoryLayer.toArray(),
          db.campaigns.toArray(),
          db.promotions.toArray(),
          db.manualPromotions.toArray(),
          getGlobalConfig(),
        ]);
        if (!mounted) return;
        setSkuMaster(sm);
        setSnapshots(snap);
        setInventory(inv);
        setCampaigns(camps);
        setPromotions(promos);
        setManualPromotions(manPromos);
        setConfig(cfg);
      } catch (err) {
        console.error("[ops-store] load failed", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const latestSnapshot = useMemo(() => buildSnapshotMap(snapshots), [snapshots]);
  const latestInventory = useMemo(
    () => buildInventoryMap(inventory),
    [inventory]
  );

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

  const promotionAlerts = useMemo(() => {
    return computePromotionAlerts({ promotions, today });
  }, [promotions, today]);

  const computedAlerts = useMemo(() => {
    const base = computeAlerts({
      skuMaster,
      latestSnapshot,
      latestInventory,
      manualPromotions,
      previousSnapshot,
      config,
      today,
    });
    return [...base, ...promotionAlerts];
  }, [skuMaster, latestSnapshot, latestInventory, previousSnapshot, config, today, promotionAlerts]);

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

  // ── 按 SKU 分组的告警（供健康评分引擎使用）──
  const alertsBySku = useMemo(() => {
    const map = new Map<string, Alert[]>();
    for (const a of computedAlerts) {
      if (!map.has(a.sku)) map.set(a.sku, []);
      map.get(a.sku)!.push(a);
    }
    return map;
  }, [computedAlerts]);

  // ── SKU 健康评分 ──
  const healthScores = useMemo((): Map<string, HealthScore> => {
    return computeHealthScores({
      skuMaster,
      latest: latestSnapshot,
      previous: previousSnapshot ?? new Map<string, DailySnapshot>(),
      alertsBySku,
      wowBySku: new Map<string, unknown>(),
      config,
    });
  }, [skuMaster, latestSnapshot, previousSnapshot, alertsBySku, config]);

  useEffect(() => {
    setAlerts(computedAlerts);
  }, [computedAlerts]);

  return {
    loading,
    skuMaster,
    snapshots,
    inventory,
    campaigns,
    promotions,
    manualPromotions,
    alerts,
    config,
    latestSnapshot,
    latestInventory,
    previousSnapshot,
    activeCampaigns,
    shipmentSuggestions,
    wowDeltas,
    healthScores,
    today,
    reload,
    setConfig,
  };
}