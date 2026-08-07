// =========================================================
// 数据健康模块 — 导入前质量校验
// 触发时机：parseOperationExcel 返回 ImportResult 后，写入 IndexedDB 之前
// 输出：{ validRows, errors, warnings, tips } → 由导入页弹出报告面板
// =========================================================

import type { ImportResult } from "./excel";
import type { DailySnapshot, InventoryLayer, SkuMaster } from "./types";

/** 校验项类型 */
export type HealthIssueType = "error" | "warning" | "tip";

/** 单条校验记录 */
export interface HealthIssue {
  type: HealthIssueType;
  ruleId: number;          // 对应规则表序号 1-9
  ruleName: string;        // 检查项名称
  sku?: string;            // 涉及 SKU
  detail: string;          // 详细描述
  /** 处理方式：skip=跳过 / fix=自动修正 / mark=标记 / default=使用默认值 */
  action: "skip" | "fix" | "mark" | "default";
  /** 实际修正后的值（fix/default 时有值） */
  fixedValue?: number | string;
}

/** 校验结果 */
export interface ValidationResult {
  /** 通过校验、可直接写入 IndexedDB 的数据（已自动修正警告项） */
  validRows: {
    skuMaster: SkuMaster[];
    dailySnapshot: DailySnapshot[];
    inventoryLayer: InventoryLayer[];
  };
  /** 错误列表（已跳过，不写入） */
  errors: HealthIssue[];
  /** 警告列表（已自动修正，仍写入） */
  warnings: HealthIssue[];
  /** 提示列表（写入但标记） */
  tips: HealthIssue[];
  /** 汇总统计 */
  summary: {
    totalRows: number;       // Excel 解析总行数
    successCount: number;    // 成功导入条数（按 SKU + 店铺 + 发货方式）
    errorCount: number;
    warningCount: number;
    tipCount: number;
  };
}

/**
 * 数据健康校验主入口
 * 接收 parseOperationExcel 的返回值，按 9 条规则逐行校验：
 *  - 错误：跳过该行（不入库）
 *  - 警告：自动修正后入库
 *  - 提示：原样入库，仅标记
 *
 * 校验完成后返回 { validRows, errors, warnings, tips }，
 * 调用方（import/page.tsx）负责弹出报告面板，用户点「确认并继续」后才写入 IndexedDB。
 */
export function validateImportData(result: ImportResult): ValidationResult {
  const errors: HealthIssue[] = [];
  const warnings: HealthIssue[] = [];
  const tips: HealthIssue[] = [];

  // 深拷贝可变数据（自动修正不能污染原对象）
  const skuMaster = result.skuMaster.map((m) => ({ ...m }));
  const dailySnapshot = result.dailySnapshot.map((s) => ({ ...s }));
  const inventoryLayer = result.inventoryLayer.map((l) => ({ ...l, warehouseBreakdown: l.warehouseBreakdown?.map((w) => ({ ...w })) }));

  // 需要跳过的 SKU 集合（错误行）
  const skippedSkus = new Set<string>();

  // ── 规则 1 & 2 & 6 & 7 & 8 & 9：遍历 skuMaster ──
  for (const m of skuMaster) {
    // 规则 1：SKU 为空 → 跳过该行
    if (!m.sku || !m.sku.trim()) {
      errors.push({
        type: "error",
        ruleId: 1,
        ruleName: "SKU 为空",
        detail: "该行 SKU 列的值为空，已跳过",
        action: "skip",
      });
      skippedSkus.add(m.sku ?? "");
      continue;
    }

    // 规则 2：发货方式为空（不在 FBA/FBM/mixed 中）→ 跳过
    const f = (m.fulfillment ?? "").toString().trim();
    if (f !== "FBA" && f !== "FBM" && f !== "mixed") {
      errors.push({
        type: "error",
        ruleId: 2,
        ruleName: "发货方式为空",
        sku: m.sku,
        detail: `发货方式「${f || "空"}」不在 [FBA / FBM / mixed] 中，已跳过`,
        action: "skip",
      });
      skippedSkus.add(m.sku);
      continue;
    }

    // 规则 6：售价 ≤ 0 → 写入但标记异常
    if (!m.price || m.price <= 0) {
      warnings.push({
        type: "warning",
        ruleId: 6,
        ruleName: "售价 ≤ 0",
        sku: m.sku,
        detail: `售价为 ${m.price ?? 0}，已写入但标记异常`,
        action: "mark",
      });
    }

    // 规则 8：FOB 为空 → 写入，标记利润为估算
    if (m.costFob == null || m.costFob <= 0) {
      tips.push({
        type: "tip",
        ruleId: 8,
        ruleName: "FOB 为空",
        sku: m.sku,
        detail: "缺少 FOB，利润将标记为「估算值」",
        action: "mark",
      });
    }

    // 规则 9：LeadTime 为空 → 写入，使用参数中心默认值
    if (m.leadTimeDays == null) {
      tips.push({
        type: "tip",
        ruleId: 9,
        ruleName: "LeadTime 为空",
        sku: m.sku,
        detail: "缺少交期，已使用参数中心默认值（默认 40 天）",
        action: "default",
        fixedValue: 40,
      });
      // 不强制写入默认值到 m.leadTimeDays，留给计算层使用 config.defaultLeadTime
    }
  }

  // ── 规则 3 & 4：遍历 inventoryLayer 检查库存 ──
  for (const l of inventoryLayer) {
    if (skippedSkus.has(l.sku)) continue;

    // 规则 3：FBA 库存为负 → 修正为 0
    if (l.fbaStock < 0) {
      warnings.push({
        type: "warning",
        ruleId: 3,
        ruleName: "FBA 库存为负",
        sku: l.sku,
        detail: `FBA 库存 ${l.fbaStock} < 0，已修正为 0`,
        action: "fix",
        fixedValue: 0,
      });
      l.fbaStock = 0;
    }

    // 规则 4：FBM 库存为负 → 修正为 0
    if (l.fbmStock < 0) {
      warnings.push({
        type: "warning",
        ruleId: 4,
        ruleName: "FBM 库存为负",
        sku: l.sku,
        detail: `FBM 库存 ${l.fbmStock} < 0，已修正为 0`,
        action: "fix",
        fixedValue: 0,
      });
      l.fbmStock = 0;
    }
  }

  // ── 规则 5 & 7：遍历 dailySnapshot 检查销量与评分 ──
  for (const s of dailySnapshot) {
    if (skippedSkus.has(s.sku)) continue;

    // 规则 5：日均销量为负 → 修正为 0
    if (s.dailySales7d < 0) {
      warnings.push({
        type: "warning",
        ruleId: 5,
        ruleName: "日均销量为负",
        sku: s.sku,
        detail: `近7天日均销量 ${s.dailySales7d} < 0，已修正为 0`,
        action: "fix",
        fixedValue: 0,
      });
      s.dailySales7d = 0;
    }
    if (s.dailySales30d != null && s.dailySales30d < 0) {
      warnings.push({
        type: "warning",
        ruleId: 5,
        ruleName: "日均销量为负",
        sku: s.sku,
        detail: `近30天日均销量 ${s.dailySales30d} < 0，已修正为 0`,
        action: "fix",
        fixedValue: 0,
      });
      s.dailySales30d = 0;
    }

    // 规则 7：评分超出 0-5 → 写入但数值标红
    if (s.rating < 0 || s.rating > 5) {
      warnings.push({
        type: "warning",
        ruleId: 7,
        ruleName: "评分超出 0-5",
        sku: s.sku,
        detail: `评分 ${s.rating} 超出 0-5 范围，已写入但标记异常`,
        action: "mark",
      });
    }
  }

  // 过滤掉被跳过的 SKU（从所有集合中移除）
  const validSkuMaster = skuMaster.filter((m) => !skippedSkus.has(m.sku));
  const validSnapshots = dailySnapshot.filter((s) => !skippedSkus.has(s.sku));
  const validInventory = inventoryLayer.filter((l) => !skippedSkus.has(l.sku));

  // 成功导入条数 = 按 SKU + 店铺 + 发货方式 计数（skuMaster 行数）
  const successCount = validSkuMaster.length;

  // 汇总统计
  const summary = {
    totalRows: result.skuMaster.length,
    successCount,
    errorCount: errors.length,
    warningCount: warnings.length,
    tipCount: tips.length,
  };

  return {
    validRows: {
      skuMaster: validSkuMaster,
      dailySnapshot: validSnapshots,
      inventoryLayer: validInventory,
    },
    errors,
    warnings,
    tips,
    summary,
  };
}

/**
 * 聚合同类错误/警告/提示（按 ruleId 合并计数）—— 用于报告面板展示
 */
export interface AggregatedIssue {
  ruleId: number;
  ruleName: string;
  type: HealthIssueType;
  count: number;
  sampleSku?: string;
  detail: string;
}

export function aggregateIssues(issues: HealthIssue[]): AggregatedIssue[] {
  const map = new Map<number, AggregatedIssue>();
  for (const it of issues) {
    const ex = map.get(it.ruleId);
    if (ex) {
      ex.count += 1;
      if (!ex.sampleSku && it.sku) ex.sampleSku = it.sku;
    } else {
      map.set(it.ruleId, {
        ruleId: it.ruleId,
        ruleName: it.ruleName,
        type: it.type,
        count: 1,
        sampleSku: it.sku,
        detail: it.detail,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ruleId - b.ruleId);
}

/**
 * 数据健康指标（用于数据健康页顶部三张卡片）
 * - 数据完整性：成功导入行数 / 总行数
 * - 字段覆盖率：MSKU / 评分 / 广告费比 / FOB 四个关键字段的填充率均值
 * - 异常值检测：规则 3-7（负库存/负销量/售价异常/评分越界）的警告数量
 */
export interface HealthMetrics {
  integrity: { value: string; detail: string };
  fieldCoverage: { value: string; detail: string };
  outliers: { value: string; detail: string };
}

export function computeHealthMetrics(result: ValidationResult): HealthMetrics {
  const { summary, validRows, warnings } = result;

  // ── 数据完整性 ──
  const integrityPct =
    summary.totalRows > 0
      ? (summary.successCount / summary.totalRows) * 100
      : 0;
  const integrity = {
    value: `${integrityPct.toFixed(1)}%`,
    detail: `${summary.successCount} / ${summary.totalRows} 行通过校验`,
  };

  // ── 字段覆盖率 ──
  const skus = validRows?.skuMaster ?? [];
  const snapshots = validRows?.dailySnapshot ?? [];
  const skuCount = skus.length || 1;
  const snapCount = snapshots.length || 1;

  const mskuFilled = skus.filter((s) => s.sku && s.sku.trim()).length;
  const fobFilled = skus.filter((s) => s.costFob != null && s.costFob > 0).length;
  const ratingFilled = snapshots.filter((s) => s.rating > 0).length;
  const adRatioFilled = snapshots.filter((s) => s.adRatio > 0).length;

  const coveragePct =
    ((mskuFilled / skuCount) +
      (fobFilled / skuCount) +
      (ratingFilled / snapCount) +
      (adRatioFilled / snapCount)) /
    4 *
    100;

  const fieldCoverage = {
    value: `${coveragePct.toFixed(1)}%`,
    detail: `MSKU ${mskuFilled}/${skuCount} · 评分 ${ratingFilled}/${snapCount} · 广告费比 ${adRatioFilled}/${snapCount} · FOB ${fobFilled}/${skuCount}`,
  };

  // ── 异常值检测（规则 3-7）──
  const outlierRuleIds = [3, 4, 5, 6, 7];
  const outlierCount = warnings.filter((w) => outlierRuleIds.includes(w.ruleId)).length;
  const outliers = {
    value: outlierCount > 0 ? `${outlierCount} 个` : "0 个",
    detail:
      outlierCount > 0
        ? `已识别并修正 ${outlierCount} 处异常（负库存/负销量/售价异常/评分越界）`
        : "所有数据均在合理范围内",
  };

  return { integrity, fieldCoverage, outliers };
}
