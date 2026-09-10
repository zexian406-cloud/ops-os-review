import { readFileSync } from "node:fs";
import { parseOperationExcel } from "../src/domain/excel";

const src = "C:\\Users\\HP\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\work-mode-projects\\6a85426f8241b39828c5c6c4\\temp-ops-os\\综合运营表_已清洗.xlsx";
const buf = readFileSync(src);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const res = parseOperationExcel(ab, "2026-09-10");

console.log("skuMaster rows:", res.skuMaster.length, "| snapshots:", res.dailySnapshot.length, "| inventory:", res.inventoryLayer.length);

const DEAD = ["BFT74-42", "BFT74-42-T", "BFEQT42-74", "BFGCH-2PCS", "BFGCH0002"];
console.log("\n=== 已下架 SKU 检查（应为空）===");
let deadFound = false;
for (const m of res.skuMaster) if (DEAD.includes(m.sku)) { deadFound = true; console.log("主表残留:", m.sku); }
for (const s of res.dailySnapshot) if (DEAD.includes(s.sku)) { deadFound = true; console.log("快照残留:", s.sku); }
for (const i of res.inventoryLayer) if (DEAD.includes(i.sku)) { deadFound = true; console.log("库存残留:", i.sku); }
console.log(deadFound ? "❌ 有残留" : "✅ 全部清除");

console.log("\n=== 组合款 BFEXA72-51-A-Pan ===");
const pan = res.skuMaster.find((m) => m.sku === "BFEXA72-51-A-Pan");
const base = res.skuMaster.find((m) => m.sku === "BFEXA72-51-A");
if (pan) {
  console.log(`fob=${pan.costFob?.toFixed(2)} (期望 47.45+25.64=${(47.45 + 25.64).toFixed(2)})`);
  console.log(`composeFormula=${pan.composeFormula ?? "-"} ship=${pan.costShipping?.toFixed(2)} deliv=${pan.costDelivery?.toFixed(2)} price=${pan.price}`);
}
if (base) console.log(`BFEXA72-51-A fob=${base.costFob?.toFixed(2)}`);

console.log("\n=== 快照 adRatio（ACoAS 解析）===");
for (const s of res.dailySnapshot) {
  if (s.sku === "BFEXA72-51-A-Pan" || s.sku === "BFB053" || s.sku === "BFRS258") {
    console.log(`${s.sku.padEnd(20)} adRatio=${s.adRatio} ret=${s.returnRate} ref=${s.refundRate} sales7d=${s.dailySales7d}`);
  }
}
