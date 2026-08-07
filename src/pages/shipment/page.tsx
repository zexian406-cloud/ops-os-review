import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { computeWarehouseTotals } from "@/domain/calculator";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import PageLayoutCustomizer from "@/components/layout/PageLayoutCustomizer";
import CanvasLayout from "@/components/layout/CanvasLayout";
import { type Layout } from "react-grid-layout";
import { usePageLayout, type GridItemLayout } from "@/hooks/usePageLayout";
import {
  useShipmentKpiLayout,
  SHIPMENT_KPI_METRIC_LABELS,
  SHIPMENT_KPI_METRIC_ICONS,
  SHIPMENT_KPI_METRIC_TONES,
  DEFAULT_SHIPMENT_KPI_SLOTS,
} from "@/hooks/useLayoutPrefs";
import type { ShipmentKpiMetricKey } from "@/hooks/useLayoutPrefs";
import { computeShipmentSuggestions } from "@/domain/engine";
import type { TransitBatch, InventoryLayer } from "@/domain/types";

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

type SortMode = "priority" | "urgency" | "coverAsc" | "coverDesc" | "qtyDesc" | "name";
const SORT_LABELS: Record<SortMode, string> = {
  priority: "按优先级(紧急优先)",
  urgency: "按紧急程度(覆盖天数升序)",
  coverAsc: "覆盖天数从低到高",
  coverDesc: "覆盖天数从高到低",
  qtyDesc: "建议发货量从多到少",
  name: "按 SKU 名称",
};

export default function Shipment() {
  const { loading, skuMaster, snapshots, activeCampaigns, config, latestSnapshot, latestInventory } = useOpsData();
  const [filter, setFilter] = useState<"all" | "urgent" | "high" | "normal" | "low">("all");
  const [keyword, setKeyword] = useState("");
  const [salesBasis, setSalesBasis] = useState<"7d" | "30d">("7d");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const {
    customizing, setCustomizing, toggleSection, reset: resetLayout,
    visibleKeys, allKeys, gridLayout, setGridLayout,
  } = usePageLayout("shipment");

  const {
    customizingKpi, setCustomizingKpi, setKpiSlot, resetKpi, kpiSlots,
  } = useShipmentKpiLayout();

  const customizingMode = customizing || customizingKpi;

  // ── 构建 ReactGridLayout 布局数组 ──
  const rglLayout: Layout[] = useMemo(() => {
    return visibleKeys.map((key) => {
      const item = (gridLayout as Record<string, GridItemLayout>)[key] ?? { x: 0, y: 0, w: 12, h: 6 };
      return { i: key, x: item.x, y: item.y, w: item.w, h: item.h, minW: 3, maxW: 12, minH: 2 };
    });
  }, [visibleKeys, gridLayout]);

  const handleLayoutChange = useCallback((layout: Layout[]) => {
    setGridLayout(layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
  }, [setGridLayout]);

  const today = useMemo(() => {
    const dates = snapshots.map((s) => s.date);
    return dates.length ? dates.sort().at(-1)! : new Date().toISOString().slice(0, 10);
  }, [snapshots]);

  const shipmentSuggestions = useMemo(() => computeShipmentSuggestions({
    skuMaster, latestSnapshot, latestInventory, activeCampaigns, config, today, salesBasis,
  }), [skuMaster, latestSnapshot, latestInventory, activeCampaigns, config, today, salesBasis]);

  const skuSuggestions = useMemo(() => {
    const sugMap = new Map(shipmentSuggestions.map((s) => [s.sku, s]));
    const items = skuMaster
      .filter((sm) => sm.saleStatus !== "discontinued")
      .map((sm) => {
        const snap = latestSnapshot.get(sm.sku);
        const inv = latestInventory.get(sm.sku);
        const sug = sugMap.get(sm.sku);
        const wh = computeWarehouseTotals(inv);
        const totalStock = wh.inStock;
        const totalTransit = wh.inTransit;
        const daily = salesBasis === "30d"
          ? (snap && snap.monthlySales > 0 ? snap.monthlySales / 30 : 0)
          : (snap?.dailySales7d ?? 0);
        const coverOnHand = daily > 0 ? Math.round(totalStock / daily) : 999;
        const coverWithTransit = daily > 0 ? Math.round((totalStock + totalTransit) / daily) : 999;
        const target = sug?.targetCoverDays ?? 60;
        const leadTime = sm.leadTimeDays ?? sug?.leadTimeDays ?? config.defaultLeadTime;
        const safetyDays = sm.safetyStockDays ?? sug?.safetyStockDays ?? config.defaultSafetyStockDays;
        const dynamicThreshold = leadTime + safetyDays;
        const needShip = coverWithTransit < dynamicThreshold && daily > 0;
        return { sku: sm, snap, inv, sug, totalStock, totalTransit, coverOnHand, coverWithTransit, target, needShip, daily, leadTime, safetyDays, dynamicThreshold };
      })
      .filter((item) => {
        if (filter !== "all") {
          const p = item.sug?.priority ?? "low";
          if (p !== filter) return false;
        }
        if (keyword.trim()) {
          const kw = keyword.trim().toLowerCase();
          if (!item.sku.sku.toLowerCase().includes(kw) && !item.sku.name.toLowerCase().includes(kw)) return false;
        }
        return true;
      });

    const sorted = [...items];
    switch (sortMode) {
      case "priority":
        sorted.sort((a, b) => {
          const pa = PRIORITY_WEIGHT[a.sug?.priority ?? "low"];
          const pb = PRIORITY_WEIGHT[b.sug?.priority ?? "low"];
          if (pa !== pb) return pa - pb;
          return (a.coverWithTransit - a.dynamicThreshold) - (b.coverWithTransit - b.dynamicThreshold);
        });
        break;
      case "urgency":
        sorted.sort((a, b) => (a.coverWithTransit - a.dynamicThreshold) - (b.coverWithTransit - b.dynamicThreshold));
        break;
      case "coverAsc":
        sorted.sort((a, b) => a.coverWithTransit - b.coverWithTransit);
        break;
      case "coverDesc":
        sorted.sort((a, b) => b.coverWithTransit - a.coverWithTransit);
        break;
      case "qtyDesc":
        sorted.sort((a, b) => (b.sug?.suggestQty ?? 0) - (a.sug?.suggestQty ?? 0));
        break;
      case "name":
        sorted.sort((a, b) => a.sku.sku.localeCompare(b.sku.sku));
        break;
    }
    return sorted;
  }, [skuMaster, latestSnapshot, latestInventory, shipmentSuggestions, filter, keyword, salesBasis, sortMode, config]);

  const urgentCount = shipmentSuggestions.filter((s) => s.priority === "urgent").length;
  const totalQty = shipmentSuggestions.reduce((s, r) => s + r.suggestQty, 0);
  const totalValue = shipmentSuggestions.reduce((s, r) => {
    const sku = skuMaster.find((k) => k.sku === r.sku);
    return s + r.suggestQty * (sku?.costFob ?? 0);
  }, 0);

  // 计算全部在途/海外仓/工厂库存
  const totalTransitQty = useMemo(() => {
    let qty = 0;
    latestInventory.forEach((inv) => { qty += computeWarehouseTotals(inv).inTransit; });
    return qty;
  }, [latestInventory]);

  const totalOverseasQty = useMemo(() => {
    let qty = 0;
    latestInventory.forEach((inv) => { qty += computeWarehouseTotals(inv).inStock; });
    return qty;
  }, [latestInventory]);

  const totalFactoryQty = useMemo(() => {
    let qty = 0;
    latestInventory.forEach((inv) => { qty += (inv?.factoryStock ?? 0); });
    return qty;
  }, [latestInventory]);

  const minCoverDays = useMemo(() => {
    const vals = shipmentSuggestions
      .map((s) => {
        const inv = latestInventory.get(s.sku);
        const snap = latestSnapshot.get(s.sku);
        const wh = computeWarehouseTotals(inv);
        const combined = wh.inStock + wh.inTransit;
        const daily = salesBasis === "30d"
          ? (snap && snap.monthlySales > 0 ? snap.monthlySales / 30 : 0)
          : (snap?.dailySales7d ?? 0);
        return daily > 0 ? Math.round(combined / daily) : 999;
      })
      .filter((v) => v < 999);
    return vals.length > 0 ? Math.min(...vals) : 999;
  }, [shipmentSuggestions, latestInventory, latestSnapshot, salesBasis]);

  const avgCoverDays = useMemo(() => {
    const vals = shipmentSuggestions
      .map((s) => {
        const inv = latestInventory.get(s.sku);
        const snap = latestSnapshot.get(s.sku);
        const wh = computeWarehouseTotals(inv);
        const combined = wh.inStock + wh.inTransit;
        const daily = salesBasis === "30d"
          ? (snap && snap.monthlySales > 0 ? snap.monthlySales / 30 : 0)
          : (snap?.dailySales7d ?? 0);
        return daily > 0 ? Math.round(combined / daily) : null;
      })
      .filter((v): v is number => v !== null && v < 999);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 999;
  }, [shipmentSuggestions, latestInventory, latestSnapshot, salesBasis]);

  type KpiEntry = { value: string; sub: string; icon: string; tone: "default" | "primary" | "accent" | "warn" | "danger" };
  const shipmentKpiValues: Record<ShipmentKpiMetricKey, KpiEntry> = useMemo(() => ({
    pendingSkus: { value: String(shipmentSuggestions.length), sub: `紧急 ${urgentCount} · 常规 ${shipmentSuggestions.length - urgentCount}`, icon: SHIPMENT_KPI_METRIC_ICONS.pendingSkus, tone: SHIPMENT_KPI_METRIC_TONES.pendingSkus },
    urgentSkus: { value: String(urgentCount), sub: urgentCount > 0 ? `${urgentCount} 个 SKU 需立即发货` : "无需紧急处理", icon: SHIPMENT_KPI_METRIC_ICONS.urgentSkus, tone: SHIPMENT_KPI_METRIC_TONES.urgentSkus },
    suggestQty: { value: totalQty.toLocaleString(), sub: "件", icon: SHIPMENT_KPI_METRIC_ICONS.suggestQty, tone: SHIPMENT_KPI_METRIC_TONES.suggestQty },
    fobCost: { value: `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: "按 FOB 单价 x 建议数量", icon: SHIPMENT_KPI_METRIC_ICONS.fobCost, tone: SHIPMENT_KPI_METRIC_TONES.fobCost },
    campaigns: { value: String(activeCampaigns.length), sub: activeCampaigns.map((c) => c.name).join("、") || "无进行中活动", icon: SHIPMENT_KPI_METRIC_ICONS.campaigns, tone: SHIPMENT_KPI_METRIC_TONES.campaigns },
    totalTransit: { value: totalTransitQty.toLocaleString(), sub: "在途件数合计", icon: SHIPMENT_KPI_METRIC_ICONS.totalTransit, tone: SHIPMENT_KPI_METRIC_TONES.totalTransit },
    totalOverseas: { value: totalOverseasQty.toLocaleString(), sub: "海外仓可售总计", icon: SHIPMENT_KPI_METRIC_ICONS.totalOverseas, tone: SHIPMENT_KPI_METRIC_TONES.totalOverseas },
    totalFactory: { value: totalFactoryQty.toLocaleString(), sub: "工厂库存合计", icon: SHIPMENT_KPI_METRIC_ICONS.totalFactory, tone: SHIPMENT_KPI_METRIC_TONES.totalFactory },
    minCoverDays: { value: minCoverDays >= 999 ? "∞" : String(minCoverDays), sub: minCoverDays >= 999 ? "无有效日销" : `最低 ${minCoverDays} 天`, icon: SHIPMENT_KPI_METRIC_ICONS.minCoverDays, tone: SHIPMENT_KPI_METRIC_TONES.minCoverDays },
    avgCoverDays: { value: avgCoverDays >= 999 ? "∞" : String(avgCoverDays), sub: avgCoverDays >= 999 ? "无有效日销" : `平均 ${avgCoverDays} 天`, icon: SHIPMENT_KPI_METRIC_ICONS.avgCoverDays, tone: SHIPMENT_KPI_METRIC_TONES.avgCoverDays },
  }), [shipmentSuggestions, urgentCount, totalQty, totalValue, activeCampaigns, totalTransitQty, totalOverseasQty, totalFactoryQty, minCoverDays, avgCoverDays]);

  if (loading) return <div className="text-sm text-foreground-500">加载中...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">Shipment Decision</div>
          <h1 className="font-heading text-[26px] font-bold text-foreground-950">发货决策中心</h1>
          <p className="text-[13px] text-foreground-500">
            排序依据：{SORT_LABELS[sortMode]} · 可在右上角切换排序方式
          </p>
          <p className="mt-1 text-[12px] text-foreground-400">
            排序说明：卡片优先级由系统按"综合覆盖天数 vs LT+安全库存天数"自动计算。
            覆盖天数不足者排前，差值越负越靠前。可手动切换其他排序方式。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (customizingMode) {
              setCustomizing(false);
              setCustomizingKpi(false);
            } else {
              setCustomizing(true);
              setCustomizingKpi(true);
            }
          }}
          className="flex items-center gap-1.5 rounded-[12px] border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-800 cursor-pointer whitespace-nowrap"
        >
          <i className={customizingMode ? "ri-close-line" : "ri-layout-masonry-line"} aria-hidden />
          {customizingMode ? "关闭设置" : "自定义布局"}
        </button>
      </div>

      {/* 自定义布局面板 */}
      {customizing && (
        <PageLayoutCustomizer
          pageId="shipment"
          visibleKeys={visibleKeys}
          allKeys={allKeys}
          toggle={toggleSection}
          onClose={() => setCustomizing(false)}
          onReset={resetLayout}
        />
      )}

      {/* 画布布局 — 全部区块可拖拽定位 */}
      <CanvasLayout
        layout={rglLayout}
        customizing={customizing}
        onLayoutChange={handleLayoutChange}
      >
      {/* KPI 卡片区域 + 自定义模式 */}
      {visibleKeys.includes("summaryKpi") && (
        <div key="summaryKpi">
          {customizingKpi && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-accent-300/60 bg-accent-50/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <i className="ri-pencil-line text-accent-600 text-sm" aria-hidden />
                <span className="text-[12px] font-medium text-accent-800">
                  点击每张 KPI 卡片的下拉菜单，切换你想看的指标。拖拽排序在下方"区块布局"中操作。
                </span>
              </div>
              <button
                type="button"
                onClick={resetKpi}
                className="rounded-[8px] border border-accent-200 bg-background-50 px-2.5 py-1 text-[11px] font-medium text-accent-700 hover:bg-accent-100 cursor-pointer whitespace-nowrap"
              >
                恢复默认 KPI
              </button>
            </div>
          )}
          <div className="grid grid-cols-4 gap-3">
            {kpiSlots.map((metricKey, idx) => {
              const meta = shipmentKpiValues[metricKey];
              return (
                <div key={idx} className="relative">
                  {customizingKpi && (
                    <select
                      value={metricKey}
                      onChange={(e) => setKpiSlot(idx, e.target.value as ShipmentKpiMetricKey)}
                      className="absolute top-1 right-1 z-10 rounded-md border border-accent-300/70 bg-background-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700 focus:outline-none cursor-pointer opacity-90 hover:opacity-100"
                    >
                      {(Object.entries(SHIPMENT_KPI_METRIC_LABELS) as [ShipmentKpiMetricKey, string][]).map(([k, label]) => (
                        <option key={k} value={k} disabled={kpiSlots.includes(k) && k !== metricKey}>
                          {label}{kpiSlots.includes(k) && k !== metricKey ? " (已用)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <KpiCard
                    label={SHIPMENT_KPI_METRIC_LABELS[metricKey]}
                    value={meta.value}
                    sub={meta.sub}
                    icon={meta.icon}
                    tone={meta.tone}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visibleKeys.includes("filters") && (
        <div key="filters" className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
            {(["7d", "30d"] as const).map((basis) => (
              <button key={basis} type="button" onClick={() => setSalesBasis(basis)}
                className={["rounded-full px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                  salesBasis === basis ? "bg-primary-500 text-background-50" : "text-foreground-600 hover:text-foreground-900"].join(" ")}>
                {basis === "7d" ? "近7天日销" : "近30天日销"}
              </button>
            ))}
          </div>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-full border border-background-300/70 bg-background-50 px-3 py-1 text-[11px] text-foreground-600 focus:border-primary-500 focus:outline-none cursor-pointer">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
          <div className="relative">
            <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-foreground-500" aria-hidden />
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索 SKU / 品名"
              className="w-48 rounded-md border border-background-300/70 bg-background-50 py-1.5 pl-7 pr-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-500 focus:outline-none" />
          </div>
          <div className="flex items-center gap-1 rounded-md bg-background-200/70 p-1">
            {(["all", "urgent", "high", "normal", "low"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setFilter(p)}
                className={["rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer",
                  filter === p ? "bg-background-50 text-foreground-900 shadow-sm" : "text-foreground-600 hover:text-foreground-900"].join(" ")}>
                {p === "all" ? "全部" : p === "urgent" ? "紧急" : p === "high" ? "优先" : p === "normal" ? "常规" : "低优"}
              </button>
            ))}
          </div>
        </div>
      )}

      {visibleKeys.includes("shipmentCards") && (
      <div key="shipmentCards">
        <Section title="发货建议卡片" icon="ri-grid-line" subtitle={`共 ${skuSuggestions.length} 个 SKU · ${SORT_LABELS[sortMode]}`}>
          {skuSuggestions.length === 0 ? (
            <EmptyState icon="ri-check-double-line" title="没有匹配的发货建议" desc="调整筛选条件或前往参数中心调整目标库存天数" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skuSuggestions.map((item) => <ShipmentCard key={item.sku.sku} item={item} salesBasis={salesBasis} />)}
            </div>
          )}
        </Section>
      </div>
      )}
      </CanvasLayout>
    </div>
  );
}

/* ShipmentCard */
type ItemType = {
  sku: import("@/domain/types").SkuMaster;
  snap: import("@/domain/types").DailySnapshot | undefined;
  inv: InventoryLayer | undefined;
  sug: import("@/domain/types").ShipmentSuggestion | undefined;
  totalStock: number; totalTransit: number; coverOnHand: number; coverWithTransit: number;
  target: number; needShip: boolean; daily: number;
  leadTime: number; safetyDays: number; dynamicThreshold: number;
};

function ShipmentCard({ item, salesBasis }: { item: ItemType; salesBasis: "7d" | "30d" }) {
  const sm = item.sku;
  const inv = item.inv;
  const targetProgress = Math.min((item.coverWithTransit / item.target) * 100, 100);
  const refLinePercent = Math.min((item.dynamicThreshold / item.target) * 100, 100);
  const barColor = item.needShip ? "bg-accent-500" : "bg-primary-500";
  const basisLabel = salesBasis === "30d" ? "近30天" : "近7天";

  return (
    <div className="group flex flex-col rounded-xl border border-background-200/70 bg-background-50 transition-shadow hover:shadow-lg hover:border-primary-300/40">
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="min-w-0">
          <Link to={`/sku/${encodeURIComponent(sm.sku)}`}
            className="font-heading text-[16px] font-bold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer inline-block">
            {sm.sku}
          </Link>
          <div className="mt-0.5 text-[12px] text-foreground-500">
            {sm.name} · 在库 {item.totalStock.toLocaleString()} 件 · 在途 {item.totalTransit.toLocaleString()} 件
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {item.needShip
            ? <Badge tone="danger"><i className="ri-file-list-3-line mr-1" aria-hidden />建议补货</Badge>
            : <Badge tone="accent"><i className="ri-shield-check-line mr-1" aria-hidden />库存充足</Badge>
          }
          <Link to={`/sku/${encodeURIComponent(sm.sku)}`}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-background-100/70 text-foreground-400 hover:bg-primary-100 hover:text-primary-700 transition-colors cursor-pointer">
            <i className="ri-arrow-right-line text-[13px]" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="px-4 py-2">
        {(() => {
          const isFba = sm.fulfillment === "FBA";
          const fbaQty = inv?.fbaStock ?? 0;
          const fbaDays = item.daily > 0 && fbaQty > 0 ? `${Math.round(fbaQty / item.daily)}天` : undefined;
          const wh = computeWarehouseTotals(inv);
          const rqty = wh.inStock;
          const rDays = item.daily > 0 && rqty > 0 ? `${Math.round(rqty / item.daily)}天` : undefined;
          if (isFba) {
            return <ExpandableRow icon="ri-archive-line" label="FBA 可售" qty={fbaQty} tag={fbaQty === 0 ? "—" : fbaDays}
              tagClass="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
              detailRows={[{ left: "FBA 在库", rightNum: fbaQty, rightTag: fbaQty === 0 ? "—" : (fbaDays ?? "—"), tagClass: "rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600" }]} />;
          }
          return <ExpandableRow icon="ri-earth-line" label="海外仓可售" qty={rqty} tag={rqty === 0 ? "—" : rDays}
            tagClass="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
            detailRows={inv?.warehouseBreakdown?.map((w) => {
              const dv = Number(w.daysOfCover);
              return { left: w.warehouse, rightNum: w.qty, rightTag: `${Number.isFinite(dv) && dv > 0 ? String(Math.round(dv)) : "—"}天`, tagClass: "rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600" };
            }) ?? []} />;
        })()}
        {(() => {
          const combined = item.totalTransit + item.totalStock;
          const cDays = item.daily > 0 ? Math.round(combined / item.daily) : 0;
          return <ExpandableRow icon="ri-ship-line" label="在途批次" qty={item.totalTransit}
            tag={item.daily > 0 ? `在途+可售 ${cDays}天` : "在途"}
            tagClass="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-600"
            detailRows={inv?.transitBatches?.map((b) => ({ left: b.warehouse, rightNum: b.qty, rightTag: transitBatchTag(b), tagClass: transitBatchTagClass(b) })) ?? []} />;
        })()}
        {(() => {
          const fqty = inv?.factoryStock ?? 0;
          const fDays = item.daily > 0 && fqty > 0 ? Math.round(fqty / item.daily) : undefined;
          return <ExpandableRow icon="ri-building-2-line" label="工厂批次" qty={fqty}
            tag={fDays != null ? `工厂库存可售 ${fDays}天` : "工厂"}
            tagClass="rounded-full bg-secondary-50 px-2 py-0.5 text-[11px] font-medium text-secondary-700"
            detailRows={inv?.factoryBatches?.map((b) => ({
              left: b.factoryName, rightNum: b.qty,
              rightTag: `${fmtShortDate(b.deliveryDate)}-${b.totalQty ?? b.qty}`,
              tagClass: "rounded-full bg-secondary-50 px-2 py-0.5 text-[11px] font-medium text-secondary-700",
            })) ?? []} />;
        })()}
      </div>

      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-background-100/70 px-2.5 py-2 text-center">
            <div className="text-[11px] text-foreground-500 mb-0.5">综合覆盖</div>
            <div className={`mono-num text-[18px] font-bold ${item.needShip ? "text-accent-600" : "text-primary-700"}`}>{item.coverWithTransit}</div>
            <div className="text-[10px] text-foreground-400">天</div>
          </div>
          <div className="rounded-lg bg-background-100/70 px-2.5 py-2 text-center">
            <div className="text-[11px] text-foreground-500 mb-0.5">目标覆盖</div>
            <div className="mono-num text-[18px] font-bold text-foreground-900">{item.target}</div>
            <div className="text-[10px] text-foreground-400">天</div>
          </div>
          <div className="rounded-lg bg-background-100/70 px-2.5 py-2 text-center">
            <div className="text-[11px] text-foreground-500 mb-0.5">参考线</div>
            <div className="mono-num text-[18px] font-bold text-foreground-800">{item.dynamicThreshold}</div>
            <div className="text-[10px] text-foreground-400">LT{item.leadTime}+安全{item.safetyDays}天</div>
          </div>
        </div>
        <div className="relative">
          <div className="mb-1 flex items-center justify-between text-[11px] text-foreground-500">
            <span>日均 {item.daily.toFixed(1)} ({basisLabel})</span>
            <span>目标 {item.target} 天 →</span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-background-200/70 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${targetProgress}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-foreground-900" style={{ left: `${refLinePercent}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px]">
            <span className="text-foreground-500">0天</span>
            <span className="text-foreground-400" style={{ marginLeft: `${refLinePercent}%`, transform: "translateX(-50%)" }}>LT+安全 {item.dynamicThreshold}天</span>
            <span className="text-foreground-500">{item.target}天</span>
          </div>
        </div>
      </div>

      {item.sug ? (
        <div className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2.5 text-[12px]">
          <div className="flex items-center gap-1 font-semibold text-red-700">
            <i className="ri-error-warning-line" aria-hidden />
            综合覆盖 {item.coverWithTransit}天 &lt; LT+安全 {item.dynamicThreshold}天 (LT{item.leadTime}+安全{item.safetyDays})，{item.sug.campaignBoost ? `含${item.sug.campaignBoost}活动加成` : "需要向工厂下单"}
          </div>
          {item.sug.suggestQty > 0 && (
            <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground-600">
              <span className="font-medium text-primary-700">建议补货 {item.sug.suggestQty.toLocaleString()} 件</span>
              <span>·</span>
              <span>最晚 {item.sug.latestShipDate}</span>
              <span>·</span>
              <Badge tone={item.sug.priority === "urgent" ? "danger" : item.sug.priority === "high" ? "warn" : "secondary"}>
                {item.sug.priority === "urgent" ? "紧急" : item.sug.priority === "high" ? "优先" : item.sug.priority === "normal" ? "常规" : "低优"}
              </Badge>
            </div>
          )}
          <div className="mt-1 text-[10px] text-foreground-400">
            公式：(目标{item.target} + LT{item.leadTime} + 安全{item.safetyDays} - 综合覆盖{item.coverWithTransit}) x 日均{item.daily.toFixed(1)} = {item.sug.suggestQty.toLocaleString()} 件
          </div>
        </div>
      ) : (
        <div className="mx-4 mb-4 rounded-lg border border-primary-200 bg-primary-50/30 px-3 py-2.5 text-[12px]">
          <div className="flex items-center gap-1 font-semibold text-primary-700">
            <i className="ri-check-double-line" aria-hidden />
            综合覆盖 {item.coverWithTransit}天 &gt;= LT+安全 {item.dynamicThreshold}天 (LT{item.leadTime}+安全{item.safetyDays})，库存充足，无需下单
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ExpandableRow ── */
interface DetailRow { left: string; rightNum: number; rightTag: string; tagClass: string; }
function ExpandableRow({ icon, label, qty, tag, tagClass, detailRows }: {
  icon: string; label: string; qty: number; tag?: string; tagClass: string; detailRows: DetailRow[];
}) {
  const [open, setOpen] = useState(false);
  const hasData = detailRows.length > 0;
  return (
    <div className="rounded-md border border-transparent">
      <button type="button" onClick={() => { if (hasData) setOpen((v) => !v); }}
        className={`flex w-full items-center justify-between px-2.5 py-2 text-left ${hasData ? "cursor-pointer hover:bg-background-100/50" : "cursor-default"}`}>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded text-[14px] text-foreground-400"><i className={icon} aria-hidden /></div>
          <span className="text-[13px] text-foreground-700">{label}</span>
          {hasData && <span className="text-[12px] text-foreground-400">{open ? "收起" : "展开"}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="mono-num text-[15px] font-semibold text-foreground-900">{qty.toLocaleString()}</span>
          {tag && <span className={tagClass}>{tag}</span>}
        </div>
      </button>
      {open && hasData && (
        <div className="ml-3 border-l-2 border-background-200/60 pl-3 pr-2.5 pb-1 space-y-0.5">
          {detailRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-foreground-700">{row.left}</span>
              <div className="flex items-center gap-2">
                <span className="mono-num text-[14px] font-semibold text-foreground-900">{row.rightNum.toLocaleString()}</span>
                <span className={row.tagClass}>{row.rightTag}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function transitBatchTag(batch: TransitBatch): string {
  if (batch.statusText) return batch.statusText;
  if (batch.etaDate) return batch.etaDate;
  return `${batch.qty}`;
}
function transitBatchTagClass(batch: TransitBatch): string {
  if (batch.statusText) {
    if (batch.statusText.includes("卸船") || batch.statusText.includes("到仓")) return "rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-600";
    if (batch.statusText.includes("提柜")) return "rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-600";
    if (batch.statusText.includes("出港")) return "rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-600";
  }
  return "rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-600";
}
function fmtShortDate(iso: string): string { return iso || ""; }