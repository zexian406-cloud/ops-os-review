/**
 * 统一格式化诊断因子（Bug2 回归防护）：
 * - 百分比固定 1 位小数（46.46 → "46.5%"、8 → "8.0%"），禁止裸浮点输出
 *   （修复前 "↓1.3900000000000006%"）
 * - 非百分比数值：整数原样、小数保留 1 位
 * - null / undefined / 空串 / NaN / Infinity → "—"
 * - 预格式化字符串（含非数字字符）直接透传；纯数字字符串补单位
 */
export function fmtFactor(v: number | string | null | undefined, unit?: string): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") {
    return /[^\d.+\-eE]/.test(v) ? v : `${v}${unit ?? ""}`;
  }
  if (!Number.isFinite(v)) return "—";
  if (unit === "%") return `${v.toFixed(1)}%`;
  return `${Number.isInteger(v) ? String(v) : v.toFixed(1)}${unit ?? ""}`;
}
