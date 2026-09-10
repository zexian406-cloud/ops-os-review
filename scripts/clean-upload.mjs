/**
 * 清洗综合运营表：
 * 1. 删除已下架 SKU 的所有行（全工作表），避免重新导入时复活。
 * 2. 为组合款 SKU 写入「组合公式」列（导入时自动累加组件成本）。
 *
 * 用法：node scripts/clean-upload.mjs <输入xlsx> <输出xlsx>
 */
import { readFileSync, writeFileSync } from "node:fs";
import XLSX from "xlsx";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error("用法: node scripts/clean-upload.mjs <输入.xlsx> <输出.xlsx>");
  process.exit(1);
}

/** 已下架 / 非本店 SKU，需要整体移除 */
const DEAD_SKUS = new Set(["BFT74-42", "BFT74-42-T", "BFEQT42-74", "BFGCH-2PCS", "BFGCH0002"]);

/** 组合款公式：SKU → 公式（组件SKU×数量+固定成本，空格/换行内的文本会被 trim） */
const COMBO_FORMULAS = {
  "BFEXA72-51-A-Pan": "BFEXA72-51-A×1+25.64",
};

const wb = XLSX.readFile(src);
const changes = [];

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (rows.length === 0) continue;

  const before = rows.length;
  let removed = 0;
  const kept = [];
  for (const row of rows) {
    const sku = String(row.SKU ?? "").trim();
    if (DEAD_SKUS.has(sku)) {
      removed++;
      continue;
    }
    kept.push(row);
  }
  if (removed > 0) {
    changes.push(`${name}: 删除 ${removed} 行（共 ${before}）`);
    if (kept.length > 0) {
      const out = XLSX.utils.json_to_sheet(kept, { header: Object.keys(rows[0]) });
      out["!cols"] = ws["!cols"] ?? undefined;
      wb.Sheets[name] = out;
    } else {
      delete wb.Sheets[name];
      wb.SheetNames = wb.SheetNames.filter((n) => n !== name);
    }
  }
}

// 写入组合公式列（SKU标识符表）
const idName = wb.SheetNames.find((n) => /SKU标识符/.test(n));
if (idName) {
  const ws = wb.Sheets[idName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const headers = Object.keys(rows[0]);
  const hasCol = headers.some((h) => /组合公式|composeFormula/i.test(String(h)));
  for (const row of rows) {
    const sku = String(row.SKU ?? "").trim();
    const formula = COMBO_FORMULAS[sku];
    if (!formula) continue;
    if (hasCol) {
      const col = headers.find((h) => /组合公式|composeFormula/i.test(String(h)));
      row[col] = formula;
    } else {
      headers.push("组合公式");
      row["组合公式"] = formula;
    }
    changes.push(`SKU标识符: ${sku} 组合公式 = ${formula}`);
  }
  const out = XLSX.utils.json_to_sheet(rows, { header: headers });
  out["!cols"] = ws["!cols"] ?? undefined;
  wb.Sheets[idName] = out;
}

XLSX.writeFile(wb, dst);
console.log(`已输出: ${dst}`);
for (const c of changes) console.log(` - ${c}`);
