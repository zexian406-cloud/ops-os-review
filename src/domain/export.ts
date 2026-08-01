import * as XLSX from "xlsx";
import { db } from "./db";
import { computeAll } from "./calculator";

const autoCols = (headers: string[]) =>
  headers.map((h) => ({ wch: Math.max(10, Math.min(28, h.length * 2.2 + 2)) }));

export async function exportAllData(): Promise<void> {
  const [
    skuMaster,
    dailySnapshot,
    inventoryLayer,
    campaigns,
    promotions,
    alerts,
    config,
    todos,
  ] = await Promise.all([
    db.skuMaster.toArray(),
    db.dailySnapshot.toArray(),
    db.inventoryLayer.toArray(),
    db.campaigns.toArray(),
    db.promotions.toArray(),
    db.alerts.toArray(),
    db.config.toArray(),
    db.todos.toArray(),
  ]);

  const wb = XLSX.utils.book_new();
  const today = new Date().toISOString().slice(0, 10);

  // ── Sheet 1: SKU主数据 ──
  const skuHeaders = [
    "品名", "SKU", "MSKU", "ASIN", "UPC", "父体ASIN", "父体SKU", "所属父SKU分组",
    "链接类型", "销售情况", "仓库类型", "所属店铺", "站点", "品类",
    "售价", "ListPrice", "优惠券",
    "FOB", "头程", "配送费", "佣金", "仓储费", "广告费", "退货费",
    "包裹长(cm)", "包裹宽(cm)", "包裹高(cm)", "包裹重(kg)", "单箱数",
    "LeadTime(天)", "安全库存(天)", "产品链接",
    "A+", "高级A+", "安装视频", "透明计划",
    "生命周期", "上架日期",
  ];
  const skuRows = skuMaster.map((s) => [
    s.name, s.sku, s.msku ?? "", s.asin ?? "", s.upc ?? "", s.parentAsin ?? "", s.parentSku ?? "", s.groupSku ?? "",
    s.linkType ?? "", s.saleStatus, s.fulfillment, s.store, s.marketplace ?? "", s.category ?? "",
    s.price, s.listPrice ?? "", s.coupon ?? "",
    s.costFob ?? "", s.costShipping ?? "", s.costDelivery ?? "", s.costCommission ?? "",
    s.costStorage ?? "", s.costAd ?? "", s.costReturn ?? "",
    s.packageLength ?? "", s.packageWidth ?? "", s.packageHeight ?? "", s.packageWeight ?? "", s.unitsPerBox ?? "",
    s.leadTimeDays ?? "", s.safetyStockDays ?? "", s.productUrl ?? "",
    s.aPlus ?? "", s.aPlusAdvanced ?? "", s.installVideo ?? "", s.transparentPlan ?? "",
    s.lifecycle ?? "", s.launchDate ?? "",
  ]);
  const skuSheet = XLSX.utils.aoa_to_sheet([skuHeaders, ...skuRows]);
  skuSheet["!cols"] = autoCols(skuHeaders);
  XLSX.utils.book_append_sheet(wb, skuSheet, "SKU主数据");

  // ── Sheet 2: 成本明细 ──
  const costHeaders = [
    "SKU", "品名", "售价", "FOB", "头程", "配送费", "佣金", "仓储费", "广告费", "退货费", "优惠券",
    "总成本", "单件净利", "净利率(%)",
  ];
  const costRows = skuMaster.map((s) => {
    // 用统一计算引擎 computeAll，杜绝手写公式误加 coupon
    const calc = computeAll({ sku: s });
    const fob = calc.costFob;
    const shipping = calc.costShipping;
    const delivery = calc.costDelivery;
    const commission = calc.costCommission;
    const storage = calc.costStorage;
    const ad = calc.costAd;
    const ret = calc.costReturn;
    const coupon = s.coupon ?? 0;
    const totalCost = calc.totalCost;
    const profit = calc.grossProfit;
    const margin = calc.grossMargin;
    return [
      s.sku, s.name, s.price, fob, shipping, delivery, commission, storage, ad, ret, coupon,
      Number(totalCost.toFixed(2)), Number(profit.toFixed(2)), Number(margin.toFixed(1)),
    ];
  });
  const costSheet = XLSX.utils.aoa_to_sheet([costHeaders, ...costRows]);
  costSheet["!cols"] = autoCols(costHeaders);
  XLSX.utils.book_append_sheet(wb, costSheet, "成本明细");

  // ── Sheet 3: 发货决策 ──
  const invHeaders = [
    "SKU", "品名", "日期", "FBA在库", "FBM在库", "工厂库存",
    "美东在途", "美西在途", "美东南在途", "美中南在途",
    "美东在库", "美西在库", "美东南在库", "美中南在库",
    "在途批次", "工厂批次",
  ];
  const invRows = inventoryLayer.map((inv) => {
    const transitSummary = inv.transitBatches
      ? inv.transitBatches.map((b) => `${b.warehouse}:${b.qty}(${b.etaDate})`).join("; ")
      : "";
    const factorySummary = inv.factoryBatches
      ? inv.factoryBatches.map((b) => `${b.factoryName}:${b.qty}(交期${b.deliveryDate})`).join("; ")
      : "";
    const sku = skuMaster.find((s) => s.sku === inv.sku);
    return [
      inv.sku, sku?.name ?? "", inv.date,
      inv.fbaStock, inv.fbmStock, inv.factoryStock ?? 0,
      inv.eastTransit, inv.westTransit, inv.southeast, inv.southcentral,
      inv.eastStock ?? 0, inv.westStock ?? 0, inv.southeastStock ?? 0, inv.southcentralStock ?? 0,
      transitSummary, factorySummary,
    ];
  });
  const invSheet = XLSX.utils.aoa_to_sheet([invHeaders, ...invRows]);
  invSheet["!cols"] = autoCols(invHeaders);
  XLSX.utils.book_append_sheet(wb, invSheet, "发货决策");

  // ── Sheet 4: 待办 ──
  const todoHeaders = ["标题", "关联SKU", "截止日", "状态", "创建时间", "完成时间"];
  const todoRows = todos.map((t) => [
    t.content, t.relatedSku ?? "", t.dueDate ?? "",
    t.completed ? "已完成" : "未完成", t.createdAt, t.completedAt ?? "",
  ]);
  const todoSheet = XLSX.utils.aoa_to_sheet([todoHeaders, ...todoRows]);
  todoSheet["!cols"] = autoCols(todoHeaders);
  XLSX.utils.book_append_sheet(wb, todoSheet, "待办");

  // ── Sheet 5: 促销活动 ──
  const promoHeaders = ["名称", "SKU", "品名", "店铺", "类型", "开始", "结束", "状态", "备注"];
  const promoRows = promotions.map((p) => [
    p.name, p.sku, p.skuName ?? "", p.store, p.type,
    p.startDate, p.endDate, p.status, p.notes ?? "",
  ]);
  const promoSheet = XLSX.utils.aoa_to_sheet([promoHeaders, ...promoRows]);
  promoSheet["!cols"] = autoCols(promoHeaders);
  XLSX.utils.book_append_sheet(wb, promoSheet, "促销活动");

  // ── Sheet 6: 周数据快照 ──
  const snapHeaders = [
    "日期", "SKU", "品名",
    "近7天日均销量", "近30天销量",
    "在库库存", "在途库存", "在库覆盖天数", "含在途覆盖天数",
    "广告花费", "广告费比(%)", "利润", "利润率(%)", "总成本",
    "评分", "评论数", "退货率(%)", "退款率(%)",
  ];
  const snapRows = dailySnapshot.map((snap) => {
    const sku = skuMaster.find((s) => s.sku === snap.sku);
    return [
      snap.date, snap.sku, sku?.name ?? "",
      snap.dailySales7d, snap.monthlySales,
      snap.stockOnHand, snap.stockInTransit,
      snap.daysOfCoverOnHand, snap.daysOfCoverWithTransit,
      snap.adSpend, snap.adRatio, snap.profit, snap.profitMargin, snap.totalCost,
      snap.rating, snap.reviewCount ?? "", snap.returnRate, snap.refundRate ?? "",
    ];
  });
  const snapSheet = XLSX.utils.aoa_to_sheet([snapHeaders, ...snapRows]);
  snapSheet["!cols"] = autoCols(snapHeaders);
  XLSX.utils.book_append_sheet(wb, snapSheet, "周数据快照");

  // ── 下载 ──
  const filename = `Amazon-Ops-OS-数据导出-${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}