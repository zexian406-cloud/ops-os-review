import { useState, useMemo, useEffect } from "react";
import { db } from "@/domain/db";
import Section from "@/components/ui/Section";
import Badge from "@/components/ui/Badge";
import type { WarehouseProvider, SkuMaster, CalculationRecord } from "@/domain/types";
import CalculationHistory from "@/pages/calculator/CalculationHistory";

const uid = () => Math.random().toString(36).slice(2, 10);
const n = (v: string | number): number => {
  const nv = typeof v === "string" ? parseFloat(v) : v;
  return Number.isNaN(nv) ? 0 : nv;
};

const MARKETPLACES = [
  { code: "US", label: "Amazon.com (US)" },
  { code: "UK", label: "Amazon.co.uk (UK)" },
  { code: "DE", label: "Amazon.de (DE)" },
  { code: "JP", label: "Amazon.co.jp (JP)" },
  { code: "CA", label: "Amazon.ca (CA)" },
  { code: "AU", label: "Amazon.com.au (AU)" },
] as const;

const SITE_COMMISSION: Record<string, number> = {
  US: 15, UK: 15.3, DE: 15, JP: 15, CA: 15, AU: 12,
};

const CURRENCY: Record<string, string> = {
  US: "$", UK: "£", DE: "€", JP: "¥", CA: "C$", AU: "A$",
};

const MARKETPLACE_CURRENCY_CODE: Record<string, string> = {
  US: "USD", UK: "GBP", DE: "EUR", JP: "JPY", CA: "CAD", AU: "AUD",
};

const RATE_DEFAULTS: Record<string, string> = {
  US: "7.25", UK: "9.15", DE: "7.85", JP: "0.048", CA: "5.35", AU: "4.75",
};

// ── 仓储费计算 ──
function calcStorageFee(l: number, w: number, h: number, provider: WarehouseProvider, days: number): number {
  const cbm = Math.max(0.001, (l * w * h) / 1_000_000);
  const tiers = provider.tiers;
  if (!tiers || tiers.length === 0) return 0;
  let rate = tiers[0]?.rate ?? 0;
  if (provider.billingMode === "days_tier") {
    for (const t of tiers) {
      if (days >= t.min && (t.max == null || days <= t.max)) { rate = t.rate; break; }
    }
  } else {
    const longest = Math.max(l, w, h);
    for (const t of tiers) {
      if (longest >= t.min && (t.max == null || longest <= t.max)) { rate = t.rate; break; }
    }
  }
  return cbm * rate * days;
}

interface FbmCarrier {
  id: string;
  name: string;
  deliveryFee: string;
}

// ── 单产品状态 ──
interface ProductRow {
  id: string;
  name: string;
  asin: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  unitsPerBox: string;
  fobCny: string;
  headFreight: string;
  headFreightManual: boolean;
  price: string;
  deliveryMode: "FBA" | "FBM";
  fbaDelivery: string;
  fbaStorage: string;
  fbmCarriers: FbmCarrier[];
  // FBM 模式下也可以勾选海外仓参与比价
  selectedProviders: string[];
  providerShipFees: Record<string, string>;
}

function emptyProduct(): ProductRow {
  return {
    id: uid(), name: "", asin: "",
    length: "", width: "", height: "", weight: "", unitsPerBox: "1",
    fobCny: "", headFreight: "", headFreightManual: false, price: "",
    deliveryMode: "FBA",
    fbaDelivery: "", fbaStorage: "",
    fbmCarriers: [],
    selectedProviders: [],
    providerShipFees: {},
  };
}

export default function CalculatorPage() {
  // ── 全局参数 ──
  const [marketplace, setMarketplace] = useState("US");
  const [rate, setRate] = useState("6.9");
  const [commRate, setCommRate] = useState("15");
  const [adRate, setAdRate] = useState("10");
  const [returnRate, setReturnRate] = useState("5");
  const [storageDays, setStorageDays] = useState("30");

  // ── 产品列表 ──
  const [products, setProducts] = useState<ProductRow[]>([emptyProduct()]);

  // ── 服务商 ──
  const [providers, setProviders] = useState<WarehouseProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderRate, setNewProviderRate] = useState("");

  // -- calc records & sku save --
  const [calcRecords, setCalcRecords] = useState<CalculationRecord[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [skuList, setSkuList] = useState<SkuMaster[]>([]);
  const [saveSku, setSaveSku] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [saveMode, setSaveMode] = useState<"record_only" | "new_sku">("record_only");
  const [newSkuCode, setNewSkuCode] = useState("");
  const [newSkuName, setNewSkuName] = useState("");
  const [newSkuStore, setNewSkuStore] = useState("");

  const loadRecords = async () => {
    const recs = await db.calculationRecords.orderBy("createdAt").reverse().limit(50).toArray();
    setCalcRecords(recs);
  };

  const currency = CURRENCY[marketplace] ?? "$";

  useEffect(() => {
    db.warehouseProviders.toArray().then((all) => {
      const valid = all.filter((p) => Array.isArray(p.tiers));
      if (valid.length !== all.length) {
        db.warehouseProviders.clear().then(() => {
          if (valid.length > 0) db.warehouseProviders.bulkPut(valid);
        });
      }
      setProviders(valid);
    });
    loadRecords();
    db.skuMaster.toArray().then(setSkuList);
  }, []);

  const providersMap = useMemo(() => {
    const m = new Map<string, WarehouseProvider>();
    providers.forEach((p) => m.set(p.id, p));
    return m;
  }, [providers]);

  // ── 产品编辑 ──
  const updateProduct = (id: string, patch: Partial<ProductRow>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const addProduct = () => setProducts((prev) => [...prev, emptyProduct()]);

  // ── FBM 承运商操作 ──
  const addFbmCarrier = (pid: string) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== pid) return p;
      return { ...p, fbmCarriers: [...p.fbmCarriers, { id: uid(), name: "", deliveryFee: "" }] };
    }));
  };
  const removeFbmCarrier = (pid: string, cid: string) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== pid) return p;
      return { ...p, fbmCarriers: p.fbmCarriers.filter((c) => c.id !== cid) };
    }));
  };
  const updateFbmCarrier = (pid: string, cid: string, patch: Partial<FbmCarrier>) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== pid) return p;
      return { ...p, fbmCarriers: p.fbmCarriers.map((c) => c.id === cid ? { ...c, ...patch } : c) };
    }));
  };
  const removeProduct = (id: string) => {
    if (products.length <= 1) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  // ── 切换服务商勾选 ──
  const toggleProvider = (pid: string, provId: string) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== pid) return p;
      const sel = p.selectedProviders.includes(provId)
        ? p.selectedProviders.filter((x) => x !== provId)
        : [...p.selectedProviders, provId];
      const fees = { ...p.providerShipFees };
      if (!sel.includes(provId)) delete fees[provId];
      return { ...p, selectedProviders: sel, providerShipFees: fees };
    }));
  };

  const saveNewProvider = async () => {
    const name = newProviderName.trim();
    const rateVal = n(newProviderRate);
    if (!name || rateVal <= 0) return;
    const provider: WarehouseProvider = {
      id: uid(),
      name,
      billingMode: "days_tier",
      unit: "cbm_per_day",
      tiers: [{ min: 0, rate: rateVal }],
    };
    await db.warehouseProviders.put(provider);
    setProviders((prev) => [...prev, provider]);
    setNewProviderName("");
    setNewProviderRate("");
    setShowAddProvider(false);
  };

  const removeProvider = async (provId: string) => {
    await db.warehouseProviders.delete(provId);
    setProviders((prev) => prev.filter((p) => p.id !== provId));
    setProducts((prev) => prev.map((p) => {
      const sel = p.selectedProviders.filter((x) => x !== provId);
      const fees = { ...p.providerShipFees };
      delete fees[provId];
      return { ...p, selectedProviders: sel, providerShipFees: fees };
    }));
  };

  const updateProviderShip = (pid: string, provId: string, val: string) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== pid) return p;
      return { ...p, providerShipFees: { ...p.providerShipFees, [provId]: val } };
    }));
  };

  // ── 自动头程 ──
  const productsKey = products.map((p) => `${p.length}-${p.width}-${p.height}-${p.unitsPerBox}-${p.headFreightManual}`).join("|");
  useEffect(() => {
    let changed = false;
    const updated = products.map((p) => {
      if (p.headFreightManual) return p;
      const cbm = n(p.length) * n(p.width) * n(p.height) / 1_000_000;
      if (cbm <= 0) return p;
      const units = Math.max(1, n(p.unitsPerBox));
      const autoCost = (10000 * cbm) / (68 * units);
      const newVal = autoCost.toFixed(2);
      if (p.headFreight !== newVal) { changed = true; return { ...p, headFreight: newVal }; }
      return p;
    });
    if (changed) setProducts(updated);
  }, [productsKey]);

  // ── 计算结果 ──
  interface ProviderCalc {
    provId: string;
    provName: string;
    shipFee: number;
    storageFee: number;
    totalCost: number;
    profit: number;
    margin: number;
    roi: number;
    billingMode: string;
    billingDetail: string;
    source: "carrier" | "warehouse";
  }

  interface ComparisonEntry {
    label: string;
    profit: number;
  }

  interface ProductCalc {
    id: string;
    name: string;
    cbm: number;
    cft: number;
    volumeDisplay: string;
    costUsd: number;
    headFreight: number;
    commission: number;
    adCost: number;
    returnCost: number;
    baseCost: number;
    price: number;
    deliveryMode: "FBA" | "FBM";
    fbaDelivery: number;
    fbaStorage: number;
    fbaTotalCost: number;
    fbaProfit: number;
    fbaMargin: number;
    fbaRoi: number;
    fbmCarriers: ProviderCalc[];
    providers: ProviderCalc[];
    // FBM 模式下所有方案（承运商 + 海外仓）
    allFbmSchemes: ProviderCalc[];
    bestLabel: string;
    bestProfit: number;
    comparisons: ComparisonEntry[];
    hasComparison: boolean;
    hasAnyData: boolean;
  }

  const results = useMemo((): ProductCalc[] => {
    const r = n(rate);
    const cr = n(commRate) / 100;
    const ar = n(adRate) / 100;
    const rr = n(returnRate) / 100;
    const sd = n(storageDays);
    if (r <= 0) return [];

    return products.map((p) => {
      const l = n(p.length), w = n(p.width), h = n(p.height);
      const cbm = Math.max(0, l * w * h / 1_000_000);
      const cft = cbm * 35.315;
      const priceN = n(p.price);
      const costUsd = n(p.fobCny) / r;
      const headFreightN = n(p.headFreight);
      const commission = priceN * cr;
      const adCost = priceN * ar;
      const returnCostN = priceN * rr;
      const baseCost = costUsd + headFreightN + commission + adCost + returnCostN;

      const mode = p.deliveryMode;

      // ── FBA 计算 ──
      const fbaDeliveryN = n(p.fbaDelivery);
      const fbaStorageN = n(p.fbaStorage);
      const fbaTotalCost = baseCost + fbaDeliveryN + fbaStorageN;
      const fbaProfit = priceN - fbaTotalCost;
      const fbaMargin = priceN > 0 ? (fbaProfit / priceN) * 100 : 0;
      const fbaRoi = (costUsd + headFreightN) > 0 ? (fbaProfit / (costUsd + headFreightN)) * 100 : 0;

      // ── FBM 承运商计算 ──
      const fbmCalc: ProviderCalc[] = p.fbmCarriers.map((c) => {
        const shipFee = n(c.deliveryFee);
        const totalCost = baseCost + shipFee;
        const profit = priceN - totalCost;
        const margin = priceN > 0 ? (profit / priceN) * 100 : 0;
        const roi = (costUsd + headFreightN) > 0 ? (profit / (costUsd + headFreightN)) * 100 : 0;
        return {
          provId: c.id, provName: c.name || "未命名承运商",
          shipFee: Number(shipFee.toFixed(2)),
          storageFee: 0,
          totalCost: Number(totalCost.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          margin: Number(margin.toFixed(1)),
          roi: Number(roi.toFixed(1)),
          billingMode: "", billingDetail: "自发货，无仓储费",
          source: "carrier" as const,
        };
      });

      // ── 海外仓计算 ──
      const provCalcs: ProviderCalc[] = p.selectedProviders.map((provId) => {
        const prov = providersMap.get(provId);
        if (!prov) return null!;
        const shipFee = n(p.providerShipFees[provId] ?? "0");
        const storageFee = cbm > 0 ? calcStorageFee(l, w, h, prov, sd) : 0;
        const totalCost = baseCost + storageFee + shipFee;
        const profit = priceN - totalCost;
        const margin = priceN > 0 ? (profit / priceN) * 100 : 0;
        const roi = (costUsd + headFreightN) > 0 ? (profit / (costUsd + headFreightN)) * 100 : 0;
        let billingDetail = "";
        if (prov.billingMode === "days_tier") billingDetail = `天数阶梯(${sd}天落档)`;
        else billingDetail = `最长边${Math.max(l, w, h)}cm落档`;
        return {
          provId, provName: prov.name,
          shipFee: Number(shipFee.toFixed(2)),
          storageFee: Number(storageFee.toFixed(2)),
          totalCost: Number(totalCost.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          margin: Number(margin.toFixed(1)),
          roi: Number(roi.toFixed(1)),
          billingMode: prov.billingMode,
          billingDetail,
          source: "warehouse" as const,
        };
      }).filter(Boolean);

      // ── 构建对比列表 ──
      const comparisons: ComparisonEntry[] = [];
      const allFbmSchemes: ProviderCalc[] = [];

      if (mode === "FBA") {
        comparisons.push({ label: "FBA", profit: fbaProfit });
      }
      if (mode === "FBM") {
        // 承运商 + 海外仓 混在一起
        const all = [...fbmCalc, ...provCalcs];
        all.forEach((s) => {
          comparisons.push({ label: s.provName, profit: s.profit });
          allFbmSchemes.push(s);
        });
      }

      const hasAnyData = priceN > 0 || n(p.fobCny) > 0
        || (mode === "FBM" && (p.fbmCarriers.length > 0 || p.selectedProviders.length > 0));
      const hasComparison = comparisons.length >= 2;

      let bestLabel = "";
      let bestProfit = 0;
      if (hasComparison && hasAnyData) {
        const best = comparisons.reduce((a, b) => (b.profit > a.profit ? b : a));
        const nearBest = comparisons.filter((c) => Math.abs(c.profit - best.profit) < 0.01);
        if (nearBest.length === comparisons.length && comparisons.length > 1) {
          bestLabel = "各方案费用一致";
          bestProfit = best.profit;
        } else {
          bestLabel = best.label;
          bestProfit = best.profit;
        }
      }

      return {
        id: p.id, name: p.name || "未命名",
        cbm: Number(cbm.toFixed(6)), cft: Number(cft.toFixed(4)),
        volumeDisplay: `${cbm.toFixed(4)} m³ / ${cft.toFixed(2)} ft³`,
        costUsd: Number(costUsd.toFixed(2)),
        headFreight: headFreightN,
        commission: Number(commission.toFixed(2)),
        adCost: Number(adCost.toFixed(2)),
        returnCost: Number(returnCostN.toFixed(2)),
        baseCost: Number(baseCost.toFixed(2)),
        price: priceN,
        deliveryMode: mode,
        fbaDelivery: fbaDeliveryN, fbaStorage: fbaStorageN,
        fbaTotalCost: Number(fbaTotalCost.toFixed(2)),
        fbaProfit: Number(fbaProfit.toFixed(2)),
        fbaMargin: Number(fbaMargin.toFixed(1)),
        fbaRoi: Number(fbaRoi.toFixed(1)),
        fbmCarriers: fbmCalc,
        providers: provCalcs,
        allFbmSchemes,
        bestLabel, bestProfit, comparisons, hasComparison, hasAnyData,
      };
    });
  }, [products, rate, commRate, adRate, returnRate, storageDays, providersMap]);

  const inputCls = "w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200/50";
  const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500";

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-700">Profit Calculator</div>
        <h1 className="font-heading text-[26px] font-bold text-foreground-950">新品测算</h1>
        <p className="text-[13px] text-foreground-500">
          支持 FBA / FBM 二模式 · 站点切换自动联动货币与费率 · 自动计算净利/净利率/ROI
        </p>
      </div>

      {/* ── 全局参数 ── */}
      <Section title="全局参数" icon="ri-tools-line" subtitle="对所有产品生效">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <div>
            <label className={labelCls}>站点</label>
            <select className={inputCls + " cursor-pointer"} value={marketplace} onChange={(e) => {
              const mkt = e.target.value;
              setMarketplace(mkt);
              setCommRate(String(SITE_COMMISSION[mkt] ?? 15));
              setRate(RATE_DEFAULTS[mkt] ?? "7.25");
            }}>
              {MARKETPLACES.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>汇率 (CNY→{MARKETPLACE_CURRENCY_CODE[marketplace] ?? "USD"})</label>
            <input type="number" step="0.01" className={inputCls} value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>佣金率 (%)</label>
            <input type="number" step="0.1" className={inputCls} value={commRate} onChange={(e) => setCommRate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>广告率 (%)</label>
            <input type="number" step="0.1" className={inputCls} value={adRate} onChange={(e) => setAdRate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>退货率 (%)</label>
            <input type="number" step="0.1" className={inputCls} value={returnRate} onChange={(e) => setReturnRate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>仓储天数</label>
            <input type="number" step="1" className={inputCls} value={storageDays} onChange={(e) => setStorageDays(e.target.value)} />
          </div>
        </div>
      </Section>

      {/* ── 服务商提示 ── */}
      {providers.length === 0 && (
        <div className="rounded-xl border border-secondary-200 bg-secondary-50/60 px-4 py-3 text-[13px] text-secondary-800">
          <i className="ri-alert-line mr-1" aria-hidden />
          未检测到海外仓服务商，请前往 <strong>参数中心 → 海外仓费率</strong> 配置后再使用仓储费自动计算。
        </div>
      )}

      {/* ── 产品卡片 ── */}
      {products.map((p, pi) => {
        const result = results.find((r) => r.id === p.id);
        const isFba = p.deliveryMode === "FBA";
        const isFbm = p.deliveryMode === "FBM";
        const modeLabel = p.deliveryMode;

        return (
          <div key={p.id} className="rounded-2xl border border-background-200/70 bg-background-50 p-5 space-y-5">
            {/* 产品头部 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge tone="primary">产品 {pi + 1}</Badge>
                <span className="text-[13px] font-medium text-foreground-700">{p.name || "未命名"}</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* 配送方式切换 */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-foreground-500 font-medium whitespace-nowrap">配送方式</span>
                  <div className="flex rounded-md border border-background-200 bg-background-100/70 p-0.5">
                    {(["FBA", "FBM"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => updateProduct(p.id, { deliveryMode: m })}
                        className={`rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                          p.deliveryMode === m ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"
                        }`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {products.length > 1 && (
                  <button type="button" onClick={() => removeProduct(p.id)}
                    className="flex h-7 w-7 items-center justify-center rounded hover:bg-red-50 text-foreground-400 hover:text-red-500 cursor-pointer">
                    <i className="ri-close-line text-[16px]" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            {/* 尺寸 + 基础信息 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div><label className={labelCls}>品名</label><input className={inputCls} value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} placeholder="选填" /></div>
              <div><label className={labelCls}>ASIN</label><input className={inputCls} value={p.asin} onChange={(e) => updateProduct(p.id, { asin: e.target.value })} placeholder="选填" /></div>
              <div><label className={labelCls}>长 (cm)</label><input type="number" step="0.1" className={inputCls} value={p.length} onChange={(e) => updateProduct(p.id, { length: e.target.value })} placeholder="0" />{n(p.length) > 0 && <span className="mt-0.5 block text-[10px] text-foreground-500 mono-num">≈ {(n(p.length) / 2.54).toFixed(2)} in</span>}</div>
              <div><label className={labelCls}>宽 (cm)</label><input type="number" step="0.1" className={inputCls} value={p.width} onChange={(e) => updateProduct(p.id, { width: e.target.value })} placeholder="0" />{n(p.width) > 0 && <span className="mt-0.5 block text-[10px] text-foreground-500 mono-num">≈ {(n(p.width) / 2.54).toFixed(2)} in</span>}</div>
              <div><label className={labelCls}>高 (cm)</label><input type="number" step="0.1" className={inputCls} value={p.height} onChange={(e) => updateProduct(p.id, { height: e.target.value })} placeholder="0" />{n(p.height) > 0 && <span className="mt-0.5 block text-[10px] text-foreground-500 mono-num">≈ {(n(p.height) / 2.54).toFixed(2)} in</span>}</div>
              <div><label className={labelCls}>重量 (kg)</label><input type="number" step="0.01" className={inputCls} value={p.weight} onChange={(e) => updateProduct(p.id, { weight: e.target.value })} placeholder="0" />{n(p.weight) > 0 && <span className="mt-0.5 block text-[10px] text-foreground-500 mono-num">≈ {(n(p.weight) * 2.20462).toFixed(2)} lb</span>}</div>
            </div>

            {result && result.cbm > 0 && (
              <div className="rounded-lg bg-background-100/60 px-4 py-2.5 text-[12px] overflow-x-auto">
                <span className="text-foreground-500">体积：</span>
                <span className="mono-num font-semibold text-foreground-900">{result.volumeDisplay}</span>
                {n(p.weight) > 0 && (
                  <>
                    <span className="mx-2 text-foreground-300">|</span>
                    <span className="text-foreground-500">重量：</span>
                    <span className="mono-num font-semibold text-foreground-900">{n(p.weight).toFixed(2)} kg / {(n(p.weight) * 2.20462).toFixed(2)} lb</span>
                  </>
                )}
                <span className="mx-2 text-foreground-300">|</span>
                <span className="text-foreground-500">FOB折合：</span>
                <span className="mono-num font-semibold text-foreground-900">{currency}{result.costUsd.toFixed(2)}</span>
                <span className="mx-2 text-foreground-300">|</span>
                <span className="text-foreground-500">模式：</span>
                <Badge tone={isFba ? "primary" : "secondary"}>{modeLabel}</Badge>
                <span className="mx-2 text-foreground-300">|</span>
                <span className="text-foreground-500">站点：</span>
                <span className="text-foreground-700 font-medium">{marketplace} ({currency})</span>
              </div>
            )}

            {/* 成本参数 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div><label className={labelCls}>FOB 含税出厂价 (CNY)</label><input type="number" step="0.01" className={inputCls} value={p.fobCny} onChange={(e) => updateProduct(p.id, { fobCny: e.target.value })} placeholder="0" /></div>
              <div>
                <label className={labelCls}>头程 ({currency})</label>
                <div className="relative">
                  <input type="number" step="0.01" className={inputCls + " pr-8"} value={p.headFreight} onChange={(e) => updateProduct(p.id, { headFreight: e.target.value, headFreightManual: true })} placeholder="自动算" />
                  {p.headFreightManual && (
                    <button type="button" onClick={() => updateProduct(p.id, { headFreightManual: false, headFreight: "" })}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-primary-600 hover:underline cursor-pointer">自动</button>
                  )}
                </div>
              </div>
              <div><label className={labelCls}>预计售价 ({currency})</label><input type="number" step="0.01" className={inputCls} value={p.price} onChange={(e) => updateProduct(p.id, { price: e.target.value })} placeholder="0" /></div>
              <div><label className={labelCls}>单箱数</label><input type="number" step="1" className={inputCls} value={p.unitsPerBox} onChange={(e) => updateProduct(p.id, { unitsPerBox: e.target.value })} placeholder="1" /></div>
            </div>

            {/* ═══════ FBA 费用区（仅 FBA 模式下显示）═══════ */}
            {isFba && (
              <div className="rounded-xl border border-background-200/70 bg-background-100/30 p-4">
                <div className="text-[12px] font-semibold text-foreground-800 mb-3 flex items-center gap-2">
                  <i className="ri-archive-drawer-line text-primary-600" aria-hidden />
                  FBA 费用（手动填写，从亚马逊后台查）
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={labelCls}>FBA 配送费 ({currency}/件)</label><input type="number" step="0.01" className={inputCls} value={p.fbaDelivery} onChange={(e) => updateProduct(p.id, { fbaDelivery: e.target.value })} placeholder="从亚马逊后台查" /></div>
                  <div><label className={labelCls}>Amazon 仓储费 ({currency}/件/月)</label><input type="number" step="0.01" className={inputCls} value={p.fbaStorage} onChange={(e) => updateProduct(p.id, { fbaStorage: e.target.value })} placeholder="手动填入" /></div>
                </div>
              </div>
            )}

            {/* ═══════ FBM 自发货方案对比（仅 FBM 模式下显示）═══════ */}
            {isFbm && (
              <div className="rounded-xl border border-accent-200/70 bg-accent-50/20 p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                  <div className="text-[12px] font-semibold text-foreground-800 flex items-center gap-2">
                    <i className="ri-truck-line text-accent-600" aria-hidden />
                    自发货方案对比（可添加多个）
                  </div>
                  <button type="button" onClick={() => addFbmCarrier(p.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-accent-300 px-2.5 py-1 text-[11px] font-medium text-accent-600 hover:bg-accent-50 cursor-pointer whitespace-nowrap transition-colors">
                    <i className="ri-add-line" aria-hidden /> 添加承运商
                  </button>
                </div>

                {/* ── 承运商卡片 ── */}
                {p.fbmCarriers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                    {p.fbmCarriers.map((c) => (
                      <div key={c.id} className="rounded-lg border border-background-200/70 bg-background-50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <input className="w-full sm:w-[120px] rounded border border-background-200 bg-background-50 px-2 py-1 text-[12px] font-medium text-foreground-800 placeholder:text-foreground-400"
                            value={c.name} onChange={(e) => updateFbmCarrier(p.id, c.id, { name: e.target.value })} placeholder="承运商名称" />
                          <button type="button" onClick={() => removeFbmCarrier(p.id, c.id)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground-300 hover:text-red-400 hover:bg-red-50 cursor-pointer ml-1"
                            title="删除承运商">
                            <i className="ri-close-line text-[14px]" aria-hidden />
                          </button>
                        </div>
                        <div>
                          <label className={labelCls}>配送费 ({currency}/件)</label>
                          <input type="number" step="0.01" className={inputCls} value={c.deliveryFee}
                            onChange={(e) => updateFbmCarrier(p.id, c.id, { deliveryFee: e.target.value })} placeholder="0.00" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-background-200/70 bg-background-100/60 px-4 py-3 text-center text-[12px] text-foreground-500 mb-4">
                    点击「添加承运商」输入名称和配送费，或从下方勾选海外仓服务商参与比价
                  </div>
                )}

                {/* ── 海外仓服务商勾选（FBM 模式下与承运商混合比价）── */}
                {providers.length > 0 && (
                  <>
                    <div className="text-[11px] font-semibold text-foreground-700 mb-2 flex items-center gap-2">
                      <i className="ri-building-2-line text-accent-600" aria-hidden />
                      海外仓服务商（勾选后自动计算仓储费，需手填配送费）
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {providers.map((prov) => {
                        const isSel = p.selectedProviders.includes(prov.id);
                        return (
                          <div key={prov.id} className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => toggleProvider(p.id, prov.id)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                                isSel ? "border-accent-400 bg-accent-100 text-accent-800" : "border-background-200 bg-background-50 text-foreground-500 hover:border-accent-300"
                              }`}>
                              {isSel ? <i className="ri-checkbox-circle-fill text-accent-600 text-[14px]" aria-hidden /> : <i className="ri-checkbox-blank-circle-line text-[14px]" aria-hidden />}
                              {prov.name}
                            </button>
                            <button type="button" onClick={() => removeProvider(prov.id)}
                              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-foreground-300 hover:text-red-400 hover:bg-red-50 cursor-pointer"
                              title="删除该服务商">
                              <i className="ri-close-line" aria-hidden />
                            </button>
                          </div>
                        );
                      })}
                      <button type="button" onClick={() => setShowAddProvider((s) => !s)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-accent-300 px-3 py-1.5 text-[12px] font-medium text-accent-600 hover:bg-accent-50 cursor-pointer transition-colors whitespace-nowrap">
                        <i className="ri-add-line" aria-hidden /> 新增服务商
                      </button>
                    </div>

                    {showAddProvider && (
                      <div className="rounded-lg border border-accent-200 bg-accent-50/40 p-3 mb-3">
                        <div className="flex items-end gap-3 flex-wrap">
                          <div className="flex-1 min-w-[120px]">
                            <label className={labelCls}>服务商名称</label>
                            <input className={inputCls} value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="如：4PX / 燕文" />
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <label className={labelCls}>仓储费率 ({currency}/m³/天)</label>
                            <input type="number" step="0.01" className={inputCls} value={newProviderRate} onChange={(e) => setNewProviderRate(e.target.value)} placeholder="如 0.5" />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={saveNewProvider}
                              className="rounded-md bg-accent-500 px-3 py-2 text-[12px] font-semibold text-background-50 hover:bg-accent-600 cursor-pointer whitespace-nowrap transition-colors">
                              <i className="ri-check-line mr-1" aria-hidden />保存
                            </button>
                            <button type="button" onClick={() => { setShowAddProvider(false); setNewProviderName(""); setNewProviderRate(""); }}
                              className="rounded-md border border-background-200 px-3 py-2 text-[12px] font-medium text-foreground-600 hover:border-accent-400 cursor-pointer whitespace-nowrap transition-colors">
                              取消
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 已勾选的海外仓配送费输入 */}
                    {p.selectedProviders.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {p.selectedProviders.map((provId) => {
                          const prov = providersMap.get(provId);
                          if (!prov) return null;
                          const pc = result?.providers.find((x) => x.provId === provId);
                          return (
                            <div key={provId} className="rounded-lg border border-background-200/70 bg-background-50 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-semibold text-foreground-800">{prov.name}</span>
                                <span className="text-[10px] text-foreground-500">{prov.billingMode === "days_tier" ? "天数阶梯" : "最长边阶梯"}</span>
                              </div>
                              <input type="number" step="0.01" className={inputCls + " mb-1.5"} value={p.providerShipFees[provId] ?? ""}
                                onChange={(e) => updateProviderShip(p.id, provId, e.target.value)} placeholder={`末端配送费 (${currency})`} />
                              {pc && (
                                <div className="text-[11px] text-foreground-500">
                                  仓储费: <span className="mono-num font-medium text-foreground-800">{currency}{pc.storageFee.toFixed(2)}</span>
                                  <span className="mx-1">·</span><span>{pc.billingDetail}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ═══════ 结果区 ═══════ */}
            {result && !result.hasAnyData && (
              <div className="rounded-lg border border-background-200/70 bg-background-100/60 px-4 py-6 text-center text-[13px] text-foreground-500">
                <i className="ri-calculator-line mb-2 block text-[28px] text-foreground-300" aria-hidden />
                {isFba ? "请填写 FBA 费用和售价后查看测算结果" : "请添加自发货方案（承运商或海外仓）并输入参数后查看测算结果"}
              </div>
            )}

            {/* ── FBA 模式：单方案结果卡 ── */}
            {result && result.hasAnyData && isFba && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
                  <i className="ri-bar-chart-grouped-line mr-1" aria-hidden />FBA 测算结果
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  <MiniCard label="FOB折合" value={`${currency}${result.costUsd.toFixed(2)}`} />
                  <MiniCard label="头程" value={`${currency}${result.headFreight.toFixed(2)}`} />
                  <MiniCard label="售价" value={`${currency}${result.price.toFixed(2)}`} />
                  <MiniCard label="净利" value={`${currency}${result.fbaProfit.toFixed(2)}`} tone={result.fbaProfit >= 0 ? "green" : "red"} />
                  <MiniCard label="净利率" value={`${result.fbaMargin.toFixed(1)}%`} tone={result.fbaMargin >= 0 ? "green" : "red"} />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <CompareCard
                    label="FBA"
                    isBest={false}
                    isTie={false}
                    delivery={result.fbaDelivery}
                    storage={result.fbaStorage}
                    totalCost={result.fbaTotalCost}
                    profit={result.fbaProfit}
                    margin={result.fbaMargin}
                    roi={result.fbaRoi}
                    baseCost={result.baseCost}
                    costUsd={result.costUsd}
                    headFreight={result.headFreight}
                    commission={result.commission}
                    adCost={result.adCost}
                    returnCost={result.returnCost}
                    currency={currency}
                  />
                </div>
              </div>
            )}

            {/* ── FBM 模式：多方案比价结果 ── */}
            {result && result.hasAnyData && isFbm && result.allFbmSchemes.length === 0 && (
              <div className="rounded-lg border border-background-200/70 bg-background-100/60 px-4 py-6 text-center text-[13px] text-foreground-500">
                <i className="ri-truck-line mb-2 block text-[28px] text-foreground-300" aria-hidden />
                请添加自发货方案（承运商或海外仓）并输入参数后查看测算结果
              </div>
            )}

            {result && result.hasAnyData && isFbm && result.allFbmSchemes.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-500">
                    <i className="ri-bar-chart-grouped-line mr-1" aria-hidden />
                    {result.allFbmSchemes.length >= 2 ? "自发货方案比价" : "自发货测算结果"}
                  </div>
                  {result.bestLabel && result.bestLabel !== "各方案费用一致" && result.allFbmSchemes.length >= 2 && (
                    <span className="text-[12px] font-medium text-accent-700">
                      <i className="ri-medal-line mr-1" aria-hidden />最优：{result.bestLabel}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  <MiniCard label="FOB折合" value={`${currency}${result.costUsd.toFixed(2)}`} />
                  <MiniCard label="头程" value={`${currency}${result.headFreight.toFixed(2)}`} />
                  <MiniCard label="售价" value={`${currency}${result.price.toFixed(2)}`} />
                  <MiniCard label="方案数" value={`${result.allFbmSchemes.length} 个`} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {result.allFbmSchemes.map((pc) => {
                    const isBest = result.allFbmSchemes.length >= 2
                      && result.bestLabel === pc.provName
                      && result.bestLabel !== "各方案费用一致";
                    const isTie = result.allFbmSchemes.length >= 2
                      && result.bestLabel === "各方案费用一致";
                    return (
                      <CompareCard
                        key={pc.provId}
                        label={pc.provName}
                        isBest={isBest}
                        isTie={isTie}
                        delivery={pc.shipFee}
                        storage={pc.storageFee}
                        totalCost={pc.totalCost}
                        profit={pc.profit}
                        margin={pc.margin}
                        roi={pc.roi}
                        baseCost={result.baseCost}
                        costUsd={result.costUsd}
                        headFreight={result.headFreight}
                        commission={result.commission}
                        adCost={result.adCost}
                        returnCost={result.returnCost}
                        billingDetail={pc.billingDetail}
                        currency={currency}
                        isCarrier={pc.source === "carrier"}
                      />
                    );
                  })}
                </div>

                {result.bestLabel === "各方案费用一致" && (
                  <div className="rounded-lg border border-background-200/70 bg-background-100/60 px-4 py-2 text-center text-[12px] text-foreground-600">
                    各方案费用一致，无明显最优选项
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 添加产品 */}
      <button type="button" onClick={addProduct}
        className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-background-300 px-5 py-3 text-[13px] font-medium text-foreground-500 hover:border-primary-400 hover:text-primary-700 cursor-pointer whitespace-nowrap transition-colors">
        <i className="ri-add-line" aria-hidden /> 添加产品
      </button>

      {/* 底部操作 */}
      <div className="flex flex-wrap gap-3 items-end">
        <button type="button" onClick={() => setProducts([emptyProduct()])}
          className="rounded-lg border border-background-200 px-5 py-2.5 text-sm font-medium text-foreground-600 hover:border-primary-400 hover:text-primary-700 cursor-pointer transition-colors">
          <i className="ri-refresh-line mr-1" aria-hidden /> 清空
        </button>
      </div>

      {/* ══ 保存测算 ══ */}
      <Section title="保存测算" icon="ri-save-line" subtitle="保存测算记录，或直接新建为 SKU 进入主档">
        <div className="space-y-4">
          {/* 保存模式选择 */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-foreground-500 whitespace-nowrap">保存方式：</span>
            <div className="flex rounded-md border border-background-200 bg-background-100/70 p-0.5">
              <button
                type="button"
                onClick={() => setSaveMode("record_only")}
                className={`rounded px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  saveMode === "record_only" ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"
                }`}
              >
                <i className="ri-file-list-3-line mr-1" aria-hidden /> 仅保存测算记录
              </button>
              <button
                type="button"
                onClick={() => setSaveMode("new_sku")}
                className={`rounded px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  saveMode === "new_sku" ? "bg-primary-500 text-background-50" : "text-foreground-500 hover:text-foreground-800"
                }`}
              >
                <i className="ri-add-box-line mr-1" aria-hidden /> 保存为新品 SKU
              </button>
            </div>
          </div>

          {/* 新建 SKU 时需要的字段 */}
          {saveMode === "new_sku" && (
            <div className="rounded-lg border border-accent-200/70 bg-accent-50/20 p-3">
              <p className="text-[11px] text-foreground-600 mb-3">
                <i className="ri-information-line mr-1" aria-hidden />
                将根据测算结果自动填充成本字段，创建一个全新的 SKU 记录
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">SKU 编码 *</label>
                  <input
                    value={newSkuCode}
                    onChange={(e) => setNewSkuCode(e.target.value)}
                    placeholder="如：SKU-001"
                    className="w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">品名 *</label>
                  <input
                    value={newSkuName}
                    onChange={(e) => setNewSkuName(e.target.value)}
                    placeholder={results[0]?.name || "产品名称"}
                    className="w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">所属店铺</label>
                  <input
                    value={newSkuStore}
                    onChange={(e) => setNewSkuStore(e.target.value)}
                    placeholder="如：US-Store1"
                    className="w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 备注 + 操作按钮 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground-500">备注（选填）</label>
              <input
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="如：此方案用于 Q4 起上新品"
                className="w-full rounded-md border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-800 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                const firstResult = results[0];
                if (!firstResult || !firstResult.hasAnyData) {
                  setSaveMsg("请先填写产品参数并完成测算");
                  setTimeout(() => setSaveMsg(null), 2000);
                  return;
                }

                if (saveMode === "new_sku") {
                  if (!newSkuCode.trim()) { setSaveMsg("请输入 SKU 编码"); setTimeout(() => setSaveMsg(null), 2000); return; }
                  if (!newSkuName.trim()) { setSaveMsg("请输入品名"); setTimeout(() => setSaveMsg(null), 2000); return; }

                  // 检查 SKU 编码是否已存在
                  const existing = await db.skuMaster.get(newSkuCode.trim());
                  if (existing) { setSaveMsg(`SKU ${newSkuCode.trim()} 已存在，请换一个编码`); setTimeout(() => setSaveMsg(null), 3000); return; }

                  const r = firstResult;
                  const newSku: SkuMaster = {
                    sku: newSkuCode.trim(),
                    name: newSkuName.trim(),
                    saleStatus: "active",
                    fulfillment: r.deliveryMode,
                    store: newSkuStore.trim() || "默认店铺",
                    marketplace,
                    price: r.price,
                    costFob: r.costUsd,
                    costShipping: r.headFreight,
                    costDelivery: r.deliveryMode === "FBA" ? r.fbaDelivery : (r.allFbmSchemes[0]?.shipFee ?? 0),
                    costCommission: r.commission,
                    costStorage: r.deliveryMode === "FBA" ? r.fbaStorage : (r.allFbmSchemes[0]?.storageFee ?? 0),
                    costAd: r.adCost,
                    costReturn: r.returnCost,
                  };
                  await db.skuMaster.put(newSku);
                  setSkuList((prev) => [...prev, newSku]);
                }

                // 始终保存测算记录
                // FBA 模式：每个产品保存一条记录
                // FBM 模式：每个产品的每个方案各保存一条记录（含方案名称和最优标记）
                const toSave: CalculationRecord[] = [];
                for (const r of results.filter((r) => r.hasAnyData)) {
                  const productName = saveMode === "new_sku" ? newSkuName.trim() : r.name;
                  const productSku = saveMode === "new_sku" ? newSkuCode.trim() : undefined;
                  const productAsin = products.find((p) => p.id === r.id)?.asin || undefined;
                  const baseFields = {
                    marketplace,
                    exchangeRate: Number(n(rate).toFixed(4)),
                    commissionRate: Number(n(commRate).toFixed(1)),
                    adRate: Number(n(adRate).toFixed(1)),
                    returnRate: Number(n(returnRate).toFixed(1)),
                    storageDays: Math.round(n(storageDays)),
                    price: r.price,
                    deliveryMode: r.deliveryMode,
                    costFob: r.costUsd,
                    costShipping: r.headFreight,
                    costCommission: r.commission,
                    costAd: r.adCost,
                    costReturn: r.returnCost,
                    coupon: 0,
                    notes: saveNotes || undefined,
                    createdAt: new Date().toISOString(),
                  };

                  if (r.deliveryMode === "FBA") {
                    toSave.push({
                      id: uid(),
                      name: productName,
                      sku: productSku,
                      asin: productAsin,
                      ...baseFields,
                      costDelivery: r.fbaDelivery,
                      costStorage: r.fbaStorage,
                      fbaDelivery: r.fbaDelivery,
                      fbaStorage: r.fbaStorage,
                      totalCost: r.fbaTotalCost,
                      grossProfit: r.fbaProfit,
                      grossMargin: r.fbaMargin,
                      roi: r.fbaRoi,
                      schemeName: "FBA",
                    });
                  } else {
                    // FBM: 每个方案保存一条记录
                    for (const scheme of r.allFbmSchemes) {
                      const isBest = r.allFbmSchemes.length >= 2
                        && r.bestLabel === scheme.provName
                        && r.bestLabel !== "各方案费用一致";
                      toSave.push({
                        id: uid(),
                        name: productName,
                        sku: productSku,
                        asin: productAsin,
                        ...baseFields,
                        costDelivery: scheme.shipFee,
                        costStorage: scheme.storageFee,
                        totalCost: scheme.totalCost,
                        grossProfit: scheme.profit,
                        grossMargin: scheme.margin,
                        roi: scheme.roi,
                        schemeName: scheme.provName,
                        isBestScheme: isBest,
                      });
                    }
                    // FBM 模式下如果没有方案，至少保存一条基础记录
                    if (r.allFbmSchemes.length === 0) {
                      toSave.push({
                        id: uid(),
                        name: productName,
                        sku: productSku,
                        asin: productAsin,
                        ...baseFields,
                        costDelivery: 0,
                        costStorage: 0,
                        totalCost: r.baseCost,
                        grossProfit: r.price - r.baseCost,
                        grossMargin: r.price > 0 ? ((r.price - r.baseCost) / r.price) * 100 : 0,
                        roi: (r.costUsd + r.headFreight) > 0 ? ((r.price - r.baseCost) / (r.costUsd + r.headFreight)) * 100 : 0,
                        schemeName: "（无方案）",
                      });
                    }
                  }
                }

                await db.calculationRecords.bulkPut(toSave);
                loadRecords();

                if (saveMode === "new_sku") {
                  setSaveMsg(`已创建新品 SKU「${newSkuCode.trim()}」并保存 ${toSave.length} 条测算记录`);
                  setNewSkuCode("");
                  setNewSkuName("");
                  setNewSkuStore("");
                } else {
                  setSaveMsg(`已保存 ${toSave.length} 条测算记录${toSave.length > 1 ? "（含全部方案）" : ""}`);
                }
                setTimeout(() => setSaveMsg(null), 3000);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2.5 text-[13px] font-semibold text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap"
            >
              <i className={saveMode === "new_sku" ? "ri-add-box-line" : "ri-save-line"} aria-hidden />
              {saveMode === "new_sku" ? "创建 SKU 并保存" : "保存测算记录"}
            </button>
          </div>
          {saveMsg && (
            <div className={[
              "rounded-lg px-3 py-2 text-[12px]",
              saveMsg.includes("请输入") || saveMsg.includes("已存在")
                ? "border border-red-200 bg-red-50 text-red-800"
                : "border border-accent-200 bg-accent-50/70 text-accent-800",
            ].join(" ")}>
              <i className={saveMsg.includes("请输入") || saveMsg.includes("已存在") ? "ri-error-warning-line" : "ri-check-line"} mr-1 aria-hidden />
              {saveMsg}
            </div>
          )}
        </div>
      </Section>

      {/* ══ 测算记录历史 ══ */}
      <Section
        title="测算记录"
        icon="ri-history-line"
        subtitle={`共 ${calcRecords.length} 条记录`}
        action={
          <button type="button" onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1 rounded-md border border-background-200 bg-background-50 px-3 py-1.5 text-[12px] font-medium text-foreground-600 hover:bg-background-100 cursor-pointer">
            {showHistory ? "收起" : "展开查看"}
          </button>
        }
      >
        {showHistory && (
          <CalculationHistory records={calcRecords} onRefresh={loadRecords} />
        )}
        {!showHistory && calcRecords.length > 0 && (
          <div className="text-[12px] text-foreground-500">最近保存：{calcRecords[0].name || "未命名"} • {new Date(calcRecords[0].createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
        )}
      </Section>
    </div>
  );
}

// ── MiniCard ──
function MiniCard({ label, value, tone, highlight }: { label: string; value: string; tone?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? "bg-accent-100/60 border border-accent-200" : "bg-background-100"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground-500">{label}</div>
      <div className={`mt-1 text-lg font-bold mono-num ${
        tone === "green" ? "text-[#2ecc71]" : tone === "red" ? "text-[#ff6b6b]" : tone === "accent" ? "text-accent-700" : "text-foreground-900"
      }`}>{value}</div>
    </div>
  );
}

// ── CompareCard ──
function CompareCard({
  label, isBest, isTie, delivery, storage, totalCost, profit, margin, roi,
  baseCost, costUsd, headFreight, commission, adCost, returnCost, billingDetail,
  currency, isCarrier,
}: {
  label: string; isBest: boolean; isTie: boolean;
  delivery: number; storage: number; totalCost: number; profit: number; margin: number; roi: number;
  baseCost: number; costUsd: number; headFreight: number; commission: number; adCost: number; returnCost: number;
  billingDetail?: string;
  currency: string;
  isCarrier?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isHighlight = isBest && !isTie;

  return (
    <div className={`rounded-xl border-2 p-4 cursor-pointer transition-colors ${isHighlight ? "border-[#2ecc71] bg-green-50/30" : "border-background-200/70 bg-background-50"}`}
      onClick={() => setExpanded(!expanded)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-foreground-900">{label}</span>
          {isCarrier && <span className="text-[10px] text-foreground-500 bg-background-100 px-1.5 py-0.5 rounded">承运商</span>}
          {isHighlight && <Badge tone="accent">最优</Badge>}
          {isTie && <span className="text-[10px] text-foreground-500">费用一致</span>}
        </div>
        <i className={`ri-${expanded ? "arrow-up-s-line" : "arrow-down-s-line"} text-foreground-400 text-[14px]`} aria-hidden />
      </div>
      <div className="space-y-1.5 text-[12px]">
        <Row label="配送费" value={`${currency}${delivery.toFixed(2)}`} />
        {storage > 0 && <Row label="仓储费" value={`${currency}${storage.toFixed(2)}`} note="估算" />}
        {storage === 0 && !isCarrier && <Row label="仓储费" value={`${currency}${storage.toFixed(2)}`} />}
        {storage === 0 && isCarrier && <Row label="仓储费" value="—（无仓储费）" />}
        <div className="my-1.5 h-px bg-background-200/70" />
        <Row label="总成本" value={`${currency}${totalCost.toFixed(2)}`} bold />
        <Row label="净利" value={`${currency}${profit.toFixed(2)}`} tone={profit >= 0 ? "text-[#2ecc71]" : "text-[#ff6b6b]"} bold />
        <Row label="净利率" value={`${margin.toFixed(1)}%`} tone={margin >= 0 ? "text-[#2ecc71]" : "text-[#ff6b6b]"} bold />
        <Row label="ROI" value={`${roi.toFixed(1)}%`} />
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-background-200/70 space-y-1 text-[11px]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground-500 mb-1">成本明细</div>
          <Row label="FOB折合" value={`${currency}${costUsd.toFixed(2)}`} />
          <Row label="头程" value={`${currency}${headFreight.toFixed(2)}`} />
          <Row label="佣金" value={`${currency}${commission.toFixed(2)}`} />
          <Row label="广告费" value={`${currency}${adCost.toFixed(2)}`} />
          <Row label="退货费" value={`${currency}${returnCost.toFixed(2)}`} />
          <Row label="配送费" value={`${currency}${delivery.toFixed(2)}`} />
          {storage > 0 && <Row label="仓储费" value={`${currency}${storage.toFixed(2)}`} note="估算" />}
          {storage === 0 && !isCarrier && <Row label="仓储费" value={`${currency}${storage.toFixed(2)}`} />}
          {storage === 0 && isCarrier && <Row label="仓储费" value="—（无仓储费）" />}
          {billingDetail && <Row label="计费模式" value={billingDetail} />}
          <div className="my-1 h-px bg-background-200/70" />
          <Row label="单件净利" value={`${currency}${profit.toFixed(2)}`} tone={profit >= 0 ? "text-[#2ecc71]" : "text-[#ff6b6b]"} bold />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, tone, note }: { label: string; value: string; bold?: boolean; tone?: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-foreground-500">{label}</span>
      <span className={`mono-num text-right ${bold ? "font-semibold" : "font-medium"} ${tone ?? "text-foreground-900"}`}>
        {value}
        {note && <span className="ml-1 text-[10px] font-normal text-foreground-400">{note}</span>}
      </span>
    </div>
  );
}