import { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useOpsData } from "@/domain/store";
import { computeAll } from "@/domain/calculator";
import { snapKey } from "@/domain/engine";
import { getAllShops, db } from "@/domain/db";
import { resolveComparison } from "@/domain/diagnosis-period";
import { diagnoseProfitDecline, diagnoseSalesDecline, diagnoseRatingDecline, diagnoseAdRatioRise } from "@/domain/diagnose";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import AlertList from "@/pages/dashboard/AlertList";
import type { AlertDiagnostic } from "@/pages/dashboard/AlertList";
import { ALERT_TYPE_TO_DIAG } from "@/domain/types";
import type { DailySnapshot, DiagnosisType, SkuMaster, InventoryLayer, Shop, AlertSeverity } from "@/domain/types";
import DiagnosisView from "./DiagnosisView";

type TabKey = "all" | "profit" | "ad" | "rating" | "review" | "return" | "listing" | "new" | "diag";

const TABS: Array<{ key: TabKey; label: string; icon: string; desc: string }> = [
  { key: "all", label: "全部异常", icon: "ri-alarm-warning-line", desc: "全站告警 · 自带归因" },
  { key: "profit", label: "利润异常", icon: "ri-money-dollar-circle-line", desc: "利润率 < 阈值 或 环比下降" },
  { key: "ad", label: "广告异常", icon: "ri-megaphone-line", desc: "费比 / TACOS 冲高" },
  { key: "rating", label: "评分下降", icon: "ri-star-half-line", desc: "评分环比或低于健康线" },
  { key: "review", label: "Review 增长", icon: "ri-chat-quote-line", desc: "Review 数量变动" },
  { key: "return", label: "退货率异常", icon: "ri-arrow-go-back-line", desc: "退货率超阈值" },
  { key: "listing", label: "Listing 待优化", icon: "ri-file-edit-line", desc: "A+ / 图片 / 描述" },
  { key: "new", label: "新品成长", icon: "ri-seedling-line", desc: "上架 90 天内" },
];

const VALID_TABS = new Set<TabKey>([...TABS.map((t) => t.key), "diag"]);

const fmtDelta = (d: number, unit?: string) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}${unit ?? ""}`;

/** 清单类型 → 归因诊断类型（与 ALERT_TYPE_TO_DIAG 同一套映射；无映射的清单不出诊断按钮） */
const DIAG_TYPE_BY_TAB: Partial<Record<TabKey, DiagnosisType>> = {
  profit: "profit",
  ad: "adRatio",
  rating: "rating",
  review: "rating",
  return: "rating",
};

export default function Operations() {
  const { loading, currentSiteId, currentSite, skuMaster, latestSnapshot, latestInventory, config, alerts } = useOpsData();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") as TabKey | null;
  const tab: TabKey = rawTab && VALID_TABS.has(rawTab) ? rawTab : "all";
  const [shops, setShops] = useState<Shop[]>([]);
  const [sev, setSev] = useState<"all" | AlertSeverity>("all");
  const [rulesOpen, setRulesOpen] = useState(false);
  // 站点全量快照：诊断需要完整历史，不受顶栏店铺筛选影响
  const [siteSnapshots, setSiteSnapshots] = useState<DailySnapshot[]>([]);

  useEffect(() => {
    let alive = true;
    db.dailySnapshot.toArray()
      .then((rows) => {
        if (!alive) return;
        setSiteSnapshots(rows.filter((r) => (r.siteId ?? "site_us") === currentSiteId));
      })
      .catch(() => { if (alive) setSiteSnapshots([]); });
    return () => { alive = false; };
  }, [currentSiteId, loading]);

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

    if (tab === "all" || tab === "diag") return list;

    for (const sku of skuMaster) {
      const snap = latestSnapshot.get(snapKey(sku.sku, currentSiteId));
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
        const inv = latestInventory.get(snapKey(sku.sku, currentSiteId));
        const calc = computeAll({ sku, snap, inv, defaultCommissionRate: currentSite?.commissionRate });
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
          const inv = latestInventory.get(snapKey(sku.sku, currentSiteId));
          const calc = computeAll({ sku, snap, inv, defaultCommissionRate: currentSite?.commissionRate });
          list.push({
            sku,
            snap,
            metric: snap.adRatio,
            metricLabel: `${snap.adRatio.toFixed(1)}%`,
            tone: snap.adRatio > 40 ? "danger" : "warn",
            note: `广告花费 $${calc.costAd.toFixed(2)}${calc.isAdInferred ? "（按费比×售价估算）" : ""}`,
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
            note: "继续维护保持",
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
            note: "注意退货率增长",
          });
        }
      }
    }
    return list.sort((a, b) => (tab === "new" ? a.metric - b.metric : b.metric - a.metric));
  }, [skuMaster, latestSnapshot, latestInventory, tab, config, currentSite, currentSiteId]);

  // 每条告警的诊断摘要：按「本次 vs 上次导入」跑决策树，取命中步骤的对比值 + 归因结论
  const diagnostics = useMemo(() => {
    const out: Record<string, AlertDiagnostic> = {};
    const bySku = new Map<string, DailySnapshot[]>();
    for (const r of siteSnapshots) {
      const arr = bySku.get(r.sku);
      if (arr) arr.push(r);
      else bySku.set(r.sku, [r]);
    }
    const skuMap = new Map(skuMaster.map((s) => [s.sku, s]));
    for (const a of alerts) {
      const sku = skuMap.get(a.sku);
      const dt = ALERT_TYPE_TO_DIAG[a.type];
      if (!sku || !dt) continue;
      const cmp = resolveComparison({ rows: bySku.get(a.sku) ?? [], basis: "import" });
      const diagInput = {
        sku,
        latestSnap: cmp.current,
        previousSnap: cmp.previous,
        latestInv: latestInventory.get(snapKey(a.sku, currentSiteId)),
        config,
      };
      const result = dt === "profit" ? diagnoseProfitDecline(diagInput)
        : dt === "sales" ? diagnoseSalesDecline(diagInput)
          : dt === "rating" ? diagnoseRatingDecline(diagInput)
            : diagnoseAdRatioRise(diagInput);
      if (!result.hasHistory) continue;
      const hit = result.steps.find((s) => s.hit);
      const compare = hit
        ? `${hit.checkName.replace(/检查$/, "").trim()} ${hit.before} → ${hit.after}${hit.delta != null ? `（${fmtDelta(hit.delta, hit.unit)}）` : ""}`
        : result.summary;
      out[a.id] = { compare, reason: result.reason };
    }
    return out;
  }, [alerts, siteSnapshots, skuMaster, latestInventory, config, currentSiteId]);

  if (loading) return <div className="text-sm text-foreground-500">加载中...</div>;

  // 归因下钻视图：/operations?tab=diag&sku=xxx&type=xxx
  if (tab === "diag") return <DiagnosisView />;

  const sevAlerts = sev === "all" ? alerts : alerts.filter((a) => a.severity === sev);
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const infoCount = alerts.filter((a) => a.severity === "info").length;

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          Anomaly Center
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">异常中心</h1>
        <p className="text-[13px] text-foreground-500">
          全站异常一处看全：先看「全部异常」清单，再按类型筛 SKU，点行内「诊断」下钻归因
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
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

      {tab === "all" ? (
        <Section
          title="全站异常清单"
          subtitle={`共 ${alerts.length} 条 · 每条附本期 vs 上期对比与归因`}
          icon="ri-alarm-warning-line"
          action={
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge tone="danger">Critical {criticalCount}</Badge>
              <Badge tone="warn">Warning {warningCount}</Badge>
              <Badge tone="secondary">Info {infoCount}</Badge>
              <select
                value={sev}
                onChange={(e) => setSev(e.target.value as typeof sev)}
                className="rounded-md border border-background-300/70 bg-background-50 px-2 py-1 text-[12px] text-foreground-700 focus:border-primary-500 focus:outline-none cursor-pointer"
                aria-label="筛选严重度"
              >
                <option value="all">全部严重度</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
          }
        >
          {sevAlerts.length === 0 ? (
            <EmptyState
              icon="ri-check-double-line"
              title="没有匹配的异常"
              desc="此严重度下暂无异常，继续保持"
            />
          ) : (
            <>
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setRulesOpen((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-lg border border-background-200/70 bg-background-50 px-3 py-2 text-left text-[12px] text-foreground-600 hover:bg-background-100 cursor-pointer"
                >
                  <i className="ri-question-line text-primary-600" />
                  <span className="font-medium text-foreground-800">判定依据</span>
                  <span className="text-foreground-400">阈值来自参数中心，可按站点调整</span>
                  <i className={`${rulesOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} ml-auto text-foreground-400`} />
                </button>
                {rulesOpen && (
                  <div className="mt-2 rounded-lg border border-background-200/70 bg-background-50/60 p-3">
                    <div className="grid gap-x-6 gap-y-1.5 text-[12px] leading-relaxed text-foreground-600 sm:grid-cols-2">
                      <div><span className="font-semibold text-foreground-800">断货</span>：总库存 ≤ 0 → Critical</div>
                      <div><span className="font-semibold text-foreground-800">库存不足</span>：可售 &lt; {config.defaultLeadTime} + {config.defaultSafetyStockDays} = {config.defaultLeadTime + config.defaultSafetyStockDays} 天，其中 &lt; {config.defaultSafetyStockDays} 天为 Critical</div>
                      <div><span className="font-semibold text-foreground-800">库存积压</span>：可售 &gt; {config.defaultTargetCoverDays} 天且日销 &lt; 5 → Warning</div>
                      <div><span className="font-semibold text-foreground-800">利润异常</span>：毛利率 &lt; {config.profitMarginThreshold}%，低于 0 为 Critical</div>
                      <div><span className="font-semibold text-foreground-800">广告费比</span>：近 30 天费比 &gt; {config.adRatioThreshold}%，&gt; 70% 为 Critical</div>
                      <div><span className="font-semibold text-foreground-800">评分</span>：较上次导入下降 ≥ {config.ratingDropThreshold}，或当前评分 &lt; 3.8 → Warning</div>
                      <div><span className="font-semibold text-foreground-800">退货率</span>：近 30 天 &gt; {config.returnRateThreshold}%，&gt; 10% 为 Critical（FBM 看退款率）</div>
                      <div><span className="font-semibold text-foreground-800">Listing</span>：A+ 页面未完成 → Info</div>
                      <div><span className="font-semibold text-foreground-800">促销成本</span>：促销成本占售价 &gt; 10%，&gt; 25% 为 Warning</div>
                    </div>
                    <div className="mt-2 border-t border-background-200/70 pt-2 text-[11px] text-foreground-400">
                      归因依据：按「本次 vs 上次导入」对比同一 SKU，命中决策树中的具体原因优先展示（如退货率 3% → 8%）；未命中任何单一原因时显示为多因素综合影响。库存天数用 SKU 自身 Lead Time / 安全库存，未设置时取参数中心默认值。
                    </div>
                  </div>
                )}
              </div>
              <AlertList alerts={sevAlerts} skuMaster={skuMaster} diagnostics={diagnostics} />
            </>
          )}
        </Section>
      ) : (
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
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">日销</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">
                    {activeTab.label.replace("异常", "")}
                  </th>
                  <th className="border-b border-background-200 px-3 py-2.5">建议</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">操作</th>
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
                    <td className="mono-num border-b border-background-200/70 px-3 py-2.5 text-right">
                      {r.snap?.dailySales7d.toFixed(1) ?? "-"}
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-right">
                      <Badge tone={r.tone}>{r.metricLabel}</Badge>
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-[12px] text-foreground-600">
                      {r.note ?? "-"}
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5 text-right">
                      {DIAG_TYPE_BY_TAB[tab] ? (
                        <Link
                          to={`/operations?tab=diag&sku=${encodeURIComponent(r.sku.sku)}&type=${DIAG_TYPE_BY_TAB[tab]}`}
                          className="inline-flex items-center gap-1 rounded-full border border-primary-300/70 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 cursor-pointer whitespace-nowrap transition-colors"
                          title={`诊断 ${r.sku.sku} 的${activeTab.label}原因`}
                        >
                          <i className="ri-search-eye-line text-[12px]" aria-hidden />
                          诊断
                        </Link>
                      ) : (
                        <span className="text-foreground-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      )}
    </div>
  );
}