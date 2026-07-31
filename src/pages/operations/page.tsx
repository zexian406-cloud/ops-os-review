import { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { computeAll } from "@/domain/calculator";
import { getAllShops } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { DailySnapshot, SkuMaster, InventoryLayer, Shop } from "@/domain/types";

type TabKey = "profit" | "ad" | "rating" | "review" | "return" | "listing" | "new";

const TABS: Array<{ key: TabKey; label: string; icon: string; desc: string }> = [
  { key: "profit", label: "利润异常", icon: "ri-money-dollar-circle-line", desc: "利润率 < 阈值 或 环比下降" },
  { key: "ad", label: "广告异常", icon: "ri-megaphone-line", desc: "费比 / TACOS 冲高" },
  { key: "rating", label: "评分下降", icon: "ri-star-half-line", desc: "评分环比或低于健康线" },
  { key: "review", label: "Review 增长", icon: "ri-chat-quote-line", desc: "Review 数量变动" },
  { key: "return", label: "退货率异常", icon: "ri-arrow-go-back-line", desc: "退货率超阈值" },
  { key: "listing", label: "Listing 待优化", icon: "ri-file-edit-line", desc: "A+ / 图片 / 描述" },
  { key: "new", label: "新品成长", icon: "ri-seedling-line", desc: "上架 90 天内" },
];

export default function Operations() {
  const { loading, skuMaster, latestSnapshot, latestInventory, config } = useOpsData();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as TabKey) ?? "profit";
  const [tab, setTab] = useState<TabKey>(initial);
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    getAllShops().then(setShops);
  }, []);

  const shopNameMap = useMemo(() => {
    const map = new Map<string, string>();
    shops.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [shops]);

  const getShopName = (storeId: string): string => {
    return shopNameMap.get(storeId) ?? storeId;
  };

  const setTabAndUrl = (t: TabKey) => {
    setTab(t);
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next);
  };

  const rows = useMemo(() => {
    const list: Array<{
      sku: SkuMaster;
      snap?: DailySnapshot;
      metric: number;
      metricLabel: string;
      tone: "danger" | "warn" | "accent" | "primary";
      note?: string;
    }> = [];

    for (const sku of skuMaster) {
      const snap = latestSnapshot.get(sku.sku);
      if (tab === "listing") {
        if (sku.aPlus === "todo") {
          list.push({
            sku,
            snap,
            metric: 1,
            metricLabel: "A+ 未完成",
            tone: "accent",
            note: "分配设计任务并完成 A+ 页面",
          });
        }
        continue;
      }
      if (tab === "new") {
        if (!sku.launchDate) continue;
        const days =
          (Date.now() - new Date(sku.launchDate).getTime()) / (1000 * 60 * 60 * 24);
        if (days > config.lifecycleNewDays) continue;
        list.push({
          sku,
          snap,
          metric: Math.round(days),
          metricLabel: `上架 ${Math.round(days)} 天`,
          tone: "primary",
          note: snap
            ? `日销 ${snap.dailySales7d.toFixed(1)} · 月销 ${snap.monthlySales}`
            : undefined,
        });
        continue;
      }
      if (!snap || sku.saleStatus === "discontinued") continue;

      if (tab === "profit") {
        const calc = computeAll({ sku, snap, inv: latestInventory.get(sku.sku) });
        if (calc.grossMargin < config.profitMarginThreshold) {
          list.push({
            sku,
            snap,
            metric: calc.grossMargin,
            metricLabel: `${calc.grossMargin.toFixed(1)}%`,
            tone: calc.grossMargin < 0 ? "danger" : "warn",
            note: `单件利润 $${calc.grossProfit.toFixed(2)}`,
          });
        }
      } else if (tab === "ad") {
        if (snap.adRatio > config.adRatioThreshold) {
          list.push({
            sku,
            snap,
            metric: snap.adRatio,
            metricLabel: `${snap.adRatio.toFixed(1)}%`,
            tone: snap.adRatio > 40 ? "danger" : "warn",
            note: `广告花费 $${snap.adSpend.toFixed(2)}`,
          });
        }
      } else if (tab === "rating") {
        if (snap.rating > 0 && snap.rating < 4.0) {
          list.push({
            sku,
            snap,
            metric: snap.rating,
            metricLabel: `${snap.rating.toFixed(1)} ★`,
            tone: snap.rating < 3.5 ? "danger" : "warn",
            note: "紧急处理差评并优化 Listing",
          });
        }
      } else if (tab === "review") {
        // We don't have review count history, list by rating changes
        if (snap.rating > 0 && snap.rating < 4.5) {
          list.push({
            sku,
            snap,
            metric: snap.rating,
            metricLabel: `${snap.rating.toFixed(1)} ★`,
            tone: "warn",
            note: "关注 Review 增量与差评回复",
          });
        }
      } else if (tab === "return") {
        const returnMetric = sku.fulfillment === "FBM" ? (snap.refundRate ?? 0) : snap.returnRate;
        if (returnMetric > config.returnRateThreshold) {
          list.push({
            sku,
            snap,
            metric: returnMetric,
            metricLabel: `${returnMetric.toFixed(1)}%`,
            tone: returnMetric > 10 ? "danger" : "warn",
            note: sku.fulfillment === "FBM" ? "分析退款原因（物流 / 描述不符）" : "分析退货原因（质量 / 描述）",
          });
        }
      }
    }
    return list.sort((a, b) => (tab === "new" ? a.metric - b.metric : b.metric - a.metric));
  }, [skuMaster, latestSnapshot, latestInventory, tab, config]);

  if (loading) return <div className="text-sm text-foreground-500">加载中...</div>;

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          Operations Center
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">运营中心</h1>
        <p className="text-[13px] text-foreground-500">
          7 张运营视图，只显示需要你处理的 SKU，不是 Excel 平铺
        </p>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTabAndUrl(t.key)}
              className={[
                "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors cursor-pointer",
                active
                  ? "border-primary-500 bg-primary-500 text-background-50"
                  : "border-background-200 bg-background-50 text-foreground-700 hover:border-primary-300",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-md text-[16px]",
                  active ? "bg-primary-600/50" : "bg-background-200 text-foreground-600",
                ].join(" ")}
              >
                <i className={t.icon} aria-hidden />
              </span>
              <div className="text-[13px] font-semibold leading-tight">{t.label}</div>
              <div
                className={[
                  "text-[11px] leading-tight",
                  active ? "text-background-100/90" : "text-foreground-500",
                ].join(" ")}
              >
                {t.desc}
              </div>
            </button>
          );
        })}
      </div>

      <Section
        title={activeTab.label + " · SKU 清单"}
        subtitle={`共 ${rows.length} 个 SKU 需要关注`}
        icon={activeTab.icon}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon="ri-check-double-line"
            title="该视图暂无异常"
            desc="继续保持当前策略"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                  <th className="border-b border-background-200 px-3 py-2.5">SKU / 品名</th>
                  <th className="border-b border-background-200 px-3 py-2.5">店铺</th>
                  <th className="border-b border-background-200 px-3 py-2.5">负责人</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">日销</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">
                    {activeTab.label.replace("异常", "")}
                  </th>
                  <th className="border-b border-background-200 px-3 py-2.5">建议</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sku.sku} className="hover:bg-background-100/60">
                    <td className="border-b border-background-200/70 px-3 py-2.5">
                      <Link
                        to={`/sku/${encodeURIComponent(r.sku.sku)}`}
                        className="block font-medium text-foreground-900 hover:text-primary-700 cursor-pointer"
                      >
                        {r.sku.name}
                      </Link>
                      <div className="mono-num text-[11px] text-foreground-500">
                        {r.sku.sku}
                      </div>
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-[12px] text-foreground-600">
                      {getShopName(r.sku.store)}
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-[12px] text-foreground-600">
                      {r.sku.owner ?? "-"}
                    </td>
                    <td className="mono-num border-b border-background-200/70 px-3 py-2.5 text-right">
                      {r.snap?.dailySales7d.toFixed(1) ?? "-"}
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-right">
                      <Badge tone={r.tone}>{r.metricLabel}</Badge>
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-[12px] text-foreground-600">
                      {r.note ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}