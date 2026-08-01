// =========================================================
// 异常类型常量（单一来源）
// 诊断页的"记录处理"与操作记录页的展示共用同一份标签，避免重复维护。
// =========================================================
import type { AnomalyType } from "./types";

export const ANOMALY_OPTIONS: { value: AnomalyType; label: string }[] = [
  { value: "stockout", label: "断货" },
  { value: "low_stock", label: "库存紧张" },
  { value: "overstock", label: "库存积压" },
  { value: "profit", label: "利润异常" },
  { value: "ad", label: "广告异常" },
  { value: "rating", label: "评分下降" },
  { value: "return", label: "退货异常" },
  { value: "listing", label: "Listing 待优化" },
  { value: "other", label: "其他" },
];

const ANOMALY_LABELS: Record<AnomalyType, string> = Object.fromEntries(
  ANOMALY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AnomalyType, string>;

/** 把异常类型转成中文标签；未传或未知时回退到"其他"。 */
export function anomalyLabel(type?: AnomalyType | string): string {
  if (!type) return "";
  return ANOMALY_LABELS[type as AnomalyType] ?? "其他";
}
