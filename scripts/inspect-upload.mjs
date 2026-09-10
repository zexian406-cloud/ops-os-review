import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const src = "c:\\Users\\HP\\.trae-cn\\attachments\\6a85426f8241b39828c5c6c7\\1cb334de-b144-4bcc-8d2e-264bfc6958b2_63cb427b-9bc3-4cb7-aff2-78be9e4d4ee7_【模板】综合运营表 (3).xlsx";
const wb = XLSX.readFile(src, { cellDates: true });

console.log("=== SHEETS ===");
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws["!ref"];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`\n[${name}] rows=${rows.length} ref=${ref}`);
}

const targets = ["BFT74-42", "BFT74-42-T", "BFEQT42-74", "BFEXA72-51-A-Pan", "BFEXA72-51-A", "BFGCH-2PCS", "BFGCH0002", "BFGCH0003", "BFEXA72-51"];

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (rows.length === 0) continue;
  const headers = Object.keys(rows[0]);
  const interesting = headers.filter((h) => /ACoAS|ACoS|广告|费比|评分|广告花费/i.test(String(h)));
  console.log(`\n=== ${name}: 广告/ACoAS 相关列:`, interesting);
  const skuCol = headers.find((h) => /sku/i.test(String(h)));
  if (skuCol) {
    for (const r of rows) {
      const v = String(r[skuCol] ?? "");
      if (targets.some((t) => v.toUpperCase().includes(t))) {
        console.log("TARGET ROW:", JSON.stringify(r).slice(0, 1500));
      }
    }
  }
}
