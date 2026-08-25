import { useCallback, useEffect, useMemo, useState } from "react";
import { useOpsData } from "@/domain/store";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Badge from "@/components/ui/Badge";
import { computeShipmentSuggestions } from "@/domain/engine";
import { db, getCurrentSiteId } from "@/domain/db";
import type { Campaign, SkuMaster } from "@/domain/types";

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_PRESETS: Omit<Campaign, "id" | "active" | "skus" | "discountPrice">[] = [
  { name: "Prime Day", multiplier: 3, startDate: "2026-10-08", endDate: "2026-10-09" },
  { name: "Black Friday", multiplier: 2.5, startDate: "2026-11-24", endDate: "2026-11-28" },
  { name: "Cyber Monday", multiplier: 2, startDate: "2026-12-01", endDate: "2026-12-01" },
  { name: "Christmas", multiplier: 2, startDate: "2026-12-15", endDate: "2026-12-25" },
];

export default function Season() {
  const { loading, skuMaster, latestSnapshot, latestInventory, config, today } = useOpsData();

  /* ────────── Campaigns ────────── */
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState(3);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [salesBasis, setSalesBasis] = useState<"7d" | "30d">("7d");

  /* 新建活动表单 */
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState<{
    name: string; startDate: string; endDate: string;
    multiplier: number; discountPrice?: number;
  }>({
    name: "", startDate: "", endDate: "", multiplier: 2,
  });

  /* 加载 campaigns */
  useEffect(() => {
    (async () => {
      const siteId = await getCurrentSiteId();
      let list = (await db.campaigns.toArray()).filter(c => (c.siteId ?? "site_us") === siteId);
      if (list.length === 0) {
        const defaults: Campaign[] = DEFAULT_PRESETS.map((p) => ({
          id: uid(),
          active: true,
          ...p,
        }));
        await db.campaigns.bulkPut(defaults);
        list = defaults;
      }
      setCampaigns(list);
      const first = list[0];
      if (first) {
        setSelectedId(first.id);
        setMultiplier(first.multiplier);
      }
      setLoadingCampaigns(false);
    })();
  }, []);

  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId), [campaigns, selectedId]);

  const handleSelect = (c: Campaign) => {
    setSelectedId(c.id);
    setMultiplier(c.multiplier);
    setEditingId(null);
  };

  const updateCampaign = useCallback(async (id: string, patch: Partial<Campaign>) => {
    const cur = campaigns.find((c) => c.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    await db.campaigns.put(next);
    setCampaigns((prev) => prev.map((c) => (c.id === id ? next : c)));
    if (id === selectedId && patch.multiplier != null) setMultiplier(patch.multiplier);
  }, [campaigns, selectedId]);

  const handleSaveCampaign = async (id: string, patch: Partial<Campaign>) => {
    await updateCampaign(id, patch);
    setEditingId(null);
    setSaveMsg("已保存");
    setTimeout(() => setSaveMsg(null), 1500);
  };

  const handleAddCampaign = async () => {
    if (!newForm.name || !newForm.startDate || !newForm.endDate) {
      setSaveMsg("请填写活动名称、开始日期、结束日期");
      setTimeout(() => setSaveMsg(null), 2000);
      return;
    }
    const newCampaign: Campaign = {
      id: uid(),
      active: true,
      ...newForm,
    };
    await db.campaigns.put(newCampaign);
    setCampaigns((prev) => [...prev, newCampaign]);
    setSelectedId(newCampaign.id);
    setMultiplier(newCampaign.multiplier);
    setShowAdd(false);
    setNewForm({ name: "", startDate: "", endDate: "", multiplier: 2 });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这个大促活动吗？")) return;
    await db.campaigns.delete(id);
    setCampaigns((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (selectedId === id && next.length > 0) {
        setSelectedId(next[0].id);
        setMultiplier(next[0].multiplier);
      }
      return next;
    });
  };

  /* ────────── 活动利润估算 ────────── */
  const campaignProfitEstimate = useMemo(() => {
    if (!selected) return null;

    const discountPrice = (selected as Campaign & { discountPrice?: number }).discountPrice;
    if (!discountPrice || discountPrice <= 0) return null;

    // Calculate average profit across all SKUs at this discount price
    let totalProfit = 0;
    let totalMargin = 0;
    let count = 0;
    let adRatioSum = 0;
    let adCount = 0;

    for (const sku of skuMaster) {
      if (sku.saleStatus === "discontinued") continue;
      const snap = latestSnapshot.get(sku.sku);
      if (!snap || snap.dailySales7d <= 0) continue;

      const costFob = sku.costFob ?? 0;
      const costShipping = sku.costShipping ?? 0;
      const costDelivery = sku.costDelivery ?? 0;
      const costCommission = sku.costCommission ?? 0;
      const costStorage = sku.costStorage ?? 0;
      const costReturn = sku.costReturn ?? 0;
      const costAd = sku.costAd ?? 0;
      const coupon = sku.coupon ?? 0;
      const totalCost = costFob + costShipping + costDelivery + costCommission + costStorage + costReturn + costAd + coupon;

      const profit = discountPrice - totalCost;
      const margin = discountPrice > 0 ? (profit / discountPrice) * 100 : 0;

      totalProfit += profit;
      totalMargin += margin;
      count++;
      if (snap.adRatio != null) { adRatioSum += snap.adRatio; adCount++; }
    }

    if (count === 0) return null;
    return {
      avgProfit: totalProfit / count,
      avgMargin: totalMargin / count,
      avgAdRatio: adCount > 0 ? adRatioSum / adCount : 0,
      skuCount: count,
      discountPrice,
    };
  }, [selected, skuMaster, latestSnapshot]);

  /* ────────── 备货模拟 ────────── */
  const suggestions = useMemo(() => {
    if (!selected) return [];
    return computeShipmentSuggestions({
      skuMaster,
      latestSnapshot,
      latestInventory,
      activeCampaigns: [
        {
          id: selected.id,
          name: selected.name,
          startDate: selected.startDate,
          endDate: selected.endDate,
          multiplier,
          active: true,
        },
      ],
      config,
      today,
      salesBasis,
    });
  }, [skuMaster, latestSnapshot, latestInventory, config, today, selected, multiplier, salesBasis]);

  const totalQty = suggestions.reduce((s, r) => s + r.suggestQty, 0);
  const totalValue = suggestions.reduce((s, r) => {
    const sku = skuMaster.find((k) => k.sku === r.sku);
    return s + r.suggestQty * (sku?.costFob ?? 0);
  }, 0);
  const urgent = suggestions.filter((s) => s.priority === "urgent").length;

  if (loading || loadingCampaigns) return <div className="text-sm text-foreground-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">
          Peak Season Simulation
        </div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">旺季模拟</h1>
        <p className="text-[13px] text-foreground-500">
          选择大促节点、设置销量倍率，自动跑一遍备货计算 · 日期可随时修改更新
        </p>
      </div>

      <Section
        title="选择 / 管理大促"
        icon="ri-calendar-event-line"
        subtitle="官方日期未确定可先用预估，随时点击编辑修改 · 可设折扣价看利润预估"
        action={
          <button
            type="button"
            onClick={() => { setShowAdd(!showAdd); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-background-300/70 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-700 hover:bg-background-200 cursor-pointer whitespace-nowrap"
          >
            <i className={showAdd ? "ri-close-line" : "ri-add-line"} aria-hidden />
            {showAdd ? "取消" : "新增活动"}
          </button>
        }
      >
        {/* 新增表单 */}
        {showAdd && (
          <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50/50 p-4">
            <div className="mb-2 text-[12px] font-semibold text-primary-800">新增大促活动</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">活动名称</label>
                <input
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="如 Prime Day"
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">开始日期</label>
                <input
                  type="date"
                  value={newForm.startDate}
                  onChange={(e) => setNewForm({ ...newForm, startDate: e.target.value })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">结束日期</label>
                <input
                  type="date"
                  value={newForm.endDate}
                  onChange={(e) => setNewForm({ ...newForm, endDate: e.target.value })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">默认倍率</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={newForm.multiplier}
                  onChange={(e) => setNewForm({ ...newForm, multiplier: Number(e.target.value) })}
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground-500">预估折扣价 ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newForm.discountPrice ?? ""}
                  onChange={(e) => setNewForm({ ...newForm, discountPrice: Number(e.target.value) || undefined })}
                  placeholder="如 19.99"
                  className="w-full rounded-md border border-background-300/70 bg-background-50 px-2 py-1.5 text-[12px] focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddCampaign}
                  className="w-full rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-check-line mr-1" aria-hidden />保存新活动
                </button>
              </div>
            </div>
          </div>
        )}

        {saveMsg && (
          <div className="mb-3 rounded-md border border-accent-200 bg-accent-100/60 px-3 py-1.5 text-[12px] text-accent-900">
            {saveMsg}
          </div>
        )}

        {/* 活动卡片网格 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {campaigns.map((c) => {
            const active = selectedId === c.id;
            const isEditing = editingId === c.id;
            const cDiscount = (c as Campaign & { discountPrice?: number }).discountPrice;
            return (
              <div
                key={c.id}
                className={[
                  "relative flex flex-col rounded-xl border p-4 transition-colors",
                  active
                    ? "border-primary-500 bg-primary-500 text-background-50"
                    : "border-background-200 bg-background-50 text-foreground-800 hover:border-primary-300",
                ].join(" ")}
              >
                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditingId(isEditing ? null : c.id); }}
                    className={[
                      "flex h-5 w-5 items-center justify-center rounded text-[11px] transition-colors cursor-pointer",
                      active ? "hover:bg-primary-600/70 text-background-50/80" : "hover:bg-background-200 text-foreground-400",
                    ].join(" ")}
                    title="编辑"
                  >
                    <i className="ri-pencil-line" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                    className={[
                      "flex h-5 w-5 items-center justify-center rounded text-[11px] transition-colors cursor-pointer",
                      active ? "hover:bg-red-500/70 text-background-50/80" : "hover:bg-red-100 text-foreground-400 hover:text-red-600",
                    ].join(" ")}
                    title="删除活动"
                  >
                    <i className="ri-delete-bin-line" aria-hidden />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="text-left cursor-pointer"
                >
                  <span className="font-heading text-[15px] font-bold pr-10">{c.name}</span>

                  {isEditing ? (
                    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <div className={`text-[10px] mb-0.5 ${active ? "text-background-100/80" : "text-foreground-500"}`}>活动名称</div>
                        <input
                          type="text"
                          defaultValue={c.name}
                          className="w-full rounded border border-background-300 bg-background-50 px-2 py-1 text-[11px] text-foreground-800 focus:outline-none focus:border-primary-400"
                          id={`name-${c.id}`}
                        />
                      </div>
                      <div>
                        <div className={`text-[10px] mb-0.5 ${active ? "text-background-100/80" : "text-foreground-500"}`}>开始日期</div>
                        <input
                          type="date"
                          defaultValue={c.startDate}
                          className="w-full rounded border border-background-300 bg-background-50 px-2 py-1 text-[11px] text-foreground-800 focus:outline-none focus:border-primary-400"
                          id={`start-${c.id}`}
                        />
                      </div>
                      <div>
                        <div className={`text-[10px] mb-0.5 ${active ? "text-background-100/80" : "text-foreground-500"}`}>结束日期</div>
                        <input
                          type="date"
                          defaultValue={c.endDate}
                          className="w-full rounded border border-background-300 bg-background-50 px-2 py-1 text-[11px] text-foreground-800 focus:outline-none focus:border-primary-400"
                          id={`end-${c.id}`}
                        />
                      </div>
                      <div>
                        <div className={`text-[10px] mb-0.5 ${active ? "text-background-100/80" : "text-foreground-500"}`}>预估折扣价 ($)</div>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={cDiscount ?? ""}
                          className="w-full rounded border border-background-300 bg-background-50 px-2 py-1 text-[11px] text-foreground-800 focus:outline-none focus:border-primary-400"
                          id={`discount-${c.id}`}
                          placeholder="如 19.99"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nameEl = document.getElementById(`name-${c.id}`) as HTMLInputElement;
                          const startEl = document.getElementById(`start-${c.id}`) as HTMLInputElement;
                          const endEl = document.getElementById(`end-${c.id}`) as HTMLInputElement;
                          const discEl = document.getElementById(`discount-${c.id}`) as HTMLInputElement;
                          handleSaveCampaign(c.id, {
                            name: nameEl?.value || c.name,
                            startDate: startEl?.value || c.startDate,
                            endDate: endEl?.value || c.endDate,
                            discountPrice: discEl?.value ? Number(discEl.value) : undefined,
                          } as Partial<Campaign>);
                        }}
                        className="w-full rounded-md bg-accent-500 px-2 py-1 text-[11px] font-semibold text-background-50 hover:bg-accent-600 cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-check-line mr-0.5" aria-hidden />保存
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className={[
                          "mt-1 block text-[11px]",
                          active ? "text-background-100/90" : "text-foreground-500",
                        ].join(" ")}
                      >
                        {c.startDate} → {c.endDate}
                      </span>
                      <span
                        className={[
                          "mono-num mt-1 text-[13px] font-semibold",
                          active ? "text-background-50" : "text-primary-700",
                        ].join(" ")}
                      >
                        默认 ×{c.multiplier}
                      </span>
                      {cDiscount && cDiscount > 0 && (
                        <span className={["mono-num mt-0.5 block text-[11px]", active ? "text-background-100/80" : "text-foreground-500"].join(" ")}>
                          折扣价 ${cDiscount.toFixed(2)}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* 活动利润估算 */}
        {campaignProfitEstimate && (
          <div className="mt-4 rounded-xl border border-accent-200 bg-accent-50/50 p-4">
            <div className="mb-2 text-[12px] font-semibold text-accent-800">
              利润预估 · 折扣价 ${campaignProfitEstimate.discountPrice.toFixed(2)}（覆盖 {campaignProfitEstimate.skuCount} 个活跃 SKU）
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] text-foreground-500">平均利润率</div>
                <div className={`font-heading text-[18px] font-bold ${campaignProfitEstimate.avgMargin >= 10 ? 'text-primary-700' : campaignProfitEstimate.avgMargin >= 0 ? 'text-foreground-800' : 'text-red-600'}`}>
                  {campaignProfitEstimate.avgMargin.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] text-foreground-500">平均单件净利</div>
                <div className={`font-heading text-[18px] font-bold ${campaignProfitEstimate.avgProfit >= 0 ? 'text-accent-700' : 'text-red-600'}`}>
                  ${campaignProfitEstimate.avgProfit.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-foreground-500">平均广告费比</div>
                <div className={`font-heading text-[18px] font-bold ${campaignProfitEstimate.avgAdRatio > 25 ? 'text-red-600' : 'text-foreground-800'}`}>
                  {campaignProfitEstimate.avgAdRatio.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 当前选中的倍率调节 + 维度切换 */}
        {selected && (
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <span className="text-[12px] font-semibold text-foreground-700">
              {selected.name} · 当前模拟倍率
            </span>
            <label className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="5"
                step="0.5"
                value={multiplier}
                onChange={(e) => setMultiplier(Number(e.target.value))}
                className="w-40 cursor-pointer accent-primary-500"
              />
              <span className="mono-num rounded-md bg-primary-100 px-2 py-0.5 text-[13px] font-semibold text-primary-700">
                ×{multiplier}
              </span>
            </label>
            <button
              type="button"
              onClick={() => updateCampaign(selected.id, { multiplier })}
              className="rounded-md border border-background-200 bg-background-50 px-3 py-1 text-[12px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-save-line mr-1" aria-hidden />保存为默认倍率
            </button>

            <span className="mx-2 h-5 w-px bg-background-300/70" />

            {/* 日销维度切换 */}
            <span className="text-[11px] text-foreground-500">日销基准</span>
            <div className="flex items-center gap-1 rounded-full border border-background-300/70 bg-background-100/70 px-1 py-1">
              {(["7d", "30d"] as const).map((basis) => (
                <button
                  key={basis}
                  type="button"
                  onClick={() => setSalesBasis(basis)}
                  className={[
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                    salesBasis === basis ? "bg-primary-500 text-background-50" : "text-foreground-600 hover:text-foreground-900",
                  ].join(" ")}
                >
                  {basis === "7d" ? "近7天日销" : "近30天日销"}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="需备货 SKU" value={suggestions.length} icon="ri-price-tag-3-line" tone="primary" />
        <KpiCard label="总备货量" value={totalQty.toLocaleString()} sub="件" icon="ri-archive-line" tone="accent" />
        <KpiCard label="FOB 预估" value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon="ri-money-dollar-circle-line" />
        <KpiCard label="紧急发货" value={urgent} sub="需立即安排" icon="ri-alarm-warning-line" tone="warn" />
      </div>

      <Section
        title="备货清单"
        subtitle={selected ? `${selected.name} · ×${multiplier} · ${salesBasis === "30d" ? "近30天日销" : "近7天日销"}` : "请选择活动"}
        icon="ri-list-check-2"
      >
        {suggestions.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-foreground-500">
            {selected ? "所有 SKU 库存充足，无需备货" : "请先选择一个大促活动"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-500">
                  <th className="border-b border-background-200 px-3 py-2.5">SKU / 品名</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">日销</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">×{multiplier} 后</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">目标天数</th>
                  <th className="border-b border-background-200 px-3 py-2.5 text-right">建议备货</th>
                  <th className="border-b border-background-200 px-3 py-2.5">最晚发货</th>
                  <th className="border-b border-background-200 px-3 py-2.5">优先级</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.sku} className="hover:bg-background-100/60">
                    <td className="border-b border-background-200/70 px-3 py-2.5">
                      <div className="font-medium text-foreground-900">{s.skuName}</div>
                      <div className="mono-num text-[11px] text-foreground-500">{s.sku}</div>
                    </td>
                    <td className="mono-num border-b border-background-200/70 px-3 py-2.5 text-right">
                      {s.dailySales.toFixed(1)}
                    </td>
                    <td className="mono-num border-b border-background-200/70 px-3 py-2.5 text-right font-semibold text-primary-700">
                      {(s.dailySales * multiplier).toFixed(1)}
                    </td>
                    <td className="mono-num border-b border-background-200/70 px-3 py-2.5 text-right">
                      {s.targetCoverDays} 天
                    </td>
                    <td className="mono-num border-b border-background-200/70 px-3 py-2.5 text-right font-semibold">
                      {s.suggestQty.toLocaleString()}
                    </td>
                    <td className="mono-num border-b border-background-200/70 px-3 py-2.5">
                      {s.latestShipDate}
                    </td>
                    <td className="border-b border-background-200/70 px-3 py-2.5">
                      <Badge
                        tone={
                          s.priority === "urgent"
                            ? "danger"
                            : s.priority === "high"
                            ? "warn"
                            : s.priority === "normal"
                            ? "accent"
                            : "secondary"
                        }
                      >
                        {s.priority === "urgent"
                          ? "紧急"
                          : s.priority === "high"
                          ? "高"
                          : s.priority === "normal"
                          ? "常规"
                          : "低"}
                      </Badge>
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