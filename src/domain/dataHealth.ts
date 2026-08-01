import type { DailySnapshot, InventoryLayer, SkuMaster } from "./types";
import { buildSnapshotMap, buildInventoryMap } from "./engine";
import { computeWarehouseTotals } from "./calculator";

/**
 * 数据健康检查 — 在"发现问题"之前，先校验 ERP 导出的数据质量。
 *
 * 纯计算、无存储、无服务器。扫描维度：
 *  - 缺失成本：有售价但缺 FOB / 头程费 → 利润失真
 *  - 缺失库存：无库存记录 → 无法计算覆盖天数与补货
 *  - 异常利润：利润率为负 / 为 0（多半是成本缺失）
 *  - 异常销量：日销为 0 / 月销与日销比例失衡 / 负值
 *
 * 不修改任何 ERP 数据源逻辑，仅基于已导入的 skuMaster / snapshot / inventory 给出问题清单。
 */

export type HealthCategory =
  | "missing_cost"
  | "missing_inventory"
  | "abnormal_profit"
  | "abnormal_sales"
  | "missing_leadtime"
  | "stock_negative";

export interface HealthIssue {
  sku: string;
  skuName?: string;
  detail: string;
  severity: "critical" | "warning";
}

export interface HealthReport {
  issues: HealthIssue[];
  byCategory: Record<HealthCategory, HealthIssue[]>;
  counts: Record<HealthCategory, number>;
  total: number;
  skuCount: number;
  checkedAt: string;
}

const CATEGORY_LABELS: Record<HealthCategory, string> = {
  missing_cost: "缺失成本",
  missing_inventory: "缺失库存",
  abnormal_profit: "异常利润",
  abnormal_sales: "异常销量",
  missing_leadtime: "缺失备货周期",
  stock_negative: "库存为负",
};

export const HEALTH_CATEGORY_LABELS = CATEGORY_LABELS;

export function runDataHealth(input: {
  skuMaster: SkuMaster[];
  snapshots: DailySnapshot[];
  inventory: InventoryLayer[];
}): HealthReport {
  const { skuMaster, snapshots, inventory } = input;
  const snapMap = buildSnapshotMap(snapshots);
  const invMap = buildInventoryMap(inventory);

  const byCategory: Record<HealthCategory, HealthIssue[]> = {
    missing_cost: [],
    missing_inventory: [],
    abnormal_profit: [],
    abnormal_sales: [],
    missing_leadtime: [],
    stock_negative: [],
  };

  let checked = 0;

  for (const sku of skuMaster) {
    if (sku.saleStatus === "discontinued") continue;
    checked++;
    const snap = snapMap.get(sku.sku);
    const inv = invMap.get(sku.sku);
    const skuName = sku.name;

    // ── 缺失成本 ──
    if (sku.price > 0) {
      if (sku.costFob == null || sku.costFob <= 0) {
        byCategory.missing_cost.push({
          sku: sku.sku,
          skuName,
          detail: "有售价但缺失 FOB 成本（产品成本），利润率将被低估/失真",
          severity: "warning",
        });
      }
      if (sku.costShipping == null || sku.costShipping <= 0) {
        byCategory.missing_cost.push({
          sku: sku.sku,
          skuName,
          detail: "缺失头程费，到岸成本不完整",
          severity: "warning",
        });
      }
    }

    // ── 缺失库存 ──
    if (!inv) {
      byCategory.missing_inventory.push({
        sku: sku.sku,
        skuName,
        detail: "无库存记录（未导入 FBA库存明细 / 仓库明细），无法计算覆盖天数与补货建议",
        severity: "warning",
      });
    } else {
      // ── 库存为负（数据异常）──
      const whTotal = computeWarehouseTotals(inv).total;
      if (whTotal < 0) {
        byCategory.stock_negative.push({
          sku: sku.sku,
          skuName,
          detail: `库存总和为负（${whTotal.toFixed(0)}），四仓/在途数量存在负值，数据异常`,
          severity: "critical",
        });
      }
    }

    // ── 缺失备货周期（Lead Time）──
    if (sku.leadTimeDays == null || sku.leadTimeDays <= 0) {
      byCategory.missing_leadtime.push({
        sku: sku.sku,
        skuName,
        detail: "缺失 Lead Time（工厂→FBA 备货周期）或值为 0，发货决策将退回默认 40 天",
        severity: "warning",
      });
    }

    // ── 异常利润 / 异常销量（需要销量快照）──
    if (!snap) {
      if (sku.price > 0) {
        byCategory.abnormal_sales.push({
          sku: sku.sku,
          skuName,
          detail: "未导入任何销量数据（销量导入 / 运营数据导入），无法评估表现",
          severity: "warning",
        });
      }
      continue;
    }

    // 异常利润
    if (snap.profitMargin < 0) {
      byCategory.abnormal_profit.push({
        sku: sku.sku,
        skuName,
        detail: `利润率为负（${snap.profitMargin.toFixed(1)}%），单件亏损 $${Math.abs(snap.profit ?? 0).toFixed(2)}`,
        severity: "critical",
      });
    } else if (snap.profitMargin === 0 && sku.price > 0) {
      byCategory.abnormal_profit.push({
        sku: sku.sku,
        skuName,
        detail: "利润率为 0，多半是成本字段缺失导致无法计算",
        severity: "warning",
      });
    }

    // 异常销量
    const daily = snap.dailySales7d;
    const monthly = snap.monthlySales;
    if (daily <= 0 && sku.saleStatus === "active") {
      byCategory.abnormal_sales.push({
        sku: sku.sku,
        skuName,
        detail: "近 7 天日均销量为 0，请确认是否为新品 / 停售或漏导数据",
        severity: "warning",
      });
    }
    if (daily > 0 && monthly > 0) {
      const ratio = monthly / daily; // 健康值约 21~30（月/日均）
      if (ratio > 45 || ratio < 15) {
        byCategory.abnormal_sales.push({
          sku: sku.sku,
          skuName,
          detail: `月销/日销比例失衡（${ratio.toFixed(0)}，健康约 21~30），月销 ${monthly} vs 日均 ${daily.toFixed(1)}，可能漏导或重复`,
          severity: "warning",
        });
      }
    }
    if (daily < 0 || monthly < 0) {
      byCategory.abnormal_sales.push({
        sku: sku.sku,
        skuName,
        detail: "销量存在负值，数据异常",
        severity: "critical",
      });
    }
  }

  const issues = [
    ...byCategory.missing_cost,
    ...byCategory.missing_inventory,
    ...byCategory.abnormal_profit,
    ...byCategory.abnormal_sales,
    ...byCategory.missing_leadtime,
    ...byCategory.stock_negative,
  ];

  return {
    issues,
    byCategory,
    counts: {
      missing_cost: byCategory.missing_cost.length,
      missing_inventory: byCategory.missing_inventory.length,
      abnormal_profit: byCategory.abnormal_profit.length,
      abnormal_sales: byCategory.abnormal_sales.length,
      missing_leadtime: byCategory.missing_leadtime.length,
      stock_negative: byCategory.stock_negative.length,
    },
    total: issues.length,
    skuCount: checked,
    checkedAt: new Date().toISOString(),
  };
}
